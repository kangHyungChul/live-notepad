/**
 * 프로덕션 PartyKit 호스트에 Node에서 직접 Yjs 프로바이더를 붙여 동기화 여부를 진단합니다.
 * 사용: node scripts/diagnose-partykit.mjs [host] [room]
 */
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import WebSocket from "ws";

function log(message, data) {
  console.log(JSON.stringify({ message, data, timestamp: Date.now() }));
}

const host =
  process.argv[2] ?? "live-notepad-party.kangHyungChul.partykit.dev";
const room = process.argv[3] ?? `agent-${Date.now()}`;

const doc = new Y.Doc();
const provider = new YPartyKitProvider(host, room, doc, {
  WebSocketPolyfill: WebSocket,
  connect: true,
});

let remoteUpdates = 0;
doc.on("update", (update, origin) => {
  const fromProvider = origin === provider;
  if (fromProvider) remoteUpdates += 1;
  log("ydoc update", { byteLength: update.byteLength, fromProvider });
});

provider.on("status", (ev) => {
  log("status", { ev });
});
provider.on("sync", (synced) => {
  log("sync event", { synced, providerSynced: provider.synced });
});
provider.on("connection-error", (err) => {
  log("connection-error", { err: String(err) });
});
provider.on("connection-close", (ev) => {
  log("connection-close", { ev: String(ev) });
});

const start = Date.now();
const interval = setInterval(() => {
  log("tick", {
    elapsedMs: Date.now() - start,
    synced: provider.synced,
    wsconnected: provider.wsconnected,
    url: provider.url,
    remoteUpdates,
    awarenessSize: provider.awareness.getStates().size,
  });
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  if (!provider.synced) {
    doc.getText("probe").insert(0, "x");
    log("local insert after 5s still not synced", {});
  }
  setTimeout(() => {
    log("final", {
      synced: provider.synced,
      wsconnected: provider.wsconnected,
      remoteUpdates,
    });
    provider.destroy();
    process.exit(provider.synced ? 0 : 1);
  }, 2000);
}, 5000);
