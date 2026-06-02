import { useEffect, useRef } from "react";
import * as Y from "yjs";
import type { Doc } from "yjs";
import type YPartyKitProvider from "y-partykit/provider";
import { yDocHasBlockNoteContent } from "../lib/blocknoteYjs";

const LOCAL_RECOVERY_ORIGIN = "local-recovery";

/** y-partykit status 이벤트 payload 형태(버전마다 배열/객체) */
function readProviderStatus(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    const first = payload[0];
    if (first && typeof first === "object" && "status" in first) {
      return String((first as { status: unknown }).status);
    }
    return undefined;
  }
  if (payload && typeof payload === "object" && "status" in payload) {
    return String((payload as { status: unknown }).status);
  }
  return undefined;
}

/**
 * PartyKit WebSocket 끊김·재연결 시 서버 빈 문서가 로컬 편집을 덮어쓰는 경우를 완화합니다.
 * - 끊기기 직전 Y.Doc 스냅샷을 메모리에 보관
 * - 재동기화 후 document-store 가 비었으면 로컬 백업을 merge
 */
export function useYjsReconnectRecovery(
  ydoc: Doc,
  provider: YPartyKitProvider,
  enabled: boolean,
): void {
  const backupRef = useRef<Uint8Array | null>(null);
  const hadContentRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const captureBackup = () => {
      if (!yDocHasBlockNoteContent(ydoc)) return;
      hadContentRef.current = true;
      backupRef.current = Y.encodeStateAsUpdate(ydoc);
    };

    const tryRestore = () => {
      if (!hadContentRef.current || !backupRef.current) return;
      if (yDocHasBlockNoteContent(ydoc)) return;
      Y.applyUpdate(ydoc, backupRef.current, LOCAL_RECOVERY_ORIGIN);
    };

    const onStatus = (payload: unknown) => {
      const status = readProviderStatus(payload);
      if (status === "disconnected" || status === "connecting") {
        captureBackup();
      }
    };

    const onSync = (synced: boolean) => {
      if (!synced) {
        captureBackup();
        return;
      }
      window.setTimeout(() => tryRestore(), 50);
    };

    const onConnectionClose = () => {
      captureBackup();
    };

    const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== provider || !hadContentRef.current) return;
      queueMicrotask(() => {
        if (!yDocHasBlockNoteContent(ydoc)) tryRestore();
      });
    };

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    provider.on("connection-close", onConnectionClose);
    ydoc.on("update", onDocUpdate);

    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      provider.off("connection-close", onConnectionClose);
      ydoc.off("update", onDocUpdate);
    };
  }, [ydoc, provider, enabled]);
}
