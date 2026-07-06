"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// F2a-4: 報酬設計マスタ 6タブ（プラン/割当/ノルマ/控除/罰金・閾値/自由バック）。
// 3層防御の UI 層: layout でロール分岐（cast は到達不能）＋本コンポーネントで D3a 出し分け。
//   最終防衛は DB（set_comp_plan/set_penalty_config は owner のみ・他は manager 以上＝mig0013）。
// owner 専用（D3a）: プランの編集フォーム・罰金/閾値フォーム。manager は閲覧のみ（フォーム非表示）。

type Slide = { at: number; wage: number };
type Plan = {
  id: string; name: string; base: number; hon_back: number; jonai_back: number; dohan_back: number;
  sales_slide: Slide[]; point_slide: Slide[]; is_active: boolean;
};
type CastRow = { id: string; name: string };
type CastPlan = { cast_id: string; plan_id: string; overrides_json: Record<string, number> };
type Norm = { id: string; cast_id: string; period: string; days_target: number; dohan_target: number };
type Deduction = { id: string; name: string; amount: number; per: string; is_active: boolean };
type BackDef = { id: string; name: string; basis: string; value: number; cond_json: { metric: string; min: number } | null; is_active: boolean };
type Penalty = {
  fine_absent: number; fine_late: number; hours_per_shift: number; norm_on: boolean;
  norm_days_flat: number; norm_days_per: number; norm_dohan_flat: number; norm_dohan_per: number;
  late_grace_min: number; early_grace_min: number; over_grace_min: number;
};

const METRICS = ["hon", "jonai", "dohan", "days", "sales", "pt", "champCnt", "bottleCnt"] as const;

const card: React.CSSProperties = { border: "1px solid #ebebeb", borderRadius: 8, padding: 14, background: "#fff", marginBottom: 14 };
const input: React.CSSProperties = { padding: 6, border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 };
const btnDark: React.CSSProperties = { padding: "6px 14px", borderRadius: 6, border: "none", background: "#16161a", color: "#fff", cursor: "pointer", fontSize: 13 };
const btnLight: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", cursor: "pointer", fontSize: 12 };
const tabBtn = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 6, border: "1px solid " + (on ? "#16161a" : "#e0e0e0"),
  background: on ? "#16161a" : "#fff", color: on ? "#fff" : "#404040", cursor: "pointer", fontSize: 13,
});
const note: React.CSSProperties = { fontSize: 12, color: "#8f8f8f" };

const DEFAULT_PENALTY: Penalty = {
  fine_absent: 10000, fine_late: 3000, hours_per_shift: 5, norm_on: true,
  norm_days_flat: 5000, norm_days_per: 2000, norm_dohan_flat: 3000, norm_dohan_per: 1500,
  late_grace_min: 10, early_grace_min: 30, over_grace_min: 90,
};

type Tab = "plan" | "assign" | "norm" | "deduction" | "penalty" | "back";

export default function CompMaster({ storeId, isManagerUp, isOwner }: { storeId: string; isManagerUp: boolean; isOwner: boolean }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("plan");
  const [msg, setMsg] = useState<string | null>(null);

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
      supabase.from("cast_plan").select("cast_id, plan_id, overrides_json"),
      supabase.from("cast_norms").select("id, cast_id, period, days_target, dohan_target").order("period"),
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

  return (
    <section style={card}>
      <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>報酬設計マスタ</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {([["plan", "プラン"], ["assign", "割当"], ["norm", "ノルマ"], ["deduction", "控除"], ["penalty", "罰金・閾値"], ["back", "自由バック"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} style={tabBtn(tab === t)} onClick={() => { setTab(t); setMsg(null); }}>{label}</button>
        ))}
      </div>
      {msg && <p style={{ fontSize: 13, color: "#404040" }}>{msg}</p>}

      {tab === "plan" && <PlanTab plans={plans} isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={load} />}
      {tab === "assign" && <AssignTab plans={plans} casts={casts} castPlans={castPlans} isManagerUp={isManagerUp} setMsg={setMsg} reload={load} />}
      {tab === "norm" && <NormTab casts={casts} norms={norms} isManagerUp={isManagerUp} setMsg={setMsg} reload={load} />}
      {tab === "deduction" && <DeductionTab deductions={deductions} isManagerUp={isManagerUp} storeId={storeId} setMsg={setMsg} reload={load} />}
      {tab === "penalty" && <PenaltyTab penalty={penalty} setPenalty={setPenalty} exists={penaltyExists} isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={load} />}
      {tab === "back" && <BackTab backs={backs} isManagerUp={isManagerUp} storeId={storeId} setMsg={setMsg} reload={load} />}
    </section>
  );
}

