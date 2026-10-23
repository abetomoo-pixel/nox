"use client";
import GroupedNumberInput from "@/components/ui/grouped-number-input"; // ★便 X13-G W-12 ④: 3 桁区切りの入力欄

// U-2（裁定101 段2 ②〜⑤）: 待遇プランのセクション編集面。
//   保存単位＝セクション（裁定101 §3・既存 RPC をそのまま呼ぶ・一括保存なし）。
//   plan の draft は本コンポーネントが1本で持ち、各節の「保存」は set_comp_plan 16引数**全明示**で
//   draft 全体を送る（教訓43 型＝省略で default に戻さない・rate は mode='rate' のときのみ値送信）。
//   各節に 保存済み/未保存 表示・失敗はその節だけ赤（裁定101 §3）。器なし項目は準備中バッジ（C5・起票#42）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import MoneyInput from "@/components/ui/money-input"; // ★便 X-12-1（起票90）: 金額欄の共通部品（数字のみ・3 桁区切り・右に「円」）
import SegSelect from "@/components/ui/seg-select";
import { prepItemOf } from "@/lib/nox/comp-methods";
import { NORM_AXES, NORM_AXIS_LABEL, NORM_AXIS_UNIT, normAxesOf } from "@/lib/nox/store/norm-axes"; // ★裁定347（0171・便 P171）: プラン既定の目標 4 軸（採用 OFF の軸は入力口を出さない）
import { SLIDE_APPLY_LABEL, SLIDE_BASIS_LABEL, slideBasisOf, slideBasisPillOf, slideDescOf, slidePeriodOf, slidePillOf, type SlideBasis, type SlidePeriod } from "@/lib/nox/payroll/slide"; // ★N3b（裁定288-7）・★裁定338（0168）: 判定期間
import { isSectionOn, isSystemOn, pointSlideOn, salesSlideOn, slidesTabOn, type StoreSettings } from "@/lib/nox/store-systems"; // ★裁定269: 使う制度の出し分け
import { BONUS_TIER_MAX, bonusParamsOf, bonusTiersErrOf, bonusTiersLabel, bonusTiersOf, type BonusTier } from "@/lib/nox/bonus-tiers"; // ★便 P173 T-2（起票110）: 達成ボーナスの多段
import { slideErrOf, slideToSave } from "@/lib/nox/comp/slide-rows"; // ★便 P174 T-1（裁定390）
import { rules0175On } from "@/lib/nox/rules-0175/flag"; // ★便 P175-prep P-3
import { PLAN_REWARD_AXIS_LABEL, planRewardAxisOf, planRewardAxisPatchOf, type PlanRewardAxis } from "@/lib/nox/rules-0175/settings"; // ★便 P175-prep P-3（裁定412 追補）
import {
  SlideInput, compErrJa, secTitle, BackTab, PRODUCT_BACK_OPTIONS, productBackArgsOf, productBackErrOf,
  type Plan, type Slide, type BackModeRow, type CompRow, type BackDef, type ProductBackMode,
} from "../comp-sections";

type Draft = {
  id: string | null; name: string; base: number; active: boolean;
  honBack: number; jonaiBack: number; dohanBack: number;
  honMode: BackModeRow; honRate: number; jonaiMode: BackModeRow; jonaiRate: number;
  salesSlide: Slide[]; pointSlide: Slide[];
  slidePeriod: SlidePeriod; // ★裁定338（0168・便 P168）: 判定期間（新規プランの初期値 monthly・既存は現状値＝旧行 daily）
  slideApply: "next" | "current" | null; // ★便 P174 T-4（裁定395・0174 ★4）: 判定タイミング（null＝店設定に従う）。395 追補2＝主表示は判定期間（月／半月）・タイミングは「詳細設定」の奥
  slideBasis: SlideBasis; slideRankIds: string[]; // ★裁定343（0170・便 W5-2b）: 判定基準（sales／hon_count／dohan_count・既定 sales）と対象ランク（空＝全員）
  // ★裁定113/123（mig0134）: 商品販売バック3方式。rate/fixed は当該 mode のときだけ送信（他は null＝RPC pair と同条件）。
  //   値は mode 切替中も保持（hon/jonai の円/本値と同じ流儀＝裁定v）。
  productBackMode: ProductBackMode; productBackRate: number; productBackFixed: number;
  // ★裁定347（0171・便 P171）: プラン既定の目標 4 軸（空文字＝継承なし＝null）。キャスト別（cast_quotas／cast_norms）が上書き
  normDays: string; normDohan: string; normSales: string; normShimei: string;
};
const BLANK: Draft = {
  id: null, name: "", base: 0, active: true,
  honBack: 0, jonaiBack: 0, dohanBack: 0,
  honMode: "per_count", honRate: 0, jonaiMode: "per_count", jonaiRate: 0,
  salesSlide: [], pointSlide: [],
  slidePeriod: "monthly", // ★裁定338: 新規プランの初期値＝月次
  slideApply: "next", // ★便 P174 T-4（ex_plan R-10）: 新規プランの UI 初期値＝前期の実績（DB の既定は null＝店設定）
  slideBasis: "sales", slideRankIds: [], // ★裁定343: 既定＝売上・全員
  productBackMode: "product_rule", productBackRate: 0, productBackFixed: 0,
  normDays: "", normDohan: "", normSales: "", normShimei: "", // ★裁定347: 既定＝継承なし
};
const normStr = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const normArg = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(/[^0-9]/g, "")));
const draftOf = (p: Plan): Draft => ({
  id: p.id, name: p.name, base: p.base, active: p.is_active,
  honBack: p.hon_back, jonaiBack: p.jonai_back, dohanBack: p.dohan_back,
  honMode: (p.hon_back_mode ?? "per_count") as BackModeRow, honRate: p.hon_back_rate ?? 0,
  jonaiMode: (p.jonai_back_mode ?? "per_count") as BackModeRow, jonaiRate: p.jonai_back_rate ?? 0,
  salesSlide: p.sales_slide ?? [], pointSlide: p.point_slide ?? [],
  slidePeriod: slidePeriodOf(p.slide_period), // ★裁定338: 既存プランは現状値（旧行＝daily・読み替えなし）
  slideApply: p.slide_apply === "next" || p.slide_apply === "current" ? p.slide_apply : null, // ★便 P174 T-4: 既存プランは現状値（null＝店設定）
  slideBasis: slideBasisOf(p.slide_basis), slideRankIds: Array.isArray(p.slide_rank_ids) ? (p.slide_rank_ids as string[]) : [], // ★裁定343: 既存プランは sales・全員（0170 の既定）
  productBackMode: p.product_back_mode ?? "product_rule",
  productBackRate: p.product_back_rate ?? 0, productBackFixed: p.product_back_fixed ?? 0,
  normDays: normStr(p.norm_days_target), normDohan: normStr(p.norm_dohan_target), normSales: normStr(p.norm_sales_target), normShimei: normStr(p.norm_shimei_target), // ★裁定347（0171）
});
const PB_KEYS: (keyof Draft)[] = ["productBackMode", "productBackRate", "productBackFixed"];

