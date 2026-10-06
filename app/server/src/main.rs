use axum::{
    Json, Router,
    body::Body,
    extract::{RawQuery, State},
    http::{HeaderValue, Method, Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use keyring::Entry;
use rand::{RngCore, rngs::OsRng};
use reqwest::{Client, StatusCode as ReqwestStatus};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    env,
    fs::{self, OpenOptions},
    io::Write,
    net::TcpListener,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tower_http::services::ServeDir;
use url::form_urlencoded;

const CLIENT_ID: &str = "7vmom55m1qstvq8i71ph127bfq";
const EVENT_ID: &str = "reinvent2026";
const AUTH_ENDPOINT: &str = "https://oauth.awsevents.com/oauth2/authorize";
const TOKEN_ENDPOINT: &str = "https://oauth.awsevents.com/oauth2/token";
const REVOKE_ENDPOINT: &str = "https://oauth.awsevents.com/oauth2/revoke";
const API_ROOT: &str = "https://api.awsevents.com/v1";
const KEYCHAIN_SERVICE: &str = "com.openai.reinvent-session-explorer.aws";
const KEYCHAIN_ACCOUNT: &str = "refresh-token";
const GOOGLE_KEYCHAIN_SERVICE: &str = "com.openai.reinvent-session-explorer.google";
const GOOGLE_CLIENT_ACCOUNT: &str = "oauth-client-id";
const GOOGLE_REFRESH_ACCOUNT: &str = "refresh-token";
const GOOGLE_CALENDAR_ACCOUNT: &str = "calendar-id";
const GOOGLE_EVENT_MAP_ACCOUNT: &str = "event-map";
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/calendar.app.created";
const CACHE_TTL: Duration = Duration::from_secs(15 * 60);
const ERROR_RETRY_DELAY: Duration = Duration::from_secs(15);

#[derive(Clone)]
struct AppState(Arc<Inner>);

struct Inner {
    port: u16,
    origin: String,
    cookie_value: String,
    csrf_token: String,
    client: Client,
    pending_login: Mutex<Option<PendingLogin>>,
    pending_google_login: Mutex<Option<PendingLogin>>,
    auth: Mutex<AuthState>,
    google_auth: Mutex<AuthState>,
    catalogs: Mutex<HashMap<String, Arc<Mutex<Catalog>>>>,
}

#[derive(Clone)]
struct PendingLogin {
    state: String,
    verifier: String,
    redirect_uri: String,
    expires_at: Instant,
}

#[derive(Default)]
struct AuthState {
    access_token: Option<String>,
    expires_at: Option<Instant>,
    account_id: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    id_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct SessionPage {
    items: Vec<Value>,
    #[serde(rename = "totalCount")]
    total_count: u64,
    #[serde(rename = "nextToken")]
    next_token: Option<String>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedCatalog {
    items: Vec<Value>,
    total_count: Option<u64>,
    pages: usize,
    complete: bool,
    fetched_at: Option<u64>,
}

#[derive(Default)]
struct Catalog {
    saved: PersistedCatalog,
    fetching: bool,
    next_token: Option<String>,
    seen_tokens: HashSet<String>,
    retry_after: Option<Instant>,
    error: Option<String>,
}

fn merge_session_page(
    saved: &mut PersistedCatalog,
    page: SessionPage,
) -> Result<Option<String>, &'static str> {
    if page.next_token.as_deref().is_some_and(str::is_empty) {
        return Err("AWS_RESPONSE_INVALID");
    }
    if saved.total_count.is_none() {
        saved.total_count = Some(page.total_count);
    }
    let mut ids: HashSet<String> = saved
        .items
        .iter()
        .filter_map(|item| item.get("sessionId").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    for item in page.items {
        let id = item
            .get("sessionId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or("AWS_RESPONSE_INVALID")?;
        if ids.insert(id.to_owned()) {
            saved.items.push(item);
        }
    }
    saved.pages += 1;
    saved.fetched_at = Some(now_epoch());
    let next = page.next_token;
    saved.complete = next.is_none();
    Ok(next)
}

fn mark_page_token(catalog: &mut Catalog, token: Option<&str>) -> Result<(), &'static str> {
    if let Some(value) = token {
        if !catalog.seen_tokens.insert(value.to_owned()) {
            return Err("PAGINATION_TOKEN_REPEATED");
        }
        catalog.next_token = Some(value.to_owned());
    }
    Ok(())
}

fn consume_login_state(
    pending: &mut Option<PendingLogin>,
    received_state: &str,
) -> Result<PendingLogin, &'static str> {
    let Some(value) = pending.as_ref() else {
        return Err("OAUTH_STATE_MISSING");
    };
    if value.expires_at <= Instant::now() {
        *pending = None;
        return Err("OAUTH_STATE_EXPIRED");
    }
    if value.state != received_state {
        return Err("OAUTH_STATE_MISMATCH");
    }
    pending.take().ok_or("OAUTH_STATE_MISSING")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogResponse {
    items: Vec<Value>,
    total_count: Option<u64>,
    pages: usize,
    complete: bool,
    fetched_at: Option<u64>,
    refreshing: bool,
    error: Option<String>,
}

#[derive(Serialize)]
struct SessionResponse {
    csrf: String,
    authenticated: bool,
    account_id: Option<String>,
}

#[derive(Serialize)]
struct ApiError {
    error: &'static str,
}

fn response_error(status: StatusCode, code: &'static str) -> Response {
    (status, Json(ApiError { error: code })).into_response()
}

fn random_token(bytes: usize) -> String {
    let mut value = vec![0u8; bytes];
    OsRng.fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn keychain_entry() -> Result<Entry, &'static str> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|_| "KEYCHAIN_UNAVAILABLE")
}

async fn keychain_read() -> Result<Option<String>, &'static str> {
    tokio::task::spawn_blocking(|| match keychain_entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("KEYCHAIN_UNAVAILABLE"),
    })
    .await
    .map_err(|_| "KEYCHAIN_UNAVAILABLE")?
}

async fn keychain_write(value: String) -> Result<(), &'static str> {
    tokio::task::spawn_blocking(move || {
        keychain_entry()?
            .set_password(&value)
            .map_err(|_| "KEYCHAIN_UNAVAILABLE")
    })
    .await
    .map_err(|_| "KEYCHAIN_UNAVAILABLE")?
}

async fn keychain_delete() -> Result<(), &'static str> {
    tokio::task::spawn_blocking(|| match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("KEYCHAIN_UNAVAILABLE"),
    })
    .await
    .map_err(|_| "KEYCHAIN_UNAVAILABLE")?
}

fn google_keychain_entry(account: &str) -> Result<Entry, &'static str> {
    Entry::new(GOOGLE_KEYCHAIN_SERVICE, account).map_err(|_| "KEYCHAIN_UNAVAILABLE")
}

async fn google_keychain_read(account: &'static str) -> Result<Option<String>, &'static str> {
    tokio::task::spawn_blocking(move || match google_keychain_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("KEYCHAIN_UNAVAILABLE"),
    })
    .await
    .map_err(|_| "KEYCHAIN_UNAVAILABLE")?
}

async fn google_keychain_write(account: &'static str, value: String) -> Result<(), &'static str> {
    tokio::task::spawn_blocking(move || {
        google_keychain_entry(account)?
            .set_password(&value)
            .map_err(|_| "KEYCHAIN_UNAVAILABLE")
    })
    .await
    .map_err(|_| "KEYCHAIN_UNAVAILABLE")?
}

async fn google_client_id() -> Result<Option<String>, &'static str> {
    if let Ok(value) = env::var("GOOGLE_OAUTH_CLIENT_ID") {
        if valid_google_client_id(&value) {
            return Ok(Some(value));
        }
        return Err("GOOGLE_CLIENT_ID_INVALID");
    }
    let Some(value) = google_keychain_read(GOOGLE_CLIENT_ACCOUNT).await? else {
        return Ok(None);
    };
    if valid_google_client_id(&value) {
        Ok(Some(value))
    } else {
        Err("GOOGLE_CLIENT_ID_INVALID")
    }
}

