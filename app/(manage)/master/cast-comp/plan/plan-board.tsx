"use client";

// U-2（裁定101 段2-①）: 待遇オールインワンの骨格＝canonical モック（nox-cast-compensation-canonical.html）の
// 組成へ段階収斂する受け皿。①＝編集中プラン選択（新規/複製/無効化・適用人数）＋全体構成ナビ＋
// 採用方式トグル（値の有無から自動判定・保存なし＝lib/nox/comp-methods.ts の純関数）。
// ★各セクションの中身は現行 comp-sections.tsx の部品をそのまま搭載＝RPC・引数・権限出し分けは不変。
//   ②〜⑧の再区画化は後続コミット（1セクション＝1コミット）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SimulatorPanel from "@/components/simulator-panel";
import type { StoreSimData } from "@/lib/nox/payroll/sim-data";
import { adoptedMethodsOf, type AdoptCompShape } from "@/lib/nox/comp-methods";
import { AssignTab, useCompData, secTitle, type Plan } from "../comp-sections";
import PlanEditor from "./plan-editor";

const card: React.CSSProperties = t.card;

// 全体構成ナビ（アンカー）＝裁定101 §4 のモック順。
const NAV = [
  ["#base", "基本給・保証"],
  ["#backs", "売上歩合・各種バック"],
  ["#slides", "ポイント制・売上スライド"],
  ["#achieve", "達成ボーナス"],
  ["#sim", "シミュレーション"],
  ["#assign", "キャスト割当"],
] as const;

export default function PlanBoard({ storeId, isManagerUp, isOwner, sim }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean; sim: StoreSimData | null;
}) {
  const supabase = createClient();
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);
  // ①: 編集中プラン（チップ選択）。詳細編集は下の「待遇プラン」表の行クリック（②で持ち上げ予定）。
  const [selId, setSelId] = useState<string | null>(null);
  const [selComps, setSelComps] = useState<AdoptCompShape[]>([]);
  const sel = data.plans.find((p) => p.id === selId) ?? null;
  const headOf = (planId: string) => data.castPlans.filter((cp) => cp.plan_id === planId).length;

  useEffect(() => {
    if (!selId) { setSelComps([]); return; }
    void (async () => {
      const { data: rows } = await supabase.from("comp_plan_components")
        .select("kind, is_active").eq("plan_id", selId);
      setSelComps((rows ?? []) as AdoptCompShape[]);
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          {data.plans.map((p) => (
            <button key={p.id} type="button" onClick={() => setSelId((v) => (v === p.id ? null : p.id))}
              style={{
                ...t.btnGhost, ...t.btnSm,
                borderColor: selId === p.id ? "var(--gold)" : undefined,
                color: p.is_active ? undefined : "var(--sub)",
              }}>
              {p.name}{!p.is_active && "（無効）"} <span className="num" style={{ color: "var(--sub)" }}>{headOf(p.id)}人</span>
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
            {sel && <span style={{ fontSize: 12, color: "var(--sub)" }}>選択中: {sel.name}（適用 {headOf(sel.id)}人）</span>}
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
        {/* 全体構成ナビ */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NAV.map(([href, label]) => (
            <a key={href} href={href} style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none" }}>{label} ›</a>
          ))}
        </div>
      </section>

      {/* ── ②〜⑤: セクション編集面（draft＝PlanEditor が1本で保持・節別保存/未保存・裁定101 §3） ── */}
      <PlanEditor storeId={storeId} isOwner={isOwner} plans={data.plans} backs={data.backs}
        selId={selId} setSelId={setSelId} setMsg={setMsg} reload={data.reload} />

      {/* ── ⑥ シミュレーション（既存 sim-data・計算期間日数＋委託/雇用トグルは SimulatorPanel が保持） ── */}
      {sim && (
        <div id="sim">
          <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" />
        </div>
      )}

      <section id="assign" className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>キャスト割当（プラン・上書き）</h2>
        <AssignTab plans={data.plans} casts={data.casts} castPlans={data.castPlans}
          isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} />
      </section>
    </div>
  );
}
