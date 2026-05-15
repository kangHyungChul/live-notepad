/** 협업 커서 라벨에 쓸 짧은 익명 닉네임 생성 (로컬에서만 결정, 서버 검증 없음) */
export function randomGuestLabel(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `Guest-${n}`;
}

/** CollaborationCaret에 넣을 색상 — 서로 구분되도록 고정 팔레트에서 순환 선택 */
const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#ea580c",
];

export function randomGuestColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
}
