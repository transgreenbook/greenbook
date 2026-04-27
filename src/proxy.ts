import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for token rotation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  if (request.nextUrl.pathname.startsWith("/admin") && !user) {
    return NextResponse.redirect(new URL(`${basePath}/login`, request.url));
  }

  if (request.nextUrl.pathname === `${basePath}/login` && user) {
    return NextResponse.redirect(new URL(`${basePath}/admin`, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/demo/admin/:path*", "/demo/login"],
};
