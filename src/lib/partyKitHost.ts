/**
 * PartyKit WebSocket 호스트 문자열 (프로토콜·끝 슬래시 제외).
 * y-partykit 이 `wss://${host}/parties/...` 로 붙이므로 host 끝에 `/` 가 있으면 `//parties` 가 됩니다.
 */
export function getPartyKitHost(): string {
  const fromEnv = import.meta.env.VITE_PARTYKIT_HOST;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv
      .trim()
      .replace(/^(https?|wss?):\/\//, "")
      .replace(/\/+$/, "");
  }
  return "localhost:1999";
}
