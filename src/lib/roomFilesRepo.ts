import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStorageObjectFileName,
  formatBytes,
  MAX_ROOM_STORAGE_BYTES,
  validateUploadFile,
} from "./filePolicy";

/** Supabase Storage 버킷 ID (004_room_files.sql 과 동일) */
const BUCKET = "room-files";

export type RoomFileRow = {
  id: string;
  room_slug: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  expires_at: string;
};

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type RoomStorageUsage = {
  usedBytes: number;
  limitBytes: number;
};

/**
 * 만료된 파일 메타·Storage 객체를 DB 함수로 정리합니다.
 */
export async function purgeExpiredRoomFiles(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("purge_expired_room_files");
  if (error) throw error;
}

/**
 * 방의 현재 저장 사용량(만료 전 파일 합계).
 */
export async function getRoomStorageUsage(
  supabase: SupabaseClient,
  roomSlug: string,
): Promise<RoomStorageUsage> {
  const { data, error } = await supabase
    .from("room_files")
    .select("size_bytes")
    .eq("room_slug", roomSlug)
    .gte("expires_at", new Date().toISOString());
  if (error) throw error;
  const usedBytes = (data ?? []).reduce((sum, row) => sum + Number(row.size_bytes), 0);
  return { usedBytes, limitBytes: MAX_ROOM_STORAGE_BYTES };
}

/**
 * 방에 속한 파일 목록(만료되지 않은 것만, 최신순).
 */
export async function listRoomFiles(
  supabase: SupabaseClient,
  roomSlug: string,
): Promise<RoomFileRow[]> {
  await purgeExpiredRoomFiles(supabase);
  const { data, error } = await supabase
    .from("room_files")
    .select("*")
    .eq("room_slug", roomSlug)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoomFileRow[];
}

/**
 * Storage 경로 생성: {slug}/{uuid}/{uuid}.ext (키는 ASCII 만 — 원본명은 DB 에 저장)
 */
function buildStoragePath(roomSlug: string, fileId: string, originalName: string): string {
  const objectName = buildStorageObjectFileName(fileId, originalName);
  return `${roomSlug}/${fileId}/${objectName}`;
}

/**
 * XMLHttpRequest 로 Storage REST API 업로드 — 진행률 콜백 지원.
 */
function uploadToStorageWithProgress(
  supabaseUrl: string,
  anonKey: string,
  storagePath: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<void> {
  const encodedPath = storagePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodedPath}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (ev) => {
      if (!onProgress || !ev.lengthComputable) return;
      const percent = ev.total > 0 ? Math.round((ev.loaded / ev.total) * 100) : 0;
      onProgress({ loaded: ev.loaded, total: ev.total, percent });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let msg = `업로드 실패 (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch {
        /* ignore */
      }
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
    xhr.send(file);
  });
}

/**
 * 파일 업로드: 검증 → Storage → room_files 메타 등록.
 * Storage 업로드 실패 시 메타 행은 만들지 않습니다.
 */
export async function uploadRoomFile(
  supabase: SupabaseClient,
  roomSlug: string,
  file: File,
  options?: {
    onProgress?: (p: UploadProgress) => void;
  },
): Promise<RoomFileRow> {
  const policy = validateUploadFile(file);
  if (policy.ok === false) {
    throw new Error(policy.reason);
  }

  const { usedBytes, limitBytes } = await getRoomStorageUsage(supabase, roomSlug);
  if (usedBytes + file.size > limitBytes) {
    const remain = Math.max(0, limitBytes - usedBytes);
    throw new Error(
      `방 저장 용량 한도(${formatBytes(limitBytes)})를 초과합니다. ` +
        `현재 ${formatBytes(usedBytes)} 사용 중이며, 남은 용량은 ${formatBytes(remain)} 입니다.`,
    );
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase 환경 변수가 없어 파일을 업로드할 수 없습니다.");
  }

  // DB id 와 Storage 경로 세그먼트를 동일 UUID 로 맞춰 추적을 단순화합니다.
  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(roomSlug, fileId, file.name);
  const mime = file.type || "application/octet-stream";
  // expires_at 은 DB 기본값(3일)과 동일하게 클라이언트에서도 명시 (타임존 일관)
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Storage 업로드 → 2) 메타 insert (실패 시 Storage 롤백)
  await uploadToStorageWithProgress(
    supabaseUrl,
    anonKey,
    storagePath,
    file,
    options?.onProgress,
  );

  const { data, error } = await supabase
    .from("room_files")
    .insert({
      id: fileId,
      room_slug: roomSlug,
      storage_path: storagePath,
      original_name: file.name,
      mime_type: mime,
      size_bytes: file.size,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    // 메타 등록 실패 시 Storage 고아 객체 제거 시도
    await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error.message.includes("ROOM_STORAGE_LIMIT_EXCEEDED")) {
      throw new Error(
        `방 저장 용량 한도(${formatBytes(MAX_ROOM_STORAGE_BYTES)})를 초과했습니다.`,
      );
    }
    throw error;
  }

  return data as RoomFileRow;
}

/**
 * 미리보기·다운로드용 서명 URL (기본 5분).
 */
export async function getRoomFileSignedUrl(
  supabase: SupabaseClient,
  row: RoomFileRow,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, expiresInSeconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("파일 URL을 만들 수 없습니다.");
  return data.signedUrl;
}

/**
 * 서명 URL 생성 후 브라우저에서 다운로드(또는 새 탭)합니다.
 */
export async function downloadRoomFile(
  supabase: SupabaseClient,
  row: RoomFileRow,
): Promise<void> {
  const signedUrl = await getRoomFileSignedUrl(supabase, row, 120);

  const a = document.createElement("a");
  a.href = signedUrl;
  a.download = row.original_name;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Storage 객체 + 메타 행 삭제.
 */
export async function deleteRoomFile(
  supabase: SupabaseClient,
  row: RoomFileRow,
): Promise<void> {
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);
  if (storageErr) throw storageErr;

  const { error } = await supabase.from("room_files").delete().eq("id", row.id);
  if (error) throw error;
}
