import type * as Party from "partykit/server";
import type { YPartyKitOptions } from "y-partykit";
import { createRoomSnapshotLoader } from "./loadRoomSnapshot";

const BASE_Y_OPTS = { persist: false, gc: true } as const;

/** PartyKit room 마다 Supabase cold start load 를 포함한 y-partykit 옵션 */
export function buildYPartyKitOptions(room: Party.Room): YPartyKitOptions {
  return {
    ...BASE_Y_OPTS,
    load: createRoomSnapshotLoader(room.id, room.env),
  };
}
