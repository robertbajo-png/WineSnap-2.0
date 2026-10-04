export type WineOrigin = { country: string | null; region: string | null; count: number };

const COUNTRIES: [string, string, string[]][] = [
  ["FR", "France", ["frankrike"]],
  ["IT", "Italy", ["italien", "italia"]],
  ["ES", "Spain", ["spanien", "espana"]],
  ["PT", "Portugal", []],
  ["DE", "Germany", ["tyskland", "deutschland"]],
  ["AT", "Austria", ["osterrike"]],
  ["HU", "Hungary", ["ungern"]],
  ["GR", "Greece", ["grekland"]],
  [
    "US",
    "United States of America",
    ["usa", "united states", "california", "oregon", "washington"],
  ],
  ["AR", "Argentina", []],
  ["CL", "Chile", []],
  ["AU", "Australia", ["australien"]],
  ["NZ", "New Zealand", ["nya zeeland"]],
  ["ZA", "South Africa", ["sydafrika"]],
  ["CA", "Canada", ["kanada"]],
  ["CH", "Switzerland", ["schweiz"]],
  ["SI", "Slovenia", ["slovenien"]],
  ["HR", "Croatia", ["kroatien"]],
  ["RO", "Romania", ["rumanien"]],
  ["BG", "Bulgaria", ["bulgarien"]],
  ["GE", "Georgia", ["georgien"]],
  ["LB", "Lebanon", ["libanon"]],
  ["IL", "Israel", []],
  ["BR", "Brazil", ["brasilien"]],
  ["UY", "Uruguay", []],
  ["CN", "China", ["kina"]],
  ["JP", "Japan", []],
  ["MX", "Mexico", ["mexiko"]],
  ["SE", "Sweden", ["sverige"]],
  ["GB", "United Kingdom", ["uk", "england", "storbritannien"]],
  ["TR", "Turkey", ["turkiet", "turkiye"]],
  ["MA", "Morocco", ["marocko"]],
];
const REGION_COUNTRIES: Record<string, string> = {
  bordeaux: "FR",
  burgundy: "FR",
  bourgogne: "FR",
  champagne: "FR",
  rhone: "FR",
  loire: "FR",
  alsace: "FR",
  provence: "FR",
  languedoc: "FR",
  tuscany: "IT",
  toscana: "IT",
  piedmont: "IT",
  piemonte: "IT",
  veneto: "IT",
  sicily: "IT",
  sicilia: "IT",
  rioja: "ES",
  "ribera del duero": "ES",
  ribera: "ES",
  priorat: "ES",
  douro: "PT",
  porto: "PT",
  mosel: "DE",
  mendoza: "AR",
  "maipo valley": "CL",
  "colchagua valley": "CL",
  "napa valley": "US",
  napa: "US",
  sonoma: "US",
  "willamette valley": "US",
  barossa: "AU",
  "hunter valley": "AU",
  marlborough: "NZ",
  "central otago": "NZ",
  stellenbosch: "ZA",
  tokaji: "HU",
  tokaj: "HU",
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const regionMatchers = Object.keys(REGION_COUNTRIES)
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, pattern: new RegExp(`(^|[^a-z])${name}($|[^a-z])`) }));
const missing = (value: string | null) =>
  !value?.trim() || ["unknown", "okand", "n/a"].includes(normalize(value));

function countryInfo(value: string) {
  const key = normalize(value);
  return COUNTRIES.find(([code, name, aliases]) =>
    [code, name, ...aliases].some((alias) => normalize(alias) === key),
  );
}

export type OriginGroup = {
  key: string;
  code: string | null;
  name: string | null;
  count: number;
  pct: number;
  regions: { key: string; name: string | null; count: number }[];
  points: (WineOrigin & { countryKey: string })[];
};

export function summarizeWineOrigins(points: WineOrigin[]): OriginGroup[] {
  const groups = new Map<string, OriginGroup>();
  for (const point of points) {
    if (!Number.isFinite(point.count) || point.count <= 0) continue;
    let info = missing(point.country) ? undefined : countryInfo(point.country!);
    const regionCountry = point.region ? countryInfo(point.region) : undefined;
    const regionMatch = point.region
      ? regionMatchers.find(({ pattern }) => pattern.test(normalize(point.region!)))?.name
      : undefined;
    if (missing(point.country)) {
      info = regionCountry;
      if (!info && regionMatch) info = countryInfo(REGION_COUNTRIES[regionMatch]);
    }
    const name = info?.[1] ?? (missing(point.country) ? null : point.country!.trim());
    const key = name ? normalize(name) : "unknown";
    let group = groups.get(key);
    if (!group) {
      group = { key, code: info?.[0] ?? null, name, count: 0, pct: 0, regions: [], points: [] };
      groups.set(key, group);
    }
    group.count += point.count;
    const countryAsRegion =
      regionCountry &&
      !["california", "oregon", "washington", "england"].includes(normalize(point.region!));
    const regionName = missing(point.region) || countryAsRegion ? null : point.region!.trim();
    const regionKey = regionName ? normalize(regionName) : "unknown";
    const existing = group.regions.find((region) => region.key === regionKey);
    if (existing) existing.count += point.count;
    else group.regions.push({ key: regionKey, name: regionName, count: point.count });
    const compatibleRegion = info && (!regionMatch || REGION_COUNTRIES[regionMatch] === info[0]);
    group.points.push({
      country: name,
      region: compatibleRegion ? regionName : null,
      count: point.count,
      countryKey: key,
    });
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
  const total = sorted.reduce((sum, group) => sum + group.count, 0);
  for (const group of sorted) {
    group.pct = Math.floor((group.count / total) * 100);
    group.regions.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }
  // Distribute rounding remainders so the displayed country shares total 100%.
  const remainder = 100 - sorted.reduce((sum, group) => sum + group.pct, 0);
  const fractions = [...sorted].sort(
    (a, b) => (b.count / total) * 100 - b.pct - ((a.count / total) * 100 - a.pct),
  );
  for (let i = 0; i < remainder && i < fractions.length; i++) fractions[i].pct++;
  return sorted;
}

export function countryDisplayName(group: OriginGroup, lang: string, unknown: string) {
  return group.code
    ? (new Intl.DisplayNames([lang], { type: "region" }).of(group.code) ?? group.name ?? unknown)
    : (group.name ?? unknown);
}
