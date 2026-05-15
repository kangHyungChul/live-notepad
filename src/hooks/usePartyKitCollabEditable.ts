import { useEffect, useState } from "react";
import type YPartyKitProvider from "y-partykit/provider";

export type UsePartyKitCollabEditableOptions = {
  /**
   * 이 시간(밀리초)이 지나도 `provider.synced` 가 false 이면 편집을 강제로 허용합니다.
   * 웹소켓이 막힌 환경에서 영원히 빈 화면만 보이는 것을 막기 위함입니다.
   * 이 경우 다른 기기와 문서가 갈라질 수 있어 `unlockWarning` 로 안내합니다.
   */
  unlockAfterMs?: number;
};

/**
 * PartyKit(y-partykit) 과 Y.Doc / Tiptap 가 첫 랑데뷰(sync)를 마친 뒤에만 편집을 열기 위한 훅입니다.
 *
 * 배경:
 * - 우리는 Supabase 스냅샷을 클라이언트 Y.Doc 에 먼저 `applyUpdate` 하고, 그 다음 WebSocket 으로 서버와 맞춥니다.
 * - 이 사이(또는 sync 직전)에 사용자가 키 입력을 하면 y-prosemirror 쪽에서 알려진 레이스가 나기 쉽고,
 *   기기마다 ProseMirror 표현이 달라져 "같은 방인데 내용이 다름" 처럼 보일 수 있습니다.
 * - y-partykit 프로바이더는 `synced === true` 일 때 Yjs 스텝 2 동기화가 끝난 상태입니다.
 */
export function usePartyKitCollabEditable(
  provider: YPartyKitProvider,
  options: UsePartyKitCollabEditableOptions = {},
): {
  /** Tiptap `setEditable` 에 넘길 값 */
  editable: boolean;
  /** 아직 첫 sync 를 기다리며 편집이 잠긴 상태인지 */
  waitingForInitialSync: boolean;
  /** 타임아웃으로 잠금을 풀었는지 — 다른 기기와 불일치 가능성을 사용자에게 알릴 때 사용 */
  unlockedByTimeout: boolean;
} {
  const unlockAfterMs = options.unlockAfterMs ?? 12_000;

  const [synced, setSynced] = useState(() => provider.synced);
  const [unlockedByTimeout, setUnlockedByTimeout] = useState(false);

  // sync / status 가 바뀔 때마다 로컬 상태를 맞춥니다.
  useEffect(() => {
    const bump = () => {
      const s = provider.synced;
      setSynced(s);
      // 동기화에 다시 성공하면 타임아웃으로 허용했던 편집 경고 상태를 초기화합니다.
      if (s) setUnlockedByTimeout(false);
    };
    bump();
    provider.on("sync", bump);
    provider.on("status", bump);
    return () => {
      provider.off("sync", bump);
      provider.off("status", bump);
    };
  }, [provider]);

  // 연결이 영원히 안 되는 경우 에디터가 완전히 막히지 않도록 상한을 둡니다.
  useEffect(() => {
    if (synced) return;
    const id = window.setTimeout(() => {
      setUnlockedByTimeout(true);
    }, unlockAfterMs);
    return () => window.clearTimeout(id);
  }, [synced, unlockAfterMs]);

  const editable = synced || unlockedByTimeout;
  const waitingForInitialSync = !synced && !unlockedByTimeout;

  return { editable, waitingForInitialSync, unlockedByTimeout };
}