async fn google_event_map() -> Result<HashMap<String, String>, &'static str> {
    let Some(raw) = google_keychain_read(GOOGLE_EVENT_MAP_ACCOUNT).await? else { return Ok(HashMap::new()); };
    serde_json::from_str(&raw).map_err(|_| "GOOGLE_EVENT_MAP_INVALID")
}

async fn save_google_event_map(map: &HashMap<String, String>) -> Result<(), &'static str> {
    let value = serde_json::to_string(map).map_err(|_| "GOOGLE_EVENT_MAP_INVALID")?;
    google_keychain_write(GOOGLE_EVENT_MAP_ACCOUNT, value).await
}

fn valid_google_client_id(value: &str) -> bool {
    value.ends_with(".apps.googleusercontent.com")
        && value.len() > ".apps.googleusercontent.com".len()
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn subject_from_id_token(token: &str) -> Result<String, &'static str> {
    let mut parts = token.split('.');
    let _header = parts.next().ok_or("TOKEN_INVALID_RESPONSE")?;
    let payload = parts.next().ok_or("TOKEN_INVALID_RESPONSE")?;
    let claims: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| "TOKEN_INVALID_RESPONSE")?,
    )
    .map_err(|_| "TOKEN_INVALID_RESPONSE")?;
    let sub = claims
        .get("sub")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or("TOKEN_INVALID_RESPONSE")?;
    // This digest is only a local cache namespace. Authorization always comes from
    // the TLS-protected AWS access token, never from an unverified ID-token claim.
    let digest = Sha256::digest(sub.as_bytes());
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn make_auth_url(port: u16, state: &str, verifier: &str) -> String {
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = url::Url::parse(AUTH_ENDPOINT).expect("constant auth endpoint");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "openid email events/access")
        .append_pair("identity_provider", "AWSBuilderID")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state);
    url.to_string()
}

fn cache_directory() -> Result<PathBuf, &'static str> {
    let home = env::var_os("HOME").ok_or("CACHE_UNAVAILABLE")?;
    let path = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("reinvent-session-explorer")
        .join("catalog");
    fs::create_dir_all(&path).map_err(|_| "CACHE_UNAVAILABLE")?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "CACHE_UNAVAILABLE")?;
    Ok(path)
}

fn cache_path(account_id: &str) -> Result<PathBuf, &'static str> {
    Ok(cache_directory()?.join(format!("{account_id}.json")))
}

fn load_persisted_cache(account_id: &str) -> PersistedCatalog {
    let Ok(path) = cache_path(account_id) else {
        return PersistedCatalog::default();
    };
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn persist_catalog(account_id: &str, value: &PersistedCatalog) -> Result<(), &'static str> {
    let path = cache_path(account_id)?;
    let temp_path = path.with_extension(format!("{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec(value).map_err(|_| "CACHE_WRITE_FAILED")?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&temp_path)
        .map_err(|_| "CACHE_WRITE_FAILED")?;
    file.write_all(&bytes).map_err(|_| "CACHE_WRITE_FAILED")?;
    file.sync_all().map_err(|_| "CACHE_WRITE_FAILED")?;
    fs::rename(&temp_path, &path).map_err(|_| "CACHE_WRITE_FAILED")?;
    Ok(())
}

async fn load_access_token(state: &AppState, force_refresh: bool) -> Result<String, &'static str> {
    let mut auth = state.0.auth.lock().await;
    if !force_refresh
        && auth.access_token.is_some()
        && auth
            .expires_at
            .is_some_and(|expiry| expiry > Instant::now() + Duration::from_secs(30))
    {
        return Ok(auth.access_token.clone().expect("checked above"));
    }
    let refresh_token = keychain_read().await?.ok_or("SIGN_IN_REQUIRED")?;
    let response = state
        .0
        .client
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "TOKEN_REFRESH_FAILED")?;
    if !response.status().is_success() {
        auth.access_token = None;
        auth.expires_at = None;
        return Err("SIGN_IN_REQUIRED");
    }
    let token: TokenResponse = response
        .json()
        .await
        .map_err(|_| "TOKEN_INVALID_RESPONSE")?;
    if token.access_token.is_empty() || token.expires_in == 0 {
        return Err("TOKEN_INVALID_RESPONSE");
    }
    if let Some(rotated) = token.refresh_token {
        keychain_write(rotated).await?;
    }
    auth.access_token = Some(token.access_token.clone());
    auth.expires_at = Some(Instant::now() + Duration::from_secs(token.expires_in));
    Ok(token.access_token)
}

async fn api_get(state: &AppState, url: &str) -> Result<reqwest::Response, &'static str> {
    let mut refreshed = false;
    let mut transient_retry = 0u32;
    loop {
        let access = load_access_token(state, refreshed).await?;
        let result = state.0.client.get(url).bearer_auth(access).send().await;
        let response = match result {
            Ok(value) => value,
            Err(_) if transient_retry < 2 => {
                transient_retry += 1;
                tokio::time::sleep(Duration::from_secs(2u64.pow(transient_retry - 1))).await;
                continue;
            }
            Err(_) => return Err("NETWORK_ERROR"),
        };
        if response.status() == ReqwestStatus::UNAUTHORIZED && !refreshed {
            refreshed = true;
            continue;
        }
        if response.status() == ReqwestStatus::TOO_MANY_REQUESTS && transient_retry < 2 {
            let delay = response
                .headers()
                .get("retry-after")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|seconds| Duration::from_secs(seconds.min(30)))
                .unwrap_or_else(|| Duration::from_secs(2u64.pow(transient_retry + 1)));
            transient_retry += 1;
            tokio::time::sleep(delay).await;
            continue;
        }
        if response.status().is_server_error() && transient_retry < 2 {
            transient_retry += 1;
            tokio::time::sleep(Duration::from_secs(2u64.pow(transient_retry))).await;
            continue;
        }
        return Ok(response);
    }
}

fn catalog_response(catalog: &Catalog) -> CatalogResponse {
    CatalogResponse {
        items: catalog.saved.items.clone(),
        total_count: catalog.saved.total_count,
        pages: catalog.saved.pages,
        complete: catalog.saved.complete,
        fetched_at: catalog.saved.fetched_at,
        refreshing: catalog.fetching,
        error: catalog.error.clone(),
    }
}

async fn catalog_for(state: &AppState, account_id: &str) -> Arc<Mutex<Catalog>> {
    let mut catalogs = state.0.catalogs.lock().await;
    catalogs
        .entry(account_id.to_owned())
        .or_insert_with(|| {
            Arc::new(Mutex::new(Catalog {
                saved: load_persisted_cache(account_id),
                ..Catalog::default()
            }))
        })
        .clone()
}

fn can_start_fetch(catalog: &Catalog, force: bool) -> bool {
    if catalog.fetching {
        return false;
    }
    if !force
        && catalog
            .retry_after
            .is_some_and(|until| until > Instant::now())
    {
        return false;
    }
    force
        || !catalog.saved.complete
        || catalog
            .saved
            .fetched_at
            .is_none_or(|fetched| now_epoch().saturating_sub(fetched) > CACHE_TTL.as_secs())
}

