/// <reference types="vite/client" />

/**
 * Vite가 주입하는 환경 변수 타입 정의.
 * `.env` / `.env.local`에 동일한 이름으로 값을 넣으면 `import.meta.env`로 읽습니다.
 */
interface ImportMetaEnv {
  /** Supabase 프로젝트 URL (예: https://xxxx.supabase.co) */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon(공개) 키 — 브라우저에 노출되므로 RLS로 보호해야 합니다. */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** PartyKit 개발 서버 호스트 (프로토콜 없이). 예: localhost:1999 */
  readonly VITE_PARTYKIT_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
