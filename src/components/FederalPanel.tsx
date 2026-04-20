"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useAppStore } from "@/store/appStore";
import { useMobileSheet } from "@/hooks/useMobileSheet";

type WatchItem = {
  id: number;
  item_type: string;
  title: string;
  description: string | null;
  status: string;
  next_check_date: string | null;
  source_url: string | null;
  severity_impact: string | null;
  updated_at: string;
};

const STATUS_ORDER = ["monitoring", "enacted", "overturned", "failed", "resolved", "paused"];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  monitoring: { label: "Monitoring",  color: "bg-yellow-100 text-yellow-800" },
  enacted:    { label: "Enacted",     color: "bg-red-100 text-red-800" },
  overturned: { label: "Overturned",  color: "bg-green-100 text-green-800" },
  failed:     { label: "Failed",      color: "bg-gray-100 text-gray-600" },
  resolved:   { label: "Resolved",    color: "bg-blue-100 text-blue-800" },
  paused:     { label: "Paused",      color: "bg-gray-100 text-gray-500" },
};

const TYPE_LABELS: Record<string, string> = {
  bill:            "Bill",
  lawsuit:         "Lawsuit",
  executive_order: "Executive Order",
  regulation:      "Regulation",
  policy:          "Policy",
  event:           "Event",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function WatchItemCard({ item }: { item: WatchItem }) {
  const status = STATUS_LABELS[item.status] ?? { label: item.status, color: "bg-gray-100 text-gray-600" };
  const typeLabel = TYPE_LABELS[item.item_type] ?? item.item_type;

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-900 text-sm leading-snug">{item.title}</span>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{typeLabel}</span>
        {item.next_check_date && (
          <span className="text-amber-700">Check by {formatDate(item.next_check_date)}</span>
        )}
      </div>

      {item.description && (
        <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
      )}

      {item.severity_impact && (
        <p className="text-xs text-orange-700 italic">{item.severity_impact}</p>
      )}

      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Source →
        </a>
      )}
    </div>
  );
}

export default function FederalPanel() {
  const panelWidthValue = useAppStore((s) => s.panelWidths.federal);
  const setPanelWidth   = useAppStore((s) => s.setPanelWidth);
  const { width: panelWidth, onDragHandleMouseDown } = useResizablePanel({
    value: panelWidthValue,
    onChange: (w) => setPanelWidth("federal", w),
  });

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 56 });

  const [items, setItems]     = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("watch_items")
      .select("id, item_type, title, description, status, next_check_date, source_url, severity_impact, updated_at")
      .eq("jurisdiction_type", "federal")
      .order("status")
      .order("updated_at", { ascending: false })
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) { setError(err.message); return; }
        setItems(data ?? []);
      });
  }, []);

  // Group by status in defined order
  const grouped = STATUS_ORDER.reduce<Record<string, WatchItem[]>>((acc, s) => {
    const group = items.filter((i) => i.status === s);
    if (group.length) acc[s] = group;
    return acc;
  }, {});

  const content = (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="font-semibold text-gray-800 text-sm">Federal Tracker</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Bills, lawsuits, and executive orders at the federal level
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-gray-50">
        {loading && (
          <div className="text-sm text-gray-400 text-center pt-8">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-600 text-center pt-8">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="text-sm text-gray-400 text-center pt-8">
            No federal items being tracked yet.
            <br />
            <span className="text-xs">The daily news digest will populate this list automatically.</span>
          </div>
        )}
        {Object.entries(grouped).map(([status, group]) => {
          const statusMeta = STATUS_LABELS[status] ?? { label: status, color: "" };
          return (
            <div key={status}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {statusMeta.label} ({group.length})
              </div>
              <div className="space-y-2">
                {group.map((item) => (
                  <WatchItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="absolute top-0 right-0 h-full bg-white shadow-lg border-l border-gray-200 z-20 flex-col hidden md:flex"
        style={{ width: panelWidth }}
      >
        <div
          className="absolute top-0 left-0 h-full w-1 cursor-col-resize hover:bg-blue-300 active:bg-blue-400 z-10"
          onMouseDown={onDragHandleMouseDown}
        />
        {content}
      </div>

      {/* Mobile bottom sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-2xl z-20 flex flex-col md:hidden overflow-hidden"
        style={mobileSheetStyle}
      >
        <div
          className={`shrink-0 flex items-center justify-between px-4 border-b border-gray-200 ${mobileExpanded ? "py-3" : "py-0 h-14"}`}
          {...mobileHandleProps}
          onClick={mobileDragging ? undefined : toggleMobile}
        >
          <div>
            <div className="font-semibold text-gray-800 text-sm">Federal Tracker</div>
            {!mobileExpanded && (
              <div className="text-xs text-gray-400">{items.length} items</div>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${mobileExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {mobileExpanded && <div className="flex-1 overflow-y-auto">{content}</div>}
      </div>
    </>
  );
}
