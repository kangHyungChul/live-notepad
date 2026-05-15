/**
 * PartyKit WebSocket 호스트 문자열 (프로토콜·끝 슬래시 제외).
 * y-partykit 이 `wss://${host}/parties/...` 로 붙이므로 host 끝에 `/` 가 있으면 `//parties` 가 됩니다.
 */

/** `partykit deploy` / `party:list` 에 나온 호스트와 동일한 표기(대소문자 포함) */
const DEFAULT_PRODUCTION_PARTY_HOST =
  "live-notepad-party.kangHyungChul.partykit.dev";

function normalizePartyHost(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?|wss?):\/\//, "")
    .replace(/\/+$/, "");
}

export function getPartyKitHost(): string {
  const fromEnv = import.meta.env.VITE_PARTYKIT_HOST;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return normalizePartyHost(fromEnv);
  }

  if (import.meta.env.PROD) {
    // Vercel env 누락 시 localhost 로 떨어지면 프로덕션에서만 실패하고 로컬은 되는 현상이 납니다.
    console.warn(
      `[live-notepad] VITE_PARTYKIT_HOST 없음 → 기본 프로덕션 호스트 사용: ${DEFAULT_PRODUCTION_PARTY_HOST}. Vercel Production env 확인 후 Redeploy 권장.`,
    );
    return DEFAULT_PRODUCTION_PARTY_HOST;
  }

  return "localhost:1999";
}
