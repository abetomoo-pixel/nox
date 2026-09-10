import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import { createClient } from "@/lib/supabase/server";
import PayrollBoard from "./payroll-board";
import PayrollList from "./payroll-list";

export const dynamic = "force-dynamic";

// 給与（manager+ のみ）。layout は cast を /mine へ redirect 済み。staff はここで弾く（裁定 B5-5＝route も owner／manager のみ）。
// ★B5（設計書 v1 §3.1／§3.2）: 起点は月次一覧。?store=<id>&period=YYYY-MM が揃っていれば既存の明細画面（PayrollBoard）を
//   その store×period を初期選択にして描く（一覧の「明細へ」＝.nox-link からの遷移・裁定238）。
// 真の防御は payroll_finalize／payroll_reopen／payroll_mark_paid の service_role 限定＋route の manager+／owner 検証（ここは利便のリダイレクト）。
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ store?: string | string[]; period?: string | string[] }> }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role !== "owner" && role !== "manager") redirect("/register");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").order("name");
  const storeList = (stores ?? []) as { id: string; name: string }[];
  const sp = await searchParams;
  const store = typeof sp.store === "string" && storeList.some((s) => s.id === sp.store) ? sp.store : null;
  const period = typeof sp.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period) ? sp.period : null;
  if (store && period) {
    // ★C③-11 → B5-5: 確定解除は owner／manager（staff はこのページに到達しない＝上の redirect）
    return <PayrollBoard stores={storeList} isOwner={role === "owner"} canReopen={role === "owner" || role === "manager"} initialStoreId={store} initialPeriod={period} />;
  }
  return <PayrollList stores={storeList} isOwner={role === "owner"} />;
}
