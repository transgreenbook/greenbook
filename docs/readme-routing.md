# Routing

## Current Implementation

Routing uses the public [Valhalla](https://valhalla.openstreetmap.de/) instance
(no API key required). The routing panel supports:

- Geocoded start and end point inputs (Photon/OSM)
- Map-click waypoint dropping (crosshair cursor in routing mode)
- "Route to here" button in the POI detail panel
- Route line rendered on the map (blue)
- Green/red start/end pins
- POIs within 1 mile of the route highlighted on the map and listed below it
- Clicking a route POI flies to it and opens the detail panel

## Routing API — Production Upgrade Required

The current implementation proxies requests through `/api/route` to the free
`valhalla1.openstreetmap.de` public instance, which has a **~932-mile (1,500 km)
distance limit**. This is not acceptable for a US travel map.

### Options

| Option | Notes |
|--------|-------|
| **Stadia Maps routing API** | Recommended — already using Stadia for tiles, same API key, no distance limit on paid plans. Uses Valhalla under the hood, so `routing.ts` needs minimal changes (just the URL + `api_key` param). |
| **OpenRouteService** | Free tier: 2,000 req/day. Valhalla-compatible response format. |
| **Self-hosted Valhalla** | No per-request cost. Needs ~4–8 GB RAM and ~50 GB disk for the US routing graph. Docker image available; graph build takes several hours. Run on a VPS (DigitalOcean, Hetzner, etc.). |
| **Mapbox Directions API** | Well-supported but proprietary response format — requires rewriting `routing.ts`. |

### Switching to Stadia routing

1. Add `NEXT_PUBLIC_STADIA_API_KEY` to `.env.local` (already needed for tiles).
2. In `src/app/api/route/route.ts`, change the URL to:
   ```
   https://valhalla.stadiamaps.com/route?api_key=YOUR_KEY
   ```
3. No other changes needed — Stadia uses the same Valhalla request/response format.

---

## Drag-to-Modify Route (Not Yet Implemented)

Google Maps-style drag-to-modify is supported by the Valhalla API but requires
custom interaction code in MapLibre. Implementation outline:

1. **Hit-test the route line** — on `mousedown`, call
   `map.queryRenderedFeatures(e.point, { layers: ["route-line"] })` to detect
   a click on the route.

2. **Drag a temporary point** — on `mousemove` while dragging, render a
   temporary circle at the cursor position (add it to the `route-waypoints`
   source with `type: "via"`).

3. **Insert the via-point on `mouseup`** — add the dropped coordinates to the
   waypoint list between the nearest existing waypoints.

4. **Re-route** — call Valhalla with all points using `type: "via"` for
   intermediate stops:
   ```json
   {
     "locations": [
       { "lon": startLng, "lat": startLat, "type": "break" },
       { "lon": viaLng,   "lat": viaLat,   "type": "via"   },
       { "lon": endLng,   "lat": endLat,   "type": "break" }
     ],
     "costing": "auto"
   }
   ```

5. **Allow removing via-points** — right-click or long-press on a via pin to
   remove it and re-route.

### Key files to modify

| File | Change needed |
|------|--------------|
| `src/store/routeStore.ts` | Add `viaPoints: RouteWaypoint[]` array |
| `src/lib/routing.ts` | Accept `viaPoints` and pass them as `type: "via"` locations |
| `src/hooks/useMapClick.ts` | Add mousedown/mousemove/mouseup handlers for route-line drag |
| `src/components/RoutingPanel.tsx` | Show via-point list with remove buttons |