// ── プラン（owner のみ編集・D3a）──
function SlideInput({ label, slide, setSlide }: { label: string; slide: Slide[]; setSlide: (s: Slide[]) => void }) {
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

function PlanTab({ plans, isOwner, storeId, setMsg, reload }: { plans: Plan[]; isOwner: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [base, setBase] = useState(0);
  const [honBack, setHonBack] = useState(0);
  const [jonaiBack, setJonaiBack] = useState(0);
  const [dohanBack, setDohanBack] = useState(0);
  const [salesSlide, setSalesSlide] = useState<Slide[]>([]);
  const [pointSlide, setPointSlide] = useState<Slide[]>([]);
  const [active, setActive] = useState(true);

  function edit(p: Plan) {
    setId(p.id); setName(p.name); setBase(p.base); setHonBack(p.hon_back);
    setJonaiBack(p.jonai_back); setDohanBack(p.dohan_back);
    setSalesSlide(p.sales_slide ?? []); setPointSlide(p.point_slide ?? []); setActive(p.is_active);
  }
  const clean = (s: Slide[]) => s.filter((r) => r.at > 0).map((r) => ({ at: r.at, wage: r.wage }));
  async function save() {
    const { error } = await supabase.rpc("set_comp_plan", {
      p_id: id, p_store_id: storeId, p_name: name, p_base: base,
      p_hon_back: honBack, p_jonai_back: jonaiBack, p_dohan_back: dohanBack,
      p_sales_slide: clean(salesSlide), p_point_slide: clean(pointSlide),
      p_is_active: active, // 明示 boolean（原則7）
    });
    setMsg(error ? error.message : id ? "プランを更新しました" : "プランを登録しました");
    if (!error) { setId(null); setName(""); setBase(0); await reload(); }
  }

  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>{["名称", "保証", "本", "場内", "同伴", "売上段", "pt段", "状態"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} onClick={() => isOwner && edit(p)} style={{ borderBottom: "1px solid #f4f4f5", cursor: isOwner ? "pointer" : "default" }}>
              <td style={{ padding: 6 }}>{p.name}</td>
              <td style={{ padding: 6 }}>{p.base}</td>
              <td style={{ padding: 6 }}>{p.hon_back}</td>
              <td style={{ padding: 6 }}>{p.jonai_back}</td>
              <td style={{ padding: 6 }}>{p.dohan_back}</td>
              <td style={{ padding: 6 }}>{(p.sales_slide ?? []).length}段</td>
              <td style={{ padding: 6 }}>{(p.point_slide ?? []).length}段</td>
              <td style={{ padding: 6 }}>{p.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isOwner ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="プラン名" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} />
          <label style={{ fontSize: 12 }}>保証時給 <input type="number" min={0} value={base} onChange={(e) => setBase(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          <label style={{ fontSize: 12 }}>本 <input type="number" min={0} value={honBack} onChange={(e) => setHonBack(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          <label style={{ fontSize: 12 }}>場内 <input type="number" min={0} value={jonaiBack} onChange={(e) => setJonaiBack(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          <label style={{ fontSize: 12 }}>同伴 <input type="number" min={0} value={dohanBack} onChange={(e) => setDohanBack(Number(e.target.value))} style={{ ...input, width: 70 }} /></label>
          <div style={{ display: "flex", gap: 16, width: "100%" }}>
            <SlideInput label="売上スライド" slide={salesSlide} setSlide={setSalesSlide} />
            <SlideInput label="ポイントスライド" slide={pointSlide} setSlide={setPointSlide} />
          </div>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button style={btnDark} onClick={save}>{id ? "更新" : "登録"}</button>
          {id && <button style={btnLight} onClick={() => { setId(null); setName(""); }}>新規に戻す</button>}
        </div>
      ) : <p style={note}>プランの編集はオーナーのみ可能です（閲覧のみ）。</p>}
    </div>
  );
}

// ── 割当（manager 以上・inactive プランは選択肢に出さない）──
function AssignTab({ plans, casts, castPlans, isManagerUp, setMsg, reload }: { plans: Plan[]; casts: CastRow[]; castPlans: CastPlan[]; isManagerUp: boolean; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [castId, setCastId] = useState("");
  const [planId, setPlanId] = useState("");
  const [ov, setOv] = useState<Record<string, string>>({ base: "", honBack: "", jonaiBack: "", dohanBack: "" });
  const activePlans = plans.filter((p) => p.is_active); // inactive は割当不可（DB も 'plan inactive' で拒否）
  const planName = (pid: string) => plans.find((p) => p.id === pid)?.name ?? "(不明)";
  const castName = (cid: string) => casts.find((c) => c.id === cid)?.name ?? cid;

  async function save() {
    const overrides: Record<string, number> = {};
    for (const k of ["base", "honBack", "jonaiBack", "dohanBack"]) {
      if (ov[k] !== "") overrides[k] = Number(ov[k]);
    }
    const { error } = await supabase.rpc("set_cast_plan", { p_cast_id: castId, p_plan_id: planId, p_overrides: overrides });
    setMsg(error ? error.message : "割当を保存しました");
    if (!error) await reload();
  }

  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>{["キャスト", "プラン", "上書き"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>
          {castPlans.map((cp) => (
            <tr key={cp.cast_id} style={{ borderBottom: "1px solid #f4f4f5" }}>
              <td style={{ padding: 6 }}>{castName(cp.cast_id)}</td>
              <td style={{ padding: 6 }}>{planName(cp.plan_id)}</td>
              <td style={{ padding: 6 }}>{Object.keys(cp.overrides_json ?? {}).length ? JSON.stringify(cp.overrides_json) : "—"}</td>
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
          {(["base", "honBack", "jonaiBack", "dohanBack"] as const).map((k) => (
            <label key={k} style={{ fontSize: 12 }}>{k}↑ <input type="number" min={0} value={ov[k]} placeholder="既定" onChange={(e) => setOv((o) => ({ ...o, [k]: e.target.value }))} style={{ ...input, width: 64 }} /></label>
          ))}
          <button style={btnDark} onClick={save} disabled={!castId || !planId}>割当</button>
        </div>
      ) : <p style={note}>割当はマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── ノルマ（manager 以上）──
function NormTab({ casts, norms, isManagerUp, setMsg, reload }: { casts: CastRow[]; norms: Norm[]; isManagerUp: boolean; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [castId, setCastId] = useState("");
  const [period, setPeriod] = useState("");
  const [days, setDays] = useState(0);
  const [dohan, setDohan] = useState(0);
  const castName = (cid: string) => casts.find((c) => c.id === cid)?.name ?? cid;

  async function save() {
    const { error } = await supabase.rpc("set_cast_norm", { p_cast_id: castId, p_period: period, p_days_target: days, p_dohan_target: dohan });
    setMsg(error ? error.message : "ノルマを保存しました");
    if (!error) await reload();
  }
  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>{["キャスト", "期間", "日数目標", "同伴目標"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>
          {norms.map((n) => (
            <tr key={n.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
              <td style={{ padding: 6 }}>{castName(n.cast_id)}</td>
              <td style={{ padding: 6 }}>{n.period}</td>
              <td style={{ padding: 6 }}>{n.days_target}</td>
              <td style={{ padding: 6 }}>{n.dohan_target}</td>
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
          <input placeholder="2026-07" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...input, width: 90 }} />
          <label style={{ fontSize: 12 }}>日数 <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...input, width: 64 }} /></label>
          <label style={{ fontSize: 12 }}>同伴 <input type="number" min={0} value={dohan} onChange={(e) => setDohan(Number(e.target.value))} style={{ ...input, width: 64 }} /></label>
          <button style={btnDark} onClick={save} disabled={!castId || !period}>保存</button>
        </div>
      ) : <p style={note}>ノルマはマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── 控除（manager 以上）──
function DeductionTab({ deductions, isManagerUp, storeId, setMsg, reload }: { deductions: Deduction[]; isManagerUp: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [per, setPer] = useState("day");
  const [active, setActive] = useState(true);
  function edit(d: Deduction) { setId(d.id); setName(d.name); setAmount(d.amount); setPer(d.per); setActive(d.is_active); }
  async function save() {
    const { error } = await supabase.rpc("set_deduction", { p_id: id, p_store_id: storeId, p_name: name, p_amount: amount, p_per: per, p_is_active: active });
    setMsg(error ? error.message : id ? "控除を更新しました" : "控除を登録しました");
    if (!error) { setId(null); setName(""); setAmount(0); await reload(); }
  }
  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>{["名称", "額", "単位", "状態"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>
          {deductions.map((d) => (
            <tr key={d.id} onClick={() => isManagerUp && edit(d)} style={{ borderBottom: "1px solid #f4f4f5", cursor: isManagerUp ? "pointer" : "default" }}>
              <td style={{ padding: 6 }}>{d.name}</td>
              <td style={{ padding: 6 }}>{d.per === "rate" ? `${d.amount}%` : d.amount}</td>
              <td style={{ padding: 6 }}>{d.per}</td>
              <td style={{ padding: 6 }}>{d.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="名称（送り代等）" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} />
          <label style={{ fontSize: 12 }}>額 <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          <select value={per} onChange={(e) => setPer(e.target.value)} style={input}>
            <option value="day">日ごと</option><option value="month">月ごと</option><option value="rate">売上%</option>
          </select>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 有効</label>
          <button style={btnDark} onClick={save}>{id ? "更新" : "登録"}</button>
          {id && <button style={btnLight} onClick={() => { setId(null); setName(""); }}>新規に戻す</button>}
        </div>
      ) : <p style={note}>控除はマネージャー以上のみ可能です。</p>}
    </div>
  );
}

// ── 罰金・突合閾値（owner のみ・D3a・全12引数明示送信＝原則7）──
function PenaltyTab({ penalty, setPenalty, exists, isOwner, storeId, setMsg, reload }: { penalty: Penalty; setPenalty: (p: Penalty) => void; exists: boolean; isOwner: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
  const supabase = createClient();
  const num = (k: keyof Penalty) => (
    <label style={{ fontSize: 12 }}>{k} <input type="number" min={0} value={penalty[k] as number}
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
    setMsg(error ? error.message : "罰金・閾値を保存しました");
    if (!error) await reload();
  }
  return (
    <div>
      <p style={note}>{exists ? "現在の設定（店1行）" : "未設定（既定値・保存で作成）"}</p>
      {isOwner ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {num("fine_absent")}{num("fine_late")}{num("hours_per_shift")}
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={penalty.norm_on} onChange={(e) => setPenalty({ ...penalty, norm_on: e.target.checked })} /> ノルマ罰金 on</label>
          {num("norm_days_flat")}{num("norm_days_per")}{num("norm_dohan_flat")}{num("norm_dohan_per")}
          {num("late_grace_min")}{num("early_grace_min")}{num("over_grace_min")}
          <button style={btnDark} onClick={save}>保存</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#404040" }}>
          <p style={note}>罰金・閾値の編集はオーナーのみ可能です（閲覧のみ）。</p>
          当欠 {penalty.fine_absent} / 遅刻 {penalty.fine_late} / 遅刻猶予 {penalty.late_grace_min}分 / 早退 {penalty.early_grace_min}分 / 残留 {penalty.over_grace_min}分
        </div>
      )}
    </div>
  );
}

// ── 自由バック（manager 以上・cond {metric,min} 任意）──
function BackTab({ backs, isManagerUp, storeId, setMsg, reload }: { backs: BackDef[]; isManagerUp: boolean; storeId: string; setMsg: (m: string) => void; reload: () => Promise<void> }) {
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
    setMsg(error ? error.message : id ? "自由バックを更新しました" : "自由バックを登録しました");
    if (!error) { setId(null); setName(""); setValue(0); setCondOn(false); await reload(); }
  }
  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginBottom: 10 }}>
        <thead><tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>{["名称", "基準", "値", "条件", "状態"].map((h) => <th key={h} style={{ padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>
          {backs.map((b) => (
            <tr key={b.id} onClick={() => isManagerUp && edit(b)} style={{ borderBottom: "1px solid #f4f4f5", cursor: isManagerUp ? "pointer" : "default" }}>
              <td style={{ padding: 6 }}>{b.name}</td>
              <td style={{ padding: 6 }}>{b.basis}</td>
              <td style={{ padding: 6 }}>{b.basis === "sales" ? `${b.value}%` : b.value}</td>
              <td style={{ padding: 6 }}>{b.cond_json ? `${b.cond_json.metric}≥${b.cond_json.min}` : "—"}</td>
              <td style={{ padding: 6 }}>{b.is_active ? "有効" : "無効"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isManagerUp ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={note}>{id ? "編集中" : "新規"}</span>
          <input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 140 }} />
          <select value={basis} onChange={(e) => setBasis(e.target.value)} style={input}>
            <option value="flat">flat（定額）</option>
            {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>値{basis === "sales" ? "%" : ""} <input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ ...input, width: 80 }} /></label>
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={condOn} onChange={(e) => setCondOn(e.target.checked)} /> 達成条件</label>
          {condOn && (
            <>
              <select value={condMetric} onChange={(e) => setCondMetric(e.target.value)} style={input}>
                {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
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
