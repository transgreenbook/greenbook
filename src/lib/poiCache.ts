import { openDB } from "idb";
import type { FeatureCollection, Point } from "geojson";
import type { POIProperties } from "@/hooks/usePOIs";

const DB_NAME = "greenbook";
const STORE = "poi-cache";
const VERSION = 1;

function getDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
}

// Key is a stable string derived from rounded bounds + zoom
export function boundsKey(bounds: {
  west: number; south: number; east: number; north: number; zoom?: number;
}): string {
  const z = bounds.zoom != null ? `,z${bounds.zoom}` : '';
  return `${bounds.west},${bounds.south},${bounds.east},${bounds.north}${z}`;
}

export async function cachePOIs(
  key: string,
  data: FeatureCollection<Point, POIProperties>
): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, { data, cachedAt: Date.now() }, key);
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — silently ignore
  }
}

export async function getCachedPOIs(
  key: string,
  maxAgeMs = 1000 * 60 * 60 // 1 hour
): Promise<FeatureCollection<Point, POIProperties> | null> {
  try {
    const db = await getDB();
    const entry = await db.get(STORE, key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}
