# 실시간 공유 메모장 (live-notepad)

**Vite + React + TypeScript** 프론트, **Yjs + PartyKit** 실시간 동기화, **Supabase(Postgres)**에 Yjs 스냅샷을 저장합니다.

## 사전 준비

1. [Supabase](https://supabase.com) 프로젝트 생성 후 SQL 편집기에서 `supabase/migrations/001_rooms.sql` 실행  
2. 프로젝트 루트에 `.env` 생성 (`.env.example` 참고)

## 로컬 실행

```bash
npm install
npm run dev
```

- Vite: 기본 `http://localhost:5173`  
- PartyKit: `http://localhost:1999` (`VITE_PARTYKIT_HOST=localhost:1999`)

한 터미널에서 `concurrently`로 둘 다 뜹니다. 끝날 때 한쪽만 남지 않도록 `-k`로 함께 종료합니다.

## 배포 메모

- 프론트: Vercel/Netlify 등에 빌드 산출물 배포  
- PartyKit: `npx partykit deploy` 후 대시보드에서 호스트를 확인하고 `VITE_PARTYKIT_HOST`를 프로덕션 값으로 교체  
- Supabase: 마이그레이션 적용 + 운영 전 RLS 정책 강화 (`002_auth_invites_future.sql` 참고)

## 스택

| 영역 | 기술 |
|------|------|
| 에디터 | Tiptap 3 + Collaboration + CollaborationCaret |
| CRDT | Yjs |
| 실시간 | PartyKit + y-partykit |
| 저장소 | Supabase (rooms.y_snapshot base64) |
