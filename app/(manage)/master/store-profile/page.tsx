import { redirect } from "next/navigation";
import { currentStoreRowsOf } from "@/lib/nox/store/current-server"; // ★0203
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import StoreProfilePanel from "../store-profile-panel";
import MineSettingsPanel from "../mine-settings-panel"; // ★裁定326-1（0160・便 M1-2）: キャスト画面の設定（owner／manager）→ ★330 追補1: 置き場＝店舗設定 ＞ 利用機能
import FeatureFlagsPanel from "../feature-flags-panel"; // ★C層①（mig0135）: 機能の公開（owner）→ ★MC2: system から店舗設定 ＞ 利用機能へ
import SystemsBoard from "../cast-comp/systems/systems-board"; // ★裁定269-7／270-2: 報酬制度 9 フラグ（sys_norms＝ノルマを使う を含む）→ ★MC2: 利用機能タブへ
import MasterPageHead from "../master-page-head";
import LineConfigPanel from "../line-config-panel"; // ★便 ON-3（0176 ★1 401）: LINE 連携と送信数
import { systemUsageOf } from "@/lib/nox/store-systems";
import { storeProfileTabOf } from "@/lib/nox/master/nav";
import PunchRulesPanel from "../punch-rules-panel"; // ★0201（裁定474）: 打刻の設定
import { mig0201On, mig0201cOn } from "@/lib/nox/rules-0175/flag";
import TrialTermsPanel from "../trial-terms-panel"; // ★0201c（裁定480）: 体験入店の条件（店の既定）
import { managePageGate } from "@/lib/nox/nav/page-gate";
import ManagerPunchPanel from "../manager-punch-panel"; // ★2026-11-16（■8）: 店長の打刻の許可（set_store_manager_punch）＝シフトと打刻

export const dynamic = "force-dynamic";

