import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ownedGateConfiguration,
  ownedGateUsers,
  ownedGateImage,
  hashOwnedGatePassword,
} from "./owned-gate.mjs";

const settings = () => ({
  sessionSecret: "a".repeat(64),
  storageKey: "b".repeat(64),
  resetSecret: "c".repeat(64),
});
describe("self-hosted private WineSnap gate", () => {
  it("uses the vendor session engine and a digest-pinned image", () => {
    expect(ownedGateImage).toMatch(/^authelia\/authelia@sha256:[a-f0-9]{64}$/);
    const config = ownedGateConfiguration(settings());
    expect(config.server.address).toBe("tcp://:9091/gate");
    expect(config.server.endpoints.authz["auth-request"].authn_strategies).toEqual([
      { name: "CookieSession" },
    ]);
    expect(config.access_control).toEqual({
      default_policy: "deny",
      rules: [{ domain: "winesnap.boleoai.se", subject: "user:robert", policy: "one_factor" }],
    });
    expect(config.authentication_backend.password_reset.disable).toBe(true);
  });
  it("restricts cookies to the leaf hostname and disables persistent remembered sessions", () => {
    const config = ownedGateConfiguration(settings());
    expect(config.session.cookies).toEqual([
      {
        domain: "winesnap.boleoai.se",
        authelia_url: "https://winesnap.boleoai.se/gate",
        default_redirection_url: "https://winesnap.boleoai.se",
      },
    ]);
    expect(config.session.name).toBe("__Secure-winesnap_gate");
    expect(config.session.remember_me).toBe(-1);
    expect(config.session.expiration).toBe("2h");
  });
  it("refuses plaintext passwords and weak or injected configuration secrets", () => {
    expect(() => ownedGateUsers("password")).toThrow();
    for (const key of Object.keys(settings()))
      expect(() => ownedGateConfiguration({ ...settings(), [key]: "unsafe" })).toThrow();
  });
  it("refuses short, oversized or non-buffer password setup inputs", async () => {
    for (const value of ["not a private buffer", Buffer.alloc(15), Buffer.alloc(257)])
      await expect(hashOwnedGatePassword(value)).rejects.toThrow();
  });
  it("protects all proxy routes by default and never makes the gate an identity for WineSnap", () => {
    const nginx = readFileSync(
      new URL("../../config/owned-windows/gated-internet.conf", import.meta.url),
      "utf8",
    );
    expect(nginx).toContain("auth_request /_owned_auth_check;");
    expect(nginx).toContain("internal;");
    expect(nginx).toContain("proxy_connect_timeout 2s;");
    expect(nginx).toContain("proxy_read_timeout 5s;");
    expect(nginx).toContain('proxy_set_header Authorization "";');
    expect(nginx).toContain('proxy_set_header Remote-User "";');
    expect(nginx).toContain('add_header Cache-Control "private, no-store" always;');
    expect(nginx).toContain("limit_req_status 429;");
    expect(nginx).toContain("limit_conn owned_login_active 2;");
    expect(nginx).toContain("client_max_body_size 4k;");
    expect(nginx).toContain("location ^~ /backend/auth/v1/admin { return 404; }");
    expect(nginx).not.toMatch(/8026|5432|owned-mail|proxy_pass \$/);
    for (const path of ["auth", "rest", "storage"])
      expect(nginx).toContain(`location /backend/${path}/v1/`);
  });
  it("keeps tunnel credentials encrypted and validates the exact approved tunnel identity", () => {
    const transfer = readFileSync(
      new URL("../configure-owned-tunnel.ps1", import.meta.url),
      "utf8",
    );
    expect(transfer).toContain("OaepSHA256");
    expect(transfer).toContain("ProtectedData]::Protect");
    expect(transfer).toContain("CurrentUser");
    expect(transfer).toContain("[IO.FileMode]::CreateNew");
    expect(transfer).toContain("$identity.a -cne $accountId -or $identity.t -cne $tunnelId");
    expect(transfer).not.toMatch(/Write-Output \$token|Set-Content.*\$token|WriteAllText.*\$token/);
  });
  it("requires human password entry and keeps the setup payload off arguments and disk", () => {
    const setup = readFileSync(new URL("../configure-owned-gate.ps1", import.meta.url), "utf8");
    expect(setup.match(/UseSystemPasswordChar=\$true/g)).toHaveLength(2);
    expect(setup).toContain("$form.ShowDialog()");
    expect(setup).toContain("$first.Text -ceq $confirm.Text");
    expect(setup).toContain("$process.StandardInput.BaseStream.Write($bytes");
    expect(setup).toContain("ProtectedData]::Protect");
    expect(setup).toContain("[IO.FileMode]::CreateNew");
    expect(setup).not.toMatch(
      /ArgumentList.Add\(\$bytes|ArgumentList.Add\(\$first|WriteAllText.*\$raw/,
    );
    const helper = readFileSync(new URL("../create-owned-gate-key.mjs", import.meta.url), "utf8");
    expect(helper).toContain('process.env.WINESNAP_OWNED_GATE_SETUP_PIPE, "1"');
    expect(helper).toContain("size <= 256");
    expect(helper).toContain("password?.fill(0)");
  });
});
