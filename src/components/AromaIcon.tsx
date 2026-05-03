import { cn } from "@/lib/utils";
import blackCherry from "@/assets/aromas/black-cherry.png";
import blackberry from "@/assets/aromas/blackberry.png";
import plum from "@/assets/aromas/plum.png";
import fig from "@/assets/aromas/fig.png";
import citrusPeel from "@/assets/aromas/citrus-peel.png";
import violet from "@/assets/aromas/violet.png";
import rose from "@/assets/aromas/rose.png";
import pepper from "@/assets/aromas/pepper.png";
import bakingSpice from "@/assets/aromas/baking-spice.png";
import vanilla from "@/assets/aromas/vanilla.png";
import cocoa from "@/assets/aromas/cocoa.png";
import coffee from "@/assets/aromas/coffee.png";
import cedar from "@/assets/aromas/cedar.png";
import oakBarrel from "@/assets/aromas/oak-barrel.png";
import tobaccoLeaf from "@/assets/aromas/tobacco-leaf.png";
import leather from "@/assets/aromas/leather.png";
import forestFloor from "@/assets/aromas/forest-floor.png";
import wetStone from "@/assets/aromas/wet-stone.png";
import graphite from "@/assets/aromas/graphite.png";
import mushroom from "@/assets/aromas/mushroom.png";
import driedHerbs from "@/assets/aromas/dried-herbs.png";
import honey from "@/assets/aromas/honey.png";
import almond from "@/assets/aromas/almond.png";
import smoke from "@/assets/aromas/smoke.png";

type Family = "fruit" | "berry" | "citrus" | "floral" | "spice" | "sweet" | "oak" | "earth" | "mineral" | "herb" | "other";

const MAP: { match: RegExp; src: string; family: Family; label: string }[] = [
  { match: /(black\s*cherry|cherry|körsbär)/i, src: blackCherry, family: "berry", label: "Black cherry" },
  { match: /(blackberry|björnbär|raspberry|hallon|strawberry|jordgubb|currant|vinbär|berry|bär)/i, src: blackberry, family: "berry", label: "Blackberry" },
  { match: /(plum|plommon|prune)/i, src: plum, family: "fruit", label: "Plum" },
  { match: /(fig|fikon|date|dadel)/i, src: fig, family: "fruit", label: "Fig" },
  { match: /(citrus|lemon|citron|lime|grapefruit|orange|apelsin|peel)/i, src: citrusPeel, family: "citrus", label: "Citrus" },
  { match: /(violet|viol)/i, src: violet, family: "floral", label: "Violet" },
  { match: /(rose|ros\b|jasmine|jasmin|elderflower|fläder|floral|flower|blomma)/i, src: rose, family: "floral", label: "Floral" },
  { match: /(pepper|peppar)/i, src: pepper, family: "spice", label: "Pepper" },
  { match: /(cinnamon|kanel|clove|nejlika|nutmeg|muskot|anise|anis|licorice|lakrits|baking\s*spice|spice|krydd)/i, src: bakingSpice, family: "spice", label: "Baking spice" },
  { match: /(vanilla|vanilj)/i, src: vanilla, family: "sweet", label: "Vanilla" },
  { match: /(cocoa|kakao|chocolate|choklad)/i, src: cocoa, family: "sweet", label: "Cocoa" },
  { match: /(coffee|kaffe|espresso|mocha|mocka)/i, src: coffee, family: "sweet", label: "Coffee" },
  { match: /(cedar|ceder)/i, src: cedar, family: "oak", label: "Cedar" },
  { match: /(oak|ek|barrel|cask|fat|wood|trä|toast|rostat)/i, src: oakBarrel, family: "oak", label: "Oak" },
  { match: /(tobacco|tobak)/i, src: tobaccoLeaf, family: "earth", label: "Tobacco" },
  { match: /(leather|läder)/i, src: leather, family: "earth", label: "Leather" },
  { match: /(forest|skog|undergrowth|underveg)/i, src: forestFloor, family: "earth", label: "Forest floor" },
  { match: /(wet\s*stone|flint|chalk|krita|slate|skiffer|mineral|sten)/i, src: wetStone, family: "mineral", label: "Wet stone" },
  { match: /(graphite|grafit|pencil|lead|petrol|kerosene)/i, src: graphite, family: "mineral", label: "Graphite" },
  { match: /(mushroom|svamp|truffle|tryffel)/i, src: mushroom, family: "earth", label: "Mushroom" },
  { match: /(herb|ört|mint|eucalyptus|thyme|timjan|sage|salvia|rosemary|rosmarin|basil|basilika|dried)/i, src: driedHerbs, family: "herb", label: "Herbs" },
  { match: /(honey|honung)/i, src: honey, family: "sweet", label: "Honey" },
  { match: /(almond|mandel|nut|nöt|hazelnut|hassel)/i, src: almond, family: "sweet", label: "Almond" },
  { match: /(smoke|rök|tar|tjära|char)/i, src: smoke, family: "oak", label: "Smoke" },
  { match: /(earth|jord)/i, src: forestFloor, family: "earth", label: "Earth" },
  { match: /(apple|äpple|pear|päron|quince|peach|persika|apricot|aprikos|tropical|pineapple|ananas|mango|passion|melon|grape|druva|fruit)/i, src: plum, family: "fruit", label: "Fruit" },
];

const FAMILY_LABEL: Record<Family, string> = {
  berry: "Berry", fruit: "Fruit", citrus: "Citrus", floral: "Floral",
  spice: "Spice", sweet: "Sweet", oak: "Oak", earth: "Earth",
  mineral: "Mineral", herb: "Herb", other: "Aromatic",
};

export function aromaMeta(name: string) {
  const hit = MAP.find((m) => m.match.test(name));
  return {
    src: hit?.src ?? blackberry,
    family: hit?.family ?? ("other" as Family),
    familyLabel: FAMILY_LABEL[hit?.family ?? "other"],
  };
}

export function aromaFamilyLabel(name: string) {
  return aromaMeta(name).familyLabel;
}

export function AromaIcon({ name, className, size = 44 }: { name: string; className?: string; size?: number }) {
  const { src } = aromaMeta(name);
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full object-cover select-none", className)}
      draggable={false}
    />
  );
}
