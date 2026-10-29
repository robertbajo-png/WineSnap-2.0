import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { versionSchema } from "../kitchen/domain";
import {
  dinerSchema,
  householdSchema,
  inviteSchema,
  mealInputSchema,
  mealSchema,
  memberSchema,
  wineSchema,
} from "./domain";
import { mealsEnabled } from "./feature";

export class MealsError extends Error {
  constructor(code = "") {
    super(
      ["PT409", "23505", "40P01"].includes(code)
        ? "Uppgifterna har ändrats. Hämta på nytt innan du försöker igen."
        : code === "rate_limited"
          ? "För många försök. Vänta fem minuter."
          : "Kunde inte slutföra. Kontrollera anslutning, inloggning och behörighet och hämta på nytt.",
    );
  }
}
async function scoped(owner: string): Promise<SupabaseClient> {
  if (!mealsEnabled) throw new MealsError();
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== owner) throw new MealsError();
  const token = data.session.access_token;
  const verified = await supabase.auth.getUser(token);
  if (verified.error || verified.data.user?.id !== owner) throw new MealsError();
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { accessToken: async () => token },
  );
  const gate = await client.rpc("meals_access");
  if (gate.error || gate.data !== true) throw new MealsError();
  return client;
}
export async function familyData(owner: string) {
  const client = await scoped(owner);
  const groups = await client
    .from("kitchen_households")
    .select("id,user_id,name,revision")
    .limit(6);
  const diners: z.infer<typeof dinerSchema>[] = [];
  for (let from = 0; from < 1500; from += 500) {
    const page = await client
      .from("kitchen_diners")
      .select("*")
      .order("id")
      .range(from, from + 499);
    if (page.error) throw new MealsError();
    diners.push(...z.array(dinerSchema).parse(page.data));
    if ((page.data?.length ?? 0) < 500) break;
  }
  const members = await client
    .from("kitchen_household_members")
    .select("id,user_id,household_id,display_name")
    .limit(61);
  const invites = await client
    .from("kitchen_household_invites")
    .select("id,user_id,household_id,expires_at,revoked_at,used_at")
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .is("used_at", null)
    .limit(61);
  if (
    [groups, members, invites].some((r) => r.error) ||
    (groups.data?.length ?? 0) > 5 ||
    diners.length > 1464 ||
    new Set(diners.map((d) => d.id)).size !== diners.length ||
    (members.data?.length ?? 0) > 60 ||
    (invites.data?.length ?? 0) > 60
  )
    throw new MealsError();
  return {
    groups: z.array(householdSchema).parse(groups.data),
    diners,
    members: z.array(memberSchema).parse(members.data),
    invites: z.array(inviteSchema).parse(invites.data),
  };
}
export type FamilyData = Awaited<ReturnType<typeof familyData>>;
export async function familyChange(
  owner: string,
  action: string,
  id: string,
  revision: number,
  data: Record<string, unknown> = {},
) {
  const client = await scoped(owner);
  const r = await client.rpc("kitchen_family_change", {
    _action: action,
    _id: id,
    _revision: revision,
    _data: data,
  });
  if (r.error) throw new MealsError(r.error.code);
}
export async function inviteCreate(owner: string, household: string, revision: number) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const hash = await hashInvite(token);
  const client = await scoped(owner);
  const r = await client.rpc("kitchen_invite_create", {
    _id: crypto.randomUUID(),
    _household_id: household,
    _revision: revision,
    _hash: hash,
  });
  if (r.error) throw new MealsError(r.error.code);
  return token;
}
export async function hashInvite(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token.trim())) throw new MealsError();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token.trim()));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function inviteRevoke(owner: string, id: string) {
  const r = await (await scoped(owner)).rpc("kitchen_invite_revoke", { _id: id });
  if (r.error) throw new MealsError(r.error.code);
}
export async function inviteAccept(owner: string, token: string, display: string, adult: boolean) {
  const r = await (
    await scoped(owner)
  ).rpc("kitchen_invite_accept", {
    _hash: await hashInvite(token),
    _display_name: display,
    _adult_confirmed: adult,
  });
  if (r.error || r.data?.status !== "joined") throw new MealsError(r.data?.status);
}
export async function cellarWines(owner: string) {
  const result = await (
    await scoped(owner)
  )
    .from("wines")
    .select(
      "id,user_id,wine_name,vintage,wine_type,quantity,consumed_at,image_url,body,acidity,tannin,sweetness,grape_varieties,region,country",
    )
    .eq("user_id", owner)
    .order("created_at", { ascending: false })
    .limit(201);
  if (result.error) throw new MealsError(result.error.code);
  return {
    wines: z.array(wineSchema).parse(result.data?.slice(0, 200)),
    truncated: result.data?.length === 201,
  };
}
export async function mealHistory(owner: string) {
  const client = await scoped(owner);
  const r = await client
    .from("meal_wine_links")
    .select("*")
    .eq("user_id", owner)
    .order("updated_at", { ascending: false })
    .limit(51);
  if (r.error) throw new MealsError(r.error.code);
  const meals = z.array(mealSchema).parse(r.data?.slice(0, 50));
  const titles: Record<string, string> = {},
    wineNames: Record<string, string> = {};
  if (meals.length) {
    const sessions = await client
      .from("cooking_sessions")
      .select("id,recipe_version_id")
      .eq("user_id", owner)
      .in(
        "id",
        meals.map((m) => m.session_id),
      );
    if (sessions.error || sessions.data.length !== meals.length) throw new MealsError();
    const versions = await client
      .from("kitchen_recipe_versions")
      .select("*")
      .eq("user_id", owner)
      .in(
        "id",
        sessions.data.map((s) => s.recipe_version_id),
      );
    const wines = await client
      .from("wines")
      .select("id,wine_name")
      .eq("user_id", owner)
      .in(
        "id",
        meals.map((m) => m.wine_id),
      );
    if (versions.error || wines.error) throw new MealsError();
    const parsed = z.array(versionSchema).parse(versions.data);
    for (const s of sessions.data) {
      const version = parsed.find((v) => v.id === s.recipe_version_id);
      if (!version) throw new MealsError();
      titles[s.id] = version.document.title;
    }
    for (const w of wines.data) wineNames[w.id] = w.wine_name ?? "Namnlöst vin";
  }
  return {
    meals,
    titles,
    wineNames,
    truncated: r.data?.length === 51,
  };
}
export async function mealSave(
  owner: string,
  id: string,
  revision: number,
  input: z.input<typeof mealInputSchema> | null,
) {
  const r = await (
    await scoped(owner)
  ).rpc("kitchen_meal_save", {
    _id: id,
    _revision: revision,
    _input: input ? mealInputSchema.parse(input) : null,
  });
  if (r.error) throw new MealsError(r.error.code);
}
