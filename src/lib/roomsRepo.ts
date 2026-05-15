import type { SupabaseClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import { decodeBase64ToUint8Array, encodeYUpdateAsBase64 } from "./yjsSnapshot";

export type RoomRow = {
  slug: string;
  title: string;
  y_snapshot: string | null;
};

/**
 * 방 단건 조회. 없으면 null (신규 방으로 취급).
 */
export async function fetchRoomBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("slug,title,y_snapshot")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as RoomRow | null;
}

/**
 * 신규 방 행 생성(메타만). 본문은 Yjs + PartyKit에서 채워지고 스냅샷은 별도 upsert로 저장합니다.
 */
export async function insertRoom(
  supabase: SupabaseClient,
  slug: string,
  title: string,
): Promise<void> {
  const { error } = await supabase.from("rooms").insert({ slug, title });
  if (error) throw error;
}

/**
 * Yjs 전체 상태 인코딩을 rooms.y_snapshot에 upsert.
 * `onConflict: slug`로 동일 방에 대한 덮어쓰기를 보장합니다.
 */
export async function upsertRoomYjsSnapshot(
  supabase: SupabaseClient,
  slug: string,
  title: string,
  ydoc: Y.Doc,
): Promise<void> {
  const update = Y.encodeStateAsUpdate(ydoc);
  const b64 = encodeYUpdateAsBase64(update);
  const { error } = await supabase.from("rooms").upsert(
    {
      slug,
      title,
      y_snapshot: b64,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );
  if (error) throw error;
}

/**
 * DB에 저장된 스냅샷을 빈 Y.Doc에 적용합니다(호출 측에서 새 Doc을 넘기는 것이 일반적).
 */
export function applyStoredSnapshotToDoc(ydoc: Y.Doc, row: RoomRow | null): void {
  if (!row?.y_snapshot) return;
  const bytes = decodeBase64ToUint8Array(row.y_snapshot);
  Y.applyUpdate(ydoc, bytes);
}
