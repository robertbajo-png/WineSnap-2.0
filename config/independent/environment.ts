export const publicEnvironmentKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SITE_OPERATOR",
  "VITE_SITE_ADDRESS",
  "VITE_SUPPORT_EMAIL",
  "VITE_PRIVACY_CONTROLS_ENABLED",
  "VITE_PRIVACY_OPERATIONS_VERIFIED",
  "VITE_WINE_IMAGE_PROXY_ENABLED",
  "VITE_LOCAL_AI_ENABLED",
  "VITE_COOKING_CORE_ENABLED",
  "VITE_AI_CHEF_ENABLED",
  "VITE_MEALS_ENABLED",
  "VITE_RECIPE_NUTRITION_ENABLED",
  "VITE_PRIVACY_LEGAL_BASIS",
  "VITE_PRIVACY_RETENTION",
] as const;

export function independentEnvironment(mode: string, input: Record<string, string | undefined>) {
  if (mode === "runtime-check") {
    return {
      VITE_SUPABASE_URL: "https://example.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_runtime_check_not_a_real_key",
      VITE_PRIVACY_CONTROLS_ENABLED: "false",
      VITE_PRIVACY_OPERATIONS_VERIFIED: "false",
      VITE_WINE_IMAGE_PROXY_ENABLED: "false",
      VITE_LOCAL_AI_ENABLED: "false",
      VITE_COOKING_CORE_ENABLED: "false",
      VITE_AI_CHEF_ENABLED: "false",
      VITE_MEALS_ENABLED: "false",
      VITE_RECIPE_NUTRITION_ENABLED: "false",
    };
  }

  const values: Record<string, string> = {};
  for (const key of publicEnvironmentKeys) {
    if (input[key]) values[key] = input[key]!;
  }
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    if (!values[key])
      throw new Error(`Independent build requires ${key}; see config/independent/.env.example`);
  }
  const url = new URL(values.VITE_SUPABASE_URL);
  if (
    values.VITE_RECIPE_NUTRITION_ENABLED === "true" &&
    values.VITE_COOKING_CORE_ENABLED !== "true"
  )
    throw new Error("Recipe nutrition requires the test cooking runtime");
  if (values.VITE_MEALS_ENABLED === "true" && values.VITE_AI_CHEF_ENABLED !== "true")
    throw new Error("Meals require the verified test cooking and privacy runtime");
  if (
    values.VITE_AI_CHEF_ENABLED === "true" &&
    (values.VITE_COOKING_CORE_ENABLED !== "true" || values.VITE_LOCAL_AI_ENABLED !== "true")
  )
    throw new Error("AI Chef requires the verified local cooking runtime");
  if (
    values.VITE_COOKING_CORE_ENABLED === "true" &&
    url.href !== "https://pzniyupmgwvlldvztzqh.supabase.co/"
  )
    throw new Error("Cooking core can only use WineSnap-test");
  if (
    values.VITE_COOKING_CORE_ENABLED === "true" &&
    (values.VITE_PRIVACY_CONTROLS_ENABLED !== "true" ||
      values.VITE_PRIVACY_OPERATIONS_VERIFIED !== "true")
  )
    throw new Error("Cooking core requires verified privacy export and erasure");
  if (
    values.VITE_LOCAL_AI_ENABLED === "true" &&
    url.href !== "https://pzniyupmgwvlldvztzqh.supabase.co/"
  ) {
    throw new Error("Local AI can only use WineSnap-test");
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("Supabase URL must use HTTPS (HTTP is allowed only on loopback)");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Supabase URL must not contain credentials, a query or a fragment");
  }
  const key = values.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key.startsWith("sb_secret_"))
    throw new Error("A secret key must never be used as a public key");
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      if (payload.role !== "anon") throw new Error("Not an anon key");
    } catch {
      throw new Error(
        "Use a publishable Supabase key or legacy anon JWT, never a service-role key",
      );
    }
  }
  return values;
}
