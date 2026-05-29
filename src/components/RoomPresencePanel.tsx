import type YPartyKitProvider from "y-partykit/provider";
import { useRoomPresence } from "../hooks/useRoomPresence";

type RoomPresencePanelProps = {
  provider: YPartyKitProvider;
};

/**
 * 툴바용 접속자 목록 — awareness 기반으로 실시간 갱신됩니다.
 */
export function RoomPresencePanel({ provider }: RoomPresencePanelProps) {
  const peers = useRoomPresence(provider);
  const count = peers.length;

  return (
    <div className="room-presence" title="현재 이 방에 접속한 탭·브라우저">
      <span className="room-presence__count" aria-live="polite">
        접속 {count}명
      </span>
      <ul className="room-presence__list" aria-label="접속자 목록">
        {peers.map((peer) => (
          <li
            key={peer.clientId}
            className={`room-presence__chip${peer.isSelf ? " room-presence__chip--self" : ""}`}
          >
            <span
              className="room-presence__dot"
              style={{ backgroundColor: peer.color }}
              aria-hidden
            />
            <span className="room-presence__name">
              {peer.name}
              {peer.isSelf ? " (나)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
