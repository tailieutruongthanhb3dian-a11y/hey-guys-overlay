<script lang="ts">
  import DinoTab from "./DinoTab.svelte";
  import EraLivePanel from "../era/EraLivePanel.svelte";
  let provider = $state("era");
</script>
<div class="provider"><label for="dino-provider">Server</label><select id="dino-provider" bind:value={provider}><option value="era">ERA Gaming VN</option><option value="islepilot">IslePilot</option></select></div>
{#if provider === "era"}<EraLivePanel />{:else}<DinoTab />{/if}
<style>.provider{display:flex;align-items:center;gap:12px;padding:20px 28px 0}select{padding:8px 12px;background:var(--color-panel);border:1px solid var(--color-border);border-radius:8px}</style>
