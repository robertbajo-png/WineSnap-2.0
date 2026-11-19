export function verifyOwnedScanFixture(wine) {
  const check = (condition, code) => {
    if (!condition) {
      const error = new Error("owned_scan_not_accepted");
      error.code = code;
      throw error;
    }
  };
  const identity = wine?.identity;
  check(!!identity, "SCAN_SCHEMA");
  const name = [identity.producer?.value, identity.wine_name?.value].filter(Boolean).join(" ");
  check(/zehn\s*morgen/i.test(name), "SCAN_NAME");
  check(Array.isArray(identity.grape_varieties), "SCAN_GRAPES");
  const grapes = identity.grape_varieties
    .map((g) => g?.value ?? "")
    .join(" ")
    .replace(/\u00df|\u1e9e/g, "ss");
  check(
    /chardonnay/i.test(grapes) && /weisser\s*burgunder|pinot\s*blanc/i.test(grapes),
    "SCAN_GRAPES",
  );
  check(parseVintage(String(identity.vintage?.value ?? "")) === 2023, "SCAN_YEAR");
  return { identified: true, vintage: 2023, bothGrapes: true };
}
import { parseVintage } from "../../supabase/functions/analyze-wine/labelValidation.ts";
