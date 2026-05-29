import { BlockNoteView } from "@blocknote/mantine";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import type { Doc } from "yjs";
import type YPartyKitProvider from "y-partykit/provider";
import { useMemo } from "react";
import { useBlockNoteCopyFallback } from "../hooks/useBlockNoteCopyFallback";
import { BLOCKNOTE_YJS_FRAGMENT } from "../lib/blocknoteYjs";

type BlockNoteCollabEditorProps = {
  ydoc: Doc;
  provider: YPartyKitProvider;
  editable?: boolean;
  localUserName: string;
  localUserColor: string;
};

/**
 * BlockNote + Yjs 협업 에디터.
 * BlockNote PartyKit 공식 예제와 동일한 최소 옵션만 사용합니다.
 */
export function BlockNoteCollabEditor({
  ydoc,
  provider,
  editable = true,
  localUserName,
  localUserColor,
}: BlockNoteCollabEditorProps) {
  const fragment = ydoc.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT);

  const editor = useCreateBlockNote(
    {
      dictionary: ko,
      collaboration: {
        provider,
        fragment,
        user: {
          name: localUserName,
          color: localUserColor,
        },
      },
    },
    [ydoc, provider, localUserName, localUserColor],
  );

  // 플로팅 UI(툴바·슬래시 메뉴)를 body 로 분리 — editor-shell 위 오버레이가 선택·복사를 막는 것 방지
  const portalElements = useMemo(
    (): { default: null } => ({ default: null }),
    [],
  );

  // BlockNote copyToClipboard 가 빈 클립보드로 copy/cut 을 삼키는 문제 보완
  useBlockNoteCopyFallback(editor);

  return (
    <BlockNoteView
      editor={editor}
      theme="dark"
      editable={editable}
      className="blocknote-collab-editor"
      portalElements={portalElements}
    />
  );
}
