import { useEffect, useState } from "react";
import type YPartyKitProvider from "y-partykit/provider";

type Props = { provider: YPartyKitProvider };

/**
 * 웹소켓 연결/동기화 여부를 사용자에게 짧게 보여줍니다.
 * y-partykit 프로바이더는 lib0 Observable 계열이라 `on('status')`로 갱신을 구독합니다.
 */
export function SyncStatusBadge({ provider }: Props) {
  const [, bump] = useState(0);
  const force = () => bump((x) => x + 1);

  useEffect(() => {
    const onStatus = () => force();
    provider.on("status", onStatus);
    provider.on("sync", onStatus);
    provider.on("synced", onStatus);
    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onStatus);
      provider.off("synced", onStatus);
    };
  }, [provider]);

  const ws = provider.wsconnected ? "연결됨" : "연결 끊김";
  const synced = provider.synced ? "동기화됨" : "동기화 중";
  const hostHint =
    typeof provider.url === "string"
      ? provider.url.replace(/^wss?:\/\//, "").split("/")[0]
      : "";
  return (
    <span
      className="sync-badge"
      title={
        provider.wsconnected
          ? "PartyKit 실시간 채널"
          : `PartyKit 연결 실패 — 호스트: ${hostHint} (로컬 개발은 localhost:1999, README 3.4·7.3 참고)`
      }
    >
      {ws} · {synced}
    </span>
  );
}
