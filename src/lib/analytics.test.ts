import { expect, it, vi } from "vitest";
const insert = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: insert } }));
import { logEvent } from "./analytics";
it("does not send optional usage statistics or inspect the account", async () => {
  await logEvent("wine_scanned", { wine_id: "private" });
  expect(insert).not.toHaveBeenCalled();
});
