<script lang="ts">
  import { onMount } from "svelte";
  import DinoViewer3D from "$lib/dino3d/DinoViewer3D.svelte";
  import {
    DEFAULT_PALETTE,
    DINO_MODELS,
    type DinoPalette,
  } from "$lib/dino3d/registry";
  import { eraLive } from "$lib/era-live";
  import { eraSkinApply, eraSkinPolicy, type EraSkinPolicy } from "$lib/era";
  import { t } from "$lib/i18n";

  let { visible = true } = $props<{ visible?: boolean }>();

  type SavedSkin = {
    name: string;
    species: string;
    colors: string[];
    updatedAt: number;
  };

  const STORAGE_KEY = "heyGuys.skinSlots.v1";
  const ZONES = ["body", "markings", "display", "flank", "underbelly", "detail", "eyes"] as const;
  const DEFAULT_COLORS = ["#16A34A", "#3F6212", "#EAB308", "#78350F", "#C08457", "#111827", "#F3F4F6"];
  const FREE_COLORS = ["#111827", "#F3F4F6", "#6B7280", "#DC2626", "#7F1D1D", "#F97316", "#EAB308", "#16A34A", "#3F6212", "#2563EB", "#0891B2", "#7C3AED", "#DB2777", "#78350F", "#C08457", "#D6B38B"];
  const PRESETS: Record<string, string[]> = {
    jungle: ["#16A34A", "#3F6212", "#EAB308", "#78350F", "#C08457", "#111827", "#F3F4F6"],
    ember: ["#7F1D1D", "#DC2626", "#F97316", "#78350F", "#EAB308", "#111827", "#F3F4F6"],
    royal: ["#111827", "#2563EB", "#7C3AED", "#DB2777", "#0891B2", "#6B7280", "#F3F4F6"],
  };
  const speciesOptions = Object.keys(DINO_MODELS).sort((a, b) => a.localeCompare(b));

  let species = $state("Tyrannosaurus");
  let colors = $state([...DEFAULT_COLORS]);
  let previewColors = $state([...DEFAULT_COLORS]);
  let slots = $state<(SavedSkin | null)[]>([null, null, null]);
  let selectedSlot = $state(0);
  let slotName = $state("");
  let policy = $state<EraSkinPolicy | null>(null);
  let loadingPolicy = $state(true);
  let applying = $state(false);
  let message = $state("");
  let messageKind = $state<"ok" | "bad" | "">("");
  let cooldownUntil = $state(0);
  let now = $state(Date.now());
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let speciesAdopted = false;
  let compareColors = $state<string[] | null>(null);
  let compareName = $state("");

  const player = $derived($eraLive?.data?.player);
  const online = $derived($eraLive?.status === "online" && !!player && now - $eraLive.receivedAt < 5000);
  const arbitraryHex = $derived(policy?.arbitraryHex === true);
  const cooldown = $derived(Math.max(0, Math.ceil((cooldownUntil - now) / 1000)));
  const previewPalette = $derived(toPreviewPalette(previewColors));

  function normalizeColors(input: unknown): string[] {
    if (!Array.isArray(input) || input.length !== 7) return [...DEFAULT_COLORS];
    return input.map((value, index) =>
      typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
        ? value.toUpperCase()
        : DEFAULT_COLORS[index],
    );
  }

  function toPreviewPalette(values: string[]): DinoPalette {
    return {
      ...DEFAULT_PALETTE,
      body: values[0],
      markings: values[1],
      display: values[2],
      flank: values[3],
      underbelly: values[4],
      detail: values[5],
      eyes: values[6],
    };
  }

  function resolveSpecies(value: string | undefined): string | null {
    if (!value) return null;
    if (DINO_MODELS[value]) return value;
    const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
    const aliases: Record<string, string> = {
      rex: "Tyrannosaurus",
      trex: "Tyrannosaurus",
      tyrannosaurusrex: "Tyrannosaurus",
      omni: "Omniraptor",
      utahraptor: "Omniraptor",
      deino: "Deinosuchus",
    };
    return aliases[normalized]
      ?? speciesOptions.find((option) => option.toLowerCase().replace(/[^a-z]/g, "") === normalized)
      ?? null;
  }

  function persistSlots() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slots)); return true; }
    catch { message = "Không lưu được skin. Bộ nhớ có thể đã đầy."; messageKind = "bad"; return false; }
  }

  function updateColor(index: number, value: string) {
    const next = [...colors];
    next[index] = value.toUpperCase();
    colors = next;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => (previewColors = [...next]), 70);
  }

  function loadSlot(index: number) {
    const saved = slots[index];
    selectedSlot = index;
    if (!saved) {
      slotName = "";
      return;
    }
    slotName = saved.name;
    species = DINO_MODELS[saved.species] ? saved.species : "Tyrannosaurus";
    colors = normalizeColors(saved.colors);
    previewColors = [...colors];
    message = $t("skin.loaded", { slot: index + 1 });
    messageKind = "ok";
  }

  function saveSlot() {
    const next = [...slots];
    next[selectedSlot] = {
      name: slotName.trim().slice(0, 32) || $t("skin.slot_default", { slot: selectedSlot + 1 }),
      species,
      colors: [...colors],
      updatedAt: Date.now(),
    };
    slots = next;
    slotName = next[selectedSlot]!.name;
    if (!persistSlots()) return;
    message = $t("skin.saved", { slot: selectedSlot + 1 });
    messageKind = "ok";
  }

  function deleteSlot(index: number) {
    const next = [...slots];
    next[index] = null;
    slots = next;
    if (selectedSlot === index) slotName = "";
    if (!persistSlots()) return;
    message = $t("skin.deleted", { slot: index + 1 });
    messageKind = "ok";
  }

  function applyPreset(values: string[]) {
    colors = normalizeColors(values);
    previewColors = [...colors];
  }

  function formatCooldown(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  async function refreshPolicy() {
    loadingPolicy = true;
    try {
      policy = await eraSkinPolicy();
      cooldownUntil = Date.now() + Math.max(0, Number(policy.cooldownRemainingSeconds) || 0) * 1000;
      const remote = normalizeColors(policy.savedColors);
      if (Array.isArray(policy.savedColors) && !slots.some(Boolean)) {
        colors = remote;
        previewColors = [...remote];
      }
      message = policy.available === false ? (policy.message || $t("skin.unavailable")) : "";
      messageKind = policy.available === false ? "bad" : "";
    } catch (error) {
      policy = null;
      message = String(error).includes("ERA_LOGIN_REQUIRED") ? $t("skin.login_required") : $t("skin.policy_error");
      messageKind = "bad";
    } finally {
      loadingPolicy = false;
    }
  }

  async function applySkin() {
    if (applying || !online || cooldown > 0 || policy?.available !== true) return;
    applying = true;
    message = $t("skin.applying");
    messageKind = "";
    try {
      const result = await eraSkinApply(colors);
      const remaining = Number(result.cooldownRemainingSeconds ?? 300);
      now = Date.now();
      cooldownUntil = now + Math.max(0, remaining) * 1000;
      message = $t("skin.applied");
      messageKind = "ok";
    } catch (error) {
      const text = String(error);
      const rate = /ERA_RATE_LIMIT:(\d+)/.exec(text);
      if (rate) cooldownUntil = Date.now() + Number(rate[1]) * 1000;
      message = text.includes("ERA_LOGIN_REQUIRED") ? $t("skin.login_required") : $t("skin.apply_error");
      messageKind = "bad";
    } finally {
      applying = false;
    }
  }

  $effect(() => {
    const current = resolveSpecies(player?.class);
    if (!speciesAdopted && current) {
      speciesAdopted = true;
      species = current;
      const liveColors = normalizeColors((player as { skinColors?: string[] }).skinColors);
      if (Array.isArray((player as { skinColors?: string[] }).skinColors)) {
        colors = liveColors;
        previewColors = [...liveColors];
      }
    }
  });

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) slots = [0, 1, 2].map((index) => { const s=saved[index]; return s && typeof s.name === "string" && typeof s.species === "string" && Array.isArray(s.colors) && s.colors.length === 7 ? {...s,name:s.name.slice(0,32),colors:normalizeColors(s.colors)} : null; });
    } catch {
      slots = [null, null, null];
    }
    void refreshPolicy();
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(previewTimer);
    };
  });
