import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  ownedApp,
  ownedApi,
  ownedProject,
  ownedToken,
  validateOwnedKeys,
} from "./owned-backend.mjs";

export async function acceptOwnedBackend(keys, restart, progress = () => {}) {
  validateOwnedKeys(keys);
  const run = randomUUID().replaceAll("-", "").slice(0, 16);
  const report = { passed: 0, cleanupCompleted: false, externalRequests: 0 };
  const users = [];
  const messages = [];
  const client = (key) =>
    createClient(ownedApi, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = ownedToken(keys, "anon");
  const admin = client(ownedToken(keys, "service_role"));
  const ok = (result) => {
    if (result.error) {
      const failure = new Error("owned_check_failed");
      failure.code = result.error.code ?? String(result.error.statusCode ?? "");
      if (result.error.message?.includes("field name must not be null"))
        failure.category = "null_aggregate_key";
      if (result.error.message?.includes("non-object")) failure.category = "json_object_expected";
      if (result.error.message?.includes("role")) failure.category = "role_configuration";
      if (result.error.message?.includes("parameter")) failure.category = "parameter_configuration";
      throw failure;
    }
    return result.data;
  };
  const image = await readFile(new URL("../../public/icon-512.png", import.meta.url));
  const api = async (path, body, token) =>
    fetch(ownedApp + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  async function mailLink(email, type) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await fetch(
        `http://127.0.0.1:8026/api/v1/search?query=${encodeURIComponent("to:" + email)}`,
        { redirect: "error" },
      );
      assert.equal(result.status, 200);
      const data = await result.json();
      for (const message of data.messages ?? []) {
        if (messages.includes(message.ID)) continue;
        assert.ok((message.To ?? []).some((recipient) => recipient.Address === email));
        const content = await (
          await fetch(`http://127.0.0.1:8026/api/v1/message/${message.ID}`, { redirect: "error" })
        ).json();
        for (const match of (content.HTML ?? "").matchAll(/href="([^"]+)"/g)) {
          const url = new URL(match[1].replaceAll("&amp;", "&"));
          if (
            url.origin === ownedApi &&
            url.pathname === "/auth/v1/verify" &&
            url.searchParams.get("type") === type
          ) {
            messages.push(message.ID);
            return url;
          }
        }
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error("local_confirmation_email_missing");
  }
  async function followConfirmation(url) {
    assert.equal(url.origin, ownedApi);
    assert.equal(url.pathname, "/auth/v1/verify");
    const response = await fetch(url, { redirect: "manual" });
    assert.ok([302, 303].includes(response.status));
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, ownedApp);
    assert.equal(location.searchParams.has("error"), false);
    return new URLSearchParams(location.hash.slice(1));
  }
  let browser;
  let ownerPath;
  try {
    progress("stale_fixture_cleanup");
    const previous = ok(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).users;
    const stale = previous.filter(
      (user) =>
        /^owned-(owner|peer)-[a-f0-9]{16}@example\.test$/.test(user.email ?? "") &&
        (user.user_metadata?.owned_acceptance ||
          (Date.parse(user.created_at) >= keys.issuedAt * 1000 &&
            Date.parse(user.created_at) < keys.issuedAt * 1000 + 7200000)),
    );
    for (const user of stale) {
      const runId = user.email.match(/[a-f0-9]{16}(?=@)/)[0];
      ok(await admin.storage.from("wine-labels").remove([`${user.id}/owned-${runId}.png`]));
      ok(await admin.auth.admin.deleteUser(user.id));
      const oldMail = await (
        await fetch(
          `http://127.0.0.1:8026/api/v1/search?query=${encodeURIComponent("to:" + user.email)}`,
          { redirect: "error" },
        )
      ).json();
      for (const message of oldMail.messages ?? [])
        if ((message.To ?? []).some((recipient) => recipient.Address === user.email))
          messages.push(message.ID);
    }
    report.staleSyntheticAccountsCleaned = stale.length;
    for (const role of ["owner", "peer"]) {
      progress(`signup_${role}`);
      const email = `owned-${role}-${run}@example.test`;
      const password = randomBytes(24).toString("hex");
      const app = client(anon);
      const signup = ok(
        await app.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: ownedApp + "/", data: { owned_acceptance: run } },
        }),
      );
      assert.ok(signup.user?.id);
      users.push({ id: signup.user.id, email, password, app });
      assert.equal(signup.session, null);
      assert.ok((await app.auth.signInWithPassword({ email, password })).error);
      await followConfirmation(await mailLink(email, "signup"));
      const signin = ok(await app.auth.signInWithPassword({ email, password }));
      assert.equal(signin.user.id, signup.user.id);
      assert.equal(signin.user.role, "authenticated");
      users.at(-1).token = signin.session.access_token;
      report.passed += 3;
    }
    const [owner, peer] = users;
    const wrong = await client(anon).auth.signInWithPassword({
      email: owner.email,
      password: randomBytes(20).toString("hex"),
    });
    assert.ok(wrong.error);
    report.passed++;
    const reset = client(anon);
    progress("password_recovery");
    ok(
      await reset.auth.resetPasswordForEmail(owner.email, {
        redirectTo: ownedApp + "/reset-password",
      }),
    );
    const recovered = await followConfirmation(await mailLink(owner.email, "recovery"));
    ok(
      await reset.auth.setSession({
        access_token: recovered.get("access_token"),
        refresh_token: recovered.get("refresh_token"),
      }),
    );
    owner.password = randomBytes(24).toString("hex");
    ok(await reset.auth.updateUser({ password: owner.password }));
    const newLogin = ok(
      await owner.app.auth.signInWithPassword({ email: owner.email, password: owner.password }),
    );
    owner.token = newLogin.session.access_token;
    report.passed++;
    const id = randomUUID();
    progress("private_image_upload");
    ownerPath = `${owner.id}/owned-${run}.png`;
    ok(
      await owner.app.storage
        .from("wine-labels")
        .upload(ownerPath, image, { contentType: "image/png" }),
    );
    progress("wine_insert");
    ok(
      await owner.app.from("wines").insert({
        id,
        user_id: owner.id,
        wine_name: "Owned local acceptance wine",
        wine_type: "white",
        image_url: ownerPath,
        share_id: `owned+${run}/legacy`,
        is_public: false,
      }),
    );
    progress("photo_metadata");
    ok(
      await owner.app.from("wine_photos").insert({
        wine_id: id,
        user_id: owner.id,
        url: ownerPath,
        storage_path: ownerPath,
        kind: "label",
        sort_order: 0,
      }),
    );
    assert.equal(ok(await owner.app.from("wines").select("id").eq("id", id)).length, 1);
    assert.equal(ok(await peer.app.from("wines").select("id").eq("id", id)).length, 0);
    assert.ok((await owner.app.storage.from("wine-labels").download(ownerPath)).error);
    report.passed += 3;
    const ownImage = await api("/api/wine-image", { path: ownerPath }, owner.token);
    progress("image_proxy");
    assert.equal(ownImage.status, 200);
    assert.deepEqual(Buffer.from(await ownImage.arrayBuffer()), image);
    assert.equal((await api("/api/wine-image", { path: ownerPath }, peer.token)).status, 404);
    assert.equal((await api("/api/wine-image", { path: ownerPath })).status, 404);
    report.passed += 3;
    ok(await owner.app.from("wines").update({ is_public: true }).eq("id", id));
    assert.equal((await api("/api/wine-image", { path: ownerPath })).status, 200);
    ok(await owner.app.from("wines").update({ is_public: false }).eq("id", id));
    assert.equal((await api("/api/wine-image", { path: ownerPath })).status, 404);
    report.passed += 2;
    const exported = await api("/api/privacy/privacy-export", {}, owner.token);
    progress("privacy_export");
    assert.equal(exported.status, 200);
    assert.ok((await exported.text()).includes(id));
    report.passed++;
    assert.equal(ok(await owner.app.rpc("kitchen_access")), true);
    report.passed++;
    progress("browser");
    const playwright = await import(
      pathToFileURL(
        `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`,
      ).href
    );
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", () => errors.push("page_error"));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if ([ownedApp, ownedApi].includes(url.origin) || ["blob:", "data:"].includes(url.protocol))
        await route.continue();
      else {
        report.externalRequests++;
        await route.abort();
      }
    });
    await page.goto(ownedApp + "/login");
    await page.locator("#email").fill(owner.email);
    await page.locator("#password").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL(ownedApp + "/", { timeout: 20000 });
    await mkdir("dist", { recursive: true });
    await page.screenshot({ path: "dist/owned-windows-mobile.png", fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ownedApp + "/cellar");
    await page
      .getByText("Owned local acceptance wine", { exact: false })
      .first()
      .waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('img[src^="blob:"]')].some(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      undefined,
      { timeout: 15000 },
    );
    await page.screenshot({ path: "dist/owned-windows-desktop.png", fullPage: true });
    assert.equal(errors.length, 0);
    assert.equal(report.externalRequests, 0);
    report.passed += 2;
    await browser.close();
    browser = null;
    progress("persistence_restart");
    await restart();
    const after = ok(
      await owner.app.auth.signInWithPassword({ email: owner.email, password: owner.password }),
    );
    owner.token = after.session.access_token;
    assert.equal(
      ok(await owner.app.from("wines").select("share_id").eq("id", id)).at(0).share_id,
      `owned+${run}/legacy`,
    );
    const persistentImage = await api("/api/wine-image", { path: ownerPath }, owner.token);
    assert.equal(persistentImage.status, 200);
    assert.deepEqual(Buffer.from(await persistentImage.arrayBuffer()), image);
    report.passed += 2;
    progress("account_erasure");
    const erased = await api(
      "/api/privacy/privacy-controls",
      { action: "delete_account", confirm: "delete_account" },
      owner.token,
    );
    assert.equal(erased.status, 200);
    report.passed++;
    for (let i = 0; i < 40; i++) {
      const active = await admin.auth.admin.getUserById(owner.id);
      if (active.error || !active.data.user) break;
      if (i === 39) throw new Error("local_erasure_incomplete");
      await new Promise((done) => setTimeout(done, 250));
    }
    assert.equal((await api("/api/wine-image", { path: ownerPath }, owner.token)).status, 401);
    report.passed++;
    report.emailConfirmation = true;
    report.passwordRecovery = true;
    report.privateImages = true;
    report.persistenceAfterRestart = true;
    report.realBrowserLogin = true;
    report.exportAndErasure = true;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (ownerPath) await admin.storage.from("wine-labels").remove([ownerPath]);
    for (const user of users) {
      const found = await admin.auth.admin.getUserById(user.id);
      if (found.error && found.error.status !== 404) throw new Error("owned_cleanup_not_verified");
      if (found.data?.user) {
        assert.equal(found.data.user.email, user.email);
        ok(await admin.auth.admin.deleteUser(user.id));
      }
    }
    if (messages.length) {
      const deleted = await fetch("http://127.0.0.1:8026/api/v1/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IDs: messages }),
        redirect: "error",
      });
      assert.ok(deleted.ok);
    }
    report.cleanupCompleted = true;
  }
  return report;
}
