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
  // 프로덕션 빌드 시 Vercel 등에 VITE_PARTYKIT_HOST 가 없으면 여기로 떨어져 브라우저가 로컬 PartyKit 으로 붙으려 함
  if (import.meta.env.PROD) {
    console.warn(
      "[live-notepad] VITE_PARTYKIT_HOST 가 비어 있어 localhost:1999 로 폴백합니다. 호스팅 환경 변수에 PartyKit 호스트를 넣고 다시 빌드·배포하세요.",
    );
  }
  return "localhost:1999";
}
