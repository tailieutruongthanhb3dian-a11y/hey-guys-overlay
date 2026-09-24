import type { EraLive } from "./era-live";
import { navigation } from "./tactical";
import { primeHudRows } from "./prime-hud";

export const vitalNames = { healthPercent: "Máu", hungerPercent: "Thức ăn", thirstPercent: "Nước", staminaPercent: "Thể lực" };
export type VitalKey = keyof typeof vitalNames;
export type CompanionConfig = { alerts: boolean; sound: boolean; cooldown: number; squadDistance: number; hud: boolean; primeFocus: boolean; pinned: number[]; thresholds: Record<VitalKey, number> };
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function config(value: any): CompanionConfig {
  const c = value ?? {};
  return { alerts: c.alerts !== false, sound: c.sound === true, cooldown: number(c.cooldown, 60, 15, 600), squadDistance: number(c.squadDistance, 1000, 100, 10000), hud: c.hud !== false, primeFocus: c.primeFocus === true,
    pinned: Array.isArray(c.pinned) ? [...new Set<number>(c.pinned.filter((n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10))].slice(0, 3) : [],
    thresholds: Object.fromEntries(Object.keys(vitalNames).map(k => [k, number(c.thresholds?.[k], 20, 1, 90)])) as Record<VitalKey, number> };
}
// Đồng hồ giao diện cập nhật mỗi giây, có thể chậm hơn event vừa đến một nhịp.
export function isFresh(live: EraLive | null, now = Date.now()) { return live?.status === "online" && Number.isFinite(live.receivedAt) && now - live.receivedAt >= -1000 && now - live.receivedAt < 5000; }
export function playerPoint(live: EraLive | null, now = Date.now()) {
  const p = isFresh(live, now) ? live?.data?.player?.location : null;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { xCm: p.y, yCm: p.x } : null;
}
export function alerts(live: EraLive | null, c: CompanionConfig, now = Date.now()) {
  if (!c.alerts || !isFresh(live, now)) return [];
  const p = live?.data?.player;
  return (Object.keys(vitalNames) as VitalKey[]).flatMap(key => {
    const v = p?.[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= c.thresholds[key] ? [`${vitalNames[key]} thấp · ${Math.round(v)}%`] : [];
  });
}
export function nearestFriend(live: EraLive | null, now = Date.now()) {
  const from = playerPoint(live, now);
  if (!from) return null;
  return (live?.data?.mapFriends ?? []).filter(f => Number.isFinite(f.xCm) && Number.isFinite(f.yCm)).map(f => ({ ...f, ...navigation(from, f) })).sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
}
export function direction(bearing: number) { return ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"][Math.round(bearing / 45) % 8]; }
export function destination(live: EraLive | null, settings: any, now = Date.now()) {
  const from = playerPoint(live, now);
  if (!from) return null;
  const targetId = settings?.minimap?.era_target;
  const target = targetId ? live?.data?.mapFriends?.find(f => f.steamId === targetId) : settings?.minimap?.destination;
  if (!target || !Number.isFinite(target.xCm) || !Number.isFinite(target.yCm)) return null;
  return { name: String(target.name || "Điểm đến"), ...navigation(from, target) };
}
export function focusedPrime(live: EraLive | null, c: CompanionConfig, now = Date.now()) {
  const rows = primeHudRows(live?.data?.player?.prime, isFresh(live, now));
  if (!c.primeFocus) return rows;
  const pending = rows.map((row, i) => ({ ...row, id: i + 1 })).filter(row => !row.completed);
  return [...pending.filter(row => c.pinned.includes(row.id)), ...pending.filter(row => !c.pinned.includes(row.id))].slice(0, 3);
}
export class AlertGate {
  private last = -Infinity;
  take(active: boolean, now: number, cooldown: number) {
    if (!active || now - this.last < cooldown * 1000) return false;
    this.last = now; return true;
  }
}
// Mỗi loại cảnh báo chỉ phát một lần cho tới khi đã hết ít nhất 5 giây.
export class AlertEpisodes {
  private seen = new Map<string, number>();
  private last = -Infinity;
  take(keys: string[], now: number, cooldown: number, audible: boolean) {
    const active = new Set(keys);
    for (const [key, at] of this.seen) if (!active.has(key) && now - at >= 5000) this.seen.delete(key);
    const novel = keys.some(key => !this.seen.has(key));
    for (const key of keys) if (this.seen.has(key) || !audible) this.seen.set(key, now);
    if (!audible || !novel || now - this.last < cooldown * 1000) return false;
    for (const key of keys) this.seen.set(key, now);
    this.last = now; return true;
  }
}

export type RoutePoint = { xCm: number; yCm: number; at: number; move: boolean };
export type Journey = { id: string; name: string; species: string; start: number; end: number; observedMs: number; distance: number; growthStart: number | null; growthEnd: number | null; primeStart: number | null; primeEnd: number | null; route: RoutePoint[]; milestones: string[] };
export function restoreJourney(j: any): Journey | null {
  if (!j || typeof j.id !== "string" || typeof j.name !== "string" || typeof j.species !== "string" || !Number.isFinite(j.start) || !Number.isFinite(j.end) || j.end < j.start || !Number.isFinite(j.observedMs) || j.observedMs < 0 || !Number.isFinite(j.distance) || j.distance < 0 || !Array.isArray(j.route) || !Array.isArray(j.milestones)) return null;
  return {...j,name:j.name.slice(0,100),species:j.species.slice(0,100),route:j.route.filter((p:any)=>p && Number.isFinite(p.xCm) && Number.isFinite(p.yCm) && Number.isFinite(p.at)).slice(-1800),milestones:j.milestones.filter((m:unknown)=>typeof m === "string").slice(-30)};
}
const pct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const primeCount = (p: any) => p?.available === true && Number.isInteger(p.completed) && p.completed >= 0 && p.completed <= 10 ? p.completed as number : null;
export function startJourney(live: EraLive, now: number): Journey {
  const p = live.data?.player;
  return { id: String(now), name: p?.name || "Nhân vật", species: p?.class || "Chưa rõ loài", start: now, end: now, observedMs: 0, distance: 0, growthStart: pct(p?.growthPercent), growthEnd: pct(p?.growthPercent), primeStart: primeCount(p?.prime), primeEnd: primeCount(p?.prime), route: [], milestones: [] };
}
// Không nối đường qua mất mạng, dịch chuyển bất thường hoặc dữ liệu lặp.
export function sampleJourney(j: Journey, live: EraLive, now: number): Journey {
  if (!isFresh(live, now) || live.receivedAt <= j.end && j.route.length > 0) return j;
  const p = live.data?.player, point = playerPoint(live, now), at = live.receivedAt;
  const last = j.route.at(-1), dt = at - j.end;
  if (dt > 0 && dt <= 5000) j.observedMs += dt;
  if (point) {
    const delta = last ? navigation(last, point).distanceM : 0;
    const connected = !!last && at - last.at > 0 && at - last.at <= 5000 && delta <= (at - last.at) / 1000 * 100;
    if (connected) j.distance += delta;
    j.route.push({ ...point, at, move: !connected });
    // Giới hạn dung lượng, giữ cả đầu và cuối hành trình bằng giảm mẫu.
    if (j.route.length > 1800) {
      const before = j.route;
      j.route = before.filter((_, i) => i % 2 === 0 || i === before.length - 1).map(p => {
        const i = before.indexOf(p);
        return { ...p, move: p.move || (i > 0 && before[i - 1].move) };
      });
    }
  }
  const growth = pct(p?.growthPercent), prime = primeCount(p?.prime);
  if (growth !== null && j.growthEnd !== null && Math.floor(growth / 10) > Math.floor(j.growthEnd / 10)) j.milestones.push(`Tăng trưởng ${Math.round(growth)}%`);
  if (prime !== null && j.primeEnd !== null && prime > j.primeEnd) j.milestones.push(`Prime ${prime}/10`);
  j.milestones = j.milestones.slice(-30);
  if (growth !== null) j.growthEnd = growth;
  if (prime !== null) j.primeEnd = prime;
  j.end = at;
  return j;
}
export function routePath(route: RoutePoint[], width = 600, height = 200) {
  if (!route.length) return "";
  const xs = route.map(p => p.yCm), ys = route.map(p => p.xCm);
  const minX = Math.min(...xs), minY = Math.min(...ys), scale = Math.min((width - 24) / Math.max(1, Math.max(...xs) - minX), (height - 24) / Math.max(1, Math.max(...ys) - minY));
  return route.map((p, i) => `${i === 0 || p.move ? "M" : "L"}${(12 + (p.yCm - minX) * scale).toFixed(1)},${(12 + (p.xCm - minY) * scale).toFixed(1)}`).join(" ");
}
