import { Link } from "react-router-dom";

type Props = {
  slug: string;
};

/**
 * DB에 등록되지 않은 slug 로 /room/:slug 에 직접 접근했을 때 표시합니다.
 * 방 생성은 홈의 「새 메모장 만들기」로만 가능합니다.
 */
export function RoomNotFoundPage({ slug }: Props) {
  return (
    <div className="page room-not-found">
      <h1>방을 찾을 수 없습니다</h1>
      <p>
        코드 <code>{slug}</code>에 해당하는 메모장이 없습니다.
      </p>
      <p className="muted">
        새 메모장은 홈 화면의 「새 메모장 만들기」로만 만들 수 있습니다. 기존 방은 목록이나
        공유 링크·방 코드로 입장하세요.
      </p>
      <Link className="btn primary" to="/">
        홈으로
      </Link>
    </div>
  );
}
