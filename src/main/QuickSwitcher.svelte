<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/i18n";
  import { normalizeSearch } from "$lib/search";

  type Tab = "map" | "dino" | "garage" | "skin" | "settings" | "guide" | "donate" | "era";
  type Command = {
    id: string;
    label: string;
    detail: string;
    shortcut?: string;
    action: () => void;
  };

  let {
    open,
    steamConnected,
    steamConnecting,
    onclose,
    onselect,
    onconnect,
  }: {
    open: boolean;
    steamConnected: boolean;
    steamConnecting: boolean;
    onclose: () => void;
    onselect: (tab: Tab) => void;
    onconnect: () => void;
  } = $props();

  let query = $state("");
  let active = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  const tabCommands = $derived(
    (["map", "dino", "garage", "skin", "settings", "guide", "donate", "era"] as Tab[]).map(
      (tab, index): Command => ({
        id: tab,
        label: $t(`tab.${tab}` as never),
        detail: $t(`quick.detail_${tab}` as never),
        shortcut: `Ctrl+${index + 1}`,
        action: () => onselect(tab),
      }),
    ),
  );

  const commands = $derived([
    ...tabCommands,
    {
      id: "steam",
      label: steamConnecting
        ? $t("app.steam_connecting")
        : steamConnected
          ? $t("quick.steam_open")
          : $t("dino.login"),
      detail: steamConnected ? $t("quick.steam_connected") : $t("quick.steam_detail"),
      action: onconnect,
    } satisfies Command,
  ]);

  const normalize = normalizeSearch;

  const filtered = $derived.by(() => {
    const needle = normalize(query.trim());
    if (!needle) return commands;
    return commands.filter((command) =>
      normalize(`${command.label} ${command.detail}`).includes(needle),
    );
  });

  $effect(() => {
    if (!open) return;
    query = "";
    active = 0;
    void tick().then(() => inputEl?.focus());
  });

  $effect(() => {
    query;
    active = 0;
  });

  function run(command: Command | undefined) {
    if (!command) return;
    onclose();
    command.action();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = filtered.length ? (active + 1) % filtered.length : 0;
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      active = filtered.length ? (active - 1 + filtered.length) % filtered.length : 0;
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run(filtered[active]);
    }
  }
</script>

{#if open}
  <div
    class="quick-switcher-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) onclose();
    }}
  >
    <div
      class="quick-switcher"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="quick-switcher-title"
      onkeydown={onKeydown}
    >
      <header>
        <div>
          <div class="quick-eyebrow">{$t("quick.eyebrow")}</div>
          <h2 id="quick-switcher-title">{$t("quick.title")}</h2>
        </div>
        <kbd>ESC</kbd>
      </header>
      <div class="quick-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.8-3.8"></path>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          aria-label={$t("quick.placeholder")}
          placeholder={$t("quick.placeholder")}
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="quick-results" aria-live="polite">
        {#if filtered.length === 0}
          <div class="quick-empty">{$t("quick.empty")}</div>
        {:else}
          {#each filtered as command, index (command.id)}
            <button
              class:active={index === active}
              onmouseenter={() => (active = index)}
              onclick={() => run(command)}
            >
              <span class="quick-command-icon" class:steam={command.id === "steam"}>
                {command.id === "steam" ? "S" : String(tabCommands.findIndex((item) => item.id === command.id) + 1)}
              </span>
              <span class="quick-command-copy">
                <strong>{command.label}</strong>
                <small>{command.detail}</small>
              </span>
              {#if command.shortcut}<kbd>{command.shortcut}</kbd>{/if}
              <span class="quick-enter" aria-hidden="true">↵</span>
            </button>
          {/each}
        {/if}
      </div>
      <footer>
        <span><kbd>↑</kbd><kbd>↓</kbd> {$t("quick.navigate")}</span>
        <span><kbd>↵</kbd> {$t("quick.select")}</span>
      </footer>
    </div>
  </div>
{/if}
