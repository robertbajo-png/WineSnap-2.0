import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { requireAiAccess } from "../_shared/aiSecurity.ts";
import { createHandler } from "./handler.ts";

Deno.serve(
  createHandler({
    env: (name) => Deno.env.get(name),
    createClient,
    requireAccess: (req, options) => requireAiAccess(req, options),
  }),
);
