import { z } from "zod";

export const COLLECTOR_CURRENCIES = ["SEK", "EUR", "USD", "GBP", "CHF", "DKK", "NOK"] as const;
export const COLLECTOR_PURPOSES = ["drink", "collect", "invest"] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const money = z
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001);
export const collectorLotSchema = z
  .object({
    wine_id: z.string().uuid(),
    purpose: z.enum(COLLECTOR_PURPOSES),
    purchased_at: date,
    quantity: z.number().int().min(1).max(100000),
    remaining: z.number().int().min(0).max(100000),
    bottle_ml: z.number().int().min(50).max(30000),
    unit_cost: money,
    additional_cost: money,
    currency: z.enum(COLLECTOR_CURRENCIES),
    condition: z.string().trim().max(1000),
    provenance: z.string().trim().max(1000),
    storage: z.string().trim().max(1000),
    estimate_price: money.nullable(),
    estimate_currency: z.enum(COLLECTOR_CURRENCIES).nullable(),
    estimate_date: date.nullable(),
    estimate_source: z.string().trim().min(1).max(1000).nullable(),
    estimate_confidence: z.enum(["low", "medium", "high"]).nullable(),
  })
  .refine((lot) => lot.remaining <= lot.quantity, { path: ["remaining"] })
  .refine(
    (lot) => {
      const fields = [
        lot.estimate_price,
        lot.estimate_currency,
        lot.estimate_date,
        lot.estimate_source,
        lot.estimate_confidence,
      ];
      return fields.every((v) => v === null) || fields.every((v) => v !== null);
    },
    { path: ["estimate_source"] },
  );

export type CollectorLotInput = z.infer<typeof collectorLotSchema>;
export const collectorLotRowSchema = collectorLotSchema.and(
  z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);
export type CollectorLot = z.infer<typeof collectorLotRowSchema>;

export function collectorTotals(lots: CollectorLotInput[]) {
  const currencies = new Map<
    string,
    { currency: string; bottles: number; cost: number; estimate: number; valued: number }
  >();
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    const cost = currencies.get(lot.currency) ?? {
      currency: lot.currency,
      bottles: 0,
      cost: 0,
      estimate: 0,
      valued: 0,
    };
    cost.bottles += lot.remaining;
    cost.cost += (lot.unit_cost + lot.additional_cost / lot.quantity) * lot.remaining;
    currencies.set(lot.currency, cost);
    if (lot.estimate_price !== null && lot.estimate_currency) {
      const value = currencies.get(lot.estimate_currency) ?? {
        currency: lot.estimate_currency,
        bottles: 0,
        cost: 0,
        estimate: 0,
        valued: 0,
      };
      value.estimate += lot.estimate_price * lot.remaining;
      value.valued += lot.remaining;
      currencies.set(lot.estimate_currency, value);
    }
  }
  return [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
