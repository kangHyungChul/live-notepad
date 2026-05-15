/**
 * Cloudflare PartyKit 배포 환경에서는 WebSocket 메시지가 worker.onMessage 로만
 * 전달되는 경우가 있습니다. y-partykit 이 onConnect 에 등록한 리스너가 호출되지 않으면
 * provider.synced 가 영원히 false 가 됩니다.
 *
 * 이 모듈은 y-partykit 의 messageListener 와 동일한 Yjs 프로토콜 처리를 onMessage 에서 수행합니다.
 */
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type * as Party from "partykit/server";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import { unstable_getYDoc, type YPartyKitOptions } from "y-partykit";

const messageSync = 0;
const messageAwareness = 1;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

function readSyncMessage(
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: Parameters<typeof syncProtocol.readSyncStep1>[2],
  transactionOrigin: unknown,
  readOnly = false,
) {
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case syncProtocol.messageYjsSyncStep1:
      syncProtocol.readSyncStep1(decoder, encoder, doc);
      break;
    case syncProtocol.messageYjsSyncStep2:
      if (!readOnly) syncProtocol.readSyncStep2(decoder, doc, transactionOrigin);
      break;
    case syncProtocol.messageYjsUpdate:
      if (!readOnly) syncProtocol.readUpdate(decoder, doc, transactionOrigin);
      break;
    default:
      throw new Error("Unknown message type");
  }
  return messageType;
}

function send(
  doc: Awaited<ReturnType<typeof unstable_getYDoc>>,
  conn: Party.Connection,
  m: Uint8Array,
) {
  if (
    conn.readyState !== undefined &&
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    return;
  }
  try {
    conn.send(m);
  } catch {
    // 연결이 닫힌 경우 무시
  }
}

function messageListener(
  conn: Party.Connection,
  doc: Awaited<ReturnType<typeof unstable_getYDoc>>,
  message: Uint8Array,
  readOnly = false,
) {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      readSyncMessage(decoder, encoder, doc, conn, readOnly);
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
      break;
    case messageAwareness:
      awarenessProtocol.applyAwarenessUpdate(
        doc.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
    default:
      throw new Error("Unknown message type");
  }
}

function toUint8Array(
  message: ArrayBuffer | ArrayBufferView,
): Uint8Array {
  if (message instanceof ArrayBuffer) return new Uint8Array(message);
  return new Uint8Array(
    message.buffer,
    message.byteOffset,
    message.byteLength,
  );
}

/**
 * PartyKit worker.onMessage 에서 호출 — Yjs 바이너리 프레임을 공유 문서에 반영합니다.
 */
export async function routeYjsMessage(
  room: Party.Room,
  conn: Party.Connection,
  message: string | ArrayBuffer | ArrayBufferView,
  opts: YPartyKitOptions,
): Promise<void> {
  if (typeof message === "string") return;
  const doc = await unstable_getYDoc(room, opts);
  messageListener(conn, doc, toUint8Array(message), opts.readOnly ?? false);
}