// 準備中バッジ（C5＝lib/nox/comp-methods.ts PREP_ITEMS が正本・散在リテラルにしない）
function Prep({ k }: { k: string }) {
  const p = prepItemOf(k);
  if (!p) return null;
  return (
    <span className="nox-stpill" title={p.unlock ?? "準備中（第 2 期）"} style={{ opacity: 0.8 }}>
      {p.label}: 準備中{p.unlock ? `（${p.unlock}）` : ""}
    </span>
  );
}

// components（最低保証／達成ボーナス）の行＋追加/編集フォーム。★モジュール階層＝state が親再レンダーで飛ばない。
function CompRows({ kind, section, comps, isOwner, onSave }: {
  kind: string; section: string; comps: CompRow[]; isOwner: boolean;
  onSave: (section: string, kind: string, over: { id: string | null; amount: number; priority: number; active: boolean }) => Promise<void>;
}) {
  const rows = comps.filter((c) => c.kind === kind);
  const [amount, setAmount] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  // ★裁定106 B2: priority は UI から撤去＝固定送信（guarantee=100／achievement=90）。
  //   適用順は kind で決まり（achievement 加算→guarantee 床＝pay.ts）、同 kind 内は加算/逐次 max＝順序非依存
  //   （2026-09-01 実測＝挙動不変）。既存行の priority 値は上書き保存時にこの固定値へ収斂する。
  const FIXED_PRIORITY = kind === "guarantee_min" ? 100 : 90;
  return (
    <div>
      {rows.length > 0 && (
        <div className="nox-tablewrap plain">{/* ★M1 第 2 レーン（裁定251・2026-09-18）: 横スクロール容器 */}
        <table className="nox-table" style={{ marginBottom: 8 }}>
          <thead><tr>{["金額", "判定", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => { if (!isOwner) return; setEditId(c.id); setAmount(c.amount ?? 0); setActive(c.is_active); }}
                style={{ cursor: isOwner ? "pointer" : "default" }}>
                <td className="num">{(c.amount ?? 0).toLocaleString()} 円</td>{/* ★X-13-19: 通貨は接尾「円」（¥ 接頭撤去） */}
                <td>{kind === "guarantee_min" ? "月（固定）" : "達成100%・1段（固定）"}</td>
                <td style={{ color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {isOwner && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>{editId ? "編集中" : "追加"}</span>
          <label style={{ fontSize: 12 }}>{kind === "guarantee_min" ? "保証額（月）" : "加算額"}{/* ★X-13-19: 単位は MoneyInput の「円」だけ（「円 円」の二重を解消） */}{" "}
            <MoneyInput value={amount} onChange={(v) => setAmount(Number(v || 0))} style={t.input} width={130} ariaLabel="金額" /></label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }}
            onClick={() => void onSave(section, kind, { id: editId, amount, priority: FIXED_PRIORITY, active })}>
            {editId ? "更新" : "追加"}
          </button>
          {editId && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { setEditId(null); setAmount(0); setActive(true); }}>追加に戻す</button>}
        </div>
      )}
    </div>
  );
}

// ★便 P173 T-2（起票110・0174 ★2）: 達成ボーナスの多段＝行（コンポーネント）ごとに段 {pct, amount} を 1〜10 段（＋／−・達成率は昇順）。
//   計算＝売上ノルマ（目標）×達成率に届いた段のうち最上段の加算額（★裁定404 既定 max・合計方式は 0175／P175 の店設定）（lib/nox/bonus-tiers.ts＝pay.ts と同じ純関数）。
function BonusRows({ comps, isOwner, salesAxisOn, onSave, onErr }: {
  comps: CompRow[]; isOwner: boolean; salesAxisOn: boolean;
  onSave: (over: { id: string | null; tiers: BonusTier[]; active: boolean }) => Promise<boolean>; // true＝保存できた（失敗時は節エラーを残すため reset しない）
  /** 保存前検査のエラー＝親の節エラー（secErr「達成ボーナス」）へ出す（素の <p> で描かない＝messages 規約） */
  onErr: (m: string) => void;
}) {
  const rows = comps.filter((c) => c.kind === "achievement_bonus");
  const BLANK_TIERS: BonusTier[] = [{ pct: 100, amount: 0 }];
  const [tiers, setTiers] = useState<BonusTier[]>(BLANK_TIERS);
  const [editId, setEditId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const setTier = (i: number, patch: Partial<BonusTier>) => setTiers((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const reset = () => { setEditId(null); setTiers(BLANK_TIERS); setActive(true); onErr(""); };
  return (
    <div>
      {!salesAxisOn && <p style={{ fontSize: 12, color: "var(--warn, var(--bad))", margin: "0 0 8px" }}>目標の軸（売上）を採用していません。「ノルマ設定（店）」で売上を ON にすると目標が入り、達成ボーナスが計算されます。</p>}
      {rows.length > 0 && (
        <div className="nox-tablewrap plain">
        <table className="nox-table" style={{ marginBottom: 8 }}>
          <thead><tr>{["段（達成率 → 加算額）", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => {
              const ts = bonusTiersOf(c.params, c.amount);
              return (
                <tr key={c.id} data-bonus-row={c.id} onClick={() => { if (!isOwner) return; setEditId(c.id); setTiers(ts); setActive(c.is_active); onErr(""); }}
                  style={{ cursor: isOwner ? "pointer" : "default" }}>
                  <td className="num">{bonusTiersLabel(ts)}</td>
                  <td style={{ color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {isOwner && (
        <div data-bonus-editor="1">
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>{editId ? "編集中" : "追加"}（売上ノルマの何％で、いくら足すか。届いた段のうち一番上の段の金額）</div>
          {tiers.map((x, i) => (
            <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }} data-bonus-tier={i}>
              <span style={{ fontSize: 12, color: "var(--sub)", minWidth: 36 }}>{i + 1} 段</span>
              <label style={{ fontSize: 12 }}>達成率{" "}
                <input inputMode="numeric" value={String(x.pct)} aria-label={`${i + 1} 段の達成率`} style={{ ...t.input, width: 70 }}
                  onChange={(e) => setTier(i, { pct: Number(e.target.value.replace(/[^0-9]/g, "") || 0) })} /> %</label>
              <label style={{ fontSize: 12 }}>加算額{" "}
                <MoneyInput value={x.amount} onChange={(v) => setTier(i, { amount: Number(v || 0) })} style={t.input} width={130} ariaLabel={`${i + 1} 段の加算額`} /></label>
              {tiers.length > 1 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} aria-label={`${i + 1} 段を削除`} onClick={() => setTiers((v) => v.filter((_, j) => j !== i))}>−</button>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {tiers.length < BONUS_TIER_MAX && (
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }}
                onClick={() => setTiers((v) => [...v, { pct: (v[v.length - 1]?.pct ?? 90) + 10, amount: v[v.length - 1]?.amount ?? 0 }])}>＋ 段を追加</button>
            )}
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }}
              onClick={() => { const e = bonusTiersErrOf(tiers); if (e) { onErr(e); return; } void onSave({ id: editId, tiers, active }).then((ok) => { if (ok) { setEditId(null); setTiers(BLANK_TIERS); setActive(true); } }); }}>
              {editId ? "更新" : "追加"}
            </button>
            {editId && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={reset}>追加に戻す</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanEditor({ storeId, isOwner, plans, backs, selId, setSelId, setMsg, reload, show, onDirtyCounts, settings }: {
  storeId: string; isOwner: boolean; plans: Plan[]; backs: BackDef[];
  selId: string | null; setSelId: (v: string | null) => void;
  setMsg: (m: string) => void; reload: () => Promise<void>;
  /** ★裁定106 B1: タブ表示制御＝display 切替（PlanEditor は常時マウント＝draft/snapshot がタブ移動で消えない）。
   *  省略時は全節表示（従来互換）。 */
  show?: { base: boolean; backs: boolean; slides: boolean; achieve: boolean };
  /** ★裁定106 B1: 右パネル「保存状態」用＝節ごとの未保存件数（0/1）を親へ通知。 */
  onDirtyCounts?: (c: { base: number; backs: number; slides: number }) => void;
  /** ★裁定269: stores.settings_json（sys_*）。OFF の節は描画しない（display 切替の vis とは別＝DOM に置かない） */
  settings?: StoreSettings;
}) {
  const supabase = createClient();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [snap, setSnap] = useState<string>(JSON.stringify(BLANK));
  const [comps, setComps] = useState<CompRow[]>([]);
  const [secErr, setSecErr] = useState<Record<string, string>>({});
  // ③ 固定名プリセット（裁定101 補正3・器＝custom_back_defs）
  const [presetName, setPresetName] = useState("");
  const [presetValue, setPresetValue] = useState(0);
  const d = (patch: Partial<Draft>) => setDraft((v) => ({ ...v, ...patch }));

  useEffect(() => {
    const p = plans.find((x) => x.id === selId) ?? null;
    const nd = p ? draftOf(p) : BLANK;
    setDraft(nd); setSnap(JSON.stringify(nd)); setSecErr({});
    if (p) {
      void supabase.from("comp_plan_components")
        .select("id, kind, mode, amount, rate, params, priority, is_active")
        .eq("plan_id", p.id).order("priority")
        .then(({ data }) => setComps((data ?? []) as CompRow[]));
    } else setComps([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, plans]);

  // 節ごとの dirty 判定＝draft と保存時 snapshot の当該キー比較（保存は常に全16引数）
  const dirty = (keys: (keyof Draft)[]) => {
    const s = JSON.parse(snap) as Draft;
    return keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(s[k]));
  };
  // ★裁定106 B1: タブごと未保存件数を親へ（achievement/自由バックは行単位保存＝対象外）
  const vis = show ?? { base: true, backs: true, slides: true, achieve: true };
  // ★裁定269-4: 節ごとに isSectionOn 1 条件（4 節＋自由バック表）
  const on = { base: isSectionOn(settings, "planEditorBase"), backs: isSectionOn(settings, "planEditorBacks"), slides: slidesTabOn(settings) /* ★便 GV-C C-5（R-5）: OR をやめ節ごと */, achieve: isSectionOn(settings, "planEditorAchieve"), backTab: isSectionOn(settings, "compBackTab") };
  useEffect(() => {
    onDirtyCounts?.({
      base: dirty(["name", "base", "active"]) ? 1 : 0,
      backs: dirty(["honBack", "jonaiBack", "dohanBack", "honMode", "honRate", "jonaiMode", "jonaiRate", ...PB_KEYS]) ? 1 : 0,
      slides: dirty(["salesSlide", "pointSlide"]) ? 1 : 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, snap]);
  // ★裁定106 B2: 最低月額保証は「使う」で開く（既定 OFF＝有効な guarantee_min が無ければ畳む）
  const [useGuarantee, setUseGuarantee] = useState(false);
  useEffect(() => { setUseGuarantee(comps.some((c) => c.kind === "guarantee_min" && c.is_active)); }, [comps]);
  // ★裁定343（0170・便 W5-2b）: 対象ランクの候補＝自店の有効な cast_ranks（RLS 越し・名前順）。無ければ「全員」
  const [ranks, setRanks] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("cast_ranks").select("id, name").eq("store_id", storeId).eq("is_active", true).order("sort_order").order("name");
      if (alive) setRanks(((data ?? []) as { id: string; name: string }[]));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  const effApply: "next" | "current" = draft.slideApply ?? "current"; // ★便 X13-H H-8: 判定タイミングはプランだけ（null＝当期の累計・店の slide_apply は読まない）
  const clean = (s: Slide[]) => slideToSave(s); // ★便 P174 T-1（裁定390）: at=0 の行を除外（従来と同じ）

  async function savePlan(section: string) {
    // ★mig0134: フロント検証＝RPC の pair/範囲と同条件（当該 mode の値だけ検査・RPC へ投げる前に節へ赤）
    const pbErr = productBackErrOf(draft.productBackMode, draft.productBackRate, draft.productBackFixed);
    if (pbErr) { setSecErr((e) => ({ ...e, [section]: pbErr })); return; }
    // ★便 P174 T-1（裁定390）: スライドの段＝RPC（comp_plan_slide_check）と同条件で先に検査（1〜10 段・昇順・整数 ≥0）
    const slErr = slideErrOf(draft.salesSlide) ?? slideErrOf(draft.pointSlide);
    if (slErr) { setSecErr((e) => ({ ...e, [section]: slErr })); return; }
    const { data: newId, error } = await supabase.rpc("set_comp_plan", {
      p_id: draft.id, p_store_id: storeId, p_name: draft.name, p_base: draft.base,
      p_hon_back: draft.honBack, p_jonai_back: draft.jonaiBack, p_dohan_back: draft.dohanBack,
      p_sales_slide: clean(draft.salesSlide), p_point_slide: clean(draft.pointSlide),
      p_is_active: draft.active,
      p_slide_period: draft.slidePeriod, // ★裁定338（0168）: 23 引数目（判定期間）
      p_slide_basis: draft.slideBasis, p_slide_rank_ids: draft.slideRankIds,
      p_slide_apply: draft.slideApply, // ★便 P174 T-4（裁定395・0174 ★4）: 30 引数目を常に明示（省略すると更新で null＝店設定に戻る） // ★裁定343（0170）: 24・25 引数目（判定基準・対象ランク＝空は全員）
      p_norm_days_target: normArg(draft.normDays), p_norm_dohan_target: normArg(draft.normDohan), p_norm_sales_target: normArg(draft.normSales), p_norm_shimei_target: normArg(draft.normShimei), // ★裁定347（0171）: 26〜29 引数目（プラン既定の目標・空＝null＝継承なし）
      p_hon_back_mode: draft.honMode, p_hon_back_rate: draft.honMode === "rate" ? draft.honRate : null,
      p_jonai_back_mode: draft.jonaiMode, p_jonai_back_rate: draft.jonaiMode === "rate" ? draft.jonaiRate : null,
      p_dohan_back_mode: "per_count", p_dohan_back_rate: null, // R-2b まで封印（裁定86-②）
      // ★mig0134（裁定113/123）: 19引数全明示（原則7）。rate/fixed は当該 mode のときだけ値・他は null
      ...productBackArgsOf(draft.productBackMode, draft.productBackRate, draft.productBackFixed,
        (() => { const cur = plans.find((x) => x.id === draft.id); return cur ? { hon: cur.product_back_fixed_hon ?? null, jonai: cur.product_back_fixed_jonai ?? null, free: cur.product_back_fixed_free ?? null } : null; })()), // ★便 P174: 区分別 3 欄（この画面に欄なし）は行の現在値を写す＝保存で null に戻さない
    });
    if (error) {
      setSecErr((e) => ({ ...e, [section]: compErrJa(error.message) }));
      return;
    }
    setSecErr((e) => ({ ...e, [section]: "" }));
    setSnap(JSON.stringify({ ...draft, id: draft.id ?? (newId as string) }));
    if (!draft.id && newId) setSelId(newId as string);
    setMsg(`${section}を保存しました`);
    await reload();
  }

  async function saveComp(section: string, kind: string, over: { id: string | null; amount: number; priority: number; active: boolean }) {
    if (!draft.id) { setSecErr((e) => ({ ...e, [section]: "先にプランを保存してください（基本給・保証の保存でプランが作成されます）" })); return; }
    const params = { period: "month" }; // ★便 P173 T-2: 達成ボーナスは saveBonus（多段）
    const { error } = await supabase.rpc("set_comp_component", {
      p_id: over.id, p_plan_id: draft.id, p_kind: kind, p_mode: "amount",
      p_amount: over.amount, p_rate: null, p_params: params, p_priority: over.priority, p_is_active: over.active,
    });
    if (error) { setSecErr((e) => ({ ...e, [section]: compErrJa(error.message) })); return; }
    setSecErr((e) => ({ ...e, [section]: "" }));
    setMsg(`${section}を保存しました`);
    const { data } = await supabase.from("comp_plan_components")
      .select("id, kind, mode, amount, rate, params, priority, is_active")
      .eq("plan_id", draft.id).order("priority");
    setComps((data ?? []) as CompRow[]);
  }

  // ★便 P173 T-2（起票110）: 達成ボーナスの多段＝params {thresholds:[{pct, amount}]}・コンポーネントの amount＝1 段目（一覧の互換）・priority 90 固定（裁定106 B2）
  async function saveBonus(over: { id: string | null; tiers: BonusTier[]; active: boolean }): Promise<boolean> {
    const section = "達成ボーナス";
    if (!draft.id) { setSecErr((e) => ({ ...e, [section]: "先にプランを保存してください（基本給・保証の保存でプランが作成されます）" })); return false; }
    const { params, amount } = bonusParamsOf(over.tiers);
    const { error } = await supabase.rpc("set_comp_component", {
      p_id: over.id, p_plan_id: draft.id, p_kind: "achievement_bonus", p_mode: "amount",
      p_amount: amount, p_rate: null, p_params: params, p_priority: 90, p_is_active: over.active,
    });
    if (error) { setSecErr((e) => ({ ...e, [section]: compErrJa(error.message) })); return false; }
    setSecErr((e) => ({ ...e, [section]: "" }));
    setMsg(`${section}を保存しました`);
    const { data } = await supabase.from("comp_plan_components")
      .select("id, kind, mode, amount, rate, params, priority, is_active")
      .eq("plan_id", draft.id).order("priority");
    setComps((data ?? []) as CompRow[]);
    return true;
  }

  async function savePreset() {
    const exist = backs.find((b) => b.name === presetName);
    const { error } = await supabase.rpc("set_custom_back_def", {
      p_id: exist?.id ?? null, p_store_id: storeId, p_name: presetName,
      p_basis: "flat", p_value: presetValue, p_cond: null, p_is_active: true,
    });
    if (error) { setSecErr((e) => ({ ...e, "各種バック": compErrJa(error.message) })); return; }
    setMsg(`${presetName}を保存しました（自由バック）`);
    setPresetName(""); setPresetValue(0);
    await reload();
  }

  // 節ヘッダ（保存済み/未保存・節の保存ボタン・節ローカルのエラー）。stateless＝インライン定義で可。
  // ★U-2 是正1: 未選択（新規＝draft.id null）は 保存済み/未保存ピルを出さない（BLANK が「保存済み」に見える誤解の防止）。
  //   保存は「基本給・保証」節のみ活性＝ここでプランが作成される（他節はプラン作成後に活性）。
  // ★裁定104 補正: 節見出し・保存ボタンに編集中プラン名を明示（どのプランを編集しているかの迷子防止）
  const pname = draft.name.trim() || "新規プラン";
  // ★N2（報酬プラン v3.1・A層＝既存行のみ）: 節ヘッダ＝見出し（大セクション 16px＝規約 §9）＋説明1行＋保存ボタン右寄せ
  //   ＋保存状態ピル（保存済み=Green／未保存=Red＝規約 §11）。保存経路（set_comp_plan 節保存）は不変。
  const SecHead = ({ title, keys, section, desc }: { title: string; keys: (keyof Draft)[]; section: string; desc?: string }) => {
    const isDirty = dirty(keys);
    const creatable = section === "基本給・保証";
    const disabled = !draft.name.trim() || (draft.id === null && !creatable);
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ ...secTitle, margin: 0, fontSize: 16 }}>
            {title}<span style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)" }}> — {pname}</span>
          </h2>
          {draft.id !== null && (
            <span className="nox-stpill" style={{ borderColor: isDirty ? "var(--danger-bd)" : "rgba(119, 186, 131, .45)", color: isDirty ? "var(--danger-ink)" : "var(--ok)" }}>
              {isDirty ? "未保存" : "保存済み"}
            </span>
          )}
          {isOwner && (
            <button type="button" style={{ ...t.btnGold, ...t.btnSm, marginLeft: "auto", opacity: disabled ? 0.5 : 1 }} onClick={() => void savePlan(section)}
              disabled={disabled}
              title={draft.id === null && !creatable ? "先に「基本給・保証を保存」でプランを作成してください" : ""}>
              {section}を保存
            </button>
          )}
        </div>
        {desc && <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>{desc}</p>}
        {secErr[section] && <p style={{ fontSize: 12, color: "var(--bad)", margin: "4px 0 0" }}>{secErr[section]}</p>}
      </div>
    );
  };
  // ★N2: 入力欄の単位を常時表示（規約 §3＝prefix/suffix・`¥ 5,000 円`／`20 %`／`¥ 4,000 円/本`）。値・onChange は不変＝表示だけ。
  const Unit = ({ pre, post, children }: { pre?: string; post?: string; children: React.ReactNode }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {pre && <span style={{ fontSize: 12, color: "var(--sub)" }}>{pre}</span>}
      {children}
      {post && <span style={{ fontSize: 12, color: "var(--sub)" }}>{post}</span>}
    </span>
  );
  const lbl: React.CSSProperties = { fontSize: 12, display: "inline-flex", flexDirection: "column", gap: 6 };
  const secCard: React.CSSProperties = { ...t.card, padding: 18, marginBottom: 20 };

  const PRESETS = ["ドリンクバック", "シャンパンバック", "ボトルバック"] as const;

  return (
    <div>
      {/* ★U-2 是正1: 未選択（新規）時の誘導（編集系タブ表示時のみ） */}
      {draft.id === null && (vis.base || vis.backs || vis.slides || vis.achieve) && (
        <div style={{ ...t.card, marginBottom: 14, border: "1px solid var(--gold)", fontSize: 13 }}>
          <strong style={{ color: "var(--champ)" }}>新規プランの作成</strong>
          <span style={{ marginLeft: 8, color: "var(--sub)" }}>
            プラン名を入力して「基本給・保証を保存」を押すとプランが作成されます（他の節はその後に保存できます）。
          </span>
        </div>
      )}
      {/* ── ② 基本・保証（★裁定106: 保証時給が主・最低月額保証は「使う」で開く） ── */}
      {on.base && (<section id="base" className="nox-cardtop" style={{ ...secCard, display: vis.base ? undefined : "none" }}>{/* ★裁定269-4: planEditorBase */}
        <SecHead title="基本・保証" keys={["name", "base", "active"]} section="基本給・保証" desc="時給と保証条件を設定します。" />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <label style={lbl}>プラン名
            <input placeholder="プラン名" value={draft.name} onChange={(e) => d({ name: e.target.value })} style={{ ...t.input, width: 170 }} disabled={!isOwner} /></label>
          <label style={lbl}>基本時給
            <MoneyInput value={draft.base} onChange={(v) => d({ base: Number(v || 0) })} style={t.input} width={120} disabled={!isOwner} ariaLabel="基本時給" /></label>
          <label style={{ ...lbl, flexDirection: "row", alignItems: "center", paddingBottom: 9 }}>
            <input type="checkbox" checked={draft.active} onChange={(e) => d({ active: e.target.checked })} disabled={!isOwner} /> 有効</label>
        </div>
        <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={useGuarantee} onChange={(e) => setUseGuarantee(e.target.checked)} disabled={!isOwner} />
          最低月額保証を使う<span style={{ color: "var(--sub)" }}>（月の総支給が保証額に届かない場合に差額を補います）</span>
        </label>
        {useGuarantee && (
          <CompRows kind="guarantee_min" section="基本給・保証" comps={comps} isOwner={isOwner} onSave={saveComp} />
        )}
        {/* ★GV-63（便 P173）: 準備中チップ 3 つ（日給制・保証対象時間帯・保証判定単位）は撤去（押せないものを置かない＝教訓25） */}
      </section>)}

      {/* ── ③ 歩合・バック ── */}
      {on.backs && (<section id="backs" className="nox-cardtop" style={{ ...secCard, display: vis.backs ? undefined : "none" }}>{/* ★裁定269-4: planEditorBacks */}
        <SecHead title="歩合・バック" keys={["honBack", "jonaiBack", "dohanBack", "honMode", "honRate", "jonaiMode", "jonaiRate", ...PB_KEYS]} section="各種バック"
          desc="指名実績バックと商品販売バックを設定します。" />
        {/* ★N2: 指名実績バック＝3ブロック（本指名／場内指名／同伴）。方式トグルは「固定額 円/本｜割合 %」（v3.1 逐語）・
            方式切替で単位 UI も同時に切替（規約 §4）。値の保持・送信形（rate は mode='rate' のときだけ）は不変。 */}
        <b style={{ fontSize: 14, display: "block", marginBottom: 6 }}>指名実績バック</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 10 }}>
          {([
            ["本指名バック", draft.honMode, (v: BackModeRow) => d({ honMode: v }), draft.honRate, (v: number) => d({ honRate: v }), draft.honBack, (v: number) => d({ honBack: v })],
            ["場内指名バック", draft.jonaiMode, (v: BackModeRow) => d({ jonaiMode: v }), draft.jonaiRate, (v: number) => d({ jonaiRate: v }), draft.jonaiBack, (v: number) => d({ jonaiBack: v })],
          ] as const).map(([title, mode, setMode, rate, setRate, amt, setAmt]) => (
            <div key={title} className="nox-inset" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SegSelect value={mode} onChange={(v) => setMode(v as BackModeRow)} disabled={!isOwner}
                  options={[["per_count", "固定額 円/本"], ["rate", "割合 %"]] as const} />
                <label style={lbl}>{mode === "rate" ? "バック率" : "バック額"}
                  {mode === "rate"
                    ? <Unit post="%"><input type="number" min={0} max={100} value={rate} onChange={(e) => setRate(Number(e.target.value))} style={{ ...t.input, width: 80 }} disabled={!isOwner} /></Unit>
                    : <Unit post="/本"><MoneyInput value={amt} onChange={(v) => setAmt(Number(v || 0))} style={t.input} width={120} disabled={!isOwner} ariaLabel="バック単価" /></Unit>}
                </label>
              </div>
            </div>
          ))}
          <div className="nox-inset" style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>同伴バック</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 同伴の割合方式は R-2b まで封印（裁定86-②・対応表 C18＝準備中）＝トグルは出さず固定額のみ */}
              <span style={{ fontSize: 11, color: "var(--sub)" }}>固定額 円/本（割合方式は準備中）</span>
              <label style={lbl}>バック額
                <Unit post="/本"><MoneyInput value={draft.dohanBack} onChange={(v) => d({ dohanBack: Number(v || 0) })} style={t.input} width={120} disabled={!isOwner} ariaLabel="同伴バック" /></Unit>
              </label>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
          ※割合方式は、レジで「指名料を追加」した伝票の指名料額が対象です（裁定vi・本数カウントとは別系統）。
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <Prep k="rounding_axes" /><Prep k="rate_back" /><Prep k="ext_promote_back" />
        </div>
        {/* 固定名プリセット＋自由バック（裁定101 補正3・器＝custom_back_defs・set_custom_back_def 7引数） */}
        <b style={{ fontSize: 14, display: "block", margin: "12px 0 6px" }}>商品販売バック</b>
        <div className="nox-inset" style={{ padding: "10px 14px" }}>
          <b style={{ fontSize: 13 }}>ドリンク・ボトル・シャンパン（固定名プリセット）／自由バック</b>
          {/* ★裁定113/123（mig0132〜0134・起票#42 の「商品売上×率」を消化）: 商品販売バックの方式3択。
              product_rule＝商品ごとの設定（下のプリセット／商品マスタのバック）・plan_rate＝同腕売上Σ×率・
              plan_fixed＝同腕按分数量Σ×固定額（円/1点・杯・品も同一計算）。判定と凍結は close 側（check_close）＝
              給与側は凍結値Σのみ。単位 UI は方式に連動して切替（UI 共通規約 §3/§4: 入力＝記号 `20 %`／`¥ 500 円/点`）。 */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "8px 0 4px" }}>
            <label style={{ fontSize: 12 }}>商品販売バックの方式{" "}
              <SegSelect value={draft.productBackMode} onChange={(v) => d({ productBackMode: v as ProductBackMode })}
                options={PRODUCT_BACK_OPTIONS} />
            </label>
            {draft.productBackMode === "plan_rate" && (
              <label style={{ fontSize: 12 }} data-testid="pb-rate">売上の割合{" "}
                <Unit post="%"><input type="number" min={0} max={100} step={1} value={draft.productBackRate}
                  onChange={(e) => d({ productBackRate: Number(e.target.value) })} style={{ ...t.input, width: 70 }} disabled={!isOwner} /></Unit>
              </label>
            )}
            {draft.productBackMode === "plan_fixed" && (
              <label style={{ fontSize: 12 }} data-testid="pb-fixed">固定額{" "}
                <Unit post="/点"><MoneyInput value={draft.productBackFixed}
                  onChange={(v) => d({ productBackFixed: Number(v || 0) })} style={t.input} width={120} disabled={!isOwner} ariaLabel="商品バック固定額" /></Unit>
              </label>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>
            {draft.productBackMode === "product_rule"
              ? "※商品ごとの設定（下のプリセット／商品マスタのバック額）で会計時に計算します。"
              : draft.productBackMode === "plan_rate"
                ? "※商品売上（按分後）× 割合を会計締め時に確定します。商品ごとのバック額は使いません（pt は別系統）。"
                : "※販売数（按分後）× 固定額（杯・品とも同一）を会計締め時に確定します。商品ごとのバック額は使いません（pt は別系統）。"}
          </p>
          {isOwner && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
              {PRESETS.map((n) => (
                <button key={n} type="button" style={{ ...t.btnGhost, ...t.btnSm, border: presetName === n ? "1px solid var(--gold)" : t.btnGhost.border }}
                  onClick={() => { setPresetName(n); const ex = backs.find((b) => b.name === n); setPresetValue(ex?.value ?? 0); }}>
                  {n}{backs.find((b) => b.name === n) ? "（登録済）" : ""}
                </button>
              ))}
              {presetName && (
                <>
                  <label style={{ fontSize: 12 }}>{presetName} 定額 <MoneyInput value={presetValue} onChange={(v) => setPresetValue(Number(v || 0))} style={t.input} width={120} ariaLabel="定額" /></label>
                  <button type="button" style={{ ...t.btnGold, ...t.btnSm }} onClick={() => void savePreset()}>プリセットを保存</button>
                </>
              )}
              {secErr["各種バック"] && <span style={{ fontSize: 12, color: "var(--bad)" }}>{secErr["各種バック"]}</span>}
            </div>
          )}
          {on.backTab && <BackTab backs={backs} isManagerUp={isOwner} storeId={storeId} setMsg={setMsg} reload={reload} />}{/* ★裁定269-4: compBackTab */}
        </div>
      </section>)}

      {/* ── ④ スライド・ポイント ── */}
      {on.slides && (<section id="slides" className="nox-cardtop" style={{ ...secCard, display: vis.slides ? undefined : "none" }}>{/* ★裁定269-4: planEditorSlides */}
        <SecHead title="スライド・ポイント" keys={["salesSlide", "pointSlide", "slidePeriod", "slideApply"]} section="スライド" desc="売上・ポイント実績に応じた時給スライドを設定します。" />
        {/* ★裁定338＋追補1（0168・便 P168）: 判定期間＝3 択（月次（既定）／半月／日次）・owner・保存は set_comp_plan 23 引数。青ピルと説明文は期間で切替（翌日反映の語は使わない）。判定基準・対象（C5）は準備中のまま */}
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>判定期間:</span>
          <select value={draft.slidePeriod} disabled={!isOwner} aria-label="スライドの判定期間" onChange={(e) => d({ slidePeriod: e.target.value as SlidePeriod })} style={{ ...t.input, width: "auto", padding: "4px 8px", fontSize: 12.5 }}>
            <option value="monthly">月次（既定）</option><option value="half">半月</option><option value="daily">日次</option>
          </select>
          <span className="nox-stpill">{slidePillOf(draft.slidePeriod, effApply === "next")}</span>
          <span>対象: <b style={{ color: "var(--v2-text)" }}>時給</b>（固定）</span>
        </p>
        {rules0175On() && draft.id && (/* ★便 P175-prep P-3（裁定412 追補・0175 v2 ★12 comp_plan_ext_set）: 報酬の軸はプラン単位（null＝店の軸を引き継ぐ）。保存済みプランだけ。フラグ false＝DOM 差分 0 */
          <p data-plan-reward-axis={planRewardAxisOf(plans.find((x) => x.id === draft.id) as { reward_axis?: string | null } | undefined, settings)} style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>報酬の軸:</span>
            {(() => { const cur = (plans.find((x) => x.id === draft.id) as { reward_axis?: string | null } | undefined)?.reward_axis ?? null; const curKey: PlanRewardAxis | "store" = cur === null ? "store" : cur === "pt" ? "pts" : (cur as PlanRewardAxis);
              return ([["store", "店の軸に従う"], ["sales", PLAN_REWARD_AXIS_LABEL.sales], ["pts", PLAN_REWARD_AXIS_LABEL.pts], ["pay_rate", PLAN_REWARD_AXIS_LABEL.pay_rate]] as const).map(([v, label]) => (
                <label key={v} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <input type="radio" name="plan-reward-axis" checked={curKey === v} disabled={!isOwner} aria-label={`報酬の軸 ${label}`}
                    onChange={() => void (async () => { const { error } = await supabase.rpc("comp_plan_ext_set", { p_plan_id: draft.id, p_patch: planRewardAxisPatchOf(v === "store" ? null : v) }); if (error) { setSecErr((e) => ({ ...e, スライド: compErrJa(error.message) })); return; } setMsg(`報酬の軸を「${label}」にしました`); await reload(); })()} />{label}
                </label>
              )); })()}
          </p>
        )}
        {/* ★便 P174 T-4（裁定395・395 追補2）: 判定のタイミング＝詳細設定の奥（主表示は上の判定期間）。null＝店設定に従う・前期の実績（既定）・当期の累計（稀） */}
        <details data-slide-apply="1" style={{ margin: "0 0 8px", fontSize: 12, color: "var(--sub)" }}>
          <summary style={{ cursor: "pointer" }}>詳細設定（判定のタイミング: {SLIDE_APPLY_LABEL[effApply]}）</summary>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            {([["next", SLIDE_APPLY_LABEL.next], ["current", SLIDE_APPLY_LABEL.current]] as const).map(([v, label]) => (
              <label key={String(v)} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input type="radio" name="slide-apply" checked={effApply === v} disabled={!isOwner} onChange={() => d({ slideApply: v })} aria-label={`判定のタイミング ${label}`} />{label}
              </label>
            ))}
          </div>
        </details>
        {/* ★裁定343（0170・便 W5-2b）: 判定基準（売上／本指名の件数／同伴の件数）と対象ランク（空＝全員）＝プランの属性（set_comp_plan 25 引数）。338 の判定期間とは直交。対象外のキャストは基本率のまま */}
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>判定基準:</span>
          <select value={draft.slideBasis} disabled={!isOwner} aria-label="売上スライドの判定基準" onChange={(e) => d({ slideBasis: e.target.value as SlideBasis })} style={{ ...t.input, width: "auto", padding: "4px 8px", fontSize: 12.5 }}>
            <option value="sales">売上（既定）</option><option value="hon_count">本指名の件数</option><option value="dohan_count">同伴の件数</option>
          </select>
          <span>対象ランク:</span>
          {ranks.length === 0 ? <span style={{ color: "var(--sub)" }}>ランク未登録＝全員</span> : ranks.map((r) => (
            <label key={r.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={draft.slideRankIds.includes(r.id)} disabled={!isOwner} aria-label={`対象ランク ${r.name}`}
                onChange={(e) => d({ slideRankIds: e.target.checked ? [...draft.slideRankIds, r.id] : draft.slideRankIds.filter((x) => x !== r.id) })} />{r.name}
            </label>
          ))}
          <span className="nox-stpill">{slideBasisPillOf(draft.slideBasis, draft.slideRankIds, ranks.filter((r) => draft.slideRankIds.includes(r.id)).map((r) => r.name)) || "判定基準: 売上・対象: 全員"}</span>
        </p>
        {/* ★N2→★X-13-19: 段は 1 段 1 行（[判定] 円 以上 → 時給 [時給] 円・通貨は接尾のみ）＝SlideInput の basis で切替 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {salesSlideOn(settings) && (/* ★便 GV-C C-5（GV-43）: 売上スライドの節＝sys_sales_slide 単独 */
          <SlideInput label={draft.slideBasis === "sales" ? "売上スライド" : `${SLIDE_BASIS_LABEL[draft.slideBasis]}スライド` /* ★便 P174 T-1（裁定390）: 段数は可変＝見出しから「3段」を外す */}
            desc={draft.slideBasis === "sales" ? slideDescOf(draft.slidePeriod, "yen", effApply === "next") : slideDescOf(draft.slidePeriod, "count", effApply === "next", SLIDE_BASIS_LABEL[draft.slideBasis])}
            basis={draft.slideBasis === "sales" ? "yen" : "count"} period={draft.slidePeriod} slide={draft.salesSlide} setSlide={(s) => d({ salesSlide: s })} />
          )}
          {pointSlideOn(settings) && (/* ★便 GV-C C-5（GV-43）: pt スライドの節＝sys_point_slide かつ sys_points */
          <SlideInput label="ポイントスライド" desc={slideDescOf(draft.slidePeriod, "pt", effApply === "next")} basis="pt" period={draft.slidePeriod} slide={draft.pointSlide} setSlide={(s) => d({ pointSlide: s })} />
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Prep k="point_rules" /><Prep k="gross_profit_slide" /><Prep k="slide_ratio_col" />
        </div>
      </section>)}

      {/* ── ⑤ 達成ボーナス ── */}
      {on.achieve && (<section id="achieve" className="nox-cardtop" style={{ ...secCard, display: vis.achieve ? undefined : "none" }}>{/* ★裁定269-4: planEditorAchieve */}
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ ...secTitle, margin: 0, fontSize: 16 }}>
            達成ボーナス<span style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)" }}> — {pname}</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>目標＝売上ノルマ（キャスト別の売上目標・無ければプランの既定。0／未設定は不適用）。段は 1〜{BONUS_TIER_MAX} 段・届いた段のうち一番上の段の加算額を支給します。保存は行単位。</p>
          {secErr["達成ボーナス"] && <p style={{ fontSize: 12, color: "var(--bad)", margin: "4px 0 0" }}>{secErr["達成ボーナス"]}</p>}
        </div>
        <BonusRows comps={comps} isOwner={isOwner} salesAxisOn={normAxesOf(settings).sales} onSave={saveBonus} onErr={(m) => setSecErr((e) => ({ ...e, 達成ボーナス: m }))} />
        {/* ★便 N1013b B-9: 達成ボーナスの準備中チップは撤去済み。★便 P173 T-2: 多段（起票110）は実装・他軸（起票111）は第 2 期のまま */}
      </section>)}

      {/* ── ⑥ ノルマ（プラン既定の目標）── ★裁定347（0171・便 P171）: 4 軸の既定目標（空＝継承なし）。キャスト別（キャスト詳細「今月のノルマ」／キャスト別ノルマ目標）が上書き。採用 OFF の軸（店設定 norm_axes）は入力口を出さない */}
      {isSystemOn(settings, "sys_norms") && (<section id="norm-defaults" /* ★便 GV-C C-5（R-5 の漏れ 5）: ノルマの既定目標は sys_norms だけで判定（planTabQuota の OR をやめる） */ className="nox-cardtop" style={secCard} data-section="norm-defaults">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ ...secTitle, margin: 0, fontSize: 16 }}>
            ノルマ（プラン既定の目標）<span style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)" }}> — {pname}</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>このプランのキャストに継承される月の目標。空＝既定なし。キャスト個別の目標（キャスト詳細「今月のノルマ」）があればそちらが優先されます。保存は「基本」の保存と同じボタンです。</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {NORM_AXES.filter((k) => normAxesOf(settings)[k]).map((k) => {
            const field = ({ days: "normDays", dohan: "normDohan", sales: "normSales", shimei: "normShimei" } as const)[k];
            return (
              <label key={k} style={{ display: "block", minWidth: 0 }}>
                <span style={{ fontSize: 11, color: "var(--sub)", display: "block", marginBottom: 3 }}>{NORM_AXIS_LABEL[k]}（{NORM_AXIS_UNIT[k]}）</span>
                <GroupedNumberInput value={draft[field]} disabled={!isOwner} placeholder="既定なし" ariaLabel={`プラン既定の目標 ${NORM_AXIS_LABEL[k]}`}
                  onChange={(v) => d({ [field]: v } as Partial<Draft>)} style={{ width: "100%", padding: "8px 10px", fontSize: 13 }} />
              </label>
            );
          })}
        </div>
        {NORM_AXES.filter((k) => !normAxesOf(settings)[k]).length > 0 && (
          <p style={{ fontSize: 11, color: "var(--sub)", margin: "6px 0 0" }}>採用していない軸（{NORM_AXES.filter((k) => !normAxesOf(settings)[k]).map((k) => NORM_AXIS_LABEL[k]).join("・")}）は「ノルマ設定（店）」で ON にすると入力できます。</p>
        )}
      </section>)}
    </div>
  );
}
