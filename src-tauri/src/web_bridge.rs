//! Cầu nối web chỉ nghe loopback; mã ghép đôi đổi mỗi lần khởi động.
use axum::{body::Body, extract::{State, Request}, http::{StatusCode, HeaderValue}, response::Response, routing::any, Router};
use serde_json::{json, Value};
use std::{collections::{HashMap, VecDeque}, sync::{Arc, Mutex, LazyLock}, path::PathBuf};
use tauri::Manager;
use crate::{commands as c, era, state::{AppState, LockExt}};

const PORT: u16 = 17864;
const SITE: &str = "https://heyguys-dashboard.pages.dev";
static TOKEN: LazyLock<String> = LazyLock::new(|| format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple()));
static EVENTS: Mutex<VecDeque<Value>> = Mutex::new(VecDeque::new());
static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn publish(event: &str, payload: Value) {
    if !event.contains("://") { return; }
    let mut queue = EVENTS.lock_safe();
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    queue.push_back(json!({"id":seq,"event":event,"payload":payload}));
    while queue.len() > 256 { queue.pop_front(); }
}

#[tauri::command]
pub fn web_bridge_pair(window: tauri::WebviewWindow) -> Result<Value,String> {
    if window.label() != "main" { return Err("Local window required".into()); }
    if !READY.load(std::sync::atomic::Ordering::Relaxed) { return Err("Cầu nối web chưa sẵn sàng; cổng 17864 có thể đang được dùng.".into()); }
    Ok(json!({"code":*TOKEN,"url":format!("{SITE}/#connect={}", *TOKEN)}))
}

#[derive(Clone)]
struct Bridge { app: tauri::AppHandle, assets: Arc<Mutex<HashMap<String, PathBuf>>> }

fn allowed_origin(origin: &str) -> bool {
    origin == SITE || cfg!(debug_assertions) && matches!(origin,"http://127.0.0.1:1420" | "http://localhost:1420")
}

fn output(status: StatusCode, body: Value, origin: Option<&str>) -> Response {
    let mut response = Response::new(Body::from(body.to_string()));
    *response.status_mut() = status;
    response.headers_mut().insert("Content-Type",HeaderValue::from_static("application/json"));
    response.headers_mut().insert("Cache-Control",HeaderValue::from_static("no-store"));
    response.headers_mut().insert("Vary",HeaderValue::from_static("Origin"));
    if let Some(origin) = origin.filter(|s|allowed_origin(s)) {
        response.headers_mut().insert("Access-Control-Allow-Origin",HeaderValue::from_str(origin).unwrap());
        response.headers_mut().insert("Access-Control-Allow-Methods",HeaderValue::from_static("POST, GET, OPTIONS"));
        response.headers_mut().insert("Access-Control-Allow-Headers",HeaderValue::from_static("authorization, content-type"));
        response.headers_mut().insert("Access-Control-Allow-Private-Network",HeaderValue::from_static("true"));
    }
    response
}

fn asset_url(bridge: &Bridge, path: &str) -> String {
    let mut assets = bridge.assets.lock_safe();
    if let Some((id,_)) = assets.iter().find(|(_,p)|p.to_string_lossy() == path) {
        return format!("http://127.0.0.1:{PORT}/asset/{id}");
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    assets.insert(id.clone(), PathBuf::from(path));
    format!("http://127.0.0.1:{PORT}/asset/{id}")
}

fn arg<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> Result<T,String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null)).map_err(|_|format!("Invalid argument: {key}"))
}

