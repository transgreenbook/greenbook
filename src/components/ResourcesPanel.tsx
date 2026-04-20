"use client";

import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useAppStore } from "@/store/appStore";
import { useMobileSheet } from "@/hooks/useMobileSheet";

type Resource = {
  name: string;
  url: string;
  description: string;
};

type Section = {
  title: string;
  description: string;
  resources: Resource[];
};

const SECTIONS: Section[] = [
  {
    title: "Healthcare",
    description: "Find LGBTQ+-affirming providers and gender-affirming care near you.",
    resources: [
      {
        name: "LGBTQ+ Healthcare Directory",
        url: "https://lgbtqhealthcaredirectory.org",
        description: "2,700+ self-registered affirming providers across the US and Canada. Run by GLMA and the Tegan and Sara Foundation.",
      },
      {
        name: "OutCare — OutList",
        url: "https://outcarehealth.org/outlist",
        description: "Searchable directory of LGBTQ+-affirming healthcare providers by specialty and state.",
      },
      {
        name: "Planned Parenthood",
        url: "https://www.plannedparenthood.org/get-care",
        description: "Many Planned Parenthood locations provide gender-affirming hormone therapy. Use their clinic finder to locate services near you.",
      },
      {
        name: "HRC Healthcare Equality Index",
        url: "https://www.hrc.org/resources/healthcare-facilities",
        description: "Search hospitals and healthcare systems rated for LGBTQ+ inclusion by the Human Rights Campaign.",
      },
    ],
  },
  {
    title: "Legal Aid & Advocacy",
    description: "Legal resources and organizations advocating for trans rights.",
    resources: [
      {
        name: "Transgender Law Center",
        url: "https://transgenderlawcenter.org",
        description: "Legal advocacy and resources for transgender people, including know-your-rights guides and legal support.",
      },
      {
        name: "Lambda Legal",
        url: "https://lambdalegal.org",
        description: "Civil rights organization focused on LGBTQ+ legal issues. Offers a help desk for legal questions.",
      },
      {
        name: "ACLU — LGBTQ+ Rights",
        url: "https://www.aclu.org/lgbtq-rights",
        description: "Know-your-rights resources and state-by-state legal information from the ACLU.",
      },
      {
        name: "National Center for Transgender Equality",
        url: "https://transequality.org",
        description: "Policy advocacy and practical guides including ID documents, travel, and healthcare rights.",
      },
    ],
  },
  {
    title: "Crisis & Support",
    description: "Immediate support lines and community resources.",
    resources: [
      {
        name: "Trans Lifeline",
        url: "https://translifeline.org",
        description: "Peer support hotline staffed by trans people. US: 877-565-8860 · Canada: 877-330-6366.",
      },
      {
        name: "The Trevor Project",
        url: "https://www.thetrevorproject.org",
        description: "Crisis intervention and suicide prevention for LGBTQ+ youth. TrevorLifeline: 1-866-488-7386 · Text START to 678-678.",
      },
      {
        name: "Crisis Text Line",
        url: "https://www.crisistextline.org",
        description: "Text HOME to 741741 to reach a crisis counselor. Available 24/7.",
      },
    ],
  },
  {
    title: "Travel Resources",
    description: "Guides and information for planning safer travel.",
    resources: [
      {
        name: "NCTE — Travel Guide",
        url: "https://transequality.org/know-your-rights/travel",
        description: "Know-your-rights guide for trans travelers covering TSA, airports, and ID issues.",
      },
      {
        name: "State Dept — LGBTQ+ Travel",
        url: "https://travel.state.gov/content/travel/en/international-travel/before-you-go/travelers-with-special-considerations/lgbtqi.html",
        description: "US government travel information and advisories for LGBTQ+ travelers going abroad.",
      },
    ],
  },
];

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-1">
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-sm text-blue-600 hover:underline leading-snug block"
      >
        {resource.name} →
      </a>
      <p className="text-xs text-gray-600 leading-relaxed">{resource.description}</p>
    </div>
  );
}

export default function ResourcesPanel() {
  const panelWidthValue = useAppStore((s) => s.panelWidths.resources);
  const setPanelWidth   = useAppStore((s) => s.setPanelWidth);
  const { width: panelWidth, onDragHandleMouseDown, onDragHandleTouchStart } = useResizablePanel({
    value: panelWidthValue,
    onChange: (w) => setPanelWidth("resources", w),
  });

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 56 });

  const content = (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="font-semibold text-gray-800 text-sm">Resources</div>
        <div className="text-xs text-gray-500 mt-0.5">
          External directories and support organizations
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 bg-gray-50">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              {section.title}
            </div>
            <p className="text-xs text-gray-400 mb-2">{section.description}</p>
            <div className="space-y-2">
              {section.resources.map((r) => (
                <ResourceCard key={r.name} resource={r} />
              ))}
            </div>
          </div>
        ))}
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
          onTouchStart={onDragHandleTouchStart}
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
            <div className="font-semibold text-gray-800 text-sm">Resources</div>
            {!mobileExpanded && (
              <div className="text-xs text-gray-400">{SECTIONS.length} categories</div>
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
