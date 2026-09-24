//! ERA's documented-by-client endpoints. Cookies remain in WebView2's cookie
//! store and are never returned to the frontend or forwarded to another host.
use serde_json::Value;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use std::time::Duration;

const ORIGIN: &str = "https://eragamingvn.net";
static CLIENT: std::sync::LazyLock<Result<reqwest::Client, reqwest::Error>> =
    std::sync::LazyLock::new(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .tcp_keepalive(Duration::from_secs(30))
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
    });
static LIVE: std::sync::Mutex<Option<Value>> = std::sync::Mutex::new(None);
// Không đánh dấu vị trí cũ khi nguồn ERA đã mất kết nối.
pub fn live_position_fresh() -> bool {
    let Ok(guard) = LIVE.lock() else { return false; };
    let Some(live) = guard.as_ref() else { return false; };
    let now = chrono::Utc::now().timestamp_millis().max(0) as u64;
    live["status"] == "online" && live["receivedAt"].as_u64().is_some_and(|at| at <= now && now - at < 5000)
}
static LIVE_WAKE: tokio::sync::Notify = tokio::sync::Notify::const_new();
static SUICIDE_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static SUICIDE_LAST: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

fn suicide_ready(data: &Value) -> bool {
    data["available"] == true && data["identityReady"] == true && (
        data["identitySource"] == "player-cache" ||
        data.get("identityAgeSeconds").and_then(finite_number).is_some_and(|age| (-1.0..=3.0).contains(&age))
    )
}

#[tauri::command]
pub async fn era_suicide_status(window: WebviewWindow) -> Result<Value,String> {
    local_window(&window)?;
    send_era(&window,"/api/theisle/map?action=suicide-status",false,vec![],false,true).await
}

struct SuicideGuard;
impl Drop for SuicideGuard { fn drop(&mut self) { SUICIDE_BUSY.store(false,std::sync::atomic::Ordering::SeqCst); } }

#[tauri::command]
pub async fn era_self_suicide(window: WebviewWindow, confirmed: bool) -> Result<Value,String> {
    local_window(&window)?;
    if !confirmed { return Err("Cần xác nhận tự sát nhân vật hiện tại.".into()); }
    if SUICIDE_BUSY.swap(true,std::sync::atomic::Ordering::SeqCst) { return Err("Yêu cầu tự sát đang được xử lý.".into()); }
    let _guard = SuicideGuard;
    if SUICIDE_LAST.lock().map_err(|_|"ERA_STATE_ERROR")?.is_some_and(|time|time.elapsed()<Duration::from_secs(10)) {
        return Err("Chờ ít nhất 10 giây trước khi gửi lại.".into());
    }
    let status = era_suicide_status(window.clone()).await?;
    if !suicide_ready(&status) { return Err("ERA chưa xác nhận được nhân vật hiện tại. Hãy thử lại sau.".into()); }
    // Không tự gửi lại POST nếu mất mạng: kết quả thao tác có thể chưa xác định.
    *SUICIDE_LAST.lock().map_err(|_|"ERA_STATE_ERROR")? = Some(std::time::Instant::now());
    let operation = uuid::Uuid::new_v4().simple().to_string();
    send_era(&window,"/api/theisle/map",true,vec![("X-Era-Action","self-suicide".into()),("X-Era-Operation-Id",operation)],false,true).await
}

#[tauri::command]
pub fn era_live_state(window: WebviewWindow) -> Result<Value, String> {
    if !live_reader_label(window.label()) { return Err("Local window required".into()); }
    Ok(LIVE.lock().map_err(|_| "ERA_STATE_ERROR")?.clone().unwrap_or(Value::Null))
}

fn live_reader_label(label: &str) -> bool {
    matches!(label, "main" | "minimap" | "dino-hud")
}

// ERA RCON axes are reversed relative to the Asset Location clipboard fields.
fn finite_number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str()?.trim().parse::<f64>().ok()).filter(|v| v.is_finite())
}

