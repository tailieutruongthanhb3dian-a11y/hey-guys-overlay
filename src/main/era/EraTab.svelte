<script lang="ts">
  import { onMount } from "svelte";
  import OverlayControls from "./OverlayControls.svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { t } from "$lib/i18n";
  import { eraOpen, eraFinishLogin, eraFriends, eraSearch, eraFriendAction, type EraFriends, type EraPlayer, type FriendAction } from "$lib/era";

  let overview = $state<EraFriends | null>(null);
  let loading = $state(false);
  let connecting = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let query = $state("");
  let results = $state<EraPlayer[] | null>(null);
  let searchBusy = $state(false);
  let searchGeneration = 0;
  let alive = true;
  let loginDeadline = 0;
  const related = $derived(new Set([
    ...(overview?.friends ?? []), ...(overview?.incoming ?? []), ...(overview?.outgoing ?? []),
  ].map((p) => p.steamId)));

  function report(e: unknown) {
    const text = String(e);
    if (text.includes("ERA_LOGIN_REQUIRED")) {
      overview = null;
      results = null;
      notice = "";
      error = "";
      return;
    }
    error = text.includes("ERA_NETWORK") ? $t("era.network_error") : text;
  }
  async function refresh() {
    if (loading || !alive) return;
    loading = true;
    try {
      const data = await eraFriends();
      if (!alive) return;
      overview = data;
      if (connecting) void eraFinishLogin().catch(() => {});
      connecting = false;
      error = "";
    } catch (e) { if (alive) report(e); }
    finally { loading = false; }
  }
  async function connect() {
    error = "";
    connecting = true;
    loginDeadline = Date.now() + 180_000;
    try { await eraOpen(true); }
    catch (e) { connecting = false; report(e); }
  }
  async function openLiveMap() {
    try { await eraOpen(false); } catch (e) { report(e); }
  }
  async function search() {
    const text = query.trim();
    if (text.length < 2 || searchBusy) return;
    const generation = ++searchGeneration;
    searchBusy = true;
    error = "";
    notice = "";
    try {
      const data = await eraSearch(text);
      if (alive && generation === searchGeneration) results = data.players ?? [];
    } catch (e) { if (alive) report(e); }
    finally { if (generation === searchGeneration) searchBusy = false; }
  }
  async function act(action: FriendAction, player: EraPlayer) {
    if (busy || loading) return;
    busy = true;
    try {
      if (action === "friend-remove" && !(await ask($t("era.remove_confirm", { name: player.name }), { title: "ERA Gaming VN", kind: "warning" }))) return;
      error = "";
      await eraFriendAction(action, player.steamId);
      if (action === "friend-request") { results = null; notice = $t("era.invite_sent", { name: player.name }); }
      await refresh();
    } catch (e) { report(e); }
    finally { busy = false; }
  }
  onMount(() => {
    alive = true;
    void refresh();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      if (connecting && Date.now() > loginDeadline) {
        connecting = false;
        error = $t("era.login_timeout");
      }
      if (document.visibilityState === "visible" && (connecting || ticks % 12 === 0)) void refresh();
    }, 5_000);
    return () => { alive = false; searchGeneration++; clearInterval(timer); };
  });
</script>

