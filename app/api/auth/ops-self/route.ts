// ★0209 の便（相談役 11/25 の E3）: パスワードを決める画面（/auth/set-password）が運営者向けの文に分けるための判定（GET）。
//   本人のセッションの後だけ・返すのは本人が有効な運営者かどうかの真偽だけ（ほかの人のことは答えない＝/login・/auth/forgot の応答は変えない）。読むだけ。
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ops: false }, { status: 401 });
  const { data } = await createAdminClient().from("ops_operators").select("auth_user_id").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
  return NextResponse.json({ ops: !!data });
}
