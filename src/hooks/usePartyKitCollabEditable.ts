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
 * `synced === true` 는 서버와 Yjs sync step 2 가 끝난 상태입니다.
 * 이 전에 Supabase 스냅샷을 Y.Doc 에 넣거나 Tiptap 을 붙이면
 * 핸드셰이크가 깨져 `updates(remote-like): 0` 상태가 될 수 있습니다.
 */
export function usePartyKitSyncReady(
  provider: YPartyKitProvider,
  options: UsePartyKitSyncReadyOptions = {},
): {
  /** Yjs sync step 2 완료 — Supabase 병합·에디터 마운트 가능 */
  synced: boolean;
  /** 자동 재연결 시도 중 */
  retrying: boolean;
  /** 긴 대기 후에도 synced 가 false — 새로고침 안내용 */
  gaveUp: boolean;
} {
  const reconnectAfterMs = options.reconnectAfterMs ?? 5_000;
  const gaveUpAfterMs = options.gaveUpAfterMs ?? 30_000;

  const [synced, setSynced] = useState(() => provider.synced);
  const [retrying, setRetrying] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const reconnectCountRef = useRef(0);

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

  useEffect(() => {
    if (synced) return;
    const id = window.setTimeout(() => {
      if (provider.synced || !provider.wsconnected) return;
      if (reconnectCountRef.current >= 3) return;
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
