import {
  formatBytes,
  getFileIconKind,
  getFileIconLabel,
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
 * Windows 탐색기 「큰 아이콘」 스타일 파일 타일.
 * 더블클릭: 미리보기 가능하면 미리보기, 아니면 다운로드.
 */
export function RoomFileIconTile({
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
  const tooltip =
    `${row.original_name}\n` +
    `${formatBytes(row.size_bytes)} · 업로드 ${formatDate(row.created_at)}\n` +
    `만료 ${formatDate(row.expires_at)}`;

  const onOpen = () => {
    if (showPreview) onPreview();
    else void onDownload();
  };

  return (
    <div
      className="room-files__tile"
      title={tooltip}
      onDoubleClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <div className={`room-files__icon-shape room-files__icon-shape--${kind}`} aria-hidden>
        <span className="room-files__icon-fold" />
        <span className="room-files__icon-ext">{extLabel}</span>
      </div>

      <p className="room-files__tile-name">{row.original_name}</p>
      <p className="room-files__tile-meta muted small">{formatBytes(row.size_bytes)}</p>

      <div className="room-files__tile-actions">
        {showPreview && (
          <button
            type="button"
            className="btn small-btn"
            title="미리보기"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            보기
          </button>
        )}
        <button
          type="button"
          className="btn small-btn"
          title="다운로드"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn small-btn danger"
          title="삭제"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          {deleting ? "…" : "×"}
        </button>
      </div>
    </div>
  );
}
