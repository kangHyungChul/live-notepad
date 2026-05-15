import { Link } from "react-router-dom";
import type { RoomListItem } from "../lib/roomsRepo";
import { formatRoomDate } from "../lib/formatRoomDate";

type RoomListSectionProps = {
  rooms: RoomListItem[];
  loading: boolean;
  deletingSlug: string | null;
  onRefresh: () => void;
  onDelete: (slug: string, title: string) => void;
};

/**
 * 홈 화면 — DB에 등록된 방 목록, 입장 링크, 삭제 버튼.
 */
export function RoomListSection({
  rooms,
  loading,
  deletingSlug,
  onRefresh,
  onDelete,
}: RoomListSectionProps) {
  return (
    <section className="card">
      <div className="room-list__header">
        <h2>방 목록</h2>
        <button
          type="button"
          className="btn ghost small-btn"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {loading && rooms.length === 0 ? (
        <p className="muted">목록을 불러오는 중…</p>
      ) : rooms.length === 0 ? (
        <p className="muted">
          아직 등록된 방이 없습니다. 「새 메모장 만들기」로 첫 방을 만들어 보세요.
        </p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => (
            <li key={room.slug} className="room-list__item">
              <div className="room-list__meta">
                <Link className="room-list__title" to={`/room/${room.slug}`}>
                  {room.title.trim() || "제목 없음"}
                </Link>
                <span className="room-list__slug muted small">{room.slug}</span>
                <span className="room-list__date muted small">
                  수정 {formatRoomDate(room.updated_at)}
                </span>
              </div>
              <div className="room-list__actions">
                <Link className="btn" to={`/room/${room.slug}`}>
                  입장
                </Link>
                <button
                  type="button"
                  className="btn danger"
                  disabled={deletingSlug === room.slug}
                  onClick={() => onDelete(room.slug, room.title)}
                >
                  {deletingSlug === room.slug ? "삭제 중…" : "삭제"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small room-list__hint">
        지금은 누구나 방을 삭제할 수 있습니다. 추후 방 만든 사람·관리자만 삭제하도록
        제한할 예정입니다.
      </p>
    </section>
  );
}
