import { useEffect, useRef, useState } from "react";
import type YPartyKitProvider from "y-partykit/provider";

export type UsePartyKitSyncReadyOptions = {
  /** 연결은 됐는데 `synced` 가 오래 false 일 때 재연결을 시도하기까지 대기(ms) */
  reconnectAfterMs?: number;
  /** 이 시간까지 동기화가 안 되면 `gaveUp` 으로 실패 UI 표시(ms) */
  gaveUpAfterMs?: number;
};

/**
 * PartyKit(y-partykit) 첫 Yjs 동기화(`provider.synced`) 완료를 기다립니다.
 *
 * Tiptap(y-prosemirror)을 sync 전에 붙이면 XmlFragment 가 먼저 초기화되어
 * WebSocket 핸드셰이크가 끝나지 않고 "연결됨 · 동기화 중" 에 머무는 경우가 있습니다.
 * → 에디터는 `synced === true` 일 때만 마운트하는 것이 안전합니다.
 */
export function usePartyKitSyncReady(
  provider: YPartyKitProvider,
  options: UsePartyKitSyncReadyOptions = {},
): {
  /** Yjs sync step 2 완료 — 이제 CollabEditor 를 마운트해도 됨 */
  synced: boolean;
  /** 자동 재연결 시도 중 */
  retrying: boolean;
  /** 긴 대기 후에도 synced 가 false — 새로고침 안내용 */
  gaveUp: boolean;
} {
  const reconnectAfterMs = options.reconnectAfterMs ?? 5_000;
  const gaveUpAfterMs = options.gaveUpAfterMs ?? 25_000;

  const [synced, setSynced] = useState(() => provider.synced);
  const [retrying, setRetrying] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const reconnectCountRef = useRef(0);

  // 프로바이더 이벤트 + 폴링으로 `synced` 를 반영합니다(이벤트 누락 대비).
  useEffect(() => {
    const bump = () => {
      if (provider.synced) {
        setSynced(true);
        setRetrying(false);
        setGaveUp(false);
        reconnectCountRef.current = 0;
      }
    };
    bump();
    provider.on("sync", bump);
    provider.on("synced", bump);
    provider.on("status", bump);
    const poll = window.setInterval(bump, 400);
    return () => {
      provider.off("sync", bump);
      provider.off("synced", bump);
      provider.off("status", bump);
      window.clearInterval(poll);
    };
  }, [provider]);

  // 연결됐는데 오래 synced 가 false 이면 한 번 재연결(최대 2회).
  useEffect(() => {
    if (synced) return;
    const id = window.setTimeout(() => {
      if (provider.synced || !provider.wsconnected) return;
      if (reconnectCountRef.current >= 2) return;
      reconnectCountRef.current += 1;
      setRetrying(true);
      provider.disconnect();
      provider.connect();
    }, reconnectAfterMs);
    return () => window.clearTimeout(id);
  }, [provider, synced, reconnectAfterMs]);

  useEffect(() => {
    if (synced) return;
    const id = window.setTimeout(() => setGaveUp(true), gaveUpAfterMs);
    return () => window.clearTimeout(id);
  }, [synced, gaveUpAfterMs]);

  return { synced, retrying, gaveUp };
}

/** @deprecated `usePartyKitSyncReady` 사용 권장 */
export const usePartyKitCollabEditable = usePartyKitSyncReady;
