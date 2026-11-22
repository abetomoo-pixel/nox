import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings";
import type { V5Type } from "@/lib/nox/setup/v5";
import SetupWizard from "./setup-wizard";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import SetupWaiting from "./setup-waiting";
import { mig0203On } from "@/lib/nox/rules-0175/flag"; // ★0203 // ★便 SU（M-37 (3)）: manager／staff の案内

export const dynamic = "force-dynamic";

// 初期設定ウィザード v5（★便 OB-2・2026-10-29・9 STEP＝docs/handoff/mock/setup_v5.html が正本）。owner のみ。対象店＝settings_json.setup_done !== true の先頭店（無ければ先頭店＝再実行）。
//   server は現値（料金の丸め・時間課金の方式・領収書の表記・キャスト画面の 8 キー・税設定の現値・冪等ガード用の件数）を読むだけ＝書込は client の計画（lib/nox/setup/v5.ts）。
//   ?step=1〜9（深いリンク）・?type=cabaret（業態が未選択ならその初期値＝suite・actions-center 用）。
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; type?: string; store?: string }> }) {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, settings_json, round_unit, round_mode, time_mode, time_per, business_tax_status, price_display, invoice_status, invoice_reg_no, tax_rounding, card_surcharge_rate")
    .order("name");
  const rows = (stores ?? []) as Array<{ id: string; name: string; settings_json: Record<string, unknown> | null; round_unit: number; round_mode: string; time_mode: string; time_per: string; business_tax_status?: string | null; price_display?: string | null; invoice_status?: string | null; invoice_reg_no?: string | null; tax_rounding?: string | null; card_surcharge_rate?: number | null }>;
  const pick = mig0203On() && sp.store ? rows.find((r) => r.id === sp.store && r.settings_json?.setup_done !== true) : undefined; // ★0203（■2-d）: ?store＝その店（見える店で初期設定の前の店だけ）
  const target = pick ?? rows.find((r) => r.settings_json?.setup_done !== true) ?? rows[0];
  if (!target) redirect("/master");
  if (role !== "owner") return <SetupWaiting storeName={target.name} />; // ★便 SU（M-37 (3)）: manager／staff は /setup で待つ（layout が他画面を /setup へ戻す＝ループしない）
  const [{ count: seats }, { count: products }, { count: plans }, { count: rules }] = await Promise.all([
    supabase.from("seats").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", target.id),
    supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("store_id", target.id),
  ]);
  const sj = target.settings_json ?? {};
  const str = (k: string) => (typeof sj[k] === "string" ? (sj[k] as string) : "");
  const stepN = Number(sp.step ?? ""); const initialStep = Number.isInteger(stepN) && stepN >= 1 && stepN <= 9 ? stepN - 1 : undefined;
  // ★2026-11-21 夜（相談役 18:40 の 3）: 業態に host。業態がすでに入っている初回の店（運営の追加で入る）は STEP 1 をその値で固定＝lockedType（確定で biz_type を書かない）
  // ★0203（■2-b）: 1 店目から写すもの（運営が店を足したときに下書きに入れた {copy}）＝旗 true・初期設定の前の店だけ
  let copy: { from: string; fromName: string; parts: string[] } | null = null;
  if (mig0203On() && sj.setup_done !== true) {
    const { data: dr } = await supabase.from("setup_drafts").select("data").eq("store_id", target.id).maybeSingle();
    const c = ((dr?.data ?? null) as { copy?: { from?: string; parts?: unknown } } | null)?.copy;
    const src = c?.from ? rows.find((r) => r.id === c.from && r.settings_json?.setup_done === true) : undefined;
    if (src && Array.isArray(c?.parts) && c!.parts.length > 0) copy = { from: src.id, fromName: src.name, parts: (c!.parts as unknown[]).map(String) };
  }
  const V5_IDS = ["cabaret", "girlsbar", "snack", "lounge", "bar", "host"];
  const lockedType = typeof sj.biz_type === "string" && V5_IDS.includes(sj.biz_type) && sj.setup_done !== true ? (sj.biz_type as V5Type) : null;
  const initialType = lockedType ?? (V5_IDS.includes(sp.type ?? "") ? (sp.type as V5Type) : null);
  return (
    <SetupWizard
      store={{ id: target.id, name: target.name, setupDone: target.settings_json?.setup_done === true,
        current: {
          round_unit: target.round_unit, round_mode: target.round_mode, time_mode: target.time_mode, time_per: target.time_per,
          receipt: { address: str("receipt_address"), tel: str("receipt_tel"), reg_no: str("invoice_reg_no"), footer: str("receipt_footer") }, // set_store_receipt_profile の 4 引数明示送信（原則7）
          mine: mineSettingsOf(sj), // set_store_mine_settings の差分元（326 の 8 キー）
          tax: { business_tax_status: String(target.business_tax_status ?? "taxable"), price_display: String(target.price_display ?? "tax_included"), invoice_status: String(target.invoice_status ?? "unregistered"), invoice_reg_no: (target.invoice_reg_no as string | null) ?? null, tax_rounding: String(target.tax_rounding ?? "floor"), card_surcharge_rate: (target.card_surcharge_rate as number | null) ?? null },
        } }}
      counts={{ seats: seats ?? 0, products: products ?? 0, plans: plans ?? 0, rules: rules ?? 0 }}
      isOwner={role === "owner"}
      initialStep={initialStep}
      initialType={initialType}
      lockedType={lockedType}
      copy={copy}
      multiStore={rows.length > 1}
    />
  );
}
