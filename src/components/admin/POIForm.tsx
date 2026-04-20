"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category    = { id: number; name: string };
type SubCentroid = { name: string; statefp: string; lat: number; lng: number };
type StateCentroid = { name: string; abbr: string; statefp: string; lat: number; lng: number };

// FIPS code → state abbreviation (stable US mapping)
const FIPS_TO_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY",
  "60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};

type POIFormData = {
  title: string;
  description: string;
  long_description: string;
  lat: string;
  lng: string;
  // Region-picker fields (state / county / city scope)
  state_abbr: string;   // scope = state
  sub_state:  string;   // scope = county | city: which state to filter by
  sub_coords: string;   // JSON {lat,lng,name} of selected county/city
  category_id: string;
  is_verified: boolean;
  tags: string;
  website_url: string;
  legislation_url: string;
  phone: string;
  icon: string;
  color: string;
  effect_scope: string;
  prominence: string;
  severity: string;
  visible_start: string;
  visible_end: string;
};

type Props = {
  initialData?: Partial<POIFormData> & { id?: number };
};

const EMPTY: POIFormData = {
  title: "",
  description: "",
  long_description: "",
  lat: "",
  lng: "",
  state_abbr: "",
  sub_state:  "",
  sub_coords: "",
  category_id: "",
  is_verified: false,
  tags: "",
  website_url: "",
  legislation_url: "",
  phone: "",
  icon: "",
  color: "",
  effect_scope: "point",
  prominence: "local",
  severity: "",
  visible_start: "",
  visible_end: "",
};

// Find the array entry whose lat/lng is closest to the given coordinates.
function nearest<T extends { lat: number; lng: number }>(items: T[], lat: number, lng: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = (item.lat - lat) ** 2 + (item.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = item; }
  }
  return best;
}

