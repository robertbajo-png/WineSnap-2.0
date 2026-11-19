import { ownedBrowserOrigin } from "./backendScope";

export function validatedOwnedPublicOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== "https:" ||
    url.port ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname) ||
    /\.(?:supabase\.co|lovable\.app|trycloudflare\.com|invalid|test|local)$/.test(url.hostname)
  )
    throw new Error("Owned internet access requires an explicit permanent HTTPS origin");
  return value;
}

export function ownedBrowserApiUrl(
  backendUrl: string | undefined,
  owned: string | undefined,
  publicOrigin: string | undefined,
  pageOrigin: string | undefined,
) {
  if (!publicOrigin) return backendUrl;
  if (owned !== "true" || backendUrl !== ownedBrowserOrigin)
    throw new Error("Owned public access cannot redirect another backend");
  const approved = validatedOwnedPublicOrigin(publicOrigin)!;
  if (!pageOrigin || ["http://127.0.0.1:5212", "http://localhost:5212"].includes(pageOrigin))
    return backendUrl;
  if (pageOrigin !== approved)
    throw new Error("This owned build does not allow this website origin");
  return approved + "/backend";
}
