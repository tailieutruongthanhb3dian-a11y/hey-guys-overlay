import { primeHudRows } from "../lib/prime-hud";
import { config, alerts, nearestFriend, destination, direction, focusedPrime, AlertEpisodes, isFresh } from "../lib/companion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { EraLive } from "../lib/era-live";
// HUD chỉ số khủng long chạy trong cửa sổ riêng để kéo và đổi kích thước độc lập.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { frameBudget } from "../lib/frame-budget";
import {
  PANEL_H,
  PANEL_ROW_H,
  QUEST_HEADER_H,
  QUEST_PAD_H,
  QUEST_ROW_H,
  renderInfo,
  type DinoBars,
  type MinimapState,
  type QuestRow,
} from "../minimap/render";

type Settings = Record<string, any>;
type EraPlayer = { prime?: unknown; healthPercent?: number; staminaPercent?: number; hungerPercent?: number; thirstPercent?: number; growthPercent?: number; exactVitals?:Record<string,unknown> };
type EraSnapshot = {
  status: string;
  receivedAt: number;
  data?: { player?: EraPlayer };
};

const canvas = document.getElementById("dino-info") as HTMLCanvasElement;
const dragHandle = document.getElementById("drag-handle")!;
const resizeHandle = document.getElementById("resize-handle")!;
let settings: Settings = {};
let era: EraSnapshot | null = null;
let snapshotBusy = false, snapshotRevision = 0;
let width = 280;
const assistantStrip = document.createElement("div");
assistantStrip.style.cssText = "box-sizing:border-box;height:64px;padding:5px 10px;background:rgba(10,13,9,.94);color:#d0d6e0;font:11px/17px Segoe UI,sans-serif;overflow:hidden;border-radius:6px;pointer-events:none";
canvas.after(assistantStrip);
const soundGate = new AlertEpisodes();
let nativeVisible = false, visibilityRevision = 0;
let stripSignature = "";
let canvasSignature = "";
let audioContext: AudioContext | undefined;
let previousPrime: number | null = null, primeNoticeUntil = 0;
function assistantPaint() {
  const c = config(settings.companion), live = era as EraLive | null;
  assistantStrip.hidden = !c.hud || (settings.position_source ?? "era") !== "era";
  if (assistantStrip.hidden) {canvas.style.outline="none";return;}
  const warnings = alerts(live, c), friend = nearestFriend(live), target = destination(live, settings);
  const far = c.alerts && friend && friend.distanceM > c.squadDistance;
  const prime = live?.status === "online" && Date.now() - live.receivedAt < 5000 && live.data?.player?.prime?.available ? live.data.player.prime.completed : undefined;
  if (typeof prime === "number") { if (previousPrime !== null && prime > previousPrime) primeNoticeUntil = Date.now() + 10000; previousPrime = prime; } else previousPrime = null;
  const lines = [warnings.join(" · ") || (far ? `Xa đội · ${friend.name} ${Math.round(friend.distanceM)} m` : isFresh(live) ? "Chỉ số nhận được trong ngưỡng" : "Chờ dữ liệu mới · Tạm ngưng cảnh báo"), target ? `${direction(target.bearingDeg)} ${Math.round(target.bearingDeg)}° · ${Math.round(target.distanceM)} m → ${target.name}` : "La bàn · Chọn điểm đến trong Trợ lý", primeNoticeUntil > Date.now() && typeof prime === "number" ? `✓ Prime có tiến triển · ${prime}/10` : "Trợ lý sinh tồn · ERA"];
  const signature = lines.join("\n");
  if (signature !== stripSignature) {
    stripSignature = signature;
    assistantStrip.replaceChildren(...lines.map(text => { const el=document.createElement("div");el.textContent=text;el.style.cssText="white-space:nowrap;overflow:hidden;text-overflow:ellipsis";return el; }));
  }
  assistantStrip.style.color = warnings.length || far ? "#ffd591" : "#d0d6e0";
  canvas.style.outline = warnings.length ? "1px solid #e8a33d" : "none";
  const soundKeys = [...warnings.map(w => w.split(" thấp")[0]), ...(far ? ["squad"] : []), ...(typeof prime === "number" && primeNoticeUntil > Date.now() ? [`prime-${prime}`] : [])];
  if(soundGate.take(soundKeys,Date.now(),c.cooldown,c.sound && nativeVisible && !document.hidden)) {
    try { audioContext ??= new AudioContext(); void audioContext.resume().then(()=>{if(!nativeVisible || document.hidden || !config(settings.companion).sound)return;const oscillator=audioContext!.createOscillator(),gain=audioContext!.createGain();oscillator.connect(gain);gain.connect(audioContext!.destination);oscillator.frequency.value=660;gain.gain.setValueAtTime(.04,audioContext!.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext!.currentTime+.18);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start();oscillator.stop(audioContext!.currentTime+.2);}).catch(()=>{}); } catch {}
  }
}

