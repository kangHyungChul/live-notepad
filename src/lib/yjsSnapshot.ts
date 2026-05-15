/**
 * Yjs 업데이트 바이너리를 JSON/PostgREST 친화적인 base64 문자열로 변환합니다.
 * (bytea 컬럼에 바이너리를 직접 넣는 방식은 런타임/드라이버에 따라 깨질 수 있어 텍스트로 통일)
 */

/** `Y.encodeStateAsUpdate` 등이 돌려준 Uint8Array를 base64 문자열로 직렬화 */
export function encodeYUpdateAsBase64(update: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < update.length; i++) {
    binary += String.fromCharCode(update[i]!);
  }
  return btoa(binary);
}

/** DB에 저장된 base64를 Uint8Array로 복원해 `Y.applyUpdate`에 넘깁니다. */
export function decodeBase64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
