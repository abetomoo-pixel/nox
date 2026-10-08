import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import StoreProfilePanel from "../store-profile-panel";
import MineSettingsPanel from "../mine-settings-panel"; // ★裁定326-1（0160・便 M1-2）: キャスト画面の設定（owner／manager）→ ★330 追補1: 置き場＝店舗設定 ＞ 利用機能
import FeatureFlagsPanel from "../feature-flags-panel"; // ★C層①（mig0135）: 機能の公開（owner）→ ★MC2: system から店舗設定 ＞ 利用機能へ
import SystemsBoard from "../cast-comp/systems/systems-board"; // ★裁定269-7／270-2: 報酬制度 9 フラグ（sys_norms＝ノルマを使う を含む）→ ★MC2: 利用機能タブへ
import MasterPageHead from "../master-page-head";
import { systemUsageOf } from "@/lib/nox/store-systems";
import { storeProfileTabOf } from "@/lib/nox/master/nav";

export const dynamic = "force-dynamic";

// 店舗設定（★起票86・便 V-7 → ★裁定330／330 追補1・便 MC2・2026-10-01）: 1 ページ・?tab= の 3 面。
//   利用機能（既定）＝報酬制度（SystemsBoard・sys_* 9＝ノルマを使う を含む）／売掛（StoreProfilePanel ar 節）／機能の公開（FeatureFlagsPanel・owner）／
//                   勤務時間の計算基準（0159・StoreProfilePanel timeBasis 節）／キャスト画面の設定（M1・MineSettingsPanel）
//   店舗情報＝店舗名・略称・店舗コード・表示名・送りの基本額（StoreProfilePanel profile 節）＋キャスト確認（shift 節）。住所・電話・インボイス登録番号は端末・印刷 ＞ レシート・プリンタ（二重編集を作らない）
//   データ管理（権限・情報管理の入口のタブ）＝顧客情報の利用目的・保持年数・操作ログの保持（StoreProfilePanel data 節＝店舗情報から分離）
//   ★各パネルは 1 文字も変えていない（StoreProfilePanel に「どの節を描くか」の sections を足しただけ）。ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御＝set_store_profile の owner 判定・set_store_mine_settings の owner／manager 自店・flag_set の owner・stores の RLS。
export default async function MasterStoreProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const isOwner = role === "owner";
  const tab = storeProfileTabOf((await searchParams).tab);

  const supabase = await createClient();
  const { data: allStores } = await supabase.from("stores").select("id, name").order("name");
  const stores = (allStores ?? []) as { id: string; name: string }[];

  // ★MC2: 利用機能タブの報酬制度＝systems/page.tsx と同じ組み立て（先頭店・settings_json・使用数は純関数 systemUsageOf）
  let systems: { storeId: string; storeName: string; settings: Record<string, unknown>; usage: ReturnType<typeof systemUsageOf> } | null = null;
  if (tab === "features") {
    const { data: first } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
    const store = first?.[0];
    const storeId = (store?.id as string | undefined) ?? "";
    if (storeId) {
      const [{ data: castPlans }, { data: castNorms }] = await Promise.all([
        supabase.from("cast_plan").select("cast_id, overrides_json").eq("store_id", storeId),
        supabase.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target, shimei_target").eq("store_id", storeId),
      ]);
      systems = {
        storeId, storeName: (store?.name as string | undefined) ?? "", settings: (store?.settings_json ?? {}) as Record<string, unknown>,
        usage: systemUsageOf({
          castPlans: (castPlans ?? []) as { cast_id: string; overrides_json: unknown }[],
          castNorms: (castNorms ?? []) as { cast_id: string; days_target: number | null; dohan_target: number | null; sales_target: number | null; shimei_target: number | null }[],
        }),
      };
    }
  }

  const head = tab === "info"
    ? { eyebrow: "STORE PROFILE", title: "店舗設定 › 店舗情報", desc: "店舗名・略称・店舗コード・表示名・送りの基本額とキャスト確認。住所・電話・インボイス登録番号は「端末・印刷 › レシート・プリンタ」で編集します（二重に編集する場所を作りません）。" }
    : tab === "data"
      ? { eyebrow: "DATA MANAGEMENT", title: "権限・情報管理 › データ管理", desc: "顧客情報の利用目的と保持年数、操作ログの保持。店舗情報から分離した設定です（保存先は同じ set_store_profile）。" }
      : { eyebrow: "STORE SETTINGS", title: "店舗設定 › 利用機能", desc: isOwner
          ? "この店舗で使う機能の選択です。報酬制度（ノルマを使うかを含む）・売掛・機能の公開・勤務時間の計算基準・キャスト画面の設定。金額や計算条件は各マスタで管理します。"
          : "この店舗で使う機能の選択です。報酬制度（ノルマを使うかを含む）・売掛・勤務時間の計算基準・キャスト画面の設定。金額や計算条件は各マスタで管理します。" }; // ★X-13-10（便 X-13a）: 機能の公開は owner だけに描く＝店長の説明文からも外す

  return (
    <div className="nox-mv1">
      <MasterPageHead eyebrow={head.eyebrow} title={head.title} desc={head.desc} />
      {tab === "features" && (
        <>
          {systems && (
            <SystemsBoard storeId={systems.storeId} storeName={systems.storeName} isOwner={isOwner} initialSettings={systems.settings} usage={systems.usage} />
          )}
          <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["ar", "timeBasis"]} />
          {isOwner && <FeatureFlagsPanel stores={stores} />}
          {/* ★裁定326-1／326-8（便 M1-2）→ 330 追補1: キャスト画面の設定＝店舗設定 ＞ 利用機能（owner／manager 自店＝RPC set_store_mine_settings の判定と同じ） */}
          <MineSettingsPanel stores={stores} />
        </>
      )}
      {tab === "info" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["profile", "shift"]} />}
      {tab === "data" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["data"]} />}
    </div>
  );
}
