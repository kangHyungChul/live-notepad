import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStorageObjectFileName,
  formatBytes,
  MAX_ROOM_STORAGE_BYTES,
  validateUploadFile,
} from "./filePolicy";
import { throwIfSupabaseError } from "./supabaseErrors";

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

/** 사용자가 업로드 중지한 경우 — UI 에서 일반 오류와 구분 */
export class UploadCancelledError extends Error {
  constructor() {
    super("업로드가 취소되었습니다.");
    this.name = "UploadCancelledError";
  }
}

export function isUploadCancelledError(err: unknown): boolean {
  return err instanceof UploadCancelledError;
}

export type RoomStorageUsage = {
  usedBytes: number;
  limitBytes: number;
};

/** 목록에 있는 파일 크기 합으로 방 사용량 계산 (표시용 단일 출처) */
export function computeRoomStorageUsageFromFiles(files: RoomFileRow[]): RoomStorageUsage {
  const usedBytes = files.reduce((sum, row) => sum + Number(row.size_bytes), 0);
  return { usedBytes, limitBytes: MAX_ROOM_STORAGE_BYTES };
}

/** Supabase Storage API 로 객체를 일괄 삭제 (100개씩 분할) */
async function removeStoragePaths(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) {
      // 객체가 이미 없을 수 있음 — DB 메타 정리는 이어서 진행
      console.warn("[room-files] Storage 일괄 삭제 일부 실패:", error.message);
    }
  }
}

/**
 * 만료된 파일: Storage API 로 객체 삭제 후 room_files 메타 삭제.
 * (DB 트리거·cron 은 storage.objects 직접 DELETE 가 불가하므로 클라이언트에서 처리)
 */
export async function purgeExpiredRoomFiles(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("room_files")
    .select("*")
    .lt("expires_at", new Date().toISOString());
  throwIfSupabaseError(error);

  const rows = (data ?? []) as RoomFileRow[];
  if (rows.length === 0) return;

  await removeStoragePaths(
    supabase,
    rows.map((row) => row.storage_path),
  );

  const { error: delErr } = await supabase
    .from("room_files")
    .delete()
    .in(
      "id",
      rows.map((row) => row.id),
    );
  throwIfSupabaseError(delErr);
}

/**
 * 방 삭제 전: 해당 방의 모든 파일을 Storage API + room_files 에서 제거합니다.
 */
export async function deleteAllRoomFilesForRoom(
  supabase: SupabaseClient,
  roomSlug: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("room_files")
    .select("*")
    .eq("room_slug", roomSlug);
  throwIfSupabaseError(error);

  const rows = (data ?? []) as RoomFileRow[];
  if (rows.length === 0) return;

  await removeStoragePaths(
    supabase,
    rows.map((row) => row.storage_path),
  );

  const { error: delErr } = await supabase
    .from("room_files")
    .delete()
    .eq("room_slug", roomSlug);
  throwIfSupabaseError(delErr);
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
  options?: { purgeExpired?: boolean },
): Promise<RoomFileRow[]> {
  if (options?.purgeExpired !== false) {
    await purgeExpiredRoomFiles(supabase);
  }
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
 * 중지·실패 시 Storage 객체 + DB 메타(있으면) 제거 (재시도 포함).
 */
async function cleanupRoomFileUpload(
  supabase: SupabaseClient,
  fileId: string,
  storagePath: string,
  maxAttempts = 3,
): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await supabase.from("room_files").delete().eq("id", fileId);
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (!error) return;
    if (attempt < maxAttempts - 1) {
      await delay(350 * (attempt + 1));
    } else {
      console.warn("[room-files] 업로드 정리 중 Storage 삭제 실패:", error.message);
    }
  }
}

/** signal 이 abort 되면 UploadCancelledError 로 거부하는 Promise 래퍼 */
function rejectOnAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(new UploadCancelledError());

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new UploadCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/** await 사이에도 중지 신호를 확인 (용량 조회 등) */
async function awaitWithAbort<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const result = await rejectOnAbort(promise, signal);
  if (signal?.aborted) throw new UploadCancelledError();
  return result;
}

/**
 * XMLHttpRequest 로 Storage REST API 업로드 — 진행률·중지(AbortSignal) 지원.
 */
