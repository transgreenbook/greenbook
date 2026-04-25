import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import POIForm from "@/components/admin/POIForm";

export default async function EditPOIPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .rpc("get_poi_for_edit", { poi_id: parseInt(id) });

  const poi = data?.[0];
  if (!poi) notFound();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Edit POI</h1>
      <POIForm
        initialData={{
          id:               poi.id,
          title:            poi.title,
          description:      poi.description ?? "",
          long_description: poi.long_description ?? "",
          lat:              String(poi.lat),
          lng:              String(poi.lng),
          category_id:      poi.category_id ? String(poi.category_id) : "",
          is_verified:      poi.is_verified,
          is_visible:       poi.is_visible ?? true,
          tags:             poi.tags ? poi.tags.join(", ") : "",
          street_address:   poi.street_address ?? "",
          website_url:      poi.website_url ?? "",
          legislation_url:  poi.legislation_url ?? "",
          phone:            poi.phone ?? "",
          icon:             poi.icon ?? "",
          color:            poi.color ?? "",
          effect_scope:     poi.effect_scope ?? "point",
          prominence:       poi.prominence ?? "local",
          severity:         poi.severity != null ? String(poi.severity) : "",
          visible_start:    poi.visible_start ?? "",
          visible_end:      poi.visible_end ?? "",
          source_date:      poi.source_date ?? "",
          source:           poi.source ?? "",
          source_id:        poi.source_id ?? "",
          review_after:     poi.review_after ?? "",
          review_note:      poi.review_note ?? "",
        }}
      />
    </div>
  );
}
