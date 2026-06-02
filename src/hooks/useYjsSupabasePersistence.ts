import { useCallback, useEffect, useRef } from "react";
import type { Doc } from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type YPartyKitProvider from "y-partykit/provider";
import {
  isLikelyYDocContentRemoval,
  readYDocPersistenceSignature,
  yDocPersistenceSignatureChanged,
  type YDocPersistenceSignature,
} from "../lib/blocknoteYjs";
import { updateRoomTitle, upsertRoomYjsSnapshot } from "../lib/roomsRepo";

const DEBOUNCE_MS = 2000;
const TITLE_DEBOUNCE_MS = 600;
/** 탭 닫힘 시 flush 가 완료될 때까지 기다리는 상한(ms) */
const HIDE_FLUSH_TIMEOUT_MS = 2500;

/**
 * Y.Doc 변경을 디바운스하여 Supabase `rooms.y_snapshot`에 반영합니다.
 * - 블록 삭제 등 구조 축소는 즉시 flush
 * - 제목 변경은 y_snapshot 없이 title 컬럼만 갱신
 * - 탭 숨김/닫힘/unmount 시 await flush 로 debounce 창 유실 완화
 */
export function useYjsSupabasePersistence(
  ydoc: Doc,
  slug: string,
  title: string,
  supabase: SupabaseClient | null,
  enabled: boolean,
  provider?: YPartyKitProvider | null,
): void {
  const titleRef = useRef(title);
  const flushingRef = useRef(false);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const flushSnapshot = useCallback(async () => {
    if (!supabase || !enabled || flushingRef.current) return;
    flushingRef.current = true;
    try {
      await upsertRoomYjsSnapshot(supabase, slug, titleRef.current, ydoc);
    } finally {
      flushingRef.current = false;
    }
  }, [enabled, slug, supabase, ydoc]);

  const flushSnapshotBestEffort = useCallback(async () => {
    if (!supabase || !enabled) return;
    try {
      await Promise.race([
        flushSnapshot(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, HIDE_FLUSH_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // pagehide 직후 네트워크 중단 등
    }
  }, [enabled, flushSnapshot, supabase]);

  useEffect(() => {
    if (!enabled || !supabase) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSignature: YDocPersistenceSignature = readYDocPersistenceSignature(ydoc);

    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flushSnapshot();
      }, DEBOUNCE_MS);
    };

    const onUpdate = () => {
      const nextSignature = readYDocPersistenceSignature(ydoc);
      if (!yDocPersistenceSignatureChanged(lastSignature, nextSignature)) return;

      const contentRemoved = isLikelyYDocContentRemoval(lastSignature, nextSignature);
      lastSignature = nextSignature;

      if (contentRemoved) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        void flushSnapshot();
        return;
      }

      schedule();
    };

    ydoc.on("update", onUpdate);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushSnapshotBestEffort();
      }
    };
    const onPageHide = () => {
      void flushSnapshotBestEffort();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      ydoc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (timer !== null) clearTimeout(timer);
      void flushSnapshotBestEffort();
    };
  }, [enabled, flushSnapshot, flushSnapshotBestEffort, slug, supabase, ydoc]);

  // PartyKit 끊김 직전 스냅샷 flush — cold start 시 서버 load 가 최근 내용을 받도록
  useEffect(() => {
    if (!enabled || !provider) return;

    const onStatus = (payload: unknown) => {
      const status = Array.isArray(payload)
        ? (payload[0] as { status?: string } | undefined)?.status
        : (payload as { status?: string } | null)?.status;
      if (status === "disconnected") {
        void flushSnapshotBestEffort();
      }
    };

    provider.on("status", onStatus);
    return () => {
      provider.off("status", onStatus);
    };
  }, [enabled, provider, flushSnapshotBestEffort]);

  // 제목만 변경 — y_snapshot 을 다시 쓰지 않음
  useEffect(() => {
    if (!enabled || !supabase) return;
    const t = setTimeout(() => {
      void updateRoomTitle(supabase, slug, titleRef.current);
    }, TITLE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, supabase, slug, title]);
}
