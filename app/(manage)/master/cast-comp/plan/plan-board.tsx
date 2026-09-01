"use client";

// U-2（裁定101 段2-①）: 待遇オールインワンの骨格＝canonical モック（nox-cast-compensation-canonical.html）の
// 組成へ段階収斂する受け皿。①＝編集中プラン選択（新規/複製/無効化・適用人数）＋全体構成ナビ＋
// 採用方式トグル（値の有無から自動判定・保存なし＝lib/nox/comp-methods.ts の純関数）。
// ★各セクションの中身は現行 comp-sections.tsx の部品をそのまま搭載＝RPC・引数・権限出し分けは不変。
//   ②〜⑧の再区画化は後続コミット（1セクション＝1コミット）。
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SimulatorPanel from "@/components/simulator-panel";
import type { StoreSimData } from "@/lib/nox/payroll/sim-data";
import { adoptedMethodsOf, compSummaryOf } from "@/lib/nox/comp-methods";
import { AssignTab, useCompData, secTitle, type Plan } from "../comp-sections";
import PlanEditor from "./plan-editor";
import NormaBoard from "../norma/norma-board";

const card: React.CSSProperties = t.card;

// 全体構成ナビ（アンカー）＝裁定101 §4 のモック順。
const NAV = [
  ["#base", "基本給・保証"],
  ["#backs", "売上歩合・各種バック"],
  ["#slides", "ポイント制・売上スライド"],
  ["#achieve", "達成ボーナス"],
  ["#sim", "シミュレーション"],
  ["#norma", "ノルマ＋未達処理"],
  ["#assign", "キャスト割当"],
] as const;

