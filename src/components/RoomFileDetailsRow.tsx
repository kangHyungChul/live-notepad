import {
  formatBytes,
  getFileIconKind,
  getFileIconLabel,
  getFileTypeLabel,
} from "../lib/filePolicy";
import type { RoomFileRow } from "../lib/roomFilesRepo";

type Props = {
  row: RoomFileRow;
  showPreview: boolean;
  deleting: boolean;
  formatDate: (iso: string) => string;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

/**
 * Windows 탐색기 「자세히」 보기 한 행.
 * 더블클릭: 미리보기 가능하면 미리보기, 아니면 다운로드.
 */
export function RoomFileDetailsRow({
  row,
  showPreview,
  deleting,
  formatDate,
  onPreview,
  onDownload,
  onDelete,
}: Props) {
  const kind = getFileIconKind(row.mime_type, row.original_name);
  const extLabel = getFileIconLabel(row.original_name);
  const typeLabel = getFileTypeLabel(row.mime_type, row.original_name);

  const onOpen = () => {
    if (showPreview) onPreview();
    else void onDownload();
  };

  return (
    <tr
      className="room-files__details-row"
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <td className="room-files__cell room-files__cell--name">
        <span className="room-files__name-cell">
          <span
            className={`room-files__icon-shape room-files__icon-shape--compact room-files__icon-shape--${kind}`}
            aria-hidden
          >
            <span className="room-files__icon-fold" />
            <span className="room-files__icon-ext">{extLabel}</span>
          </span>
          <button
            type="button"
            className="room-files__details-name room-files__name-link"
            title={`${row.original_name} 다운로드`}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            {row.original_name}
          </button>
        </span>
      </td>
      <td
        className="room-files__cell room-files__cell--period"
        title={`${row.created_at} ~ ${row.expires_at}`}
      >
        {formatDate(row.created_at)}
        <span className="room-files__period-sep"> ~ </span>
        {formatDate(row.expires_at)}
      </td>
      <td className="room-files__cell room-files__cell--type">{typeLabel}</td>
      <td className="room-files__cell room-files__cell--size">{formatBytes(row.size_bytes)}</td>
      <td className="room-files__cell room-files__cell--actions">
        <div className="room-files__row-actions">
          {showPreview && (
            <button
              type="button"
              className="btn small-btn room-files__icon-btn"
              title="미리보기"
              aria-label="미리보기"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
            >
              <svg
                className="room-files__action-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path
                  d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="8" r="2" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="btn small-btn room-files__icon-btn"
            title="다운로드"
            aria-label="다운로드"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn small-btn danger room-files__icon-btn"
            title="삭제"
            aria-label="삭제"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {deleting ? (
              "…"
            ) : (
              <svg
                className="room-files__action-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M2.5 4.5h11" strokeLinecap="round" />
                <path d="M6 4.5V3.25h4V4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 4.5l.75 8.25h6.5L12 4.5" strokeLinejoin="round" />
                <path d="M6.5 7v4.25" strokeLinecap="round" />
                <path d="M9.5 7v4.25" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
