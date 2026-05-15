-- ============================================================================
-- 2단계 확장용 스케치 (실행 전 설계 검토 권장)
-- 로그인·초대·읽기 전용을 붙일 때 아래를 참고해 RLS를 단계적으로 조이면 됩니다.
-- ============================================================================

-- 예시: 방 소유자만 메타데이터 수정, 멤버만 스냅샷 업데이트 등
-- create policy "rooms_select_member" on public.rooms for select to authenticated
--   using (
--     owner_user_id = auth.uid()
--     or exists (
--       select 1 from public.room_members m
--       where m.room_slug = rooms.slug and m.user_id = auth.uid()
--     )
--   );

-- 초대 토큰 테이블 예시 (이메일 초대 링크 등)
-- create table if not exists public.room_invites (
--   id uuid primary key default gen_random_uuid(),
--   room_slug text not null references public.rooms (slug) on delete cascade,
--   token_hash text not null,
--   role text not null default 'editor' check (role in ('editor', 'viewer')),
--   expires_at timestamptz not null,
--   created_by uuid references auth.users (id),
--   created_at timestamptz not null default now()
-- );

-- create index if not exists room_invites_token_hash_idx on public.room_invites (token_hash);
