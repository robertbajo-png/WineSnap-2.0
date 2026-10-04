# Wine origin map

The cellar overview uses Natural Earth 1:110m country and land geometry from
`world-atlas` 2.0.2 (Natural Earth 4.1.0, ISC distribution). D3's Natural Earth
projection is shared by outlines, borders and wine markers. Geometry is bundled
locally: no tile service, API key or third-party tracking request is required.

Region coordinates remain approximate reference locations, not vineyard locations.
Known regions take precedence over country centroids. Country-only matches use
approximate centroids. Unknown locations are counted separately. Bottles at an
identical coordinate are aggregated without discarding their origin labels.

Automated coverage checks appellations, country matching, aggregation, unknown
locations, empty states and detailed geometry. Static rendering was inspected.
The approved compact style uses deep burgundy land, muted gold outlines and a
near-black background, without the earlier green palette or graticule. Antarctica
is excluded to prioritize wine-producing latitudes. The map is 160px high on
mobile and 200px on desktop; the legend scrolls horizontally instead of wrapping.

Browser checks of the real component with synthetic fixture data passed at
390px and 1440px: no page overflow, expected map heights, and selecting Chile
highlighted its marker. This frontend change has not been published to the live
Lovable app yet. No database changes are required.

Sources: https://github.com/topojson/world-atlas and https://www.naturalearthdata.com/
