-- room_files 변경을 다른 클라이언트에 실시간 반영 (Supabase Realtime)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_files'
  ) then
    alter publication supabase_realtime add table public.room_files;
  end if;
end $$;
