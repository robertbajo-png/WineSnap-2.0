import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { createAiAccessGuard } from "./aiAccess.ts";

export const requireAiAccess = createAiAccessGuard((name) => Deno.env.get(name), createClient);
