/**
 * Mappar aromnoter till en passande emoji-ikon.
 * Returnerar { icon, label } för visning som rund "chip" med ikon ovanför.
 */
const AROMA_MAP: { match: RegExp; icon: string }[] = [
  { match: /(körsbär|cherry|hallon|jordgubb|berry|bär|plommon|björnbär)/i, icon: "🍒" },
  { match: /(äpple|apple|päron|pear)/i, icon: "🍎" },
  { match: /(citrus|citron|lime|grapefrukt)/i, icon: "🍋" },
  { match: /(persika|aprikos|peach)/i, icon: "🍑" },
  { match: /(banan|tropisk|ananas|mango|passion)/i, icon: "🍍" },
  { match: /(ek|oak|fat|cask)/i, icon: "🛢️" },
  { match: /(vanilj|vanilla)/i, icon: "🌼" },
  { match: /(ceder|cedar|tobak|läder|leather)/i, icon: "🪵" },
  { match: /(jord|earth|svamp|mineral|sten)/i, icon: "🌿" },
  { match: /(blomma|ros|viol|jasmin|floral)/i, icon: "🌸" },
  { match: /(peppar|pepper|krydd|kanel|kryddnejlika|spice|anis)/i, icon: "🌶️" },
  { match: /(choklad|kakao|kaffe|mocka)/i, icon: "🍫" },
  { match: /(honung|smör|brödsmula|jäst|bröd)/i, icon: "🍯" },
  { match: /(rök|smoke|tjära)/i, icon: "💨" },
  { match: /(ört|herb|mint|eukalyptus)/i, icon: "🌱" },
];

export function aromaIcon(name: string): string {
  for (const { match, icon } of AROMA_MAP) if (match.test(name)) return icon;
  return "🍇";
}

export function AromaChip({ name }: { name: string }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-2xl border border-white/10">
        <span aria-hidden>{aromaIcon(name)}</span>
      </div>
      <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted-foreground">
        {name}
      </span>
    </div>
  );
}
