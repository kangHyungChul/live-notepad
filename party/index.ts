/**
 * PartyKit 방(Party) 서버: WebSocket으로 들어오는 연결마다 Yjs 동기화를 붙입니다.
 *
 * 중요: `onMessage` 를 선언하면 PartyKit ModuleWorker 가 hibernation 모드가 되어
 * 메시지가 `webSocketMessage` → 빈 onMessage 로만 가고, y-partykit 이 onConnect 에
 * 등록한 addEventListener("message") 로는 바이너리가 전달되지 않습니다.
 * → onConnect 만 두고 onMessage 는 선언하지 않습니다.
 */
import type * as Party from "partykit/server";
import { onConnect as yPartyKitOnConnect } from "y-partykit";

const server = {
  async onConnect(conn: Party.Connection, room: Party.Room) {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "A",
        location: "party/index.ts:onConnect",
        message: "y-partykit onConnect start",
        data: { roomId: room.id, connId: conn.id },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    await yPartyKitOnConnect(conn, room, {
      persist: false,
      gc: true,
    });
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "A",
        location: "party/index.ts:onConnect",
        message: "y-partykit onConnect done",
        data: { roomId: room.id },
        timestamp: Date.now(),
      }),
    );
    // #endregion
  },

  onRequest(_req: Party.Request, room: Party.Room) {
    return new Response(`live-notepad party ok (room: ${room.id})`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
} satisfies Party.Worker;

export default server;