</script>

<div class="studio-shell">
  <header class="studio-header">
    <div>
      <span class="eyebrow">HEY GUYS · SKIN LAB</span>
      <h1>{$t("skin.title")}</h1>
      <p>{$t("skin.subtitle")}</p>
    </div>
    <div class:online class="server-state">
      <span></span>{online ? $t("skin.dino_online") : $t("skin.dino_offline")}
    </div>
  </header>

  <div class="studio-grid">
    <section class="preview-card">
      <div class="card-head">
        <div>
          <span>{$t("skin.preview")}</span>
          <strong>{species}</strong>
        </div>
        <select aria-label={$t("skin.species")} bind:value={species}>
          {#each speciesOptions as option}<option value={option}>{option}</option>{/each}
        </select>
      </div>
      <div class="viewer-frame">
        <DinoViewer3D active={visible} {species} palette={previewPalette} height={430} />
        <div class="viewer-tip">{$t("skin.rotate_hint")}</div>
      </div>
      <div class="panel"><button onclick={()=>{compareColors=[...colors];compareName=species;}}>Ghim phối màu A để so sánh</button>{#if compareColors}<p>A · {compareName}</p><div class="mini-palette">{#each compareColors as color}<i style:background={color}></i>{/each}</div><p>B · {species}</p><div class="mini-palette">{#each colors as color}<i style:background={color}></i>{/each}</div><button onclick={()=>{if(compareColors){const b=[...colors];applyPreset(compareColors);compareColors=b;}}}>Đổi A ↔ B trên mô hình</button><button onclick={()=>compareColors=null}>Bỏ so sánh</button>{/if}</div>
      <div class="apply-row">
        <div>
          <strong>{arbitraryHex ? $t("skin.vip") : $t("skin.free")}</strong>
          <small>{loadingPolicy ? $t("skin.checking") : !online ? $t("skin.enter_game") : cooldown > 0 ? $t("skin.cooldown", { time: formatCooldown(cooldown) }) : $t("skin.ready")}</small>
        </div>
        <button class="apply" disabled={applying || !online || loadingPolicy || cooldown > 0 || policy?.available !== true} onclick={() => void applySkin()}>
          {applying ? $t("skin.applying") : cooldown > 0 ? formatCooldown(cooldown) : $t("skin.apply")}
        </button>
      </div>
      {#if message}<p class:bad={messageKind === "bad"} class:ok={messageKind === "ok"} class="message" role="status">{message}</p>{/if}
    </section>

    <div class="controls-column">
      <section class="panel colors-panel">
        <div class="panel-title"><div><span>01</span><h2>{$t("skin.colors")}</h2></div><button onclick={() => applyPreset(DEFAULT_COLORS)}>{$t("skin.reset")}</button></div>
        <div class="presets">
          {#each Object.entries(PRESETS) as [name, values]}
            <button onclick={() => applyPreset(values)}>{#each values as color}<i style:background={color}></i>{/each}<span>{$t(`skin.preset_${name}` as never)}</span></button>
          {/each}
        </div>
        <div class="color-grid">
          {#each ZONES as zone, index}
            <label>
              <span>{$t(`skin.zone_${zone}` as never)}</span>
              <div class="color-control">
                <input type="color" aria-label={$t(`skin.zone_${zone}` as never)} value={colors[index]} disabled={!arbitraryHex} oninput={(event) => updateColor(index, event.currentTarget.value)} />
                <code>{colors[index]}</code>
              </div>
              {#if !arbitraryHex}
                <select aria-label={$t(`skin.zone_${zone}` as never)} value={colors[index]} onchange={(event) => updateColor(index, event.currentTarget.value)}>
                  {#each FREE_COLORS as color}<option value={color}>{color}</option>{/each}
                </select>
              {/if}
            </label>
          {/each}
        </div>
      </section>

      <section class="panel slots-panel">
        <div class="panel-title"><div><span>02</span><h2>{$t("skin.saved_skins")}</h2></div><em>{slots.filter(Boolean).length}/3</em></div>
        <div class="slot-list">
          {#each slots as saved, index}
            <div class="slot-row">
              <button class:selected={selectedSlot === index} class="slot" onclick={() => loadSlot(index)}>
                <span class="slot-number">0{index + 1}</span>
                <span class="slot-copy"><strong>{saved?.name || $t("skin.empty_slot")}</strong><small>{saved?.species || $t("skin.not_saved")}</small></span>
                {#if saved}<span class="mini-palette">{#each saved.colors as color}<i style:background={color}></i>{/each}</span>{/if}
              </button>
              {#if saved}<button class="delete" aria-label={$t("skin.delete_slot", { slot: index + 1 })} onclick={() => deleteSlot(index)}>×</button>{/if}
            </div>
          {/each}
        </div>
        <div class="save-row">
          <input maxlength="32" bind:value={slotName} placeholder={$t("skin.name_placeholder")} />
          <button onclick={saveSlot}>{$t("skin.save_slot", { slot: selectedSlot + 1 })}</button>
        </div>
        <p>{$t("skin.storage_hint")}</p>
      </section>
    </div>
  </div>
</div>

<style>
  .studio-shell{min-height:100%;padding:28px;background:radial-gradient(circle at 15% 5%,rgba(168,85,181,.08),transparent 32%)}
  .studio-header{max-width:1420px;margin:0 auto 22px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.eyebrow{font-size:10px;letter-spacing:.2em;color:#bc73c7;font-weight:700}.studio-header h1{font-size:30px;font-weight:650;letter-spacing:-.035em;margin-top:6px}.studio-header p{font-size:13px;color:var(--color-muted);margin-top:5px}.server-state{display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid var(--color-border);border-radius:8px;color:var(--color-muted);font-size:12px}.server-state span{width:7px;height:7px;border-radius:50%;background:#e8a33d}.server-state.online span{background:#45d483;box-shadow:0 0 10px #45d48399}
  .studio-grid{max-width:1420px;margin:auto;display:grid;grid-template-columns:minmax(460px,1.05fr) minmax(430px,.95fr);gap:18px}.preview-card,.panel{background:rgba(13,19,29,.96);border:1px solid var(--color-border);border-radius:12px;overflow:hidden}.card-head{height:66px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--color-border)}.card-head>div{display:grid;gap:3px}.card-head span,.panel-title span{font-size:10px;letter-spacing:.12em;color:var(--color-muted);text-transform:uppercase}.card-head strong{font-size:18px}.card-head select,select,input{background:#080d15;border:1px solid var(--color-border);border-radius:7px;padding:8px 10px;color:var(--color-text)}.viewer-frame{position:relative;background:#070a0f}.viewer-tip{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:5px 9px;border-radius:6px;background:#05070acc;color:#b8c2d1;font-size:10px;pointer-events:none}.apply-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px;border-top:1px solid var(--color-border)}.apply-row>div{display:grid;gap:4px}.apply-row small{color:var(--color-muted)}button{cursor:pointer}.apply{min-width:160px;padding:11px 18px;border-radius:8px;background:#a855b5;color:white;font-weight:650;box-shadow:0 0 22px #a855b533}.apply:hover:not(:disabled){background:#bd6ac8}.apply:disabled{opacity:.38;cursor:not-allowed}.message{margin:0 17px 17px;padding:9px 11px;border-radius:7px;background:#202838;color:#cbd5e1;font-size:12px}.message.ok{background:#123425;color:#7ce8aa}.message.bad{background:#3a191d;color:#ff9ba7}
  .controls-column{display:grid;gap:18px;align-content:start}.panel{padding:17px}.panel-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.panel-title>div{display:flex;align-items:center;gap:9px}.panel-title h2{font-size:16px;font-weight:650}.panel-title button{font-size:11px;color:var(--color-muted)}.panel-title em{font-size:11px;color:#bc73c7;font-style:normal}.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.presets button{display:flex;align-items:center;padding:7px;border:1px solid var(--color-border);border-radius:7px;background:#090e16}.presets i{width:11px;height:20px}.presets i:first-child{border-radius:4px 0 0 4px}.presets span{margin-left:7px;font-size:10px;color:var(--color-muted)}.color-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.color-grid label{padding:9px;border:1px solid rgba(81,105,138,.34);border-radius:8px;background:#0a0f18}.color-grid label>span{display:block;font-size:11px;color:#aab4c3;margin-bottom:7px}.color-control{display:flex;align-items:center;gap:8px}.color-control input{width:34px;height:28px;padding:2px}.color-control code{font-size:11px;color:#d8dee8}.color-grid select{width:100%;margin-top:7px;padding:5px;font-size:10px}
  .slot-list{display:grid;gap:7px}.slot-row{display:flex;gap:7px}.slot{min-width:0;flex:1;display:flex;align-items:center;text-align:left;padding:9px;border:1px solid var(--color-border);border-radius:8px;background:#090e16}.slot.selected{border-color:#a855b5;box-shadow:inset 3px 0 #a855b5}.slot-number{font:600 11px ui-monospace;color:#677386;margin-right:10px}.slot-copy{display:grid;min-width:105px}.slot-copy strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slot-copy small{font-size:10px;color:var(--color-muted)}.mini-palette{display:flex;margin-left:auto}.mini-palette i{width:9px;height:25px}.delete{width:34px;border:1px solid var(--color-border);border-radius:8px;color:#ff8995}.save-row{display:flex;gap:8px;margin-top:12px}.save-row input{min-width:0;flex:1}.save-row button{padding:8px 12px;border-radius:7px;background:#273448;font-size:11px}.slots-panel p{margin-top:10px;font-size:10px;color:var(--color-muted)}
  @media(max-width:1050px){.studio-grid{grid-template-columns:1fr}.viewer-frame :global(.viewer-bg){height:360px!important}}@media(max-width:620px){.studio-shell{padding:16px}.studio-header{align-items:flex-start;flex-direction:column}.color-grid{grid-template-columns:1fr}.presets{grid-template-columns:1fr}.apply-row{align-items:stretch;flex-direction:column}.apply{width:100%}}
</style>