async fn dispatch(b: &Bridge, command: &str, a: &Value) -> Result<Value,String> {
    let app = b.app.clone();
    let state = app.state::<AppState>();
    let window = app.get_webview_window("main").ok_or("Ứng dụng chưa sẵn sàng")?;
    macro_rules! val { ($e:expr) => { serde_json::to_value($e).map_err(|e|e.to_string()) }; }
    macro_rules! unit { ($e:expr) => {{ $e; Ok(Value::Null) }}; }
    match command {
        "get_settings" => Ok(c::get_settings(state)),
        "patch_settings" => Ok(c::patch_settings(app.clone(),arg(a,"patch")?)),
        "get_current_position" => val!(c::get_current_position(state)),
        "list_waypoints" => val!(c::list_waypoints(state)),
        "list_waypoints_px" => val!(c::list_waypoints_px(state)),
        "add_waypoint_at_pixel" => val!(c::add_waypoint_at_pixel(app.clone(),state,arg(a,"px")?,arg(a,"py")?,arg(a,"name")?)),
        "add_waypoint_here" => val!(c::add_waypoint_here(app.clone(),state,arg(a,"name")?)),
        "rename_waypoint" => val!(c::rename_waypoint(app.clone(),state,arg(a,"id")?,arg(a,"name")?)),
        "set_waypoint_color" => val!(c::set_waypoint_color(app.clone(),state,arg(a,"id")?,arg(a,"color")?)),
        "delete_waypoint" => val!(c::delete_waypoint(app.clone(),state,arg(a,"id")?)),
        "resolve_coordinates" => val!(c::resolve_coordinates(state,arg(a,"text")?)),
        "get_previous_trail" => val!(c::get_previous_trail(state)),
        "get_current_trail" => val!(c::get_current_trail(state)),
        "clear_trail" => unit!(c::clear_trail(app.clone(),state)),
        "data_status" => val!(c::data_status()),
        "get_fullscreen_mode" => val!(c::get_fullscreen_mode()),
        "check_hotkey_available" => val!(c::check_hotkey_available(arg(a,"spec")?)),
        "apply_hotkeys" => unit!(c::apply_hotkeys(app.clone(),state)),
        "fetch_data" => unit!(c::fetch_data(app.clone(),arg(a,"force")?)),
        "get_pois" => c::get_pois(),
        "get_pois_render" => val!(c::get_pois_render(state)?),
        "nearest_waypoint" => val!(c::nearest_waypoint(state)),
        "set_basemap_source" => unit!(c::set_basemap_source(app.clone(),arg(a,"source")?).await?),
        "get_basemap_paths" => {
            let mut data = serde_json::to_value(c::get_basemap_paths(state)).map_err(|e|e.to_string())?;
            for key in ["minimap","fullmap"] { if let Some(path) = data[key].as_str() { data[key] = json!(asset_url(b,path)); } }
            Ok(data)
        },
        "get_map_info" => {
            let mut data = serde_json::to_value(c::get_map_info(state)).map_err(|e|e.to_string())?;
            if let Some(overlays) = data["overlays"].as_array_mut() { for item in overlays { if let Some(path) = item["path"].as_str() { item["path"] = json!(asset_url(b,path)); } } }
            Ok(data)
        },
        "era_live_state" => era::era_live_state(window),
        "era_atlas" => era::era_atlas(window).await,
        "era_request" => era::era_request(window,arg(a,"action")?,arg(a,"value")?).await,
        "era_open" => unit!(era::era_open(window,arg(a,"login")?).await?),
        "era_finish_login" => unit!(era::era_finish_login(window).await?),
        "era_garage_get" => era::era_garage_get(window,arg(a,"slot")?).await,
        "era_garage_action" => era::era_garage_action(window,arg(a,"action")?,arg(a,"slot")?,arg(a,"stateHash")?).await,
        "era_skin_policy" => era::era_skin_policy(window).await,
        "era_skin_apply" => era::era_skin_apply(window,arg(a,"colors")?).await,
        "era_suicide_status" => era::era_suicide_status(window).await,
        "era_self_suicide" => era::era_self_suicide(window,arg(a,"confirmed")?).await,
        "islepilot_state" => val!(c::islepilot_state(app.clone())),
        "islepilot_overlay_map" => val!(c::islepilot_overlay_map(app.clone()).await?),
        "islepilot_cdn_asset" => Ok(json!(asset_url(b,&c::islepilot_cdn_asset(app.clone(),arg(a,"url")?).await?))),
        "islepilot_garage" => val!(c::islepilot_garage().await?),
        "islepilot_garage_park" => c::islepilot_garage_park().await,
        "islepilot_garage_restore" => c::islepilot_garage_restore(arg(a,"id")?).await,
        "islepilot_garage_sell" => c::islepilot_garage_sell(arg(a,"id")?).await,
        "islepilot_garage_rename" => c::islepilot_garage_rename(arg(a,"id")?,arg(a,"name")?).await,
        "islepilot_token_login" => unit!(c::islepilot_token_login(app.clone()).await?),
        "islepilot_login" => unit!(c::islepilot_login(app.clone(),arg(a,"domain")?).await?),
        "islepilot_cancel_login" => unit!(c::islepilot_cancel_login(app.clone())),
        "islepilot_logout" => unit!(c::islepilot_logout(app.clone())?),
        "islepilot_apply" => unit!(c::islepilot_apply(app.clone())),
        _ => Err("Chức năng này chỉ dùng trực tiếp trong ứng dụng Windows.".into()),
    }
}