const state: MinimapState = {
  position:null,trailPx:[],pois:[],waypoints:[],nearestWaypoint:null,basemap:null,freshwater:null,
  miniScale:1,pxPerM:1,sizePx:280,radiusM:600,opacity:.85,showTrail:false,showWaypoints:false,
  showFreshwater:false,panelH:PANEL_H + PANEL_ROW_H,dino:null,questsH:0,quests:[],questLang:"vi",
  compassLetters:["B","Đ","N","T"],hintText:"",headingLabel:"",headingUnknown:"",
};

const valid = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const bar = (value: unknown) => ({ current: valid(value), max: 100 });
function vitalPercent(player: EraPlayer | undefined, key: string, direct: unknown): number | null {
  const percent = valid(direct);
  if (percent !== null) return percent;
  const vitals = (player as {exactVitals?:Record<string,unknown>} | undefined)?.exactVitals;
  const current = vitals?.[key];
  const max = vitals?.[`max${key[0].toUpperCase()}${key.slice(1)}`];
  return typeof current === "number" && typeof max === "number" && Number.isFinite(current) && Number.isFinite(max) && current >= 0 && max > 0
    ? valid(current / max * 100)
    : null;
}

function applySettings(next: Settings) {
  settings = next;
  width = Math.max(180, Math.min(600, Number(next.dino_hud?.width_px ?? window.innerWidth ?? 280)));
  state.sizePx = width;
  state.opacity = Number(next.minimap?.opacity ?? .85);
  state.questLang = next.language === "en" ? "en" : "vi";
  document.body.classList.toggle("editing", next.minimap?.free_position === true && next.minimap?.click_through === false);
  recomputeGeometry();
}

function recomputeGeometry() {
  if ((settings.position_source ?? "era") === "era") {
    state.panelH = PANEL_H + PANEL_ROW_H;
    state.questsH = settings.dino_hud?.show_prime !== false ? QUEST_HEADER_H + (config(settings.companion).primeFocus ? 3 : 10) * QUEST_ROW_H + QUEST_PAD_H : 0;
  } else {
    const ip = settings.islepilot ?? {};
    state.panelH = ip.enabled && (ip.show_overlay_panel ?? true)
      ? PANEL_H + (state.dino?.stamina ? PANEL_ROW_H : 0)
      : 0;
    state.questsH = ip.enabled && (ip.show_quests_panel ?? false) && state.quests.length
      ? QUEST_HEADER_H + state.quests.length * QUEST_ROW_H + QUEST_PAD_H
      : 0;
  }
}

function paint() {
  state.questTitle = (settings.position_source ?? "era") === "era" && config(settings.companion).primeFocus ? "Prime · Việc ưu tiên" : undefined;
  if ((settings.position_source ?? "era") === "era") {
    const fresh = era?.status === "online" && Date.now() - era.receivedAt < 5000;
    const player = fresh ? era?.data?.player : undefined;
    state.quests = config(settings.companion).primeFocus ? focusedPrime(era as EraLive | null, config(settings.companion)) : primeHudRows(player?.prime, fresh);
    state.dino = {
      percentages:true,
      hp:bar(vitalPercent(player, "health", player?.healthPercent)),
      hunger:bar(vitalPercent(player, "hunger", player?.hungerPercent)),
      thirst:bar(vitalPercent(player, "thirst", player?.thirstPercent)),
      stamina:bar(vitalPercent(player, "stamina", player?.staminaPercent)),
      growthPct:vitalPercent(player, "growth", player?.growthPercent),
    };
  }
  recomputeGeometry();
  const signature=JSON.stringify([width,window.devicePixelRatio,state.panelH,state.questsH,state.dino,state.quests,state.questLang,state.questTitle,state.opacity]);
  if(signature!==canvasSignature){canvasSignature=signature;renderInfo(canvas, state, width);}
  assistantPaint();
}

