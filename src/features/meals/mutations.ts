import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mealMutationClient, type MealsScope } from "./api";
import {
  dinerDocumentSchema,
  dinerSchema,
  householdSchema,
  inviteSchema,
  mealInputSchema,
  mealSchema,
  memberSchema,
} from "./domain";

export class MealMutationError extends Error {
  constructor(public kind: "uncertain" | "conflict" | "rejected" | "changed" | "rate_limited") {
    super("meal_mutation_" + kind);
  }
}
export type MealAttempt<T = unknown> = {
  readonly owner: string;
  readonly started: boolean;
  readonly value: T;
  execute: (scope: MealsScope, readOnly?: boolean) => Promise<boolean>;
};
function active(scope: MealsScope) {
  if (!scope.current() || scope.signal.aborted) throw new MealMutationError("changed");
}
function conflict(): never {
  throw new MealMutationError("conflict");
}
class RpcFailure extends Error {
  constructor(public code: string) {
    super("meal_rpc_failed");
  }
}
function identity(owner: string, id: string, revision = 0) {
  z.string().uuid().parse(owner);
  z.string().uuid().parse(id);
  z.number().int().nonnegative().parse(revision);
}
async function row(
  client: SupabaseClient,
  scope: MealsScope,
  table: string,
  id: string,
  columns: string,
  owner = scope.owner,
) {
  active(scope);
  let query = client.from(table).select(columns).eq("id", id);
  if (owner) query = query.eq("user_id", owner);
  const result = await query.abortSignal(scope.signal).maybeSingle();
  active(scope);
  if (result.error) throw new MealMutationError("uncertain");
  return result.data;
}
async function membership(
  client: SupabaseClient,
  scope: MealsScope,
  household: string,
  user: string,
) {
  active(scope);
  const result = await client
    .from("kitchen_household_members")
    .select("id,user_id,household_id,display_name")
    .eq("household_id", household)
    .eq("user_id", user)
    .abortSignal(scope.signal)
    .maybeSingle();
  active(scope);
  if (result.error) throw new MealMutationError("uncertain");
  if (!result.data) return null;
  const member = memberSchema.parse(result.data);
  if (member.user_id !== user || member.household_id !== household) conflict();
  return member;
}
async function rpc(
  client: SupabaseClient,
  scope: MealsScope,
  name: string,
  input: Record<string, unknown>,
) {
  active(scope);
  const result = await client.rpc(name, input).abortSignal(scope.signal);
  active(scope);
  if (result.error) throw new RpcFailure(result.error.code);
  return result.data;
}
function attempt<T>(
  owner: string,
  value: T,
  write: (client: SupabaseClient, scope: MealsScope) => Promise<unknown>,
  inspect: (client: SupabaseClient, scope: MealsScope) => Promise<boolean>,
): MealAttempt<T> {
  let started = false;
  return {
    owner,
    value,
    get started() {
      return started;
    },
    async execute(scope, readOnly = false) {
      active(scope);
      if (scope.owner !== owner) throw new MealMutationError("changed");
      const client = await mealMutationClient(scope);
      active(scope);
      if (started || readOnly) {
        if (await inspect(client, scope)) return true;
        active(scope);
        if (readOnly) return false;
      }
      started = true;
      try {
        await write(client, scope);
        active(scope);
        return true;
      } catch (cause) {
        active(scope);
        const code = (cause as { code?: string })?.code ?? "";
        if (code === "rate_limited") throw new MealMutationError("rate_limited");
        if (/^(22|42)[0-9A-Z]{3}$/.test(code) || code === "P0001")
          throw new MealMutationError("rejected");
        // A failed read never authorizes a second write. Keep the original attempt.
        if (await inspect(client, scope)) return true;
        active(scope);
        if (["PT409", "23505", "40P01"].includes(code)) conflict();
        if (/^(22|23|42)[0-9A-Z]{3}$/.test(code) || code === "P0001")
          throw new MealMutationError("rejected");
        throw new MealMutationError("uncertain");
      }
    },
  };
}
const familyPayloads = {
  create_household: z
    .object({
      name: z.string().trim().min(1).max(80),
      displayName: z.string().trim().min(1).max(60),
      adultConfirmed: z.literal(true),
    })
    .strict(),
  rename_household: z.object({ name: z.string().trim().min(1).max(80) }).strict(),
  delete_household: z.object({}).strict(),
  leave_household: z.object({}).strict(),
  remove_member: z.object({ userId: z.string().uuid() }).strict(),
  save_diner: z
    .object({
      document: dinerDocumentSchema,
      householdId: z.string().uuid().nullable(),
      shared: z.boolean(),
    })
    .strict(),
  delete_diner: z.object({}).strict(),
};
export function familyChange(
  owner: string,
  action: keyof typeof familyPayloads,
  id: string,
  revision: number,
  data: Record<string, unknown> = {},
) {
  identity(owner, id, revision);
  const input = familyPayloads[action].parse(structuredClone(data)) as Record<string, unknown>;
  return attempt(
    owner,
    undefined,
    (client, scope) =>
      rpc(client, scope, "kitchen_family_change", {
        _action: action,
        _id: id,
        _revision: revision,
        _data: input,
      }),
    async (client, scope) => {
      if (action === "save_diner" || action === "delete_diner") {
        const raw = await row(client, scope, "kitchen_diners", id, "*");
        if (!raw) return action === "delete_diner" ? true : revision === 0 ? false : conflict();
        const diner = dinerSchema.parse(raw);
        if (diner.user_id !== owner || diner.id !== id) conflict();
        if (
          action === "save_diner" &&
          diner.revision === revision + 1 &&
          diner.household_id === input.householdId &&
          diner.shared === input.shared &&
          JSON.stringify(diner.document) === JSON.stringify(input.document)
        )
          return true;
        if (diner.revision !== revision) conflict();
        return false;
      }
      if (action === "leave_household") {
        if (!(await membership(client, scope, id, owner))) return true;
      }
      const raw = await row(
        client,
        scope,
        "kitchen_households",
        id,
        "id,user_id,name,revision",
        action === "leave_household" ? "" : owner,
      );
      if (!raw)
        return action === "delete_household"
          ? true
          : action === "create_household"
            ? false
            : conflict();
      const group = householdSchema.parse(raw);
      if (group.id !== id || (action !== "leave_household" && group.user_id !== owner)) conflict();
      if (action === "create_household") {
        const member = await membership(client, scope, id, owner);
        if (
          group.revision === 1 &&
          group.name === input.name &&
          member?.display_name === input.displayName
        )
          return true;
        conflict();
      }
      if (
        action === "rename_household" &&
        group.revision === revision + 1 &&
        group.name === input.name
      )
        return true;
      if (
        action === "remove_member" &&
        group.revision === revision + 1 &&
        !(await membership(client, scope, id, input.userId as string))
      )
        return true;
      if (group.revision !== revision) conflict();
      return false;
    },
  );
}
export function mealSave(
  owner: string,
  id: string,
  revision: number,
  input: z.input<typeof mealInputSchema> | null,
) {
  identity(owner, id, revision);
  const document = input ? mealInputSchema.parse(structuredClone(input)) : null;
  return attempt(
    owner,
    undefined,
    (client, scope) =>
      rpc(client, scope, "kitchen_meal_save", {
        _id: id,
        _revision: revision,
        _input: document,
      }),
    async (client, scope) => {
      const raw = await row(client, scope, "meal_wine_links", id, "*");
      if (!raw) return document ? (revision === 0 ? false : conflict()) : true;
      const meal = mealSchema.parse(raw);
      if (meal.id !== id || meal.user_id !== owner) conflict();
      if (
        document &&
        [revision, revision + 1].includes(meal.revision) &&
        meal.session_id === document.sessionId &&
        meal.wine_id === document.wineId &&
        meal.wine_rating === document.wineRating &&
        meal.pairing_rating === document.pairingRating &&
        meal.note === document.note
      )
        return true;
      if (meal.revision !== revision) conflict();
      return false;
    },
  );
}
async function hashInvite(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
const privateInviteSchema = inviteSchema.extend({ token_hash: z.string().regex(/^[a-f0-9]{64}$/) });
export function inviteCreate(owner: string, household: string, revision: number) {
  const id = crypto.randomUUID();
  identity(owner, household, revision);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  let digest: string | undefined;
  const hash = async () => (digest ??= await hashInvite(token));
  return attempt(
    owner,
    token,
    async (client, scope) => {
      const value = await hash();
      return rpc(client, scope, "kitchen_invite_create", {
        _id: id,
        _household_id: household,
        _revision: revision,
        _hash: value,
      });
    },
    async (client, scope) => {
      const raw = await row(
        client,
        scope,
        "kitchen_household_invites",
        id,
        "id,user_id,household_id,token_hash,expires_at,revoked_at,used_at",
      );
      if (raw) {
        const invite = privateInviteSchema.parse(raw);
        const value = await hash();
        active(scope);
        if (
          invite.user_id === owner &&
          invite.id === id &&
          invite.household_id === household &&
          invite.token_hash === value &&
          !invite.revoked_at &&
          !invite.used_at &&
          Date.parse(invite.expires_at) > Date.now()
        )
          return true;
        conflict();
      }
      const rawGroup = await row(
        client,
        scope,
        "kitchen_households",
        household,
        "id,user_id,name,revision",
      );
      if (!rawGroup) conflict();
      const group = householdSchema.parse(rawGroup);
      if (group.id !== household || group.user_id !== owner || group.revision !== revision)
        conflict();
      return false;
    },
  );
}
export function inviteRevoke(owner: string, id: string) {
  identity(owner, id);
  return attempt(
    owner,
    undefined,
    (client, scope) => rpc(client, scope, "kitchen_invite_revoke", { _id: id }),
    async (client, scope) => {
      const raw = await row(
        client,
        scope,
        "kitchen_household_invites",
        id,
        "id,user_id,household_id,expires_at,revoked_at,used_at",
      );
      if (!raw) return true;
      const invite = inviteSchema.parse(raw);
      if (invite.id !== id || invite.user_id !== owner) conflict();
      return !!invite.revoked_at;
    },
  );
}
export function inviteAccept(owner: string, code: string, display: string, adult: boolean) {
  z.string().uuid().parse(owner);
  const token = z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/)
    .parse(code);
  const name = z.string().trim().min(1).max(60).parse(display);
  z.literal(true).parse(adult);
  return attempt(
    owner,
    undefined,
    async (client, scope) => {
      const hash = await hashInvite(token);
      const result = await rpc(client, scope, "kitchen_invite_accept", {
        _hash: hash,
        _display_name: name,
        _adult_confirmed: true,
      });
      if (result?.status !== "joined")
        throw new RpcFailure(result?.status === "rate_limited" ? "rate_limited" : "42501");
    },
    async (client, scope) => {
      // Only the idempotent RPC can confirm this token; membership alone is not proof.
      const result = await client
        .from("kitchen_household_members")
        .select("id,user_id,household_id,display_name")
        .eq("user_id", owner)
        .limit(6)
        .abortSignal(scope.signal);
      active(scope);
      if (result.error || z.array(memberSchema).parse(result.data).length > 5)
        throw new MealMutationError("uncertain");
      return false;
    },
  );
}
