import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// This runner intentionally cannot target any other Supabase project.
const url = 'https://pzniyupmgwvlldvztzqh.supabase.co';
const key = process.env.WINESNAP_TEST_PUBLISHABLE_KEY;
const secret = process.env.WINESNAP_TEST_SECRET_KEY;
if (!key || !secret) throw new Error('Test project credentials required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const anon = createClient(url, key, options);
const users = [];
const objects = [];
let failures = 0;
const ok = ({ data, error }) => { if (error) throw error; return data; };
async function check(name, test) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (e) { failures++; console.log(`FAIL ${name}: ${e.message}`); }
}
try {
  for (let i = 0; i < 4; i++) {
    const email = `winesnap-test-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    users.push({ id: user.id });
    const client = createClient(url, key, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    users[i].client = client;
    ok(await client.from('profiles').update({ username: `test_${user.id.replaceAll('-', '').slice(0, 12)}`, is_public: i === 0 }).eq('id', user.id));
  }
  const [owner, stranger, hiddenA, hiddenB] = users;
  const legacy = 'ab+cd/efghij';
  const path = `${owner.id}/${randomUUID()}.png`;
  const wine = ok(await owner.client.from('wines').insert({ user_id: owner.id, wine_name: 'Synthetic security test', is_public: false, share_id: legacy, notes: 'PRIVATE TEST NOTE', image_url: path }).select().single());
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=', 'base64');
  ok(await owner.client.storage.from('wine-labels').upload(path, png, { contentType: 'image/png' }));
  objects.push(path);
  ok(await owner.client.from('wine_photos').insert({ wine_id: wine.id, user_id: owner.id, url: path, storage_path: path, kind: 'label' }));
  await check('owner can read private wine', async () => assert.equal(ok(await owner.client.from('wines').select('id').eq('id', wine.id)).length, 1));
  await check('stranger cannot read private wine', async () => assert.equal(ok(await stranger.client.from('wines').select('id').eq('id', wine.id)).length, 0));
  await check('anonymous base-table access denied', async () => assert.ok((await anon.from('wines').select('id')).error));
  await check('stranger cannot read owner private profile', async () => assert.equal(ok(await stranger.client.from('profiles').select('*').eq('id', owner.id)).length, 0));
  await check('owner downloads private image', async () => assert.ok(ok(await owner.client.storage.from('wine-labels').download(path)).size > 0));
  await check('stranger cannot download private image', async () => assert.ok((await stranger.client.storage.from('wine-labels').download(path)).error));
  await check('anonymous cannot sign private image', async () => assert.ok((await anon.storage.from('wine-labels').createSignedUrl(path, 60)).error));
  ok(await owner.client.from('wines').update({ is_public: true }).eq('id', wine.id));
  await check('legacy share ID resolves through public API', async () => assert.equal(ok(await anon.from('public_wines').select('id').eq('share_id', legacy)).at(0)?.id, wine.id));
  await check('public view excludes private notes', async () => assert.ok((await anon.from('public_wines').select('notes')).error));
  let signed;
  await check('anonymous can sign and fetch explicitly shared image', async () => {
    signed = ok(await anon.storage.from('wine-labels').createSignedUrl(path, 60)).signedUrl;
    assert.equal((await fetch(signed)).status, 200);
  });
  const expiring = ok(await anon.storage.from('wine-labels').createSignedUrl(path, 1)).signedUrl;
  await new Promise(resolve => setTimeout(resolve, 3000));
  await check('expired signed image URL rejected', async () => assert.notEqual((await fetch(expiring)).status, 200));
  ok(await owner.client.from('wines').update({ is_public: false }).eq('id', wine.id));
  await check('unsharing blocks new signed URLs', async () => assert.ok((await anon.storage.from('wine-labels').createSignedUrl(path, 60)).error));
  await check('unsharing removes public share lookup', async () => assert.equal(ok(await anon.from('public_wines').select('id').eq('share_id', legacy)).length, 0));
  if (signed) console.log(`OBSERVATION existing signed URL after unshare HTTP ${(await fetch(signed)).status}; issuance revocation does not revoke previously issued tokens`);
  ok(await owner.client.from('follows').insert({ follower_id: owner.id, following_id: stranger.id }));
  ok(await hiddenA.client.from('follows').insert({ follower_id: hiddenA.id, following_id: hiddenB.id }));
  await check('authenticated user sees public-profile relation only', async () => {
    const rows = ok(await stranger.client.from('follows').select('follower_id,following_id'));
    assert.equal(rows.length, 1); assert.equal(rows[0].follower_id, owner.id);
  });
  await check('participant sees their own private relation', async () => assert.equal(ok(await hiddenB.client.from('follows').select('follower_id').eq('follower_id', hiddenA.id)).length, 1));
  await check('anonymous sees no follow relations', async () => {
    const result = await anon.from('follows').select('*');
    assert.ok(result.error || result.data.length === 0);
  });
  await check('atomic rate limiter allows exactly 20 of 32 requests', async () => {
    const results = await Promise.all(Array.from({ length: 32 }, () => owner.client.rpc('consume_api_rate_limit', { _bucket: 'analyze-wine' })));
    const values = results.map(ok);
    assert.equal(values.filter(v => v === true).length, 20);
    assert.equal(values.filter(v => v === false).length, 12);
  });
  await check('account with wine can be deleted through Auth API', async () => {
    ok(await admin.storage.from('wine-labels').remove(objects));
    objects.length = 0;
    ok(await admin.auth.admin.deleteUser(owner.id));
    users.splice(users.indexOf(owner), 1);
    assert.equal(ok(await admin.from('wines').select('id').eq('id', wine.id)).length, 0);
  });
} finally {
  // Delete only fixtures created by this run, storage first to allow Auth cleanup.
  if (objects.length) ok(await admin.storage.from('wine-labels').remove(objects));
  for (const user of users) {
    // Work around the existing cascade/recompute trigger bug during fixture cleanup.
    ok(await admin.from('wines').delete().eq('user_id', user.id));
    ok(await admin.auth.admin.deleteUser(user.id));
  }
  console.log(`Cleanup complete: ${users.length} test users, ${objects.length} test images`);
}
if (failures) process.exitCode = 1;
