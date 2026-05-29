-- 방당 저장 용량 100MB (insert 시 DB 검증) + pg_cron 매시간 만료 파일 정리

-- ---------------------------------------------------------------------------
-- 방당 누적 용량 조회 (만료 전 파일만)
-- ---------------------------------------------------------------------------
create or replace function public.get_room_files_total_bytes(p_room_slug text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(size_bytes), 0)::bigint
  from public.room_files
  where room_slug = p_room_slug
    and expires_at >= now();
$$;

grant execute on function public.get_room_files_total_bytes(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- insert 전 방당 100MB 초과 차단
-- ---------------------------------------------------------------------------
create or replace function public.enforce_room_files_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_total bigint;
  room_limit constant bigint := 104857600; -- 100 MiB
begin
  select public.get_room_files_total_bytes(NEW.room_slug) into current_total;

  if current_total + NEW.size_bytes > room_limit then
    raise exception 'ROOM_STORAGE_LIMIT_EXCEEDED'
      using hint = '방당 파일 저장 용량은 100MB 입니다.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists room_files_enforce_storage_quota on public.room_files;
create trigger room_files_enforce_storage_quota
before insert on public.room_files
for each row
execute function public.enforce_room_files_storage_quota();

-- ---------------------------------------------------------------------------
-- pg_cron: 매시 정각 만료 파일 정리
-- Supabase 대시보드 → Database → Extensions → pg_cron 활성화 필요
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- 동일 job 재적용 시 중복 방지
do $$
declare
  job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname = 'purge-expired-room-files'
  limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'purge-expired-room-files',
  '0 * * * *',
  $$ select public.purge_expired_room_files(); $$
);
