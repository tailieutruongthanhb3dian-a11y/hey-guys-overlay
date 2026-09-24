//! The minimap overlay window: creation, game-window anchoring, topmost
//! re-assertion, click-through. Port of the window-management half of the
//! original `main.py` + `minimap.py`.
//!
//! The window is created hidden; the supervisor is wired up when the webview
//! signals `minimap://ready` (kills the WebView2 white-flash-on-startup, with
//! a timeout fallback so a broken webview can't leave the overlay dead).
//!
//! One supervisor thread replaces Qt's three timers. It ticks at 250 ms and
//! owns the ONLY show/hide path: what the user sees is
//! `user_visible && (!require_game || game running AND focused) && !fullmap`
//! — the `visible` setting stays pure user intent; game presence (polled
//! every game_rect_ms even while hidden) plus a debounced foreground check
//! gate it. Anchoring and topmost run only while shown. There are still no
//! repaint timers anywhere — the webview draws only on events.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, Listener, LogicalSize, Manager, PhysicalPosition, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::settings::{self, GAME_PROCESS_NAME};
use crate::state::{AppState, LockExt};
use crate::win::{game_window, overlay, vis};

/// Build the (hidden) minimap window. Shared by startup and by the
/// supervisor's self-heal when the window died mid-session (e.g. a WebView2
/// crash) — before that heal existed, a dead minimap stayed dead until the
/// app was restarted (field report).
fn build_window(app: &AppHandle, size: f64) -> tauri::Result<tauri::WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, "minimap", WebviewUrl::App("minimap.html".into()))
        .title("minimap")
        .inner_size(size, size)
        .min_inner_size(180.0, 180.0)
        .max_inner_size(600.0, 600.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;

    // Belt-and-braces: assert NOACTIVATE + TOOLWINDOW on the raw HWND no
    // matter what the windowing library set.
    if let Ok(hwnd) = window.hwnd() {
        let raw = hwnd.0 as isize;
        vis::register("minimap", raw);
        overlay::assert_overlay_styles(raw);
    }
    install_bounds_persistence(&window, app, "minimap");
    Ok(window)
}

fn build_info_window(app: &AppHandle, width: f64, height: f64) -> tauri::Result<tauri::WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, "dino-hud", WebviewUrl::App("dino-hud.html".into()))
        .title("dino-hud")
        .inner_size(width, height.max(92.0))
        .min_inner_size(180.0, 76.0)
        .max_inner_size(600.0, 600.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    if let Ok(hwnd) = window.hwnd() {
        let raw = hwnd.0 as isize;
        vis::register("dino-hud", raw);
        overlay::assert_overlay_styles(raw);
    }
    install_bounds_persistence(&window, app, "dino-hud");
    Ok(window)
}

// Chỉ ghi vị trí/kích thước khi thao tác đã dừng để kéo và resize không bị nghẽn bởi I/O.
fn install_bounds_persistence(window: &tauri::WebviewWindow, app: &AppHandle, label: &'static str) {
    let handle = app.clone();
    let revision = Arc::new(AtomicU64::new(0));
    window.on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) {
            return;
        }
        let state = handle.state::<AppState>();
        let allowed = {
            let s = state.settings.lock_safe();
            settings::get_bool(&s, &["minimap", "free_position"], false)
                && !settings::get_bool(&s, &["minimap", "click_through"], true)
        };
        if !allowed { return; }
        let token = revision.fetch_add(1, Ordering::SeqCst) + 1;
        let pending = revision.clone();
        let deferred = handle.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(350)).await;
            if pending.load(Ordering::SeqCst) != token { return; }
            {
                let state = deferred.state::<AppState>();
                let s = state.settings.lock_safe();
                if !settings::get_bool(&s, &["minimap", "free_position"], false) || settings::get_bool(&s, &["minimap", "click_through"], true) { return; }
            }
            let Some(window) = deferred.get_webview_window(label) else { return; };
            let Ok(position) = window.outer_position() else { return; };
            let scale = window.scale_factor().unwrap_or(1.0);
            let width = window.inner_size().map(|s| (s.width as f64 / scale).clamp(180.0, 600.0)).unwrap_or(280.0);
            let patch = if label == "minimap" {
                serde_json::json!({"minimap":{"desktop_x":position.x,"desktop_y":position.y,"size_px":width.round()}})
            } else {
                serde_json::json!({"dino_hud":{"desktop_x":position.x,"desktop_y":position.y,"width_px":width.round()}})
            };
            crate::commands::apply_settings_patch(&deferred, patch);
        });
    });
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let snap = snapshot(app);
    build_window(app, snap.size_px)?;
    build_info_window(app, snap.info_width, snap.info_h())?;

    let app_handle = app.clone();
    let shown = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ready_guard = shown.clone();
    app.listen_any("minimap://ready", move |_| {
        // The webview can reload during dev; only wire things up once.
        if ready_guard.swap(true, Ordering::SeqCst) {
            return;
        }
        on_ready(&app_handle);
    });

    // Fallback: if the webview never signals ready (a script error before
    // its emit), wire up anyway — an overlay that no hotkey can ever revive
    // is the worst failure mode this window has.
    let fallback_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if !shown.swap(true, Ordering::SeqCst) {
            log::warn!("minimap://ready never arrived; starting supervisor anyway");
            on_ready(&fallback_app);
        }
    });

    Ok(())
}

