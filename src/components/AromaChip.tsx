import {
  Apple,
  Bean,
  Candy,
  Cherry,
  Citrus,
  Coffee,
  Flame,
  Flower2,
  Gem,
  Grape,
  Leaf,
  Mountain,
  Sparkles,
  Sprout,
  Trees,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AromaFamily =
  | "berry"
  | "orchard"
  | "citrus"
  | "stone"
  | "tropical"
  | "floral"
  | "spice"
  | "oak"
  | "earth"
  | "herbal"
  | "sweet"
  | "roast"
  | "mineral"
  | "smoke";

type AromaMeta = {
  family: AromaFamily;
  familyLabel: string;
  Icon: LucideIcon;
  gradient: string;
  ring: string;
  text: string;
};

const FAMILY_STYLE: Record<AromaFamily, Omit<AromaMeta, "Icon" | "family">> = {
  berry: {
    familyLabel: "Fruit",
    gradient: "from-rose-500/32 via-burgundy/42 to-red-950/55",
    ring: "ring-rose-300/18",
    text: "text-rose-100",
  },
  orchard: {
    familyLabel: "Orchard",
    gradient: "from-emerald-300/24 via-lime-700/30 to-emerald-950/50",
    ring: "ring-emerald-200/16",
    text: "text-emerald-100",
  },
  citrus: {
    familyLabel: "Citrus",
    gradient: "from-amber-200/34 via-orange-500/32 to-yellow-950/52",
    ring: "ring-amber-200/18",
    text: "text-amber-100",
  },
  stone: {
    familyLabel: "Stone fruit",
    gradient: "from-orange-200/30 via-orange-400/28 to-orange-950/52",
    ring: "ring-orange-200/18",
    text: "text-orange-100",
  },
  tropical: {
    familyLabel: "Tropical",
    gradient: "from-yellow-200/32 via-lime-500/24 to-emerald-950/50",
    ring: "ring-yellow-200/16",
    text: "text-yellow-100",
  },
  floral: {
    familyLabel: "Floral",
    gradient: "from-pink-200/30 via-fuchsia-500/26 to-purple-950/50",
    ring: "ring-pink-200/18",
    text: "text-pink-100",
  },
  spice: {
    familyLabel: "Spice",
    gradient: "from-orange-300/30 via-copper/40 to-red-950/52",
    ring: "ring-orange-200/16",
    text: "text-orange-100",
  },
  oak: {
    familyLabel: "Oak",
    gradient: "from-amber-300/30 via-stone-600/32 to-stone-950/56",
    ring: "ring-amber-200/16",
    text: "text-amber-100",
  },
  earth: {
    familyLabel: "Earth",
    gradient: "from-stone-300/22 via-neutral-700/34 to-zinc-950/58",
    ring: "ring-stone-200/14",
    text: "text-stone-100",
  },
  herbal: {
    familyLabel: "Herbal",
    gradient: "from-green-300/26 via-emerald-700/32 to-green-950/54",
    ring: "ring-green-200/16",
    text: "text-green-100",
  },
  sweet: {
    familyLabel: "Sweet",
    gradient: "from-yellow-200/30 via-gold/34 to-amber-950/54",
    ring: "ring-yellow-200/18",
    text: "text-yellow-100",
  },
  roast: {
    familyLabel: "Roasted",
    gradient: "from-orange-200/24 via-yellow-900/34 to-stone-950/58",
    ring: "ring-orange-200/14",
    text: "text-orange-100",
  },
  mineral: {
    familyLabel: "Mineral",
    gradient: "from-sky-200/20 via-slate-500/24 to-slate-950/58",
    ring: "ring-sky-200/14",
    text: "text-sky-100",
  },
  smoke: {
    familyLabel: "Smoke",
    gradient: "from-zinc-300/20 via-zinc-700/34 to-black/64",
    ring: "ring-zinc-200/12",
    text: "text-zinc-100",
  },
};

export function aromaMeta(name: string): AromaMeta {
  const n = name.toLowerCase();
  let family: AromaFamily = "berry";
  let Icon: LucideIcon = Grape;

  if (/cherry|berry|plum|currant|strawberry|raspberry|blackberry|blueberry|cranberry|bär|körsbär|plommon/i.test(n)) {
    family = "berry";
    Icon = Cherry;
  } else if (/apple|pear|äpple|päron/i.test(n)) {
    family = "orchard";
    Icon = Apple;
  } else if (/citrus|lemon|lime|grapefruit|orange|citron/i.test(n)) {
    family = "citrus";
    Icon = Citrus;
  } else if (/peach|apricot|nectarine|persika|aprikos/i.test(n)) {
    family = "stone";
    Icon = Sparkles;
  } else if (/tropical|pineapple|mango|passion|banana|ananas|tropisk/i.test(n)) {
    family = "tropical";
    Icon = Grape;
  } else if (/floral|rose|violet|jasmine|flower|blom|viol|ros/i.test(n)) {
    family = "floral";
    Icon = Flower2;
  } else if (/spice|pepper|clove|cinnamon|anise|krydd|peppar|kanel/i.test(n)) {
    family = "spice";
    Icon = Sparkles;
  } else if (/oak|wood|cedar|cask|fat|ek/i.test(n)) {
    family = "oak";
    Icon = Trees;
  } else if (/earth|leather|tobacco|mushroom|jord|läder|tobak|svamp/i.test(n)) {
    family = "earth";
    Icon = Leaf;
  } else if (/herb|mint|eucalyptus|grass|ört|mynta/i.test(n)) {
    family = "herbal";
    Icon = Sprout;
  } else if (/vanilla|honey|butter|bread|yeast|cream|vanilj|honung|smör/i.test(n)) {
    family = "sweet";
    Icon = Candy;
  } else if (/chocolate|cocoa|coffee|mocha|kakao|kaffe/i.test(n)) {
    family = "roast";
    Icon = /coffee|kaffe|mocha/i.test(n) ? Coffee : Bean;
  } else if (/mineral|stone|chalk|slate|salt|sten|krita/i.test(n)) {
    family = "mineral";
    Icon = Gem;
  } else if (/smoke|tar|toast|rök|tj[äa]ra/i.test(n)) {
    family = "smoke";
    Icon = Flame;
  } else if (/grain|wheat|hay|vete|hö/i.test(n)) {
    family = "sweet";
    Icon = Wheat;
  } else if (/mountain|alpine/i.test(n)) {
    family = "mineral";
    Icon = Mountain;
  }

  return { family, Icon, ...FAMILY_STYLE[family] };
}

export function AromaIcon({ name, className, iconClassName }: { name: string; className?: string; iconClassName?: string }) {
  const meta = aromaMeta(name);
  const Icon = meta.Icon;

  return (
    <span
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br shadow-[inset_0_1px_0_oklch(1_0_0/0.16),0_10px_24px_-14px_oklch(0_0_0/0.9)] ring-1",
        meta.gradient,
        meta.ring,
        className,
      )}
    >
      <span className="absolute inset-x-1 top-1 h-4 rounded-full bg-white/12 blur-sm" />
      <Icon className={cn("relative h-5 w-5", meta.text, iconClassName)} strokeWidth={1.55} />
    </span>
  );
}

export function AromaChip({ name }: { name: string }) {
  const meta = aromaMeta(name);

  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-2">
      <AromaIcon name={name} className="h-14 w-14 rounded-3xl" iconClassName="h-6 w-6" />
      <span className="line-clamp-2 text-center text-[10px] leading-tight text-cream">
        {name}
      </span>
      <span className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">
        {meta.familyLabel}
      </span>
    </div>
  );
}
