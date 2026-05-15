/**
 * PartyKit 방(Party) 서버: WebSocket으로 들어오는 연결마다 Yjs 동기화를 붙입니다.
 *
 * - y-partykit `onConnect` 가 conn 에 Yjs 메시지 리스너를 등록합니다.
 * - `export default class` 만 쓰면 PartyKit ClassWorker 가 메시지마다 `onMessage` 를
 *   호출하려 하는데, 핸들러가 없으면 바이너리 동기화가 깨질 수 있습니다.
 *   → 모듈 Worker + 빈 `onMessage` 로 PartyKit 기본 메시지 경로를 안전하게 둡니다.
 * - 장기 저장은 Supabase `rooms.y_snapshot` (클라이언트 주기 upsert).
 */
import type * as Party from "partykit/server";
import { onConnect as yPartyKitOnConnect } from "y-partykit";

const server = {
  async onConnect(conn: Party.Connection, room: Party.Room) {
    await yPartyKitOnConnect(conn, room, {
      persist: false,
      gc: true,
    });
  },

  onRequest(_req: Party.Request, room: Party.Room) {
    return new Response(`live-notepad party ok (room: ${room.id})`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  /**
   * PartyKit ModuleWorker 는 `onMessage` 가 있으면 hibernation 경로를 씁니다.
   * Yjs 바이너리는 `onConnect` 에서 등록한 리스너가 처리하므로 여기서는 비워 둡니다.
   */
  onMessage() {},
} satisfies Party.Worker;

export default server;
