# 실시간 공유 메모장 (live-notepad)

Vite + React + TypeScript 프론트, **Yjs + PartyKit** 실시간 동기화, **Supabase**에 스냅샷 저장.

---

## 아키텍처

```
브라우저 (Vite SPA)
    ├─ WebSocket ──► PartyKit  (실시간 편집, Yjs)
    └─ HTTPS   ──► Supabase   (방 메타·스냅샷 저장)
```

| 구성요소 | 로컬 | 프로덕션 |
|----------|------|----------|
| 프론트 | `localhost:5173` (`npm run dev`) | **Vercel** (Git push → 자동 빌드) |
| 실시간 | `localhost:1999` (같은 `npm run dev`) | **PartyKit** (`npm run party:deploy`) |
| DB | Supabase 클라우드 | Supabase 클라우드 |

프론트와 실시간 서버는 **별도로 배포**합니다. Vercel만 올리고 PartyKit을 안 올리면 동기화가 되지 않습니다.

---

## 빠른 시작 (로컬)

```bash
git clone <repo>
cd live-notepad
npm install
cp .env.example .env          # Windows: Copy-Item .env.example .env
# .env 에 Supabase URL·anon 키 입력
npm run dev
```

브라우저: `http://localhost:5173`

- PartyKit 호스트는 [`.env.development`](.env.development) 가 `localhost:1999` 로 고정합니다.
- Supabase 미설정 시 실시간만 되고, 저장·새 방 생성은 제한됩니다.

---

## 환경 변수

Vite는 `VITE_` 로 시작하는 변수만 빌드에 넣습니다. **값을 바꾼 뒤 dev/빌드를 다시 실행**해야 반영됩니다.