function uploadToStorageWithProgress(
  supabaseUrl: string,
  anonKey: string,
  storagePath: string,
  file: File,
  options?: {
    onProgress?: (p: UploadProgress) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const encodedPath = storagePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodedPath}`;
  const signal = options?.signal;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    const detach = () => signal?.removeEventListener("abort", onSignalAbort);
    const onSignalAbort = () => xhr.abort();
    signal?.addEventListener("abort", onSignalAbort);

    xhr.upload.onprogress = (ev) => {
      if (signal?.aborted) return;
      if (!options?.onProgress || !ev.lengthComputable) return;
      const percent = ev.total > 0 ? Math.round((ev.loaded / ev.total) * 100) : 0;
      options.onProgress({ loaded: ev.loaded, total: ev.total, percent });
    };

    xhr.onload = () => {
      detach();
      if (signal?.aborted) {
        reject(new UploadCancelledError());
        return;
      }
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

    xhr.onerror = () => {
      detach();
      reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    };
    xhr.onabort = () => {
      detach();
      reject(new UploadCancelledError());
    };
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
    /** 중지 시 xhr.abort + Storage/DB 정리 */
    signal?: AbortSignal;
  },
): Promise<RoomFileRow> {
  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new UploadCancelledError();
  };

  const policy = validateUploadFile(file);
  if (policy.ok === false) {
    throw new Error(policy.reason);
  }

  throwIfAborted();

  const { usedBytes, limitBytes } = await awaitWithAbort(
    getRoomStorageUsage(supabase, roomSlug),
    signal,
  );
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

  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(roomSlug, fileId, file.name);
  const mime = file.type || "application/octet-stream";
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  try {
    throwIfAborted();

    await uploadToStorageWithProgress(supabaseUrl, anonKey, storagePath, file, {
      onProgress: options?.onProgress,
      signal,
    });

    throwIfAborted();

    const { data, error } = await awaitWithAbort(
      supabase
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
        .single(),
      signal,
    );

    if (error) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      if (error.message.includes("ROOM_STORAGE_LIMIT_EXCEEDED")) {
        throw new Error(
          `방 저장 용량 한도(${formatBytes(MAX_ROOM_STORAGE_BYTES)})를 초과했습니다.`,
        );
      }
      throw error;
    }

    throwIfAborted();
    return data as RoomFileRow;
  } catch (e) {
    // 명시적 취소만 취소로 처리 — 용량 초과·네트워크 오류 등은 그대로 전파
    if (isUploadCancelledError(e)) {
      await cleanupRoomFileUpload(supabase, fileId, storagePath);
      // insert 요청이 늦게 완료되는 레이스 — 잠시 후 한 번 더 정리
      window.setTimeout(() => {
        void cleanupRoomFileUpload(supabase, fileId, storagePath);
      }, 1_500);
      throw new UploadCancelledError();
    }
    throw e;
  }
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

/** 브라우저 저장용 파일명 — 경로 구분자·제어문자 제거 */
function sanitizeDownloadFileName(originalName: string): string {
  const base = originalName.trim().split(/[/\\]/).pop() ?? "download";
  const cleaned = [...base]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 ? "_" : ch;
    })
    .join("");
  return cleaned.length > 0 ? cleaned : "download";
}

/**
 * Storage 에서 Blob 으로 받아 로컬에 저장합니다.
 * 서명 URL + `<a download>` 는 cross-origin 이라 파일명이 storage 키(uuid.ext)로 떨어질 수 있어
 * same-origin blob URL 로 original_name 을 유지합니다.
 */
export async function downloadRoomFile(
  supabase: SupabaseClient,
  row: RoomFileRow,
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(row.storage_path);
  if (error) throw error;
  if (!data) throw new Error("파일을 받을 수 없습니다.");

  const fileName = sanitizeDownloadFileName(row.original_name);
  const blobUrl = URL.createObjectURL(data);

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * 메타 행 삭제 후 Storage 객체 삭제.
 * DB 먼저 삭제해야 Realtime DELETE 가 다른 클라이언트에 즉시 전파됩니다.
 */
export async function deleteRoomFile(
  supabase: SupabaseClient,
  row: RoomFileRow,
): Promise<void> {
  const { error } = await supabase.from("room_files").delete().eq("id", row.id);
  if (error) throw error;

  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);
  if (storageErr) {
    console.warn("[room-files] Storage 객체 삭제 실패(메타는 이미 삭제됨):", storageErr.message);
  }
}
