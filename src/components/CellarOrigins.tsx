import { Fragment, useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { countryDisplayName, summarizeWineOrigins, type WineOrigin } from "@/lib/wineOrigins";
import { WorldMap } from "./WorldMap";

export function CellarOrigins({ points }: { points: WineOrigin[] }) {
  const { t, lang } = useI18n();
  const groups = summarizeWineOrigins(points);
  const [expanded, setExpanded] = useState<string | null>(() => groups[0]?.key ?? null);
  const selected = groups.find((group) => group.key === expanded);
  const id = useId();
  const bottles = groups.reduce((sum, group) => sum + group.count, 0);
  const countries = groups.filter((group) => group.name).length;
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-base text-cream">{t("origins.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {bottles} {t(bottles === 1 ? "map.bottle" : "map.bottles")} · {countries}{" "}
          {t(countries === 1 ? "origins.countrySingular" : "origins.countries")}
        </p>
      </div>
      <WorldMap
        points={groups.flatMap((group) => group.points)}
        selectedCountry={selected?.key ?? null}
      />
      <table className="mt-2 w-full table-fixed border-collapse text-base">
        <caption className="sr-only">{t("origins.title")}</caption>
        <colgroup>
          <col />
          <col className="w-16" />
          <col className="w-16" />
        </colgroup>
        <thead>
          <tr className="border-b border-gold/30 text-sm text-muted-foreground">
            <th scope="col" className="pb-2 text-left font-normal">
              {t("origins.country")}
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              {t("overview.bottles")}
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              {t("origins.share")}
            </th>
          </tr>
        </thead>
        {groups.map((group, index) => {
          const open = group.key === selected?.key;
          const label = countryDisplayName(group, lang, t("origins.unknownCountry"));
          const detailsId = `${id}-regions-${index}`;
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <Fragment key={group.key}>
              <tbody className="border-b border-gold/15">
                <tr>
                  <th scope="row" className="text-left font-normal">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={detailsId}
                      onClick={() => setExpanded(open ? null : group.key)}
                      className={`flex min-h-12 w-full items-center gap-2 rounded-sm py-2 text-left focus-visible:outline-2 focus-visible:outline-gold ${open ? "text-gold" : "text-cream"}`}
                    >
                      <Chevron size={16} className="shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">{label}</span>
                    </button>
                  </th>
                  <td className="text-right tabular-nums text-cream">{group.count}</td>
                  <td className="text-right tabular-nums text-cream">{group.pct}%</td>
                </tr>
              </tbody>
              <tbody id={detailsId} hidden={!open} className="border-b border-gold/15">
                {group.regions.map((region) => (
                  <tr key={region.key}>
                    <th
                      scope="row"
                      className="break-words py-2 pl-6 text-left text-sm font-normal text-muted-foreground"
                    >
                      {region.name ?? t("origins.unknownRegion")}
                    </th>
                    <td className="py-2 text-right text-sm tabular-nums text-muted-foreground">
                      {region.count}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </Fragment>
          );
        })}
      </table>
    </section>
  );
}
