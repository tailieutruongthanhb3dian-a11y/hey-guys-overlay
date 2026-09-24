<script lang="ts">
  import { t } from "$lib/i18n";
</script>
<footer class="app-footer flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-3 py-1 text-xs" style="border-color: var(--color-border); background: var(--color-panel); color: var(--color-muted)">
  <span><strong style="color: var(--color-text)">v{__APP_VERSION__}</strong> · {$t("footer.reload_hint")}</span>
  <span>{$t("footer.developed_by")} <strong style="color: var(--color-text)">Thanh Chillil · Hey Guys Team</strong></span>
</footer>