export default function PlanBoard({ storeId, isManagerUp, isOwner, sim, normFlags }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean; sim: StoreSimData | null;
  normFlags: { salesEnabled: boolean; shimeiEnabled: boolean; shimeiScope: "hon" | "hon_jonai" };
}) {
  const supabase = createClient();
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);
  // ①: 編集中プラン（チップ選択）。詳細編集は下の「待遇プラン」表の行クリック（②で持ち上げ予定）。
  const [selId, setSelId] = useState<string | null>(null);
  const [selComps, setSelComps] = useState<{ kind: string; is_active: boolean; amount: number | null }[]>([]);
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

  return (
    <div>
      <Toast msg={msg} />

      {/* ── ①: 編集中プラン選択＋採用方式（自動判定・保存なし）＋全体構成ナビ ── */}
      <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>編集中プラン</h2>
        {/* ★裁定104 補正: 二段化＝見出し直下に編集中プラン名を大きく（チップの塗りと対＝迷子防止） */}
        {sel && (
          <div style={{ margin: "0 0 10px" }}>
            <p style={{ fontSize: 19, fontWeight: 900, color: "var(--champ)", margin: 0 }}>
              {sel.name}{!sel.is_active && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)" }}>（無効）</span>}
            </p>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: "2px 0 0" }}>適用 <span className="num">{headOf(sel.id)}</span>人</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          {data.plans.map((p) => (
            /* ★裁定104 補正: 選択中チップは塗り（既存 primary＝t.btnGold）・未選択は枠のみ（現行） */
            <button key={p.id} type="button" onClick={() => setSelId((v) => (v === p.id ? null : p.id))}
              style={selId === p.id
                ? { ...t.btnGold, ...t.btnSm }
                : { ...t.btnGhost, ...t.btnSm, color: p.is_active ? undefined : "var(--sub)" }}>
              {p.name}{!p.is_active && "（無効）"} <span className="num" style={{ color: selId === p.id ? undefined : "var(--sub)" }}>{headOf(p.id)}人</span>
            </button>
          ))}
          {data.plans.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>プランがありません（下の「待遇プラン」で新規作成）</span>}
        </div>
        {isOwner && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <a href="#base" onClick={() => setSelId(null)} style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none" }}>新規（下の編集面へ）</a>
            <button type="button" onClick={() => void duplicate()} disabled={!sel} style={{ ...t.btnGhost, ...t.btnSm, opacity: sel ? 1 : 0.5 }}>複製</button>
            <button type="button" onClick={() => void toggleActive()} disabled={!sel} style={{ ...t.btnGhost, ...t.btnSm, opacity: sel ? 1 : 0.5 }}>
              {sel?.is_active === false ? "有効化" : "無効化"}
            </button>
          </div>
        )}
        {/* 採用する待遇方式（canonical モック §採用する待遇方式）＝値の有無から自動判定・保存なし */}
        {sel && (
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 4px" }}>採用する待遇方式（自動判定・値を入れると点灯）</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {adoptedMethodsOf(sel, selComps).map((m) => (
                <span key={m.key} className="nox-stpill" style={{
                  borderColor: m.on ? "var(--gold)" : "var(--line2)",
                  color: m.on ? "var(--champ)" : "var(--sub)", opacity: m.on ? 1 : 0.7,
                }}>{m.on ? "●" : "○"} {m.label}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ★裁定104 補正: 全体構成ナビ＝sticky 化・左端に編集中プラン名を常時表示（スクロール時の迷子防止）。
          カード外の独立バー＝ancestor の overflow に依存しない。背景は既存 token var(--bg)。 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)",
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        padding: "8px 0", marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
        <b style={{ fontSize: 12.5, color: "var(--champ)", whiteSpace: "nowrap" }}>
          {sel ? sel.name : "プラン未選択"}
        </b>
        {NAV.map(([href, label]) => (
          <a key={href} href={href} style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none" }}>{label} ›</a>
        ))}
      </div>

      {/* ── ⑧: 本文（左）＋サマリー（右 sticky・派生表示＝compSummaryOf 純関数・保存なし）の2カラム。狭幅は縦積み。 ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "3 1 560px", minWidth: 0 }}>

      {/* ── ②〜⑤: セクション編集面（draft＝PlanEditor が1本で保持・節別保存/未保存・裁定101 §3） ── */}
      <PlanEditor storeId={storeId} isOwner={isOwner} plans={data.plans} backs={data.backs}
        selId={selId} setSelId={setSelId} setMsg={setMsg} reload={data.reload} />

      {/* ── ⑥ シミュレーション（既存 sim-data・計算期間日数＋委託/雇用トグルは SimulatorPanel が保持） ── */}
      {sim && (
        <div id="sim">
          <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" />
        </div>
      )}

      {/* ── ⑦ ノルマ＋未達処理（norma ページの統合＝NormaBoard をそのまま搭載・RPC/権限不変） ── */}
      <section id="norma" style={{ marginBottom: 14 }}>
        <div className="nox-cardtop" style={{ ...card, marginBottom: 10 }}>
          <h2 style={secTitle}>ノルマ＋未達処理</h2>
          {/* 裁定101 補正1: 契約区分 select は置かない（employment は cast 属性）。説明2行＋根拠確認は器なし＝準備中。 */}
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 2px" }}>雇用キャスト: 減給・罰金の法定上限（労基法91条）は給与計算側で自動制約されます（裁定98）。</p>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>委託キャスト: 未達処理には契約上の根拠が必要です（法定上限の自動適用はありません）。</p>
          <label style={{ fontSize: 12, color: "var(--sub)", opacity: 0.7 }}>
            <input type="checkbox" disabled /> 契約上の根拠を確認した（確認メモ）
            <span className="nox-stpill" style={{ marginLeft: 8 }}>準備中（penalty_config に確認記録の器なし・C5）</span>
          </label>
        </div>
        <NormaBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={isOwner} flags={normFlags} />
      </section>

      <section id="assign" className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>キャスト割当（プラン・上書き）</h2>
        <AssignTab plans={data.plans} casts={data.casts} castPlans={data.castPlans}
          isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} />
      </section>

      </div>

      {/* ── ⑧ サマリー（右カラム sticky・保存済み値の派生表示のみ＝再計算しない） ── */}
      <aside style={{ flex: "1 1 240px", minWidth: 240, position: "sticky", top: 12 }}>
        <section className="nox-cardtop" style={{ ...card, marginBottom: 0 }}>
          <h2 style={{ ...secTitle, margin: "0 0 6px" }}>サマリー</h2>
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
              <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>
                ※保存済みの値の要約です（編集中の未保存値は各節の「未保存」表示を確認）。
              </p>
            </>
          )}
        </section>
      </aside>
      </div>
    </div>
  );
}
