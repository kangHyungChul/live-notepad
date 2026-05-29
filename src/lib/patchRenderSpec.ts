import { DOMSerializer } from "prosemirror-model";

type RenderSpecResult = { dom: HTMLElement; contentDOM?: HTMLElement };

type RenderSpecFn = (
  doc: Document,
  structure: unknown,
  xmlNS?: string | null,
  blockArraysIn?: Record<string, unknown>,
) => RenderSpecResult;

/**
 * React 19 + Tiptap nodeView 조합에서 ProseMirror `renderSpec` 에
 * DOM spec 배열 대신 `{ dom: HTMLElement, contentDOM? }` 가 넘어오는 경우가 있습니다.
 * prebuilt DOM 은 그대로 통과시키고, 빈 placeholder 는 임시 span 으로 대체합니다.
 */
export function installRenderSpecPatch(): void {
  if (typeof window === "undefined") return;

  const serializer = DOMSerializer as unknown as {
    renderSpec: RenderSpecFn;
    __renderSpecPatched?: boolean;
  };
  if (serializer.__renderSpecPatched) return;
  serializer.__renderSpecPatched = true;

  const original = serializer.renderSpec.bind(DOMSerializer);

  serializer.renderSpec = function patchedRenderSpec(doc, structure, xmlNS, blockArraysIn) {
    const prebuilt = structure as { dom?: unknown; contentDOM?: unknown } | null;
    if (prebuilt && typeof prebuilt === "object" && !Array.isArray(prebuilt)) {
      if (prebuilt.dom instanceof HTMLElement) {
        return prebuilt as RenderSpecResult;
      }

      const domIsEmptyObject =
        prebuilt.dom &&
        typeof prebuilt.dom === "object" &&
        !(prebuilt.dom instanceof HTMLElement) &&
        Object.keys(prebuilt.dom as object).length === 0;
      if (domIsEmptyObject) {
        const dom = document.createElement("span");
        const contentDOM = document.createElement("span");
        return { dom, contentDOM };
      }
    }

    return original(doc, structure, xmlNS, blockArraysIn);
  };
}