fn on_ready(app: &AppHandle) {
    let state = app.state::<AppState>();
    let click_through = {
        let s = state.settings.lock_safe();
        settings::get_bool(&s, &["minimap", "click_through"], true)
    };
    if let Some(window) = app.get_webview_window("minimap") {
        let _ = window.set_ignore_cursor_events(click_through);
    }
    if let Some(window) = app.get_webview_window("dino-hud") {
        let _ = window.set_ignore_cursor_events(click_through);
    }
    // Showing is the supervisor's job — one show path, resync included.
    spawn_supervisor(app.clone());
}

/// Snapshot of the minimap-relevant settings, compared tick-to-tick so work
/// only happens on change.
/// Height of the dino-stats strip under the map disc, logical px. Must match
/// PANEL_H in src/minimap/render.ts.
const DINO_PANEL_H: f64 = 76.0;
/// One extra stats row (stamina, token mode only). Must match PANEL_ROW_H in
/// src/minimap/render.ts.
const DINO_PANEL_ROW_H: f64 = 16.0;

/// Quest-panel geometry, logical px. Must match QUEST_HEADER_H / QUEST_ROW_H /
/// QUEST_PAD_H in src/minimap/render.ts.
const QUEST_HEADER_H: f64 = 18.0;
const QUEST_ROW_H: f64 = 14.0;
const QUEST_PAD_H: f64 = 8.0;

/// Height of the Prime-quests panel for `n` quests; 0 quests -> no panel at
/// all (an empty card under the minimap would just be clutter).
fn quests_panel_h(n: usize) -> f64 {
    if n == 0 {
        0.0
    } else {
        QUEST_HEADER_H + n as f64 * QUEST_ROW_H + QUEST_PAD_H
    }
}

#[derive(PartialEq, Clone, Copy)]
struct Snapshot {
    /// The user's intent (hotkey / Settings toggle) — game presence gates it
    /// but never writes it.
    user_visible: bool,
    require_game: bool,
    free_position: bool,
    desktop_x: i32,
    desktop_y: i32,
    info_x: i32,
    info_y: i32,
    info_width: f64,
    hide_with_app: bool,
    click_through: bool,
    size_px: f64,
    margin_px: f64,
    corner: Corner,
    game_rect_ms: u64,
    topmost_ms: u64,
    /// Extra height for the "your dino" stats panel.
    panel_h: f64,
    /// Extra height for the Prime-quests panel (varies with quest count).
    quests_h: f64,
    assistant_h: f64,
}

impl Snapshot {
    fn window_h(&self) -> f64 {
        self.size_px
    }
    fn info_h(&self) -> f64 {
        (self.panel_h + self.quests_h + self.assistant_h).max(76.0)
    }
}

#[derive(PartialEq, Clone, Copy)]
enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl Corner {
    fn parse(s: &str) -> Self {
        match s {
            "top-right" => Self::TopRight,
            "bottom-left" => Self::BottomLeft,
            "bottom-right" => Self::BottomRight,
            _ => Self::TopLeft,
        }
    }
}

