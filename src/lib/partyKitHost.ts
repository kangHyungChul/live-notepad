/**
 * PartyKit WebSocket 호스트 문자열 (프로토콜 제외).
 * y-partykit 프로바이더가 `ws`/`wss`를 알아서 붙입니다.
 */
export function getPartyKitHost(): string {
  const fromEnv = import.meta.env.VITE_PARTYKIT_HOST;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/^(https?|wss?):\/\//, "");
  }
  return "localhost:1999";
}
