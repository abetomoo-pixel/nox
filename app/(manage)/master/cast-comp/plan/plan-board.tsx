"use client";

// U-2（裁定101 段2-①）→ ★裁定106（2026-09-01・canonical v3）: 待遇オールインワンを 6タブの殻へ再構成。
//   固定ヘッダ（編集中プラン select・プラン名・状態バッジ読取専用・適用中・新規/複製/無効化）＋
//   6タブ（基本・保証｜歩合・バック｜スライド・ポイント｜ノルマ・ボーナス｜シミュレーション｜キャスト割当）＋
//   右パネル（プラン概要／保存状態＝タブごと未保存件数）。
// ★draft/snapshot は PlanEditor が保持し、タブは display 切替（PlanEditor は常時マウント）＝
//   タブ移動で未保存が消えない（B1 の要件を常時マウントで満たす・set_comp_plan 16引数・c1〜c3 不変）。
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SimulatorPanel from "@/components/simulator-panel";
import type { StoreSimData } from "@/lib/nox/payroll/sim-data";
import { adoptedMethodsOf, compSummaryOf } from "@/lib/nox/comp-methods";
import { AssignTab, useCompData, secTitle, productBackArgsOf, type Plan } from "../comp-sections";
import PlanEditor from "./plan-editor";
import NormaBoard from "../norma/norma-board";

const card: React.CSSProperties = t.card;

// ★裁定106 B1: 6タブ（v3 data-tab: basic/backs/slides/quota/sim/assign と1:1）
const TABS = [
  ["base", "基本・保証"],
  ["backs", "歩合・バック"],
  ["slides", "スライド・ポイント"],
  ["quota", "ノルマ・ボーナス"],
  ["sim", "シミュレーション"],
  ["assign", "キャスト割当"],
] as const;
type TabKey = (typeof TABS)[number][0];

