/** 에이전트 디버그 세션 — 동기화 이슈 런타임 증거 수집용 (검증 후 제거) */
const ENDPOINT =
  "http://127.0.0.1:7496/ingest/2f5edff9-b22c-4842-a9b0-9bd55fc4992d";
const SESSION_ID = "7f8eb8";

export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
): void {
  // #region agent log
  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      location,
      message,
      data,
      hypothesisId,
      runId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
