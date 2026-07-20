// Simple equirectangular world map with dots per country/region.
// Not geopolitically exact — a stylized silhouette that reads well at small sizes.

const COUNTRY_COORDS: Record<string, [number, number]> = {
  // [lng, lat] approximate centroids for wine countries
  france: [2.5, 46.5],
  italy: [12.5, 42.8],
  spain: [-3.7, 40.3],
  portugal: [-8, 39.5],
  germany: [10.4, 51.2],
  austria: [14.5, 47.6],
  hungary: [19, 47.1],
  greece: [22, 39],
  usa: [-98, 39],
  "united states": [-98, 39],
  "united states of america": [-98, 39],
  california: [-119.5, 36.5],
  oregon: [-120.5, 44],
  washington: [-120.5, 47.5],
  argentina: [-64, -34],
  chile: [-71, -33],
  australia: [134, -25],
  "new zealand": [172, -41],
  "south africa": [24, -30],
  canada: [-97, 55],
  switzerland: [8.2, 46.8],
  slovenia: [14.8, 46.1],
  croatia: [15.4, 45.1],
  romania: [25, 45.9],
  bulgaria: [25.5, 42.7],
  georgia: [43.5, 42],
  lebanon: [35.9, 33.9],
  israel: [34.9, 31.5],
  brazil: [-52, -12],
  uruguay: [-56, -33],
  china: [104, 35],
  japan: [138, 36],
  mexico: [-102, 23],
  sweden: [16, 62],
  england: [-1.5, 52.5],
  "united kingdom": [-1.5, 52.5],
  uk: [-1.5, 52.5],
  turkey: [35, 39],
  morocco: [-6, 32],
};

// Region hints for common wine regions when country is missing.
const REGION_COORDS: Record<string, [number, number]> = {
  bordeaux: [-0.6, 44.8],
  burgundy: [4.8, 47],
  bourgogne: [4.8, 47],
  champagne: [4, 49],
  rhone: [4.8, 44],
  "rhône": [4.8, 44],
  loire: [0.5, 47.5],
  alsace: [7.5, 48.3],
  provence: [6, 43.5],
  languedoc: [3, 43.5],
  tuscany: [11.3, 43.3],
  toscana: [11.3, 43.3],
  piedmont: [8, 45],
  piemonte: [8, 45],
  veneto: [11.5, 45.4],
  sicily: [14, 37.5],
  sicilia: [14, 37.5],
  rioja: [-2.5, 42.4],
  ribera: [-3.7, 41.6],
  "ribera del duero": [-3.7, 41.6],
  priorat: [0.8, 41.2],
  douro: [-7.5, 41.2],
  porto: [-8.6, 41.2],
  mosel: [7, 50],
  mendoza: [-68.8, -32.9],
  "mendoza, argentina": [-68.8, -32.9],
  "maipo valley": [-70.8, -33.7],
  "colchagua valley": [-71.2, -34.6],
  napa: [-122.3, 38.5],
  "napa valley": [-122.3, 38.5],
  sonoma: [-122.9, 38.4],
  "willamette valley": [-123.1, 45.2],
  barossa: [138.9, -34.5],
  "hunter valley": [151.3, -32.7],
  marlborough: [173.9, -41.5],
  "central otago": [169.2, -45.2],
  stellenbosch: [18.9, -33.9],
};

function lookup(region?: string | null, country?: string | null): [number, number] | null {
  const r = region?.toLowerCase().trim();
  const c = country?.toLowerCase().trim();
  if (r) {
    for (const key of Object.keys(REGION_COORDS)) if (r.includes(key)) return REGION_COORDS[key];
  }
  if (c) {
    for (const key of Object.keys(COUNTRY_COORDS)) if (c.includes(key)) return COUNTRY_COORDS[key];
  }
  if (r) {
    for (const key of Object.keys(COUNTRY_COORDS)) if (r.includes(key)) return COUNTRY_COORDS[key];
  }
  return null;
}

// Very simplified world silhouette as an SVG path (Mercator-ish).
// Coordinate space: viewBox 0 0 1000 500. Longitude -180..180 → 0..1000, Latitude 90..-90 → 0..500.
const WORLD_PATH =
  // North America
  "M120 90 L260 80 L305 110 L320 155 L280 180 L260 220 L215 245 L165 235 L145 200 L105 175 L85 135 Z " +
  // Central America
  "M225 245 L260 260 L275 285 L245 285 Z " +
  // South America
  "M270 290 L330 285 L345 335 L340 400 L300 445 L270 420 L260 355 Z " +
  // Greenland
  "M340 55 L385 55 L390 90 L355 100 Z " +
  // Europe
  "M470 100 L560 90 L590 120 L575 155 L535 165 L505 155 L475 135 Z " +
  // Africa
  "M475 195 L580 190 L620 235 L620 305 L580 375 L520 385 L495 340 L470 275 Z " +
  // Middle East / West Asia
  "M595 155 L680 160 L695 200 L650 215 L610 200 Z " +
  // Asia
  "M600 90 L830 85 L890 125 L890 195 L810 220 L730 210 L670 175 L620 155 Z " +
  // India
  "M745 220 L790 220 L790 285 L755 275 Z " +
  // SE Asia
  "M810 225 L865 235 L875 270 L830 275 Z " +
  // Australia
  "M840 340 L920 335 L935 385 L880 395 L845 380 Z " +
  // NZ
  "M955 400 L975 405 L980 425 L955 425 Z";

export type MapPoint = { region: string | null; country: string | null; count: number };

export function WorldMap({ points }: { points: MapPoint[] }) {
  const dots = points
    .map((p) => {
      const coord = lookup(p.region, p.country);
      if (!coord) return null;
      const [lng, lat] = coord;
      const x = ((lng + 180) / 360) * 1000;
      const y = ((90 - lat) / 180) * 500;
      return { x, y, count: p.count, label: p.region || p.country || "" };
    })
    .filter((v): v is { x: number; y: number; count: number; label: string } => !!v);

  const maxCount = Math.max(...dots.map((d) => d.count), 1);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-black/60 to-burgundy/10 p-3">
      <svg viewBox="0 0 1000 500" className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.75 0.15 40)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="oklch(0.75 0.15 40)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={WORLD_PATH} fill="oklch(0.22 0.02 40)" stroke="oklch(0.35 0.03 60)" strokeWidth="0.8" />
        {dots.map((d, i) => {
          const r = 3 + (d.count / maxCount) * 8;
          return (
            <g key={i}>
              <circle cx={d.x} cy={d.y} r={r * 2.2} fill="url(#dotGlow)" />
              <circle cx={d.x} cy={d.y} r={r} fill="oklch(0.72 0.13 75)" stroke="oklch(0.95 0.06 80)" strokeWidth="0.6">
                <title>{`${d.label} — ${d.count}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {dots.length === 0 && (
        <p className="pt-2 text-center text-[11px] text-muted-foreground">No mapped regions yet</p>
      )}
    </div>
  );
}
