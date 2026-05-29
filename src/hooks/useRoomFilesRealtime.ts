import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 같은 방의 room_files INSERT/DELETE 를 구독해 목록을 갱신합니다.
 * (Supabase Realtime + 006 마이그레이션 publication 필요)
 */
export function useRoomFilesRealtime(
  supabase: SupabaseClient,
  roomSlug: string,
  onChange: () => void | Promise<void>,
): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!roomSlug) return;

    const channel = supabase
      .channel(`room-files:${roomSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_files",
          filter: `room_slug=eq.${roomSlug}`,
        },
        () => {
          void onChangeRef.current();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomSlug]);
}