async fn start_catalog_fetch(state: AppState, account_id: String, force: bool) {
    let catalog = catalog_for(&state, &account_id).await;
    {
        let mut value = catalog.lock().await;
        if !can_start_fetch(&value, force) {
            return;
        }
        value.fetching = true;
        value.error = None;
        value.retry_after = None;
        value.next_token = None;
        value.seen_tokens.clear();
        value.saved.complete = false;
        value.saved.total_count = None;
        value.saved.pages = 0;
    }
    tokio::spawn(async move {
        let mut next_token: Option<String> = None;
        let mut pages = 0usize;
        let mut failure: Option<&'static str> = None;
        loop {
            if pages >= 1000 {
                failure = Some("PAGE_LIMIT_REACHED");
                break;
            }
            let token = next_token.take();
            let token_result = {
                let mut cache = catalog.lock().await;
                mark_page_token(&mut cache, token.as_deref())
            };
            if let Err(code) = token_result {
                failure = Some(code);
                break;
            }
            let url = session_page_url(token.as_deref());
            let response = match api_get(&state, &url).await {
                Ok(response) => response,
                Err(code) => {
                    failure = Some(code);
                    break;
                }
            };
            if !response.status().is_success() {
                failure = Some(match response.status().as_u16() {
                    401 => "SIGN_IN_REQUIRED",
                    403 => "EVENT_REGISTRATION_REQUIRED",
                    429 => "RATE_LIMITED",
                    500..=599 => "AWS_SERVICE_UNAVAILABLE",
                    _ => "AWS_REQUEST_FAILED",
                });
                break;
            }
            let page: SessionPage = match response.json().await {
                Ok(value) => value,
                Err(_) => {
                    failure = Some("AWS_RESPONSE_INVALID");
                    break;
                }
            };
            let next = page.next_token.clone();
            let mut cache = catalog.lock().await;
            if let Err(code) = merge_session_page(&mut cache.saved, page) {
                failure = Some(code);
                break;
            }
            pages += 1;
            cache.next_token = next.clone();
            if next.is_none() {
                cache.error = None;
            }
            let persisted = cache.saved.clone();
            drop(cache);
            let account_copy = account_id.clone();
            let _ = tokio::task::spawn_blocking(move || persist_catalog(&account_copy, &persisted))
                .await;
            match next {
                Some(value) if value.is_empty() => {
                    failure = Some("AWS_RESPONSE_INVALID");
                    break;
                }
                Some(value) => next_token = Some(value),
                None => break,
            }
        }
        let mut cache = catalog.lock().await;
        cache.fetching = false;
        cache.next_token = None;
        if let Some(code) = failure {
            cache.saved.complete = false;
            cache.error = Some(code.to_owned());
            cache.retry_after = Some(Instant::now() + ERROR_RETRY_DELAY);
        }
        let persisted = cache.saved.clone();
        drop(cache);
        let _ = tokio::task::spawn_blocking(move || persist_catalog(&account_id, &persisted)).await;
    });
}

fn session_page_url(token: Option<&str>) -> String {
    let mut url = url::Url::parse(&format!("{API_ROOT}/events/{EVENT_ID}/sessions"))
        .expect("constant AWS API URL");
    url.query_pairs_mut()
        .append_pair("includeAbstracts", "true");
    if let Some(token) = token {
        url.query_pairs_mut().append_pair("nextToken", token);
    }
    url.to_string()
}

async fn security_layer(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let headers = request.headers();
    let expected_host = format!("127.0.0.1:{}", state.0.port);
    if headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        != Some(expected_host.as_str())
    {
        return response_error(StatusCode::FORBIDDEN, "HOST_NOT_ALLOWED");
    }
    let path = request.uri().path().to_owned();
    let method = request.method().clone();
    if path.starts_with("/api/") && path != "/api/session" {
        let cookie = headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !cookie
            .split(';')
            .any(|part| part.trim() == format!("local_session={}", state.0.cookie_value))
        {
            return response_error(StatusCode::UNAUTHORIZED, "LOCAL_SESSION_REQUIRED");
        }
    }
    if path.starts_with("/api/") && method != Method::GET && method != Method::HEAD {
        let origin = headers
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok());
        let csrf = headers
            .get("x-csrf-token")
            .and_then(|value| value.to_str().ok());
        if origin != Some(state.0.origin.as_str()) || csrf != Some(state.0.csrf_token.as_str()) {
            return response_error(StatusCode::FORBIDDEN, "CSRF_CHECK_FAILED");
        }
    }
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"),
    );
    // Local app assets change in place between phases. Keep modules and styles
    // consistent with the current HTML instead of mixing cached UI versions.
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if path == "/api/session" {
        let value = format!(
            "local_session={}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400",
            state.0.cookie_value
        );
        if let Ok(value) = HeaderValue::from_str(&value) {
            headers.insert(header::SET_COOKIE, value);
        }
    }
    response
}

async fn session_status(State(state): State<AppState>) -> Response {
    let _ = load_access_token(&state, false).await;
    let auth = state.0.auth.lock().await;
    (
        StatusCode::OK,
        Json(SessionResponse {
            csrf: state.0.csrf_token.clone(),
            authenticated: auth.access_token.is_some() && auth.account_id.is_some(),
            account_id: auth.account_id.clone(),
        }),
    )
        .into_response()
}

async fn auth_start(State(state): State<AppState>) -> Response {
    let mut verifier_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let login_state = random_token(32);
    let redirect_uri = format!("http://127.0.0.1:{}/callback", state.0.port);
    let authorization_url = make_auth_url(state.0.port, &login_state, &verifier);
    *state.0.pending_login.lock().await = Some(PendingLogin {
        state: login_state,
        verifier,
        redirect_uri,
        expires_at: Instant::now() + Duration::from_secs(5 * 60),
    });
    (
        StatusCode::OK,
        Json(json!({ "authorizationUrl": authorization_url })),
    )
        .into_response()
}

async fn callback(State(state): State<AppState>, RawQuery(raw): RawQuery) -> Response {
    let query: HashMap<String, String> = form_urlencoded::parse(raw.as_deref().unwrap_or_default().as_bytes())
        .into_owned()
        .collect();
    let code = query.get("code").filter(|value| !value.is_empty());
    let received_state = query.get("state").filter(|value| !value.is_empty());
    let Some(code) = code else {
        return callback_error("認証応答にcodeがありません。アプリへ戻って再試行してください。");
    };
    let Some(received_state) = received_state else {
        return callback_error("認証応答にstateがありません。アプリへ戻って再試行してください。");
    };
    let state_result = {
        let mut guard = state.0.pending_login.lock().await;
        consume_login_state(&mut *guard, received_state)
    };
    let pending = match state_result {
        Ok(value) => value,
        Err(_) => {
            return callback_error("認証stateが一致しないか、期限切れです。再試行してください。");
        }
    };
    let response = state
        .0
        .client
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("redirect_uri", pending.redirect_uri.as_str()),
            ("code", code.as_str()),
            ("code_verifier", pending.verifier.as_str()),
        ])
        .send()
        .await;
    let Ok(response) = response else {
        return callback_error(
            "AWS認証サーバーへ接続できませんでした。後でもう一度お試しください。",
        );
    };
    if !response.status().is_success() {
        return callback_error(
            "AWS認証に失敗しました。Builder IDとイベント登録を確認してください。",
        );
    }
    let Ok(tokens) = response.json::<TokenResponse>().await else {
        return callback_error("AWS認証応答を読み取れませんでした。");
    };
    let Some(id_token) = tokens.id_token.as_deref() else {
        return callback_error("AWS認証応答にID tokenがありません。");
    };
    let Ok(account_id) = subject_from_id_token(id_token) else {
        return callback_error("AWS認証応答のアカウント情報を読み取れませんでした。");
    };
    let Some(refresh_token) = tokens.refresh_token else {
        return callback_error("AWS認証応答にrefresh tokenがありません。");
    };
    if tokens.access_token.is_empty() || tokens.expires_in == 0 {
        return callback_error("AWS認証応答のtoken情報が不完全です。");
    }
    if keychain_write(refresh_token).await.is_err() {
        return callback_error("Mac Keychainへ保存できませんでした。tokenは保持していません。");
    }
    {
        let mut auth = state.0.auth.lock().await;
        auth.access_token = Some(tokens.access_token);
        auth.expires_at = Some(Instant::now() + Duration::from_secs(tokens.expires_in));
        auth.account_id = Some(account_id);
    }
    Redirect::to("/").into_response()
}

