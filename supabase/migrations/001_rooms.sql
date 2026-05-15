-- live-notepad: 방 메타 + Yjs 스냅샷(클라이언트가 주기적으로 저장)
-- y_snapshot은 PostgREST/브라우저 호환을 위해 base64 텍스트로 저장합니다.

create table if not exists public.rooms (
  slug text primary key,
  title text not null default '',
  -- Y.encodeStateAsUpdate(doc) 결과를 base64로 저장 (전체 문서 상태 인코딩)
  y_snapshot text,
  -- 2단계: Supabase Auth 사용자 id (nullable = 익명 방)
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_owner_user_id_idx on public.rooms (owner_user_id);

alter table public.rooms enable row level security;

-- ---------------------------------------------------------------------------
-- MVP(익명 1단계): anon도 방 생성/조회/스냅샷 갱신 가능
-- 운영 환경에서는 slug 난수화 + 레이트리밋 + 002 파일의 정책 스케치로 교체하세요.
-- ---------------------------------------------------------------------------

create policy "rooms_select_anon"
on public.rooms for select
to anon, authenticated
using (true);

create policy "rooms_insert_anon"
on public.rooms for insert
to anon, authenticated
with check (true);

create policy "rooms_update_anon"
on public.rooms for update
to anon, authenticated
using (true)
with check (true);
