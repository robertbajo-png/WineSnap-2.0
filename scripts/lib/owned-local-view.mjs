import assert from "node:assert/strict";
import { ownedApi, ownedApp } from "./owned-backend.mjs";
import { localOwnedFixtureConfirmation } from "./owned-public-origin.mjs";
import { verifyOwnedGateOwner } from "./owned-password-reset.mjs";

// Private operator result: the single-use link must never enter reports or CLI arguments.
export async function createOwnedLocalLogin(admin, binding, installationId, email) {
  const ownerId = await verifyOwnedGateOwner(admin, binding, installationId, email);
  const active = await admin.rpc("privacy_account_active", { _user_id: ownerId });
  assert.ok(!active.error && active.data === true);
  const grant = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: ownedApp + "/" },
  });
  assert.ok(!grant.error);
  assert.equal(grant.data.user?.id, ownerId);
  assert.equal(grant.data.user?.email, email);
  const link = localOwnedFixtureConfirmation(grant.data.properties?.action_link);
  for (const name of ["token", "type", "redirect_to"])
    assert.equal(link.searchParams.getAll(name).length, 1);
  assert.equal(link.searchParams.get("type"), "recovery");
  assert.ok(link.searchParams.get("token").length >= 16 && link.href.length <= 8192);
  assert.equal(new URL(link.searchParams.get("redirect_to")).href, ownedApp + "/");
  return { ownerId, link: link.href };
}

export function ownedLocalViewRequest(url, acceptance) {
  assert.equal(typeof acceptance, "boolean");
  const target = new URL(url);
  if (target.username || target.password || ![ownedApp, ownedApi].includes(target.origin))
    return "block_external";
  if (acceptance && target.origin === ownedApp && target.pathname.startsWith("/api/ai/"))
    return "block_ai";
  return "allow";
}