<div class="era-page">
  <OverlayControls />
  <section class="era-welcome">
    <div><p class="era-eyebrow">THE ISLE · ERA GAMING VN</p>
      <h1>{$t("era.title")}</h1><p>{overview ? $t("era.connected_hint") : $t("era.subtitle")}</p></div>
    <span class="era-state" class:connected={!!overview}>{overview ? $t("era.connected") : $t("era.not_connected")}</span>
  </section>
  {#if error}<div class="era-error" role="alert">{error}<button onclick={() => void refresh()}>{$t("btn.retry")}</button></div>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if !overview}
    <section class="era-connect">
      <h2>{$t("era.connect_title")}</h2>
      <p>{$t("era.connect_hint")}</p>
      <button class="primary" disabled={connecting} onclick={() => void connect()}>{connecting ? $t("era.waiting_steam") : $t("era.connect")}</button>
      {#if connecting}<p role="status">{$t("era.complete_steam")}</p>{/if}
      <button class="text-button" disabled={loading} onclick={() => void refresh()}>{$t("era.check_session")}</button>
    </section>
  {:else}
    <div class="era-columns">
      <section class="era-card">
        <h2>{$t("era.find_friends")}</h2><p>{$t("era.find_hint")}</p>
        <form class="era-search" onsubmit={(e) => { e.preventDefault(); void search(); }}>
          <input aria-label={$t("era.search_placeholder")} placeholder={$t("era.search_placeholder")} maxlength="40" bind:value={query} />
          <button class="primary" disabled={searchBusy || query.trim().length < 2}>{searchBusy ? $t("era.searching") : $t("era.search")}</button>
        </form>
        {#if results}
          <div aria-live="polite">
          {#each results as p (p.steamId)}
            <div class="era-person"><span><strong>{p.name}</strong><small>{p.class ?? "The Isle"}</small></span>
              <button class="primary" disabled={busy || related.has(p.steamId)} onclick={() => void act("friend-request", p)}>{related.has(p.steamId) ? $t("era.already_related") : $t("era.add")}</button></div>
          {:else}<p>{$t("era.no_results")}</p>{/each}
          </div>
        {/if}
        <h2 class="era-section-title">{$t("era.incoming")} <span>{overview.incoming?.length ?? 0}</span></h2>
        {#each overview.incoming ?? [] as p (p.steamId)}
          <div class="era-person"><strong>{p.name}</strong><div class="era-actions">
            <button class="primary" disabled={busy} onclick={() => void act("friend-accept", p)}>{$t("era.accept")}</button>
            <button disabled={busy} onclick={() => void act("friend-decline", p)}>{$t("era.decline")}</button>
          </div></div>
        {:else}<p>{$t("era.no_incoming")}</p>{/each}
      </section>
      <section class="era-card">
        <div class="era-row"><h2>{$t("era.friends")} <span>{overview.friends?.length ?? 0}</span></h2><button disabled={loading || busy} onclick={() => void refresh()}>{$t("era.refresh")}</button></div>
        {#each [...(overview.friends ?? [])].sort((a,b) => Number(!!b.online) - Number(!!a.online)) as p (p.steamId)}
          <div class="era-person"><span><strong>{p.name}</strong><small>{p.online ? $t("era.online") : $t("era.offline")}{p.online && p.class ? ` · ${p.class}` : ""}</small></span>
            <button class="text-button" disabled={busy} onclick={() => void act("friend-remove", p)}>{$t("era.remove")}</button></div>
        {:else}<p>{$t("era.no_friends")}</p>{/each}
        <details><summary>{$t("era.outgoing")} ({overview.outgoing?.length ?? 0})</summary>
          {#each overview.outgoing ?? [] as p (p.steamId)}
            <div class="era-person"><strong>{p.name}</strong><button disabled={busy} onclick={() => void act("friend-cancel", p)}>{$t("era.cancel")}</button></div>
          {/each}
        </details>
      </section>
    </div>
  {/if}
  <section class="era-card era-row"><div><h2>{$t("era.live_title")}</h2><p>{$t("era.live_hint")}</p></div>
    <button onclick={() => void openLiveMap()}>{$t("era.open_live")}</button>
  </section>
</div>

<style>
  .era-page { max-width: 1100px; margin: auto; padding: 32px; color: var(--color-text); font: 400 14px/1.5 system-ui, "Segoe UI", sans-serif; }
  .era-welcome,.era-row,.era-person { display:flex; justify-content:space-between; align-items:center; gap:16px; }
  .era-welcome { margin-bottom:24px; }
  .era-eyebrow { font-size:12px; letter-spacing:.4px; }
  h1 { font-size:28px; line-height:1.2; font-weight:600; margin:8px 0; }
  h2 { font-size:20px; font-weight:500; margin:0 0 8px; }
  p,small { color:var(--color-muted); }
  p { margin:8px 0 16px; }
  .era-columns { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  .era-card,.era-connect { padding:24px; border:1px solid var(--color-border); background:var(--color-panel); border-radius:12px; margin-bottom:24px; }
  .era-connect { max-width:650px; }
  .era-state { white-space:nowrap; color:var(--color-muted); }
  .era-state.connected { color:var(--color-success); }
  button { min-height:40px; border-radius:8px; padding:8px 14px; border:1px solid var(--color-border); background:var(--color-panel-raised); color:var(--color-text); cursor:pointer; font-weight:500; }
  button.primary { background:var(--color-accent); color:var(--color-bg); border-color:var(--color-accent); }
  button:disabled { opacity:.5; cursor:default; }
  button:focus-visible,input:focus-visible,summary:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
  .text-button { background:transparent; }
  .era-search,.era-actions { display:flex; gap:8px; }
  .era-search button { white-space:nowrap; flex-shrink:0; }
  input { width:100%; min-width:0; padding:8px 12px; border:1px solid var(--color-border); background:var(--color-bg); color:var(--color-text); border-radius:8px; }
  .era-person { padding:12px 0; border-bottom:1px solid var(--color-border); }
  .era-person strong { overflow-wrap:anywhere; } small { display:block; }
  .era-section-title { margin-top:24px; } h2 span { color:var(--color-muted); }
  .era-error { padding:16px; border:1px solid var(--color-danger); border-radius:8px; margin-bottom:16px; }
  .era-error button { margin-left:12px; } summary { cursor:pointer; padding:16px 0; }
  @media(max-width:1000px) { .era-columns { grid-template-columns:1fr; gap:0; } .era-page { padding:24px; } }
</style>
