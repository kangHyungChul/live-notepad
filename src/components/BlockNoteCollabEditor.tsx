import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import type { Doc } from "yjs";
import type YPartyKitProvider from "y-partykit/provider";
import { useMemo } from "react";
import {
  createBlockNotePasteHandler,
  useBlockNoteCopyCutFix,
  type BlockNoteInternalClipboard,
} from "../hooks/useBlockNoteCopyCutFix";
import { BLOCKNOTE_YJS_FRAGMENT } from "../lib/blocknoteYjs";

const editorSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
});

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

  const internalClipboard = useMemo<BlockNoteInternalClipboard>(
    () => ({
      blocknoteHtml: null,
      blocks: null,
      readyForInternalPaste: false,
    }),
    [],
  );

  const pasteHandler = useMemo(
    () => createBlockNotePasteHandler(internalClipboard),
    [internalClipboard],
  );

  const editor = useCreateBlockNote(
    {
      schema: editorSchema,
      dictionary: ko,
      disableExtensions: ["copyToClipboard"],
      pasteHandler,
      collaboration: {
        provider,
        fragment,
        user: {
          name: localUserName,
          color: localUserColor,
        },
      },
    },
    [ydoc, provider, localUserName, localUserColor, pasteHandler],
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
