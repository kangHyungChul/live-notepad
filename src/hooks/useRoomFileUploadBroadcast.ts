import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** Broadcast 로 전달되는 업로드 상태 */
export type RoomFileUploadBroadcastPayload = {
  clientId: string;
  uploadId: string;
  fileName: string;
  by: string;
  percent: number;
  phase: "start" | "progress" | "done" | "error" | "cancel";
  error?: string;
};

export type PendingUploadView = {
  uploadId: string;
  fileName: string;
  percent: number;
  by: string;
  isLocal: boolean;
  status: "uploading" | "done" | "error";
  error?: string;
  updatedAt: number;
};

const BROADCAST_EVENT = "room-file-upload";
const REMOTE_STALE_MS = 90_000;

function uploadChannelName(roomSlug: string): string {
  return `room-file-upload:${roomSlug}`;
}

/**
 * 같은 방 참가자에게 업로드 진행 상태를 Broadcast 합니다.
 */
export function useRoomFileUploadBroadcast(
  supabase: SupabaseClient,
  roomSlug: string,
  clientId: string,
  localGuestLabel: string,
): {
  remotePending: PendingUploadView[];
  broadcast: (payload: Omit<RoomFileUploadBroadcastPayload, "clientId" | "by">) => void;
} {
  const [remotePending, setRemotePending] = useState<PendingUploadView[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localGuestRef = useRef(localGuestLabel);
  localGuestRef.current = localGuestLabel;

  const broadcast = (payload: Omit<RoomFileUploadBroadcastPayload, "clientId" | "by">) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: BROADCAST_EVENT,
      payload: {
        ...payload,
        clientId,
        by: localGuestRef.current,
      } satisfies RoomFileUploadBroadcastPayload,
    });
  };

  useEffect(() => {
    if (!roomSlug) return;

    const channel = supabase
      .channel(uploadChannelName(roomSlug))
      .on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
        const p = payload as RoomFileUploadBroadcastPayload;
        if (!p?.uploadId || p.clientId === clientId) return;
        const now = Date.now();

        if (p.phase === "done" || p.phase === "cancel") {
          setRemotePending((prev) => prev.filter((u) => u.uploadId !== p.uploadId));
          return;
        }

        if (p.phase === "error") {
          setRemotePending((prev) => [
            {
              uploadId: p.uploadId,
              fileName: p.fileName,
              percent: p.percent,
              by: p.by,
              isLocal: false,
              status: "error",
              error: p.error,
              updatedAt: now,
            },
            ...prev.filter((u) => u.uploadId !== p.uploadId),
          ]);
          window.setTimeout(() => {
            setRemotePending((prev) => prev.filter((u) => u.uploadId !== p.uploadId));
          }, 4000);
          return;
        }

        setRemotePending((prev) => {
          const entry: PendingUploadView = {
            uploadId: p.uploadId,
            fileName: p.fileName,
            percent: p.percent,
            by: p.by,
            isLocal: false,
            status: "uploading",
            updatedAt: now,
          };
          const idx = prev.findIndex((u) => u.uploadId === p.uploadId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = entry;
            return copy;
          }
          return [entry, ...prev];
        });
      })
      .subscribe();

    channelRef.current = channel;

    const staleTimer = window.setInterval(() => {
      const cutoff = Date.now() - REMOTE_STALE_MS;
      setRemotePending((prev) =>
        prev.filter((u) => u.status !== "uploading" || u.updatedAt >= cutoff),
      );
    }, 15_000);

    return () => {
      window.clearInterval(staleTimer);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomSlug, clientId]);

  return { remotePending, broadcast };
}

/** 로컬·원격 pending 업로드를 목록용으로 합칩니다 */
export function mergePendingUploads(
  local: PendingUploadView[],
  remote: PendingUploadView[],
): PendingUploadView[] {
  const map = new Map<string, PendingUploadView>();
  for (const u of [...remote, ...local]) {
    map.set(u.uploadId, u);
  }
  return [...map.values()];
}
