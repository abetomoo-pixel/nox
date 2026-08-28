"use client";

import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

// キャスト・報酬レーン D2-1: 旧 CompMaster（報酬設計マスタ 6タブ）の解体先。
//   ★各タブ子コンポーネントは comp-master.tsx から**逐語移設**（JSX・RPC・引数・権限出し分けとも
//     1文字も変えていない）。タブ切替の殻だけを撤去し、実ページ3枚（plan/norma/deduction）が
//     必要なセクションを import して縦積みする（IA 分割＝裁定1・2）。
//   データ取得は useCompData（旧 CompMaster の load を関数ごと移設）＝各ページで必要分を読む。
// 3層防御の UI 層: layout でロール分岐（cast は到達不能）＋各セクションで D3a 出し分け。
//   最終防衛は DB（set_comp_plan/set_penalty_config は owner のみ・他は manager 以上＝mig0013）。

export type Slide = { at: number; wage: number };
export type BackModeRow = "per_count" | "rate";
export type Plan = {
  id: string; name: string; base: number; hon_back: number; jonai_back: number; dohan_back: number;
  sales_slide: Slide[]; point_slide: Slide[]; is_active: boolean;
  // mig0086: 率バック方式（hon/jonai 独立・rate 中も円/本値は保持＝裁定v）
  hon_back_mode: BackModeRow; hon_back_rate: number | null;
  jonai_back_mode: BackModeRow; jonai_back_rate: number | null;
};
export type CastRow = { id: string; name: string };
// overrides_json: 数値4キー＋方式2キー（string）＋率2キー＝mig0086 の8キー
export type CastPlan = { cast_id: string; plan_id: string; overrides_json: Record<string, number | string> };
// ★mig0114/0115（C1 §6-4 UI 段）: 追加コンポーネント（書き手は set_comp_component＝owner のみ）
export type CompRow = {
  id: string; kind: string; mode: string; amount: number | null; rate: number | null;
  params: Record<string, unknown>; priority: number; is_active: boolean;
};
const COMP_KIND_LABEL: Record<string, string> = { guarantee_min: "最低保証", achievement_bonus: "達成ボーナス" };
export type Norm = { id: string; cast_id: string; period: string; days_target: number; dohan_target: number; sales_target: number; shimei_target: number };
export type Deduction = { id: string; name: string; amount: number; per: string; is_active: boolean };
export type BackDef = { id: string; name: string; basis: string; value: number; cond_json: { metric: string; min: number } | null; is_active: boolean };
export type Penalty = {
  fine_absent: number; fine_late: number; hours_per_shift: number; norm_on: boolean;
  norm_days_flat: number; norm_days_per: number; norm_dohan_flat: number; norm_dohan_per: number;
  late_grace_min: number; early_grace_min: number; over_grace_min: number;
};

export const METRICS = ["hon", "jonai", "dohan", "days", "sales", "pt", "champCnt", "bottleCnt"] as const;

// ── 表示ラベル（★表示テキスト専用）─────────────────────────────────────────
//   ★RPC 引数名・overrides_json のキー・<option value>・basis/cond_json.metric の保存値は
//     一切変えない。ここで置き換えるのは画面に出す文字だけ（送信値は英語のまま）。
//   自由バックの基準（basis）＋達成条件の metric に共用。'flat' は基準側のみ現れる。
//   語の根拠＝mock/nox-cast-reward/plan.html の報酬項目名（本指名/場内指名/同伴/ボトル・シャンパン/
//   売上バック）と mock/pages-2026-08/nox-cast-compensation-all-in-one.html（出勤日数/ボトル/シャンパン）。
//   ★sales は pay.ts の cast.sales＝按分後の総売上（モックの「本指名売上」とは別物）ゆえ「按分後」を明示。
//   ★pt は pay.ts の input.pointProducts＝ポイント対象商品の pt 合計。
const METRIC_LABEL_JA: Record<string, string> = {
  flat: "定額",
  hon: "本指名（本数）",
  jonai: "場内指名（本数）",
  dohan: "同伴（本数）",
  days: "出勤日数",
  sales: "売上（按分後）",
  pt: "ポイント商品pt",
  champCnt: "シャンパン（本数）",
  bottleCnt: "ボトル（本数）",
};
// 未知の保存値（将来 basis が増えた場合）はそのまま出す＝表示が空にならない。
const metricJa = (k: string): string => METRIC_LABEL_JA[k] ?? k;

