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
  rhône: [4.8, 44],
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
  tokaji: [21.4, 48.1],
  tokaj: [21.4, 48.1],
};

export function lookup(region?: string | null, country?: string | null): [number, number] | null {
  const r = region?.toLowerCase().trim();
  const c = country?.toLowerCase().trim();
  if (r) {
    for (const key of Object.keys(REGION_COORDS)) if (r.includes(key)) return REGION_COORDS[key];
  }
  if (c) {
    if (Object.prototype.hasOwnProperty.call(COUNTRY_COORDS, c)) return COUNTRY_COORDS[c];
  }
  if (r) {
    if (Object.prototype.hasOwnProperty.call(COUNTRY_COORDS, r)) return COUNTRY_COORDS[r];
  }
  return null;
}
