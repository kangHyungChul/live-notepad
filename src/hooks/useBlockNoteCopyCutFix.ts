import { selectedFragmentToHTML } from "@blocknote/core";
import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useEffect } from "react";

/**
 * copy/cut 직후 첫 paste 1회는 시스템 클립보드 MIME 대신 이 스냅샷을 사용합니다.
 * (브라우저가 blocknote/html 을 paste 이벤트에 넘기지 않는 경우가 많음)
 */
export type BlockNoteInternalClipboard = {
  blocknoteHtml: string | null;
  blocks: PartialBlock[] | null;
  /** copy/cut 직후 첫 paste 만 내부 스냅샷 사용 */
  readyForInternalPaste: boolean;
};

function cloneBlocks(blocks: PartialBlock[]): PartialBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as PartialBlock[];
}

/** insertBlocks 시 Yjs id 충돌 방지 — id 제거(서버가 새 id 부여) */
function stripBlockIds(blocks: PartialBlock[]): PartialBlock[] {
  const walk = (block: PartialBlock): PartialBlock => {
    const next = { ...block };
    delete next.id;
    if (next.children?.length) {
      next.children = next.children.map(walk);
    }
    return next;
  };
  return cloneBlocks(blocks).map(walk);
}

function snapshotBlocks(editor: BlockNoteEditor): PartialBlock[] | null {
  try {
    const cut = editor.getSelectionCutBlocks(true);
    if (cut.blocks?.length) {
      return stripBlockIds(cut.blocks as PartialBlock[]);
    }
  } catch {
    // getSelectionCutBlocks 실패 시 getSelection fallback
  }

  const sel = editor.getSelection();
  if (sel?.blocks?.length) {
    return stripBlockIds(sel.blocks as PartialBlock[]);
  }
  return null;
}

function markInternalCopy(
  editor: BlockNoteEditor,
  store: BlockNoteInternalClipboard,
  blocknoteHtml: string,
): void {
  store.blocknoteHtml = blocknoteHtml;
  store.blocks = snapshotBlocks(editor);
  store.readyForInternalPaste = true;
}

function clearInternalClipboard(store: BlockNoteInternalClipboard): void {
  store.blocknoteHtml = null;
  store.blocks = null;
  store.readyForInternalPaste = false;
}

function pasteFromInternalStore(
  editor: BlockNoteEditor,
  store: BlockNoteInternalClipboard,
): boolean {
  if (store.blocks?.length) {
    const cursor = editor.getTextCursorPosition().block;
    editor.insertBlocks(store.blocks, cursor, "after");
    return true;
  }

  if (store.blocknoteHtml?.trim()) {
    editor.pasteHTML(store.blocknoteHtml, true);
    return true;
  }

  return false;
}

/** pasteHandler — 내부 1회 paste → blocknote/html → 기본 paste */
export function createBlockNotePasteHandler(store: BlockNoteInternalClipboard) {
  return ({
    event,
    editor,
    defaultPasteHandler,
  }: {
    event: ClipboardEvent;
    editor: BlockNoteEditor;
    defaultPasteHandler: (opts?: {
      prioritizeMarkdownOverHTML?: boolean;
      plainTextAsMarkdown?: boolean;
    }) => boolean | undefined;
  }) => {
    const data = event.clipboardData;
    const types = data?.types ? Array.from(data.types) : [];

    if (store.readyForInternalPaste) {
      store.readyForInternalPaste = false;
      if (pasteFromInternalStore(editor, store)) {
        return true;
      }
    }

    if (types.includes("blocknote/html")) {
      const html = data!.getData("blocknote/html");
      if (html.trim()) {
        editor.pasteHTML(html, true);
        return true;
      }
    }

    return defaultPasteHandler({
      prioritizeMarkdownOverHTML: false,
      plainTextAsMarkdown: true,
    });
  };
}

/**
 * copyToClipboard 확장 비활성화 후 copy/cut 처리.
 */
export function useBlockNoteCopyCutFix(
  editor: BlockNoteEditor | null | undefined,
  store: BlockNoteInternalClipboard,
): void {
  useEffect(() => {
    if (!editor) return;

    const onCopyCapture = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && editor.isWithinEditor(target)) {
        handleCopyCut(event, editor, store, false);
        return;
      }
      clearInternalClipboard(store);
    };

    const onCutCapture = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && editor.isWithinEditor(target)) {
        handleCopyCut(event, editor, store, true);
        return;
      }
      clearInternalClipboard(store);
    };

    document.addEventListener("copy", onCopyCapture, true);
    document.addEventListener("cut", onCutCapture, true);

    return () => {
      document.removeEventListener("copy", onCopyCapture, true);
      document.removeEventListener("cut", onCutCapture, true);
    };
  }, [editor, store]);
}

function handleCopyCut(
  event: ClipboardEvent,
  editor: BlockNoteEditor,
  store: BlockNoteInternalClipboard,
  isCut: boolean,
): void {
  const view = editor.prosemirrorView;
  if (!view?.editable || view.state.selection.empty) return;

  const data = event.clipboardData;
  if (!data) return;

  try {
    const { clipboardHTML, externalHTML, markdown } = selectedFragmentToHTML(
      view,
      editor,
    );
    if (!clipboardHTML && !externalHTML && !markdown) return;

    markInternalCopy(editor, store, clipboardHTML);

    data.clearData();
    data.setData("blocknote/html", clipboardHTML);
    data.setData("text/html", externalHTML);
    data.setData("text/plain", markdown);

    event.preventDefault();
    event.stopImmediatePropagation();

    if (isCut) {
      view.dispatch(view.state.tr.deleteSelection());
    }
  } catch {
    const { from, to, empty } = view.state.selection;
    if (empty) return;
    const text = view.state.doc.textBetween(from, to, "\n\n");
    if (!text) return;

    store.blocknoteHtml = null;
    store.blocks = snapshotBlocks(editor);
    store.readyForInternalPaste = Boolean(store.blocks?.length);

    data.clearData();
    data.setData("text/plain", text);
    event.preventDefault();
    event.stopImmediatePropagation();

    if (isCut) {
      view.dispatch(view.state.tr.deleteSelection());
    }
  }
}
