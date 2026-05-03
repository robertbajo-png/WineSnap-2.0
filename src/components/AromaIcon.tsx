import {
  Cherry,
  Apple,
  Citrus,
  Grape,
  Flower2,
  Leaf,
  TreePine,
  Flame,
  Coffee,
  Candy,
  Wheat,
  Mountain,
  Droplet,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Family = "fruit" | "citrus" | "berry" | "floral" | "oak" | "earth" | "spice" | "sweet" | "herb" | "mineral" | "other";

const MAP: { match: RegExp; icon: LucideIcon; family: Family }[] = [
  { match: /(cherry|körsbär|berry|bär|hallon|raspberry|strawberry|jordgubb|currant|vinbär|blackberry|björnbär)/i, icon: Cherry, family: "berry" },
  { match: /(plum|plommon|fig|fikon|date|dadel)/i, icon: Cherry, family: "fruit" },
  { match: /(apple|äpple|pear|päron|quince)/i, icon: Apple, family: "fruit" },
  { match: /(citrus|lemon|citron|lime|grapefruit|grapefrukt|orange|apelsin)/i, icon: Citrus, family: "citrus" },
  { match: /(peach|persika|apricot|aprikos|nectarine|tropical|tropisk|pineapple|ananas|mango|passion|melon)/i, icon: Citrus, family: "fruit" },
  { match: /(grape|druva|raisin|russin)/i, icon: Grape, family: "fruit" },
  { match: /(floral|flower|blomma|rose|ros|violet|viol|jasmine|jasmin|lavender|lavendel|elderflower|fläder)/i, icon: Flower2, family: "floral" },
  { match: /(oak|ek|cedar|ceder|wood|trä|cask|fat|barrel)/i, icon: TreePine, family: "oak" },
  { match: /(smoke|rök|tar|tjära|toast|rostat|char)/i, icon: Flame, family: "oak" },
  { match: /(vanilla|vanilj|cream|grädde|butter|smör|caramel|karamell|toffee|honey|honung)/i, icon: Candy, family: "sweet" },
  { match: /(chocolate|choklad|cocoa|kakao|mocha|mocka)/i, icon: Candy, family: "sweet" },
  { match: /(coffee|kaffe|espresso)/i, icon: Coffee, family: "sweet" },
  { match: /(tobacco|tobak|leather|läder|earth|jord|forest|skog|mushroom|svamp|truffle|tryffel|undergrowth)/i, icon: Leaf, family: "earth" },
  { match: /(spice|krydd|pepper|peppar|clove|nejlika|cinnamon|kanel|nutmeg|muskot|anise|anis|licorice|lakrits)/i, icon: Sparkles, family: "spice" },
  { match: /(herb|ört|mint|eucalyptus|eukalyptus|thyme|timjan|sage|salvia|rosemary|rosmarin|basil|basilika)/i, icon: Leaf, family: "herb" },
  { match: /(mineral|sten|stone|flint|chalk|krita|slate|skiffer|wet|våt)/i, icon: Mountain, family: "mineral" },
  { match: /(bread|bröd|yeast|jäst|biscuit|kex|brioche|toast)/i, icon: Wheat, family: "sweet" },
  { match: /(petrol|kerosene|rubber|gummi)/i, icon: Droplet, family: "other" },
];

const FAMILY_STYLES: Record<Family, { gradient: string; ring: string; text: string }> = {
  berry:    { gradient: "from-burgundy/60 via-burgundy/25 to-transparent", ring: "ring-burgundy/30", text: "text-rose-200" },
  fruit:    { gradient: "from-rose-500/40 via-rose-500/15 to-transparent", ring: "ring-rose-400/20", text: "text-rose-100" },
  citrus:   { gradient: "from-amber-300/50 via-amber-300/15 to-transparent", ring: "ring-amber-200/25", text: "text-amber-100" },
  floral:   { gradient: "from-pink-300/40 via-pink-300/15 to-transparent", ring: "ring-pink-200/20", text: "text-pink-100" },
  oak:      { gradient: "from-amber-700/50 via-amber-800/20 to-transparent", ring: "ring-amber-600/25", text: "text-amber-200" },
  earth:    { gradient: "from-stone-500/50 via-stone-600/15 to-transparent", ring: "ring-stone-400/20", text: "text-stone-200" },
  spice:    { gradient: "from-orange-500/45 via-orange-600/15 to-transparent", ring: "ring-orange-400/20", text: "text-orange-100" },
  sweet:    { gradient: "from-amber-500/45 via-amber-600/15 to-transparent", ring: "ring-amber-400/20", text: "text-amber-100" },
  herb:     { gradient: "from-emerald-500/40 via-emerald-600/15 to-transparent", ring: "ring-emerald-400/20", text: "text-emerald-100" },
  mineral:  { gradient: "from-slate-400/40 via-slate-500/15 to-transparent", ring: "ring-slate-300/20", text: "text-slate-100" },
  other:    { gradient: "from-gold/40 via-gold/15 to-transparent", ring: "ring-gold/25", text: "text-gold" },
};

export function aromaMeta(name: string) {
  const hit = MAP.find((m) => m.match.test(name));
  const family: Family = hit?.family ?? "other";
  const Icon = hit?.icon ?? Grape;
  return { Icon, family, styles: FAMILY_STYLES[family] };
}

export function AromaIcon({ name, className }: { name: string; className?: string }) {
  const { Icon, styles } = aromaMeta(name);
  return (
    <div
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ring-1 ring-inset",
        styles.gradient,
        styles.ring,
        className,
      )}
    >
      <Icon className={cn("h-5 w-5", styles.text)} strokeWidth={1.6} />
    </div>
  );
}
