/**
 * URL에 쓸 방 식별자(slug) 생성.
 * 충분한 엔트로피로 무작위 추측을 어렵게 합니다(보안의 전부는 아니며 RLS·레이트리밋이 필요).
 */
export function generateRoomSlug(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