// 罰金・閾値の表示ラベルと単位（★state キー・RPC 引数名は英語のまま不変）。
//   単位の根拠: 円＝integer 列かつ pay.ts の罰金加算経路（normPenaltyOf / PenaltyConfig）。
//              h ＝set_penalty_config の検証 `0 < p_hours_per_shift <= 24`＋pay.ts の wage×hoursPerShift。
//              分＝punch-match の late/early/over 判定閾値（閲覧ラベルも「N分」表記）。
const PENALTY_LABEL_JA: Record<keyof Penalty, string> = {
  fine_absent: "当欠罰金",
  fine_late: "遅刻罰金",
  hours_per_shift: "試算用 1シフト時間",
  norm_on: "ノルマ罰金を有効にする",
  norm_days_flat: "出勤日数 未達の定額",
  norm_days_per: "出勤日数 不足1日につき",
  norm_dohan_flat: "同伴 未達の定額",
  norm_dohan_per: "同伴 不足1本につき",
  late_grace_min: "遅刻猶予",
  early_grace_min: "早退猶予",
  over_grace_min: "残留猶予",
};
const PENALTY_UNIT_JA: Partial<Record<keyof Penalty, string>> = {
  fine_absent: "円/回",
  fine_late: "円/回",
  hours_per_shift: "h",
  norm_days_flat: "円",
  norm_days_per: "円",
  norm_dohan_flat: "円",
  norm_dohan_per: "円",
  late_grace_min: "分",
  early_grace_min: "分",
  over_grace_min: "分",
};

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
export const secTitle: React.CSSProperties = t.cardTitle;
const note: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };

// RPC エラーの日本語化（待遇マスタ系・他5ファイルの rpcErrJa と同型）。
//   ★mig0104（裁定77）の 'duplicate name'（set_comp_plan）を含む。既定は素の message を返す
//     ＝未知トークンを握り潰さない（rpcErrJa 各実装と同じ振る舞い）。
function compErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("duplicate name")) return "同じ名前のプランがあります";
  if (msg.includes("not found")) return "対象が見つかりません（再読込してください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export const DEFAULT_PENALTY: Penalty = {
  fine_absent: 10000, fine_late: 3000, hours_per_shift: 5, norm_on: true,
  norm_days_flat: 5000, norm_days_per: 2000, norm_dohan_flat: 3000, norm_dohan_per: 1500,
  late_grace_min: 10, early_grace_min: 30, over_grace_min: 90,
};

