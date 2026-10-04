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
Browser-based mobile/desktop interaction and overflow checks remain pending
because the Chrome connection timed out. This frontend change has not been
published to the live Lovable app yet. No database changes are required.

Sources: https://github.com/topojson/world-atlas and https://www.naturalearthdata.com/
