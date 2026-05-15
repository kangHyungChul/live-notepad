# 실시간 공유 메모장 (live-notepad)

**Vite + React + TypeScript** 프론트, **Yjs + PartyKit** 실시간 동기화, **Supabase(Postgres)**에 Yjs 스냅샷을 저장합니다.

---

## 목차

1. [사전 요구 사항](#1-사전-요구-사항)
2. [저장소 클론 및 패키지 설치](#2-저장소-클론-및-패키지-설치)
3. [환경 변수(.env) 초기 세팅](#3-환경-변수env-초기-세팅)
4. [Supabase 프로젝트 및 DB 마이그레이션](#4-supabase-프로젝트-및-db-마이그레이션)
5. [로컬 개발 서버 실행](#5-로컬-개발-서버-실행)
6. [빌드·미리보기·Lint](#6-빌드미리보기lint)
7. [배포 시 환경 변수](#7-배포-시-환경-변수)
8. [문제 해결](#8-문제-해결)
9. [스택 요약](#9-스택-요약)

**배포 하위 절**

- [7.1 `VITE_PARTYKIT_HOST` 프로덕션 값](#71-vite_partykit_host-프로덕션-값--어디서-알-수-있나)
- [7.2 Vercel 500 · MIDDLEWARE_INVOCATION_FAILED](#72-vercel-500--middleware_invocation_failed)
- [7.3 PartyKit 배포·로그인·`tail` (프로덕션 실시간 필수)](#73-partykit-배포로그인tail-프로덕션-실시간-필수)

---

## 1. 사전 요구 사항

| 항목 | 권장 |
|------|------|
| **Node.js** | 20 LTS 이상 (18+ 도 동작 가능. PartyKit은 17+ 권장) |
| **npm** | Node에 포함된 버전 |
| **Supabase CLI** | `npm install` 시 `devDependencies`의 `supabase` 패키지로 설치됨 (`npx supabase` 동일) |
| **계정** | [Supabase](https://supabase.com) 무료 프로젝트 (DB·RLS용) |
| **선택** | [PartyKit](https://partykit.io) 계정 — 로컬만 쓰면 필수 아님, 클라우드 배포 시 필요 |

---

## 2. 저장소 클론 및 패키지 설치

```bash
cd live-notepad
npm install
```

---

## 3. 환경 변수(.env) 초기 세팅

Vite는 **`VITE_` 접두사**가 붙은 변수만 클라이언트 코드에 주입합니다.

### 3.1 파일 만들기

프로젝트 **루트**( `package.json` 이 있는 폴더 )에 `.env` 또는 `.env.local` 을 둡니다.

- **Windows PowerShell**

  ```powershell
  Copy-Item .env.example .env
  ```

- **macOS / Linux**

  ```bash
  cp .env.example .env
  ```

이후 편집기로 `.env` 를 열고 아래 항목을 채웁니다.

### 3.2 `VITE_SUPABASE_URL`

1. [Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트 선택  
2. **Project Settings** (톱니바퀴) → **Data API** 또는 **API**  
3. **Project URL** 값을 그대로 복사해 넣습니다.  
   - 형식 예: `https://xxxxxxxxxxxx.supabase.co`

### 3.3 `VITE_SUPABASE_ANON_KEY`

1. 같은 **Project Settings → API** 화면  
2. **Project API keys** 에서 **`anon` `public`** 키를 복사합니다.  
3. **`service_role` 키는 브라우저·Git·.env에 넣지 마세요.** (RLS를 우회하는 관리자 키입니다.)

### 3.4 `VITE_PARTYKIT_HOST`

- **로컬 개발 (기본)**  
  `npm run dev` 가 PartyKit을 **1999** 포트로 띄우므로 다음을 유지하면 됩니다.

  ```env
  VITE_PARTYKIT_HOST=localhost:1999
  ```

- **프로덕션**  
  `npx partykit deploy` 등으로 배포한 뒤, PartyKit이 안내하는 **호스트:포트**(프로토콜 없이)로 바꿉니다.  
  예: `your-project.username.partykit.dev` 형태일 수 있으며, 대시보드/CLI 출력을 따릅니다.

### 3.5 보안·Git 주의

- `.env`, `.env.local` 은 **`.gitignore`에 포함**되어 있어 커밋되지 않습니다.  
- 팀에 공유할 때는 **1Password 등**으로 값만 전달하고, 저장소에는 `.env.example` 만 유지합니다.

### 3.6 화면에 “Supabase URL/anon 키가 설정되지 않았습니다”가 나올 때

1. **파일 이름**: Vite는 **`.env` 또는 `.env.local`** 만 읽습니다. **`.env.example`만** 두고 값을 넣어도 앱에는 전달되지 않습니다. 루트에 `.env`를 만들고 거기에 넣으세요.  
2. **변수 이름**: 반드시 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 철자가 맞아야 합니다 (`SUPABASE_URL`만으로는 안 됩니다).  
3. **Project URL 형식**: `https://프로젝트ref.supabase.co` **까지만** 넣습니다. `/rest/v1/` 등 경로를 붙이면 클라이언트가 잘못된 주소로 요청할 수 있습니다.  
4. **개발 서버 재시작**: `.env`를 추가·수정한 뒤에는 **`npm run dev`를 완전히 종료했다가 다시 실행**해야 합니다. (Vite는 기동 시점에 env를 고정합니다.)


## 4. Supabase 프로젝트 및 DB 마이그레이션

SQL 파일은 [`supabase/migrations/`](supabase/migrations/)에 있습니다. **대시보드에 직접 붙여넣지 않아도**, 아래 **방법 A(Supabase CLI)** 로 원격 DB에 일괄 적용할 수 있습니다.

### 4.1 프로젝트 생성

1. Supabase에서 **New project**  
2. **Database password** 저장 — CLI `link` 시 Postgres 연결에 물어볼 수 있습니다.  
3. **Region** 은 사용자와 가까운 리전 권장

### 4.2 방법 A: Supabase CLI로 자동 적용 (권장)

이 저장소에는 `supabase init`으로 만든 [`supabase/config.toml`](supabase/config.toml) 이 포함되어 있습니다.

1. **의존성 설치** (한 번만)

   ```bash
   npm install
   ```

2. **Supabase 계정 로그인** (한 번만, 브라우저가 열립니다)

   ```bash
   npm run db:login
   ```

3. **로컬 폴더와 원격 프로젝트 연결** (`project ref` 는 대시보드 URL의 일부입니다)

   - 대시보드 주소가 `https://supabase.com/dashboard/project/abcdefghij` 이면  
     `project ref` = `abcdefghij`

   ```bash
   npm run db:link
   ```

   대화형으로 ref를 입력하거나, 비대화형으로:

   ```bash
   npx supabase link --project-ref abcdefghij
   ```

4. **마이그레이션 푸시** — `supabase/migrations/*.sql` 이 원격 DB에 순서대로 적용됩니다.

   ```bash
   npm run db:push
   ```

   - 이미 대시보드에서 `001` 을 수동 실행했다면 **충돌**할 수 있습니다. 그 경우 빈 DB에만 CLI를 쓰거나, Supabase 문서의 **migration repair** 절차를 따르세요.

5. **(선택) CI에서 자동 푸시**  
   GitHub Actions 등에서 `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`(또는 link용 환경변수)를 시크릿으로 두고 `supabase db push` 를 실행하는 방식이 일반적입니다. ([Supabase CLI on CI](https://supabase.com/docs/guides/cli/managing-environments))

### 4.3 방법 B: 대시보드 SQL Editor (수동)

CLI 없이 진행할 때:

1. 대시보드 → **SQL Editor**  
2. [`supabase/migrations/001_rooms.sql`](supabase/migrations/001_rooms.sql) 전체를 복사해 실행  
3. [`002_auth_invites_future.sql`](supabase/migrations/002_auth_invites_future.sql) 은 주석 위주라 실행해도 스키마 변경은 없습니다(참고용).

### 4.4 API 키 확인

위 **「3. 환경 변수」** 절에서 복사한 URL·anon 키를 `.env`에 반영합니다.

### 4.5 Auth (현재 앱 범위 밖)

로그인·초대는 코드 구조만 준비된 상태입니다. Auth를 켠 뒤에는 RLS를 `002` 스케치처럼 **조여야** 합니다.

---

## 5. 로컬 개발 서버 실행

```bash
npm run dev
```

- **Vite**: 기본 `http://localhost:5173`  
- **PartyKit**: `http://localhost:1999` (`partykit dev -p 1999`)

`concurrently`로 한 터미널에서 둘 다 실행합니다. 종료 시 **한쪽만 남지 않도록** `-k` 로 함께 종료됩니다.

**따로 실행**하려면:

```bash
npm run dev:vite   # 프론트만
npm run dev:party  # PartyKit만
```

브라우저에서 `http://localhost:5173` 접속 → **새 메모장** 또는 **코드로 입장**.

- Supabase를 설정하지 않으면: 실시간 편집은 되지만 **스냅샷 저장·새 방 DB 등록**이 제한됩니다(홈 화면 안내 문구 참고).

---

## 6. 빌드·미리보기·Lint

```bash
npm run build    # tsc + vite production build
npm run preview  # dist 미리보기 (빌드 후)
npm run lint     # ESLint
```

**Supabase DB (CLI)**

```bash
npm run db:login   # 계정 로그인 (최초 1회 등)
npm run db:link    # 원격 프로젝트와 연결
npm run db:push    # supabase/migrations → 원격 DB 적용
```

---

## 7. 배포 시 환경 변수

Vite는 **`npm run build` 할 때** `VITE_` 로 시작하는 값을 클라이언트 번들에 **고정(인라인)** 합니다.  
그래서 **Vercel에도 로컬 `.env`와 동일한 이름으로** 넣어야 하며, **값을 바꾼 뒤에는 재배포**해야 브라우저에 반영됩니다.

| 변수 | Vercel 등에 넣을 값 |
|------|---------------------|
| `VITE_SUPABASE_URL` | Supabase **Project URL** (`https://….supabase.co`, `/rest/v1/` 없음) |
| `VITE_SUPABASE_ANON_KEY` | Supabase **anon public** 키 |
| `VITE_PARTYKIT_HOST` | **배포된 PartyKit** 호스트만 (`https`/`wss`/ **끝 `/` 없음**). `npx partykit list` 의 **url**에서 호스트만 복사. `localhost:1999` 는 프로덕션에서 동작 안 함 |

**Vercel에서 넣는 위치**: 프로젝트 → **Settings** → **Environment Variables** → 이름·값 입력 후 **Production** (필요하면 Preview/Development도)에 체크 → 저장 → **Redeploy**.

- **PartyKit**: `npx partykit deploy` 로 올린 뒤, 대시보드/CLI에 나오는 **WebSocket용 호스트**를 `VITE_PARTYKIT_HOST` 에 넣습니다.  
- **프론트**: `npm run build` 산출물(`dist`) 업로드 또는 Git 연동 CI  
- **Vercel**: 루트에 [`vercel.json`](vercel.json) 이 있으면 `/room/...` 같은 클라이언트 라우트가 `index.html`로 넘어가 SPA가 동작합니다. 대시보드에서 **Framework Preset** 은 Vite(또는 Other) + **Output Directory** `dist` 로 맞추세요.

### 7.1 `VITE_PARTYKIT_HOST` 프로덕션 값 — 어디서 알 수 있나

**“발급받는 API 키”가 아니라**, 배포된 PartyKit 서버의 **도메인(호스트) 문자열**을 그대로 넣으면 됩니다. `https://` / `wss://` / 포트는 **넣지 않습니다.**

1. **도메인 규칙 (PartyKit 공식 문서)**  
   첫 배포 후 기본 URL은 대략 다음 형태입니다.

   `{partykit.json의 name}.{GitHub 사용자명}.partykit.dev`

   이 저장소의 [`partykit.json`](partykit.json) 에는 `"name": "live-notepad-party"` 가 있으므로, GitHub 로그인 계정이 `myname` 이면 예시는 다음과 같습니다.

   ```text
   live-notepad-party.myname.partykit.dev
   ```

   이 문자열 전체를 **`VITE_PARTYKIT_HOST`** 에 넣습니다 (`:443` 같은 포트는 보통 생략).

2. **터미널 출력**  
   `npx partykit deploy` 가 끝날 때 **배포 URL 또는 호스트**를 안내하는 줄이 있는 경우가 많습니다. 그중 **호스트 부분만** 복사하면 됩니다.

   배포가 이미 되어 있으면:

   ```powershell
   npx partykit list
   ```

   표의 **url** 열에서 `https://` 를 뺀 호스트만 사용합니다.  
   예: `https://live-notepad-party.kangHyungChul.partykit.dev` →  
   `live-notepad-party.kangHyungChul.partykit.dev`  
   **끝에 `/` 를 붙이지 마세요.** (`…dev/` 이면 WebSocket이 `//parties/main/...` 로 잘못 붙어 실패할 수 있습니다.)

3. **PartyKit 쪽 UI**  
   [PartyKit 대시보드](https://www.partykit.io/) / 계정·프로젝트 화면에서 배포된 프로젝트 URL을 확인할 수 있습니다(제품 UI는 변경될 수 있음).

4. **직접 확인**  
   브라우저에서 `https://live-notepad-party.본인아이디.partykit.dev` 형태로 열어보고, 개발자 도구 **Network** 에서 WebSocket이 그 호스트로 붙는지 확인해도 됩니다.

### 7.2 Vercel 500 · MIDDLEWARE_INVOCATION_FAILED

이 저장소에는 **`middleware.ts` / Edge Middleware 코드가 없습니다.** 해당 메시지는 **Vercel이 Edge에서 미들웨어(또는 라우팅 미들웨어)를 실행하다가 실패**했을 때 나옵니다.

1. **Vercel 대시보드** → 해당 프로젝트 → **Deployments** → 실패한 배포 → **Runtime / Functions Logs** 에서 **그 위에 찍힌 실제 예외 메시지**를 확인합니다. (표면의 `ID: icn1::...` 만으로는 원인 특정이 어렵습니다.)  
2. 저장소 **루트에 `middleware.ts` / `src/middleware.ts`** 가 다른 브랜치·템플릿에서 들어오지 않았는지 확인합니다.  
3. **프로젝트가 Next.js로 잘못 인식**되면 미들웨어 관련 동작이 꼬일 수 있습니다. **Settings → General → Framework Preset** 을 **Vite** 또는 **Other** 로 두고, Build Command `npm run build`, Output `dist` 를 명시합니다.  
4. **Root Directory** 가 모노레포 하위로 잘못 잡혀 있으면 다른 앱의 미들웨어가 실행될 수 있습니다.  
5. **Vercel 외 URL** (PartyKit·Supabase REST)에서 같은 문구가 나오면 다른 서비스이므로, **주소 표시줄의 도메인**이 `*.vercel.app` 인지 먼저 구분합니다.  
   → PartyKit CLI(`deploy` / `tail`) 문제와 **혼동하지 마세요.** [7.3절](#73-partykit-배포로그인tail-프로덕션-실시간-필수) 참고.

### 7.3 PartyKit 배포·로그인·`tail` (프로덕션 실시간 필수)

프로덕션 구조는 **두 군데**로 나뉩니다.

| 역할 | 어디에 올리나 | 무엇을 하나 |
|------|----------------|-------------|
| **프론트 (Vite)** | Vercel | `npm run build` → 정적 파일. Git push 시 자동 배포 가능 |
| **실시간 (WebSocket)** | PartyKit | **로컬 PC 터미널**에서 `npx partykit deploy` 로 별도 배포 |

Vercel에 `VITE_PARTYKIT_HOST`만 넣고 **PartyKit `deploy`를 끝내지 않으면**, 브라우저 WebSocket이 실패합니다 (`wss://….partykit.dev/... failed`).

#### 어디서 명령을 입력하나

**본인 PC의 터미널** — 프로젝트 루트 (`package.json` 이 있는 `live-notepad` 폴더).

| 위치 | `partykit deploy` / `partykit tail` |
|------|-------------------------------------|
| Cursor / VS Code **터미널** | ✅ |
| Windows **PowerShell** / cmd | ✅ |
| **Vercel** 대시보드 | ❌ |
| Chrome **F12 Console** | ❌ |

`npm run dev` 가 돌아가는 터미널과 **별도 탭**을 열어 실행하는 것을 권장합니다.

#### ① PartyKit 로그인 (최초 1회)

```powershell
cd c:\workspace\live-notepad
npx partykit login -p github
```

- 브라우저가 열리면 **GitHub 권한 허용**까지 완료합니다.  
- 터미널에 `Attempting to login...` 만 보이면 **1~2분 기다립니다.** 성공 메시지가 나올 때까지 **Ctrl+C로 끊지 마세요.**

로그인 브라우저가 실패하면 (Supabase와 비슷하게) **토큰 방식**:

```powershell
npx partykit token generate
```

안내에 따라 토큰을 받은 뒤, **같은 PowerShell 세션**에서:

```powershell
$env:PARTYKIT_TOKEN = "발급받은_토큰"
npx partykit whoami
```

`whoami` 에 본인 GitHub 아이디가 나오면 로그인된 상태입니다.

#### ② PartyKit 배포

```powershell
cd c:\workspace\live-notepad
npx partykit deploy
```

- **성공**하면 호스트가 안내됩니다. [7.1절](#71-vite_partykit_host-프로덕션-값--어디서-알-수-있나) 규칙대로면  
  `live-notepad-party.{GitHub아이디}.partykit.dev` 형태입니다.  
- `Attempting to login...` 에서 멈추면 → **① 로그인**이 안 된 것입니다.  
- 배포 직후 DNS 반영에 **1~2분** 걸릴 수 있습니다.

#### ③ Vercel 환경 변수 + 재배포

1. Vercel → **Settings → Environment Variables**  
2. `VITE_PARTYKIT_HOST` = ②에서 확인한 호스트 (**프로토콜 없이**, `localhost:1999` 아님)  
3. **Production** 체크 → 저장 → **Deployments → Redeploy**

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 도 같이 들어가 있는지 확인합니다.

#### ④ 프로덕션 로그 보기 (`partykit tail`)

```powershell
cd c:\workspace\live-notepad
npx partykit tail
```

- 이 터미널은 **켜 둔 채**  
- 브라우저에서 **배포된 Vercel URL** 로 방에 들어가거나 새로고침  
- PartyKit 서버에 요청이 오면 **이 터미널**에 로그가 찍힙니다.

`tail` 도 `deploy` 와 같이 **로그인이 필요**합니다. `Attempting to login...` 에서 멈추면 ①을 먼저 완료하세요.

#### ⑤ 브라우저에서 실시간 연결 확인 (Vercel 로그 대신)

Vercel은 **정적 SPA**라서, 실시간 동기화 실패 원인은 **Vercel Runtime Logs에 거의 안 남습니다.**

배포된 사이트에서 **F12 → Network → WS (WebSocket)**:

| WS 요청 대상 | 의미 |
|--------------|------|
| `wss://live-notepad-party.*.partykit.dev/...` | 정상 방향 (PartyKit으로 연결 시도) |
| `ws://localhost:1999/...` | `VITE_PARTYKIT_HOST` 가 빌드에 안 들어감 → Vercel env + **Redeploy** |
| WS가 **failed** | PartyKit **미배포**·로그인 미완료·호스트 오타·**호스트 끝 `/`** → URL에 `//parties` 가 보이면 env에서 슬래시 제거 후 Vercel **Redeploy** |

**Vercel Build Logs** 에서는 빌드 성공 여부만 보면 됩니다 (`✓ built`, `Deployment completed`). env 값 자체는 로그에 안 찍히는 것이 정상입니다.

#### 자주 겪는 혼동

| 증상 | 실제 의미 |
|------|-----------|
| `npx partykit deploy` / `tail` 이 `Attempting to login...` 에서 멈춤 | 로그인 미완료. **Ctrl+C 하지 말고** ① 완료 |
| WebSocket `wss://….partykit.dev` **failed** | ② `deploy` 가 끝나지 않았거나, 호스트·계정 불일치 |
| `MIDDLEWARE_INVOCATION_FAILED` (Vercel 형식) | **Vercel 사이트** (`*.vercel.app`) 문제. PartyKit `tail` 출력이 아님 → [7.2절](#72-vercel-500--middleware_invocation_failed) |
| Vercel 빌드 `500 kB` chunk 경고 | **경고**일 뿐, 배포 실패 아님 |

---

## 8. 문제 해결

| 증상 | 확인 |
|------|------|
| **프로덕션 실시간 안 됨** | [7.3절](#73-partykit-배포로그인tail-프로덕션-실시간-필수) — `partykit deploy` 완료 여부, Vercel `VITE_PARTYKIT_HOST` + Redeploy, F12 → Network → WS |
| **WebSocket `partykit.dev` failed** | `npx partykit deploy` 가 로그인 없이 중단되지 않았는지, `whoami` / `list` 로 배포 확인 |
| **실시간만 안 됨 (로컬)** | `npm run dev` 로 PartyKit이 떠 있는지, `.env`의 `VITE_PARTYKIT_HOST`가 `localhost:1999` 인지 |
| **저장·새 방 생성 안 됨** | `.env`에 Supabase URL/anon 키가 맞는지, `npm run db:push` 또는 수동 `001` 실행 여부, 브라우저 네트워크 탭 401/403 |
| **`db push` 충돌** | 이미 대시보드에서 같은 객체를 만들었는지. 필요 시 새 프로젝트에만 CLI 적용, 또는 [migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) |
| **5173은 열리는데 연결 끊김** | 방화벽/프록시에서 `ws://localhost:1999` 차단 여부 |
| **RLS 오류** | `001` 정책이 적용됐는지, 테이블명이 `public.rooms` 인지 |
| **Vercel `MIDDLEWARE_INVOCATION_FAILED`** | [7.2절](#72-vercel-500--middleware_invocation_failed) — 미들웨어/프리셋/Root Directory·런타임 로그 확인 |
| **PartyKit CLI 로그인 실패** | `npx partykit login -p github` 또는 `npx partykit token generate` → [7.3절 ①](#73-partykit-배포로그인tail-프로덕션-실시간-필수) |

### Supabase CLI 로그인 실패 시 (`Unknown error` 등)

1. 브라우저에서 [Supabase 대시보드 → Account → Access Tokens](https://supabase.com/dashboard/account/tokens) 로 이동합니다.  
2. **Generate new token** 으로 Personal Access Token을 만듭니다 (이름은 예: `cli-laptop`).  
3. 터미널에서 (토큰은 따옴표로 감싸는 것을 권장):

   ```bash
   npx supabase login --token "여기에_붙여넣기"
   ```

   npm 스크립트를 쓸 때는 `--` 뒤에 CLI 인자를 넘깁니다.

   ```bash
   npm run db:login -- --token "여기에_붙여넣기"
   ```

4. 예전에 잘못된 토큰이 환경 변수로 남아 있으면 로그인이 꼬일 수 있습니다.

   - **PowerShell**: `Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue`  
   - **cmd**: `set SUPABASE_ACCESS_TOKEN=`  
   - 그다음 다시 위 `login --token` 실행

5. 그래도 안 되면 CLI를 최신으로 올린 뒤 재시도합니다.

   ```bash
   npm update supabase
   ```

---

## 9. 스택 요약

| 영역 | 기술 |
|------|------|
| 에디터 | Tiptap 3 + Collaboration + CollaborationCaret |
| CRDT | Yjs |
| 실시간 | PartyKit + y-partykit |
| 저장소 | Supabase (`rooms.y_snapshot` base64) |
