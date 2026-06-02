import { BlockNoteView } from "@blocknote/mantine";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import type { Doc } from "yjs";
import type YPartyKitProvider from "y-partykit/provider";
import { useMemo, useRef } from "react";
import {
  createBlockNotePasteHandler,
  useBlockNoteCopyCutFix,
  type BlockNoteInternalClipboard,
} from "../hooks/useBlockNoteCopyCutFix";
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
 * copy/cut: useBlockNoteCopyCutFix / paste: createBlockNotePasteHandler
 */
export function BlockNoteCollabEditor({
  ydoc,
  provider,
  editable = true,
  localUserName,
  localUserColor,
}: BlockNoteCollabEditorProps) {
  const fragment = ydoc.getXmlFragment(BLOCKNOTE_YJS_FRAGMENT);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  const internalClipboardRef = useRef<BlockNoteInternalClipboard>({
    blocknoteHtml: null,
    blocks: null,
    readyForInternalPaste: false,
  });
  const internalClipboard = internalClipboardRef.current;

  const pasteHandler = useMemo(
    () => createBlockNotePasteHandler(internalClipboard),
    [internalClipboard],
  );

  const editor = useCreateBlockNote(
    {
      dictionary: ko,
      disableExtensions: ["copyToClipboard"],
      pasteHandler,
      collaboration: {
        provider: providerRef.current,
        fragment,
        user: {
          name: localUserName,
          color: localUserColor,
        },
      },
    },
    [ydoc, localUserName, localUserColor, pasteHandler],
  );

  useBlockNoteCopyCutFix(editor, internalClipboard);

  return (
    <BlockNoteView
      editor={editor}
      theme="dark"
      editable={editable}
      className="blocknote-collab-editor"
    />
  );
}
