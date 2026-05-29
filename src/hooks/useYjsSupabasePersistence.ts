import { useCallback, useEffect, useRef } from "react";
import type { Doc } from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBlockNoteFragmentFingerprint } from "../lib/blocknoteYjs";
import { upsertRoomYjsSnapshot } from "../lib/roomsRepo";

const DEBOUNCE_MS = 2000;

/**
 * Y.Doc 변경을 디바운스하여 Supabase `rooms.y_snapshot`에 반영합니다.
 * - 블록 삭제(비디오·파일 등)는 지문이 줄어드는 즉시 flush — 되살림 방지
 * - 탭 전환/닫힘 시 한 번 더 flush 해 유실을 줄입니다.
 */
export function useYjsSupabasePersistence(
  ydoc: Doc,
  slug: string,
  title: string,
  supabase: SupabaseClient | null,
  enabled: boolean,
): void {
  const titleRef = useRef(title);

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
    let lastFingerprint = getBlockNoteFragmentFingerprint(ydoc);

    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, DEBOUNCE_MS);
    };

    const onUpdate = () => {
      const nextFingerprint = getBlockNoteFragmentFingerprint(ydoc);
      const contentRemoved = nextFingerprint.length < lastFingerprint.length;
      lastFingerprint = nextFingerprint;

      // 비디오·파일 블록 삭제 등 구조 축소 → DB 에 옛 스냅샷이 남지 않도록 즉시 저장
      if (contentRemoved) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        void flush();
        return;
      }

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

  useEffect(() => {
    if (!enabled || !supabase) return;
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [enabled, flush, supabase, title]);
}