async fn handle(State(b): State<Bridge>, request: Request) -> Response {
    let origin = request.headers().get("Origin").and_then(|v|v.to_str().ok()).unwrap_or("").to_string();
    if !allowed_origin(&origin) { return output(StatusCode::FORBIDDEN,json!({"error":"Origin rejected"}),None); }
    let method = request.method().clone();
    if method == axum::http::Method::OPTIONS { return output(StatusCode::OK,json!({}),Some(&origin)); }
    let authenticated = request.headers().get("Authorization").and_then(|v|v.to_str().ok()) == Some(format!("Bearer {}",*TOKEN).as_str());
    if !authenticated { return output(StatusCode::UNAUTHORIZED,json!({"error":"Mã ghép đôi không đúng hoặc ứng dụng đã khởi động lại."}),Some(&origin)); }
    let path = request.uri().path().to_string();
    if method == axum::http::Method::GET && path.starts_with("/asset/") {
        let path = b.assets.lock_safe().get(&path[7..]).cloned();
        if let Some(path) = path {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                let mime = match path.extension().and_then(|s|s.to_str()).unwrap_or("") { "png"=>"image/png", "jpg"|"jpeg"=>"image/jpeg", "webp"=>"image/webp", "glb"=>"model/gltf-binary", _=>"application/octet-stream" };
                let mut response = output(StatusCode::OK,Value::Null,Some(&origin));
                response.headers_mut().insert("Content-Type",HeaderValue::from_static(mime));
                *response.body_mut() = Body::from(bytes); return response;
            }
        }
        return output(StatusCode::NOT_FOUND,json!({"error":"Asset unavailable"}),Some(&origin));
    }
    if method != axum::http::Method::POST || path != "/rpc" { return output(StatusCode::NOT_FOUND,json!({"error":"Not found"}),Some(&origin)); }
    let body = match axum::body::to_bytes(request.into_body(),65536).await { Ok(v)=>v,Err(_)=>return output(StatusCode::PAYLOAD_TOO_LARGE,json!({"error":"Request too large"}),Some(&origin)) };
    let data: Value = match serde_json::from_slice(&body) { Ok(v)=>v,Err(_)=>return output(StatusCode::BAD_REQUEST,json!({"error":"Invalid JSON"}),Some(&origin)) };
    let command = data["command"].as_str().unwrap_or("");
    let result = if command == "web_events" {
        let after = data["args"]["after"].as_u64().unwrap_or(0);
        Ok(json!(EVENTS.lock_safe().iter().filter(|e|e["id"].as_u64().unwrap_or(0)>after).cloned().collect::<Vec<_>>()))
    } else { dispatch(&b,command,&data["args"]).await };
    output(StatusCode::OK,match result { Ok(value)=>json!({"result":value}), Err(error)=>json!({"error":error}) },Some(&origin))
}

pub fn spawn(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST,PORT)).await { Ok(v)=>v,Err(_)=>{log::warn!("Web bridge port unavailable");return} };
        READY.store(true,std::sync::atomic::Ordering::Relaxed);
        let router = Router::new().fallback(any(handle)).with_state(Bridge{app,assets:Arc::new(Mutex::new(HashMap::new()))});
        if let Err(e) = axum::serve(listener,router).await { log::warn!("Web bridge stopped: {e}"); }
        READY.store(false,std::sync::atomic::Ordering::Relaxed);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn origin_is_exact() {
        assert!(allowed_origin(SITE));
        for origin in ["null","https://heyguys-dashboard.pages.dev.evil.test","http://heyguys-dashboard.pages.dev","https://other.pages.dev"] { assert!(!allowed_origin(origin)); }
    }
    #[test] fn pairing_code_has_256_random_bits() { assert_eq!(TOKEN.len(),64); }
}
