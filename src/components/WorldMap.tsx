import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { useT } from "@/i18n";
import { lookup } from "@/lib/wineOriginCoordinates";

const world = atlas as unknown as Topology<{
  countries: GeometryCollection<{ name: string }>;
  land: GeometryCollection;
}>;
const countries = feature(world, world.objects.countries);
// Keep the wine-producing latitudes in view without Antarctica consuming height.
const wineWorld = {
  ...countries,
  features: countries.features.filter((country) => String(country.id) !== "010"),
};
const projection = geoNaturalEarth1().fitExtent(
  [
    [12, 12],
    [988, 438],
  ],
  wineWorld,
);
const path = geoPath(projection);
const landPath = path(wineWorld) ?? "";
const borderPath = path(mesh(world, world.objects.countries, (a, b) => a !== b)) ?? "";

export type MapPoint = {
  region: string | null;
  country: string | null;
  count: number;
  countryKey?: string;
};

export function WorldMap({
  points,
  selectedCountry = null,
}: {
  points: MapPoint[];
  selectedCountry?: string | null;
}) {
  const t = useT();
  const groups = new Map<
    string,
    { x: number; y: number; count: number; labels: Set<string>; countries: Set<string> }
  >();
  let unmapped = 0;
  for (const point of points) {
    if (!Number.isFinite(point.count) || point.count <= 0) continue;
    const coord = lookup(point.region, point.country);
    if (!coord) {
      unmapped += point.count;
      continue;
    }
    const position = projection(coord);
    if (!position) {
      unmapped += point.count;
      continue;
    }
    const key = coord.join(",");
    const label = point.region?.trim() || point.country?.trim() || "";
    const existing = groups.get(key);
    if (existing) {
      existing.count += point.count;
      existing.labels.add(label);
      if (point.countryKey) existing.countries.add(point.countryKey);
    } else
      groups.set(key, {
        x: position[0],
        y: position[1],
        count: point.count,
        labels: new Set([label]),
        countries: new Set(point.countryKey ? [point.countryKey] : []),
      });
  }
  const dots = [...groups.entries()]
    .map(([key, dot]) => [key, { ...dot, label: [...dot.labels].join(", ") }] as const)
    .sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...dots.map(([, d]) => d.count), 1);
  const selectedShape = wineWorld.features.find(
    (country) => String(country.properties?.name).toLowerCase() === selectedCountry,
  );

  return (
    <div className="mt-2 overflow-hidden bg-[#10090b]">
      <svg
        viewBox="0 0 1000 450"
        className="block h-[145px] w-full sm:h-[185px]"
        role="img"
        aria-label={t("map.title")}
      >
        <path d={landPath} fill="#35151c" stroke="#9b7950" strokeWidth="0.85" />
        {selectedShape && (
          <path d={path(selectedShape) ?? ""} fill="#b28c55" stroke="#e9b85e" strokeWidth="1" />
        )}
        <path d={borderPath} fill="none" stroke="#9b7950" strokeOpacity="0.65" strokeWidth="0.65" />
        {dots.map(([key, d]) => {
          const r = 5 + Math.sqrt(d.count / maxCount) * 5;
          return (
            <g key={key} opacity={selectedCountry && !d.countries.has(selectedCountry) ? 0.4 : 1}>
              <circle
                cx={d.x}
                cy={d.y}
                r={r}
                fill={selectedCountry && d.countries.has(selectedCountry) ? "#fff0c0" : "#e9b85e"}
                stroke="#10090b"
                strokeWidth="2"
              >
                <title>{`${d.label}: ${d.count} ${t(d.count === 1 ? "map.bottle" : "map.bottles")}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {dots.length === 0 && <p className="py-2 text-xs text-muted-foreground">{t("map.empty")}</p>}
      {unmapped > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {t("map.unmapped")}: {unmapped} {t("map.bottles")}
        </p>
      )}
    </div>
  );
}
