import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import PricingBoard from "./pricing-board";

export const dynamic = "force-dynamic";

// 料金設定（料金UIレーン C1・モック nox-rate-settings-redesign.html 準拠＋修正4点）。
//
// ★マスタ概要の view "pricing"（料金・会計設定／時間料金の2カード＝遷移先重複・改善(6)）を
//   実ページ化して統合したもの。既存2パネル（PricingPanel/TimePricingPanel）は「基本料金」
//   タブへ移設＝コンポーネント・RPC・引数は非改変（置き場所だけ変えた）。
//
// 取得は「このページが描くのに要る分だけ」（裁定B・重複許容）:
//   stores（基本料金の現在値＋フォールバック表示＋biz_cutoff）＋ pricing_rules（RLS 直読み・
//   owner∨manager 自店のみ返る）＋ cast_ranks（指名料金ランク別テーブルの行）。
// 書込はすべて RPC 専任（set_pricing_rule / delete_pricing_rule / pricing_rule_reorder /
//   set_cast_rank / cast_rank_reorder / set_store_pricing / set_store_time_pricing）。
export default async function MasterPricingPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");

  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores")
    .select("id, name, settings_json, hon_fee, jonai_fee, dohan_fee, service_rate, card_tax_rate, round_unit, round_mode, set_min, set_fee, ext_min, ext_fee, time_mode, time_per")
    .order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");

  const [{ data: rules }, { data: ranks }] = await Promise.all([
    supabase.from("pricing_rules").select("*").eq("store_id", storeId)
      .order("priority").order("created_at").order("id"),
    supabase.from("cast_ranks").select("id, name, sort_order, is_active").eq("store_id", storeId)
      .order("sort_order").order("name"),
  ]);

  const sj = store?.settings_json as Record<string, unknown> | null;
  const bizCutoffHm = typeof sj?.biz_cutoff_hm === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(sj.biz_cutoff_hm as string)
    ? (sj.biz_cutoff_hm as string) : "06:00";

  return (
    <PricingBoard
      storeId={storeId}
      bizCutoffHm={bizCutoffHm}
      initial={{
        store: {
          hon_fee: Number(store?.hon_fee ?? 0), jonai_fee: Number(store?.jonai_fee ?? 0),
          dohan_fee: Number(store?.dohan_fee ?? 0), service_rate: Number(store?.service_rate ?? 10),
          card_tax_rate: Number(store?.card_tax_rate ?? 5), round_unit: Number(store?.round_unit ?? 100),
          round_mode: typeof store?.round_mode === "string" ? store.round_mode : "down",
          set_min: Number(store?.set_min ?? 60), set_fee: Number(store?.set_fee ?? 0),
          ext_min: Number(store?.ext_min ?? 30), ext_fee: Number(store?.ext_fee ?? 0),
          time_mode: typeof store?.time_mode === "string" ? store.time_mode : "manual",
          time_per: typeof store?.time_per === "string" ? store.time_per : "table",
        },
        rules: (rules ?? []) as never[],
        ranks: (ranks ?? []) as never[],
      }}
    />
  );
}