fn callback_error(message: &str) -> Response {
    let body = format!(
        "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>認証エラー</title><body><main><h1>認証を完了できませんでした</h1><p>{message}</p><p><a href=\"/\">Session Explorerへ戻る</a></p></main></body></html>"
    );
    (
        StatusCode::BAD_REQUEST,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        body,
    )
        .into_response()
}

async fn auth_logout(State(state): State<AppState>) -> Response {
    let refresh_token = keychain_read().await.unwrap_or(None);
    if let Some(token) = refresh_token.as_deref() {
        // Revocation is best-effort for connectivity, but local copies are always discarded.
        let _ = state
            .0
            .client
            .post(REVOKE_ENDPOINT)
            .form(&[("client_id", CLIENT_ID), ("token", token)])
            .send()
            .await;
    }
    let keychain_status = keychain_delete().await;
    {
        let mut auth = state.0.auth.lock().await;
        auth.access_token = None;
        auth.expires_at = None;
        auth.account_id = None;
    }
    if keychain_status.is_err() {
        return response_error(StatusCode::INTERNAL_SERVER_ERROR, "KEYCHAIN_UNAVAILABLE");
    }
    let local_logout = format!("http://127.0.0.1:{}/logout", state.0.port);
    let broker_logout = format!(
        "https://oauth.awsevents.com/logout?client_id={CLIENT_ID}&logout_uri={}",
        url::form_urlencoded::byte_serialize(local_logout.as_bytes()).collect::<String>()
    );
    let mut idp_url = url::Url::parse("https://idp.awsevents.com/oidc/logout").expect("constant");
    idp_url
        .query_pairs_mut()
        .append_pair("redirect_uri", &broker_logout);
    (
        StatusCode::OK,
        Json(json!({ "logoutUrl": idp_url.to_string() })),
    )
        .into_response()
}

async fn logout_landing() -> Response {
    Redirect::to("/").into_response()
}

async fn live_catalog(State(state): State<AppState>) -> Response {
    let account_id = {
        let auth = state.0.auth.lock().await;
        auth.account_id.clone()
    };
    let Some(account_id) = account_id else {
        return response_error(StatusCode::UNAUTHORIZED, "SIGN_IN_REQUIRED");
    };
    let catalog = catalog_for(&state, &account_id).await;
    start_catalog_fetch(state, account_id, false).await;
    let response = {
        let value = catalog.lock().await;
        catalog_response(&value)
    };
    (StatusCode::OK, Json(response)).into_response()
}

async fn live_catalog_refresh(State(state): State<AppState>) -> Response {
    let account_id = {
        let auth = state.0.auth.lock().await;
        auth.account_id.clone()
    };
    let Some(account_id) = account_id else {
        return response_error(StatusCode::UNAUTHORIZED, "SIGN_IN_REQUIRED");
    };
    start_catalog_fetch(state.clone(), account_id.clone(), true).await;
    let catalog = catalog_for(&state, &account_id).await;
    let response = {
        let value = catalog.lock().await;
        catalog_response(&value)
    };
    (StatusCode::ACCEPTED, Json(response)).into_response()
}