export default function PlanBoard({ storeId, isManagerUp, isOwner, sim, normFlags }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean; sim: StoreSimData | null;
  normFlags: { salesEnabled: boolean; shimeiEnabled: boolean; shimeiScope: "hon" | "hon_jonai" };
}) {
  const supabase = createClient();
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);
  const [tab, setTab] = useState<TabKey>("base");
  const [selId, setSelId] = useState<string | null>(null);
  const [selComps, setSelComps] = useState<{ kind: string; is_active: boolean; amount: number | null }[]>([]);
  // ★裁定106 B1: 右パネル「保存状態」＝PlanEditor からの節別未保存件数
  const [dirtyCounts, setDirtyCounts] = useState({ base: 0, backs: 0, slides: 0 });
  const sel = data.plans.find((p) => p.id === selId) ?? null;
  const headOf = (planId: string) => data.castPlans.filter((cp) => cp.plan_id === planId).length;
  // ★U-2 是正1: 初回ロード時のみ先頭の有効プランを自動選択（「新規」で外した選択を上書きしない）。
  const didInitSel = useRef(false);
  useEffect(() => {
    if (didInitSel.current || data.plans.length === 0) return;
    didInitSel.current = true;
    const first = data.plans.find((p) => p.is_active);
    if (first && !selId) setSelId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.plans]);

  useEffect(() => {
    if (!selId) { setSelComps([]); return; }
    void (async () => {
      const { data: rows } = await supabase.from("comp_plan_components")
        .select("kind, is_active, amount").eq("plan_id", selId);
      setSelComps((rows ?? []) as { kind: string; is_active: boolean; amount: number | null }[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, data.plans]);

  // 複製/無効化: set_comp_plan 16引数明示（教訓43 型＝省略で default に戻さない）。owner のみ。
  async function saveFrom(p: Plan, over: { id: string | null; name?: string; active?: boolean }) {
    const clean = (s: { at: number; wage: number }[] | null | undefined) =>
      (s ?? []).filter((r) => r.at > 0).map((r) => ({ at: r.at, wage: r.wage }));
    const { error } = await supabase.rpc("set_comp_plan", {
      p_id: over.id, p_store_id: storeId, p_name: over.name ?? p.name, p_base: p.base,
      p_hon_back: p.hon_back, p_jonai_back: p.jonai_back, p_dohan_back: p.dohan_back,
      p_sales_slide: clean(p.sales_slide), p_point_slide: clean(p.point_slide),
      p_is_active: over.active ?? p.is_active,
      p_hon_back_mode: p.hon_back_mode ?? "per_count",
      p_hon_back_rate: (p.hon_back_mode ?? "per_count") === "rate" ? p.hon_back_rate ?? 0 : null,
      p_jonai_back_mode: p.jonai_back_mode ?? "per_count",
      p_jonai_back_rate: (p.jonai_back_mode ?? "per_count") === "rate" ? p.jonai_back_rate ?? 0 : null,
      p_dohan_back_mode: "per_count", p_dohan_back_rate: null, // R-2b まで封印（裁定86-②）
      // ★mig0134（裁定113）: 複製/無効化も product_back 3項を写す（19引数全明示・省略＝default 'product_rule' で戻る事故の封じ）
      ...productBackArgsOf(p.product_back_mode, p.product_back_rate, p.product_back_fixed),
    });
    return error;
  }
  async function duplicate() {
    if (!sel) return;
    const error = await saveFrom(sel, { id: null, name: `${sel.name}のコピー` });
    setMsg(error ? error.message : `「${sel.name}」を複製しました（components は複製されません＝個別に追加）`);
    if (!error) await data.reload();
  }
  async function toggleActive() {
    if (!sel) return;
    const error = await saveFrom(sel, { id: sel.id, active: !sel.is_active });
    setMsg(error ? error.message : sel.is_active ? `「${sel.name}」を無効化しました` : `「${sel.name}」を有効化しました`);
    if (!error) await data.reload();
  }

  const isEditorTab = tab === "base" || tab === "backs" || tab === "slides" || tab === "quota";

  return (
    <div>
      <Toast msg={msg} />

      {/* ── ★裁定106 B1: 固定ヘッダ（sticky）＝プラン select・プラン名・状態バッジ・適用中・操作＋6タブ ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)", paddingBottom: 8, marginBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <section className="nox-cardtop" style={{ ...card, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "var(--sub)" }}>編集中プラン{" "}
              <select value={selId ?? ""} onChange={(e) => setSelId(e.target.value === "" ? null : e.target.value)}
                style={{ ...t.input, width: "auto", padding: "7px 9px", fontSize: 13 }}>
                <option value="">新規プラン…</option>
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{!p.is_active ? "（無効）" : ""}</option>
                ))}
              </select>
            </label>
            {sel ? (
              <>
                <span style={{ fontSize: 18, fontWeight: 900, color: "var(--champ)" }}>{sel.name}</span>
                {/* 状態バッジ＝読み取り専用（切替は右の 無効化/有効化 ボタン） */}
                <span className="nox-stpill" style={sel.is_active
                  ? { borderColor: "rgba(119, 186, 131, .45)", color: "var(--ok)" }
                  : { borderColor: "var(--line2)", color: "var(--sub)" }}>
                  {sel.is_active ? "有効" : "無効"}
                </span>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>適用中 <b className="num" style={{ color: "var(--v2-text)" }}>{headOf(sel.id)}</b>人</span>
              </>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--champ)" }}>新規プラン（基本・保証の保存で作成）</span>
            )}
            {isOwner && (
              <span style={{ display: "inline-flex", gap: 8, marginLeft: "auto" }}>
                <button type="button" onClick={() => { setSelId(null); setTab("base"); }} style={{ ...t.btnGhost, ...t.btnSm }}>新規</button>
                <button type="button" onClick={() => void duplicate()} disabled={!sel} style={{ ...t.btnGhost, ...t.btnSm, opacity: sel ? 1 : 0.5 }}>複製</button>
                <button type="button" onClick={() => void toggleActive()} disabled={!sel} style={{ ...t.btnGhost, ...t.btnSm, opacity: sel ? 1 : 0.5 }}>
                  {sel?.is_active === false ? "有効化" : "無効化"}
                </button>
              </span>
            )}
          </div>
        </section>
        {/* 6タブ */}
        <div className="nox-seg" style={{ display: "flex", width: "100%" }}>
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} style={{ flex: 1, fontWeight: 800, fontSize: 12.5, padding: "8px 6px" }}
              onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── 本文（左）＋右パネル（プラン概要／保存状態）── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "3 1 560px", minWidth: 0 }}>

      {/* 編集4節＝PlanEditor 常時マウント（display 切替＝draft がタブ移動で消えない） */}
      <PlanEditor storeId={storeId} isOwner={isOwner} plans={data.plans} backs={data.backs}
        selId={selId} setSelId={setSelId} setMsg={setMsg} reload={data.reload}
        show={{ base: tab === "base", backs: tab === "backs", slides: tab === "slides", achieve: tab === "quota" }}
        onDirtyCounts={setDirtyCounts} />

      {/* ノルマ・ボーナス タブ下段＝店共通（全プラン）: 現行 norma-board をそのまま搭載（契約区分はプランに置かない） */}
      <div style={{ display: tab === "quota" ? undefined : "none" }}>
        <div className="nox-cardtop" style={{ ...card, marginBottom: 10 }}>
          <h2 style={secTitle}>店共通（全プラン）</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 2px" }}>雇用キャスト: 減給・罰金の法定上限（労基法91条）は給与計算側で自動制約されます（裁定98）。</p>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>委託キャスト: 未達処理には契約上の根拠が必要です（法定上限の自動適用はありません）。</p>
          <label style={{ fontSize: 12, color: "var(--sub)", opacity: 0.7 }}>
            <input type="checkbox" disabled /> 契約上の根拠を確認した（確認メモ）
            <span className="nox-stpill" style={{ marginLeft: 8 }}>準備中（penalty_config に確認記録の器なし・C5）</span>
          </label>
        </div>
        <NormaBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={isOwner} flags={normFlags} />
      </div>

      {/* シミュレーション タブ（★裁定106 B2: v3 の主入力＋残りは「詳細」で畳む＝compact） */}
      {sim && (
        <div id="sim" style={{ display: tab === "sim" ? undefined : "none" }}>
          <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" compact />
        </div>
      )}

      {/* キャスト割当 タブ（裁定104 の行内編集＋★裁定106: 進捗列） */}
      <section id="assign" className="nox-cardtop" style={{ ...card, marginBottom: 14, display: tab === "assign" ? undefined : "none" }}>
        <h2 style={secTitle}>キャスト割当（プラン・上書き）</h2>
        <AssignTab plans={data.plans} casts={data.casts} castPlans={data.castPlans}
          isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload}
          storeId={storeId} norms={data.norms} />
      </section>

      </div>

      {/* ── 右パネル: プラン概要／保存状態（タブごと未保存件数） ── */}
      <aside style={{ flex: "1 1 240px", minWidth: 240, position: "sticky", top: 96 }}>
        <section className="nox-cardtop" style={{ ...card, marginBottom: 10 }}>
          <h2 style={{ ...secTitle, margin: "0 0 6px" }}>プラン概要</h2>
          {!sel ? (
            <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>プランを選択すると構成を表示</p>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 800, color: "var(--champ)", margin: "0 0 6px" }}>
                {sel.name}{!sel.is_active && "（無効）"}
              </p>
              {compSummaryOf(sel, selComps, headOf(sel.id)).map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "2px 0" }}>
                  <span style={{ color: "var(--sub)" }}>{r.label}</span>
                  <span className="num">{r.value}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                {adoptedMethodsOf(sel, selComps).filter((m) => m.on).map((m) => (
                  <span key={m.key} className="nox-stpill" style={{ borderColor: "var(--gold)", color: "var(--champ)" }}>{m.label}</span>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="nox-cardtop" style={{ ...card, marginBottom: 0 }}>
          <h2 style={{ ...secTitle, margin: "0 0 6px" }}>保存状態</h2>
          {([["基本・保証", dirtyCounts.base], ["歩合・バック", dirtyCounts.backs], ["スライド・ポイント", dirtyCounts.slides]] as const).map(([label, n]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "2px 0" }}>
              <span style={{ color: "var(--sub)" }}>{label}</span>
              <span style={{ fontWeight: 800, color: n > 0 ? "var(--gold2)" : "var(--ok)" }}>{n > 0 ? `未保存 ${n}件` : "保存済み"}</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 0" }}>
            ※達成ボーナス・自由バック・割当は行単位で即保存（未保存は発生しません）。
          </p>
        </section>
      </aside>
      </div>
      {isEditorTab && null}
    </div>
  );
}
