import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RoomListSection } from "../components/RoomListSection";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
import { generateRoomSlug } from "../lib/roomSlug";
import {
  deleteRoomBySlug,
  insertRoom,
  listRooms,
  type RoomListItem,
} from "../lib/roomsRepo";

/**
 * 랜딩: 방 목록·새 방 만들기·코드로 입장.
 * Supabase가 없으면 새 방 생성·목록·삭제는 막고, 코드로 입장(PartyKit만)은 허용합니다.
 */
export function HomePage() {
  const navigate = useNavigate();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [listLoading, setListLoading] = useState(() => Boolean(supabase));
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    if (!supabase) return;
    setListLoading(true);
    try {
      const rows = await listRooms(supabase);
      setRooms(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    void listRooms(supabase)
      .then((rows) => {
        if (!cancelled) setRooms(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const onCreate = async () => {
    setErr(null);
    if (!supabase) {
      setErr("Supabase 환경 변수가 없어 새 방을 DB에 등록할 수 없습니다. .env를 확인하세요.");
      return;
    }
    setBusy(true);
    try {
      const slug = generateRoomSlug();
      await insertRoom(supabase, slug, "새 메모장");
      await refreshRooms();
      navigate(`/room/${slug}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const slug = joinCode.trim();
    if (!slug) {
      setErr("방 코드를 입력하세요.");
      return;
    }
    navigate(`/room/${slug}`);
  };
  const onDeleteRoom = async (slug: string, title: string) => {
    if (!supabase) return;
    const label = title.trim() || slug;
    const ok = window.confirm(
      `「${label}」 방을 삭제할까요?\nDB 스냅샷이 지워지며 되돌릴 수 없습니다.`,
    );
    if (!ok) return;

    setErr(null);
    setDeletingSlug(slug);
    try {
      await deleteRoomBySlug(supabase, slug);
      setRooms((prev) => prev.filter((r) => r.slug !== slug));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <div className="page home-page">
      <header className="page-header">
        <h1>실시간 공유 메모장</h1>
        <p className="muted">
          PartyKit(Yjs)로 동시 편집, Supabase에 주기적으로 스냅샷을 저장합니다.
        </p>
      </header>

      {!supabase && (
        <p className="banner warn">
          Supabase URL/anon 키가 설정되지 않았습니다. 실시간은 되지만{" "}
          <strong>새로고침 시 복구</strong>·방 목록·삭제가 되지 않을 수 있습니다.
        </p>
      )}

      {supabase && (
        <RoomListSection
          rooms={rooms}
          loading={listLoading}
          deletingSlug={deletingSlug}
          onRefresh={() => void refreshRooms()}
          onDelete={(slug, title) => void onDeleteRoom(slug, title)}
        />
      )}

      <section className="card">
        <h2>새 메모장</h2>
        <p className="muted">랜덤 방 ID를 만들고 DB에 방 행을 등록한 뒤 이동합니다.</p>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void onCreate()}>
          {busy ? "만드는 중…" : "새 메모장 만들기"}
        </button>
      </section>

      <section className="card">
        <h2>코드로 입장</h2>
        <form className="join-form" onSubmit={onJoin}>
          <input
            className="input"
            placeholder="방 코드(영문/숫자)"
            value={joinCode}
            onChange={(ev) => setJoinCode(ev.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn">
            입장
          </button>
        </form>
      </section>

      {err && <p className="banner error">{err}</p>}

      <footer className="page-footer muted">
        <Link to="/">홈</Link> · 개발 시 <code>npm run dev</code> 로 Vite+PartyKit을 함께 띄웁니다.
      </footer>
    </div>
  );
}
