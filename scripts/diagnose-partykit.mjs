/**
 * 프로덕션 PartyKit 호스트에 Node에서 직접 Yjs 프로바이더를 붙여 동기화 여부를 진단합니다.
 * 사용: node scripts/diagnose-partykit.mjs [host] [room]
 */
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import WebSocket from "ws";

const LOG_ENDPOINT =
  "http://127.0.0.1:7496/ingest/2f5edff9-b22c-4842-a9b0-9bd55fc4992d";
const SESSION = "7f8eb8";

function agentLog(message, data, hypothesisId) {
  const payload = {
    sessionId: SESSION,
    location: "scripts/diagnose-partykit.mjs",
    message,
    data,
    hypothesisId,
    runId: "node-prod-host",
    timestamp: Date.now(),
  };
  console.log(JSON.stringify(payload));
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
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
  agentLog("ydoc update", { byteLength: update.byteLength, fromProvider }, "C");
});

provider.on("status", (ev) => {
  agentLog("status", { ev }, "B");
});
provider.on("sync", (synced) => {
  agentLog("sync event", { synced, providerSynced: provider.synced }, "B");
});
provider.on("connection-error", (err) => {
  agentLog("connection-error", { err: String(err) }, "G");
});
provider.on("connection-close", (ev) => {
  agentLog("connection-close", { ev: String(ev) }, "G");
});

const start = Date.now();
const interval = setInterval(() => {
  agentLog("tick", {
    elapsedMs: Date.now() - start,
    synced: provider.synced,
    wsconnected: provider.wsconnected,
    url: provider.url,
    remoteUpdates,
    awarenessSize: provider.awareness.getStates().size,
  }, "B");
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  if (!provider.synced) {
    doc.getText("probe").insert(0, "x");
    agentLog("local insert after 5s still not synced", {}, "E");
  }
  setTimeout(() => {
    agentLog("final", {
      synced: provider.synced,
      wsconnected: provider.wsconnected,
      remoteUpdates,
    }, "B");
    provider.destroy();
    process.exit(provider.synced ? 0 : 1);
  }, 2000);
}, 5000);
