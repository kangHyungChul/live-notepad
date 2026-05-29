-- Supabase 는 storage.objects 직접 DELETE 를 막습니다.
-- 방·만료 파일 정리는 앱에서 Storage API (.remove) 로 처리합니다.

-- ---------------------------------------------------------------------------
-- rooms 삭제 트리거 제거 (storage.objects 직접 삭제가 실패함)
-- ---------------------------------------------------------------------------
drop trigger if exists rooms_after_delete_purge_storage on public.rooms;
drop function if exists public.delete_room_storage_on_room_delete();

-- ---------------------------------------------------------------------------
-- 만료 파일 cron: storage 직접 삭제 제거 → 메타만 정리 (고아 객체는 클라이언트 purge 가 처리)
-- pg_cron 이 활성화된 환경에서만 job 해제를 시도합니다.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_room_files()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  with deleted as (
    delete from public.room_files
    where expires_at < now()
    returning id
  )
  select count(*)::integer into deleted_count from deleted;

  return deleted_count;
end;
$$;

do $$
declare
  job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into job_id
    from cron.job
    where jobname = 'purge-expired-room-files'
    limit 1;

    if job_id is not null then
      perform cron.unschedule(job_id);
    end if;
  end if;
end $$;
