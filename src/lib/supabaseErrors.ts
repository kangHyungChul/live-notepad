import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트가 던지는 PostgrestError 는 Error 인스턴스가 아닙니다.
 * 그대로 throw 하면 catch 에서 String(e) 가 "[object Object]" 가 되므로 Error 로 감쌉니다.
 */
export function throwIfSupabaseError(error: PostgrestError | null): void {
  if (!error) return;

  const parts = [error.message];
  if (error.details) parts.push(error.details);
  if (error.hint) parts.push(`힌트: ${error.hint}`);

  throw new Error(parts.filter(Boolean).join(" — "));
}

/** catch 블록용 — Error·PostgrestError·문자열을 UI 메시지로 통일 */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "알 수 없는 오류가 발생했습니다.";
  }
}
