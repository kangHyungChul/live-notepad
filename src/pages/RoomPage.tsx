import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as Y from "yjs";
import useYProvider from "y-partykit/react";
import { CollabEditor } from "../components/CollabEditor";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { getPartyKitHost } from "../lib/partyKitHost";
import { getSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  applyStoredSnapshotToDoc,
  fetchRoomBySlug,
} from "../lib/roomsRepo";
import { usePartyKitCollabEditable } from "../hooks/usePartyKitCollabEditable";
import { useYjsSupabasePersistence } from "../hooks/useYjsSupabasePersistence";
import { randomGuestColor, randomGuestLabel } from "../lib/randomGuest";

/**
 * 단일 방 UI: DB에서 Yjs 스냅샷을 먼저 복원한 뒤 PartyKit에 연결합니다.
 * 순서가 뒤바뀌면 빈 문서가 서버에 먼저 올라가 덮어쓸 위험이 있어 `hydrated` 게이트를 둡니다.
 */
export function RoomPage() {
  const { slug: slugParam = "" } = useParams();
  const slug = slugParam.trim();

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
            applyStoredSnapshotToDoc(ydoc, row);
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
  }, [slug, supabase, ydoc]);

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
  title,
  onTitleChange,
  guestName,
  guestColor,
  supabase,
  loadErr,
}: {
  slug: string;
  ydoc: Y.Doc;
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

  const { editable: collabEditable, waitingForInitialSync, unlockedByTimeout } =
    usePartyKitCollabEditable(provider);

  useYjsSupabasePersistence(ydoc, slug, title, supabase, Boolean(supabase));

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
      {waitingForInitialSync && (
        <p className="banner warn">
          PartyKit 과 첫 동기화를 마칠 때까지 입력이 잠깁니다. 잠시만 기다려 주세요…
        </p>
      )}
      {unlockedByTimeout && !provider.synced && (
        <p className="banner error">
          PartyKit 동기화가 지연되고 있습니다. 아래 에디터를 열었지만 다른 PC 와 내용이 어긋날 수
          있습니다. 방화벽·호스트 설정·네트워크를 확인하고 새로고침 해 보세요.
        </p>
      )}
      <p className="muted small">
        이 브라우저 표시 이름: <strong>{guestName}</strong> (다른 탭은 다른 이름)
      </p>
      <div className="editor-shell">
        <CollabEditor
          ydoc={ydoc}
          provider={provider}
          editable={collabEditable}
          localUserName={guestName}
          localUserColor={guestColor}
        />
      </div>
    </div>
  );
}
