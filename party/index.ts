/**
 * PartyKit 방(Party) 서버 — Yjs 실시간 동기화.
 *
 * 배포(Cloudflare Durable Objects) vs 로컬 `partykit dev` 차이:
 * - 모듈 Worker 에 `onMessage` 가 없으면 PartyKit 이 `invokeOnMessage` 호출 시 예외가 나고
 *   프로덕션에서 WebSocket 이 끊길 수 있습니다.
 * - 모듈 Worker 에 빈 `onMessage` 만 넣으면 hibernation 모드가 켜져 Yjs 가 막힙니다.
 *
 * → Class Worker + `options.hibernate: false` + noop `onMessage` 가
 *   프로덕션·로컬 모두에서 y-partykit 리스너와 공존하는 패턴입니다.
 */
import type * as Party from "partykit/server";
import { onConnect as yPartyKitOnConnect } from "y-partykit";

export default class LiveNotepadParty implements Party.Server {
  /** hibernation 을 끄면 메시지가 addEventListener + y-partykit 경로로 갑니다 */
  readonly options = { hibernate: false };

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "F",
        location: "party/index.ts:onConnect",
        message: "class worker onConnect",
        data: { roomId: this.room.id, connId: conn.id, hibernate: false },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    await yPartyKitOnConnect(conn, this.room, {
      persist: false,
      gc: true,
    });
  }

  /**
   * PartyKit ClassWorker 가 attachSocketEventHandlers 에서 매 메시지마다 호출합니다.
   * Yjs 바이너리는 y-partykit 이 onConnect 에 등록한 리스너가 처리합니다.
   */
  onMessage(_message: string | ArrayBuffer | ArrayBufferView) {
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "7f8eb8",
        hypothesisId: "F",
        location: "party/index.ts:onMessage",
        message: "noop onMessage invoked",
        data: {
          type: typeof _message,
          byteLength:
            _message instanceof ArrayBuffer
              ? _message.byteLength
              : typeof _message === "string"
                ? _message.length
                : 0,
        },
        timestamp: Date.now(),
      }),
    );
    // #endregion
  }

  onRequest() {
    return new Response(`live-notepad party ok (room: ${this.room.id})`, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
