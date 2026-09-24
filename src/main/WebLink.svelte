<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { isBrowser } from "$lib/web-transport";
  let code = $state(""), error = $state(""), expanded = $state(false);
  async function openWeb() {
    try {
      const pair = await invoke<{ code: string; url: string }>("web_bridge_pair");
      code = pair.code; expanded = true; error = "";
      await openUrl(pair.url);
    } catch(e) { error = String(e); expanded = true; }
  }
</script>
{#if !isBrowser}
  <div class="web-link"><button onclick={() => void openWeb()}>Mở bản web ↗</button>
    {#if expanded}<div class="pair"><strong>Ghép đôi trình duyệt trên máy này</strong><p>Web dùng chung phiên Steam và dữ liệu của ứng dụng. Giữ ứng dụng chạy khi dùng web.</p>{#if code}<label>Mã ghép đôi<input readonly value={code} onclick={e => e.currentTarget.select()} /></label>{/if}{#if error}<p role="alert">{error}</p>{/if}<button onclick={() => expanded = false}>Đóng</button></div>{/if}
  </div>
{:else}<span class="web-label">WEB · ĐÃ GHÉP ĐÔI</span>{/if}
<style>.web-link{position:relative}.web-link>button,.pair button{border:1px solid var(--color-border);border-radius:8px;padding:8px 12px;white-space:nowrap;cursor:pointer}.pair{position:absolute;right:0;top:42px;width:min(380px,90vw);z-index:1000;background:var(--color-surface,#10151d);border:1px solid var(--color-border);border-radius:12px;padding:20px;box-shadow:0 16px 40px #0008}.pair p{font-size:13px;margin:12px 0;color:var(--color-muted)}.pair label{font-size:12px}.pair input{width:100%;padding:10px;margin:8px 0;border:1px solid var(--color-border);border-radius:6px;background:transparent;font-family:monospace}.web-label{font-size:10px;white-space:nowrap;color:var(--color-muted)}</style>
