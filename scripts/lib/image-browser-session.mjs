export const imageTestOrigin = "https://pzniyupmgwvlldvztzqh.supabase.co";

export function imageBrowserSessionUrls(session, now = Date.now()) {
  if (
    session.project !== "pzniyupmgwvlldvztzqh" ||
    session.phase !== "private" ||
    ![undefined, "development", "built"].includes(session.runtime) ||
    session.setupCompleted !== true ||
    !Number.isFinite(Date.parse(session.checkedAt)) ||
    Math.abs(now - Date.parse(session.checkedAt)) > 5 * 60 * 1000
  ) {
    throw new Error("fresh_private_test_session_required");
  }
  const urls = Object.fromEntries(
    ["appUrl", "controlUrl", "wineUrl", "shareUrl"].map((key) => [key, new URL(session[key])]),
  );
  for (const url of Object.values(urls)) {
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("loopback_test_url_required");
    }
  }
  if (
    urls.appUrl.pathname !== "/" ||
    urls.controlUrl.pathname !== "/" ||
    urls.appUrl.origin === urls.controlUrl.origin ||
    urls.wineUrl.origin !== urls.appUrl.origin ||
    urls.shareUrl.origin !== urls.appUrl.origin ||
    !/^\/wine\/[a-f0-9-]{36}$/.test(urls.wineUrl.pathname) ||
    !/^\/w\/[A-Za-z0-9_-]{8,100}$/.test(urls.shareUrl.pathname)
  ) {
    throw new Error("expected_fixture_routes_required");
  }
  return {
    appUrl: urls.appUrl.origin,
    controlUrl: urls.controlUrl.origin,
    wineUrl: urls.wineUrl.href,
    shareUrl: urls.shareUrl.href,
  };
}

export function imageBrowserPwaCacheEntryAllowed(value, appOrigin) {
  const url = new URL(value);
  return (
    url.origin === appOrigin &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (["/offline.html", "/icon-512.png", "/favicon.png"].includes(url.pathname) ||
      /^\/assets\/[^/]+\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname))
  );
}

export function imageBrowserRuntimeEnvironment(env, publicKey, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("loopback_runtime_port_required");
  }
  return {
    ...imageBrowserEnvironment(env, publicKey),
    NODE_ENV: "production",
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    HOST: "127.0.0.1",
    PORT: String(port),
    SUPABASE_URL: imageTestOrigin,
    SUPABASE_PUBLISHABLE_KEY: publicKey,
  };
}

export function imageBrowserRequestAllowed(value, appOrigin, controlOrigin) {
  const url = new URL(value);
  if (["data:", "blob:"].includes(url.protocol)) return true;
  if ([appOrigin, controlOrigin].includes(url.origin)) return true;
  if (["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(url.origin)) {
    return true;
  }
  if (url.origin !== imageTestOrigin) return false;
  return !url.pathname.startsWith("/functions/") || url.pathname === "/functions/v1/wine-image";
}

export function imageBrowserEnvironment(env, publicKey) {
  if (!publicKey?.startsWith("sb_publishable_")) throw new Error("test_public_key_required");
  const child = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "COMSPEC",
    "PATHEXT",
  ]) {
    if (env[key]) child[key] = env[key];
  }
  return {
    ...child,
    VITE_SUPABASE_URL: imageTestOrigin,
    VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
    VITE_WINE_IMAGE_PROXY_ENABLED: "true",
    VITE_PRIVACY_CONTROLS_ENABLED: "false",
    VITE_PRIVACY_OPERATIONS_VERIFIED: "false",
    BROWSER: "none",
  };
}

export function escapeImageTestHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

export function imageControlRequestAllowed(request, origin, nonce, bodyNonce) {
  const url = new URL(origin);
  return (
    request.headers.host === url.host &&
    request.headers.origin === origin &&
    request.headers.cookie?.split("; ").includes(`winesnap_image_test=${nonce}`) &&
    bodyNonce === nonce
  );
}
