import { createHandler } from "./handler.ts";
import { privacyAdmin, runAccountErasure } from "../_shared/privacyRuntime.ts";

Deno.serve(
  createHandler({
    env: (name) => Deno.env.get(name),
    admin: privacyAdmin,
    erase: runAccountErasure,
  }),
);
