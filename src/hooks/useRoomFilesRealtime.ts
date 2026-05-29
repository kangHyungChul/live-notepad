import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { RoomFileRow } from "../lib/roomFilesRepo";

/** Realtime 으로 전달되는 room_files 변경 */
export type RoomFilesRealtimeChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  newRow: RoomFileRow | null;
  oldRow: RoomFileRow | null;
};

type Options = {
  onChange: (change: RoomFilesRealtimeChange) => void;
  onSyncIssue?: () => void;
};

function rowFromRecord(record: Record<string, unknown> | undefined): RoomFileRow | null {
  if (!record || typeof record.id !== "string") return null;
  return record as unknown as RoomFileRow;
}

function attachRoomFilesListeners(
  channel: RealtimeChannel,
  roomSlug: string,
  onChange: (change: RoomFilesRealtimeChange) => void,
): RealtimeChannel {
  const emit = (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
    onChange({
      eventType: payload.eventType as RoomFilesRealtimeChange["eventType"],
      newRow: rowFromRecord(payload.new),
      oldRow: rowFromRecord(payload.old),
    });
  };

  return channel
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "room_files",
        filter: `room_slug=eq.${roomSlug}`,
      },
      emit,
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "room_files",
        filter: `room_slug=eq.${roomSlug}`,
      },
      emit,
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "room_files",
      },
      emit,
    );
}

/**
 * 같은 방 room_files 변경을 Realtime 으로 구독합니다.
 */
export function useRoomFilesRealtime(
  supabase: SupabaseClient,
  roomSlug: string,
  options: Options,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!roomSlug) return;

    const channel = attachRoomFilesListeners(
      supabase.channel(`room-files:${roomSlug}`),
      roomSlug,
      (change) => {
        if (change.eventType === "DELETE") {
          const slug = change.oldRow?.room_slug;
          if (slug && slug !== roomSlug) return;
        }
        optionsRef.current.onChange(change);
      },
    ).subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        optionsRef.current.onSyncIssue?.();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomSlug]);
}

/** Realtime 페이로드를 로컬 목록·미리보기 상태에 즉시 반영 (용량은 files 에서 파생) */
export function applyRoomFilesRealtimeChange(
  change: RoomFilesRealtimeChange,
  roomSlug: string,
  setFiles: Dispatch<SetStateAction<RoomFileRow[]>>,
  setPreviewRow: Dispatch<SetStateAction<RoomFileRow | null>>,
): void {
  if (change.eventType === "INSERT" && change.newRow) {
    const row = change.newRow;
    if (row.room_slug !== roomSlug) return;
    setFiles((prev) => (prev.some((f) => f.id === row.id) ? prev : [row, ...prev]));
    return;
  }

  if (change.eventType === "UPDATE" && change.newRow) {
    const row = change.newRow;
    if (row.room_slug !== roomSlug) return;
    setFiles((prev) => prev.map((f) => (f.id === row.id ? row : f)));
    return;
  }

  if (change.eventType === "DELETE") {
    const old = change.oldRow;
    const id = old?.id;
    if (!id) return;
    if (old?.room_slug && old.room_slug !== roomSlug) return;

    setFiles((prev) => prev.filter((f) => f.id !== id));
    setPreviewRow((prev) => (prev?.id === id ? null : prev));
  }
}
