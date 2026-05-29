-- 방별 파일 메타데이터 + Supabase Storage 버킷
-- 업로드 후 3일 경과 시 purge_expired_room_files() 로 삭제
-- rooms 행 삭제 시 storage 객체 + room_files(CASCADE) 정리

-- ---------------------------------------------------------------------------
-- 메타데이터 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.room_files (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms (slug) on delete cascade,
  -- Storage 객체 경로: {slug}/{id}/{safe_filename}
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 days')
);

create index if not exists room_files_room_slug_idx on public.room_files (room_slug);
create index if not exists room_files_expires_at_idx on public.room_files (expires_at);

alter table public.room_files enable row level security;

-- MVP: 익명도 조회·등록·삭제 (rooms 테이블과 동일 수준 — 추후 소유자·멤버 정책으로 교체)
create policy "room_files_select_anon"
on public.room_files for select
to anon, authenticated
using (true);

create policy "room_files_insert_anon"
on public.room_files for insert
to anon, authenticated
with check (true);

create policy "room_files_delete_anon"
on public.room_files for delete
to anon, authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Storage 버킷 (비공개, 최대 50MB/파일)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('room-files', 'room-files', false, 52428800)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit;

-- Storage RLS (MVP: room-files 버킷 내 anon 허용)
create policy "room_files_storage_select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'room-files');

create policy "room_files_storage_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'room-files');

create policy "room_files_storage_delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'room-files');

-- ---------------------------------------------------------------------------
-- 만료 파일 정리 (DB + storage.objects)
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_room_files()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer := 0;
  rec record;
begin
  for rec in
    select id, storage_path
    from public.room_files
    where expires_at < now()
  loop
    delete from storage.objects
    where bucket_id = 'room-files' and name = rec.storage_path;
    delete from public.room_files where id = rec.id;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end;
$$;

-- anon/authenticated 클라이언트가 목록 조회 시 만료분을 지울 수 있도록 실행 권한 부여
grant execute on function public.purge_expired_room_files() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 방 삭제 시 Storage 객체 일괄 삭제 (room_files 는 FK CASCADE 로 자동 삭제)
-- ---------------------------------------------------------------------------
create or replace function public.delete_room_storage_on_room_delete()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'room-files'
    and name like old.slug || '/%';
  return old;
end;
$$;

drop trigger if exists rooms_after_delete_purge_storage on public.rooms;
create trigger rooms_after_delete_purge_storage
after delete on public.rooms
for each row
execute function public.delete_room_storage_on_room_delete();

-- pg_cron 스케줄은 005_room_files_quota_cron.sql 에서 등록합니다.
