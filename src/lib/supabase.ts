import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — use this in Client Components and hooks.
// createBrowserClient returns the same instance on repeat calls (singleton).
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
