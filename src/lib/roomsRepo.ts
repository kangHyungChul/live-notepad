import type { SupabaseClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import { deleteAllRoomFilesForRoom } from "./roomFilesRepo";
import { throwIfSupabaseError } from "./supabaseErrors";
import { clearYXmlFragmentIfExists, LEGACY_YJS_FRAGMENTS } from "./blocknoteYjs";
import { decodeBase64ToUint8Array, encodeYUpdateAsBase64 } from "./yjsSnapshot";

export type RoomRow = {
  slug: string;
  title: string;
  y_snapshot: string | null;
};

/** 홈 화면 방 목록용(스냅샷 제외) */
export type RoomListItem = {
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
};

/**
 * 방 단건 조회. 없으면 null.
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
  throwIfSupabaseError(error);
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
  throwIfSupabaseError(error);
}

/**
 * 최근 갱신 순으로 방 목록을 가져옵니다.
 * (홈 화면 — DB에 등록된 모든 방이 노출됩니다. 추후 소유자·초대 기반 필터로 확장 가능)
 */
export async function listRooms(
  supabase: SupabaseClient,
  limit = 50,
): Promise<RoomListItem[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("slug,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  throwIfSupabaseError(error);
  return (data ?? []) as RoomListItem[];
}

/**
 * 방 행 삭제. 현재 RLS는 익명 삭제 허용(MVP).
 * Storage 객체는 DB 트리거가 아닌 Storage API 로 먼저 지운 뒤 rooms 행을 삭제합니다.
 */
export async function deleteRoomBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<void> {
  await deleteAllRoomFilesForRoom(supabase, slug);
  const { error } = await supabase.from("rooms").delete().eq("slug", slug);
  throwIfSupabaseError(error);
}

/**
 * 방 제목만 갱신합니다. y_snapshot 은 건드리지 않습니다.
 */
export async function updateRoomTitle(
  supabase: SupabaseClient,
  slug: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);
  throwIfSupabaseError(error);
}

/**
 * Yjs 전체 상태 인코딩을 rooms.y_snapshot에 upsert.
 * 편집 중인 Y.Doc 은 건드리지 않고, 복제본에서만 레거시 fragment 를 제거합니다.
 */
export async function upsertRoomYjsSnapshot(
  supabase: SupabaseClient,
  slug: string,
  title: string,
  ydoc: Y.Doc,
): Promise<void> {
  const snapshotDoc = new Y.Doc();
  try {
    Y.applyUpdate(snapshotDoc, Y.encodeStateAsUpdate(ydoc));
    for (const name of LEGACY_YJS_FRAGMENTS) {
      clearYXmlFragmentIfExists(snapshotDoc, name);
    }
    const b64 = encodeYUpdateAsBase64(Y.encodeStateAsUpdate(snapshotDoc));
    const { error } = await supabase.from("rooms").upsert(
      {
        slug,
        title,
        y_snapshot: b64,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
    throwIfSupabaseError(error);
  } finally {
    snapshotDoc.destroy();
  }
}

/**
 * DB에 저장된 스냅샷을 빈 Y.Doc에 적용합니다(호출 측에서 새 Doc을 넘기는 것이 일반적).
 */
export function applyStoredSnapshotToDoc(ydoc: Y.Doc, row: RoomRow | null): void {
  if (!row?.y_snapshot) return;
  const bytes = decodeBase64ToUint8Array(row.y_snapshot);
  Y.applyUpdate(ydoc, bytes);
}
