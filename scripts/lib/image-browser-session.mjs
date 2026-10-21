export const imageTestOrigin = "https://pzniyupmgwvlldvztzqh.supabase.co";

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
