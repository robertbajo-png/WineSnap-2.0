import { z } from "zod";
import type { LocalSession, RecipeVersion } from "./domain";

const destinationSchema = z
  .object({
    view: z.enum(["recipes", "pairings", "cook"]),
    recipe: z.string().uuid().optional(),
    session: z.string().uuid().optional(),
    wine: z.string().uuid().optional(),
    servings: z.number().int().min(1).max(24).optional(),
    fromCook: z.boolean().optional(),
  })
  .strict()
  .refine((d) => !d.session || !!d.recipe)
  .refine((d) => !d.fromCook || !!d.session)
  .refine((d) => d.view !== "cook" || (!!d.recipe && !!d.session));

export type KitchenDestination = z.infer<typeof destinationSchema>;
export type Journey =
  { kind: "none" } | { kind: "invalid" } | { kind: "ready"; destination: KitchenDestination };

function read(hash: string, wine: boolean): Journey {
  if (hash.length > 600) return { kind: "invalid" };
  const [view, query, extra] = hash.replace(/^#/, "").split("?");
  if (wine ? view !== "kitchen" : !["recipes", "pairings", "cook"].includes(view))
    return { kind: "none" };
  if (query === undefined) return wine ? { kind: "invalid" } : { kind: "none" };
  const params = new URLSearchParams(query);
  const allowed = ["recipe", "session", "wine", "servings", "fromCook", ...(wine ? ["view"] : [])];
  if (
    extra !== undefined ||
    [...params.keys()].some((k) => !allowed.includes(k) || params.getAll(k).length !== 1)
  )
    return { kind: "invalid" };
  const result = destinationSchema.safeParse({
    view: wine ? params.get("view") : view,
    ...Object.fromEntries(
      ["recipe", "session", "wine"].filter((k) => params.has(k)).map((k) => [k, params.get(k)]),
    ),
    ...(params.has("servings")
      ? {
          servings: /^\d{1,2}$/.test(params.get("servings")!)
            ? Number(params.get("servings"))
            : NaN,
        }
      : {}),
    ...(params.has("fromCook")
      ? { fromCook: params.get("fromCook") === "1" ? true : undefined }
      : {}),
  });
  if (
    !result.success ||
    (params.has("fromCook") && params.get("fromCook") !== "1") ||
    (wine && (!result.data.recipe || result.data.view === "pairings"))
  )
    return { kind: "invalid" };
  return { kind: "ready", destination: result.data };
}

export const readKitchenJourney = (hash: string) => read(hash, false);
export const readWineJourney = (hash: string) => read(hash, true);

export function kitchenJourneyHash(input: KitchenDestination) {
  const d = destinationSchema.parse(input);
  const params = new URLSearchParams();
  for (const key of ["recipe", "session", "wine", "servings"] as const)
    if (d[key] !== undefined) params.set(key, String(d[key]));
  if (d.fromCook) params.set("fromCook", "1");
  return d.view + (params.size ? `?${params}` : "");
}

export function wineJourneyHash(input: KitchenDestination) {
  const d = destinationSchema.parse({ ...input, view: input.fromCook ? "cook" : "recipes" });
  if (!d.recipe) throw new Error("A pinned recipe is required");
  const [view, query] = kitchenJourneyHash(d).split("?");
  const params = new URLSearchParams(query);
  params.set("view", view);
  return `kitchen?${params}`;
}

export function resolveJourneyRecipe(
  destination: KitchenDestination,
  owner: string,
  versions: RecipeVersion[],
  session?: LocalSession | null,
) {
  if (!destination.recipe) return undefined;
  if (
    destination.session &&
    (session?.id !== destination.session ||
      session.version.id !== destination.recipe ||
      session.version.user_id !== owner ||
      !["running", "paused"].includes(session.state.status))
  )
    return null;
  return (
    [...versions, ...(session ? [session.version] : [])].find(
      (v) => v.id === destination.recipe && v.user_id === owner,
    ) ?? null
  );
}
