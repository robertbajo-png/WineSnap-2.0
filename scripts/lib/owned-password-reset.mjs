import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { validateOwnedGateKeys } from "./owned-private-ingress.mjs";
import { hashOwnedGatePassword } from "./owned-gate.mjs";
import { validateOwnedDeviceBinding } from "./owned-device-gate.mjs";

function validatePassword(value, minimum, maximum) {
  assert.equal(typeof value, "string");
  assert.ok(value.length >= minimum && Buffer.byteLength(value, "utf8") <= maximum);
  assert.ok(!/[\x00\r\n]/.test(value));
}

export function validateOwnedResetPasswords(gatePassword, appPassword) {
  validatePassword(gatePassword, 16, 256);
  validatePassword(appPassword, 12, 72);
  assert.notEqual(gatePassword, appPassword);
}

export function replaceOwnedGateLogin(gate, passwordHash, sessionSecret) {
  validateOwnedGateKeys(gate);
  assert.notEqual(passwordHash, gate.passwordHash);
  assert.notEqual(sessionSecret, gate.sessionSecret);
  return validateOwnedGateKeys({ ...gate, passwordHash, sessionSecret });
}

export async function rotateOwnedGatePassword(gate, password) {
  validateOwnedGateKeys(gate);
  validatePassword(password, 16, 256);
  const bytes = Buffer.from(password, "utf8");
  try {
    return replaceOwnedGateLogin(
      gate,
      await hashOwnedGatePassword(bytes),
      randomBytes(32).toString("hex"),
    );
  } finally {
    bytes.fill(0);
  }
}

export function selectOwnedPasswordResetUser(users, email) {
  assert.equal(typeof email, "string");
  assert.ok(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  assert.equal(email, email.trim().toLowerCase());
  assert.ok(Array.isArray(users) && users.length <= 1000);
  const matches = users.filter((user) => user.email === email);
  assert.equal(matches.length, 1);
  const user = matches[0];
  assert.match(user.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.ok(user.email_confirmed_at && !user.deleted_at && !user.is_anonymous);
  assert.ok(!user.app_metadata?.owned_browser_run);
  return user;
}

export async function verifyOwnedGateOwner(admin, binding, installationId, email) {
  validateOwnedDeviceBinding(binding, installationId);
  assert.equal(binding.enabled, true);
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ok(!listed.error && !listed.data.nextPage);
  assert.ok(!listed.data.total || listed.data.total <= 1000);
  const owner = selectOwnedPasswordResetUser(listed.data.users, email);
  assert.equal(owner.id, binding.ownerId);
  return owner.id;
}

export async function resetOwnedOwnerLogin(admin, verifier, email, password, progress) {
  validatePassword(password, 12, 72);
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ok(!listed.error);
  assert.ok(!listed.data.total || listed.data.total <= 1000);
  assert.ok(!listed.data.nextPage);
  const target = selectOwnedPasswordResetUser(listed.data.users, email);
  progress("owner_verified");
  const updated = await admin.auth.admin.updateUserById(target.id, { password });
  assert.ok(!updated.error);
  assert.equal(updated.data.user.id, target.id);
  assert.equal(updated.data.user.email, email);
  progress("app_password_updated");
  try {
    const login = await verifier.auth.signInWithPassword({ email, password });
    assert.ok(!login.error);
    assert.equal(login.data.user.id, target.id);
    progress("app_login_verified");
  } finally {
    const logout = await verifier.auth.signOut({ scope: "global" });
    assert.ok(!logout.error);
  }
  progress("app_refresh_sessions_revoked");
}

// Executed only inside the already-validated owned web container; stdin is private.
export const ownedGatePasswordProbe = `
import http from 'node:http';
import assert from 'node:assert/strict';
let input, password, cookie, ownerId, session; const chunks=[];
try {
  let size=0; for await (const chunk of process.stdin) {
    size+=chunk.length; assert(size<=2048); chunks.push(chunk);
  }
  input=Buffer.concat(chunks); const payload=JSON.parse(input.toString());
  password=payload.password;ownerId=payload.ownerId;
  assert(typeof password==='string' && password.length>=16);
  if(ownerId!==undefined)assert.match(ownerId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const origin='https://winesnap.boleoai.se';
  const request=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
    const data=body?JSON.stringify(body):undefined;
    const req=http.request('http://winesnap-owned-internet:8080'+path,{
      method,headers:{Host:'winesnap.boleoai.se',Origin:origin,
        ...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),
        'X-Requested-With':'XMLHttpRequest'}:{}),...headers},timeout:10000
    },res=>{let size=0;const parts=[];res.on('error',reject);res.on('data',chunk=>{
      size+=chunk.length;if(size>262144){req.destroy(new Error('probe_response_limit'));return;}parts.push(chunk);
    });res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString('utf8')}));});
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('probe_timeout')));req.end(data);
  });
  assert.equal((await request('/api/health')).status,302);
  const login=await request('/gate/api/firstfactor',{method:'POST',body:{
    username:'robert',password,targetURL:origin,keepMeLoggedIn:false}});
  assert.equal(login.status,200);
  const line=login.headers['set-cookie']?.find(v=>v.startsWith('__Secure-winesnap_gate='));
  assert(line && /; Secure/i.test(line) && /; HttpOnly/i.test(line));
  cookie=line.split(';')[0];
  try {
    assert.equal((await request('/api/health',{headers:{Cookie:cookie}})).status,200);
    if(ownerId){
      const state=JSON.parse((await request('/gate/api/state',{headers:{Cookie:cookie}})).body).data;
      assert.equal(state.username,'robert');assert(state.authentication_level>=1);
      assert.equal(state.factor_knowledge,true);
      const opened=await request('/api/owned/device-session',{method:'POST',body:{},
        headers:{Cookie:cookie,'X-WineSnap-Device':'sign-in'}});
      assert.equal(opened.status,200);assert(opened.headers['cache-control']?.includes('no-store'));
      session=JSON.parse(opened.body).session;
      try {
        assert.equal(session?.user?.id,ownerId);assert.equal(session?.user?.role,'authenticated');
        assert.equal(typeof session?.access_token,'string');
        const me=await request('/backend/auth/v1/user',{headers:{Cookie:cookie,Authorization:'Bearer '+session.access_token}});
        assert.equal(me.status,200);assert.equal(JSON.parse(me.body).id,ownerId);
      } finally {
        if(session?.access_token){
          const logout=await request('/backend/auth/v1/logout?scope=local',{method:'POST',headers:{Cookie:cookie,Authorization:'Bearer '+session.access_token}});
          assert([200,204].includes(logout.status));
        }
        session=undefined;
      }
    }
  }
  finally { assert.equal((await request('/gate/api/logout',{method:'POST',headers:{Cookie:cookie}})).status,200); }
  assert.equal((await request('/api/health',{headers:{Cookie:cookie}})).status,302);
  console.log(JSON.stringify({completed:true,gateLoginVerified:true,ownerSessionVerified:Boolean(ownerId),probeSessionLoggedOut:true}));
} catch { console.log(JSON.stringify({completed:false}));process.exitCode=1; }
finally { input?.fill(0);for(const chunk of chunks)chunk.fill(0);password=undefined;cookie=undefined;ownerId=undefined;session=undefined; }
`;
