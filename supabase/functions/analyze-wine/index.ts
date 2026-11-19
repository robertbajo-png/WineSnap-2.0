import { createLabelReader } from "./handler.ts";
import { requireAiAccess } from "../_shared/aiSecurity.ts";

Deno.serve(
  createLabelReader({
    env: (name) => Deno.env.get(name),
    requireAccess: (req, options) => requireAiAccess(req, options),
  }),
);
