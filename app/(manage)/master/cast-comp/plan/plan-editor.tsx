"use client";

// U-2（裁定101 段2 ②〜⑤）: 待遇プランのセクション編集面。
//   保存単位＝セクション（裁定101 §3・既存 RPC をそのまま呼ぶ・一括保存なし）。
//   plan の draft は本コンポーネントが1本で持ち、各節の「保存」は set_comp_plan 16引数**全明示**で
//   draft 全体を送る（教訓43 型＝省略で default に戻さない・rate は mode='rate' のときのみ値送信）。
//   各節に 保存済み/未保存 表示・失敗はその節だけ赤（裁定101 §3）。器なし項目は準備中バッジ（C5・起票#42）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import SegSelect from "@/components/ui/seg-select";
import { prepItemOf } from "@/lib/nox/comp-methods";
import {
  SlideInput, compErrJa, secTitle, BackTab, PRODUCT_BACK_OPTIONS, productBackArgsOf, productBackErrOf,
  type Plan, type Slide, type BackModeRow, type CompRow, type BackDef, type ProductBackMode,
} from "../comp-sections";

type Draft = {
  id: string | null; name: string; base: number; active: boolean;
  honBack: number; jonaiBack: number; dohanBack: number;
  honMode: BackModeRow; honRate: number; jonaiMode: BackModeRow; jonaiRate: number;
  salesSlide: Slide[]; pointSlide: Slide[];
  // ★裁定113/123（mig0134）: 商品販売バック3方式。rate/fixed は当該 mode のときだけ送信（他は null＝RPC pair と同条件）。
  //   値は mode 切替中も保持（hon/jonai の円/本値と同じ流儀＝裁定v）。
  productBackMode: ProductBackMode; productBackRate: number; productBackFixed: number;
};
const BLANK: Draft = {
  id: null, name: "", base: 0, active: true,
  honBack: 0, jonaiBack: 0, dohanBack: 0,
  honMode: "per_count", honRate: 0, jonaiMode: "per_count", jonaiRate: 0,
  salesSlide: [], pointSlide: [],
  productBackMode: "product_rule", productBackRate: 0, productBackFixed: 0,
};
const draftOf = (p: Plan): Draft => ({
  id: p.id, name: p.name, base: p.base, active: p.is_active,
  honBack: p.hon_back, jonaiBack: p.jonai_back, dohanBack: p.dohan_back,
  honMode: (p.hon_back_mode ?? "per_count") as BackModeRow, honRate: p.hon_back_rate ?? 0,
  jonaiMode: (p.jonai_back_mode ?? "per_count") as BackModeRow, jonaiRate: p.jonai_back_rate ?? 0,
  salesSlide: p.sales_slide ?? [], pointSlide: p.point_slide ?? [],
  productBackMode: p.product_back_mode ?? "product_rule",
  productBackRate: p.product_back_rate ?? 0, productBackFixed: p.product_back_fixed ?? 0,
});
const PB_KEYS: (keyof Draft)[] = ["productBackMode", "productBackRate", "productBackFixed"];

