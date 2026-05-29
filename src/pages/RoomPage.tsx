import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as Y from "yjs";
import useYProvider from "y-partykit/react";
import { BlockNoteCollabEditor } from "../components/BlockNoteCollabEditor";
import { RoomFilePanel } from "../components/RoomFilePanel";
import { RoomPresencePanel } from "../components/RoomPresencePanel";
import { SyncDebugPanel } from "../components/SyncDebugPanel";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { getPartyKitHost } from "../lib/partyKitHost";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  applyStoredSnapshotToDoc,
  fetchRoomBySlug,
  type RoomRow,
} from "../lib/roomsRepo";
import { usePartyKitSyncReady } from "../hooks/usePartyKitCollabEditable";
import { useYjsSupabasePersistence } from "../hooks/useYjsSupabasePersistence";
import { prepareYDocForBlockNote, snapshotLooksLikeBlockNoteContent } from "../lib/blocknoteYjs";
import { randomGuestColor, randomGuestLabel } from "../lib/randomGuest";

/**
 * 단일 방 UI.
 *
 * 동기화 순서(중요):
 * 1) Supabase 행만 조회(스냅샷은 Y.Doc 에 아직 적용하지 않음)
 * 2) 빈 Y.Doc 으로 PartyKit 연결 → `provider.synced` 대기
 * 3) synced 후 Supabase 스냅샷 merge → 레거시 Tiptap fragment 제거 → BlockNote 마운트
 * 4) 이후 편집 내용은 Yjs → Supabase 스냅샷으로 저장
 *
 * 연결 전에 스냅샷을 넣으면 Yjs 핸드셰이크가 깨져 기기마다 `remote-like: 0` 이 됩니다.
 */
export function RoomPage() {
  const { slug: slugParam = "" } = useParams();
  // `/room/abc&debug=1` 처럼 잘못된 URL 도 방 ID 만 쓰도록 정리
  const slug = slugParam.trim().split(/[?&]/)[0] ?? "";

  if (!slug) {
    return (
      <div className="page">
        <p>방 코드가 없습니다.</p>
        <Link to="/">홈으로</Link>
      </div>
    );
  }

  return <RoomPageInner key={slug} slug={slug} />;
}

function RoomPageInner({ slug }: { slug: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [hydrated, setHydrated] = useState(false);
  const [initialRoom, setInitialRoom] = useState<RoomRow | null>(null);
  const [title, setTitle] = useState("메모장");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [guestName] = useState(() => randomGuestLabel());
  const [guestColor] = useState(() => randomGuestColor());

  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (supabase) {
          const row = await fetchRoomBySlug(supabase, slug);
          if (cancelled) return;
          if (row) {
            setInitialRoom(row);
            setTitle(row.title || "메모장");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  if (!hydrated) {
    return (
      <div className="page">
        <p>문서 불러오는 중…</p>
        {loadErr && <p className="banner error">{loadErr}</p>}
      </div>
    );
  }

  return (
    <RoomLiveSurface
      slug={slug}
      ydoc={ydoc}
      initialRoom={initialRoom}
      title={title}
      onTitleChange={setTitle}
      guestName={guestName}
      guestColor={guestColor}
      supabase={supabase}
      loadErr={loadErr}
    />
  );
}

function RoomLiveSurface({
  slug,
  ydoc,
  initialRoom,
  title,
  onTitleChange,
  guestName,
  guestColor,
  supabase,
  loadErr,
}: {
  slug: string;
  ydoc: Y.Doc;
  initialRoom: RoomRow | null;
  title: string;
  onTitleChange: (t: string) => void;
  guestName: string;
  guestColor: string;
  supabase: ReturnType<typeof getSupabaseBrowserClient>;
  loadErr: string | null;
}) {
  const host = getPartyKitHost();
  const provider = useYProvider({
    host,
    room: slug,
    doc: ydoc,
  });

  const { ready: partyReady, retrying, gaveUp } = usePartyKitSyncReady(provider, {
    ydoc,
  });

  const editorGateRef = useRef(false);
  const [contentReady, setContentReady] = useState(false);

  // Yjs step2 완료(provider.synced) 후에만 스냅샷 merge·에디터 마운트
  useEffect(() => {
    if (!provider.synced || editorGateRef.current) return;
    editorGateRef.current = true;

    prepareYDocForBlockNote(ydoc);
    const snapshotUsable =
      Boolean(initialRoom?.y_snapshot) &&
      snapshotLooksLikeBlockNoteContent(initialRoom?.y_snapshot ?? null);
    if (initialRoom && snapshotUsable) {
      applyStoredSnapshotToDoc(ydoc, initialRoom);
    }
    prepareYDocForBlockNote(ydoc);

    setContentReady(true);
  }, [provider.synced, provider.wsconnected, initialRoom, ydoc, slug, partyReady, provider]);

  const editorReady = contentReady;

  useYjsSupabasePersistence(
    ydoc,
    slug,
    title,
    supabase,
    Boolean(supabase) && editorReady,
  );

  const showDebug =
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(window.location.search).has("debug"));

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${slug}`
      : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("링크를 클립보드에 복사했습니다.");
    } catch {
      window.prompt("이 링크를 복사하세요:", shareUrl);
    }
  };

  return (
    <div className="page room-page">
      <header className="room-toolbar">
        <div className="room-toolbar__left">
          <Link className="btn ghost" to="/">
            ← 홈
          </Link>
          <input
            className="input title-input"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            aria-label="메모장 제목"
          />
        </div>
        <div className="room-toolbar__right">
          {provider.synced && <RoomPresencePanel provider={provider} />}
          <SyncStatusBadge provider={provider} />
          <button type="button" className="btn" onClick={() => void copyLink()}>
            링크 복사
          </button>
        </div>
      </header>
      {loadErr && <p className="banner error">{loadErr}</p>}
      {!supabase && (
        <p className="banner warn">
          Supabase 미설정 — 스냅샷 저장이 비활성화되었습니다.
        </p>
      )}
      {!editorReady && (
        <p className="banner warn">
          PartyKit 과 문서를 맞추는 중입니다
          {retrying ? " (재연결 시도)" : ""}… 완료되면 에디터가 열립니다.
        </p>
      )}
      {gaveUp && !editorReady && (
        <p className="banner error">
          동기화가 끝나지 않았습니다. PartyKit 배포·호스트 설정을 확인한 뒤 페이지를 새로고침 해
          주세요.
        </p>
      )}
      <div className="editor-shell">
        {editorReady ? (
          <BlockNoteCollabEditor
            ydoc={ydoc}
            provider={provider}
            localUserName={guestName}
            localUserColor={guestColor}
          />
        ) : (
          <p className="blocknote-editor__loading">에디터 동기화 대기 중…</p>
        )}
      </div>
      {supabase && (
        <RoomFilePanel roomSlug={slug} supabase={supabase} localGuestLabel={guestName} />
      )}
      {showDebug && <SyncDebugPanel provider={provider} ydoc={ydoc} room={slug} />}
    </div>
  );
}