fn snapshot(app: &AppHandle) -> Snapshot {
    let state = app.state::<AppState>();
    let s = state.settings.lock_safe();
    Snapshot {
        assistant_h: if settings::get_str(&s, &["position_source"], "era") == "era" && settings::get_bool(&s, &["companion", "hud"], true) { 64.0 } else { 0.0 },
        user_visible: settings::get_bool(&s, &["minimap", "visible"], true),
        require_game: settings::get_bool(&s, &["minimap", "require_game"], true),
        free_position: settings::get_bool(&s, &["minimap", "free_position"], false),
        desktop_x: settings::get_f64(&s, &["minimap", "desktop_x"], 40.0) as i32,
        desktop_y: settings::get_f64(&s, &["minimap", "desktop_y"], 80.0) as i32,
        info_x: settings::get_f64(&s, &["dino_hud", "desktop_x"], 320.0) as i32,
        info_y: settings::get_f64(&s, &["dino_hud", "desktop_y"], 80.0) as i32,
        info_width: settings::get_f64(&s, &["dino_hud", "width_px"], 280.0).clamp(180.0, 600.0),
        hide_with_app: settings::get_bool(&s, &["minimap", "hide_with_app"], true),
        click_through: settings::get_bool(&s, &["minimap", "click_through"], true),
        size_px: settings::get_f64(&s, &["minimap", "size_px"], 260.0),
        margin_px: settings::get_f64(&s, &["minimap", "margin_px"], 16.0),
        corner: Corner::parse(settings::get_str(&s, &["minimap", "corner"], "top-left")),
        game_rect_ms: settings::get_f64(&s, &["poll", "game_rect_ms"], 1000.0) as u64,
        topmost_ms: settings::get_f64(&s, &["poll", "topmost_ms"], 2000.0) as u64,
        panel_h: if settings::get_str(&s, &["position_source"], "era") == "era" { DINO_PANEL_H + DINO_PANEL_ROW_H } else if settings::get_bool(&s, &["islepilot", "enabled"], false)
            && settings::get_bool(&s, &["islepilot", "show_overlay_panel"], true)
        {
            // The 250 ms tick picks up stamina appearing/vanishing via the diff.
            DINO_PANEL_H
                + if crate::islepilot::last_has_stamina() {
                    DINO_PANEL_ROW_H
                } else {
                    0.0
                }
        } else {
            0.0
        },
        quests_h: if settings::get_str(&s, &["position_source"], "era") == "era" && settings::get_bool(&s, &["dino_hud", "show_prime"], true) { quests_panel_h(if settings::get_bool(&s, &["companion", "primeFocus"], false) { 3 } else { 10 }) } else if settings::get_str(&s, &["position_source"], "era") == "islepilot" && settings::get_bool(&s, &["islepilot", "enabled"], false)
            && settings::get_bool(&s, &["islepilot", "show_quests_panel"], false)
        {
            // The 250 ms tick picks up quest-count changes via the diff.
            quests_panel_h(crate::islepilot::last_quest_count())
        } else {
            0.0
        },
    }
}

/// Debounced game-window presence: appears on the first sighting, drops only
/// after MISS_LIMIT consecutive misses — a poll hiccup (or a brief window
/// recreation inside the game) must not flicker the overlay.
pub(crate) struct GamePresence {
    hwnd: Option<isize>,
    misses: u8,
}

const MISS_LIMIT: u8 = 2;

impl GamePresence {
    pub(crate) fn new() -> Self {
        Self {
            hwnd: None,
            misses: 0,
        }
    }

    pub(crate) fn observe(&mut self, found: Option<isize>) -> Option<isize> {
        match found {
            Some(h) => {
                self.hwnd = Some(h);
                self.misses = 0;
            }
            None => {
                self.misses = self.misses.saturating_add(1);
                if self.misses >= MISS_LIMIT {
                    self.hwnd = None;
                }
            }
        }
        self.hwnd
    }

    pub(crate) fn hwnd(&self) -> Option<isize> {
        self.hwnd
    }
}

