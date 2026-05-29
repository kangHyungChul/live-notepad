import type { BlockNoteEditor } from "@blocknote/core";
import type { EditorView } from "prosemirror-view";
import { useEffect } from "react";

/** 브라우저 Selection 이 에디터 contenteditable 루트 안에 있는지 확인 */
function selectionInsideEditor(dom: HTMLElement, browserSel: Selection): boolean {
  const anchor = browserSel.anchorNode;
  const focus = browserSel.focusNode;
  if (anchor && dom.contains(anchor)) return true;
  if (focus && dom.contains(focus)) return true;
  return false;
}

/**
 * 복사·잘라내기를 시도하는 순간 에디터와 관련 있는지 판별합니다.
 * 포커스가 빠져 있어도 드래그 선택만 남아 있으면 true.
 */
function isEditorClipboardContext(view: EditorView, dom: HTMLElement): boolean {
  if (view.hasFocus()) return true;
  if (!view.state.selection.empty) return true;
  if (dom.contains(document.activeElement)) return true;

  const browserSel = window.getSelection();
  if (browserSel && !browserSel.isCollapsed && selectionInsideEditor(dom, browserSel)) {
    return true;
  }

  return false;
}

/** PM 선택 범위에서 plain text 추출 (블록 경계는 빈 줄로) */
function plainFromPmSelection(view: EditorView): string {
  const { from, to, empty } = view.state.selection;
  if (empty) return "";
  return view.state.doc.textBetween(from, to, "\n\n");
}

/**
 * clipboardData 에 복사 내용을 채웁니다.
 * PM 선택 우선, 없으면 브라우저 Selection 문자열 사용.
 */
function fillClipboardData(data: DataTransfer, view: EditorView, dom: HTMLElement): boolean {
  const { empty } = view.state.selection;

  if (!empty) {
    try {
      const slice = view.state.selection.content();
      const serialized = view.serializeForClipboard(slice);
      const plain = serialized.text || plainFromPmSelection(view);
      if (!plain) return false;

      data.clearData();
      data.setData("text/plain", plain);
      const html = serialized.dom?.innerHTML;
      if (html) {
        data.setData("text/html", html);
      }
      return true;
    } catch {
      const plain = plainFromPmSelection(view);
      if (!plain) return false;
      data.clearData();
      data.setData("text/plain", plain);
      return true;
    }
  }

  const browserSel = window.getSelection();
  if (!browserSel || browserSel.isCollapsed || !selectionInsideEditor(dom, browserSel)) {
    return false;
  }

  const plain = browserSel.toString();
  if (!plain) return false;

  data.clearData();
  data.setData("text/plain", plain);
  try {
    const range = browserSel.getRangeAt(0);
    const wrapper = document.createElement("div");
    wrapper.appendChild(range.cloneContents());
    data.setData("text/html", wrapper.innerHTML);
  } catch {
    // HTML 없이 plain 만
  }
  return true;
}

/** 잘라내기 후 PM 문서에서 선택 영역 삭제 */
function deletePmSelection(view: EditorView): void {
  if (!view.editable || view.state.selection.empty) return;
  view.dispatch(view.state.tr.deleteSelection());
}

/**
 * BlockNote copyToClipboard 확장은 Kr() 조건에서 clipboard 를 비운 채 이벤트만 삼킵니다.
 * 협업·노드뷰 환경에서 PM/브라우저 선택이 어긋나면 복사·잘라내기가 모두 실패합니다.
 *
 * capture 단계에서 BlockNote 핸들러보다 먼저 실행해, 에디터 관련 copy/cut 을 직접 처리합니다.
 * Ctrl+C/X 키보드 단축키는 클립보드 API 로 한 번 더 보완합니다.
 */
export function useBlockNoteCopyFallback(editor: BlockNoteEditor | null | undefined) {
  useEffect(() => {
    if (!editor) return;

    const getViewDom = (): { view: EditorView; dom: HTMLElement } | null => {
      const view = editor.prosemirrorView;
      const dom = editor.domElement;
      if (!view || !dom) return null;
      return { view, dom };
    };

    const onCopyCapture = (event: ClipboardEvent) => {
      const ctx = getViewDom();
      if (!ctx || !isEditorClipboardContext(ctx.view, ctx.dom)) return;

      const data = event.clipboardData;
      if (!data) return;
      if (!fillClipboardData(data, ctx.view, ctx.dom)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onCutCapture = (event: ClipboardEvent) => {
      const ctx = getViewDom();
      if (!ctx || !isEditorClipboardContext(ctx.view, ctx.dom)) return;

      const data = event.clipboardData;
      if (!data) return;
      if (!fillClipboardData(data, ctx.view, ctx.dom)) return;

      deletePmSelection(ctx.view);

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    /**
     * copy/cut 이벤트가 BlockNote 에서 막히는 경우 Ctrl+C/X 로 클립보드 API 직접 호출.
     * keydown 에서 preventDefault 하면 이후 copy 이벤트와 이중 처리될 수 있어,
     * 여기서는 PM 선택이 있을 때만 보완합니다.
     */
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key !== "c" && key !== "x") return;

      const ctx = getViewDom();
      if (!ctx || !ctx.view.hasFocus()) return;

      const plain = plainFromPmSelection(ctx.view);
      if (!plain) return;

      event.preventDefault();
      event.stopPropagation();

      const isCut = key === "x";

      void navigator.clipboard
        .writeText(plain)
        .then(() => {
          if (isCut) deletePmSelection(ctx.view);
        })
        .catch(() => {
          // 클립보드 API 거부 시 hidden textarea + execCommand
          const ta = document.createElement("textarea");
          ta.value = plain;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand(isCut ? "cut" : "copy");
            if (isCut) deletePmSelection(ctx.view);
          } finally {
            document.body.removeChild(ta);
          }
        });
    };

    document.addEventListener("copy", onCopyCapture, true);
    document.addEventListener("cut", onCutCapture, true);
    document.addEventListener("keydown", onKeyDownCapture, true);

    return () => {
      document.removeEventListener("copy", onCopyCapture, true);
      document.removeEventListener("cut", onCutCapture, true);
      document.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, [editor]);
}
