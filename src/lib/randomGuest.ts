/** 협업 커서·접속자 목록용 — 어두운 UI 에서도 구분 잘 되는 색 */
export const GUEST_COLOR_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#ea580c",
  "#7c3aed",
  "#059669",
  "#e11d48",
  "#0284c7",
  "#65a30d",
  "#c026d3",
  "#0d9488",
  "#d97706",
  "#4f46e5",
  "#be123c",
  "#15803d",
  "#a21caf",
  "#0369a1",
  "#b45309",
  "#5b21b6",
  "#047857",
  "#f43f5e",
  "#14b8a6",
  "#8b5cf6",
  "#84cc16",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#22c55e",
] as const;

/** 협업 커서 라벨에 쓸 짧은 익명 닉네임 생성 (로컬에서만 결정, 서버 검증 없음) */
export function randomGuestLabel(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `Guest-${n}`;
}

/**
 * 닉네임에서 협업 색을 결정합니다.
 * 모든 클라이언트가 같은 이름 → 같은 색을 계산하므로
 * awareness 에 실린 color 와 무관하게 표시가 일치합니다.
 */
export function guestColorFromName(name: string): string {
  const trimmed = name.trim() || "익명";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (Math.imul(31, hash) + trimmed.charCodeAt(i)) >>> 0;
  }
  return GUEST_COLOR_PALETTE[hash % GUEST_COLOR_PALETTE.length]!;
}

/** @deprecated `guestColorFromName(randomGuestLabel())` 또는 RoomPage 의 guestColor 사용 */
export function randomGuestColor(): string {
  return guestColorFromName(randomGuestLabel());
}