fn spawn_supervisor(app: AppHandle) {
    std::thread::spawn(move || {
        const TICK_MS: u64 = 250;
        let mut prev = snapshot(&app);
        // See the comment at the size check below: the window's build height
        // cannot be trusted to match `prev`, so the first tick applies it.
        let mut size_applied = false;
        let mut free_applied = false;
        let mut info_size_applied = false;
        let mut info_free_applied = false;
        let mut info_effective_prev = false;
        let mut presence = GamePresence::new();
        let mut unfocused_ticks: u8 = 0;
        // The window was created hidden; the first tick decides the show.
        let mut effective_prev = false;
        let mut last_rect: Option<(i32, i32, i32, i32)> = None;
        let mut since_rect: u64 = u64::MAX / 2; // fire immediately
        let mut since_topmost: u64 = 0;
        // Recreate a DEAD minimap window (WebView2 crash closes it) instead
        // of looping no-op forever — throttled so a persistent failure does
        // not spin the builder.
        let mut since_recreate: u64 = u64::MAX / 2; // first attempt immediate
        const RECREATE_MS: u64 = 5000;

        loop {
            std::thread::sleep(Duration::from_millis(TICK_MS));
            let cur = snapshot(&app);
            let Some(window) = app.get_webview_window("minimap") else {
                since_recreate = since_recreate.saturating_add(TICK_MS);
                if since_recreate >= RECREATE_MS {
                    since_recreate = 0;
                    log::warn!("minimap window is gone — recreating");
                    match build_window(&app, cur.size_px) {
                        Ok(w) => {
                            let _ = w.set_ignore_cursor_events(cur.click_through);
                            effective_prev = false; // next tick decides show
                            last_rect = None;
                        }
                        Err(e) => log::warn!("minimap recreate failed: {e}"),
                    }
                }
                continue;
            };
            since_recreate = u64::MAX / 2;
            let info_window = app.get_webview_window("dino-hud");

            since_rect += TICK_MS;
            since_topmost += TICK_MS;

            // Presence is polled even while hidden — it is what un-hides us.
            if since_rect >= cur.game_rect_ms {
                since_rect = 0;
                presence.observe(game_window::find_game_window(GAME_PROCESS_NAME));
            }
            // IsIconic every tick (cheap): a minimized game must drop the
            // overlay within one tick, not one poll interval.
            let game_present = presence.hwnd().is_some_and(|h| !game_window::is_iconic(h));

            // Focus check every tick: an Alt-Tabbed-away borderless game
            // stays visible and un-minimized BEHIND other apps, so presence
            // alone left the overlay floating over them (field report). Two
            // consecutive unfocused ticks (~500 ms) absorb transient focus
            // blips; refocusing the game shows the overlay again instantly.
            if game_present && presence.hwnd().is_some_and(game_window::is_foreground) {
                unfocused_ticks = 0;
            } else {
                unfocused_ticks = unfocused_ticks.saturating_add(1);
            }
            let game_active = game_present && unfocused_ticks < 2;

            // While the user is LOOKING at the full map (main window in the
            // foreground) the minimap is redundant — and being TOPMOST it
            // would float over the app, eating clicks in its disc when
            // click-through is off. Foreground, NOT WS_VISIBLE: the main
            // window stays "visible" buried behind a borderless game, which
            // suppressed the in-game minimap until the user hid the full
            // map by hand (fresh-install field report).
            let main_in_front = vis::is_foreground("main");

            let effective =
                cur.user_visible && (!cur.require_game || game_active) && (!cur.hide_with_app || !main_in_front);
            if effective != effective_prev {
                if effective {
                    log::info!("minimap: show (game_active={game_active})");
                    crate::webview_mem::on_shown(&window);
                    if window.show().is_ok() {
                        effective_prev = true;
                        // Unconditional, not `ensure_topmost`: ShowWindow
                        // restores the z-position the window HAD when it was
                        // hidden, and the game (or another overlay) may have
                        // climbed above it inside the topmost band since —
                        // the style bit is still set, so the checked variant
                        // would be a no-op and the overlay would come back
                        // BEHIND the game ("bật lại không hiện" field report).
                        if let Some(h) = vis::hwnd("minimap") {
                            overlay::force_topmost(h);
                        }
                        crate::pipeline::resync(&app);
                        last_rect = None; // re-anchor right away
                    }
                } else if window.hide().is_ok() {
                    log::info!(
                        "minimap: hide (user={}, game={game_active}, fullmap={main_in_front})",
                        cur.user_visible
                    );
                    effective_prev = false;
                    crate::webview_mem::on_hidden(&window);
                }
                // A failed show/hide leaves effective_prev unchanged, so the
                // transition is retried next tick instead of swallowed.
            } else if effective && vis::is_visible("minimap") == Some(false) {
                // The OS hid us (or a show was lost) while we believe we are
                // on screen — re-apply idempotently, no resync spam.
                crate::webview_mem::on_shown(&window);
                if window.show().is_ok() {
                    if let Some(h) = vis::hwnd("minimap") {
                        overlay::force_topmost(h);
                    }
                }
            }

            let info_effective = effective && cur.panel_h + cur.quests_h > 0.0;
            if let Some(info) = &info_window {
                if info_effective != info_effective_prev {
                    if info_effective {
                        crate::webview_mem::on_shown(info);
                        if info.show().is_ok() {
                            info_effective_prev = true;
                            let _ = info.emit("hud://visibility", true);
                            if let Some(h) = vis::hwnd("dino-hud") { overlay::force_topmost(h); }
                        }
                    } else if info.hide().is_ok() {
                        info_effective_prev = false;
                        let _ = info.emit("hud://visibility", false);
                        crate::webview_mem::on_hidden(info);
                    }
                } else if info_effective && vis::is_visible("dino-hud") == Some(false) {
                    crate::webview_mem::on_shown(info);
                    if info.show().is_ok() {
                        let _ = info.emit("hud://visibility", true);
                        if let Some(h) = vis::hwnd("dino-hud") { overlay::force_topmost(h); }
                    }
                }
            }

            if cur.click_through != prev.click_through {
                let _ = window.set_ignore_cursor_events(cur.click_through);
                if let Some(info) = &info_window { let _ = info.set_ignore_cursor_events(cur.click_through); }
            }
            // `size_applied` guards a startup race: create() builds the window
            // from a snapshot taken BEFORE the first IslePilot poll (no stamina
            // row, no quest card), but `prev` below is snapshotted later — when
            // the webview signals ready, or after the 5 s fallback. If the first
            // poll lands in between, prev already carries the TALLER height, the
            // `!=` never trips, and the window stays at its build height forever
            // while the canvas draws the full one: the Growth line and the quest
            // card get cut off at the window edge. Applying the size once on the
            // first tick makes the window match the canvas no matter the timing.
            if !size_applied || cur.size_px != prev.size_px || cur.window_h() != prev.window_h() {
                size_applied = true;
                let _ = window.set_size(LogicalSize::new(cur.size_px, cur.window_h()));
                last_rect = None;
            }
            if let Some(info) = &info_window {
                if !info_size_applied || cur.info_width != prev.info_width || cur.info_h() != prev.info_h() {
                    info_size_applied = true;
                    let _ = info.set_size(LogicalSize::new(cur.info_width, cur.info_h()));
                    last_rect = None;
                }
            }
            if cur.corner != prev.corner || cur.margin_px != prev.margin_px || cur.free_position != prev.free_position {
                last_rect = None;
            }
            if cur.free_position && (!free_applied || !prev.free_position || cur.desktop_x != prev.desktop_x || cur.desktop_y != prev.desktop_y || !effective_prev) {
                let _ = window.set_position(PhysicalPosition::new(cur.desktop_x, cur.desktop_y));
                free_applied = true;
            }
            if let Some(info) = &info_window {
                if cur.free_position && (!info_free_applied || !prev.free_position || cur.info_x != prev.info_x || cur.info_y != prev.info_y || !info_effective_prev) {
                    let _ = info.set_position(PhysicalPosition::new(cur.info_x, cur.info_y));
                    info_free_applied = true;
                }
            }
            if !cur.free_position { free_applied = false; }
            if !cur.free_position { info_free_applied = false; }
            prev = cur;

            if !effective_prev {
                continue;
            }

            // Anchor to the game's client area every tick (4 cheap reads/s);
            // the rect comparison keeps repositioning to actual moves.
            if !cur.free_position {
            if let Some(game) = presence.hwnd() {
                if let Some(rect) = game_window::client_rect_on_screen(game) {
                    if last_rect != Some(rect) {
                        last_rect = Some(rect);
                        anchor(&window, rect, &cur);
                        if let Some(info) = &info_window { anchor_info(info, rect, &cur); }
                    }
                }
            }

            }

            if since_topmost >= cur.topmost_ms {
                since_topmost = 0;
                if let Some(hwnd) = vis::hwnd("minimap") {
                    // Checks the style bit first — no needless DWM repaints.
                    overlay::ensure_topmost(hwnd);
                }
                if let Some(hwnd) = vis::hwnd("dino-hud") { overlay::ensure_topmost(hwnd); }
            }
        }
    });
}

