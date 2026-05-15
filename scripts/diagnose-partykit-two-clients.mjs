/** 두 클라이언트가 같은 방에서 텍스트가 전파되는지 검증 */
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import WebSocket from "ws";

const host = process.argv[2] ?? "live-notepad-party.kangHyungChul.partykit.dev";
const room = process.argv[3] ?? "diag-two-clients";

const docA = new Y.Doc();
const docB = new Y.Doc();
const textA = docA.getText("shared");
const textB = docB.getText("shared");

const providerA = new YPartyKitProvider(host, room, docA, {
  WebSocketPolyfill: WebSocket,
});
const providerB = new YPartyKitProvider(host, room, docB, {
  WebSocketPolyfill: WebSocket,
});

function waitSynced(p, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (p.synced) {
        clearInterval(id);
        resolve(true);
      } else if (Date.now() - t0 > ms) {
        clearInterval(id);
        reject(new Error("sync timeout"));
      }
    }, 100);
  });
}

await waitSynced(providerA);
await waitSynced(providerB);
textA.insert(0, "hello-from-A");
await new Promise((r) => setTimeout(r, 1500));
const bVal = textB.toString();
console.log(JSON.stringify({ ok: bVal.includes("hello-from-A"), bVal, awarenessB: providerB.awareness.getStates().size }));
providerA.destroy();
providerB.destroy();
process.exit(bVal.includes("hello-from-A") ? 0 : 1);
