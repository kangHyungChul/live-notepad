import * as Y from "yjs";

/** BlockNote + PartyKit 공식 예제 XmlFragment 키 */
export const BLOCKNOTE_YJS_FRAGMENT = "document-store";

/** 방 제목 등 메타 — PartyKit Yjs 로 실시간 동기화 */
export const ROOM_META_MAP = "room-meta";
export const ROOM_META_TITLE_KEY = "title";

/** Tiptap·잘못된 BlockNote 시도 때 쓰이던 레거시 키 — BlockNote 와 호환되지 않음 */
export const LEGACY_YJS_FRAGMENTS = ["default", "prosemirror"] as const;

/** share 에 이미 있는 XmlFragment 내용만 비웁니다 (getXmlFragment 로 키를 새로 만들지 않음) */
export function clearYXmlFragmentIfExists(ydoc: Y.Doc, fragmentName: string): void {
  if (!ydoc.share.has(fragmentName)) return;
  const fragment = ydoc.getXmlFragment(fragmentName);
  if (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }
}

/** PartyKit sync 후 document-store 에 본문이 있는지 (스냅샷 merge 여부 판단용) */
export function yDocHasBlockNoteContent(ydoc: Y.Doc): boolean {
  if (!ydoc.share.has(BLOCKNOTE_YJS_FRAGMENT)) return false;
  return ydoc.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT).length > 0;
}

/** Y.Doc 저장 트리거 판별용 — update 바이트 크기 + fragment 지문 + 블록 수 */
export type YDocPersistenceSignature = {
  updateBytes: number;
  fragmentFingerprint: string;
  blockCount: number;
  mediaBlockCount: number;
};

/** document-store JSON 안의 blockContainer 개수 (대략적 블록 수) */
export function getBlockNoteBlockCount(ydoc: Y.Doc): number {
  const fp = getBlockNoteFragmentFingerprint(ydoc);
  if (!fp) return 0;
  return (fp.match(/blockContainer/g) || []).length;
}

/** 비디오·파일 블록 수 (삭제 감지용) */
export function getBlockNoteMediaBlockCount(ydoc: Y.Doc): number {
  const fp = getBlockNoteFragmentFingerprint(ydoc);
  if (!fp) return 0;
  const video = (fp.match(/data-content-type[=:]\\?"video\\"?|"type"\s*:\s*"video"/g) || []).length;
  const file = (fp.match(/data-file-block|data-content-type[=:]\\?"file\\"?|"type"\s*:\s*"file"/g) || []).length;
  return video + file;
}

export function readYDocPersistenceSignature(ydoc: Y.Doc): YDocPersistenceSignature {
  return {
    updateBytes: Y.encodeStateAsUpdate(ydoc).byteLength,
    fragmentFingerprint: getBlockNoteFragmentFingerprint(ydoc),
    blockCount: getBlockNoteBlockCount(ydoc),
    mediaBlockCount: getBlockNoteMediaBlockCount(ydoc),
  };
}

/** 블록 삭제·구조 축소로 보이는 변경 — 즉시 flush 대상 */
export function isLikelyYDocContentRemoval(
  prev: YDocPersistenceSignature,
  next: YDocPersistenceSignature,
): boolean {
  if (next.blockCount < prev.blockCount) return true;
  if (next.mediaBlockCount < prev.mediaBlockCount) return true;
  if (next.fragmentFingerprint !== prev.fragmentFingerprint) {
    if (next.fragmentFingerprint.length < prev.fragmentFingerprint.length) return true;
    if (next.updateBytes < prev.updateBytes) return true;
  }
  return next.updateBytes < prev.updateBytes;
}

/** ydoc 본문·구조 변경 여부 */
export function yDocPersistenceSignatureChanged(
  prev: YDocPersistenceSignature,
  next: YDocPersistenceSignature,
): boolean {
  return (
    prev.updateBytes !== next.updateBytes ||
    prev.fragmentFingerprint !== next.fragmentFingerprint ||
    prev.blockCount !== next.blockCount ||
    prev.mediaBlockCount !== next.mediaBlockCount
  );
}

/** Yjs room-meta 에서 제목 읽기 */
export function getRoomTitleFromYDoc(ydoc: Y.Doc): string | null {
  if (!ydoc.share.has(ROOM_META_MAP)) return null;
  const value = ydoc.getMap(ROOM_META_MAP).get(ROOM_META_TITLE_KEY);
  return typeof value === "string" ? value : null;
}