| 변수 | 로컬 | Vercel 프로덕션 |
|------|------|-----------------|
| `VITE_SUPABASE_URL` | `.env` | Environment Variables |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Environment Variables |
| `VITE_PARTYKIT_HOST` | `.env.development` → `localhost:1999` | deploy 후 호스트 ([아래](#partykit-배포-프로세스)) |

**Supabase 값 찾기:** 대시보드 → Project Settings → API → Project URL / **anon public** 키  
- URL은 `https://xxxx.supabase.co` 까지만 (`/rest/v1/` 붙이지 않음)  
- `service_role` 키는 브라우저·Git에 넣지 않음

**파일 우선순위 (로컬 dev):** `.env.development` > `.env` — 로컬에서는 프로덕션 PartyKit 호스트를 `.env`에 넣어도 dev가 `localhost:1999`를 씁니다.

---

## Supabase DB

SQL: [`supabase/migrations/`](supabase/migrations/)

### CLI로 적용 (권장)

```bash
npm run db:login          # 실패 시: npm run db:login -- --token "토큰"
npm run db:link           # project ref 입력
npm run db:push
```

### 수동

대시보드 SQL Editor에 [`001_rooms.sql`](supabase/migrations/001_rooms.sql) 실행.

---

## 로컬 개발

```bash
npm run dev          # Vite(5173) + PartyKit(1999) 동시 실행
npm run dev:vite     # 프론트만
npm run dev:party    # PartyKit만
```

---

## 프로덕션 배포

### 전체 순서 (한눈에)

```
1. Supabase  ─ db:push
2. PartyKit  ─ party:deploy  → 호스트 확인
3. Vercel    ─ env 설정 + Redeploy
4. 확인      ─ test URL + WS 연결
```

### Vercel (프론트)

1. GitHub 저장소 연결  
2. **Settings → Environment Variables** (Production):

   | 이름 | 값 |
   |------|-----|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public |
   | `VITE_PARTYKIT_HOST` | PartyKit 호스트 (프로토콜·끝 `/` 없음) |

3. Build: `npm run build` / Output: `dist` / Framework: **Vite** 또는 Other  
4. env 추가·변경 후 **Redeploy** 필수 (Vite는 빌드 시 env를 번들에 고정)

**배포 후에도 WebSocket이 `localhost:1999` 로 가는 이유:** Vercel 빌드 시점에 `VITE_PARTYKIT_HOST` 가 **비어 있거나** Preview/Development에만 넣고 Production 빌드에는 없으면, 코드가 **`localhost:1999` 로 폴백**합니다. Production에 변수를 넣은 뒤 **반드시 Redeploy** 하세요. (프로덕션에서 폴백 시 브라우저 콘솔에 경고가 찍힙니다.)

[`vercel.json`](vercel.json) — SPA 라우트(`/room/...`)를 `index.html`로 넘깁니다.

---

### PartyKit 배포 프로세스

실시간 동기화 서버입니다. **PC 터미널**에서 실행합니다 (Vercel 대시보드·F12 콘솔 아님).

#### 사전 조건

- `npm install` 완료
- GitHub 계정 (PartyKit 로그인용)
- 작업 디렉터리: 프로젝트 루트 (`package.json` 있는 폴더)

#### 1단계 — 로그인 (최초 1회)

```powershell
cd c:\workspace\live-notepad
npx partykit login -p github
```

- 브라우저에서 GitHub 권한 허용  
- `Attempting to login...` 에서 **1~2분 대기** (Ctrl+C로 끊지 않기)

**브라우저 로그인이 안 될 때:**

```powershell
npx partykit token generate
$env:PARTYKIT_TOKEN = "발급받은_토큰"
npx partykit whoami
```

GitHub 아이디가 출력되면 성공.

#### 2단계 — 배포

```powershell
npm run party:deploy
# 동일: npx partykit deploy
```

성공 예시:

```text
Deployed ./party/index.ts to https://live-notepad-party.{GitHub아이디}.partykit.dev
```

**`party/index.ts` 를 수정할 때마다** 이 명령을 다시 실행해야 클라우드에 반영됩니다.

#### 3단계 — 배포 확인

```powershell
npm run party:list
```

또는 브라우저에서:

```text
https://live-notepad-party.{GitHub아이디}.partykit.dev/parties/main/test
```

| 화면에 보이는 문구 | 의미 |
|--------------------|------|
| `live-notepad party ok (room: test)` | 배포 정상 |
| `No onRequest handler` | **옛 배포본** — 2단계 `party:deploy` 다시 실행 |
| 페이지 자체가 안 열림 | DNS·네트워크 이슈 |

호스트 규칙: [`partykit.json`](partykit.json) 의 `name` + GitHub 아이디 →  
`live-notepad-party.{GitHub아이디}.partykit.dev`  
(`https://` 없음, **끝 `/` 없음**)

#### 4단계 — Vercel에 호스트 반영

1. 3단계에서 확인한 호스트를 `VITE_PARTYKIT_HOST` 에 입력  
2. **Redeploy**

#### 5단계 — 실시간 동작 확인

- **Vercel 사이트** → F12 → Network → **WS**  
  - `wss://live-notepad-party.*.partykit.dev/parties/main/...` 이 **101** 이면 성공  
- **로컬 dev** → WS는 `ws://localhost:1999/...` 이어야 함 (프로덕션 호스트 아님)

#### 6단계 — 서버 로그 (선택)

```powershell
npm run party:tail
```

터미널을 켜 둔 채 Vercel 사이트에서 방에 입장하면 PartyKit 로그가 출력됩니다.

#### PartyKit npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run party:list` | 배포된 프로젝트·URL 목록 |
| `npm run party:deploy` | `party/index.ts` → 클라우드 배포 |
| `npm run party:tail` | 실시간 서버 로그 스트림 |

---

## npm 스크립트 모음

| 명령 | 설명 |
|------|------|
| `npm run dev` | 로컬 프론트 + PartyKit |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | `dist` 미리보기 |
| `npm run lint` | ESLint |
| `npm run db:login` | Supabase CLI 로그인 |
| `npm run db:link` | Supabase 프로젝트 연결 |
| `npm run db:push` | SQL 마이그레이션 적용 |
| `npm run party:list` | PartyKit 배포 목록 |
| `npm run party:deploy` | PartyKit 배포 |
| `npm run party:tail` | PartyKit 로그 |

---

## 문제 해결

### 실시간 / WebSocket

| 증상 | 조치 |
|------|------|
| 프로덕션에서 WS가 `localhost:1999` | Vercel **Production** 에 `VITE_PARTYKIT_HOST` 없음 또는 env 추가 후 **Redeploy 안 함** → 빌드에 폴백이 박힘 |
| 프로덕션 WS failed | `party:deploy` 완료 → test URL 확인 → Vercel `VITE_PARTYKIT_HOST` + Redeploy |
| URL에 `//parties` (슬래시 두 개) | 호스트 끝 `/` 제거 후 Redeploy |
| `No onRequest handler` | `npm run party:deploy` |
| `연결 끊김` (로컬) | `npm run dev` 로 PartyKit(1999)이 떠 있는지 확인 |

### Supabase

| 증상 | 조치 |
|------|------|
| “Supabase URL/anon 키가 설정되지 않았습니다” | `.env` 생성, `VITE_` 접두사, dev 재시작 |
| 저장·새 방 실패 | `db:push` 또는 `001_rooms.sql`, 네트워크 탭 401/403 |
| CLI `login` Unknown error | [토큰 로그인](#supabase-cli-토큰-로그인) |

### Vercel

| 증상 | 조치 |
|------|------|
| `MIDDLEWARE_INVOCATION_FAILED` | Framework **Vite**/Other, Output `dist`, 루트에 `middleware.ts` 없는지 확인. **PartyKit 오류와 별개** |
| 빌드 `500 kB` chunk 경고 | 경고일 뿐, 배포 실패 아님 |
| env 넣었는데 반영 안 됨 | **Redeploy** (빌드 시점에 env 고정) |

실시간 오류는 **Vercel Runtime Logs가 아니라** 브라우저 Network(WS) 또는 `party:tail` 로 확인합니다.

### Supabase CLI 토큰 로그인

브라우저 `supabase login` 이 실패할 때:

1. [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) 에서 토큰 생성  
2. `npm run db:login -- --token "토큰"`  
3. 꼬이면: `Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue` 후 재시도

---

## 스택

| 영역 | 기술 |
|------|------|
| 프론트 | Vite, React, TypeScript, Tiptap 3 |
| CRDT | Yjs |
| 실시간 | PartyKit, y-partykit |
| 저장소 | Supabase (`rooms.y_snapshot`) |
