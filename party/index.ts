/**
 * PartyKit 방(Party) 서버: WebSocket으로 들어오는 연결마다 Yjs 동기화를 붙입니다.
 *
 * - `onConnect`는 y-partykit이 제공하는 헬퍼로, Yjs 바이너리 프로토콜을 처리합니다.
 * - `persist: { mode: "snapshot" }`는 PartyKit 스토리지에 스냅샷을 남깁니다. 이때는 `gc: false`가 필요합니다(y-partykit 제약).
 * - Supabase에서 문서를 불러오는 `load()`는 서버에 Supabase 시크릿이 필요하므로,
 *   1단계 MVP에서는 클라이언트가 DB 스냅샷을 먼저 적용한 뒤 연결하는 방식으로 둡니다.
 */
import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

export default class YjsPartyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // room.id: URL의 방 식별자(프론트의 `slug`와 동일하게 사용)
    return onConnect(conn, this.room, {
      // PartyKit 호스팅 측 스냅샷(개발/소규모 협업용). DB 영속화와는 별개 레이어입니다.
      persist: { mode: "snapshot" },
      // persist 사용 시 Yjs GC는 끄는 것이 y-partykit 요구사항입니다. (둘 다 켜면 연결 오류)
      gc: false,
    });
  }
}

YjsPartyServer satisfies Party.Worker;
