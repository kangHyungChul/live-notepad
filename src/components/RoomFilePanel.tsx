import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canPreviewRoomFile,
  formatBytes,
  MAX_ROOM_STORAGE_BYTES,
} from "../lib/filePolicy";
import {
  deleteRoomFile,
  downloadRoomFile,
  getRoomStorageUsage,
  listRoomFiles,
  type RoomFileRow,
  type RoomStorageUsage,
  uploadRoomFile,
} from "../lib/roomFilesRepo";
import { useRoomFilesRealtime } from "../hooks/useRoomFilesRealtime";
import { RoomFilePreview } from "./RoomFilePreview";

type ActiveUpload = {
  id: string;
  name: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  roomSlug: string;
  supabase: SupabaseClient;
};

/** ISO 날짜를 목록에 표시할 로컬 문자열로 변환 */
function formatFileDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 방별 파일 패널: 드래그앤드롭 업로드, 진행률, 용량 표시, 미리보기, 다운로드, 삭제.
 */
export function RoomFilePanel({ roomSlug, supabase }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<RoomFileRow[]>([]);
  const [usage, setUsage] = useState<RoomStorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<RoomFileRow | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [rows, storage] = await Promise.all([
        listRoomFiles(supabase, roomSlug),
        getRoomStorageUsage(supabase, roomSlug),
      ]);
      setFiles(rows);
      setUsage(storage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, roomSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 다른 탭·사용자가 업로드/삭제하면 목록을 다시 불러옵니다.
  useRoomFilesRealtime(supabase, roomSlug, refresh);

  const processFiles = async (fileList: FileList | File[]) => {
    const items = Array.from(fileList);
    if (items.length === 0) return;

    setErr(null);
    for (const file of items) {
      const uploadId = crypto.randomUUID();
      setActiveUploads((prev) => [
        ...prev,
        { id: uploadId, name: file.name, percent: 0, status: "uploading" },
      ]);

      try {
        await uploadRoomFile(supabase, roomSlug, file, {
          onProgress: (p) => {
            setActiveUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, percent: p.percent } : u,
              ),
            );
          },
        });
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, percent: 100, status: "done" } : u,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: "error", error: msg } : u,
          ),
        );
        setErr(msg);
      }
    }

    await refresh();
    window.setTimeout(() => {
      setActiveUploads((prev) => prev.filter((u) => u.status === "uploading"));
    }, 2500);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      void processFiles(e.dataTransfer.files);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const onPickFiles = () => inputRef.current?.click();

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const onDownload = async (row: RoomFileRow) => {
    setErr(null);
    try {
      await downloadRoomFile(supabase, row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (row: RoomFileRow) => {
    const ok = window.confirm(`「${row.original_name}」 파일을 삭제할까요?`);
    if (!ok) return;
    setDeletingId(row.id);
    setErr(null);
    try {
      await deleteRoomFile(supabase, row);
      setFiles((prev) => prev.filter((f) => f.id !== row.id));
      setUsage((prev) =>
        prev
          ? {
              ...prev,
              usedBytes: Math.max(0, prev.usedBytes - row.size_bytes),
            }
          : prev,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const usedLabel = usage
    ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.limitBytes)}`
    : `${formatBytes(0)} / ${formatBytes(MAX_ROOM_STORAGE_BYTES)}`;

  const usagePercent =
    usage && usage.limitBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100))
      : 0;

  return (
    <section className="card room-files">
      <div className="room-files__header">
        <h2>방 파일</h2>
        <p className="muted small">
          방당 {formatBytes(MAX_ROOM_STORAGE_BYTES)}, 파일당 최대 50MB · 업로드 후 3일 자동 삭제
          · zip·py 등 일반 파일 허용, 실행·HTML 등은 차단
        </p>
        <p className="room-files__quota muted small">
          저장 사용량: <strong>{usedLabel}</strong> ({usagePercent}%)
        </p>
        <div
          className="room-files__quota-bar"
          role="progressbar"
          aria-valuenow={usagePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="방 저장 용량"
        >
          <div
            className="room-files__quota-bar-fill"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>

      <div
        className={`room-files__dropzone${dragOver ? " room-files__dropzone--active" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPickFiles();
          }
        }}
        onClick={onPickFiles}
        aria-label="파일을 드래그하거나 클릭하여 업로드"
      >
        <p className="room-files__dropzone-title">파일을 여기에 놓거나 클릭하세요</p>
        <p className="muted small">여러 파일 동시 업로드 가능</p>
        <input
          ref={inputRef}
          type="file"
          className="room-files__input"
          multiple
          onChange={onInputChange}
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {activeUploads.length > 0 && (
        <ul className="room-files__uploads" aria-live="polite">
          {activeUploads.map((u) => (
            <li key={u.id} className="room-files__upload-item">
              <div className="room-files__upload-meta">
                <span className="room-files__upload-name">{u.name}</span>
                <span className="muted small">
                  {u.status === "uploading" && `${u.percent}%`}
                  {u.status === "done" && "완료"}
                  {u.status === "error" && (u.error ?? "실패")}
                </span>
              </div>
              <div
                className="room-files__progress"
                role="progressbar"
                aria-valuenow={u.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`room-files__progress-bar room-files__progress-bar--${u.status}`}
                  style={{ width: `${u.status === "error" ? 100 : u.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {err && <p className="banner error room-files__err">{err}</p>}

      {loading ? (
        <p className="muted small">파일 목록 불러오는 중…</p>
      ) : files.length === 0 ? (
        <p className="muted small room-files__empty">업로드된 파일이 없습니다.</p>
      ) : (
        <ul className="room-files__list">
          {files.map((row) => {
            const showPreview = canPreviewRoomFile(
              row.mime_type,
              row.original_name,
              row.size_bytes,
            );
            return (
              <li key={row.id} className="room-files__item">
                <div className="room-files__item-meta">
                  <span className="room-files__item-name" title={row.original_name}>
                    {row.original_name}
                  </span>
                  <span className="muted small">
                    {formatBytes(row.size_bytes)}
                  </span>
                  <span className="muted small room-files__dates">
                    업로드 {formatFileDate(row.created_at)} · 만료{" "}
                    {formatFileDate(row.expires_at)}
                  </span>
                </div>
                <div className="room-files__item-actions">
                  {showPreview && (
                    <button
                      type="button"
                      className="btn small-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewRow(row);
                      }}
                    >
                      미리보기
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn small-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDownload(row);
                    }}
                  >
                    다운로드
                  </button>
                  <button
                    type="button"
                    className="btn small-btn danger"
                    disabled={deletingId === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDelete(row);
                    }}
                  >
                    {deletingId === row.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewRow && (
        <RoomFilePreview
          supabase={supabase}
          row={previewRow}
          onClose={() => setPreviewRow(null)}
        />
      )}
    </section>
  );
}
