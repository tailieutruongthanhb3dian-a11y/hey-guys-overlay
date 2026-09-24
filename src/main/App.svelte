<script lang="ts">
  // Main window shell: tab navigation (map | settings | guide), the
  // exclusive-fullscreen warning banner, and locale bootstrapping.
  import { onMount } from "svelte";
  import {
    getDataStatus,
    getFullscreenMode,
    getSettings,
    listenerBag,
    onFetchFinished,
    onFullmapShow,
    onHotkeyFailed,
    onDinoLoginFailed,
    onDinoLoginOk,
    onDinoLoginStarted,
    onDinoAuthExpired,
    onSettingsChanged,
    islepilotState,
    islepilotTokenLogin,
    simulatePosition,
    trackFeature,
    type DataStatus,
    type FailedHotkey,
    type Feature,
  } from "$lib/api";
  import { locale, t, type Locale } from "$lib/i18n";
  import FullMap from "./fullmap/FullMap.svelte";
  import Footer from "./Footer.svelte";
  import WebLink from "./WebLink.svelte";
  import brandLogo from "../assets/hey-guys-logo.svg";
  import DinoPage from "./dino/DinoPage.svelte";
  import EraLivePanel from "./era/EraLivePanel.svelte";
  import GaragePage from "./garage/GaragePage.svelte";
  import SkinStudio from "./skin/SkinStudio.svelte";
  import Settings from "./settings/Settings.svelte";
  import Guide from "./guide/Guide.svelte";
  import Donate from "./donate/Donate.svelte";
  import FirstRun from "./firstrun/FirstRun.svelte";
  import QuickSwitcher from "./QuickSwitcher.svelte";
  import EraTab from "./era/EraTab.svelte";
  import Companion from "./Companion.svelte";

  type Tab = "map" | "dino" | "garage" | "skin" | "settings" | "guide" | "donate" | "era" | "companion";
  const TAB_ORDER: Tab[] = ["map", "dino", "garage", "skin", "settings", "guide", "donate", "era", "companion"];
  const hashTab = location.hash.slice(1) as Tab;
  const initialTab = TAB_ORDER.includes(hashTab)
    ? (location.hash.slice(1) as Tab)
    : "era";

  // Lucide-style tab icons (24x24, stroke = currentColor) as inline path
  // markup — no icon library, and the color follows the button state.
  const TAB_ICONS: Record<Tab, string> = {
    companion: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    era: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    dino: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
    garage:
      '<path d="M22 8.35V20a2 2 0 0 1-2 2h-4v-9H8v9H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/>',
    skin: '<path d="M12 2a5 5 0 0 0-5 5c0 1.8.95 3.38 2.38 4.26A6 6 0 0 0 5 17v3h14v-3a6 6 0 0 0-4.38-5.74A5 5 0 0 0 12 2Z"/><path d="M9 7h.01M15 7h.01M9.5 16c1.4-1.1 3.6-1.1 5 0"/><path d="m4 13-2 2m18-2 2 2"/>',
    settings:
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    guide:
      '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    donate:
      '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  };
  let tab = $state<Tab>(initialTab);
  // Write-back so F5 restores the tab the user was on (the hash was already
  // read above; nothing ever wrote it). replaceState: no history spam.
  $effect(() => {
    history.replaceState(null, "", `#${tab}`);
  });
  // Which tabs people actually open. Everything else is counted in Rust, so
  // the hotkey and UI paths to the same action share one counter.
  // Deliberately a total Record, not Partial: adding a tab without deciding
  // how it is counted should be a compile error, not a silent zero.
  const TAB_FEATURE: Record<Tab, Feature | null> = {
    companion: null,
    era: null,
    map: "fullmap_open",
    dino: "dino_tab_open",
    garage: null,
    skin: null,
    settings: "settings_open",
    guide: "guide_open",
    donate: "donate_open",
  };
  // The first run of this effect is where the app OPENED — the default tab,
  // or whatever hash a reload restored — not somewhere the user went. It is
  // skipped: counting it inflated fullmap_open by one per launch, and
  // launches are already counted on the Rust side.
  let tabEffectPrimed = false;
  $effect(() => {
    const feature = TAB_FEATURE[tab];
    if (!tabEffectPrimed) {
      tabEffectPrimed = true;
      return;
    }
    if (feature) trackFeature(feature);
  });
  // Map, Dino and Garage tabs are KEPT ALIVE after their first visit (hidden
  // with display:none, not unmounted). Dino/Garage host a 3D viewer whose
  // teardown/rebuild made tab switching visibly laggy; the map is a Leaflet
  // instance over ~630 POI objects behind a 16-call IPC chain, and telemetry
  // shows people come back to it about twice a session. First visit still
  // lazy-mounts so an untouched tab costs nothing.
  let visitedMap = $state(false);
  let visitedDino = $state(false);
  let visitedGarage = $state(false);
  let visitedSkin = $state(false);
  $effect(() => {
    if (tab === "map") visitedMap = true;
    if (tab === "dino") visitedDino = true;
    if (tab === "garage") visitedGarage = true;
    if (tab === "skin") visitedSkin = true;
  });
  let dataStatus = $state<DataStatus | null>(null);
  let exclusiveFullscreen = $state(false);
  let failedHotkeys = $state<FailedHotkey[]>([]);
  let ready = $state(false);
  let startupError = $state("");
  // Remount FullMap when the basemap changes ({#key} below): the imageOverlay
  // bounds and every layer's px change together, so a rebuild IS the correct
  // "in-place" update. Seeded before ready=true — no spurious first remount.
  let basemapSource = $state("vulnona");
  let steamConnected = $state(false);
  let steamConnecting = $state(false);
  let steamLoginError = $state(false);
  // `?quick` is a dev-only visual-QA entry point; production always starts closed.
  let quickSwitcherOpen = $state(
    import.meta.env.DEV && new URLSearchParams(location.search).has("quick"),
  );

  // Update prompt: silent check on launch, non-blocking banner, only ever in
  // this window — never over the game.
  let updateVersion = $state<string | null>(null);
  let updating = $state(false);
  let pendingUpdate: import("@tauri-apps/plugin-updater").Update | null = null;

  async function checkForUpdate() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        pendingUpdate = update;
        updateVersion = update.version;
      }
    } catch {
      // Offline or endpoint not set up yet — stay silent.
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return;
    updating = true;
    try {
      await pendingUpdate.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      updating = false;
    }
  }

  // POIs are optional (fail-soft: the map works without dots); the basemap
  // images are the hard requirement.
  const dataOk = $derived(
    dataStatus !== null && dataStatus.basemapMinimap && dataStatus.basemapFullmap,
  );

  onMount(() => {
    const bag = listenerBag();
    (async () => {
      const settings = await getSettings();
      locale.set((settings.language as Locale) ?? "vi");
      basemapSource = settings.map?.basemap ?? "vulnona";
      dataStatus = await getDataStatus();
      try {
        const account = await islepilotState();
        steamConnected = account.tokenPresent;
        steamConnecting = account.loginActive;
      } catch {
        // Account status is optional; never hold the map shell hostage.
      }
      exclusiveFullscreen = (await getFullscreenMode()) === 0;
      await bag.add(
        onSettingsChanged((s) => {
          locale.set((s.language as Locale) ?? "vi");
          basemapSource = s.map?.basemap ?? "vulnona";
          void islepilotState()
            .then((state) => {
              steamConnected = state.tokenPresent;
              steamConnecting = state.loginActive;
            })
            .catch(() => {});
        }),
      );
      await bag.add(
        onDinoLoginStarted((mode) => {
          if (mode === "token") steamConnecting = true;
          steamLoginError = false;
        }),
      );
      await bag.add(
        onDinoLoginOk(() => {
          steamConnecting = false;
          steamLoginError = false;
          void islepilotState()
            .then((state) => (steamConnected = state.tokenPresent))
            .catch(() => {});
        }),
      );
      await bag.add(
        onDinoLoginFailed((reason) => {
          steamConnecting = false;
          steamLoginError = reason !== "cancelled";
        }),
      );
      await bag.add(
        onDinoAuthExpired(() => {
          steamConnected = false;
        }),
      );
      await bag.add(onHotkeyFailed((failed) => (failedHotkeys = failed)));
      // Full-map hotkey mid-game: land on the map, not the last-open tab.
      await bag.add(onFullmapShow(() => (tab = "map")));
      // The download can finish while the user is on another tab (FirstRun
      // unmounted) — the App itself must notice and unlock the map tab.
      await bag.add(onFetchFinished(() => void getDataStatus().then((d) => (dataStatus = d))));
      ready = true;
      void checkForUpdate();
    })().catch(() => { startupError = "Chưa tải được dữ liệu khởi động. Kiểm tra ứng dụng Windows hoặc kết nối rồi thử tải lại."; });
    return () => bag.dispose();
  });

  // Dev-only: walk south-east to exercise the pipeline without the game.
  let simX = -231654;
  function simulateStep() {
    simX += 30_000;
    void simulatePosition(simX, 52099.673, 0);
  }

  async function connectSteam() {
    if (steamConnected) {
      tab = "dino";
      return;
    }
    steamConnecting = true;
    steamLoginError = false;
    try {
      await islepilotTokenLogin();
    } catch {
      steamConnecting = false;
      steamLoginError = true;
    }
  }

  function handleShellKeydown(event: KeyboardEvent) {
    if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      quickSwitcherOpen = !quickSwitcherOpen;
      return;
    }
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && TAB_ORDER[index]) {
      event.preventDefault();
      tab = TAB_ORDER[index];
    }
  }
