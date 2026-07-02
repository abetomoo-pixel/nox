import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ログアウト: サーバ側で signOut（sb-* セッション Cookie を破棄）→ /login へ 303。
// Route Handler は Cookie を書けるため、破棄はここで完結する（Server Component では不可）。
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
