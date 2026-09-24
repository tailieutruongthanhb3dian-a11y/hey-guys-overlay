<script lang="ts">
  import { onMount } from "svelte";
  import { getSettings, patchSettings, onSettingsChanged, type Settings } from "$lib/api";
  let settings = $state<Settings | null>(null), busy = $state(false), error = $state("");
  onMount(() => {
    let alive = true, eventSeen = false;
    const off = onSettingsChanged(s => { eventSeen = true; if (alive) settings = s; });
    void off.then(() => getSettings()).then(s => { if (alive && !eventSeen) settings = s; }).catch(e => error = String(e));
    return () => { alive = false; void off.then(fn => fn()); };
  });
  async function toggle() {
    if (!settings || busy) return;
    busy = true;
    try { settings = await patchSettings({ minimap: { visible: !settings.minimap?.visible } }); error = ""; }
    catch(e) { error = String(e); }
    finally { busy = false; }
  }
</script>
<div class="controls"><label><input type="checkbox" checked={settings?.dino_hud?.show_prime !== false} onchange={e => void patchSettings({ dino_hud: { show_prime: e.currentTarget.checked } })} /> HUD nhiệm vụ Prime</label><button disabled={!settings} onclick={() => void patchSettings({ minimap: { click_through: !settings?.minimap?.click_through } })}>{settings?.minimap?.click_through ? "Cho phép bấm / zoom HUD" : "Cho chuột xuyên qua HUD"}</button></div>
<div class="controls"><button aria-pressed={settings?.minimap?.visible ?? false} disabled={!settings || busy} onclick={() => void toggle()}>{settings?.minimap?.visible ? "Tắt overlay" : "Bật overlay"}</button><span>{settings?.minimap?.require_game ? "Tự hiện khi The Isle đang chạy" : "Hiện cả ngoài game"} · Chỉnh kích thước và phím tắt trong Cài đặt</span>{#if error}<span role="alert">{error}</span>{/if}</div>
<style>.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0}button{min-height:36px;padding:8px 16px;border:1px solid var(--color-border);border-radius:8px;cursor:pointer}button[aria-pressed=true]{color:var(--color-accent)}span{font-size:12px;color:var(--color-muted)}</style>
