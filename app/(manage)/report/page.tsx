import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import ReportBoard from "./report-board";
import { redirect } from "next/navigation";
import { managePageGate } from "@/lib/nox/nav/page-gate";
import { castRegisterEntryOf } from "@/lib/nox/register/cast-entry-server"; // ★教訓142・裁定481（2026-11-11）: キャストの入場はページ自体でも判定

export const dynamic = "force-dynamic";

// 日報（staff=閲覧・manager 以上=締め/再締め・★便 P173（裁定389）: レジ使用 ON のキャスト＝通常の締め）。
// プレビュー集計はクライアント TS＋biz-date 純関数（daily_report_aggregate は内部専用のまま＝呼ばない）。
export default async function ReportPage() {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
  const supabase = await createClient();
  const { role } = await getSessionRole();
  // ★教訓142・裁定481（2026-11-11 相談役 ■1）: レイアウトは画面の移動で描き直さない＝キャストの入場（店 ON ∧ 本人の許可 ∧ 端末 ∧ 出勤中）を /report のページ自体でも判定（/register と同じ関数）。
  //   退勤後に開いたままのタブ＝締めのボタンは押した時点でサーバ（0201e で出勤の判定）が拒否・画面の移動では、ここでマイページへ戻す。
  if (role === "cast") { const e = await castRegisterEntryOf(supabase); if (!e.allowed) redirect(`/mine?denied=register&why=${e.reason ?? "not_allowed"}`); }
  // cutoff は settings_json（E1 対象外）／card_tax_rate は stores 列（E1 mig0051 で移行）。
  // RLS スコープの店一覧（owner=org 全店・manager/staff=自店1件）＝月報タブの店セレクタ用。
  //   日報タブは先頭店（[0]）を従来どおり使う。
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json, card_tax_rate").order("name");
  const store = stores?.[0];
  const settings = (store?.settings_json ?? {}) as Record<string, unknown>;
  return (
    <ReportBoard
      storeId={store?.id ?? ""}
      cutoff={typeof settings.biz_cutoff_hm === "string" && settings.biz_cutoff_hm ? (settings.biz_cutoff_hm as string) : "06:00"}
      cardTaxRate={Number(store?.card_tax_rate ?? 5)}
      isManagerUp={role === "owner" || role === "manager"}
      isOwner={role === "owner"}
      isCast={role === "cast"} /* ★便 P173（裁定389）: ON のキャスト＝通常の締めだけ（layout が入口を制御・RPC が真の防御） */
      stores={(stores ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))}
    />
  );
}
