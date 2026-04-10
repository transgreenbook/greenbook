"use client";

import { useRouteStore } from "@/store/routeStore";
import { useMapStore } from "@/store/mapStore";

export default function RouteResults() {
  const route = useRouteStore((s) => s.route);
  const isRoutingMode = useRouteStore((s) => s.isRoutingMode);
  const poisAlongRoute = useRouteStore((s) => s.poisAlongRoute);
  const isLoading = useRouteStore((s) => s.isLoading);
  const flyTo = useMapStore((s) => s.flyTo);
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);

  if (!isRoutingMode || (!route && !isLoading)) return null;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white" style={{ height: "200px" }}>
      <div className="h-full overflow-y-auto">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            POIs along route
          </span>
          {poisAlongRoute.length > 0 && (
            <span className="text-xs text-gray-400">{poisAlongRoute.length} found</span>
          )}
        </div>

        {isLoading && (
          <div className="px-4 py-3 text-sm text-gray-400">Searching for POIs along the route…</div>
        )}

        {!isLoading && route && poisAlongRoute.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-400">No POIs found within 1 mile of this route.</div>
        )}

        {!isLoading && poisAlongRoute.length > 0 && (
          <ul>
            {poisAlongRoute.map((poi) => (
              <li key={poi.id}>
                <button
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-start gap-3"
                  onClick={() => {
                    flyTo({ lng: poi.lng, lat: poi.lat, zoom: 14 });
                    setSelectedPOI({
                      id: poi.id,
                      title: poi.title,
                      description: poi.description,
                      long_description: null,
                      category_id: poi.category_id,
                      is_verified: poi.is_verified,
                      tags: poi.tags,
                      color: poi.color,
                      icon: poi.icon ?? null,
                      lng: poi.lng,
                      lat: poi.lat,
                    });
                  }}
                >
                  <span
                    className="mt-1 w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: poi.color ?? "#3b82f6" }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{poi.title}</div>
                    {poi.description && (
                      <div className="text-xs text-gray-400 truncate">{poi.description}</div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