/** Yjs room-meta 에 제목 쓰기 — PartyKit 으로 다른 클라이언트에 전파 */
export function setRoomTitleInYDoc(ydoc: Y.Doc, title: string): void {
  ydoc.getMap(ROOM_META_MAP).set(ROOM_META_TITLE_KEY, title);
}
/** 삭제·구조 변경 감지용 — document-store JSON 지문 */
export function getBlockNoteFragmentFingerprint(ydoc: Y.Doc): string {
  if (!ydoc.share.has(BLOCKNOTE_YJS_FRAGMENT)) return "";
  try {
    return JSON.stringify(ydoc.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT).toJSON());
  } catch {
    return "";
  }
}

/**
 * XmlFragment JSON 에 BlockNote 블록 마커가 있는지 대략 검사합니다.
 * Tiptap StarterKit XML 이 섞이면 보통 `blockContainer` 가 없습니다.
 */
function looksLikeBlockNoteFragment(fragment: Y.XmlFragment): boolean {
  if (fragment.length === 0) return true;

  try {
    const json = fragment.toJSON();
    const text = JSON.stringify(json);
    return text.includes("blockContainer") || text.includes("blockGroup");
  } catch {
    return false;
  }
}

/**
 * 레거시 Tiptap XmlFragment 만 제거합니다.
 * PartyKit 에 이미 연결된 Y.Doc 에서 document-store 를 지우면 Yjs 로 전파되어
 * 다른 접속자 본문이 초기화될 수 있으므로, 공유 Doc 에서는 이 함수만 사용합니다.
 */
export function clearLegacyYjsFragments(ydoc: Y.Doc): void {
  for (const name of LEGACY_YJS_FRAGMENTS) {
    clearYXmlFragmentIfExists(ydoc, name);
  }
}

/**
 * @deprecated 공유 Y.Doc 에서 document-store 삭제를 하지 않도록 `clearLegacyYjsFragments` 사용
 */
export function prepareYDocForBlockNote(ydoc: Y.Doc): void {
  clearLegacyYjsFragments(ydoc);
}

/** 빈 Y.Doc 대비 encodeStateAsUpdate 가 유의미하게 큰지 (PartyKit 서버 상태 수신 보조) */
export function yDocHasCollaborationState(ydoc: Y.Doc): boolean {
  return Y.encodeStateAsUpdate(ydoc).length > 4;
}

/**
 * Supabase 스냅샷을 PartyKit Y.Doc 에 merge 해도 되는지 판별합니다.
 * - PartyKit 에서 원격 update 를 받았거나 본문 fragment 가 있으면 서버/동료가 진실 원천
 * - awareness 에 다른 클라이언트가 있으면 DB 스냅샷 merge 금지 (구버전 되살림·초기화 방지)
 * - share 키·state update 가 있으면 서버에서 뭔가 merge 된 것으로 보고 seed 금지
 */
export function shouldSeedYDocFromSupabaseSnapshot(
  ydoc: Y.Doc,
  options: {
    hadRemotePartyKitUpdate: boolean;
    otherAwarenessClientCount: number;
  },
): boolean {
  if (options.hadRemotePartyKitUpdate) return false;
  if (options.otherAwarenessClientCount > 0) return false;
  if (yDocHasBlockNoteContent(ydoc)) return false;
  if (yDocHasCollaborationState(ydoc)) return false;
  if (ydoc.share.size > 0) return false;
  return true;
}

/** awareness 상태 맵에서 자신(ydoc.clientID)을 제외한 접속 클라이언트 수 */
export function countOtherAwarenessClients(
  awarenessStates: Map<number, unknown>,
  localClientId: number,
): number {
  let count = 0;
  for (const clientId of awarenessStates.keys()) {
    if (clientId !== localClientId) count += 1;
  }
  return count;
}

/** 스냅샷이 BlockNote 본문을 담고 있는지 대략 판별 (빈 ydoc 상태 스냅샷은 제외) */
export function snapshotLooksLikeBlockNoteContent(snapshotB64: string | null): boolean {
  if (!snapshotB64) return false;
  try {
    const bytes = Uint8Array.from(atob(snapshotB64), (c) => c.charCodeAt(0));
    if (bytes.length <= 8) return false;
    const probe = new Y.Doc();
    Y.applyUpdate(probe, bytes);
    if (!probe.share.has(BLOCKNOTE_YJS_FRAGMENT)) return false;
    const frag = probe.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT);
    return frag.length > 0 && looksLikeBlockNoteFragment(frag);
  } catch {
    return false;
  }
}
