import assert from "node:assert/strict";

export const ownedInternetOrigin = "https://winesnap.boleoai.se";
export const ownedIngressNetwork = "winesnap-owned-ingress";
export const ownedIngressService = "http://winesnap-owned-internet:8080";
export const ownedTunnelImage =
  "cloudflare/cloudflared@sha256:faa8e0a1475f137c910be6025f43c8e4092fdd35461b31e19fd1390657a1ff39";

export function ownedTunnelConfiguration({ tunnelId, teamName, audience }) {
  assert.match(tunnelId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.match(teamName, /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/);
  assert.match(audience, /^[a-f0-9]{64}$/);
  return {
    tunnel: tunnelId,
    "credentials-file": "/tmp/winesnap-tunnel/credentials.json",
    ingress: [
      {
        hostname: new URL(ownedInternetOrigin).hostname,
        service: ownedIngressService,
        originRequest: {
          access: { required: true, teamName, audTag: [audience] },
          connectTimeout: "10s",
        },
      },
      { service: "http_status:404" },
    ],
  };
}