fn live_coordinates(player: &Value) -> Option<(f64, f64, f64)> {
    let p = player.get("location")?;
    let x = finite_number(p.get("y")?)?;
    let y = finite_number(p.get("x")?)?;
    let z = p.get("z").and_then(finite_number).unwrap_or(0.0);
    (x.is_finite() && y.is_finite() && z.is_finite()).then_some((x, y, z))
}

pub fn spawn_live(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_received = 0u64;
        let mut delay = 2u64;
        loop {
            let started = std::time::Instant::now();
            let mut failed = false;
            let mut login_wait = false;
            if let Some(window) = app.get_webview_window("main") {
                let result = send_era(&window, "/api/theisle/map", false, vec![], false, true).await.and_then(|data| {
                    if !data.get("playerOnline").is_some_and(Value::is_boolean)
                        || (data["playerOnline"] == true && !data.get("player").is_some_and(Value::is_object)) {
                        return Err("ERA_INVALID_RESPONSE".into());
                    }
                    Ok(data)
                });
                let snapshot = match result {
                    Ok(mut data) => {
                        // ERA có thể trả tọa độ dạng chuỗi; chuẩn hóa trước khi gửi sang hai giao diện.
                        if let Some(location) = data.get_mut("player").and_then(|p| p.get_mut("location")).and_then(Value::as_object_mut) {
                            for key in ["x", "y", "z"] {
                                if let Some(value) = location.get(key).and_then(finite_number) { location.insert(key.into(), serde_json::json!(value)); }
                            }
                        }
                        let state = app.state::<crate::state::AppState>();
                        let source = state.active_source();
                        let cal = source.calibration();
                        let friends: Vec<Value> = data.get("friends").and_then(Value::as_array).into_iter().flatten()
                            .filter(|f| f.get("online").and_then(Value::as_bool) == Some(true))
                            .filter_map(|f| {
                                let (x,y,_) = live_coordinates(f)?;
                                let (px,py) = overlay_core::world_to_pixel(x,y,cal);
                                let steam_id = f["steamId"].as_str().map(str::to_owned).or_else(|| f["steamId"].as_u64().map(|id| id.to_string()))?;
                                Some(serde_json::json!({"steamId":steam_id,"name":f["name"],"class":f["class"],"growthPercent":f["growthPercent"],"healthPercent":f["healthPercent"],"px":px,"py":py,"xCm":x,"yCm":y}))
                            }).collect();
                        data["mapFriends"] = serde_json::json!(friends);
                        data["mapSource"] = serde_json::json!(source.key());
                        last_received = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
                        let online = data.get("playerOnline").and_then(Value::as_bool) == Some(true);
                        if online {
                            if let Some(coords) = data.get("player").and_then(live_coordinates) {
                                // Explicit IslePilot position selection takes precedence.
                                use crate::state::LockExt;
                                let state = app.state::<crate::state::AppState>();
                                let ip_selected = {
                                    let settings = state.settings.lock_safe();
                                    crate::settings::get_str(&settings, &["position_source"], "era") != "era"
                                };
                                if !ip_selected { crate::pipeline::ingest_sample(&app, coords.0, coords.1, coords.2); }
                            }
                        }
                        delay = 2;
                        serde_json::json!({"status": if online {"online"} else {"offline"}, "receivedAt":last_received,"intervalMs":2000,"latencyMs":started.elapsed().as_millis() as u64,"data":data})
                    }
                    Err(error) => {
                        failed = true;
                        login_wait = error == "ERA_LOGIN_REQUIRED";
                        delay = retry_delay(&error, delay);
                        serde_json::json!({"status":if error == "ERA_LOGIN_REQUIRED" {"login"} else {"error"},"receivedAt":last_received,"intervalMs":delay * 1000,"error":error})
                    }
                };
                if let Ok(mut state) = LIVE.lock() { *state = Some(snapshot.clone()); }
                crate::events::emit_all(&app, "era://live", snapshot);
            }
            let wait = if failed { Duration::from_secs(delay) } else { Duration::from_secs(delay).saturating_sub(started.elapsed()).max(Duration::from_millis(100)) };
            if failed && !login_wait { tokio::time::sleep(wait).await; }
            else { let _ = tokio::time::timeout(wait, LIVE_WAKE.notified()).await; }
        }
    });
}