/// Pin the overlay to a corner of the game's client area. All arithmetic in
/// PHYSICAL pixels (Win32 gives physical, and margins/sizes are logical, so
/// they scale by the window's DPI factor — the machine runs at 125%).
fn anchor(window: &tauri::WebviewWindow, rect: (i32, i32, i32, i32), snap: &Snapshot) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = (snap.size_px * scale).round() as i32;
    let height = (snap.window_h() * scale).round() as i32;
    let margin = (snap.margin_px * scale).round() as i32;
    let (gx, gy, gw, gh) = rect;

    let x = match snap.corner {
        Corner::TopLeft | Corner::BottomLeft => gx + margin,
        Corner::TopRight | Corner::BottomRight => gx + gw - size - margin,
    };
    let y = match snap.corner {
        Corner::TopLeft | Corner::TopRight => gy + margin,
        Corner::BottomLeft | Corner::BottomRight => gy + gh - height - margin,
    };
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn anchor_info(window: &tauri::WebviewWindow, rect: (i32, i32, i32, i32), snap: &Snapshot) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let map_size = (snap.size_px * scale).round() as i32;
    let width = (snap.info_width * scale).round() as i32;
    let height = (snap.info_h() * scale).round() as i32;
    let margin = (snap.margin_px * scale).round() as i32;
    let gap = (8.0 * scale).round() as i32;
    let (gx, gy, gw, gh) = rect;
    let x = match snap.corner {
        Corner::TopLeft | Corner::BottomLeft => gx + margin,
        Corner::TopRight | Corner::BottomRight => gx + gw - width - margin,
    };
    let y = match snap.corner {
        Corner::TopLeft | Corner::TopRight => gy + margin + map_size + gap,
        Corner::BottomLeft | Corner::BottomRight => gy + gh - margin - map_size - gap - height,
    };
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[cfg(test)]
mod tests {
    use super::{quests_panel_h, GamePresence, QUEST_HEADER_H, QUEST_PAD_H, QUEST_ROW_H};

