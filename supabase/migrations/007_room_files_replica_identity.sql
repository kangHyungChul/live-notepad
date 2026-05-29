-- DELETE Realtime: 필터(room_slug)가 old 행에 필요 → REPLICA IDENTITY FULL
alter table public.room_files replica identity full;