/** 旧 CompMaster の load を移設した共通データフック（読みは RLS・書きは各セクションの RPC）。 */
export function useCompData(storeId: string) {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [casts, setCasts] = useState<CastRow[]>([]);
  const [castPlans, setCastPlans] = useState<CastPlan[]>([]);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [backs, setBacks] = useState<BackDef[]>([]);
  const [penalty, setPenalty] = useState<Penalty>(DEFAULT_PENALTY);
  const [penaltyExists, setPenaltyExists] = useState(false);

  const load = useCallback(async () => {
    const [p, c, cp, n, d, b, pc] = await Promise.all([
      supabase.from("comp_plans").select("*").order("name"),
      supabase.from("casts").select("id, name").eq("is_active", true).order("name"),
      // ★mig0114: 期間化後は現在行のみ（valid_to is null）。履歴行が生まれる挙動段の前に必須の追随。
      supabase.from("cast_plan").select("cast_id, plan_id, overrides_json").is("valid_to", null),
      supabase.from("cast_norms").select("id, cast_id, period, days_target, dohan_target, sales_target, shimei_target").order("period"),
      supabase.from("deductions").select("id, name, amount, per, is_active").order("name"),
      supabase.from("custom_back_defs").select("id, name, basis, value, cond_json, is_active").order("name"),
      supabase.from("penalty_config").select("*").eq("store_id", storeId).maybeSingle(),
    ]);
    setPlans((p.data ?? []) as Plan[]);
    setCasts((c.data ?? []) as CastRow[]);
    setCastPlans((cp.data ?? []) as CastPlan[]);
    setNorms((n.data ?? []) as Norm[]);
    setDeductions((d.data ?? []) as Deduction[]);
    setBacks((b.data ?? []) as BackDef[]);
    if (pc.data) { setPenalty(pc.data as unknown as Penalty); setPenaltyExists(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  return { plans, casts, castPlans, norms, deductions, backs, penalty, setPenalty, penaltyExists, reload: load };
}

// ── プラン（owner のみ編集・D3a）──
export function SlideInput({ label, slide, setSlide }: { label: string; slide: Slide[]; setSlide: (s: Slide[]) => void }) {
  // 3段固定入力（at 昇順 strict は RPC が検証・空段は送信時に除外）
  const rows: Slide[] = [0, 1, 2].map((i) => slide[i] ?? { at: 0, wage: 0 });
  const set = (i: number, key: "at" | "wage", v: number) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [key]: v } : r));
    setSlide(next);
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={note}>{label}（3段・at 昇順・at=0 の段は無効として除外）</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
          <span style={{ fontSize: 12 }}>{i + 1}段</span>
          <label style={{ fontSize: 12 }}>at <input type="number" min={0} value={r.at} onChange={(e) => set(i, "at", Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
          <label style={{ fontSize: 12 }}>時給 <input type="number" min={0} value={r.wage} onChange={(e) => set(i, "wage", Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
        </div>
      ))}
    </div>
  );
}

export function PlanTab({ plans, isOwner, storeId, setMsg, reload }: { plans: Plan[]; isOwner: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState(0);
  const [honBack, setHonBack] = useState(0);
  const [jonaiBack, setJonaiBack] = useState(0);
  const [dohanBack, setDohanBack] = useState(0);
  // mig0086: 方式（円/本｜率）。率は mode='rate' のときだけ送る（排他 CHECK と同輪郭）。
  const [honMode, setHonMode] = useState<BackModeRow>("per_count");
  const [honRate, setHonRate] = useState(0);
  const [jonaiMode, setJonaiMode] = useState<BackModeRow>("per_count");
  const [jonaiRate, setJonaiRate] = useState(0);
  const [salesSlide, setSalesSlide] = useState<Slide[]>([]);
  const [pointSlide, setPointSlide] = useState<Slide[]>([]);
  const [active, setActive] = useState(true);
  // ★C1 §6-4: 選択中プランの追加コンポーネント（RLS=comp_plans と同可視・書き手は owner のみ）
  const [comps, setComps] = useState<CompRow[]>([]);
  const [cKind, setCKind] = useState("guarantee_min");
  const [cAmount, setCAmount] = useState(0);
  const [cPriority, setCPriority] = useState(100);
  const [cActive, setCActive] = useState(true);
  const [cId, setCId] = useState<string | null>(null);

  async function loadComps(planId: string) {
    const { data } = await supabase.from("comp_plan_components")
      .select("id, kind, mode, amount, rate, params, priority, is_active")
      .eq("plan_id", planId).order("priority");
    setComps((data ?? []) as CompRow[]);
  }

  function edit(p: Plan) {
    setId(p.id); setName(p.name); setBase(p.base); setHonBack(p.hon_back);
    setJonaiBack(p.jonai_back); setDohanBack(p.dohan_back);
    setHonMode(p.hon_back_mode ?? "per_count"); setHonRate(p.hon_back_rate ?? 0);
    setJonaiMode(p.jonai_back_mode ?? "per_count"); setJonaiRate(p.jonai_back_rate ?? 0);
    setSalesSlide(p.sales_slide ?? []); setPointSlide(p.point_slide ?? []); setActive(p.is_active);
    setCId(null); setCKind("guarantee_min"); setCAmount(0); setCPriority(100); setCActive(true);
    void loadComps(p.id);
  }

  // ★C1 §6-4: set_comp_component へ **9引数全値明示送信**（教訓43 型＝省略で default に戻る事故を封じる）。
  //   params の形（v2.0 UI が書く最小形・台帳へ仮置き記録・挙動段の payOf 実装と同時に確定）:
  //     guarantee_min      → {"period":"month"}（判定単位は月固定＝半月/日は挙動段で解錠）
  //     achievement_bonus  → {"thresholds":[{"pct":100,"add":N}]}（1段のみ・複数段は挙動段で）
  async function saveComp() {
    if (!id) return;
    const params = cKind === "guarantee_min"
      ? { period: "month" }
      : { thresholds: [{ pct: 100, add: cAmount }] };
    const { error } = await supabase.rpc("set_comp_component", {
      p_id: cId, p_plan_id: id, p_kind: cKind, p_mode: "amount",
      p_amount: cAmount, p_rate: null, p_params: params,
      p_priority: cPriority, p_is_active: cActive,
    });
    setMsg(error ? compErrJa(error.message) : cId ? "コンポーネントを更新しました" : "コンポーネントを追加しました");
    if (!error) { setCId(null); setCAmount(0); setCPriority(100); setCActive(true); await loadComps(id); }
  }
  const clean = (s: Slide[]) => s.filter((r) => r.at > 0).map((r) => ({ at: r.at, wage: r.wage }));
  async function save() {
    // ★14引数呼び（mig0086）。旧10引数のまま呼ぶと DEFAULT 'per_count' で rate プランの方式が
    //   黙って戻る既知挙動があるため、方式・率は常に明示送信（原則7 の boolean 明示と同列）。
    const { error } = await supabase.rpc("set_comp_plan", {
      p_id: id, p_store_id: storeId, p_name: name, p_base: base,
      p_hon_back: honBack, p_jonai_back: jonaiBack, p_dohan_back: dohanBack,
      p_sales_slide: clean(salesSlide), p_point_slide: clean(pointSlide),
      p_is_active: active, // 明示 boolean（原則7）
      p_hon_back_mode: honMode, p_hon_back_rate: honMode === "rate" ? honRate : null,
      p_jonai_back_mode: jonaiMode, p_jonai_back_rate: jonaiMode === "rate" ? jonaiRate : null,
      // ★mig0115: dohan も常に明示送信（省略すると DEFAULT 'per_count' が効く＝教訓43 型の必須化）。
      //   UI は per_count 固定＝率は R-2b（同伴 cast_id 必須）後に解錠（RPC も 'dohan rate requires R-2b' で封印中）。
      p_dohan_back_mode: "per_count", p_dohan_back_rate: null,
    });
    setMsg(error ? compErrJa(error.message) : id ? "プランを更新しました" : "プランを登録しました");
    if (!error) { setId(null); setName(""); setBase(0); await reload(); }
  }

  return (
    <div>
      <table className="nox-table" style={{ marginBottom: 10 }}>
        <thead><tr>{["名称", "保証", "本", "場内", "同伴", "売上段", "pt段", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} onClick={() => edit(p)} style={{ cursor: "pointer" }}>{/* ★§6-4: 非 owner も選択可＝構成プレビューと components 閲覧（read-only） */}
              <td>{p.name}</td>
              <td className="num">{p.base}</td>
              <td className="num">{p.hon_back_mode === "rate" ? `率${p.hon_back_rate}%` : p.hon_back}</td>
              <td className="num">{p.jonai_back_mode === "rate" ? `率${p.jonai_back_rate}%` : p.jonai_back}</td>
              <td className="num">{p.dohan_back}</td>
              <td className="num">{(p.sales_slide ?? []).length}段</td>
              <td className="num">{(p.point_slide ?? []).length}段</td>
              <td style={{ color: p.is_active ? "var(--ok)" : "var(--sub)" }}>{p.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isOwner ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="プラン名" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} />
          <label style={{ fontSize: 12 }}>保証時給 <input type="number" min={0} value={base} onChange={(e) => setBase(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          {/* mig0086: hon/jonai は方式トグル（円/本｜率）＋方式に応じた値入力。円/本値は率中も保持（裁定v）。 */}
          <label style={{ fontSize: 12 }}>本指名方式 <SegSelect value={honMode} onChange={(v) => setHonMode(v as BackModeRow)}
            options={[["per_count", "円/本"], ["rate", "率(%)"]] as const} /></label>
          {honMode === "rate" ? (
            <label style={{ fontSize: 12 }}>本 率(%) <input type="number" min={0} max={100} value={honRate} onChange={(e) => setHonRate(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          ) : (
            <label style={{ fontSize: 12 }}>本(円/本) <input type="number" min={0} value={honBack} onChange={(e) => setHonBack(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          )}
          <label style={{ fontSize: 12 }}>場内方式 <SegSelect value={jonaiMode} onChange={(v) => setJonaiMode(v as BackModeRow)}
            options={[["per_count", "円/本"], ["rate", "率(%)"]] as const} /></label>
          {jonaiMode === "rate" ? (
            <label style={{ fontSize: 12 }}>場内 率(%) <input type="number" min={0} max={100} value={jonaiRate} onChange={(e) => setJonaiRate(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          ) : (
            <label style={{ fontSize: 12 }}>場内(円/本) <input type="number" min={0} value={jonaiBack} onChange={(e) => setJonaiBack(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          )}
          <label style={{ fontSize: 12 }}>同伴(円/本) <input type="number" min={0} value={dohanBack} onChange={(e) => setDohanBack(Number(e.target.value))} style={{ ...input, width: 70 }} />
            {/* ★mig0115（裁定86-②）: 同伴の率方式は R-2b（同伴 cast_id 必須）後に解錠＝それまで per_count 固定 */}
            <span className="nox-stpill" style={{ marginLeft: 6 }}>率は準備中（R-2b 後）</span></label>
          <div style={{ display: "flex", gap: 16, width: "100%" }}>
            <SlideInput label="売上スライド" slide={salesSlide} setSlide={setSalesSlide} />
            <SlideInput label="ポイントスライド" slide={pointSlide} setSlide={setPointSlide} />
          </div>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button style={btnDark} onClick={save}>{id ? "更新" : "登録"}</button>
          {id && <button style={btnLight} onClick={() => { setId(null); setName(""); }}>新規に戻す</button>}
        </div>
      ) : <p style={note}>プランの編集はオーナーのみ可能です（閲覧のみ）。</p>}
      {/* ── ★C1 §6-4（mig0115）: 追加コンポーネント＝選択中プランに付く行型（guarantee_min/achievement_bonus） ── */}
      {id && (
        <div className="nox-inset" style={{ padding: "10px 14px", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <b style={{ fontSize: 13 }}>追加コンポーネント</b>
            <span style={note}>プランの基本（保証・バック・スライド）に足す報酬要素（書込はオーナーのみ）</span>
          </div>
          <table className="nox-table" style={{ marginBottom: 8 }}>
            <thead><tr>{["種類", "方式", "金額/率", "判定", "priority", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {comps.length === 0 && <tr><td colSpan={6} style={{ color: "var(--sub)" }}>（コンポーネントなし）</td></tr>}
              {comps.map((c) => (
                <tr key={c.id} onClick={() => { if (!isOwner) return; setCId(c.id); setCKind(c.kind); setCAmount(c.amount ?? 0); setCPriority(c.priority); setCActive(c.is_active); }}
                  style={{ cursor: isOwner ? "pointer" : "default" }}>
                  <td>{COMP_KIND_LABEL[c.kind] ?? c.kind}</td>
                  <td>{c.mode === "rate" ? "率" : "金額"}</td>
                  <td className="num">{c.mode === "rate" ? `${c.rate}%` : `¥${(c.amount ?? 0).toLocaleString()}`}</td>
                  <td>{c.kind === "guarantee_min" ? "月" : `達成100%で加算`}</td>
                  <td className="num">{c.priority}</td>
                  <td style={{ color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isOwner && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={note}>{cId ? "編集中" : "追加"}</span>
              <SegSelect value={cKind} onChange={(v) => setCKind(v)}
                options={[["guarantee_min", "最低保証"], ["achievement_bonus", "達成ボーナス"]] as const} />
              <label style={{ fontSize: 12 }}>{cKind === "guarantee_min" ? "保証額(円)" : "加算額(円)"}
                <input type="number" min={0} value={cAmount} onChange={(e) => setCAmount(Number(e.target.value))} style={{ ...input, width: 100 }} /></label>
              {/* ★判定単位は v2.0 UI では月固定（半月/日は挙動段で解錠・params={"period":"month"} を送信） */}
              <span style={note}>{cKind === "guarantee_min" ? "判定単位: 月（固定）" : "しきい値: ノルマ達成100%・1段（固定）"}</span>
              <label style={{ fontSize: 12 }}>priority <input type="number" value={cPriority} onChange={(e) => setCPriority(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
              <label style={{ fontSize: 12 }}><input type="checkbox" checked={cActive} onChange={(e) => setCActive(e.target.checked)} /> 有効</label>
              <button style={btnDark} onClick={() => void saveComp()}>{cId ? "更新" : "追加"}</button>
              {cId && <button style={btnLight} onClick={() => { setCId(null); setCAmount(0); setCPriority(100); setCActive(true); }}>追加に戻す</button>}
            </div>
          )}
          <p style={{ ...note, marginTop: 6 }}>※計算への反映（payOf 結線）は挙動段で入ります。現時点は器＝定義の保存のみ。</p>
        </div>
      )}

      {/* ── ★C1 §6-4: このプランの構成（1枚プレビュー） ── */}
      {id && (
        <div className="nox-inset" style={{ padding: "10px 14px", marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>このプランの構成</b>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4, fontSize: 12 }}>
            <span>保証時給 <b className="num">¥{base.toLocaleString()}</b></span>
            <span>本指名 <b className="num">{honMode === "rate" ? `率${honRate}%` : `¥${honBack.toLocaleString()}/本`}</b></span>
            <span>場内 <b className="num">{jonaiMode === "rate" ? `率${jonaiRate}%` : `¥${jonaiBack.toLocaleString()}/本`}</b></span>
            <span>同伴 <b className="num">¥{dohanBack.toLocaleString()}/本</b>（率は準備中）</span>
            <span>スライド 売上{salesSlide.length}段・pt{pointSlide.length}段</span>
            {comps.filter((c) => c.is_active).map((c) => (
              <span key={c.id}>{COMP_KIND_LABEL[c.kind] ?? c.kind} <b className="num">¥{(c.amount ?? 0).toLocaleString()}</b>{c.kind === "guarantee_min" ? "/月" : "（達成時）"}</span>
            ))}
          </div>
        </div>
      )}

      {/* ★裁定vi: 率方式の帰属系統は check_lines（レジで課金した指名料）＝本数カウントとは別系統。運用注記必須。 */}
      <p style={{ ...note, marginTop: 8 }}>
        ※率方式は、レジで「指名料を追加」した伝票の指名料額が対象です（指名料を課金しなかった伝票は率バックに入りません）。
      </p>
    </div>
  );
}

// ── 割当（manager 以上・inactive プランは選択肢に出さない）──
export function AssignTab({ plans, casts, castPlans, isManagerUp, setMsg, reload }: { plans: Plan[]; casts: CastRow[]; castPlans: CastPlan[]; isManagerUp: boolean; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [castId, setCastId] = useState("");
  const [planId, setPlanId] = useState("");
  const [ov, setOv] = useState<Record<string, string>>({ base: "", honBack: "", jonaiBack: "", dohanBack: "", honBackRate: "", jonaiBackRate: "" });
  // mig0086: 方式 override（"" = 方式は上書きしない）。mode を選んだら対の値入力を必須表示＝原子性を UI で構造化。
  const [ovHonMode, setOvHonMode] = useState<"" | BackModeRow>("");
  const [ovJonaiMode, setOvJonaiMode] = useState<"" | BackModeRow>("");
  const activePlans = plans.filter((p) => p.is_active); // inactive は割当不可（DB も 'plan inactive' で拒否）
  const planName = (pid: string) => plans.find((p) => p.id === pid)?.name ?? "(不明)";
  const castName = (cid: string) => casts.find((c) => c.id === cid)?.name ?? cid;

  async function save() {
    const overrides: Record<string, number | string> = {};
    if (ov.base !== "") overrides.base = Number(ov.base);
    if (ov.dohanBack !== "") overrides.dohanBack = Number(ov.dohanBack);
    // ★原子性（mig0086）: mode を送るときは対の値を必ず同送（RPC は片側合成を 'bad overrides' で拒否）。
    //   mode 未選択（""）のときは従来どおり値単独 override（プラン方式のまま値だけ差し替え）。
    if (ovHonMode === "rate") {
      if (ov.honBackRate === "") { setMsg("本指名の率(%)を入力してください（方式と値はペアで保存）"); return; }
      overrides.honBackMode = "rate"; overrides.honBackRate = Number(ov.honBackRate);
    } else if (ovHonMode === "per_count") {
      if (ov.honBack === "") { setMsg("本指名の円/本を入力してください（方式と値はペアで保存）"); return; }
      overrides.honBackMode = "per_count"; overrides.honBack = Number(ov.honBack);
    } else if (ov.honBack !== "") {
      overrides.honBack = Number(ov.honBack);
    }
    if (ovJonaiMode === "rate") {
      if (ov.jonaiBackRate === "") { setMsg("場内の率(%)を入力してください（方式と値はペアで保存）"); return; }
      overrides.jonaiBackMode = "rate"; overrides.jonaiBackRate = Number(ov.jonaiBackRate);
    } else if (ovJonaiMode === "per_count") {
      if (ov.jonaiBack === "") { setMsg("場内の円/本を入力してください（方式と値はペアで保存）"); return; }
      overrides.jonaiBackMode = "per_count"; overrides.jonaiBack = Number(ov.jonaiBack);
    } else if (ov.jonaiBack !== "") {
      overrides.jonaiBack = Number(ov.jonaiBack);
    }
    // ★mig0116: p_valid_from は null を明示送信（教訓43 型＝現在行の上書き経路を UI が固定・履歴 UI は起票#38）
    const { error } = await supabase.rpc("set_cast_plan", { p_cast_id: castId, p_plan_id: planId, p_overrides: overrides, p_valid_from: null });
    setMsg(error ? compErrJa(error.message) : "割当を保存しました");
    if (!error) await reload();
  }

  return (
    <div>
      <table className="nox-table" style={{ marginBottom: 10 }}>
        <thead><tr>{["キャスト", "プラン", "上書き"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {castPlans.map((cp) => (
            <tr key={cp.cast_id}>
              <td>{castName(cp.cast_id)}</td>
              <td>{planName(cp.plan_id)}</td>
              <td>{Object.keys(cp.overrides_json ?? {}).length ? JSON.stringify(cp.overrides_json) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={castId} onChange={(e) => setCastId(e.target.value)} style={input}>
            <option value="">キャスト選択</option>
            {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={input}>
            <option value="">プラン選択（有効のみ）</option>
            {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={note}>個別上書き（空欄＝プランの値）</span>
          <label style={{ fontSize: 12 }}>保証時給 <input type="number" min={0} value={ov.base} placeholder="既定" onChange={(e) => setOv((o) => ({ ...o, base: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          {/* mig0086: 方式 override は mode 選択→対の値入力を必須表示（原子性の UI 構造化）。既定=方式は上書きしない。 */}
          <label style={{ fontSize: 12 }}>本 方式 <SegSelect value={ovHonMode} onChange={(v) => setOvHonMode(v as "" | BackModeRow)}
            options={[["", "既定"], ["per_count", "円/本"], ["rate", "率(%)"]] as const} /></label>
          {ovHonMode === "rate" ? (
            <label style={{ fontSize: 12 }}>本 率(%)※必須 <input type="number" min={0} max={100} value={ov.honBackRate} onChange={(e) => setOv((o) => ({ ...o, honBackRate: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          ) : (
            <label style={{ fontSize: 12 }}>本(円/本){ovHonMode === "per_count" ? "※必須" : ""} <input type="number" min={0} value={ov.honBack} placeholder="既定" onChange={(e) => setOv((o) => ({ ...o, honBack: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          )}
          <label style={{ fontSize: 12 }}>場内 方式 <SegSelect value={ovJonaiMode} onChange={(v) => setOvJonaiMode(v as "" | BackModeRow)}
            options={[["", "既定"], ["per_count", "円/本"], ["rate", "率(%)"]] as const} /></label>
          {ovJonaiMode === "rate" ? (
            <label style={{ fontSize: 12 }}>場内 率(%)※必須 <input type="number" min={0} max={100} value={ov.jonaiBackRate} onChange={(e) => setOv((o) => ({ ...o, jonaiBackRate: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          ) : (
            <label style={{ fontSize: 12 }}>場内(円/本){ovJonaiMode === "per_count" ? "※必須" : ""} <input type="number" min={0} value={ov.jonaiBack} placeholder="既定" onChange={(e) => setOv((o) => ({ ...o, jonaiBack: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          )}
          <label style={{ fontSize: 12 }}>同伴(円/本) <input type="number" min={0} value={ov.dohanBack} placeholder="既定" onChange={(e) => setOv((o) => ({ ...o, dohanBack: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          <button style={btnDark} onClick={save} disabled={!castId || !planId}>割当</button>
        </div>
      ) : <p style={note}>割当はマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── ノルマ（manager 以上・mig0042 で4軸＝日数/同伴＋売上/指名）──
//   売上・指名の新2軸は表示のみ（payOf/normPenalty 非接続＝/mine の進捗表示用）。
//   罰金に効くのは従来どおり日数・同伴のみ（罰金・閾値タブの norm_on 配下）。
export function NormTab({ casts, norms, isManagerUp, setMsg, reload }: { casts: CastRow[]; norms: Norm[]; isManagerUp: boolean; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [castId, setCastId] = useState("");
  const [period, setPeriod] = useState("");
  const [days, setDays] = useState(0);
  const [dohan, setDohan] = useState(0);
  const [sales, setSales] = useState(0);
  const [shimei, setShimei] = useState(0);
  const castName = (cid: string) => casts.find((c) => c.id === cid)?.name ?? cid;

  async function save() {
    // 6引数を常に明示送信（mig0042 で4引数版は drop 済・部分省略は関数不一致で失敗する）
    const { error } = await supabase.rpc("set_cast_norm", {
      p_cast_id: castId, p_period: period, p_days_target: days, p_dohan_target: dohan,
      p_sales_target: sales, p_shimei_target: shimei,
    });
    setMsg(error ? compErrJa(error.message) : "ノルマを保存しました");
    if (!error) await reload();
  }
  return (
    <div>
      <table className="nox-table" style={{ marginBottom: 10 }}>
        <thead><tr>{["キャスト", "期間", "日数目標", "同伴目標", "売上目標", "指名目標"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {norms.map((n) => (
            <tr key={n.id}>
              <td>{castName(n.cast_id)}</td>
              <td className="num">{n.period}</td>
              <td className="num">{n.days_target}</td>
              <td className="num">{n.dohan_target}</td>
              <td className="num">{(n.sales_target ?? 0).toLocaleString()}</td>
              <td className="num">{n.shimei_target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={castId} onChange={(e) => setCastId(e.target.value)} style={input}>
              <option value="">キャスト選択</option>
              {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="2026-07" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...input, width: 90 }} />
            <label style={{ fontSize: 12 }}>日数 <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 64 }} /></label>
            <label style={{ fontSize: 12 }}>同伴 <input type="number" min={0} value={dohan} onChange={(e) => setDohan(Number(e.target.value))} style={{ ...input, width: 64 }} /></label>
            <label style={{ fontSize: 12 }}>売上(円) <input type="number" min={0} value={sales} onChange={(e) => setSales(Number(e.target.value))} style={{ ...input, width: 100 }} /></label>
            <label style={{ fontSize: 12 }}>指名 <input type="number" min={0} value={shimei} onChange={(e) => setShimei(Number(e.target.value))} style={{ ...input, width: 64 }} /></label>
            <button style={btnDark} onClick={save} disabled={!castId || !period}>保存</button>
          </div>
          <p style={{ ...note, marginTop: 8 }}>
            ※売上・指名ノルマは表示のみ（本人のマイページ進捗表示用・罰金には接続されません）。
            店として採用する軸と指名のカウント定義は「ノルマ設定（店）」パネルで切り替えます。
          </p>
        </>
      ) : <p style={note}>ノルマはマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── 控除（manager 以上）──
export function DeductionTab({ deductions, isManagerUp, storeId, setMsg, reload }: { deductions: Deduction[]; isManagerUp: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [per, setPer] = useState("day");
  const [active, setActive] = useState(true);
  function edit(d: Deduction) { setId(d.id); setName(d.name); setAmount(d.amount); setPer(d.per); setActive(d.is_active); }
  async function save() {
    const { error } = await supabase.rpc("set_deduction", { p_id: id, p_store_id: storeId, p_name: name, p_amount: amount, p_per: per, p_is_active: active });
    setMsg(error ? compErrJa(error.message) : id ? "控除を更新しました" : "控除を登録しました");
    if (!error) { setId(null); setName(""); setAmount(0); await reload(); }
  }
  return (
    <div>
      <table className="nox-table" style={{ marginBottom: 10 }}>
        <thead><tr>{["名称", "額", "単位", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {deductions.map((d) => (
            <tr key={d.id} onClick={() => isManagerUp && edit(d)} style={{ cursor: isManagerUp ? "pointer" : "default" }}>
              <td>{d.name}</td>
              <td className="num">{d.per === "rate" ? `${d.amount}%` : d.amount}</td>
              <td>{d.per}</td>
              <td style={{ color: d.is_active ? "var(--ok)" : "var(--sub)" }}>{d.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="名称（送り代等）" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} />
          <label style={{ fontSize: 12 }}>額 <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          <SegSelect value={per} onChange={(v) => setPer(v)}
            options={[["day", "日ごと"], ["month", "月ごと"], ["rate", "売上%"]] as const} />
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button style={btnDark} onClick={save}>{id ? "更新" : "登録"}</button>
          {id && <button style={btnLight} onClick={() => { setId(null); setName(""); }}>新規に戻す</button>}
        </div>
      ) : <p style={note}>控除はマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── 罰金・突合閾値（owner のみ・D3a・全12引数明示送信＝原則7）──
export function PenaltyTab({ penalty, setPenalty, exists, isOwner, storeId, setMsg, reload }: { penalty: Penalty; setPenalty: (p: Penalty) => void; exists: boolean; isOwner: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  // ★表示のみ日本語化（k＝state キー／RPC 引数名は英語のまま save() で明示送信）。
  const num = (k: keyof Penalty, labelJa: string = PENALTY_LABEL_JA[k], unit: string | undefined = PENALTY_UNIT_JA[k]) => (
    <label style={{ fontSize: 12 }}>{labelJa}{unit ? `（${unit}）` : ""} <input type="number" min={0} value={penalty[k] as number}
      onChange={(e) => setPenalty({ ...penalty, [k]: Number(e.target.value) })} style={{ ...input, width: 80 }} /></label>
  );
  async function save() {
    // 全12引数を明示送信（部分 null で既定値へ黙ってリセットさせない＝原則7・RPC も全引数 null 拒否）
    const { error } = await supabase.rpc("set_penalty_config", {
      p_store_id: storeId,
      p_fine_absent: penalty.fine_absent, p_fine_late: penalty.fine_late,
      p_hours_per_shift: penalty.hours_per_shift, p_norm_on: penalty.norm_on,
      p_norm_days_flat: penalty.norm_days_flat, p_norm_days_per: penalty.norm_days_per,
      p_norm_dohan_flat: penalty.norm_dohan_flat, p_norm_dohan_per: penalty.norm_dohan_per,
      p_late_grace_min: penalty.late_grace_min, p_early_grace_min: penalty.early_grace_min,
      p_over_grace_min: penalty.over_grace_min,
    });
    setMsg(error ? compErrJa(error.message) : "罰金・閾値を保存しました");
    if (!error) await reload();
  }
  return (
    <div>
      <p style={note}>{exists ? "現在の設定（店1行）" : "未設定（既定値・保存で作成）"}</p>
      {isOwner ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {num("fine_absent")}{num("fine_late")}{num("hours_per_shift")}
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={penalty.norm_on} onChange={(e) => setPenalty({ ...penalty, norm_on: e.target.checked })} /> {PENALTY_LABEL_JA.norm_on}</label>
          {num("norm_days_flat")}{num("norm_days_per")}{num("norm_dohan_flat")}{num("norm_dohan_per")}
          {num("late_grace_min")}{num("early_grace_min")}{num("over_grace_min")}
          <button style={btnDark} onClick={save}>保存</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink)" }}>
          <p style={note}>罰金・閾値の編集はオーナーのみ可能です（閲覧のみ）。</p>
          当欠 {penalty.fine_absent} / 遅刻 {penalty.fine_late} / 遅刻猶予 {penalty.late_grace_min}分 / 早退 {penalty.early_grace_min}分 / 残留 {penalty.over_grace_min}分
        </div>
      )}
    </div>
  );
}

// ── 自由バック（manager 以上・cond {metric,min} 任意）──
export function BackTab({ backs, isManagerUp, storeId, setMsg, reload }: { backs: BackDef[]; isManagerUp: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [basis, setBasis] = useState("flat");
  const [value, setValue] = useState(0);
  const [condOn, setCondOn] = useState(false);
  const [condMetric, setCondMetric] = useState("sales");
  const [condMin, setCondMin] = useState(0);
  const [active, setActive] = useState(true);
  function edit(b: BackDef) {
    setId(b.id); setName(b.name); setBasis(b.basis); setValue(b.value); setActive(b.is_active);
    if (b.cond_json) { setCondOn(true); setCondMetric(b.cond_json.metric); setCondMin(b.cond_json.min); }
    else setCondOn(false);
  }
  async function save() {
    const { error } = await supabase.rpc("set_custom_back_def", {
      p_id: id, p_store_id: storeId, p_name: name, p_basis: basis, p_value: value,
      p_cond: condOn ? { metric: condMetric, min: condMin } : null,
      p_is_active: active,
    });
    setMsg(error ? compErrJa(error.message) : id ? "自由バックを更新しました" : "自由バックを登録しました");
    if (!error) { setId(null); setName(""); setValue(0); setCondOn(false); await reload(); }
  }
  return (
    <div>
      <table className="nox-table" style={{ marginBottom: 10 }}>
        <thead><tr>{["名称", "基準", "値", "条件", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {backs.map((b) => (
            <tr key={b.id} onClick={() => isManagerUp && edit(b)} style={{ cursor: isManagerUp ? "pointer" : "default" }}>
              <td>{b.name}</td>
              <td>{metricJa(b.basis)}</td>
              <td className="num">{b.basis === "sales" ? `${b.value}%` : b.value}</td>
              <td>{b.cond_json ? `${metricJa(b.cond_json.metric)}≥${b.cond_json.min}` : "—"}</td>
              <td style={{ color: b.is_active ? "var(--ok)" : "var(--sub)" }}>{b.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 140 }} />
          <select value={basis} onChange={(e) => setBasis(e.target.value)} style={input}>
            <option value="flat">{metricJa("flat")}</option>
            {METRICS.map((m) => <option key={m} value={m}>{metricJa(m)}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>値{basis === "sales" ? "%" : ""} <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={condOn} onChange={(e) => setCondOn(e.target.checked)} /> 達成条件</label>
          {condOn && (
            <>
              <select value={condMetric} onChange={(e) => setCondMetric(e.target.value)} style={input}>
                {METRICS.map((m) => <option key={m} value={m}>{metricJa(m)}</option>)}
              </select>
              <label style={{ fontSize: 12 }}>≥ <input type="number" min={0} value={condMin} onChange={(e) => setCondMin(Number(e.target.value))} style={{ ...input, width: 90 }} /></label>
            </>
          )}
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button style={btnDark} onClick={save}>{id ? "更新" : "登録"}</button>
          {id && <button style={btnLight} onClick={() => { setId(null); setName(""); }}>新規に戻す</button>}
        </div>
      ) : <p style={note}>自由バックはマネージャー以上のみ可能です。</p>}
    </div>
  );
}