async fn live_schedule(State(state): State<AppState>) -> Response {
    let url = format!("{API_ROOT}/events/{EVENT_ID}/schedule");
    match api_get(&state, &url).await {
        Ok(response) if response.status().is_success() => match response.json::<Value>().await {
            Ok(value) => Json(value).into_response(),
            Err(_) => response_error(StatusCode::BAD_GATEWAY, "AWS_RESPONSE_INVALID"),
        },
        Ok(response) => match response.status().as_u16() {
            401 => response_error(StatusCode::UNAUTHORIZED, "SIGN_IN_REQUIRED"),
            403 => response_error(StatusCode::FORBIDDEN, "EVENT_REGISTRATION_REQUIRED"),
            429 => response_error(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED"),
            _ => response_error(StatusCode::BAD_GATEWAY, "AWS_REQUEST_FAILED"),
        },
        Err(code) => response_error(StatusCode::BAD_GATEWAY, code),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReserveSessionsRequest { session_ids: Vec<String> }

async fn aws_reserved_ids(state: &AppState) -> Result<HashSet<String>, &'static str> {
    let url = format!("{API_ROOT}/events/{EVENT_ID}/schedule");
    let response = api_get(state, &url).await.map_err(|_| "SCHEDULE_READ_FAILED")?;
    if !response.status().is_success() { return Err("SCHEDULE_READ_FAILED"); }
    let value = response.json::<Value>().await.map_err(|_| "AWS_RESPONSE_INVALID")?;
    let ids = value.pointer("/schedule/reserved").and_then(Value::as_array).ok_or("AWS_RESPONSE_INVALID")?;
    ids.iter().map(|id| id.as_str().filter(|id| !id.is_empty()).map(str::to_owned).ok_or("AWS_RESPONSE_INVALID")).collect()
}

async fn live_reserve_sessions(State(state): State<AppState>, Json(input): Json<ReserveSessionsRequest>) -> Response {
    if input.session_ids.is_empty() || input.session_ids.len() > 10 {
        return response_error(StatusCode::BAD_REQUEST, "RESERVATION_ITEM_COUNT_INVALID");
    }
    let mut seen = HashSet::new();
    if input.session_ids.iter().any(|id| id.trim().is_empty() || id.len() > 256 || !seen.insert(id.as_str())) {
        return response_error(StatusCode::BAD_REQUEST, "RESERVATION_SESSION_IDS_INVALID");
    }
    let account_id = { state.0.auth.lock().await.account_id.clone() };
    let Some(account_id) = account_id else { return response_error(StatusCode::UNAUTHORIZED, "SIGN_IN_REQUIRED"); };
    let catalog = catalog_for(&state, &account_id).await;
    let available: HashMap<String, bool> = catalog.lock().await.saved.items.iter().filter_map(|item| {
        let id = item.get("sessionId")?.as_str()?;
        Some((id.to_owned(), item.get("isReservable").and_then(Value::as_bool).unwrap_or(false)))
    }).collect();
    if input.session_ids.iter().any(|id| available.get(id) != Some(&true)) {
        return response_error(StatusCode::BAD_REQUEST, "SESSION_NOT_RESERVABLE");
    }
    let before = match aws_reserved_ids(&state).await {
        Ok(ids) => ids,
        Err(code) => return response_error(StatusCode::BAD_GATEWAY, code),
    };
    if input.session_ids.iter().any(|id| before.contains(id)) {
        return response_error(StatusCode::CONFLICT, "SESSION_ALREADY_RESERVED");
    }
    let url = format!("{API_ROOT}/events/{EVENT_ID}/reservations");
    let body = json!({"sessionIds": input.session_ids});
    let mut refreshed = false;
    let response = loop {
        let access = match load_access_token(&state, refreshed).await {
            Ok(value) => value,
            Err(_) => return response_error(StatusCode::UNAUTHORIZED, "SIGN_IN_REQUIRED"),
        };
        match state.0.client.post(&url).bearer_auth(access).json(&body).send().await {
            Ok(response) if response.status() == ReqwestStatus::UNAUTHORIZED && !refreshed => { refreshed = true; continue; }
            Ok(response) => break Some(response),
            Err(_) => break None,
        }
    };
    let (mut successful, mut failed, mut unknown, response_ambiguous) = match response {
        None => (Vec::<String>::new(), Vec::<Value>::new(), input.session_ids.clone(), true),
        Some(response) if response.status().as_u16() == 200 => {
            let value = match response.json::<Value>().await { Ok(value) => value, Err(_) => json!({}) };
            let result = value.get("result");
            let successes = result.and_then(|v| v.get("successful")).and_then(Value::as_array);
            let failures = result.and_then(|v| v.get("failed")).and_then(Value::as_array);
            match (successes, failures) {
                (Some(successes), Some(failures)) => {
                    let submitted: HashSet<&str> = input.session_ids.iter().map(String::as_str).collect();
                    let mut seen_result = HashSet::new();
                    let mut good = Vec::new();
                    let mut bad = Vec::new();
                    let mut valid = true;
                    for id in successes {
                        match id.as_str() {
                            Some(id) if submitted.contains(id) && seen_result.insert(id.to_owned()) => good.push(id.to_owned()),
                            _ => valid = false,
                        }
                    }
                    for failure in failures {
                        let Some(id) = failure.get("sessionId").and_then(Value::as_str) else { valid = false; continue; };
                        if !submitted.contains(id) || !seen_result.insert(id.to_owned()) || failure.get("code").and_then(Value::as_str).is_none() { valid = false; continue; }
                        bad.push(failure.clone());
                    }
                    if !valid || seen_result.len() != submitted.len() { (Vec::new(), Vec::new(), input.session_ids.clone(), true) }
                    else { (good, bad, Vec::new(), false) }
                }
                _ => (Vec::new(), Vec::new(), input.session_ids.clone(), true),
            }
        }
        Some(response) => {
            let status = response.status();
            let code = match status.as_u16() { 401 => "SIGN_IN_REQUIRED", 403 => "EVENT_REGISTRATION_REQUIRED", 409 => "RESERVATIONS_CLOSED_OR_CONFLICT", 429 => "RATE_LIMITED", 400 => "RESERVATION_REQUEST_REJECTED", _ if status.is_server_error() => "RESERVATION_OUTCOME_UNKNOWN", _ => "RESERVATION_REQUEST_FAILED" };
            if status.is_server_error() { (Vec::new(), Vec::new(), input.session_ids.clone(), true) }
            else { return response_error(match status.as_u16() { 401 => StatusCode::UNAUTHORIZED, 403 => StatusCode::FORBIDDEN, 409 => StatusCode::CONFLICT, 429 => StatusCode::TOO_MANY_REQUESTS, _ => StatusCode::BAD_GATEWAY }, code); }
        }
    };
    let mut schedule_confirmed = false;
    let current = match aws_reserved_ids(&state).await {
        Ok(ids) => { schedule_confirmed = true; ids },
        Err(_) => HashSet::new(),
    };
    if schedule_confirmed {
        for id in &input.session_ids {
            if current.contains(id) {
                if !successful.contains(id) { successful.push(id.clone()); }
                failed.retain(|f| f.get("sessionId").and_then(Value::as_str) != Some(id));
                unknown.retain(|v| v != id);
            } else if successful.contains(id) {
                successful.retain(|value| value != id);
                if !unknown.contains(id) { unknown.push(id.clone()); }
            }
        }
        if response_ambiguous {
            for id in &input.session_ids {
                if !current.contains(id) && !unknown.contains(id) && !failed.iter().any(|f| f.get("sessionId").and_then(Value::as_str) == Some(id)) { unknown.push(id.clone()); }
            }
        }
    }
    Json(json!({"successful":successful,"failed":failed,"unknown":unknown,"scheduleConfirmed":schedule_confirmed})).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleConfigureRequest { client_id: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleSyncRequest { items: Vec<GoogleSyncItem> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleRemoveRequest { item_ids: Vec<String> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleSyncItem {
    item_id: String,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start: String,
    end: String,
}

async fn google_status(State(state): State<AppState>) -> Response {
    let configured = match google_client_id().await {
        Ok(value) => value.is_some(),
        Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code),
    };
    let connected = match google_keychain_read(GOOGLE_REFRESH_ACCOUNT).await {
        Ok(value) => value.is_some(),
        Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code),
    };
    let calendar_ready = google_keychain_read(GOOGLE_CALENDAR_ACCOUNT)
        .await
        .ok()
        .flatten()
        .is_some();
    let synced_item_ids: Vec<String> = match google_event_map().await {
        Ok(map) => map.into_keys().collect(),
        Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code),
    };
    let auth = state.0.google_auth.lock().await;
    Json(json!({"configured":configured,"connected":connected,"calendarReady":calendar_ready,"accessTokenReady":auth.access_token.is_some(),"syncedItemIds":synced_item_ids})).into_response()
}

async fn google_configure(State(_state): State<AppState>, Json(input): Json<GoogleConfigureRequest>) -> Response {
    let client_id = input.client_id.trim();
    if !valid_google_client_id(client_id) {
        return response_error(StatusCode::BAD_REQUEST, "GOOGLE_CLIENT_ID_INVALID");
    }
    if let Ok(Some(existing)) = google_keychain_read(GOOGLE_CLIENT_ACCOUNT).await {
        let has_refresh = google_keychain_read(GOOGLE_REFRESH_ACCOUNT).await.ok().flatten().is_some();
        let has_calendar_data = google_event_map().await.map(|map| !map.is_empty()).unwrap_or(true);
        if existing != client_id && (has_refresh || has_calendar_data) {
            return response_error(StatusCode::CONFLICT, "GOOGLE_DISCONNECT_BEFORE_RECONFIGURE");
        }
    }
    if google_keychain_write(GOOGLE_CLIENT_ACCOUNT, client_id.to_owned()).await.is_err() {
        return response_error(StatusCode::INTERNAL_SERVER_ERROR, "KEYCHAIN_UNAVAILABLE");
    }
    Json(json!({"configured":true})).into_response()
}

async fn google_connect(State(state): State<AppState>) -> Response {
    let client_id = match google_client_id().await {
        Ok(Some(value)) => value,
        Ok(None) => return response_error(StatusCode::PRECONDITION_FAILED, "GOOGLE_CLIENT_ID_REQUIRED"),
        Err(code) => return response_error(StatusCode::BAD_REQUEST, code),
    };
    let mut verifier_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let login_state = random_token(32);
    // Google's installed Desktop client uses the loopback IP redirect with no path.
    let redirect_uri = state.0.origin.clone();
    let mut authorization = match url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth") {
        Ok(value) => value,
        Err(_) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, "GOOGLE_OAUTH_UNAVAILABLE"),
    };
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    authorization.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_SCOPE)
        .append_pair("state", &login_state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    *state.0.pending_google_login.lock().await = Some(PendingLogin {
        state: login_state,
        verifier,
        redirect_uri,
        expires_at: Instant::now() + Duration::from_secs(5 * 60),
    });
    let authorization_url = authorization.to_string();
    #[cfg(target_os = "macos")]
    let opened = std::process::Command::new("open").arg(&authorization_url).spawn().is_ok();
    #[cfg(not(target_os = "macos"))]
    let opened = false;
    if !opened {
        *state.0.pending_google_login.lock().await = None;
        return response_error(StatusCode::INTERNAL_SERVER_ERROR, "GOOGLE_SYSTEM_BROWSER_UNAVAILABLE");
    }
    Json(json!({"opened":true})).into_response()
}

async fn root_or_google_callback(State(state): State<AppState>, RawQuery(raw): RawQuery) -> Response {
    let query: HashMap<String, String> = form_urlencoded::parse(raw.as_deref().unwrap_or_default().as_bytes())
        .into_owned().collect();
    if query.contains_key("code") || query.contains_key("state") || query.contains_key("error") {
        return google_callback(&state, query).await;
    }
    let target = raw.filter(|value| !value.bytes().any(|byte| byte.is_ascii_control()))
        .map(|value| format!("/index.html?{value}"))
        .unwrap_or_else(|| "/index.html".to_owned());
    Redirect::to(&target).into_response()
}

async fn google_callback(state: &AppState, query: HashMap<String, String>) -> Response {
    if query.contains_key("error") {
        return google_callback_page(false, "Google連携はキャンセルされました。アプリへ戻ってください。");
    }
    let code = query.get("code").filter(|value| !value.is_empty());
    let received_state = query.get("state").filter(|value| !value.is_empty());
    let (Some(code), Some(received_state)) = (code, received_state) else {
        return google_callback_page(false, "認証応答が不完全です。アプリへ戻って再試行してください。");
    };
    let pending = {
        let mut guard = state.0.pending_google_login.lock().await;
        match consume_login_state(&mut *guard, received_state) {
            Ok(value) => value,
            Err(_) => return google_callback_page(false, "認証stateが一致しないか期限切れです。アプリから再試行してください。"),
        }
    };
    let client_id = match google_client_id().await {
        Ok(Some(value)) => value,
        _ => return google_callback_page(false, "Google OAuth client設定を確認できませんでした。"),
    };
    let response = state.0.client.post("https://oauth2.googleapis.com/token")
        .form(&[("client_id", client_id.as_str()), ("code", code.as_str()),
            ("code_verifier", pending.verifier.as_str()), ("grant_type", "authorization_code"),
            ("redirect_uri", pending.redirect_uri.as_str())])
        .send().await;
    let Ok(response) = response else { return google_callback_page(false, "Google token endpointへ接続できませんでした。"); };
    if !response.status().is_success() { return google_callback_page(false, "Google OAuthに失敗しました。Desktop clientとCalendar API設定を確認してください。"); }
    let Ok(tokens) = response.json::<TokenResponse>().await else { return google_callback_page(false, "Googleのtoken応答を読み取れませんでした。"); };
    if tokens.access_token.is_empty() || tokens.expires_in == 0 { return google_callback_page(false, "Google token応答が不完全です。"); }
    let refresh_token = tokens.refresh_token.or(google_keychain_read(GOOGLE_REFRESH_ACCOUNT).await.ok().flatten());
    let Some(refresh_token) = refresh_token else { return google_callback_page(false, "refresh tokenがありません。再連携してください。"); };
    if google_keychain_write(GOOGLE_REFRESH_ACCOUNT, refresh_token).await.is_err() {
        return google_callback_page(false, "Mac Keychainへ保存できませんでした。tokenは保持していません。");
    }
    let mut auth = state.0.google_auth.lock().await;
    auth.access_token = Some(tokens.access_token);
    auth.expires_at = Some(Instant::now() + Duration::from_secs(tokens.expires_in));
    google_callback_page(true, "Google Calendar連携が完了しました。このタブを閉じてアプリへ戻ってください。")
}

fn google_callback_page(ok: bool, message: &str) -> Response {
    let heading = if ok { "連携しました" } else { "連携を完了できませんでした" };
    let body = format!("<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>{heading}</title><body><main><h1>{heading}</h1><p>{message}</p></main></body></html>");
    (if ok { StatusCode::OK } else { StatusCode::BAD_REQUEST }, [(header::CONTENT_TYPE, "text/html; charset=utf-8")], body).into_response()
}

fn google_api_url(calendar_id: Option<&str>, event_id: Option<&str>) -> Result<url::Url, &'static str> {
    let mut url = url::Url::parse("https://www.googleapis.com/calendar/v3/").map_err(|_| "GOOGLE_API_UNAVAILABLE")?;
    {
        let mut path = url.path_segments_mut().map_err(|_| "GOOGLE_API_UNAVAILABLE")?;
        path.pop_if_empty().push("calendars");
        if let Some(calendar_id) = calendar_id {
            path.push(calendar_id);
            if event_id.is_some() { path.push("events"); }
        }
        if let Some(event_id) = event_id { path.push(event_id); }
    }
    Ok(url)
}

