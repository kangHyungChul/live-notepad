import { useCallback, useEffect, useRef } from "react";
import type { Doc } from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertRoomYjsSnapshot } from "../lib/roomsRepo";

const DEBOUNCE_MS = 2000;

/**
 * Y.Doc 변경을 디바운스하여 Supabase `rooms.y_snapshot`에 반영합니다.
 * - 탭 전환/닫힘 시 한 번 더 flush 해 유실을 줄입니다.
 * - Supabase가 없으면(enabled=false) 아무 것도 하지 않습니다.
 */
export function useYjsSupabasePersistence(
  ydoc: Doc,
  slug: string,
  /** rooms.title과 함께 스냅샷 upsert에 반영 */
  title: string,
  supabase: SupabaseClient | null,
  enabled: boolean,
): void {
  const titleRef = useRef(title);

  // 렌더 중 ref를 갱신하면 eslint(react-hooks/refs) 규칙에 걸리므로 이펙트에서만 동기화합니다.
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const flush = useCallback(async () => {
    if (!supabase || !enabled) return;
    await upsertRoomYjsSnapshot(supabase, slug, titleRef.current, ydoc);
  }, [enabled, slug, supabase, ydoc]);

  useEffect(() => {
    if (!enabled || !supabase) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, DEBOUNCE_MS);
    };

    const onUpdate = () => {
      schedule();
    };

    ydoc.on("update", onUpdate);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);

    return () => {
      ydoc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
      if (timer !== null) clearTimeout(timer);
      void flush();
    };
  }, [enabled, flush, slug, supabase, ydoc]);

  // 제목만 바뀐 경우에도 rooms.title을 갱신(본문 변경 없이 upsert가 안 될 수 있음)
  useEffect(() => {
    if (!enabled || !supabase) return;
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [enabled, flush, supabase, title]);
}
