<script lang="ts">
  import GarageTab from "./GarageTab.svelte";
  import EraGarage from "../era/EraGarage.svelte";
  let { visible = true } = $props<{ visible?: boolean }>();
  let provider = $state("era");
</script>
<div class="provider"><label for="garage-provider">Server</label><select id="garage-provider" bind:value={provider}><option value="era">ERA Gaming VN</option><option value="islepilot">IslePilot</option></select></div>
<div style:display={provider === "era" ? null : "none"}><EraGarage visible={visible && provider === "era"} /></div>
{#if provider === "islepilot"}<GarageTab {visible} />{/if}
<style>.provider{display:flex;align-items:center;gap:12px;padding:20px 28px 0}select{padding:8px 12px;background:var(--color-panel);border:1px solid var(--color-border);border-radius:8px}</style>