// 準備中バッジ（C5＝lib/nox/comp-methods.ts PREP_ITEMS が正本・散在リテラルにしない）
function Prep({ k }: { k: string }) {
  const p = prepItemOf(k);
  if (!p) return null;
  return (
    <span className="nox-stpill" title={p.unlock ?? "器は未実装（C5）"} style={{ opacity: 0.8 }}>
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
        <table className="nox-table" style={{ marginBottom: 8 }}>
          <thead><tr>{["金額", "判定", "状態"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => { if (!isOwner) return; setEditId(c.id); setAmount(c.amount ?? 0); setActive(c.is_active); }}
                style={{ cursor: isOwner ? "pointer" : "default" }}>
                <td className="num">¥{(c.amount ?? 0).toLocaleString()}</td>
                <td>{kind === "guarantee_min" ? "月（固定）" : "達成100%・1段（固定）"}</td>
                <td style={{ color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isOwner && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>{editId ? "編集中" : "追加"}</span>
          <label style={{ fontSize: 12 }}>{kind === "guarantee_min" ? "保証額(円/月)" : "加算額(円)"}{" "}
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...t.input, width: 110 }} /></label>
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

export default function PlanEditor({ storeId, isOwner, plans, backs, selId, setSelId, setMsg, reload, show, onDirtyCounts }: {
  storeId: string; isOwner: boolean; plans: Plan[]; backs: BackDef[];
  selId: string | null; setSelId: (v: string | null) => void;
  setMsg: (m: string) => void; reload: () => Promise<void>;
  /** ★裁定106 B1: タブ表示制御＝display 切替（PlanEditor は常時マウント＝draft/snapshot がタブ移動で消えない）。
   *  省略時は全節表示（従来互換）。 */
  show?: { base: boolean; backs: boolean; slides: boolean; achieve: boolean };
  /** ★裁定106 B1: 右パネル「保存状態」用＝節ごとの未保存件数（0/1）を親へ通知。 */
  onDirtyCounts?: (c: { base: number; backs: number; slides: number }) => void;
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
  const clean = (s: Slide[]) => s.filter((r) => r.at > 0).map((r) => ({ at: r.at, wage: r.wage }));

  async function savePlan(section: string) {
    // ★mig0134: フロント検証＝RPC の pair/範囲と同条件（当該 mode の値だけ検査・RPC へ投げる前に節へ赤）
    const pbErr = productBackErrOf(draft.productBackMode, draft.productBackRate, draft.productBackFixed);
    if (pbErr) { setSecErr((e) => ({ ...e, [section]: pbErr })); return; }
    const { data: newId, error } = await supabase.rpc("set_comp_plan", {
      p_id: draft.id, p_store_id: storeId, p_name: draft.name, p_base: draft.base,
      p_hon_back: draft.honBack, p_jonai_back: draft.jonaiBack, p_dohan_back: draft.dohanBack,
      p_sales_slide: clean(draft.salesSlide), p_point_slide: clean(draft.pointSlide),
      p_is_active: draft.active,
      p_hon_back_mode: draft.honMode, p_hon_back_rate: draft.honMode === "rate" ? draft.honRate : null,
      p_jonai_back_mode: draft.jonaiMode, p_jonai_back_rate: draft.jonaiMode === "rate" ? draft.jonaiRate : null,
      p_dohan_back_mode: "per_count", p_dohan_back_rate: null, // R-2b まで封印（裁定86-②）
      // ★mig0134（裁定113/123）: 19引数全明示（原則7）。rate/fixed は当該 mode のときだけ値・他は null
      ...productBackArgsOf(draft.productBackMode, draft.productBackRate, draft.productBackFixed),
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
    const params = kind === "guarantee_min" ? { period: "month" } : { thresholds: [{ pct: 100, add: over.amount }] };
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
      <section id="base" className="nox-cardtop" style={{ ...secCard, display: vis.base ? undefined : "none" }}>
        <SecHead title="基本・保証" keys={["name", "base", "active"]} section="基本給・保証" desc="時給と保証条件を設定します。" />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
          <label style={lbl}>プラン名
            <input placeholder="プラン名" value={draft.name} onChange={(e) => d({ name: e.target.value })} style={{ ...t.input, width: 170 }} disabled={!isOwner} /></label>
          <label style={lbl}>保証時給
            <Unit pre="¥" post="円"><input type="number" min={0} value={draft.base} onChange={(e) => d({ base: Number(e.target.value) })} style={{ ...t.input, width: 90 }} disabled={!isOwner} /></Unit></label>
          <label style={{ ...lbl, flexDirection: "row", alignItems: "center", paddingBottom: 9 }}>
            <input type="checkbox" checked={draft.active} onChange={(e) => d({ active: e.target.checked })} disabled={!isOwner} /> 有効</label>
        </div>
        <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={useGuarantee} onChange={(e) => setUseGuarantee(e.target.checked)} disabled={!isOwner} />
          最低月額保証を使う<span style={{ color: "var(--sub)" }}>（月次の床・裁定96-①＝控除前総支給への差額補填）</span>
        </label>
        {useGuarantee && (
          <CompRows kind="guarantee_min" section="基本給・保証" comps={comps} isOwner={isOwner} onSave={saveComp} />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Prep k="daily_wage" /><Prep k="guarantee_hours" /><Prep k="guarantee_period" />
        </div>
      </section>

      {/* ── ③ 歩合・バック ── */}
      <section id="backs" className="nox-cardtop" style={{ ...secCard, display: vis.backs ? undefined : "none" }}>
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
                    : <Unit pre="¥" post="円/本"><input type="number" min={0} value={amt} onChange={(e) => setAmt(Number(e.target.value))} style={{ ...t.input, width: 100 }} disabled={!isOwner} /></Unit>}
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
                <Unit pre="¥" post="円/本"><input type="number" min={0} value={draft.dohanBack} onChange={(e) => d({ dohanBack: Number(e.target.value) })} style={{ ...t.input, width: 100 }} disabled={!isOwner} /></Unit>
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
                <Unit pre="¥" post="円/点"><input type="number" min={0} step={1} value={draft.productBackFixed}
                  onChange={(e) => d({ productBackFixed: Number(e.target.value) })} style={{ ...t.input, width: 90 }} disabled={!isOwner} /></Unit>
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
                <button key={n} type="button" style={{ ...t.btnGhost, ...t.btnSm, borderColor: presetName === n ? "var(--gold)" : undefined }}
                  onClick={() => { setPresetName(n); const ex = backs.find((b) => b.name === n); setPresetValue(ex?.value ?? 0); }}>
                  {n}{backs.find((b) => b.name === n) ? "（登録済）" : ""}
                </button>
              ))}
              {presetName && (
                <>
                  <label style={{ fontSize: 12 }}>{presetName} 定額(円) <input type="number" min={0} value={presetValue} onChange={(e) => setPresetValue(Number(e.target.value))} style={{ ...t.input, width: 90 }} /></label>
                  <button type="button" style={{ ...t.btnGold, ...t.btnSm }} onClick={() => void savePreset()}>プリセットを保存</button>
                </>
              )}
              {secErr["各種バック"] && <span style={{ fontSize: 12, color: "var(--bad)" }}>{secErr["各種バック"]}</span>}
            </div>
          )}
          <BackTab backs={backs} isManagerUp={isOwner} storeId={storeId} setMsg={setMsg} reload={reload} />
        </div>
      </section>

      {/* ── ④ スライド・ポイント ── */}
      <section id="slides" className="nox-cardtop" style={{ ...secCard, display: vis.slides ? undefined : "none" }}>
        <SecHead title="スライド・ポイント" keys={["salesSlide", "pointSlide"]} section="スライド" desc="売上・ポイント実績に応じた時給スライドを設定します。" />
        {/* ★裁定106 B2: 判定基準・対象は固定表示（選択は器なし＝準備中）。3段固定＝行は常に3本（4段目の器なし）。 */}
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          判定基準: <b style={{ color: "var(--v2-text)" }}>日次売上（按分後）／日次pt</b>・対象: <b style={{ color: "var(--v2-text)" }}>時給</b>（固定）
          <span className="nox-stpill" style={{ marginLeft: 8, opacity: 0.8 }}>判定基準・対象の選択: 準備中（C5）</span>
        </p>
        {/* ★N2: 段は固定列の表（規約 §6）・単位常時表示（¥ … 以上／… pt以上／¥ … 円）＝SlideInput の basis で切替 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <SlideInput label="売上スライド（3段）" desc="日次売上（按分後）を基準に翌日以降の時給へ反映。" basis="yen" slide={draft.salesSlide} setSlide={(s) => d({ salesSlide: s })} />
          <SlideInput label="ポイントスライド（3段）" desc="獲得ポイントを基準に翌日以降の時給へ反映。" basis="pt" slide={draft.pointSlide} setSlide={(s) => d({ pointSlide: s })} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Prep k="point_rules" /><Prep k="gross_profit_slide" /><Prep k="slide_ratio_col" />
        </div>
      </section>

      {/* ── ⑤ 達成ボーナス ── */}
      <section id="achieve" className="nox-cardtop" style={{ ...secCard, display: vis.achieve ? undefined : "none" }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ ...secTitle, margin: 0, fontSize: 16 }}>
            達成ボーナス<span style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)" }}> — {pname}</span>
          </h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 0" }}>目標＝キャスト別ノルマの売上目標（0／未設定は不適用・裁定96-②）。保存は行単位。</p>
          {secErr["達成ボーナス"] && <p style={{ fontSize: 12, color: "var(--bad)", margin: "4px 0 0" }}>{secErr["達成ボーナス"]}</p>}
        </div>
        <CompRows kind="achievement_bonus" section="達成ボーナス" comps={comps} isOwner={isOwner} onSave={saveComp} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Prep k="achievement_params" /><Prep k="achievement_metrics" />
        </div>
      </section>
    </div>
  );
}
