<script lang="ts">
  import { onMount } from "svelte";
  import { eraLive, percent } from "$lib/era-live";
  import { eraOpen } from "$lib/era";
  import OverlayControls from "./OverlayControls.svelte";
  import SuicideControl from "./SuicideControl.svelte";
  import PrimeTracker from "./PrimeTracker.svelte";
  import { exactVital } from "$lib/vitals";
  let { compact = false } = $props<{ compact?: boolean }>();
  let now = $state(Date.now());
  let connectError = $state("");
  const age = $derived($eraLive?.receivedAt ? Math.max(0, Math.floor((now - $eraLive.receivedAt) / 1000)) : null);
  const fresh = $derived($eraLive?.status === "online" && age !== null && age < 5);
  const player = $derived($eraLive?.data?.player);
  onMount(() => { const timer = setInterval(() => now = Date.now(), 1000); return () => clearInterval(timer); });
  async function connect() { try { await eraOpen(true); connectError = ""; } catch(e) { connectError = String(e); } }
</script>
<section class:compact aria-label="Dữ liệu trực tiếp ERA">
  <div class="status"><strong>ERA · {$eraLive?.status === "login" ? "Cần đăng nhập" : $eraLive?.status === "offline" ? "Dino offline" : fresh ? "Đang cập nhật" : $eraLive ? "Dữ liệu chưa cập nhật" : "Đang kết nối…"}</strong><span>{age === null ? "" : `Nhận ${age}s trước`} · Chu kỳ {($eraLive?.intervalMs ?? 1000) / 1000}s{typeof $eraLive?.latencyMs === "number" ? ` · Phản hồi ${$eraLive.latencyMs}ms` : ""}</span></div>
  {#if $eraLive?.status === "login"}<button onclick={() => void connect()}>Kết nối Steam ERA</button>{/if}
  {#if connectError}<p role="alert">{connectError}</p>{/if}
  {#if !compact}
    <OverlayControls />
    <h1>{player?.class || "Khủng long ERA"}</h1><p>{player?.name || "Vào server ERA bằng tài khoản Steam đã kết nối."}</p>
    <div class="stats">{#each [["Máu", player?.healthPercent, "health"], ["Thể lực", player?.staminaPercent, "stamina"], ["Thức ăn", player?.hungerPercent, "hunger"], ["Nước", player?.thirstPercent, "thirst"], ["Tăng trưởng", player?.growthPercent, "growth"]] as [label, value, key]}
      <div><span>{label}</span><strong>{fresh ? percent(value) : "—"}</strong>{#if fresh && exactVital(player?.exactVitals, String(key), value)}<small>{exactVital(player?.exactVitals, String(key), value)}</small>{/if}</div>
    {/each}</div>
    <p>Cao độ Z: {fresh && typeof player?.location?.z === "number" && Number.isFinite(player.location.z) ? `${(player.location.z / 100).toFixed(1)} m` : "—"} · Dữ liệu thiếu hiện “—”. Số liệu server có thể trễ so với game.</p>
    <SuicideControl />
    <PrimeTracker />
    {#if $eraLive?.status === "error"}<p role="alert">Mất kết nối ERA. App đang tự thử lại; số liệu cũ không được coi là hiện tại.</p>{/if}
  {/if}
</section>
<style>section{padding:28px;border-bottom:1px solid var(--color-border)}section.compact{padding:8px 16px;font-size:12px}.status{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.status span,p{color:var(--color-muted)}h1{font-size:28px;margin-top:24px}p{margin:12px 0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.stats div{padding:20px;border:1px solid var(--color-border);border-radius:12px}.stats strong{display:block;font-size:28px;margin-top:12px}button{padding:8px 12px;min-height:36px;border:1px solid var(--color-border);border-radius:8px;margin-top:12px}</style>