async fn google_access_token(state: &AppState) -> Result<String, &'static str> {
    {
        let auth = state.0.google_auth.lock().await;
        if auth.expires_at.is_some_and(|expiry| expiry > Instant::now() + Duration::from_secs(60)) {
            if let Some(token) = auth.access_token.as_ref() { return Ok(token.clone()); }
        }
    }
    let refresh_token = google_keychain_read(GOOGLE_REFRESH_ACCOUNT).await?.ok_or("GOOGLE_REAUTH_REQUIRED")?;
    let client_id = google_client_id().await?.ok_or("GOOGLE_CLIENT_ID_REQUIRED")?;
    let response = state.0.client.post("https://oauth2.googleapis.com/token")
        .form(&[("client_id", client_id.as_str()), ("refresh_token", refresh_token.as_str()), ("grant_type", "refresh_token")])
        .send().await.map_err(|_| "GOOGLE_NETWORK_ERROR")?;
    if !response.status().is_success() { return Err("GOOGLE_REAUTH_REQUIRED"); }
    let tokens = response.json::<TokenResponse>().await.map_err(|_| "GOOGLE_RESPONSE_INVALID")?;
    if tokens.access_token.is_empty() || tokens.expires_in == 0 { return Err("GOOGLE_RESPONSE_INVALID"); }
    if let Some(rotated) = tokens.refresh_token {
        google_keychain_write(GOOGLE_REFRESH_ACCOUNT, rotated).await?;
    }
    let mut auth = state.0.google_auth.lock().await;
    auth.access_token = Some(tokens.access_token.clone());
    auth.expires_at = Some(Instant::now() + Duration::from_secs(tokens.expires_in));
    Ok(tokens.access_token)
}

async fn create_google_calendar(state: &AppState, access_token: &str) -> Result<String, &'static str> {
    let response = state.0.client.post("https://www.googleapis.com/calendar/v3/calendars")
        .bearer_auth(access_token).json(&json!({"summary":"AWS re:Invent 2026 · Session Explorer","timeZone":"America/Los_Angeles"}))
        .send().await.map_err(|_| "GOOGLE_NETWORK_ERROR")?;
    if !response.status().is_success() { return Err(google_status_code(response.status())); }
    let value = response.json::<Value>().await.map_err(|_| "GOOGLE_RESPONSE_INVALID")?;
    let id = value.get("id").and_then(Value::as_str).filter(|id| !id.is_empty()).ok_or("GOOGLE_RESPONSE_INVALID")?.to_owned();
    google_keychain_write(GOOGLE_CALENDAR_ACCOUNT, id.clone()).await?;
    Ok(id)
}

fn google_status_code(status: ReqwestStatus) -> &'static str {
    match status.as_u16() { 401 => "GOOGLE_REAUTH_REQUIRED", 403 => "GOOGLE_PERMISSION_OR_QUOTA_ERROR", 404 => "GOOGLE_CALENDAR_NOT_FOUND", 409 => "GOOGLE_EVENT_CONFLICT", 429 => "GOOGLE_RATE_LIMITED", _ => "GOOGLE_API_ERROR" }
}

fn google_event_id(item_id: &str) -> String {
    format!("revent{}", format!("{:x}", Sha256::digest(item_id.as_bytes())))
}

fn valid_google_datetime(value: &str) -> bool {
    if value.len() != 24 { return false; }
    let bytes = value.as_bytes();
    let prefix_ok = bytes.get(0..23).is_some_and(|prefix| prefix.iter().enumerate().all(|(i, b)| match i {
        4 | 7 => *b == b'-', 10 => *b == b'T', 13 | 16 => *b == b':', 19 => *b == b'.', _ => b.is_ascii_digit(),
    }));
    let number = |start, end| value.get(start..end).and_then(|part| part.parse::<u32>().ok());
    prefix_ok && bytes[23] == b'Z' && number(5,7).is_some_and(|month| (1..=12).contains(&month))
        && number(8,10).is_some_and(|day| (1..=31).contains(&day))
        && number(11,13).is_some_and(|hour| hour <= 23) && number(14,16).is_some_and(|minute| minute <= 59)
        && number(17,19).is_some_and(|second| second <= 59)
}

