import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { Doc } from "yjs";
import type YPartyKitProvider from "y-partykit/provider";
import { useEffect } from "react";

type CollabEditorProps = {
  /** 방마다 하나의 공유 Y.Doc (프로바이더와 동일 인스턴스여야 함) */
  ydoc: Doc;
  /** y-partykit 프로바이더 — awareness와 웹소켓 상태를 제공 */
  provider: YPartyKitProvider;
  /**
   * PartyKit 첫 동기화 전에는 false 로 두는 것이 안전합니다.
   * true 가 되기 전에 입력하면 기기마다 문서가 어긋날 수 있습니다.
   */
  editable?: boolean;
  /** 로컬 사용자 표시 이름(익명 Guest 등) */
  localUserName: string;
  /** 로컬 사용자 커서 색 */
  localUserColor: string;
};

/**
 * Tiptap + Yjs + CollaborationCaret로 리치 텍스트 실시간 편집 UI를 구성합니다.
 * - StarterKit의 `history`는 Yjs 협업과 충돌하므로 비활성화합니다(실행 취소는 Collaboration 확장 쪽).
 * - `CollaborationCaret`은 원격 사용자 커서/선택 영역을 렌더링합니다.
 */
export function CollabEditor({
  ydoc,
  provider,
  editable = true,
  localUserName,
  localUserColor,
}: CollabEditorProps) {
  const editor = useEditor(
    {
      // 첫 sync 전에는 읽기 전용 — Y.XmlFragment 와 ProseMirror 가 동시에 성장하지 않게 합니다.
      editable,
      extensions: [
        StarterKit.configure({
          // Yjs 협업 시 ProseMirror 기본 undo/redo 스택은 끄고 Collaboration 확장의 흐름을 사용합니다.
          undoRedo: false,
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCaret.configure({
          provider,
          user: {
            name: localUserName,
            color: localUserColor,
          },
        }),
      ],
      editorProps: {
        attributes: {
          class: "collab-editor__surface",
          spellcheck: "true",
        },
      },
    },
    // 로컬 표시 이름/색은 아래 `useEffect`의 `updateUser`로만 갱신해 에디터 인스턴스를 불필요하게 재생성하지 않습니다.
    [ydoc, provider],
  );

  // `useEditor` 는 의존성에 `editable` 을 넣지 않아(인스턴스 재생성 비용) 여기서 동적으로 토글합니다.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // awareness에 표시될 로컬 사용자 정보가 바뀌면 프로바이더에 다시 반영합니다.
  useEffect(() => {
    if (!editor) return;
    editor.commands.updateUser({
      name: localUserName,
      color: localUserColor,
    });
  }, [editor, localUserColor, localUserName]);

  if (!editor) return <p className="collab-editor__loading">에디터 준비 중…</p>;

  return <EditorContent editor={editor} />;
}
