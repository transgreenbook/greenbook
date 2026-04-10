"use client";

export default function AboutPanel() {
  return (
    <div className="absolute top-0 right-0 h-full w-96 max-w-full bg-white shadow-lg z-10 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-200 shrink-0">
        <h2 className="font-semibold text-gray-900 text-lg">About TransSafeTravels</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-gray-700 leading-relaxed">
        <p>
          TransSafeTravels is a community resource for transgender and gender-nonconforming
          travelers navigating the United States. We map laws, policies, healthcare providers,
          safe spaces, and points of concern so you can plan your journey with confidence.
        </p>
        <p>
          Information is crowd-sourced and verified by community members. Laws and policies
          change frequently — always confirm details before traveling.
        </p>
        <div className="pt-2 space-y-1">
          <p className="font-medium text-gray-800">Contact</p>
          <p className="text-gray-500">
            Questions, corrections, or contributions?{" "}
            <a
              href="mailto:transsafetravels@gmail.com"
              className="text-blue-600 hover:underline"
            >
              transsafetravels@gmail.com
            </a>
          </p>
        </div>
        <div className="pt-2 text-xs text-gray-400">
          <p>Data is provided for informational purposes only and does not constitute legal advice.</p>
        </div>
      </div>
    </div>
  );
}
