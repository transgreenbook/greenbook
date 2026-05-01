"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/admin/pois", label: "POIs" },
  { href: "/admin/categories", label: "POI Categories" },
  { href: "/admin/incidents", label: "Incidents" },
  { href: "/admin/incident-types", label: "Incident Types" },
  { href: "/admin/watch-items", label: "Watch Items" },
  { href: "/admin/digest", label: "Digest Log" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="w-44 shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-12 px-4 flex items-center border-b border-gray-200">
        <span className="font-semibold text-gray-800 text-sm">TransSafeTravels Admin</span>
      </div>
      <div className="flex-1 py-3 space-y-0.5 px-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-3 py-2 rounded text-sm font-medium ${
              pathname.startsWith(href)
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded hover:bg-gray-100"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
