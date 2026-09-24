import { invoke } from "@tauri-apps/api/core";

export interface EraPlayer { steamId: string; name: string; online?: boolean; class?: string; growthPercent?: number }
export interface EraFriends { success: boolean; friends: EraPlayer[]; incoming: EraPlayer[]; outgoing: EraPlayer[] }
export type FriendAction = "friend-request" | "friend-accept" | "friend-decline" | "friend-cancel" | "friend-remove";
export const eraOpen = (login = false) => invoke<void>("era_open", { login });
export const eraFinishLogin = () => invoke<void>("era_finish_login");
export interface EraSlot { slot: number; stored: boolean; parkCommitted?: boolean; restoreInProgress?: boolean; storedDino?: { species?: string; growthPercent?: number; gender?: string; primeEligible?: boolean; mutations?: string[]; stateHash?: string } }
export interface EraGarageData { slotCount: number; isVip: boolean; onlinePawn: boolean; restoreInProgress?: boolean; slots: EraSlot[] }
export const eraGarageGet = (slot = 1) => invoke<{ data: EraGarageData }>("era_garage_get", { slot });
export const eraGarageAction = (action: "park" | "restore" | "delete", slot: number, stateHash?: string) => invoke("era_garage_action", { action, slot, stateHash });
export interface EraSkinPolicy {
  success: boolean;
  available?: boolean;
  arbitraryHex?: boolean;
  savedColors?: string[];
  cooldownRemainingSeconds?: number;
  message?: string;
}
export const eraSkinPolicy = () => invoke<EraSkinPolicy>("era_skin_policy");
export const eraSkinApply = (colors: string[]) => invoke<Record<string, unknown>>("era_skin_apply", { colors });
export interface EraSuicideStatus { success: boolean; available?: boolean; identityReady?: boolean; identitySource?: string; identityAgeSeconds?: number | string }
export const eraSuicideStatus = () => invoke<EraSuicideStatus>("era_suicide_status");
export const eraSelfSuicide = () => invoke<Record<string, unknown>>("era_self_suicide", { confirmed: true });
export const eraRequest = <T>(action: string, value?: string) => invoke<T>("era_request", { action, value });
export const eraFriends = () => eraRequest<EraFriends>("friends");
export function eraSearch(query: string) {
  const bytes = new TextEncoder().encode(query.trim());
  const value = btoa(String.fromCharCode(...bytes));
  return eraRequest<{ success: boolean; players: EraPlayer[] }>("friend-search", value);
}
export const eraFriendAction = (action: FriendAction, steamId: string) => eraRequest("" + action, steamId);
