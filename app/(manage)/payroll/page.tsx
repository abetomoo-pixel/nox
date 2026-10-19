import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { createClient } from "@/lib/supabase/server";
import PayrollBoard from "./payroll-board";
import PayrollList from "./payroll-list";
import Link from "next/link";
import StaffWorkPanel from "../staff/staff-work-panel"; // ★便 P174 T-7（356 追補1）: 給与画面のスタッフ側＝/staff の勤怠・報酬と同じ部品
import * as t from "@/lib/nox/ui/theme";

// ★便 P174 T-7（356 追補1）: 給与画面のキャスト／スタッフ切替（?who=staff・既定＝キャスト＝従来どおり）
const whoOf = (v: unknown): "cast" | "staff" => (v === "staff" ? "staff" : "cast");
function WhoTabs({ who }: { who: "cast" | "staff" }) {
  return (
    <div role="tablist" aria-label="対象" data-payroll-who={who} style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
      {([["cast", "キャスト", "/payroll"], ["staff", "スタッフ", "/payroll?who=staff"]] as const).map(([k, label, href]) => (
        <Link key={k} href={href} role="tab" aria-selected={who === k}
          style={{ ...(who === k ? t.btnGold : t.btnGhost), ...t.btnSm, minHeight: 44, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>{label}</Link>
      ))}
    </div>
  );
}

export const dynamic = "force-dynamic";

// 給与（manager+ のみ）。layout は cast を /mine へ redirect 済み。staff はここで弾く（裁定 B5-5＝route も owner／manager のみ）。
// ★B5（設計書 v1 §3.1／§3.2）: 起点は月次一覧。?store=<id>&period=YYYY-MM が揃っていれば既存の明細画面（PayrollBoard）を
//   その store×period を初期選択にして描く（一覧の「明細へ」＝.nox-link からの遷移・裁定238）。
// 真の防御は payroll_finalize／payroll_reopen／payroll_mark_paid の service_role 限定＋route の manager+／owner 検証（ここは利便のリダイレクト）。
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ store?: string | string[]; period?: string | string[]; who?: string | string[] }> }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner" && role !== "manager") redirect("/register");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const storeList = (stores ?? []) as { id: string; name: string }[];
  const sp = await searchParams;
  const who = whoOf(sp.who);
  if (who === "staff") return (<><WhoTabs who="staff" /><StaffWorkPanel scope="store" stores={storeList} /></>);
  const store = typeof sp.store === "string" && storeList.some((s) => s.id === sp.store) ? sp.store : null;
  const period = typeof sp.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period) ? sp.period : null;
  if (store && period) {
    // ★C③-11 → B5-5: 確定解除は owner／manager（staff はこのページに到達しない＝上の redirect）
    return <PayrollBoard stores={storeList} isOwner={role === "owner"} canReopen={role === "owner" || role === "manager"} initialStoreId={store} initialPeriod={period} />;
  }
  return (<><WhoTabs who="cast" /><PayrollList stores={storeList} isOwner={role === "owner"} /></>);
}