async fn google_sync(State(state): State<AppState>, Json(input): Json<GoogleSyncRequest>) -> Response {
    if input.items.is_empty() || input.items.len() > 50 { return response_error(StatusCode::BAD_REQUEST, "GOOGLE_SYNC_ITEM_COUNT_INVALID"); }
    let mut seen = HashSet::new();
    for item in &input.items {
        if item.item_id.is_empty() || item.item_id.len() > 256 || !seen.insert(item.item_id.as_str()) || item.title.trim().is_empty() || item.title.len() > 512 || !valid_google_datetime(&item.start) || !valid_google_datetime(&item.end) || item.start >= item.end || item.description.as_ref().is_some_and(|v| v.len() > 12000) || item.location.as_ref().is_some_and(|v| v.len() > 1000) {
            return response_error(StatusCode::BAD_REQUEST, "GOOGLE_SYNC_ITEM_INVALID");
        }
    }
    let access_token = match google_access_token(&state).await { Ok(value) => value, Err(code) => return response_error(StatusCode::UNAUTHORIZED, code) };
    let (calendar_id, calendar_created) = match google_keychain_read(GOOGLE_CALENDAR_ACCOUNT).await {
        Ok(Some(value)) => (value, false),
        Ok(None) => match create_google_calendar(&state, &access_token).await { Ok(value) => (value, true), Err(code) => return response_error(StatusCode::BAD_GATEWAY, code) },
        Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code),
    };
    let mut map = match google_event_map().await { Ok(value) => value, Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code) };
    let mut results = Vec::with_capacity(input.items.len());
    for item in input.items {
        let event_id = google_event_id(&item.item_id);
        let event = json!({"id":event_id,"summary":item.title,"description":item.description.unwrap_or_default(),"location":item.location.unwrap_or_default(),"start":{"dateTime":item.start,"timeZone":"America/Los_Angeles"},"end":{"dateTime":item.end,"timeZone":"America/Los_Angeles"}});
        let url = match google_api_url(Some(&calendar_id), Some(&event_id)) { Ok(value) => value, Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code) };
        let first = state.0.client.post(url.clone()).bearer_auth(&access_token).json(&event).send().await;
        let outcome = match first {
            Ok(response) if response.status().is_success() => Ok("created"),
            Ok(response) if response.status().as_u16() == 409 => match state.0.client.patch(url).bearer_auth(&access_token).json(&event).send().await {
                Ok(update) if update.status().is_success() => Ok("updated"),
                Ok(update) => Err(google_status_code(update.status())),
                Err(_) => Err("GOOGLE_NETWORK_ERROR"),
            },
            Ok(response) => Err(google_status_code(response.status())),
            Err(_) => Err("GOOGLE_NETWORK_ERROR"),
        };
        match outcome {
            Ok(status) => {
                map.insert(item.item_id.clone(), event_id);
                match save_google_event_map(&map).await {
                    Ok(()) => results.push(json!({"itemId":item.item_id,"status":status})),
                    Err(code) => results.push(json!({"itemId":item.item_id,"status":"failed","error":code})),
                }
            }
            Err(code) => results.push(json!({"itemId":item.item_id,"status":"failed","error":code})),
        }
    }
    let synced = results.iter().filter(|row| row.get("status").and_then(Value::as_str) != Some("failed")).count();
    (StatusCode::OK, Json(json!({"synced":synced,"failed":results.len()-synced,"calendarCreated":calendar_created,"results":results}))).into_response()
}

async fn google_remove(State(state): State<AppState>, Json(input): Json<GoogleRemoveRequest>) -> Response {
    if input.item_ids.is_empty() || input.item_ids.len() > 50 { return response_error(StatusCode::BAD_REQUEST, "GOOGLE_REMOVE_ITEM_COUNT_INVALID"); }
    let access_token = match google_access_token(&state).await { Ok(value) => value, Err(code) => return response_error(StatusCode::UNAUTHORIZED, code) };
    let Some(calendar_id) = (match google_keychain_read(GOOGLE_CALENDAR_ACCOUNT).await {
        Ok(value) => value,
        Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code),
    }) else { return response_error(StatusCode::NOT_FOUND, "GOOGLE_CALENDAR_NOT_FOUND"); };
    let mut map = match google_event_map().await { Ok(value) => value, Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code) };
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for item_id in input.item_ids {
        if item_id.is_empty() || item_id.len() > 256 || !seen.insert(item_id.clone()) { return response_error(StatusCode::BAD_REQUEST, "GOOGLE_REMOVE_ITEM_INVALID"); }
        let Some(event_id) = map.get(&item_id).cloned() else {
            results.push(json!({"itemId":item_id,"status":"not-synced"}));
            continue;
        };
        let url = match google_api_url(Some(&calendar_id), Some(&event_id)) { Ok(value) => value, Err(code) => return response_error(StatusCode::INTERNAL_SERVER_ERROR, code) };
        let response = state.0.client.delete(url).bearer_auth(&access_token).send().await;
        match response {
            Ok(response) if response.status().is_success() || response.status().as_u16() == 404 => {
                map.remove(&item_id);
                match save_google_event_map(&map).await {
                    Ok(()) => results.push(json!({"itemId":item_id,"status":"removed"})),
                    Err(code) => results.push(json!({"itemId":item_id,"status":"failed","error":code})),
                }
            }
            Ok(response) => results.push(json!({"itemId":item_id,"status":"failed","error":google_status_code(response.status())})),
            Err(_) => results.push(json!({"itemId":item_id,"status":"failed","error":"GOOGLE_NETWORK_ERROR"})),
        }
    }
    let removed = results.iter().filter(|row| row.get("status").and_then(Value::as_str) == Some("removed")).count();
    (StatusCode::OK, Json(json!({"removed":removed,"results":results}))).into_response()
}

async fn health(State(state): State<AppState>) -> Response {
    (
        StatusCode::OK,
        Json(json!({"ok":true,"port":state.0.port,"eventId":EVENT_ID,"network":"loopback"})),
    )
        .into_response()
}

async fn runtime_config() -> Response {
    (
        [(header::CONTENT_TYPE, HeaderValue::from_static("application/javascript; charset=utf-8"))],
        "globalThis.REINVENT_RUNTIME=Object.freeze({mode:'live'});",
    )
        .into_response()
}

fn choose_listener() -> Result<(TcpListener, u16), &'static str> {
    choose_available_port(|port| {
        let listener = TcpListener::bind(("127.0.0.1", port)).ok()?;
        listener.set_nonblocking(true).ok()?;
        Some(listener)
    })
}

fn choose_available_port<T>(
    mut bind: impl FnMut(u16) -> Option<T>,
) -> Result<(T, u16), &'static str> {
    for port in 8484..=8489 {
        if let Some(value) = bind(port) {
            return Ok((value, port));
        }
    }
    Err("NO_CALLBACK_PORT_AVAILABLE")
}