export default function POIForm({ initialData }: Props) {
  const router = useRouter();
  const [form, setForm]             = useState<POIFormData>({ ...EMPTY, ...initialData });
  const [categories, setCategories] = useState<Category[]>([]);
  const [stateCentroids, setStateCentroids] = useState<StateCentroid[]>([]);
  const [countyCentroids, setCountyCentroids] = useState<SubCentroid[]>([]);
  const [cityCentroids,   setCityCentroids]   = useState<SubCentroid[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  // Stable ref to initialData so closures can read it without stale values.
  const initialDataRef = useRef(initialData);

  // Prevent duplicate fetches across re-renders
  const countyLoadedRef = useRef(false);
  const cityLoadedRef   = useRef(false);

  const scope = form.effect_scope;

  // Filtered sub-region list for current state selection
  const filteredSubs: SubCentroid[] =
    scope === "county" ? countyCentroids.filter((c) => c.statefp === stateToFips(form.sub_state)) :
    scope === "city"   ? cityCentroids.filter((c)   => c.statefp === stateToFips(form.sub_state)) :
    [];

  function stateToFips(abbr: string): string {
    return Object.entries(FIPS_TO_ABBR).find(([, a]) => a === abbr)?.[0] ?? "";
  }

  // Load categories + state centroids once
  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCategories(data ?? []));

    fetch("/state-centroids.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        const centroids: StateCentroid[] = (geojson.features ?? []).map(
          (f: { properties: { NAME: string; STUSPS: string }; geometry: { coordinates: [number, number] } }) => ({
            name:    f.properties.NAME,
            abbr:    f.properties.STUSPS,
            statefp: stateToFips(f.properties.STUSPS),
            lng:     f.geometry.coordinates[0],
            lat:     f.geometry.coordinates[1],
          })
        );
        centroids.sort((a, b) => a.name.localeCompare(b.name));
        setStateCentroids(centroids);

        // Edit mode: pre-select the state whose centroid matches the stored coords.
        const init = initialDataRef.current;
        if (init?.id && init.effect_scope === "state" && init.lat && init.lng) {
          const c = nearest(centroids, parseFloat(String(init.lat)), parseFloat(String(init.lng)));
          if (c) setForm((prev) => ({ ...prev, state_abbr: c.abbr }));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load county/city centroids when that scope is first selected
  useEffect(() => {
    if (scope === "county" && !countyLoadedRef.current) {
      countyLoadedRef.current = true;
      setSubLoading(true);
      fetch("/county-centroids.geojson")
        .then((r) => r.json())
        .then((geojson) => {
          const centroids: SubCentroid[] = (geojson.features ?? []).map(
            (f: { properties: { NAME: string; STATEFP: string }; geometry: { coordinates: [number, number] } }) => ({
              name:    f.properties.NAME,
              statefp: f.properties.STATEFP,
              lng:     f.geometry.coordinates[0],
              lat:     f.geometry.coordinates[1],
            })
          );
          centroids.sort((a, b) => a.name.localeCompare(b.name));
          setCountyCentroids(centroids);

          // Edit mode: pre-select state + county from stored coords.
          const init = initialDataRef.current;
          if (init?.id && init.effect_scope === "county" && init.lat && init.lng) {
            const c = nearest(centroids, parseFloat(String(init.lat)), parseFloat(String(init.lng)));
            if (c) {
              const abbr = FIPS_TO_ABBR[c.statefp] ?? "";
              setForm((prev) => ({
                ...prev,
                sub_state:  abbr,
                sub_coords: JSON.stringify({ lat: c.lat, lng: c.lng, name: c.name }),
              }));
            }
          }
        })
        .finally(() => setSubLoading(false));
    }

    if (scope === "city" && !cityLoadedRef.current) {
      cityLoadedRef.current = true;
      setSubLoading(true);
      fetch("/city-centroids.geojson")
        .then((r) => r.json())
        .then((geojson) => {
          const centroids: SubCentroid[] = (geojson.features ?? []).map(
            (f: { properties: { NAME: string; STATEFP: string }; geometry: { coordinates: [number, number] } }) => ({
              name:    f.properties.NAME,
              statefp: f.properties.STATEFP,
              lng:     f.geometry.coordinates[0],
              lat:     f.geometry.coordinates[1],
            })
          );
          centroids.sort((a, b) => a.name.localeCompare(b.name));
          setCityCentroids(centroids);

          // Edit mode: pre-select state + city from stored coords.
          const init = initialDataRef.current;
          if (init?.id && init.effect_scope === "city" && init.lat && init.lng) {
            const c = nearest(centroids, parseFloat(String(init.lat)), parseFloat(String(init.lng)));
            if (c) {
              const abbr = FIPS_TO_ABBR[c.statefp] ?? "";
              setForm((prev) => ({
                ...prev,
                sub_state:  abbr,
                sub_coords: JSON.stringify({ lat: c.lat, lng: c.lng, name: c.name }),
              }));
            }
          }
        })
        .finally(() => setSubLoading(false));
    }
  }, [scope]);

  function set<K extends keyof POIFormData>(field: K, value: POIFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleScopeChange(newScope: string) {
    setForm((prev) => {
      // Carry the state selection across state/county/city switches.
      // state_abbr ↔ sub_state are the same concept in different scopes.
      const currentState =
        prev.effect_scope === "state" ? prev.state_abbr : prev.sub_state;

      const isRegionScope = (s: string) =>
        s === "state" || s === "county" || s === "city";

      const keepState = isRegionScope(prev.effect_scope) && isRegionScope(newScope);

      return {
        ...prev,
        effect_scope: newScope,
        lat: "", lng: "",
        state_abbr: keepState && newScope === "state" ? currentState : "",
        sub_state:  keepState && newScope !== "state" ? currentState : "",
        sub_coords: "",
      };
    });
  }

  function handleSubStateChange(abbr: string) {
    setForm((prev) => ({ ...prev, sub_state: abbr, sub_coords: "" }));
  }

  function handleSubSelect(centroid: SubCentroid) {
    setForm((prev) => ({
      ...prev,
      sub_coords: JSON.stringify({ lat: centroid.lat, lng: centroid.lng, name: centroid.name }),
    }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    let lat: number, lng: number;

    if (scope === "state") {
      const c = stateCentroids.find((s) => s.abbr === form.state_abbr);
      if (!c) { setError("Please select a state."); setSaving(false); return; }
      lat = c.lat; lng = c.lng;

    } else if (scope === "county" || scope === "city") {
      if (!form.sub_coords) {
        setError(`Please select a ${scope}.`);
        setSaving(false);
        return;
      }
      const parsed = JSON.parse(form.sub_coords) as { lat: number; lng: number };
      lat = parsed.lat; lng = parsed.lng;

    } else {
      lat = parseFloat(form.lat);
      lng = parseFloat(form.lng);
      if (isNaN(lat) || isNaN(lng)) {
        setError("Latitude and longitude must be valid numbers.");
        setSaving(false);
        return;
      }
    }

    const payload = {
      title:            form.title.trim(),
      description:      form.description.trim() || null,
      long_description: form.long_description.trim() || null,
      geom:             `POINT(${lng} ${lat})`,
      category_id:      form.category_id ? parseInt(form.category_id) : null,
      is_verified:      form.is_verified,
      tags:             form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : null,
      website_url:      form.website_url.trim() || null,
      legislation_url:  form.legislation_url.trim() || null,
      phone:            form.phone.trim() || null,
      icon:         form.icon.trim() || null,
      color:        form.color.trim() || null,
      effect_scope: form.effect_scope || "point",
      prominence:   form.prominence || "local",
      severity:     form.severity !== "" ? parseInt(form.severity) : null,
      visible_start: form.visible_start || null,
      visible_end:   form.visible_end || null,
    };

    let err;
    if (initialData?.id) {
      ({ error: err } = await supabase
        .from("points_of_interest")
        .update(payload)
        .eq("id", initialData.id));
    } else {
      ({ error: err } = await supabase
        .from("points_of_interest")
        .insert(payload));
    }

    if (err) {
      setError(err.message);
      setSaving(false);
    } else {
      router.push("/admin/pois");
      router.refresh();
    }
  }

  const inputCls = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  // Sub-region picker (county or city): state selector → name selector
  function SubRegionPicker({ label }: { label: string }) {
    const selectedName = form.sub_coords
      ? (JSON.parse(form.sub_coords) as { name: string }).name
      : "";

    return (
      <div className="space-y-3">
        <div>
          <label className={labelCls}>State *</label>
          <select
            value={form.sub_state}
            onChange={(e) => handleSubStateChange(e.target.value)}
            required
            className={inputCls}
          >
            <option value="">— select a state —</option>
            {stateCentroids.map((s) => (
              <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{label} *</label>
          {subLoading ? (
            <p className="text-sm text-gray-400">Loading {label.toLowerCase()}s…</p>
          ) : (
            <select
              value={selectedName}
              onChange={(e) => {
                const c = filteredSubs.find((s) => s.name === e.target.value);
                if (c) handleSubSelect(c);
              }}
              disabled={!form.sub_state}
              required
              className={inputCls}
            >
              <option value="">
                {form.sub_state
                  ? `— select a ${label.toLowerCase()} —`
                  : `— select a state first —`}
              </option>
              {filteredSubs.map((s, i) => (
                <option key={i} value={s.name}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Coordinates will be set to the geographic center of the selected {label.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">

      {/* ── Basic info ─────────────────────────────────────────────────── */}
      <div>
        <label className={labelCls}>Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Long description</label>
        <textarea
          value={form.long_description}
          onChange={(e) => set("long_description", e.target.value)}
          rows={4}
          className={inputCls}
        />
      </div>

      {/* ── Classification (Scope first so location picker reacts) ──────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={form.category_id}
            onChange={(e) => set("category_id", e.target.value)}
            className={inputCls}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Scope</label>
          <select
            value={form.effect_scope}
            onChange={(e) => handleScopeChange(e.target.value)}
            className={inputCls}
          >
            <option value="point">Point</option>
            <option value="city">City</option>
            <option value="county">County</option>
            <option value="state">State</option>
          </select>
        </div>
      </div>

      {/* ── Location ───────────────────────────────────────────────────── */}
      {scope === "state" ? (
        <div>
          <label className={labelCls}>State *</label>
          <select
            value={form.state_abbr}
            onChange={(e) => set("state_abbr", e.target.value)}
            required
            className={inputCls}
          >
            <option value="">— select a state —</option>
            {stateCentroids.map((s) => (
              <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Coordinates will be set to the geographic center of the selected state.
          </p>
        </div>
      ) : scope === "county" ? (
        <SubRegionPicker label="County" />
      ) : scope === "city" ? (
        <SubRegionPicker label="City" />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Latitude *</label>
            <input
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => set("lat", e.target.value)}
              required
              placeholder="37.7749"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Longitude *</label>
            <input
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => set("lng", e.target.value)}
              required
              placeholder="-122.4194"
              className={inputCls}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Prominence</label>
          <select
            value={form.prominence}
            onChange={(e) => set("prominence", e.target.value)}
            className={inputCls}
          >
            <option value="neighborhood">Neighborhood</option>
            <option value="local">Local</option>
            <option value="regional">Regional</option>
            <option value="national">National</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Severity{" "}
            <span className="text-gray-400 font-normal">(-10 to +10)</span>
          </label>
          <select
            value={form.severity}
            onChange={(e) => set("severity", e.target.value)}
            className={inputCls}
          >
            <option value="">— none —</option>
            {Array.from({ length: 21 }, (_, i) => i - 10).map((n) => (
              <option key={n} value={n}>
                {n > 0 ? `+${n}` : n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>
          Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="hiking, waterfall, national-park"
          className={inputCls}
        />
      </div>

      {/* ── Contact ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Website URL</label>
          <input
            type="url"
            value={form.website_url}
            onChange={(e) => set("website_url", e.target.value)}
            placeholder="https://example.com"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+1 555-555-5555"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Legislation URL</label>
        <input
          type="url"
          value={form.legislation_url}
          onChange={(e) => set("legislation_url", e.target.value)}
          placeholder="https://legiscan.com/…"
          className={inputCls}
        />
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Icon slug</label>
          <input
            type="text"
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            placeholder="star"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Color override</label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={form.color || "#3b82f6"}
              onChange={(e) => set("color", e.target.value)}
              className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              placeholder="(use category color)"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── Visibility window ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Visible from</label>
          <input
            type="date"
            value={form.visible_start}
            onChange={(e) => set("visible_start", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Visible until</label>
          <input
            type="date"
            value={form.visible_end}
            onChange={(e) => set("visible_end", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_verified"
          checked={form.is_verified}
          onChange={(e) => set("is_verified", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="is_verified" className="text-sm font-medium text-gray-700">
          Verified <span className="text-gray-400 font-normal">(visible on map)</span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : initialData?.id ? "Save Changes" : "Create POI"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/pois")}
          className="text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
