import { useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { useT } from "@/i18n";
import { lookup } from "@/lib/wineOriginCoordinates";

const world = atlas as unknown as Topology<{
  countries: GeometryCollection;
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

export type MapPoint = { region: string | null; country: string | null; count: number };

export function WorldMap({ points }: { points: MapPoint[] }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const groups = new Map<string, { x: number; y: number; count: number; labels: Set<string> }>();
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
    } else
      groups.set(key, {
        x: position[0],
        y: position[1],
        count: point.count,
        labels: new Set([label]),
      });
  }
  const dots = [...groups.entries()]
    .map(([key, dot]) => [key, { ...dot, label: [...dot.labels].join(", ") }] as const)
    .sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(...dots.map(([, d]) => d.count), 1);

  return (
    <div className="mt-2 overflow-hidden bg-[#10090b]">
      <svg
        viewBox="0 0 1000 450"
        className="block h-[160px] w-full sm:h-[200px]"
        role="img"
        aria-label={t("map.title")}
      >
        <path d={landPath} fill="#35151c" stroke="#9b7950" strokeWidth="0.85" />
        <path d={borderPath} fill="none" stroke="#9b7950" strokeOpacity="0.65" strokeWidth="0.65" />
        {dots.map(([key, d]) => {
          const r = 5 + Math.sqrt(d.count / maxCount) * 5;
          return (
            <g key={key} opacity={selected && selected !== key ? 0.4 : 1}>
              <circle
                cx={d.x}
                cy={d.y}
                r={r}
                fill={selected === key ? "#fff0c0" : "#e9b85e"}
                stroke="#10090b"
                strokeWidth="2"
              >
                <title>{`${d.label}: ${d.count} ${t(d.count === 1 ? "map.bottle" : "map.bottles")}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="border-t border-gold/15">
        <ul
          aria-label={t("map.title")}
          className="flex overflow-x-auto divide-x divide-gold/20 py-1"
        >
          {dots.map(([key, d]) => (
            <li key={key} className="max-w-full shrink-0 px-3 first:pl-0">
              <button
                type="button"
                aria-pressed={selected === key}
                onClick={() => setSelected(selected === key ? null : key)}
                className="flex min-h-11 max-w-full items-center gap-2 rounded px-1 text-xs text-cream aria-pressed:text-gold focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-gold"
              >
                <span className="min-w-0 break-words">{d.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-gold">{d.count}</span>
              </button>
            </li>
          ))}
        </ul>
        {dots.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">{t("map.empty")}</p>
        )}
        {unmapped > 0 && (
          <p className="py-2 text-xs text-muted-foreground">
            {t("map.unmapped")}: {unmapped} {t("map.bottles")}
          </p>
        )}
        <a
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-block py-1 text-[10px] text-muted-foreground underline underline-offset-2"
        >
          Natural Earth
        </a>
      </div>
    </div>
  );
}