    #[test]
    fn quest_panel_height_scales_with_count_and_vanishes_at_zero() {
        assert_eq!(quests_panel_h(0), 0.0, "no quests, no card");
        assert_eq!(quests_panel_h(1), QUEST_HEADER_H + QUEST_ROW_H + QUEST_PAD_H);
        assert_eq!(
            quests_panel_h(10),
            QUEST_HEADER_H + 10.0 * QUEST_ROW_H + QUEST_PAD_H
        );
    }

    #[test]
    fn presence_appears_immediately_and_survives_one_miss() {
        let mut p = GamePresence::new();
        assert_eq!(p.observe(None), None);
        assert_eq!(p.observe(Some(7)), Some(7), "first sighting shows at once");
        assert_eq!(p.observe(None), Some(7), "one miss is a poll hiccup");
        assert_eq!(p.observe(Some(7)), Some(7), "recovery resets the misses");
        assert_eq!(p.observe(None), Some(7));
        assert_eq!(p.observe(None), None, "two consecutive misses = game gone");
        assert_eq!(p.observe(Some(9)), Some(9), "reappearance is immediate");
    }
}

// Chỉ HUD cục bộ được phép yêu cầu kéo cửa sổ của chính nó.
#[tauri::command]
pub fn drag_hud(window: tauri::WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "minimap" | "dino-hud") { return Err("HUD window required".into()); }
    let state = window.state::<AppState>();
    let allowed = {
        let s = state.settings.lock_safe();
        settings::get_bool(&s, &["minimap", "free_position"], false)
            && !settings::get_bool(&s, &["minimap", "click_through"], true)
    };
    if !allowed { return Err("Unlock free HUD placement first".into()); }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
        use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, HTCAPTION, WM_NCLBUTTONDOWN};
        ReleaseCapture().map_err(|e| e.to_string())?;
        SendMessageW(
            HWND(hwnd.0 as *mut std::ffi::c_void),
            WM_NCLBUTTONDOWN,
            Some(WPARAM(HTCAPTION as usize)),
            Some(LPARAM(0)),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn resize_hud(window: tauri::WebviewWindow) -> Result<(), String> {
    if !matches!(window.label(), "minimap" | "dino-hud") { return Err("HUD window required".into()); }
    let state = window.state::<AppState>();
    let allowed = {
        let s = state.settings.lock_safe();
        settings::get_bool(&s, &["minimap", "free_position"], false)
            && !settings::get_bool(&s, &["minimap", "click_through"], true)
    };
    if !allowed { return Err("Unlock free HUD placement first".into()); }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
        use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, HTBOTTOMRIGHT, WM_NCLBUTTONDOWN};
        ReleaseCapture().map_err(|e| e.to_string())?;
        SendMessageW(
            HWND(hwnd.0 as *mut std::ffi::c_void),
            WM_NCLBUTTONDOWN,
            Some(WPARAM(HTBOTTOMRIGHT as usize)),
            Some(LPARAM(0)),
        );
    }
    Ok(())
}
