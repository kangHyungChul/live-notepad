import * as Y from "yjs";

/** BlockNote + PartyKit 공식 예제 XmlFragment 키 */
export const BLOCKNOTE_YJS_FRAGMENT = "document-store";

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
 * BlockNote 에디터를 붙이기 전 Y.Doc 을 정리합니다.
 * - 레거시 Tiptap fragment 제거 (이미 share 에 있을 때만)
 * - document-store 가 BlockNote 형식이 아니면 비움 (renderSpec 크래시 방지)
 */
export function prepareYDocForBlockNote(ydoc: Y.Doc): void {
  const hadBlockStore = ydoc.share.has(BLOCKNOTE_YJS_FRAGMENT);
  const blockFragment = hadBlockStore
    ? ydoc.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT)
    : null;

  for (const name of LEGACY_YJS_FRAGMENTS) {
    clearYXmlFragmentIfExists(ydoc, name);
  }

  if (
    blockFragment &&
    blockFragment.length > 0 &&
    !looksLikeBlockNoteFragment(blockFragment)
  ) {
    blockFragment.delete(0, blockFragment.length);
  }
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
