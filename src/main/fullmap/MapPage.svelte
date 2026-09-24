<script lang="ts">
  import FullMap from './FullMap.svelte';
  import AtlasMap from './AtlasMap.svelte';
  let {visible=true}=$props<{visible?:boolean}>();
  let hd=$state(false),visited=$state(false);
</script>
<div class="page"><div class="switch"><button aria-pressed={!hd} onclick={()=>hd=false}>Bản đồ chiến thuật</button><button aria-pressed={hd} onclick={()=>{hd=true;visited=true;}}>ERA HD · 16K</button><span>HD: ảnh theo vùng khi zoom · Chiến thuật: dẫn đường, điểm hẹn và minimap</span></div><div class="body"><div class="view" style:display={hd?'none':null}><FullMap visible={visible&&!hd}/></div>{#if visited}<div class="view" style:display={hd?null:'none'}><AtlasMap visible={visible&&hd}/></div>{/if}</div></div>
<style>.page{display:flex;height:100%;flex-direction:column}.switch{display:flex;gap:8px;padding:8px 12px;align-items:center;flex-wrap:wrap;font-size:12px}.switch button{padding:7px 12px;border:1px solid var(--color-border);border-radius:8px}.switch button[aria-pressed=true]{color:var(--color-accent)}span{color:var(--color-muted)}.body{flex:1;min-height:0;position:relative}.view{height:100%}</style>
