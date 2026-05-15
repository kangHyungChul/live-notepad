/**
 * PartyKit 방(Party) 서버: WebSocket으로 들어오는 연결마다 Yjs 동기화를 붙입니다.
 *
 * - `onConnect`는 y-partykit이 제공하는 헬퍼로, Yjs 바이너리 프로토콜을 처리합니다.
 * - 장기 저장은 Supabase `rooms.y_snapshot` (클라이언트가 주기적으로 upsert).
 * - PartyKit persist 는 끄고, 연결 중인 클라이언트끼리만 실시간 동기화합니다.
 * - Supabase에서 문서를 불러오는 `load()`는 서버에 Supabase 시크릿이 필요하므로,
 *   1단계 MVP에서는 클라이언트가 DB 스냅샷을 먼저 적용한 뒤 연결하는 방식으로 둡니다.
 */
import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

export default class YjsPartyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  /** 브라우저에서 `https://호스트/parties/main/아무slug` 로 PartyKit 배포·DNS 확인용 */
  onRequest() {
    return new Response(`live-notepad party ok (room: ${this.room.id})`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  async onConnect(conn: Party.Connection) {
    // room.id: URL의 방 식별자(프론트의 `slug`와 동일하게 사용)
    // persist 로 스토리지에서 Y.Doc 을 복원할 때까지 기다린 뒤 sync step 1 을 보냅니다.
    // 실시간 동기화는 메모리(연결된 클라이언트) 기준. 장기 저장은 Supabase 스냅샷이 담당합니다.
    // persist snapshot 은 연결 전 클라이언트별 로컬 상태와 충돌해 sync 가 깨질 수 있어 끕니다.
    await onConnect(conn, this.room, {
      persist: false,
      gc: true,
    });
  }
}

YjsPartyServer satisfies Party.Worker;
