/**
 * PartyKit 방(Party) 서버: WebSocket으로 들어오는 연결마다 Yjs 동기화를 붙입니다.
 *
 * - `onConnect`는 y-partykit이 제공하는 헬퍼로, Yjs 바이너리 프로토콜을 처리합니다.
 * - `persist: { mode: "snapshot" }`는 PartyKit 스토리지에 스냅샷을 남겨, 같은 방에 재입장 시
 *   서버 측에서도 문맥을 유지하기 쉽게 합니다(장기 저장의 단일 소스는 Supabase 스냅샷이 아님을 유의).
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
      gc: true,
    });
  }
}

YjsPartyServer satisfies Party.Worker;
