import { createBrowserClient } from "@supabase/ssr";

// ブラウザ（Client Component）用の Supabase クライアント。
// publishable キーのみ使用（ブラウザに出てよい）。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
