import type YPartyKitProvider from "y-partykit/provider";
import * as Y from "yjs";
import {
  countOtherAwarenessClients,
  yDocHasBlockNoteContent,
} from "./blocknoteYjs";

/** bootstrap poll 간격(ms) */
const POLL_MS = 50;
/** awareness·fragment·원격 update 변화가 멈춘 뒤 seed 판단까지 대기(ms) */
const STABLE_QUIET_MS = 150;
/** 최대 대기(ms) — 느린 네트워크에서도 에디터가 열리도록 상한 */
const MAX_WAIT_MS = 1500;

export type CollaborationBootstrapSnapshot = {
  otherAwarenessClientCount: number;
  hadRemotePartyKitUpdate: boolean;
  hasBlockNoteContent: boolean;
  /** Y.Doc share 에 키가 있으면 PartyKit/동료 쪽 상태가 merge 된 신호 */
  ydocShareKeyCount: number;
  /** encodeStateAsUpdate 길이 — 빈 Doc 대비 서버/원격 상태 수신 보조 판별 */
  ydocUpdateByteLength: number;
};

export function readCollaborationBootstrapSnapshot(
  ydoc: Y.Doc,
  provider: YPartyKitProvider,
  hadRemotePartyKitUpdate: boolean,
): CollaborationBootstrapSnapshot {
  return {
    otherAwarenessClientCount: countOtherAwarenessClients(
      provider.awareness.getStates(),
      ydoc.clientID,
    ),
    hadRemotePartyKitUpdate,
    hasBlockNoteContent: yDocHasBlockNoteContent(ydoc),
    ydocShareKeyCount: ydoc.share.size,
    ydocUpdateByteLength: Y.encodeStateAsUpdate(ydoc).length,
  };
}

function snapshotSignature(s: CollaborationBootstrapSnapshot): string {
  return JSON.stringify(s);
}

/** 이미 활성 협업/본문이 있으면 DB seed 없이 bootstrap 종료 */
function shouldFinishBootstrapEarly(s: CollaborationBootstrapSnapshot): boolean {
  return (
    s.hadRemotePartyKitUpdate ||
    s.otherAwarenessClientCount > 0 ||
    s.hasBlockNoteContent
  );
}

/**
 * PartyKit sync 직후 awareness·원격 update·fragment 가 안정될 때까지 대기합니다.
 * 고정 200ms 대신 변화가 멈춘 뒤(STABLE_QUIET_MS) 또는 MAX_WAIT_MS 에 판단합니다.
 */
export function waitForCollaborationBootstrap(
  ydoc: Y.Doc,
  provider: YPartyKitProvider,
  getHadRemotePartyKitUpdate: () => boolean,
  isCancelled: () => boolean,
): Promise<CollaborationBootstrapSnapshot> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lastChangeAt = Date.now();
    let lastSig = "";

    let pollId: ReturnType<typeof setInterval> | null = null;

    const finish = (snapshot: CollaborationBootstrapSnapshot) => {
      if (pollId !== null) window.clearInterval(pollId);
      provider.awareness.off("change", onAwarenessChange);
      ydoc.off("update", onDocUpdate);
      resolve(snapshot);
    };

    const tick = () => {
      if (isCancelled()) return;

      const snapshot = readCollaborationBootstrapSnapshot(
        ydoc,
        provider,
        getHadRemotePartyKitUpdate(),
      );
      const sig = snapshotSignature(snapshot);
      if (sig !== lastSig) {
        lastSig = sig;
        lastChangeAt = Date.now();
      }

      if (shouldFinishBootstrapEarly(snapshot)) {
        finish(snapshot);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const quietFor = Date.now() - lastChangeAt;
      if (quietFor >= STABLE_QUIET_MS || elapsed >= MAX_WAIT_MS) {
        finish(snapshot);
      }
    };

    const onAwarenessChange = () => tick();
    const onDocUpdate = () => tick();

    provider.awareness.on("change", onAwarenessChange);
    ydoc.on("update", onDocUpdate);
    pollId = window.setInterval(tick, POLL_MS);
    tick();
  });
}
