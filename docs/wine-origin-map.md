# Wine origin map

The cellar overview uses Natural Earth 1:110m country and land geometry from
`world-atlas` 2.0.2 (Natural Earth 4.1.0, ISC distribution). D3's Natural Earth
projection is shared by outlines, borders and wine markers. Geometry is bundled
locally: no tile service, API key or third-party tracking request is required.
Natural Earth's map data is public domain and does not require attribution in
the app interface. Source references are retained in this document instead.

Region coordinates remain approximate reference locations, not vineyard locations.
Known, compatible regions take precedence over country centroids. A conflicting
region does not override a recorded country on the map. Country-only matches use
approximate centroids. Unknown locations are counted separately. Bottles at an
identical coordinate are aggregated without discarding their origin labels.

Automated coverage checks appellations, country matching, aggregation, unknown
locations, empty states and detailed geometry. Static rendering was inspected.
The approved compact style uses deep burgundy land, muted gold outlines and a
near-black background, without the earlier green palette or graticule. Antarctica
is excluded to prioritize wine-producing latitudes. The map is 145px high on
mobile and 185px on desktop. Its selected country is controlled by the table.
The earlier donut chart and duplicate map legend have been removed.

The country table groups common English/Swedish country names and ISO codes,
counts bottles, and expands into subordinate region rows. Common unambiguous
region references provide display-only country inference when country is missing;
recorded countries take precedence. Unrecognized and missing origins remain
visible. No stored wine metadata is rewritten. Country percentage rounding uses
largest remainders so all displayed shares, including unknowns, total 100%.

Browser checks of the real component with synthetic fixture data passed at
320px, 390px and 1440px: no page overflow, expected map heights, country selection,
region expansion/collapse, keyboard activation, and long names. This frontend
change has not been published to the live
Lovable app yet. No database changes are required.

Sources: https://github.com/topojson/world-atlas and https://www.naturalearthdata.com/
Terms: https://www.naturalearthdata.com/about/terms-of-use/
