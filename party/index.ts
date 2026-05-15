/**
 * PartyKit + y-partykit 서버.
 *
 * 로컬 partykit dev: onConnect 리스너만으로도 동기화됨.
 * Cloudflare 배포: 메시지가 worker.onMessage 로만 오는 경우가 있어
 * routeYjsMessage 로 Yjs 프로토콜을 직접 처리합니다.
 */
import type * as Party from "partykit/server";
import { onConnect as yPartyKitOnConnect } from "y-partykit";
import { routeYjsMessage } from "./routeYjsMessage";

const Y_OPTS = { persist: false, gc: true } as const;

export default class LiveNotepadParty implements Party.Server {
  /** true → 배포 환경에서 webSocketMessage → onMessage 경로 사용 */
  readonly options = { hibernate: true };

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "H",
        location: "party/index.ts:onConnect",
        message: "onConnect",
        data: { roomId: this.room.id, connId: conn.id },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    await yPartyKitOnConnect(conn, this.room, Y_OPTS);
  }

  async onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    conn: Party.Connection,
  ) {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "H",
        location: "party/index.ts:onMessage",
        message: "routeYjsMessage",
        data: {
          roomId: this.room.id,
          type: typeof message,
          byteLength:
            typeof message === "string"
              ? message.length
              : message instanceof ArrayBuffer
                ? message.byteLength
                : message.byteLength,
        },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    await routeYjsMessage(this.room, conn, message, Y_OPTS);
  }

  onRequest() {
    return new Response(`live-notepad party ok (room: ${this.room.id})`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
