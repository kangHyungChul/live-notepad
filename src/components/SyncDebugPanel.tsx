import { useEffect, useMemo, useState } from "react";
import type YPartyKitProvider from "y-partykit/provider";
import type { Doc as YDoc } from "yjs";

type Props = {
  /**
   * y-partykit 프로바이더.
   * - WebSocket 연결 상태/URL, `synced`(Yjs sync step2 완료) 등을 제공합니다.
   */
  provider: YPartyKitProvider;
  /**
   * 현재 방에서 공유되는 Y.Doc.
   * - 로컬 편집이 들어오면 `update` 이벤트가 발생하고, 프로바이더가 WS로 전파합니다.
   */
  ydoc: YDoc;
  /** UI에서 보여주기용: 방(slug) */
  room: string;
};

/**
 * 실시간 동기화가 안 될 때 원인을 빠르게 분리하기 위한 디버그 패널입니다.
 *
 * 확인 포인트(핵심):
 * - **WS가 연결되었는가?** (`wsconnected`)
 * - **Yjs 초기 동기화가 끝났는가?** (`synced`)
 * - **로컬 편집이 Y.Doc update 이벤트로 찍히는가?** (`localUpdateCount`)
 * - **서버/다른 클라이언트에서 온 update가 들어오는가?** (`remoteLikeUpdateCount`)
 *
 * 주의:
 * - yjs update 이벤트는 origin(출처)이 다양한데, 여기서는 "로컬 타이핑"과 "원격 수신"을
 *   완벽히 구분할 수 없어서 간단한 휴리스틱(프로바이더에서 난 update로 추정)을 같이 표시합니다.
 * - 이 패널은 개발/진단용이며, 필요할 때만 노출합니다.
 */
export function SyncDebugPanel({ provider, ydoc, room }: Props) {
  const [nowMs, setNowMs] = useState(() => 0);

  const [localUpdateCount, setLocalUpdateCount] = useState(0);
  const [remoteLikeUpdateCount, setRemoteLikeUpdateCount] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  // provider 내부 구현체(WebsocketProvider)가 가진 필드들(공식 타입엔 없을 수 있어 any로 읽음)
  const providerAny = provider as unknown as {
    url?: string;
    wsconnected?: boolean;
    wsconnecting?: boolean;
    bcconnected?: boolean;
    disableBc?: boolean;
    wsUnsuccessfulReconnects?: number;
    wsLastMessageReceived?: number;
    roomname?: string;
  };

  // 상태를 폴링해서 “지금 값”을 그립니다(이벤트 누락 대비).
  useEffect(() => {
    const id = window.setInterval(() => {
      // 렌더 순수성 규칙 때문에 Date.now()는 이펙트에서만 호출하고 state로 흘립니다.
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // provider 이벤트로도 갱신(즉시성).
  useEffect(() => {
    const onAny = () => setNowMs(Date.now());
    provider.on("status", onAny);
    provider.on("sync", onAny);
    provider.on("synced", onAny);
    provider.on("connection-error", onAny);
    provider.on("connection-close", onAny);
    return () => {
      provider.off("status", onAny);
      provider.off("sync", onAny);
      provider.off("synced", onAny);
      provider.off("connection-error", onAny);
      provider.off("connection-close", onAny);
    };
  }, [provider]);

  // Y.Doc 업데이트 카운트(로컬 편집이 실제 Yjs update로 발생하는지 확인용).
  useEffect(() => {
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      // origin이 provider인 경우는 “원격에서 들어온 update”로 보는 경우가 많습니다.
      // (정확히 100%는 아니지만, 동기화가 전혀 안 되는지 판단하는 데는 유용)
      const isFromProvider = origin === provider;
      if (isFromProvider) setRemoteLikeUpdateCount((c) => c + 1);
      else setLocalUpdateCount((c) => c + 1);
      setLastUpdateAt(Date.now());
    };
    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
    };
  }, [provider, ydoc]);

  const awarenessSize = (() => {
    try {
      return provider.awareness?.getStates().size ?? 0;
    } catch {
      return 0;
    }
  })();

  const lastMsgAgoMs = useMemo(() => {
    const t = providerAny.wsLastMessageReceived;
    if (!t || typeof t !== "number") return null;
    // wsLastMessageReceived는 unix seconds(라이브러리 구현에 따라 ms일 수도 있음)라서 둘 다 대응
    const asMs = t < 10_000_000_000 ? t * 1000 : t;
    return Math.max(0, nowMs - asMs);
  }, [providerAny.wsLastMessageReceived, nowMs]);

  return (
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Sync Debug</h3>
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.4 }}>
        <div>room: {room}</div>
        <div>provider.url: {String(providerAny.url ?? provider.url)}</div>
        <div>
          ws: {provider.wsconnected ? "connected" : "disconnected"} / connecting:{" "}
          {String(providerAny.wsconnecting ?? false)}
        </div>
        <div>provider.synced: {String(provider.synced)}</div>
        <div>awareness states: {awarenessSize}</div>
        <div>
          updates(local): {localUpdateCount} / updates(remote-like): {remoteLikeUpdateCount}
        </div>
        <div>
          last ydoc update at: {lastUpdateAt ? new Date(lastUpdateAt).toLocaleTimeString() : "-"}
        </div>
        <div>
          last ws message ago: {lastMsgAgoMs === null ? "-" : `${Math.round(lastMsgAgoMs)}ms`}
        </div>
        <div>ws reconnects: {String(providerAny.wsUnsuccessfulReconnects ?? "-")}</div>
        <div>
          bc: {String(providerAny.bcconnected ?? "-")} / disableBc: {String(providerAny.disableBc ?? "-")}
        </div>
      </div>
    </div>
  );
}

