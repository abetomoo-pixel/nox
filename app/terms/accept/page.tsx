import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import * as t from "@/lib/nox/ui/theme";
import TermsAcceptForm from "@/components/nox/terms-accept-form";
import { TERMS_VERSION } from "@/lib/nox/terms";

// ★0172（裁定351・便 P172・2026-10-16）: 同意ゲートの着地＝(manage)/layout の外（ループ回避）。未ログイン→/login・デモ org／同意済み→/dashboard。
//   真の防御＝RPC terms_accept（owner のみ）・terms_accepted_version_ok（デモは true）＝ここは案内と導線。
export const dynamic = "force-dynamic";

export default async function TermsAcceptPage() {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  const supabase = await createClient();
  const [{ data: orgRow }, { data: ok }] = await Promise.all([
    supabase.from("orgs").select("name, is_demo").limit(1).maybeSingle(),
    supabase.rpc("terms_accepted_version_ok", { p_version: TERMS_VERSION }),
  ]);
  if (orgRow?.is_demo === true || ok === true) redirect(role === "cast" ? "/mine" : "/dashboard");
  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}><span style={{ ...t.brand, fontSize: 26 }}>NOX</span></div>
      <TermsAcceptForm isOwner={role === "owner"} orgName={(orgRow?.name as string | undefined) ?? "この店舗"} />
    </main>
  );
}
