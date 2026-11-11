import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DemoProvider } from "@/lib/nox/demo/context";

// ★0190 フラグ true 便 K-4（2026-10-30）: 端末（キオスク）配下は別 manifest＝ホーム画面に「NOX 端末」として追加（start_url /kiosk・ショートカット＝出退勤／レジ）。
//   本店側（/manifest.json・start_url /）とは別のアプリとして並べられる＝端末のタブレットで本店の入口を出さない。
export const metadata: Metadata = { manifest: "/manifest-kiosk.json" };

// ★夜便レーン 1（2026-11-11）: デモ org の端末だけ名前の下にデモの PIN を出す＝デモかどうかをここで 1 回判定して配る。
//   端末の利用者は RLS で orgs を読めない（auth_org_id が null）＝server で「この端末の org は is_demo か」だけを admin で読む（返すのは真偽だけ・本番の店は false）。
async function kioskIsDemo(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const admin = createAdminClient();
    const { data: dev } = await admin.from("kiosk_devices").select("org_id").eq("auth_user_id", user.id).eq("is_active", true).maybeSingle();
    if (!dev?.org_id) return false;
    const { data: org } = await admin.from("orgs").select("is_demo").eq("id", dev.org_id as string).maybeSingle();
    return org?.is_demo === true;
  } catch { return false; }
}

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  return <DemoProvider isDemo={await kioskIsDemo()}>{children}</DemoProvider>;
}
