import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canPreviewRoomFile } from "../lib/filePolicy";
import { getRoomFileSignedUrl, type RoomFileRow } from "../lib/roomFilesRepo";

type Props = {
  supabase: SupabaseClient;
  row: RoomFileRow;
  onClose: () => void;
};

/**
 * 이미지·PDF 미리보기 모달.
 * 서명 URL 은 모달이 닫힐 때 상태만 비우며, 브라우저 캐시는 짧은 만료로 자연 만료됩니다.
 */
export function RoomFilePreview({ supabase, row, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const previewable = canPreviewRoomFile(row.mime_type, row.original_name, row.size_bytes);
  const isPdf =
    row.mime_type.toLowerCase() === "application/pdf" ||
    row.original_name.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    if (!previewable) {
      setLoading(false);
      setErr("미리보기를 지원하지 않는 파일입니다.");
      return;
    }

    let cancelled = false;
    void getRoomFileSignedUrl(supabase, row)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, row, previewable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="room-files-preview__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${row.original_name} 미리보기`}
      onClick={onClose}
    >
      <div
        className="room-files-preview__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="room-files-preview__header">
          <h3 className="room-files-preview__title">{row.original_name}</h3>
          <button type="button" className="btn ghost small-btn" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="room-files-preview__body">
          {loading && <p className="muted">미리보기 불러오는 중…</p>}
          {err && <p className="banner error">{err}</p>}
          {!loading && !err && url && (
            <>
              {isPdf ? (
                <iframe
                  className="room-files-preview__iframe"
                  src={url}
                  title={row.original_name}
                />
              ) : (
                <img
                  className="room-files-preview__img"
                  src={url}
                  alt={row.original_name}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
