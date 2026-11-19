export const hostedTestOrigin = "https://pzniyupmgwvlldvztzqh.supabase.co";
export const ownedBackendProject = "winesnap-owned-local";
export const ownedBackendOrigin = "http://winesnap-owned-gateway:8080";
export const ownedBrowserOrigin = "http://127.0.0.1:54323";

export function approvedLocalBackend(env: Record<string, string | undefined>) {
  if (env.WINESNAP_OWNED_BACKEND_ENABLED === "true")
    return env.SUPABASE_URL === ownedBackendOrigin ? ownedBackendOrigin : null;
  return env.SUPABASE_URL === hostedTestOrigin ? hostedTestOrigin : null;
}

export function approvedCookingBrowser(url: string | undefined, owned: string | undefined) {
  return owned === "true" ? url === ownedBrowserOrigin : url === hostedTestOrigin;
}