fn retry_delay(error: &str, previous: u64) -> u64 {
    if let Some(seconds) = error.strip_prefix("ERA_RATE_LIMIT:").and_then(|s| s.parse::<u64>().ok()) { return seconds.clamp(1, 86400); }
    if error == "ERA_LOGIN_REQUIRED" { return 5; }
    previous.saturating_mul(2).clamp(5, 15)
}

fn local_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("Local window required".into()); }
    Ok(())
}

#[tauri::command]
pub async fn era_atlas(window: WebviewWindow) -> Result<Value,String> {
    local_window(&window)?;
    static ATLAS: std::sync::Mutex<Option<Value>> = std::sync::Mutex::new(None);
    if let Some(data) = ATLAS.lock().map_err(|_| "ERA_STATE_ERROR")?.clone() {return atlas_projection(&window,data);}
    let data=send_era(&window,"/live-map/assets/gateway-atlas-data.json?v=20260821b",false,vec![],true,false).await?;
    if data["mapTiles"]["width"] != 16384 || !data["markers"].is_array() || !data["coordLocator"].is_object() {return Err("ERA_INVALID_ATLAS".into());}
    *ATLAS.lock().map_err(|_| "ERA_STATE_ERROR")?=Some(data.clone());
    atlas_projection(&window,data)
}

fn atlas_projection(window:&WebviewWindow,mut data:Value)->Result<Value,String>{
    let c=&data["coordLocator"];
    let n=|key:&str|c[key].as_f64().or_else(||c[key].as_str().and_then(|v|v.parse::<f64>().ok())).filter(|v|v.is_finite()).ok_or("ERA_INVALID_ATLAS");
    let (a,b,c0,d,e,f)=(n("matrix_m11")?,n("matrix_m12")?,n("matrix_m13")?,n("matrix_m21")?,n("matrix_m22")?,n("matrix_m23")?);
    let det=a*e-b*d;if det.abs()<1e-12{return Err("ERA_INVALID_ATLAS".into());}
    let state=window.state::<crate::state::AppState>();let cal=state.active_calibration();
    let anchors:Vec<_>=[(0.0,0.0),(100.0,0.0),(0.0,100.0)].into_iter().map(|(u,v)|{let x=(e*(u-c0)-b*(v-f))/det*1000.0;let y=(-d*(u-c0)+a*(v-f))/det*1000.0;let (px,py)=overlay_core::world_to_pixel(x,y,cal);serde_json::json!({"px":px,"py":py,"xCm":x,"yCm":y})}).collect();
    data["projectionAnchors"]=serde_json::json!(anchors);Ok(data)
}

fn allowed_navigation(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.port_or_known_default() == Some(443) && matches!(url.host_str(),
        Some("eragamingvn.net" | "steamcommunity.com" | "store.steampowered.com" | "login.steampowered.com"))
}

