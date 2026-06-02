import * as Y from "yjs";

const BLOCKNOTE_FRAGMENT = "document-store";

export type PartySupabaseEnv = {
  url: string;
  anonKey: string;
};

/** PartyKit room.env / .env 에서 Supabase 접속 정보 추출 */
export function readPartySupabaseEnv(
  env: Record<string, unknown>,
): PartySupabaseEnv | null {
  const url =
    pickString(env, "SUPABASE_URL") ??
    pickString(env, "VITE_SUPABASE_URL");
  const anonKey =
    pickString(env, "SUPABASE_ANON_KEY") ??
    pickString(env, "VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

function pickString(env: Record<string, unknown>, key: string): string | null {
  const v = env[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function decodeBase64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function looksLikeBlockNoteFragment(fragment: Y.XmlFragment): boolean {
  if (fragment.length === 0) return false;
  try {
    const text = JSON.stringify(fragment.toJSON());
    return text.includes("blockContainer") || text.includes("blockGroup");
  } catch {
    return false;
  }
}

function snapshotLooksLikeBlockNoteContent(snapshotB64: string): boolean {
  try {
    const bytes = decodeBase64ToUint8Array(snapshotB64);
    if (bytes.length <= 8) return false;
    const probe = new Y.Doc();
    Y.applyUpdate(probe, bytes);
    if (!probe.share.has(BLOCKNOTE_FRAGMENT)) return false;
    const frag = probe.getXmlFragment(BLOCKNOTE_FRAGMENT);
    return frag.length > 0 && looksLikeBlockNoteFragment(frag);
  } catch {
    return false;
  }
}

type RoomSnapshotRow = { y_snapshot: string | null };

/**
 * Supabase rooms.y_snapshot 을 Y.Doc 으로 복원합니다.
 * cold start 시 y-partykit `load` 옵션에 넘깁니다.
 */
export async function loadRoomSnapshotDoc(
  roomSlug: string,
  env: Record<string, unknown>,
): Promise<Y.Doc | null> {
  const cfg = readPartySupabaseEnv(env);
  if (!cfg) return null;

  const endpoint =
    `${cfg.url}/rest/v1/rooms?slug=eq.${encodeURIComponent(roomSlug)}` +
    "&select=y_snapshot";

  let res: Response;
  try {
    res = await fetch(endpoint, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Accept: "application/json",
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const rows = (await res.json()) as RoomSnapshotRow[];
  const snapshot = rows[0]?.y_snapshot ?? null;
  if (!snapshot || !snapshotLooksLikeBlockNoteContent(snapshot)) {
    return null;
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, decodeBase64ToUint8Array(snapshot));
  return doc;
}

/** y-partykit `load` 콜백 팩토리 — 방 slug 마다 cold start 시 DB seed */
export function createRoomSnapshotLoader(
  roomSlug: string,
  env: Record<string, unknown>,
): () => Promise<Y.Doc | null> {
  return () => loadRoomSnapshotDoc(roomSlug, env);
}