// 店舗設定（★起票86・便 V-7 → ★裁定330／330 追補1・便 MC2・2026-10-01）: 1 ページ・?tab= の 3 面。
//   利用機能（既定）＝報酬制度（SystemsBoard・sys_* 9＝ノルマを使う を含む）／売掛（StoreProfilePanel ar 節）／機能の公開（FeatureFlagsPanel・owner）／
//                   勤務時間の計算基準（0159・StoreProfilePanel timeBasis 節）／キャスト画面の設定（M1・MineSettingsPanel）
//   店舗情報＝店舗名・送りの基本額（★2026-11-18 Agoora の決定: 略称・店舗コード・表示名は画面から外した）（StoreProfilePanel profile 節）＋キャスト確認（shift 節）。住所・電話・インボイス登録番号は端末・印刷 ＞ レシート・プリンタ（二重編集を作らない）
//   データ管理（権限・情報管理の入口のタブ）＝顧客情報の利用目的・保持年数・操作ログの保持（StoreProfilePanel data 節＝店舗情報から分離）
//   ★各パネルは 1 文字も変えていない（StoreProfilePanel に「どの節を描くか」の sections を足しただけ）。ページレベルでも isManagerUp を要求（master/layout.tsx の入口ガードと二重）。
//   真の防御＝set_store_profile の owner 判定・set_store_mine_settings の owner／manager 自店・flag_set の owner・stores の RLS。
export default async function MasterStoreProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await managePageGate(); // ★教訓142（2026-11-11）: 柵（キャストの入場・規約・初期設定）はページの先頭で＝画面の移動でも効く
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
  if (tab === "pay") { // ★■8: 報酬制度（SystemsBoard）は給与のタブ（旧 利用機能）
    const { data: first } = await currentStoreRowsOf(supabase, "id, name, settings_json") /* ★0203（■2-e）: 今見ている店（旗 false＝今のまま＝店名順の先頭） */;
    const store = first?.[0];
    const storeId = (store?.id as string | undefined) ?? "";
    if (storeId) {
      // ★X-13-21（便 X-13d-1）: プラン側の値も渡す（systems/page.tsx と同じ）
      const [{ data: castPlans }, { data: castNorms }, { data: plans }, { data: comps }] = await Promise.all([
        supabase.from("cast_plan").select("cast_id, plan_id, overrides_json").eq("store_id", storeId),
        supabase.from("cast_norms").select("cast_id, days_target, dohan_target, sales_target, shimei_target").eq("store_id", storeId),
        supabase.from("comp_plans").select("id, base, hon_back, jonai_back, dohan_back, hon_back_mode, jonai_back_mode, dohan_back_mode, sales_slide, point_slide").eq("store_id", storeId),
        supabase.from("comp_plan_components").select("plan_id, kind, is_active").eq("store_id", storeId),
      ]);
      systems = {
        storeId, storeName: (store?.name as string | undefined) ?? "", settings: (store?.settings_json ?? {}) as Record<string, unknown>,
        usage: systemUsageOf({
          castPlans: (castPlans ?? []) as { cast_id: string; plan_id: string | null; overrides_json: unknown }[],
          castNorms: (castNorms ?? []) as { cast_id: string; days_target: number | null; dohan_target: number | null; sales_target: number | null; shimei_target: number | null }[],
          plans: (plans ?? []) as { id: string; base: number | null; hon_back: number | null; jonai_back: number | null; dohan_back: number | null; hon_back_mode: string | null; jonai_back_mode: string | null; dohan_back_mode: string | null; sales_slide: unknown; point_slide: unknown }[],
          components: (comps ?? []) as { plan_id: string; kind: string; is_active: boolean | null }[],
        }),
      };
    }
  }

  // ★2026-11-16（■8・裁定499-10）: 6 タブ＝店舗情報／レジ／シフトと打刻／給与／キャスト画面／税と請求（＋データ管理は権限・情報管理の入口・LINE 連携は従来の入口）
  const HEADS: Record<string, { eyebrow: string; title: string; desc: string }> = {
    info: { eyebrow: "STORE PROFILE", title: "店舗設定 › 店舗情報", desc: "店舗名。営業時間と定休日は「営業時間・定休日」で。住所・電話・インボイス登録番号は「端末・印刷 › レシート・プリンタ」で編集します（二重に編集する場所を作りません）。" },
    register: { eyebrow: "REGISTER", title: "店舗設定 › レジ", desc: "お客様の支払い方法・支払方法の調整と手数料・フロアの席種・途中合流・釣銭準備金。" },
    shift: { eyebrow: "SHIFT & PUNCH", title: "店舗設定 › シフトと打刻", desc: "打刻の方法と判定・店長の打刻・送り返しの自動確定・店の端末で本人がログインしたとき・機能の公開。" },
    pay: { eyebrow: "PAYROLL", title: "店舗設定 › 給与", desc: "報酬制度（ノルマを使うかを含む）・精算方式・途中払い・支払日・送りの基本額・勤務時間の計算基準・指名の区分ごとの割合・体験入店の条件。金額や計算条件は各マスタで管理します。" },
    mine: { eyebrow: "CAST PAGE", title: "店舗設定 › キャスト画面", desc: "キャストのマイページ（スマホ）に出すもの。" },
    tax: { eyebrow: "TAX & BILLING", title: "店舗設定 › 税と請求", desc: "インボイス登録日・消費税の表示・源泉区分の既定・売掛。" },
    data: { eyebrow: "DATA MANAGEMENT", title: "権限・情報管理 › データ管理", desc: "顧客情報の利用目的と保持年数、操作ログの保持。店舗情報とは別の画面にしています。" },
    line: { eyebrow: "LINE", title: "店舗設定 › LINE 連携", desc: "LINE ログイン（LIFF）・通知（Messaging API）・月の送信上限と今月の送信数。LINE Developers に貼る URL はこの画面で確認できます。" },
  };
  const head = HEADS[tab] ?? HEADS.info;

  return (
    <div className="nox-mv1 nox-settings">{/* ★2026-11-16（B6）: 店舗設定の文字と欄の大きさを初期設定に揃える範囲 */}
      <MasterPageHead eyebrow={head.eyebrow} title={head.title} desc={head.desc} />
      {/* ★2026-11-16（相談役・Agoora 14:41 の確認）: タブの並びは 1 つだけ＝ページの上のマスタの共通のタブ（MASTER_NAV の店舗設定の tabs）。見出しの下に足していた同じ 7 つの並びは外した */}
      {/* ★2026-11-16（■8）: 各パネルは中身を変えていない（StoreProfilePanel は節の鍵を細かくしただけ）＝保存する値と RPC は不変。対応表＝docs/tmp/settings_map_1116.md */}
      {tab === "info" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["profile"]} />}
      {tab === "register" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["opsReg"]} />}
      {tab === "register" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["regprof"]} />}
      {tab === "shift" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["opsShift"]} />}
      {tab === "shift" && mig0201On() && <ManagerPunchPanel stores={stores} isOwner={isOwner} />}{/* ★■8: 店長の打刻の許可＝シフトと打刻 */}
      {tab === "shift" && mig0201On() && <PunchRulesPanel stores={stores} isOwner={isOwner} />}{/* ★0201（裁定474）: 打刻の設定（判定・方法・位置・Wi-Fi・予定外） */}
      {tab === "shift" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["shift"]} />}
      {tab === "shift" && isOwner && <FeatureFlagsPanel stores={stores} />}
      {tab === "pay" && systems && (
        <SystemsBoard storeId={systems.storeId} storeName={systems.storeName} isOwner={isOwner} initialSettings={systems.settings} usage={systems.usage} />
      )}
      {tab === "pay" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["payprof"]} />}
      {tab === "pay" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["opsPay"]} />}
      {tab === "pay" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["timeBasis"]} />}
      {tab === "pay" && mig0201cOn() && <TrialTermsPanel stores={stores} isOwner={isOwner} />}{/* ★0201c（裁定480）: 体入の時給・日数・体入中のバック */}
      {tab === "mine" && <MineSettingsPanel stores={stores} isOwner={isOwner} />}
      {tab === "tax" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["opsTax"]} />}
      {tab === "tax" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["ar"]} />}
      {tab === "data" && <StoreProfilePanel stores={stores} isOwner={isOwner} sections={["data"]} />}
      {tab === "line" && <LineConfigPanel stores={stores} isOwner={isOwner} />}{/* ★便 ON-3（0176 ★1 401） */}
    </div>
  );
}