#[tauri::command]
pub async fn era_open(window: WebviewWindow, login: bool) -> Result<(), String> {
    local_window(&window)?;
    let app = window.app_handle();
    let url: tauri::Url = format!("{ORIGIN}{}", if login { "/api/auth/steam" } else { "/live-map" })
        .parse().map_err(|_| "Invalid ERA URL")?;
    if let Some(existing) = app.get_webview_window("era-session") {
        existing.navigate(url).map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(app, "era-session", WebviewUrl::External(url))
        .title("ERA Gaming VN — Steam / Live Map")
        .inner_size(1100.0, 780.0).center()
        .on_navigation(allowed_navigation)
        .build().map_err(|e| e.to_string())?;
    Ok(())
}

fn endpoint(action: &str) -> Result<(&'static str, bool), String> {
    match action {
        "status" => Ok(("/api/theisle/status", false)),
        "session" => Ok(("/api/me", false)),
        "map" => Ok(("/api/theisle/map", false)),
        "friends" => Ok(("/api/theisle/map?action=friends", false)),
        "friend-search" => Ok(("/api/theisle/map?action=friend-search", false)),
        "friend-request" | "friend-accept" | "friend-decline" | "friend-cancel" | "friend-remove" =>
            Ok(("/api/theisle/map", true)),
        _ => Err("Unsupported ERA action".into()),
    }
}

#[tauri::command]
pub async fn era_finish_login(window: WebviewWindow) -> Result<(), String> {
    local_window(&window)?;
    LIVE_WAKE.notify_one();
    if let Some(login) = window.app_handle().get_webview_window("era-session") {
        login.close().map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn era_request(window: WebviewWindow, action: String, value: Option<String>) -> Result<Value, String> {
    local_window(&window)?;
    let (path, mutation) = endpoint(&action)?;
    let value = value.unwrap_or_default();
    if mutation && !(17..=19).contains(&value.len()) { return Err("Invalid Steam ID".into()); }
    if mutation && !value.bytes().all(|c| c.is_ascii_digit()) { return Err("Invalid Steam ID".into()); }
    if action == "friend-search" && (value.is_empty() || value.len() > 256 || !value.bytes().all(|c| c.is_ascii_alphanumeric() || b"+/=".contains(&c))) {
        return Err("Invalid search query".into());
    }
    let mut headers = Vec::new();
    if mutation { headers.push(("X-Era-Action", action.clone())); headers.push(("X-Era-Friend-SteamId", value.clone())); }
    if action == "friend-search" { headers.push(("X-Era-Friend-Query-B64", value)); }
    send_era(&window, path, mutation, headers, action == "status", !matches!(action.as_str(), "session" | "status")).await
}

async fn send_era(window: &WebviewWindow, path: &str, mutation: bool, headers: Vec<(&str, String)>, public: bool, require_success: bool) -> Result<Value, String> {
    // Cookie access stays on an async-command thread; no credentials reach JS.
    let cookie = if public { String::new() } else {
        let url: tauri::Url = format!("{ORIGIN}{path}").parse().map_err(|_| "Invalid ERA URL")?;
        window.cookies_for_url(url).map_err(|_| "ERA_COOKIE_UNAVAILABLE")?
            .iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ")
    };
    let client = CLIENT.as_ref().map_err(|_| "ERA_NETWORK_ERROR")?;
    let mut request = client.request(if mutation { reqwest::Method::POST } else { reqwest::Method::GET }, format!("{ORIGIN}{path}"))
        .header("Accept", "application/json").header("Origin", ORIGIN)
        .header("Referer", format!("{ORIGIN}/live-map"));
    // Map chỉ đọc phải thoát sớm khi treo; không rút timeout các thao tác Garage/skin.
    if !mutation && path == "/api/theisle/map" { request = request.timeout(Duration::from_secs(8)); }
    if !cookie.is_empty() { request = request.header("Cookie", cookie); }
    for (name, value) in headers { request = request.header(name, value); }
    let response = request.send().await.map_err(|_| "ERA_NETWORK_ERROR")?;
    let status = response.status();
    if status.as_u16() == 429 {
        let seconds = response.headers().get("Retry-After").and_then(|h| h.to_str().ok()).and_then(|h| {
            h.parse::<u64>().ok().or_else(|| chrono::DateTime::parse_from_rfc2822(h).ok().map(|until| (until.timestamp()-chrono::Utc::now().timestamp()).max(1) as u64))
        }).unwrap_or(60);
        return Err(format!("ERA_RATE_LIMIT:{}", seconds.clamp(1, 86400)));
    }
    if status.as_u16() == 401 { return Err("ERA_LOGIN_REQUIRED".into()); }
    let body = response.text().await.map_err(|_| "ERA_NETWORK_ERROR")?;
    let data: Value = serde_json::from_str(&body).map_err(|_| "ERA_INVALID_RESPONSE")?;
    if !status.is_success() || data.get("success") == Some(&Value::Bool(false)) || data.get("status").and_then(Value::as_str) == Some("ERROR") {
        return Err(data.get("message").and_then(Value::as_str).unwrap_or("ERA_REQUEST_FAILED").chars().take(300).collect());
    }
    if require_success && data.get("success") != Some(&Value::Bool(true)) {
        return Err("ERA_INVALID_RESPONSE".into());
    }
    Ok(data)
}

fn skin_body(colors: &[String]) -> Result<Value, String> {
    if colors.len() != 7
        || colors.iter().any(|color| {
            color.len() != 7
                || !color.starts_with('#')
                || !color[1..].bytes().all(|c| c.is_ascii_hexdigit())
        })
    {
        return Err("ERA_INVALID_SKIN_COLORS".into());
    }
    Ok(Value::Object(
        colors
            .iter()
            .enumerate()
            .map(|(index, color)| (format!("color{}", index + 1), Value::String(color.to_uppercase())))
            .collect(),
    ))
}

async fn send_skin(
    window: &WebviewWindow,
    method: reqwest::Method,
    colors: Option<&[String]>,
    operation: Option<&str>,
) -> Result<Value, String> {
    local_window(window)?;
    let path = "/api/theisle/skin";
    let url: tauri::Url = format!("{ORIGIN}{path}")
        .parse()
        .map_err(|_| "Invalid ERA URL")?;
    let cookie = window
        .cookies_for_url(url)
        .map_err(|_| "ERA_COOKIE_UNAVAILABLE")?
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    let client = CLIENT.as_ref().map_err(|_| "ERA_NETWORK_ERROR")?;
    let mut request = client
        .request(method.clone(), format!("{ORIGIN}{path}"))
        .header("Accept", "application/json")
        .header("Origin", ORIGIN)
        .header("Referer", format!("{ORIGIN}/live-map"))
        .header("Cookie", cookie);
    if let Some(id) = operation {
        if id.is_empty()
            || id.len() > 128
            || !id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
        {
            return Err("ERA_INVALID_OPERATION".into());
        }
        request = request.header("X-Era-Operation", id);
    }
    if method == reqwest::Method::POST {
        request = request.header("X-Era-Action", "skin");
    }
    if let Some(colors) = colors {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(skin_body(colors)?.to_string());
    }
    let response = request.send().await.map_err(|_| "ERA_NETWORK_ERROR")?;
    let status = response.status();
    if status.as_u16() == 429 {
        let seconds = response
            .headers()
            .get("Retry-After")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.parse::<u64>().ok())
            .unwrap_or(60);
        return Err(format!("ERA_RATE_LIMIT:{}", seconds.clamp(1, 86400)));
    }
    if status.as_u16() == 401 {
        return Err("ERA_LOGIN_REQUIRED".into());
    }
    let body = response.text().await.map_err(|_| "ERA_NETWORK_ERROR")?;
    let data: Value = serde_json::from_str(&body).map_err(|_| "ERA_INVALID_RESPONSE")?;
    if !status.is_success() || data.get("success") == Some(&Value::Bool(false)) {
        return Err(data
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("ERA_SKIN_FAILED")
            .chars()
            .take(300)
            .collect());
    }
    Ok(data)
}

#[tauri::command]
pub async fn era_skin_policy(window: WebviewWindow) -> Result<Value, String> {
    send_skin(&window, reqwest::Method::GET, None, None).await
}

#[tauri::command]
pub async fn era_skin_apply(window: WebviewWindow, colors: Vec<String>) -> Result<Value, String> {
    let queued = send_skin(&window, reqwest::Method::POST, Some(&colors), None).await?;
    let operation = queued
        .get("operationId")
        .and_then(Value::as_str)
        .ok_or("ERA_INVALID_RESPONSE")?
        .to_string();
    for _ in 0..18 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let result = send_skin(&window, reqwest::Method::GET, None, Some(&operation)).await?;
        if result.get("state").and_then(Value::as_str) != Some("queued") {
            if result.get("success") != Some(&Value::Bool(true)) {
                return Err(result
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("ERA_SKIN_UNCONFIRMED")
                    .into());
            }
            return Ok(result);
        }
    }
    Err("ERA_SKIN_PENDING".into())
}

fn slot_header(slot: u16) -> Result<(&'static str, String), String> {
    if !(1..=100).contains(&slot) { return Err("ERA_INVALID_SLOT".into()); }
    Ok(("X-Era-Slot", slot.to_string()))
}

#[tauri::command]
pub async fn era_garage_get(window: WebviewWindow, slot: u16) -> Result<Value, String> {
    local_window(&window)?;
    let data = send_era(&window, "/api/theisle/garage", false, vec![slot_header(slot)?], false, false).await?;
    if !data.get("data").is_some_and(Value::is_object) { return Err("ERA_INVALID_RESPONSE".into()); }
    Ok(data)
}

static GARAGE_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
struct GarageGuard;
impl Drop for GarageGuard {
    fn drop(&mut self) { GARAGE_BUSY.store(false, std::sync::atomic::Ordering::SeqCst); }
}

fn garage_action_headers(action: &str, slot: u16, state_hash: &str, operation: &str) -> Result<Vec<(&'static str, String)>, String> {
    if !matches!(action, "park" | "restore" | "delete") { return Err("ERA_INVALID_ACTION".into()); }
    let mut headers = vec![slot_header(slot)?, ("X-Era-Action", action.into()), ("X-Era-Operation-Id", operation.into())];
    if action == "delete" {
        if state_hash.len() != 64 || !state_hash.bytes().all(|c| c.is_ascii_hexdigit()) { return Err("ERA_INVALID_STATE_HASH".into()); }
        headers.push(("X-Era-Confirm-Delete", format!("slot:{slot}")));
        headers.push(("X-Era-State-Hash", state_hash.into()));
    }
    Ok(headers)
}

#[tauri::command]
pub async fn era_garage_action(window: WebviewWindow, action: String, slot: u16, state_hash: Option<String>) -> Result<Value, String> {
    local_window(&window)?;
    let operation = uuid::Uuid::new_v4().simple().to_string();
    let headers = garage_action_headers(&action, slot, state_hash.as_deref().unwrap_or(""), &operation)?;
    if GARAGE_BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) { return Err("ERA_GARAGE_BUSY".into()); }
    let _guard = GarageGuard;
    // Never automatically repeat a POST after a timeout: its outcome may be unknown.
    let mut result = send_era(&window, "/api/theisle/garage", true, headers, false, true).await?;
    if result.get("queued") == Some(&Value::Bool(true)) {
        let job = result.get("jobId").and_then(Value::as_str).ok_or("ERA_INVALID_RESPONSE")?.to_string();
        if job.is_empty() || job.len() > 128 || !job.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c)) {
            return Err("ERA_INVALID_RESPONSE".into());
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(90);
        loop {
            if std::time::Instant::now() >= deadline { return Err("ERA_GARAGE_PENDING".into()); }
            tokio::time::sleep(Duration::from_millis(500)).await;
            result = send_era(&window, "/api/theisle/garage", false,
                vec![slot_header(slot)?, ("X-Era-Job-Id", job.clone())], false, false).await?;
            if !matches!(result.get("state").and_then(Value::as_str), Some("queued" | "running")) {
                if result.get("success") != Some(&Value::Bool(true)) { return Err("ERA_GARAGE_UNCONFIRMED".into()); }
                break;
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn suicide_requires_available_and_current_identity() {
        assert!(suicide_ready(&serde_json::json!({"available":true,"identityReady":true,"identitySource":"player-cache"})));
        assert!(suicide_ready(&serde_json::json!({"available":true,"identityReady":true,"identityAgeSeconds":3})));
        for age in [serde_json::Value::Null, serde_json::json!(4), serde_json::json!(-2), serde_json::json!("NaN")] {
            assert!(!suicide_ready(&serde_json::json!({"available":true,"identityReady":true,"identityAgeSeconds":age})));
        }
        assert!(!suicide_ready(&serde_json::json!({"available":false,"identityReady":true,"identitySource":"player-cache"})));
        assert!(!suicide_ready(&serde_json::json!({"available":true,"identityReady":false,"identitySource":"player-cache"})));
    }
    #[test]
    fn polling_respects_limits_and_recovers() {
        assert_eq!(retry_delay("ERA_RATE_LIMIT:120",1),120);
        assert_eq!(retry_delay("ERA_NETWORK_ERROR",1),5);
        assert_eq!(retry_delay("ERA_NETWORK_ERROR",40),15);
        assert_eq!(retry_delay("ERA_LOGIN_REQUIRED",1),5);
    }
    #[test]
    fn era_axes_match_asset_location() {
        let player = serde_json::json!({"location":{"x":12000,"y":-34000,"z":500}});
        assert_eq!(live_coordinates(&player), Some((-34000.0,12000.0,500.0)));
        assert_eq!(live_coordinates(&serde_json::json!({"location":{"x":"12000","y":"-34000","z":"500"}})), Some((-34000.0,12000.0,500.0)));
        assert_eq!(live_coordinates(&serde_json::json!({"location":{"x":"NaN","y":""}})), None);
        let (x,y,_) = live_coordinates(&player).unwrap();
        let cal = overlay_core::Calibration::gateway();
        let (px,py) = overlay_core::world_to_pixel(x,y,cal);
        assert!((px / cal.image_width_px as f64 - (12.0 + 505.0) / 1112.0).abs() < 0.000001);
        assert!((py / cal.image_height_px as f64 - (-34.0 + 607.0) / 1116.0).abs() < 0.000001);
        assert_eq!(live_coordinates(&serde_json::json!({"location":{"x":1}})), None);
    }
    #[test]
    fn skin_requires_exactly_seven_hex_colors() {
        let valid = vec!["#12aBcD".to_string(); 7];
        let body = skin_body(&valid).unwrap();
        assert_eq!(body["color1"], "#12ABCD");
        assert_eq!(body["color7"], "#12ABCD");
        assert!(skin_body(&valid[..6]).is_err());
        let mut invalid = valid;
        invalid[3] = "red".into();
        assert!(skin_body(&invalid).is_err());
    }
    #[test]
    fn every_local_hud_can_read_the_live_snapshot() {
        assert!(live_reader_label("main"));
        assert!(live_reader_label("minimap"));
        assert!(live_reader_label("dino-hud"));
        assert!(!live_reader_label("era-session"));
    }
    #[test]
    fn restricts_navigation_and_actions() {
        for url in ["http://eragamingvn.net", "https://eragamingvn.net.attacker.test", "file:///secret"] {
            assert!(!allowed_navigation(&url.parse().unwrap()));
        }
        assert!(allowed_navigation(&"https://steamcommunity.com/openid/login".parse().unwrap()));
        assert!(endpoint("https://attacker.test").is_err());
        assert!(endpoint("friend-accept").unwrap().1);
        assert!(!endpoint("friends").unwrap().1);
    }
    #[test]
    fn garage_delete_is_bound_to_slot_and_snapshot() {
        assert!(garage_action_headers("delete", 1, "", "operation").is_err());
        assert!(garage_action_headers("park", 0, "", "operation").is_err());
        assert!(garage_action_headers("sell", 1, "", "operation").is_err());
        let hash = "a".repeat(64);
        let headers = garage_action_headers("delete", 2, &hash, "operation").unwrap();
        assert!(headers.contains(&("X-Era-Confirm-Delete", "slot:2".into())));
        assert!(headers.contains(&("X-Era-State-Hash", hash)));
    }
}
