import { useEffect, useRef, useState } from "react";
import type YPartyKitProvider from "y-partykit/provider";

/** awareness 에서 읽어온 한 명의 접속자 정보 */
export type RoomPeer = {
  clientId: number;
  name: string;
  color: string;
  isSelf: boolean;
};

type AwarenessUser = {
  name?: string;
  color?: string;
};

const EMPTY_PEERS: RoomPeer[] = [];

function readPeersFromProvider(provider: YPartyKitProvider): RoomPeer[] {
  const awareness = provider.awareness;
  if (!awareness) return EMPTY_PEERS;

  const next: RoomPeer[] = [];

  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as AwarenessUser | undefined;
    next.push({
      clientId,
      name: user?.name?.trim() || "익명",
      color: user?.color || "#9aa3b2",
      isSelf: clientId === awareness.clientID,
    });
  });

  if (next.length === 0) return EMPTY_PEERS;

  next.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });

  return next;
}

function peersSignature(peers: RoomPeer[]): string {
  return peers
    .map((p) => `${p.clientId}:${p.name}:${p.color}:${p.isSelf ? 1 : 0}`)
    .join("|");
}

/**
 * awareness 구독 — useSyncExternalStore 대신 useEffect 사용.
 * (로그: 연결 전 useSyncExternalStore 가 Maximum update depth 유발)
 */
export function useRoomPresence(provider: YPartyKitProvider): RoomPeer[] {
  const [peers, setPeers] = useState<RoomPeer[]>(EMPTY_PEERS);
  const lastSigRef = useRef("");

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;

    const syncPeers = () => {
      queueMicrotask(() => {
        const next = readPeersFromProvider(provider);
        const sig = peersSignature(next);
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;
        setPeers(next);
      });
    };

    awareness.on("change", syncPeers);
    syncPeers();

    return () => {
      awareness.off("change", syncPeers);
    };
  }, [provider]);

  return peers;
}