#[tokio::main]
async fn main() {
    let (listener, port) = match choose_listener() {
        Ok(value) => value,
        Err(_) => {
            eprintln!(
                "No available AWS callback port (8484–8489). Stop the process using the port and retry."
            );
            std::process::exit(1);
        }
    };
    let origin = format!("http://127.0.0.1:{port}");
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("HTTP client configuration");
    let state = AppState(Arc::new(Inner {
        port,
        origin,
        cookie_value: random_token(32),
        csrf_token: random_token(32),
        client,
        pending_login: Mutex::new(None),
        pending_google_login: Mutex::new(None),
        auth: Mutex::new(AuthState::default()),
        google_auth: Mutex::new(AuthState::default()),
        catalogs: Mutex::new(HashMap::new()),
    }));
    let app_dir = env::var_os("REINVENT_APP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .to_path_buf()
        });
    let web = ServeDir::new(app_dir).append_index_html_on_directories(true);
    let app = Router::new()
        .route("/runtime-config.js", get(runtime_config))
        .route("/api/session", get(session_status))
        .route("/api/health", get(health))
        .route("/api/auth/start", post(auth_start))
        .route("/api/auth/logout", post(auth_logout))
        .route("/api/live/catalog", get(live_catalog))
        .route("/api/live/catalog/refresh", post(live_catalog_refresh))
        .route("/api/live/schedule", get(live_schedule))
        .route("/api/live/reservations", post(live_reserve_sessions))
        .route("/api/google/status", get(google_status))
        .route("/api/google/configure", post(google_configure))
        .route("/api/google/connect", post(google_connect))
        .route("/api/google/sync", post(google_sync))
        .route("/api/google/remove", post(google_remove))
        .route("/", get(root_or_google_callback))
        .route("/callback", get(callback))
        .route("/logout", get(logout_landing))
        .fallback_service(web)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_layer,
        ))
        .with_state(state);
    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(value) => value,
        Err(_) => {
            eprintln!("Could not start the local HTTP listener.");
            std::process::exit(1);
        }
    };
    println!("READY http://127.0.0.1:{port}");
    if let Err(error) = axum::serve(listener, app).await {
        eprintln!("Local server stopped: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_configuration_and_event_times_are_strictly_validated() {
        assert!(valid_google_client_id("12345-example.apps.googleusercontent.com"));
        assert!(!valid_google_client_id("not-a-client-id"));
        assert!(valid_google_datetime("2026-11-30T17:00:00.000Z"));
        assert!(!valid_google_datetime("2026-99-30T17:00:00.000Z"));
        assert!(!valid_google_datetime("2026-11-30T17:00:00+00:00"));
        assert!(!valid_google_datetime("2026-11-30T17:00:xx.000Z"));
    }

    #[test]
    fn google_calendar_paths_encode_ids_as_individual_segments() {
        let url = google_api_url(Some("calendar+id@example.com"), Some("event/id")).unwrap();
        assert_eq!(url.path(), "/calendar/v3/calendars/calendar+id@example.com/events/event%2Fid");
    }

    #[test]
    fn google_event_ids_are_deterministic_and_api_safe() {
        let first = google_event_id("aws:session-123");
        assert_eq!(first, google_event_id("aws:session-123"));
        assert!(first.len() >= 5 && first.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'v').contains(&byte)));
    }

    #[test]
    fn pkce_challenge_uses_base64url_sha256_without_padding() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn aws_authorization_url_uses_registered_callback_and_required_parameters() {
        let url = url::Url::parse(&make_auth_url(8484, "safe-state", "safe-verifier")).unwrap();
        let values: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(values.get("client_id").map(String::as_str), Some(CLIENT_ID));
        assert_eq!(
            values.get("redirect_uri").map(String::as_str),
            Some("http://127.0.0.1:8484/callback")
        );
        assert_eq!(
            values.get("scope").map(String::as_str),
            Some("openid email events/access")
        );
        assert_eq!(
            values.get("identity_provider").map(String::as_str),
            Some("AWSBuilderID")
        );
        assert_eq!(
            values.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(values.get("state").map(String::as_str), Some("safe-state"));
    }

    #[test]
    fn list_sessions_keeps_abstracts_and_encodes_opaque_pagination_token() {
        let url = url::Url::parse(&session_page_url(Some("cursor+/="))).unwrap();
        assert_eq!(
            url.query_pairs()
                .find(|(k, _)| k == "includeAbstracts")
                .unwrap()
                .1,
            "true"
        );
        assert_eq!(
            url.query_pairs().find(|(k, _)| k == "nextToken").unwrap().1,
            "cursor+/="
        );
    }

    #[test]
    fn subject_is_hashed_for_local_account_partition() {
        let payload =
            URL_SAFE_NO_PAD.encode(br#"{"sub":"attendee-1","email":"person@example.com"}"#);
        let token = format!("header.{payload}.signature");
        let id = subject_from_id_token(&token).unwrap();
        assert_eq!(id.len(), 64);
        assert!(!id.contains("attendee"));
        assert_eq!(id, subject_from_id_token(&token).unwrap());
    }

    #[test]
    fn no_callback_port_is_a_clear_startup_condition() {
        let mut tried = Vec::new();
        let result = choose_available_port(|port| {
            tried.push(port);
            None::<()>
        });
        assert_eq!(result.err(), Some("NO_CALLBACK_PORT_AVAILABLE"));
        assert_eq!(tried, vec![8484, 8485, 8486, 8487, 8488, 8489]);
    }

    #[test]
    fn callback_port_selector_uses_the_first_free_registered_port() {
        let mut tried = Vec::new();
        let (listener, port) = choose_available_port(|candidate| {
            tried.push(candidate);
            (candidate == 8486).then_some("listener")
        })
        .unwrap();
        assert_eq!(listener, "listener");
        assert_eq!(port, 8486);
        assert_eq!(tried, vec![8484, 8485, 8486]);
    }

    #[test]
    fn short_pages_continue_and_duplicate_session_ids_are_deduplicated() {
        let mut cache = PersistedCatalog::default();
        let first = SessionPage {
            items: vec![json!({"sessionId":"s-1","title":"one"})],
            total_count: 3,
            next_token: Some("next".to_owned()),
        };
        let next = merge_session_page(&mut cache, first).unwrap();
        assert_eq!(next.as_deref(), Some("next"));
        assert!(!cache.complete);
        assert_eq!(cache.items.len(), 1);

        let second = SessionPage {
            items: vec![
                json!({"sessionId":"s-1","title":"duplicate"}),
                json!({"sessionId":"s-2"}),
            ],
            total_count: 3,
            next_token: None,
        };
        assert_eq!(merge_session_page(&mut cache, second).unwrap(), None);
        assert!(cache.complete);
        assert_eq!(cache.pages, 2);
        assert_eq!(cache.total_count, Some(3));
        assert_eq!(cache.items.len(), 2);
        assert_eq!(cache.items[0]["title"], "one");
    }

    #[test]
    fn repeated_pagination_token_stops_the_walk() {
        let mut catalog = Catalog::default();
        assert!(mark_page_token(&mut catalog, None).is_ok());
        assert!(mark_page_token(&mut catalog, Some("cursor-a")).is_ok());
        assert_eq!(
            mark_page_token(&mut catalog, Some("cursor-a")),
            Err("PAGINATION_TOKEN_REPEATED")
        );
    }

    #[test]
    fn oauth_state_mismatch_preserves_pending_attempt_and_matching_state_is_one_time() {
        let mut pending = Some(PendingLogin {
            state: "expected".to_owned(),
            verifier: "verifier".to_owned(),
            redirect_uri: "http://127.0.0.1:8484/callback".to_owned(),
            expires_at: Instant::now() + Duration::from_secs(60),
        });
        assert_eq!(
            consume_login_state(&mut pending, "wrong").err(),
            Some("OAUTH_STATE_MISMATCH")
        );
        assert!(pending.is_some());
        assert_eq!(
            consume_login_state(&mut pending, "expected").unwrap().state,
            "expected"
        );
        assert!(pending.is_none());
        assert_eq!(
            consume_login_state(&mut pending, "expected").err(),
            Some("OAUTH_STATE_MISSING")
        );
    }

    #[test]
    fn expired_oauth_state_is_discarded() {
        let mut pending = Some(PendingLogin {
            state: "old".to_owned(),
            verifier: "verifier".to_owned(),
            redirect_uri: "http://127.0.0.1:8484/callback".to_owned(),
            expires_at: Instant::now() - Duration::from_secs(1),
        });
        assert_eq!(
            consume_login_state(&mut pending, "old").err(),
            Some("OAUTH_STATE_EXPIRED")
        );
        assert!(pending.is_none());
    }
}
