import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sv";

const dict = {
  en: {
    "nav.home": "Home",
    "nav.forYou": "For You",
    "nav.cellar": "Cellar",
    "nav.profile": "Profile",
    "nav.scan": "Scan",

    "home.brand": "WineSnap",
    "home.title": "Build your cellar",
    "home.subtitle": "Scan labels, discover wines,\nand collect what you love.",
    "home.feat.scan.title": "Scan & Discover",
    "home.feat.scan.desc": "Identify wines in seconds",
    "home.feat.taste.title": "Taste & Learn",
    "home.feat.taste.desc": "Explore flavors, pairings, and more",
    "home.feat.collect.title": "Collect & Grow",
    "home.feat.collect.desc": "Track your bottles and cellar value",
    "home.cta.start": "Start Scanning",
    "home.cta.later": "I'll set this up later",

    "profile.title": "Profile",
    "profile.memberSince": "Member since",
    "profile.bottles": "Bottles",
    "profile.tasted": "Tasted",
    "profile.avgRating": "Avg. Rating",
    "profile.favorites": "Favorites",
    "profile.edit": "Edit",
    "profile.wineTypes": "Wine Types",
    "profile.tasteProfile": "Taste Profile",
    "profile.regions": "Regions",
    "profile.grapes": "Grape Varieties",
    "profile.notSet": "Not set",
    "profile.recommended": "Recommended For You",
    "profile.recommendedDesc": "Customize how we personalize your recommendations.",
    "profile.personalized": "Personalized Recommendations",
    "profile.personalizedDesc": "Get wines tailored to your taste",
    "profile.newArrivals": "New Arrivals Alerts",
    "profile.newArrivalsDesc": "Be first to know about new releases",
    "profile.priceRange": "Price Range",
    "profile.hideDisliked": "Hide Wines I Dislike",
    "profile.hideDislikedDesc": "Improve results over time",
    "profile.signOut": "Sign out",
    "profile.language": "Language",
    "profile.languageDesc": "Choose your preferred language",

    "tier.connoisseur": "Wine Connoisseur",
    "tier.enthusiast": "Wine Enthusiast",
    "tier.explorer": "Wine Explorer",
    "tier.novice": "Wine Novice",
  },
  sv: {
    "nav.home": "Hem",
    "nav.forYou": "För dig",
    "nav.cellar": "Källare",
    "nav.profile": "Profil",
    "nav.scan": "Skanna",

    "home.brand": "WineSnap",
    "home.title": "Bygg din vinkällare",
    "home.subtitle": "Skanna etiketter, upptäck viner\noch samla det du älskar.",
    "home.feat.scan.title": "Skanna & upptäck",
    "home.feat.scan.desc": "Identifiera viner på sekunder",
    "home.feat.taste.title": "Smaka & lär",
    "home.feat.taste.desc": "Utforska smaker, matparningar med mera",
    "home.feat.collect.title": "Samla & väx",
    "home.feat.collect.desc": "Håll koll på flaskor och källarens värde",
    "home.cta.start": "Börja skanna",
    "home.cta.later": "Jag fixar detta senare",

    "profile.title": "Profil",
    "profile.memberSince": "Medlem sedan",
    "profile.bottles": "Flaskor",
    "profile.tasted": "Provade",
    "profile.avgRating": "Snittbetyg",
    "profile.favorites": "Favoriter",
    "profile.edit": "Redigera",
    "profile.wineTypes": "Vintyper",
    "profile.tasteProfile": "Smakprofil",
    "profile.regions": "Regioner",
    "profile.grapes": "Druvsorter",
    "profile.notSet": "Ej satt",
    "profile.recommended": "Rekommenderat för dig",
    "profile.recommendedDesc": "Anpassa hur vi personaliserar dina rekommendationer.",
    "profile.personalized": "Personliga rekommendationer",
    "profile.personalizedDesc": "Få viner anpassade efter din smak",
    "profile.newArrivals": "Aviseringar om nyheter",
    "profile.newArrivalsDesc": "Var först med att veta om nya släpp",
    "profile.priceRange": "Prisintervall",
    "profile.hideDisliked": "Dölj viner jag ogillar",
    "profile.hideDislikedDesc": "Förbättrar resultaten över tid",
    "profile.signOut": "Logga ut",
    "profile.language": "Språk",
    "profile.languageDesc": "Välj ditt föredragna språk",

    "tier.connoisseur": "Vinkännare",
    "tier.enthusiast": "Vinentusiast",
    "tier.explorer": "Vinutforskare",
    "tier.novice": "Vinnybörjare",
  },
} as const;

export type TKey = keyof typeof dict.en;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = (typeof window !== "undefined" ? localStorage.getItem("lang") : null) as Lang | null;
    if (stored === "en" || stored === "sv") {
      setLangState(stored);
    } else if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("sv")) {
      setLangState("sv");
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch {}
  };

  const t = (k: TKey) => (dict[lang] as Record<string, string>)[k] ?? (dict.en as Record<string, string>)[k] ?? k;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback so components don't crash if provider is missing
    return { lang: "en" as Lang, setLang: () => {}, t: ((k: TKey) => (dict.en as Record<string, string>)[k] ?? k) };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
