import { readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export interface EraLive {
  intervalMs?: number;
  latencyMs?: number;
  status: "online" | "offline" | "login" | "error";
  receivedAt: number;
  error?: string;
  data?: { mapSource?: string; mapFriends?: EraMapFriend[]; player?: { prime?: { available?: boolean; total?: number; completed?: number; eligible?: boolean; message?: string; conditions?: { id?: number | string; name?: string; complete?: boolean }[] }; name?: string; class?: string; skinColors?: string[]; growthPercent?: number; healthPercent?: number; staminaPercent?: number; hungerPercent?: number; thirstPercent?: number; exactVitals?: Record<string,unknown>; location?: { x: number; y: number; z?: number } } };
}
export interface EraMapFriend { steamId: string; name: string; class?: string; growthPercent?: number; healthPercent?: number; px: number; py: number; xCm: number; yCm: number }
export const eraLive = readable<EraLive | null>(null, set => {
  let active = true, revision = 0, busy = false;
  const off = listen<EraLive>("era://live", e => { revision++; if (active) set(e.payload); });
  async function sync() {
    if (!active || busy) return;
    busy = true; const started = revision;
    try { const value = await invoke<EraLive | null>("era_live_state"); if (active && revision === started && value) set(value); }
    catch { /* Giữ thời điểm cũ để giao diện tự loại dữ liệu hết hạn. */ }
    finally { busy = false; }
  }
  void off.then(sync).catch(sync);
  const timer = setInterval(() => void sync(), 2000);
  const resume = () => { if (!document.hidden) void sync(); };
  document.addEventListener("visibilitychange", resume);
  return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", resume); void off.then(fn => fn()).catch(() => {}); };
});
export function percent(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value.toFixed(1)}%` : "—"; }
