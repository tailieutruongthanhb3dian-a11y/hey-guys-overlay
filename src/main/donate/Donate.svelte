<script lang="ts">
  import { locale } from "$lib/i18n";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import logo from "../../assets/hey-guys-logo.svg";
</script>
<section class="surface-card mx-auto my-8 max-w-xl border p-8" style="border-radius:12px; border-color:var(--color-border)">
  <img src={logo} alt="Hey Guys Team" width="96" height="96" class="mb-6" />
  <h1 class="text-2xl font-semibold">Hey Guys Overlay</h1>
  <p class="mt-2 text-sm" style="color:var(--color-muted)">The Isle: Evrima · v{__APP_VERSION__}</p>
  <div class="mt-6 border-t pt-6" style="border-color:var(--color-border)">
    <p class="text-sm" style="color:var(--color-muted)">{$locale === "vi" ? "Phát triển bởi" : "Developed by"}</p>
    <p class="mt-2 text-xl font-semibold">Thanh Chillil</p>
    <p class="mt-1">Hey Guys Team</p>
    <p class="mt-6 text-sm leading-relaxed" style="color:var(--color-muted)">{$locale === "vi" ? "Bản đồ, đồng đội và công cụ hỗ trợ hành trình sinh tồn của cộng đồng Hey Guys." : "Maps, squad tools and survival assistance for the Hey Guys community."}</p>
  </div>
  <div class="mt-6 border-t pt-6 text-xs leading-relaxed" style="border-color:var(--color-border);color:var(--color-muted)">
    <p>{$locale === "vi" ? "Được tùy biến từ mã nguồn TheIsle Overlay của Trần Quốc Toản và các bên đóng góp. Dữ liệu trò chơi, bản đồ và dịch vụ thuộc các chủ sở hữu tương ứng." : "Customized from TheIsle Overlay by Trần Quốc Toản and contributors. Game data, maps and services belong to their respective owners."}</p>
    <button class="mt-3 cursor-pointer underline" onclick={() => void openUrl("https://github.com/toantranct/theisle-overlay")}>{$locale === "vi" ? "Mã nguồn nền tảng" : "Upstream source"}</button>
  </div>
</section>