const draw = frameBudget(paint, 60);
window.addEventListener("pagehide", () => draw.cancel());
window.addEventListener("pointerdown", event => {
  if (event.button === 0 && settings.minimap?.free_position && !settings.minimap?.click_through) {
    void invoke("drag_hud").catch(() => {});
  }
});
dragHandle.addEventListener("pointerdown", event => {
  event.preventDefault();
  event.stopPropagation();
  void invoke("drag_hud").catch(() => {});
});
resizeHandle.addEventListener("pointerdown", event => {
  event.preventDefault();
  event.stopPropagation();
  if (settings.minimap?.free_position && settings.minimap?.click_through === false) void invoke("resize_hud").catch(() => {});
});
new ResizeObserver(() => {
  if (window.innerWidth >= 180) {
    width = Math.min(600, window.innerWidth);
    state.sizePx = width;
    draw();
  }
}).observe(document.documentElement);

interface DinoUpdate {
  player: { growthPct:number|null;health:{current:number|null;max:number|null}|null;hunger:{current:number|null;max:number|null}|null;thirst:{current:number|null;max:number|null}|null;stamina?:{current:number|null;max:number|null}|null;primeQuests?:QuestRow[] } | null;
}
function applyDino(update: DinoUpdate) {
  if ((settings.position_source ?? "era") === "era") return;
  if (!update.player) {state.dino=null;state.quests=[];return;}
  state.dino = {
    hp:update.player.health ?? {current:null,max:null},hunger:update.player.hunger ?? {current:null,max:null},
    thirst:update.player.thirst ?? {current:null,max:null},stamina:update.player.stamina ?? null,growthPct:update.player.growthPct,
  } satisfies DinoBars;
  state.quests = update.player.primeQuests ?? [];
}

async function init() {
  await listen<boolean>("hud://visibility", event => {visibilityRevision++;nativeVisible=event.payload;draw();});
  const revision=visibilityRevision;
  void getCurrentWindow().isVisible().then(value=>{if(revision===visibilityRevision)nativeVisible=value;}).catch(()=>{});
  applySettings(await invoke<Settings>("get_settings"));
  await listen<Settings>("settings://changed", event => { applySettings(event.payload); draw(); });
  await listen<EraSnapshot>("era://live", event => { snapshotRevision++; era = event.payload; draw(); });
  await listen<DinoUpdate>("dino://update", event => { applyDino(event.payload); draw(); });
  await syncSnapshot();
  try {
    const current = await invoke<{lastUpdate:DinoUpdate|null}>("islepilot_state");
    if (current.lastUpdate) applyDino(current.lastUpdate);
  } catch {}
  draw();
}

// Đọc lại snapshot cục bộ mỗi giây: HUD mới mở hoặc vừa được WebView phục hồi
// không phải chờ event kế tiếp mới có HP/growth. Lệnh này không tạo request mạng.
async function syncSnapshot() {
  if (snapshotBusy) return;
  snapshotBusy = true; const revision = snapshotRevision;
  try {
    const latest = await invoke<EraSnapshot | null>("era_live_state");
    if (latest && revision === snapshotRevision) era = latest;
  } catch {}
  finally { snapshotBusy = false; }
  draw();
}
// Dữ liệu vẫn hết hạn đúng giờ ngay cả khi RPC đọc snapshot bị treo.
setInterval(() => { draw(); void syncSnapshot(); }, 1000);
void init().catch(() => { draw(); });
