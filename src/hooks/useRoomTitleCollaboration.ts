import { useCallback, useEffect } from "react";
import type { Doc } from "yjs";
import * as Y from "yjs";
import {
  getRoomTitleFromYDoc,
  ROOM_META_MAP,
  setRoomTitleInYDoc,
} from "../lib/blocknoteYjs";

/**
 * 방 제목을 Yjs `room-meta` 맵으로 PartyKit 실시간 동기화합니다.
 * - 로컬 입력 → ydoc map set → 다른 클라이언트 observe
 * - 원격 변경 → 로컬 React state 갱신 (transaction.local 은 무시)
 */
export function useRoomTitleCollaboration(
  ydoc: Doc,
  title: string,
  onTitleChange: (title: string) => void,
  enabled: boolean,
): (nextTitle: string) => void {
  // 에디터 준비 후 DB 에서 받은 초기 제목을 ydoc 에 한 번 시드
  useEffect(() => {
    if (!enabled) return;
    const existing = getRoomTitleFromYDoc(ydoc);
    if (existing == null && title.trim()) {
      setRoomTitleInYDoc(ydoc, title);
    }
  }, [enabled, ydoc, title]);

  // 원격 제목 변경 수신
  useEffect(() => {
    if (!enabled) return;
    const map = ydoc.getMap(ROOM_META_MAP);
    const onMapChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      if (transaction.local) return;
      const remote = getRoomTitleFromYDoc(ydoc);
      if (remote == null) return;
      onTitleChange(remote);
    };
    map.observe(onMapChange);
    return () => map.unobserve(onMapChange);
  }, [enabled, ydoc, onTitleChange]);

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      onTitleChange(nextTitle);
      if (!enabled) return;
      setRoomTitleInYDoc(ydoc, nextTitle);
    },
    [enabled, onTitleChange, ydoc],
  );

  return handleTitleChange;
}
