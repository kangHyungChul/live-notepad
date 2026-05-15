-- MVP: 누구나 방 삭제 가능 (추후 owner_user_id / 관리자 정책으로 교체 예정)
create policy "rooms_delete_anon"
on public.rooms for delete
to anon, authenticated
using (true);