</script>

<svelte:window onkeydown={handleShellKeydown} />

<div class="app-shell flex h-screen flex-col">
  <header
    class="app-header flex shrink-0 items-center gap-1 border-b px-3 py-2"
    style="border-color: var(--color-border); background: var(--color-panel)"
  >
    <div class="app-brand" aria-label={$t("app.title")}>
      <img class="brand-logo" src={brandLogo} alt="" width="36" height="36" />
      <span class="brand-copy">
        <span class="brand-title">{$t("app.title")}</span>
        <span class="brand-subtitle">{$t("app.subtitle")}</span>
      </span>
    </div>
    <nav class="tab-nav" aria-label={$t("app.title")}>
    {#each [["era", $t("tab.era")], ["map", $t("tab.map")], ["dino", $t("tab.dino")], ["garage", $t("tab.garage")], ["skin", $t("tab.skin")], ["companion", "Trợ lý"], ["settings", $t("tab.settings")]] as [key, label] (key)}
      <button
        class:active={tab === key}
        class="tab-button flex cursor-pointer items-center gap-1.5 rounded px-3 py-1 text-sm"
        aria-current={tab === key ? "page" : undefined}
        title={`${label} · Ctrl+${TAB_ORDER.indexOf(key as Tab) + 1}`}
        onclick={() => (tab = key as Tab)}
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {@html TAB_ICONS[key as Tab]}
        </svg>
        <span>{label}</span>
      </button>
    {/each}
    </nav>
    <button
      class="quick-open-button cursor-pointer"
      aria-label={$t("quick.open")}
      title={`${$t("quick.open")} · Ctrl+K`}
      onclick={() => (quickSwitcherOpen = true)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.8-3.8"></path>
      </svg>
      <span>{$t("quick.open")}</span>
      <kbd>Ctrl K</kbd>
    </button>
    <div
      class="app-status"
      role="status"
      aria-live="polite"
      title={dataOk ? $t("app.map_ready") : $t("app.map_syncing")}
    >
      <span class:loading={!dataOk} class="status-dot"></span>
      <span>{dataOk ? $t("app.ready") : $t("app.sync")}</span>
    </div>
    {#if tab !== "era" && tab !== "garage" && tab !== "skin" && tab !== "dino" && tab !== "map"}<button
      class:connected={steamConnected}
      class:error={steamLoginError}
      class="steam-account-button cursor-pointer"
      disabled={steamConnecting || !ready}
      aria-busy={steamConnecting}
      aria-label={steamConnected ? $t("dino.logged_in") : $t("dino.login")}
      title={steamLoginError
        ? $t("dino.login_failed")
        : steamConnected
          ? $t("dino.logged_in")
          : $t("dino.token_login_hint")}
      onclick={() => void connectSteam()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11.98 2a10 10 0 0 0-9.97 9.2l5.36 2.22a2.8 2.8 0 0 1 1.58-.49l2.39-3.47v-.05a3.72 3.72 0 1 1 3.72 3.72h-.08l-3.42 2.44a2.81 2.81 0 1 1-5.46.87L2.3 14.86A10 10 0 1 0 11.98 2Zm-4.84 15.87-1.23-.51a2.1 2.1 0 0 0 1.17 1.09 2.07 2.07 0 0 0 2.71-1.1 2.05 2.05 0 0 0-1.08-2.69 2 2 0 0 0-.82-.16l1.27.53a1.52 1.52 0 0 1-1.17 2.8l-.87-.36Zm7.92-5.98a2.48 2.48 0 1 0 0-4.96 2.48 2.48 0 0 0 0 4.96Zm0-.62a1.86 1.86 0 1 1 0-3.72 1.86 1.86 0 0 1 0 3.72Z"/>
      </svg>
      <span>{steamConnecting ? $t("app.steam_connecting") : steamConnected ? $t("dino.logged_in") : $t("dino.login")}</span>
      {#if steamConnected}<span class="account-check" aria-hidden="true">✓</span>{/if}
    </button>{/if}
    {#if import.meta.env.DEV}
      <button
        class="cursor-pointer rounded border px-2 py-0.5 text-xs"
        style="border-color: var(--color-border); color: var(--color-muted)"
        onclick={simulateStep}
      >
        +300 m (dev)
      </button>
    {/if}
    <WebLink />
  </header>
  {#if startupError}<div class="notice-bar" role="alert"><span>{startupError}</span><button onclick={() => location.reload()}>Tải lại ứng dụng</button></div>{/if}
  {#if tab === "map"}<EraLivePanel compact />{/if}

  {#if steamLoginError}
    <div class="notice-bar steam-error-banner" role="alert">
      <span>{$t("dino.login_failed")}</span>
      <button onclick={() => (tab = "dino")}>{$t("app.login_help")}</button>
      <button
        class="steam-error-close"
        aria-label={$t("btn.close")}
        title={$t("btn.close")}
        onclick={() => (steamLoginError = false)}
      >×</button>
    </div>
  {/if}

  {#if updateVersion}
    <div
      class="notice-bar flex shrink-0 items-center gap-3 px-3 py-2 text-sm"
      style="background: #1e3a2f; color: #a7f3d0"
    >
      {updating
        ? $t("update.installing")
        : $t("update.available", { version: updateVersion })}
      {#if !updating}
        <button
          class="cursor-pointer rounded px-2 py-0.5 font-medium"
          style="background: #34d399; color: #0b2018"
          onclick={() => void installUpdate()}
        >
          {$t("update.install")}
        </button>
        <button class="cursor-pointer underline" onclick={() => (updateVersion = null)}>
          {$t("update.later")}
        </button>
      {/if}
    </div>
  {/if}

  {#if failedHotkeys.length > 0}
    <div
      class="notice-bar shrink-0 px-3 py-2 text-sm"
      style="background: #4a1a10; color: #ffb4a1"
    >
      {$t("warn.hotkey_summary")}
      <button class="ml-2 cursor-pointer underline" onclick={() => (tab = "settings")}>{$t("settings.hotkeys")}</button>
      <button
        class="ml-2 cursor-pointer underline"
        onclick={() => (failedHotkeys = [])}
      >
        {$t("btn.close")}
      </button>
      <details class="mt-1">
        <summary class="cursor-pointer">{$t("warn.hotkey_details")}</summary>
        {failedHotkeys.map((f) => `${f.spec} (${$t(`hotkey.${f.action}` as never)})`).join(", ")}
      </details>
    </div>
  {/if}

  {#if exclusiveFullscreen}
    <div
      class="notice-bar shrink-0 px-3 py-2 text-sm"
      style="background: #4a3210; color: #ffd591"
    >
      ⚠ {$t("warn.exclusive_fullscreen")}
      <button
        class="ml-2 cursor-pointer underline"
        onclick={() => (exclusiveFullscreen = false)}
      >
        {$t("btn.close")}
      </button>
    </div>
  {/if}

  <main class="content-stage min-h-0 flex-1">
    {#if ready}<div class="h-full overflow-y-auto" style:display={tab === "companion" ? null : "none"}><Companion visible={tab === "companion"}/></div>{/if}
    {#if !ready}
      <div class="p-6" style="color: var(--color-muted)">…</div>
    {:else if tab === "map" && !dataOk}
      <!-- Only the map needs the downloaded data; the other tabs must stay
           usable during (and before) the first-run download. The map itself
           lives in the kept-alive block below. -->
      <FirstRun oncomplete={() => void getDataStatus().then((d) => (dataStatus = d))} />
    {:else if tab === "era"}
      <div class="h-full overflow-y-auto"><EraTab /></div>
    {:else if tab === "settings"}
      <div class="h-full overflow-y-auto"><Settings /></div>
    {:else if tab === "donate"}
      <div class="h-full overflow-y-auto"><Donate /></div>
    {:else if tab === "guide"}
      <div class="h-full overflow-y-auto"><Guide /></div>
    {/if}
    <!-- Kept-alive tabs (see visitedMap/visitedDino/visitedGarage above).
         All are error-isolated: a Leaflet throw, a failure in the IslePilot
         integration or the 3D viewer must never take down the shell (and
         its tab bar) or any other feature. -->
    {#if ready && dataOk && visitedMap}
      <div class="map-tab-pane h-full min-h-0" style:visibility={tab === "map" ? "visible" : "hidden"} inert={tab !== "map"} aria-hidden={tab !== "map"}>
        {#key basemapSource}
          <svelte:boundary>
            <FullMap visible={tab === "map"} />
            {#snippet failed(_error, reset)}
              <div class="mx-auto max-w-lg p-8">
                <p class="mb-3 text-sm" style="color: #ff8a80">{$t("map.crashed")}</p>
                <button
                  class="cursor-pointer rounded border px-3 py-1 text-sm"
                  style="border-color: var(--color-border)"
                  onclick={reset}
                >
                  {$t("btn.retry")}
                </button>
              </div>
            {/snippet}
          </svelte:boundary>
        {/key}
      </div>
    {/if}
    {#if ready && visitedDino}
      <div class="h-full overflow-y-auto" style:display={tab === "dino" ? null : "none"}>
        <svelte:boundary>
            <DinoPage />
          {#snippet failed(_error, reset)}
            <div class="mx-auto max-w-lg p-8">
              <p class="mb-3 text-sm" style="color: #ff8a80">{$t("dino.crashed")}</p>
              <button
                class="cursor-pointer rounded border px-3 py-1 text-sm"
                style="border-color: var(--color-border)"
                onclick={reset}
              >
                {$t("btn.retry")}
              </button>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>
    {/if}
    {#if ready && visitedGarage}
      <div class="h-full overflow-y-auto" style:display={tab === "garage" ? null : "none"}>
        <svelte:boundary>
            <GaragePage visible={tab === "garage"} />
          {#snippet failed(_error, reset)}
            <div class="mx-auto max-w-lg p-8">
              <p class="mb-3 text-sm" style="color: #ff8a80">{$t("dino.crashed")}</p>
              <button
                class="cursor-pointer rounded border px-3 py-1 text-sm"
                style="border-color: var(--color-border)"
                onclick={reset}
              >
                {$t("btn.retry")}
              </button>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>
    {/if}
    {#if ready && visitedSkin}
      <div class="h-full overflow-y-auto" style:display={tab === "skin" ? null : "none"}>
        <svelte:boundary>
          <SkinStudio visible={tab === "skin"} />
          {#snippet failed(_error, reset)}
            <div class="mx-auto max-w-lg p-8">
              <p class="mb-3 text-sm" style="color: #ff8a80">{$t("skin.crashed")}</p>
              <button
                class="cursor-pointer rounded border px-3 py-1 text-sm"
                style="border-color: var(--color-border)"
                onclick={reset}
              >
                {$t("btn.retry")}
              </button>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>
    {/if}
  </main>

  <Footer />
</div>

<QuickSwitcher
  open={quickSwitcherOpen}
  {steamConnected}
  {steamConnecting}
  onclose={() => (quickSwitcherOpen = false)}
  onselect={(next) => {
    quickSwitcherOpen = false;
    tab = next;
  }}
  onconnect={() => void connectSteam()}
/>
