import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canPreviewRoomFile,
  formatBytes,
  MAX_ROOM_STORAGE_BYTES,
} from "../lib/filePolicy";
import {
  computeRoomStorageUsageFromFiles,
  deleteRoomFile,
  downloadRoomFile,
  listRoomFiles,
  type RoomFileRow,
  uploadRoomFile,
} from "../lib/roomFilesRepo";
import {
  mergePendingUploads,
  useRoomFileUploadBroadcast,
  type PendingUploadView,
} from "../hooks/useRoomFileUploadBroadcast";
import {
  applyRoomFilesRealtimeChange,
  useRoomFilesRealtime,
} from "../hooks/useRoomFilesRealtime";

type ActiveUpload = {
  id: string;
  name: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

import { RoomFileIconTile } from "./RoomFileIconTile";
import { RoomFilePreview } from "./RoomFilePreview";

type Props = {
  roomSlug: string;
  supabase: SupabaseClient;
  /** 다른 참가자에게 업로드 중 표시에 쓰는 이름 */
  localGuestLabel: string;
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
export function RoomFilePanel({ roomSlug, supabase, localGuestLabel }: Props) {
  const clientIdRef = useRef(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<RoomFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<RoomFileRow | null>(null);

  const { remotePending, broadcast } = useRoomFileUploadBroadcast(
    supabase,
    roomSlug,
    clientIdRef.current,
    localGuestLabel,
  );

  const localPending: PendingUploadView[] = activeUploads.map((u) => ({
    uploadId: u.id,
    fileName: u.name,
    percent: u.percent,
    by: localGuestLabel,
    isLocal: true,
    status: u.status,
    error: u.error,
    updatedAt: Date.now(),
  }));

  const pendingUploads = mergePendingUploads(localPending, remotePending);
  const showList = loading || files.length > 0 || pendingUploads.length > 0;

  /** 용량은 files 목록 합계만 사용 — 삭제·Realtime 이중 차감 방지 */
  const usage = useMemo(() => computeRoomStorageUsageFromFiles(files), [files]);

  const lastBroadcastPercentRef = useRef<Map<string, number>>(new Map());

  const emitUploadBroadcast = (
    uploadId: string,
    fileName: string,
    percent: number,
    phase: "start" | "progress" | "done" | "error",
    error?: string,
  ) => {
    if (phase === "progress") {
      const last = lastBroadcastPercentRef.current.get(uploadId) ?? -1;
      if (percent - last < 5 && percent < 100) return;
      lastBroadcastPercentRef.current.set(uploadId, percent);
    }
    if (phase === "done" || phase === "error") {
      lastBroadcastPercentRef.current.delete(uploadId);
    }
    broadcast({ uploadId, fileName, percent, phase, error });
  };

  const refresh = useCallback(async (purgeExpired = false) => {
    setErr(null);
    try {
      const rows = await listRoomFiles(supabase, roomSlug, { purgeExpired });
      setFiles(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, roomSlug]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  // Realtime: 즉시 목록 반영 + 주기적 폴백(구독 끊김·마이그레이션 미적용 대비)
  useRoomFilesRealtime(supabase, roomSlug, {
    onChange: (change) => {
      applyRoomFilesRealtimeChange(
        change,
        roomSlug,
        setFiles,
        setPreviewRow,
      );
    },
    onSyncIssue: () => {
      void refresh(false);
    },
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh(false);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
      emitUploadBroadcast(uploadId, file.name, 0, "start");

      try {
        await uploadRoomFile(supabase, roomSlug, file, {
          onProgress: (p) => {
            setActiveUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, percent: p.percent } : u,
              ),
            );
            emitUploadBroadcast(uploadId, file.name, p.percent, "progress");
          },
        });
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, percent: 100, status: "done" } : u,
          ),
        );
        emitUploadBroadcast(uploadId, file.name, 100, "done");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: "error", error: msg } : u,
          ),
        );
        emitUploadBroadcast(uploadId, file.name, 0, "error", msg);
        setErr(msg);
      }
    }

    await refresh(false);
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
      setPreviewRow((prev) => (prev?.id === row.id ? null : prev));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const usedLabel = `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.limitBytes)}`;

  const usagePercent =
    usage.limitBytes > 0
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

      {err && <p className="banner error room-files__err">{err}</p>}

      {!showList ? (
        <p className="muted small room-files__empty">업로드된 파일이 없습니다.</p>
      ) : (
        <div className="room-files__browser">
          {pendingUploads.length > 0 && (
            <ul className="room-files__pending-list" aria-live="polite">
              {pendingUploads.map((u) => (
                <li key={`pending-${u.uploadId}`} className="room-files__pending-item">
                  <span className="room-files__icon-shape room-files__icon-shape--document room-files__icon-shape--pending">
                    <span className="room-files__icon-fold" />
                    <span className="room-files__icon-ext">…</span>
                  </span>
                  <div className="room-files__pending-meta">
                    <span className="room-files__pending-name" title={u.fileName}>
                      {u.fileName}
                    </span>
                    <span className="room-files__status-badge room-files__status-badge--uploading">
                      {u.status === "uploading" && "업로드 중"}
                      {u.status === "done" && "완료"}
                      {u.status === "error" && "실패"}
                    </span>
                    <span className="muted small">
                      {!u.isLocal && u.status === "uploading" && `${u.by} · `}
                      {u.status === "uploading" && `${u.percent}%`}
                      {u.status === "error" && (u.error ?? "실패")}
                    </span>
                    {u.status === "uploading" && (
                      <div
                        className="room-files__progress room-files__progress--inline"
                        role="progressbar"
                        aria-valuenow={u.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="room-files__progress-bar room-files__progress-bar--uploading"
                          style={{ width: `${u.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {loading && files.length === 0 ? (
            <p className="muted small room-files__empty">파일 목록 불러오는 중…</p>
          ) : files.length > 0 ? (
            <div className="room-files__icon-grid" role="list">
              {files.map((row) => (
                <RoomFileIconTile
                  key={row.id}
                  row={row}
                  showPreview={canPreviewRoomFile(
                    row.mime_type,
                    row.original_name,
                    row.size_bytes,
                  )}
                  deleting={deletingId === row.id}
                  formatDate={formatFileDate}
                  onPreview={() => setPreviewRow(row)}
                  onDownload={() => void onDownload(row)}
                  onDelete={() => void onDelete(row)}
                />
              ))}
            </div>
          ) : null}
        </div>
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
