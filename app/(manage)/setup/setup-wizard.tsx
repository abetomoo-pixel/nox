"use client";

// 初期設定ウィザード v5（★便 OB-2・2026-10-29・裁定438 候補「初期設定 v5＝正本」＝docs/handoff/mock/setup_v5.html の 9 STEP を同じ文言・同じ順・同じ既定値で）。
//   STEP 1 お店（業態 5・店舗情報・営業時間・定休日）／2 席・卓／3 料金（ルール・延長パターン・VIP・指名／同伴・サービス料・税・合流）／4 メニュー／5 キャスト待遇（時給・バック・スライド 3 種・pt・ノルマ・ボーナス・売上の数え方・締め支払・源泉・前払・送り・マイページ）／
//   6 スタッフ／7 シフト・勤怠／8 会計・レジ（使う機能・店の端末・締め・手数料・現金割引・領収書）／9 確認（要確認＝v5 の checks と同じ条件）→「この内容で始める」＝lib/nox/setup/v5.ts buildV5Plan（既存 RPC・route の呼び出し列）を順に実行。
//   完了画面＝キャスト 1 人ずつ／CSV（9 列）・PIN 一覧印刷・ホームへ。入力は自動保存（localStorage＝店ごと・途中で離れても再開＝org 単位の表は 0191 setup_drafts の後）。
//   器が無い項目（V5_SAVE_MAP has=false）は画面に出して保存は「後で（マスタから）」の注記。主ボタンは中央（.nox-actions・教訓122）・iPad 横 1,024 と 390 の両方。既存の org（初期設定済み）には page が出さない。
//   UI 規約 238〜244・新トークン 0。書込は既存 RPC（v5.ts の計画）＋route 3 本（/api/staff/create・/api/kiosk/provision・/api/cast/invite）。
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import SegSelect from "@/components/ui/seg-select";
import { Message } from "@/components/ui/toast";
import {
  CSV_HEADER, PIN_RE, V5_STEPS, V5_TYPES, WD, applyType, buildV5Plan, castPlanOf, clone, genPin, kindVal, menuCount, normRule, parseCsv, rebuildBack, seatNames, slideTiersFor, v5Checks, v5DefaultState, v5TypeName,
  type V5Cast, type V5Ctx, type V5Rule, type V5State, type V5Step, type V5Type,
} from "@/lib/nox/setup/v5";
import type { ProductRow } from "@/lib/nox/setup/template-plan";

const DRAFT_KEY = (storeId: string) => `nox.setup.v5.draft.${storeId}`;
const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13, minHeight: 40 };
const lead: React.CSSProperties = { ...t.sub, fontSize: 12, margin: "4px 0 10px" };
const note: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0", lineHeight: 1.6 };
const h3: React.CSSProperties = { fontSize: 12, fontWeight: 800, margin: "14px 0 6px" };
const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 });
const yen = (n: number) => Number(n || 0).toLocaleString("ja-JP");
type RunState = { running: boolean; done: number; total: number; failedAt: number | null; error: string | null; completed: boolean; log: string[] };
type Issued = { kind: "staff" | "device" | "cast"; name: string; login: string; password: string };

function Field({ label, children, span }: { label: React.ReactNode; children: React.ReactNode; span?: boolean }) {
  return <label style={{ display: "block", gridColumn: span ? "1 / -1" : undefined }}><span style={t.fieldLabel}>{label}</span><br />{children}</label>;
}
function Money({ value, unit, onChange, pre, width = 120, step = 1 }: { value: number; unit?: string; onChange: (n: number) => void; pre?: boolean; width?: number; step?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {pre && <em style={{ fontStyle: "normal", color: "var(--sub)" }}>¥</em>}
      <input type="number" inputMode="decimal" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} className="num" style={{ ...input, width }} aria-label={unit ?? "数値"} />
      {unit && <em style={{ fontStyle: "normal", fontSize: 12, color: "var(--sub)" }}>{unit}</em>}
    </span>
  );
}
function Text({ value, onChange, placeholder, width = 200, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string; ariaLabel?: string }) {
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ ...input, width }} aria-label={ariaLabel ?? placeholder} />;
}
/** ON／OFF＋状態の 1 行（モック onoff） */
function OnOff({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div>
      <SegSelect value={on ? "on" : "off"} onChange={(v) => onChange(v === "on")} options={[["on", "ON"], ["off", "OFF"]] as const} ariaLabel={label} />
      <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>{on ? "ON・この店で使う" : "OFF・この店では使わない"}</div>
    </div>
  );
}
/** モック .opt＝左に見出しと説明・右に操作 */
function Opt({ title, sub, children, dimmed }: { title: string; sub?: React.ReactNode; children: React.ReactNode; dimmed?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)", opacity: dimmed ? 0.5 : 1 }}>
      <div style={{ flex: "1 1 240px" }}><b style={{ fontSize: 13 }}>{title}</b>{sub && <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>{sub}</div>}</div>
      <div>{children}</div>
    </div>
  );
}
const later = (why: string) => <span className="nox-stpill" style={{ marginLeft: 6, fontSize: 10.5 }} data-setup-later="1">後で（マスタから）・{why}</span>;

export default function SetupWizard({ store, counts, isOwner, initialStep, initialType }: {
  store: { id: string; name: string; setupDone: boolean; current: V5Ctx["current"] };
  counts: { seats: number; products: number; plans: number; rules: number };
  isOwner: boolean;
  /** 深いリンク（?step=1〜9・?type=cabaret＝業態が未選択ならその初期値を入れる）＝suite・actions-center 用 */
  initialStep?: number; initialType?: V5Type | null;
}) {
  const supabase = createClient();
  const today = new Date(); const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [S, setS] = useState<V5State>(() => { const d = v5DefaultState(todayYmd); d.shop.name = store.name; return d; });
  const [hydrated, setHydrated] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [saved, setSaved] = useState("入力は自動で保存されます");
  const [run, setRun] = useState<RunState>({ running: false, done: 0, total: 0, failedAt: null, error: null, completed: false, log: [] });
  const [issued, setIssued] = useState<Issued[]>([]);
  const [planIds, setPlanIds] = useState<{ basic: string | null; trial: string | null }>({ basic: null, trial: null });
  const [castMsg, setCastMsg] = useState<string | null>(null);
  const [castBusy, setCastBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const ids = useRef<{ device: string; staff: string[] }>({ device: "", staff: [] });
  const savedT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 自動保存（localStorage・店ごと）: 復元は hydration 後・変更ごとに保存・完了で消す ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY(store.id));
      if (raw) { const d = JSON.parse(raw) as { S: V5State; savedAt: string; ids?: { device: string; staff: string[] }; issued?: Issued[] }; if (d.S && d.S.type) { setS(d.S); setRestoredAt(d.savedAt); if (d.ids) ids.current = d.ids; if (d.issued) setIssued(d.issued); } }
    } catch { /* 壊れた下書きは無視 */ }
    if (!ids.current.device) ids.current.device = crypto.randomUUID();
    setHydrated(true);
  }, [store.id]);
  useEffect(() => {
    if (!hydrated || initialType == null) return;
    setS((s) => (s.type ? s : applyType(s, initialType)));
  }, [hydrated, initialType]);
  useEffect(() => { if (hydrated && typeof initialStep === "number" && initialStep >= 0 && initialStep <= 9) setS((s) => ({ ...s, step: initialStep })); }, [hydrated, initialStep]);
  useEffect(() => {
    if (!hydrated || !S.type || run.completed) return;
    try { window.localStorage.setItem(DRAFT_KEY(store.id), JSON.stringify({ S, savedAt: new Date().toISOString(), ids: ids.current, issued })); } catch { /* 容量超過などは無視 */ }
    setSaved("保存しました"); if (savedT.current) clearTimeout(savedT.current); savedT.current = setTimeout(() => setSaved("入力は自動で保存されます"), 1200);
  }, [hydrated, S, issued, run.completed, store.id]);
  function restart() { try { window.localStorage.removeItem(DRAFT_KEY(store.id)); } catch { /* noop */ } window.location.reload(); }

  const up = (f: (s: V5State) => void) => setS((prev) => { const n = clone(prev); f(n); n.dirty = true; return n; });
  const go = (i: number) => { setS((s) => ({ ...s, step: i })); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const next = () => { setS((s) => ({ ...s, done: { ...s.done, [s.step]: true }, step: s.step + 1 })); window.scrollTo({ top: 0, behavior: "smooth" }); };
  function pickType(id: V5Type) {
    const nm = v5TypeName(id);
    if (S.type && S.type !== id && S.dirty) {
      if (window.confirm(`入力した席・料金・メニュー・待遇を「${nm}」の初期値に入れ替えますか？\nキャンセルすると、入力はそのままで業態だけ「${nm}」になります。`)) setS((s) => applyType(s, id));
      else setS((s) => ({ ...s, type: id }));
    } else setS((s) => applyType(s, id));
  }
  const W = useMemo(() => v5Checks(S), [S]);
  const ctx: V5Ctx = useMemo(() => ({ storeId: store.id, current: store.current, deviceIdemKey: ids.current.device, staffIdemKeys: S.staff.map((_, i) => { if (!ids.current.staff[i]) ids.current.staff[i] = crypto.randomUUID(); return ids.current.staff[i]; }) }), [store.id, store.current, S.staff]);
  const planAll = useMemo(() => buildV5Plan(S, ctx), [S, ctx]);

  // ── 実行（この内容で始める）＝計画を順に・route は fetch・useResult は直前の結果を差す・guard は既存データで skip ──
  async function runSteps(steps: V5Step[], opts: { onIssued?: (x: Issued) => void }): Promise<{ ok: boolean; created: Record<string, unknown>; error?: string; at?: number; log: string[] }> {
    const c = { seats: counts.seats, products: counts.products, plans: counts.plans, rules: counts.rules };
    try {
      const [{ count: s }, { count: p }, { count: pl }, { count: ru }] = await Promise.all([
        supabase.from("seats").select("id", { count: "exact", head: true }).eq("store_id", store.id), supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
        supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", store.id), supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("store_id", store.id)]);
      c.seats = s ?? 0; c.products = p ?? 0; c.plans = pl ?? 0; c.rules = ru ?? 0;
    } catch { /* 件数が読めなければ props の値 */ }
    const guardOk = (st: V5Step) => st.guard === "seats_empty" ? c.seats === 0 : st.guard === "products_empty" ? c.products === 0 : st.guard === "plans_empty" ? c.plans === 0 : st.guard === "rules_empty" ? c.rules === 0 : true;
    const created: Record<string, unknown> = {}; const log: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (!guardOk(st)) { log.push(`skip: ${st.label}（既存データあり＝二重投入しない）`); continue; }
      try {
        if (st.api) {
          const res = await fetch(st.api.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(st.api.body) });
          const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok) throw new Error(String(j.error ?? `HTTP ${res.status}`));
          created[st.key] = st.api.resultKey ? j[st.api.resultKey] : j;
          if (typeof j.initial_password === "string" && typeof j.login_email === "string") opts.onIssued?.({ kind: st.api.url.includes("kiosk") ? "device" : "staff", name: String(st.api.body.label ?? st.api.body.name ?? ""), login: j.login_email, password: j.initial_password });
        } else if (st.argsOf === "product_overrides") {
          const { data, error } = await supabase.from("products").select("id, name, type, category, category_id, price, hon_pt, reorder_point, back_exempt_from_split, is_active").eq("store_id", store.id);
          if (error) throw new Error(`products 読取: ${error.message}`);
          const rows = (data ?? []) as ProductRow[];
          for (const cat of S.menu) { if (!cat.on) continue; for (const it of cat.items) { if (!it.on) continue; const r = rows.find((x) => x.name === it.n.trim()); if (!r) continue;
            const b = +it.b || 0; if (!(b > 0)) continue;
            const jo = it.byKind && it.bj !== null ? +it.bj : kindVal(it, S.kindRate.jo); const fr = it.byKind && it.bf !== null ? +it.bf : kindVal(it, S.kindRate.free);
            const args = { p_id: r.id, p_store_id: store.id, p_type: r.type, p_category: r.category, p_name: r.name, p_price: r.price, p_cost: null, p_back_mode: it.bt === "pct" ? "rate" : "unit4", p_back_value: it.bt === "pct" ? Math.round(b) : null,
              p_unit4: it.bt === "pct" ? null : { hon: Math.round(b), jonai: Math.round(jo), dohan: Math.round(b), free: Math.round(fr) }, p_hon_pt: r.hon_pt, p_is_active: r.is_active, p_reorder_point: r.reorder_point, p_category_id: r.category_id, p_back_exempt_from_split: r.back_exempt_from_split };
            const { error: e2 } = await supabase.rpc("set_product", args); if (e2) throw new Error(`${r.name}: ${e2.message}`); } }
        } else if (st.rpc) {
          const args = { ...(st.args ?? {}) };
          if (st.useResult) { const v = created[st.useResult.from]; if (typeof v !== "string") { log.push(`skip: ${st.label}（前の結果がない）`); continue; } args[st.useResult.as] = v; }
          const { data, error } = await supabase.rpc(st.rpc, args);
          if (error) throw new Error(error.message);
          created[st.key] = data;
        }
        log.push(`ok: ${st.label}`);
        setRun((r) => ({ ...r, done: i + 1, log: [...log] }));
      } catch (e) { log.push(`失敗: ${st.label} — ${(e as Error).message}`); return { ok: false, created, error: (e as Error).message, at: i, log }; }
    }
    return { ok: true, created, log };
  }
  async function execute() {
    if (run.running || !S.type) return;
    const steps = planAll.steps;
    setRun({ running: true, done: 0, total: steps.length, failedAt: null, error: null, completed: false, log: [] });
    const r = await runSteps(steps, { onIssued: (x) => setIssued((xs) => [...xs, x]) });
    if (!r.ok) { setRun({ running: false, done: r.at ?? 0, total: steps.length, failedAt: r.at ?? 0, error: r.error ?? "失敗", completed: false, log: r.log }); return; }
    const basic = r.created["comp_0"], trial = r.created["comp_1"];
    let ids2 = { basic: typeof basic === "string" ? basic : null, trial: typeof trial === "string" ? trial : null };
    if (!ids2.basic) { const { data } = await supabase.from("comp_plans").select("id, name").eq("store_id", store.id); const rows = (data ?? []) as { id: string; name: string }[]; ids2 = { basic: rows.find((x) => x.name === "基本プラン")?.id ?? rows[0]?.id ?? null, trial: rows.find((x) => x.name === "体験入店")?.id ?? null }; }
    setPlanIds(ids2);
    try { window.localStorage.removeItem(DRAFT_KEY(store.id)); } catch { /* noop */ }
    setRun({ running: false, done: steps.length, total: steps.length, failedAt: null, error: null, completed: true, log: r.log });
    setS((s) => ({ ...s, step: 9 }));
  }
  // ── 完了画面＝キャストの登録（1 人ずつ／CSV）＝castPlanOf を即時実行・招待は route ──
  async function addCast(c: V5Cast) {
    setCastBusy(true); setCastMsg(null);
    const steps = castPlanOf(c, store.id, planIds, S.payroll.okuriMode === "fixed");
    const r = await runSteps(steps, {});
    if (!r.ok) { setCastMsg(`${c.g} の登録に失敗: ${r.error}`); setCastBusy(false); return false; }
    let inv = false;
    const castId = r.created[`cast_${c.g}`];
    if (c.inv && c.mail?.trim() && typeof castId === "string") {
      const res = await fetch("/api/cast/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ castId, action: "invite", email: c.mail.trim(), idemKey: crypto.randomUUID() }) });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) { inv = true; if (typeof j.initial_password === "string") setIssued((xs) => [...xs, { kind: "cast", name: c.g, login: String(j.login_email ?? c.mail), password: j.initial_password as string }]); }
      else setCastMsg(`${c.g} は登録しました。招待に失敗: ${String(j.error ?? res.status)}`);
    }
    const pinStep = steps.find((x) => x.key.endsWith("_pin")); const pin = String((pinStep?.args as { p_pin?: string } | undefined)?.p_pin ?? c.pin);
    setS((s) => ({ ...s, casts: [...s.casts, { ...c, pin, inv }] }));
    setCastBusy(false); return true;
  }
  async function importCsv() {
    for (const r of S.csvRows.filter((x) => !x.err)) { const ok = await addCast({ g: r.c[0], n: r.c[1], st: r.c[2], kind: r.c[3], plan: r.c[4], tel: r.c[5], mail: r.c[6], pin: r.c[7] || genPin(), dist: ({ "近": "near", "中": "mid", "遠": "far" } as Record<string, string>)[r.c[8]] ?? "mid", inv: !!r.c[6], birthday: "" }); if (!ok) break; }
    setS((s) => ({ ...s, csvRows: [] }));
  }

  // ── 描画 ──
  const type = S.type; const shop = S.shop; const seats = S.seats; const list = seatNames(seats);
  const box = (i: number, title: string, rows: [string, React.ReactNode][]) => (
    <div key={title} style={{ ...t.card, padding: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h4 style={{ margin: 0, fontSize: 13 }}>{title}</h4><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => go(i)}>直す</button></div>
      <dl style={{ margin: "6px 0 0", fontSize: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>{rows.map(([k, v]) => <><dt key={k + "k"} style={{ color: "var(--sub)" }}>{k}</dt><dd key={k + "v"} style={{ margin: 0 }}>{v}</dd></>)}</dl></div>
  );
  const seatOpts = (v: string): ReadonlyArray<readonly [string, string]> => { const o: [string, string][] = [["all", "全席"]]; if (seats.counter > 0) o.push(["counter", "カウンター"]); if (seats.table > 0) o.push(["table", "テーブル"]); if (seats.vip > 0) o.push(["vip", "VIP"]); if (!o.some((x) => x[0] === v)) o.push([v, `${({ counter: "カウンター", table: "テーブル", vip: "VIP" } as Record<string, string>)[v] ?? v}（席がありません）`]); return o; };
  const slideLabel = { sales: "売上スライド", point: "ポイントスライド", rate: "報酬率スライド", none: "使用しない" }[S.pay.slide];
  const isDone = S.step === 9;

  return (
    <div className="nox-mv1 nox-setup-wrap" data-setup-v5="1" data-setup-step={S.step + 1}>
      {/* ★便 SU（M-37 (1)(2)・2026-10-30）: 正本 docs/handoff/mock/setup_v5.html の殻＝ロゴ＋見出し＋自動保存の印（.bar）・番号付きの大きなステップ（.steps・9 列）・本文（main）・下段の固定バー（1 / 9・戻る・次へ）。中身の 9 STEP は不変（突合は便 M5） */}
      <header className="nox-setup-top" data-setup-top="1">
        <div className="nox-setup-bar">
          <div className="nox-setup-mark" aria-hidden="true">N</div>
          <div><h1>NOX 初期設定{type && <span className="nox-stpill" style={{ marginLeft: 8, verticalAlign: "middle" }}>{v5TypeName(type)}</span>}</h1><div className="sub">{store.name}・あとからすべて変更できます{store.setupDone && "（設定済みの店＝再実行は既存データを二重投入しません）"}</div></div>
          <div className="save" data-setup-saved="1">{saved}</div>
        </div>
        {!isDone && (
          <ol className="nox-setup-steps" aria-label="初期設定の手順">
            {V5_STEPS.map((n, i) => { const cur = S.step === i, done = !!S.done[i] && !cur; return (
              <li key={n}><button type="button" className={done ? "done" : undefined} aria-current={cur ? "step" : undefined} disabled={i > 0 && !type} onClick={() => go(i)} data-step={i} style={{ opacity: i > 0 && !type ? 0.5 : 1 }}>
                <span className="n num">{done ? "✓" : i + 1}</span><span className="t">{n}</span></button></li>); })}
          </ol>
        )}
      </header>
      <main className="nox-setup-main" data-setup-main="1">
      {!isDone && (
        <>
          <div role="progressbar" aria-valuemin={1} aria-valuemax={9} aria-valuenow={S.step + 1} aria-label="進捗" style={{ height: 4, borderRadius: 2, background: "var(--line)", margin: "0 0 14px", overflow: "hidden" }}><div style={{ width: `${((S.step + 1) / 9) * 100}%`, height: "100%", background: "var(--gold)" }} /></div>
          {restoredAt && <p style={{ ...t.sub, fontSize: 11.5, margin: "0 0 10px" }}>途中保存した下書きを復元しました（{new Date(restoredAt).toLocaleString("ja-JP")}）。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={restart}>最初からやり直す</button></p>}
        </>
      )}

      {/* ── 1 お店 ── */}
      {S.step === 0 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>お店について</h2>
          <p style={lead}>業態を選ぶと、席・料金・メニュー・待遇・会計の初期値がその業態の一般的な形で入ります。</p>
          <h3 style={h3}>お店のタイプ</h3>
          <p style={lead}>選び直すときは、入力した内容を入れ替えるか確認します。</p>
          <div style={grid(150)}>
            {V5_TYPES.map((x) => (
              <button key={x.id} type="button" aria-pressed={type === x.id} onClick={() => pickType(x.id)} data-type={x.id}
                style={{ ...t.card, textAlign: "left", cursor: "pointer", padding: 12, border: type === x.id ? "1px solid var(--gold)" : "1px solid var(--line)", background: type === x.id ? "var(--goldface2)" : "var(--card2)", color: type === x.id ? "var(--champ)" : "var(--ink)" }}>
                <b style={{ fontSize: 14 }}>{x.name}</b><small style={{ display: "block", color: "var(--sub)" }}>{x.desc}</small><span className="num" style={{ fontSize: 11.5 }}>{x.price}</span>
              </button>))}
          </div>
          {!type && <p style={note}>タイプを選ぶと「次へ」が押せます。</p>}
          <h3 style={h3}>店舗の基本情報</h3>
          <div style={grid(220)}>
            <Field label="店舗名"><Text value={shop.name} onChange={(v) => up((s) => { s.shop.name = v; })} width="100%" ariaLabel="店舗名" /></Field>
            <Field label="住所"><Text value={shop.addr} onChange={(v) => up((s) => { s.shop.addr = v; })} width="100%" ariaLabel="住所" /></Field>
          </div>
          <div style={{ ...grid(140), marginTop: 10 }}>
            <Field label="営業開始"><input type="time" value={shop.open} onChange={(e) => up((s) => { s.shop.open = e.target.value; })} style={input} aria-label="営業開始" /></Field>
            <Field label="営業終了（翌日も可）"><input type="time" value={shop.close} onChange={(e) => up((s) => { s.shop.close = e.target.value; })} style={input} aria-label="営業終了" /></Field>
            <Field label="営業日の切替時刻"><input type="time" value={shop.cut} onChange={(e) => up((s) => { s.shop.cut = e.target.value; })} style={input} aria-label="営業日の切替時刻" /></Field>
          </div>
          <div style={{ marginTop: 10 }} data-setup-holidays="1">
            <span style={t.fieldLabel}>定休日（複数選べます・無ければ選ばない）</span>
            <div className="nox-seg" role="group" aria-label="定休日" style={{ marginTop: 4, width: "fit-content" }}>
              {WD.map((d) => <button key={d} type="button" className={shop.holidays.includes(d) ? "on" : ""} aria-pressed={shop.holidays.includes(d)} onClick={() => up((s) => { const h = s.shop.holidays; const i = h.indexOf(d); if (i >= 0) h.splice(i, 1); else h.push(d); })}>{d}</button>)}
            </div>
          </div>
          <p style={note}>営業日の切替時刻＝この時刻までの売上・出勤は前日の営業日として数えます。</p>
        </section>
      )}

      {/* ── 2 席・卓 ── */}
      {S.step === 1 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>席・卓</h2>
          <p style={lead}>レジで開く単位です。数を入れると名前を自動で付けます（あとで 1 つずつ名前を変えられます）。</p>
          <h3 style={h3}>席の数</h3>
          <div style={grid(220)}>
            <div><span style={t.fieldLabel}>カウンター（席）</span><br /><Money value={seats.counter} unit="席" onChange={(n) => up((s) => { s.seats.counter = Math.max(0, n); })} width={80} /> <span style={t.fieldLabel}>名前の頭</span> <Text value={seats.cp} onChange={(v) => up((s) => { s.seats.cp = v; })} width={60} ariaLabel="カウンターの名前の頭" /></div>
            <div><span style={t.fieldLabel}>テーブル（卓）</span><br /><Money value={seats.table} unit="卓" onChange={(n) => up((s) => { s.seats.table = Math.max(0, n); })} width={80} /> <span style={t.fieldLabel}>名前の頭</span> <Text value={seats.tp} onChange={(v) => up((s) => { s.seats.tp = v; })} width={60} ariaLabel="テーブルの名前の頭" /></div>
            <div><span style={t.fieldLabel}>VIP 席（卓）</span><br /><Money value={seats.vip} unit="卓" onChange={(n) => up((s) => { s.seats.vip = Math.max(0, n); })} width={80} /> <span style={t.fieldLabel}>名前の頭</span> <Text value={seats.vp} onChange={(v) => up((s) => { s.seats.vp = v; })} width={60} ariaLabel="VIP の名前の頭" /></div>
          </div>
          <div style={{ marginTop: 10 }}><span style={t.fieldLabel}>作られる席（{list.length}）</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{list.map(([n, v]) => <span key={n} className={`nox-stpill${v ? " warn" : ""}`}>{n}</span>)}</div></div>
          <p style={note}>VIP 席は、料金で「VIP」のルールと VIP 料金が使われます。{counts.seats > 0 && "既存の席があるときは投入しません。"}</p>
        </section>
      )}

      {/* ── 3 料金 ── */}
      {S.step === 2 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>料金</h2>
          <p style={lead}>{v5TypeName(type)}の一般的な料金で入っています。金額はそのまま直せます。</p>
          <h3 style={h3}>セット料金のルール</h3>
          <p style={lead}>時間帯・曜日・席種ごと。上ほど優先されます。</p>
          {S.rules.map((x, i) => (
            <div key={i} style={{ ...t.card, padding: 10, marginBottom: 8 }} data-rule={i}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className="nox-stpill">{i + 1}</span><Text value={x.name} onChange={(v) => up((s) => { s.rules[i].name = v; })} placeholder="ルール名" width={200} ariaLabel="ルール名" />
                {S.rules.length > 1 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} onClick={() => { if (window.confirm(`${x.name} を削除しますか？`)) up((s) => { s.rules.splice(i, 1); }); }}>このルールを削除</button>}</div>
              <div style={{ ...grid(140), marginTop: 8 }}>
                <Field label="開始"><input type="time" value={x.from} onChange={(e) => up((s) => { s.rules[i].from = e.target.value; })} style={input} aria-label="開始" /></Field>
                <Field label="終了（翌日も可）"><input type="time" value={x.to} onChange={(e) => up((s) => { s.rules[i].to = e.target.value; })} style={input} aria-label="終了" /></Field>
                <Field label="席"><SegSelect value={x.seat} onChange={(v) => up((s) => { s.rules[i].seat = v; })} options={seatOpts(x.seat)} ariaLabel="席" /></Field>
              </div>
              <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>曜日</span><div className="nox-seg" role="group" aria-label="曜日" style={{ marginTop: 4, width: "fit-content" }}>{WD.map((d) => <button key={d} type="button" className={x.days.includes(d) ? "on" : ""} aria-pressed={x.days.includes(d)} onClick={() => up((s) => { const ds = s.rules[i].days; const k = ds.indexOf(d); if (k >= 0) ds.splice(k, 1); else ds.push(d); })}>{d}</button>)}</div></div>
              <div style={{ ...grid(160), marginTop: 8 }}>
                <Field label={x.min ? "セット料金" : "チャージ"}><Money value={x.set} unit={x.min ? `／${x.min}分` : ""} pre onChange={(n) => up((s) => { s.rules[i].set = n; })} /></Field>
                {x.min > 0 && <Field label="セット時間"><Money value={x.min} unit="分" onChange={(n) => up((s) => { s.rules[i].min = n; })} width={80} /></Field>}
              </div>
              {x.min > 0 && (
                <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>延長パターン（最大 3・既定を 1 つ）</span>
                  {x.ext.map((e, j) => (
                    <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}><span style={{ fontSize: 12 }}>パターン{j + 1}</span>
                      <Money value={e[0]} unit="分" onChange={(n) => up((s) => { s.rules[i].ext[j][0] = n; })} width={70} /><Money value={e[1]} unit="円" pre onChange={(n) => up((s) => { s.rules[i].ext[j][1] = n; })} width={90} />
                      <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}><input type="radio" name={`def${i}`} checked={!!e[2]} onChange={() => up((s) => { s.rules[i].ext.forEach((y, k) => { y[2] = k === j ? 1 : 0; }); })} />既定</label>
                      {x.ext.length > 1 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { const r = s.rules[i]; const wd = r.ext[j][2]; r.ext.splice(j, 1); if (wd && r.ext.length) r.ext[0][2] = 1; })}>削除</button>}
                    </div>))}
                  {x.ext.length < 3 && <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { const r = s.rules[i]; r.ext.push([60, r.set, 0]); })}>＋ 延長パターンを追加</button></div>}
                </div>)}
            </div>))}
          <div className="nox-actions"><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { s.rules.push(normRule({ name: "新しいルール", when: "", set: s.rules[0] ? s.rules[0].set : 5000, min: 60, ext: [[30, 2500, 1]], seat: "全席", from: "", to: "", days: [] }, s.shop)); })}>＋ ルールを追加</button></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}><h3 style={{ ...h3, margin: 0 }}>VIP 料金</h3><OnOff on={S.vip.on} onChange={(v) => up((s) => { s.vip.on = v; })} label="VIP 料金" /></div>
          {S.vip.on && (<>
            <SegSelect value={S.vip.mode} onChange={(v) => up((s) => { s.vip.mode = v as "table" | "person"; })} options={[["table", "卓ごと（1 卓あたり）"], ["person", "人ごと（お客様 1 人あたり）"]] as const} ariaLabel="VIP 料金の単位" wrap />
            <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>かかるタイミング</span><SegSelect value={S.vip.per} onChange={(v) => up((s) => { s.vip.per = v as "set" | "once"; })} options={[["set", "セットごと（延長にもかかる）"], ["once", "入店時に 1 回だけ"]] as const} ariaLabel="かかるタイミング" wrap /></div>
            <div style={{ ...grid(180), marginTop: 8 }}>
              <Field label={`VIP 料金${S.vip.per === "set" ? "（セット時間あたり）" : ""}`}><Money value={S.vip.amt} unit={S.vip.mode === "table" ? "円／卓" : "円／人"} pre onChange={(n) => up((s) => { s.vip.amt = n; })} /></Field>
              {S.vip.per === "set" && <Field label="延長 1 回あたり"><Money value={S.vip.ext} unit={S.vip.mode === "table" ? "円／卓" : "円／人"} pre onChange={(n) => up((s) => { s.vip.ext = n; })} /></Field>}
            </div>
            <p style={note}>{S.vip.mode === "table" ? "人数に関係なく卓にかかります。" : "お客様の人数分かかり、途中で増えたら増えた分も足します。"}</p>
          </>)}
          <h3 style={h3}>指名・同伴</h3>
          <div style={grid(160)}>
            <Field label="本指名料"><Money value={S.fees.hon} unit="円" pre onChange={(n) => up((s) => { s.fees.hon = n; })} /></Field>
            <Field label="場内指名料"><Money value={S.fees.jo} unit="円" pre onChange={(n) => up((s) => { s.fees.jo = n; })} /></Field>
            <Field label="同伴料"><Money value={S.fees.dohan} unit="円" pre onChange={(n) => up((s) => { s.fees.dohan = n; })} /></Field>
          </div>
          <p style={note}>0 円の項目はレジに出ません。</p>
          <h3 style={h3}>サービス料・税・人数の増減</h3>
          <div style={grid(160)}>
            <Field label="サービス料（全席）"><Money value={S.svc} unit="%" onChange={(n) => up((s) => { s.svc = n; })} width={80} /></Field>
            {seats.vip > 0 && <Field label="サービス料（VIP 席）"><Money value={S.svcVip} unit="%" onChange={(n) => up((s) => { s.svcVip = n; })} width={80} /></Field>}
            <Field label="金額の表示"><SegSelect value={S.tax} onChange={(v) => up((s) => { s.tax = v as "in" | "ex"; })} options={[["in", "税込"], ["ex", "税別"]] as const} ariaLabel="金額の表示" /></Field>
          </div>
          <p style={note}>サービス料と税率・延長パターンは開卓のときに固まります（途中で設定を変えても開いている卓は変わりません）。端数の丸めだけは会計の時点の設定で掛かります。</p>
          <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>セット時間が過ぎてからお客様が増えたとき</span><SegSelect value={S.join} onChange={(v) => up((s) => { s.join = v as "join" | "extend"; })} options={[["join", "合流セット（セット料金を足す）"], ["extend", "延長だけ"]] as const} ariaLabel="人数が増えたとき" wrap /></div>
          <p style={note}>人数が減ってもセット料金は引き直しません。</p>
        </section>
      )}

      {/* ── 4 メニュー ── */}
      {S.step === 3 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>メニュー</h2>
          <p style={lead}>{v5TypeName(type)}でよく出る商品を入れています。使わない物はチェックを外すだけ。値段・バックはそのまま直せます。</p>
          <Message kind="info">いま {menuCount(S)} 品がレジに出ます。キャストのバックは商品ごとに「円（固定額）」か「%（値段に対する率）」を選べます。初期値はキャストドリンク・ボトル＝円、シャンパン＝%。次の「キャスト待遇」の率で入れ直せます。</Message>
          {S.menu.map((c, ci) => (
            <div key={ci} style={{ ...t.card, padding: 10, marginTop: 8 }} data-menu-cat={ci}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><b>{c.cat}</b><SegSelect value={c.on ? "on" : "off"} onChange={(v) => up((s) => { s.menu[ci].on = v === "on"; })} options={[["on", "使う"], ["off", "使わない"]] as const} ariaLabel={`${c.cat} を使う`} /></div>
              {c.on && (<>
                <div className="nox-tablewrap plain" style={{ marginTop: 6 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr><th style={{ ...t.th, width: 34 }}>出す</th><th style={t.th}>商品名</th><th style={t.th}>値段</th><th style={t.th}>キャストのバック（本指名・円／%）</th><th style={t.th}>キープ</th><th style={t.th}></th></tr></thead>
                  <tbody>{c.items.map((it, ii) => (
                    <>
                      <tr key={ii} style={{ opacity: it.on ? 1 : 0.55 }}>
                        <td style={t.td}><input type="checkbox" checked={it.on} aria-label={`${it.n} を出す`} onChange={(e) => up((s) => { s.menu[ci].items[ii].on = e.target.checked; })} /></td>
                        <td style={t.td}><Text value={it.n} onChange={(v) => up((s) => { s.menu[ci].items[ii].n = v; })} width="100%" ariaLabel="商品名" /></td>
                        <td style={t.td}><Money value={it.p} pre onChange={(n) => up((s) => { s.menu[ci].items[ii].p = n; })} width={90} /></td>
                        <td style={t.td}><span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Money value={it.b} pre={it.bt !== "pct"} unit={it.bt === "pct" ? "%" : ""} onChange={(n) => up((s) => { s.menu[ci].items[ii].b = n; })} width={70} />
                          <SegSelect value={it.bt ?? "yen"} onChange={(v) => up((s) => { s.menu[ci].items[ii].bt = v as "yen" | "pct"; })} options={[["yen", "円"], ["pct", "%"]] as const} ariaLabel="バックの単位" />
                          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} aria-pressed={it.byKind} onClick={() => up((s) => { const x = s.menu[ci].items[ii]; x.byKind = !x.byKind; if (!x.byKind) { x.bj = null; x.bf = null; } })}>区分ごと</button></span></td>
                        <td style={t.td}><input type="checkbox" checked={it.keep} aria-label="キープ可" onChange={(e) => up((s) => { s.menu[ci].items[ii].keep = e.target.checked; })} /></td>
                        <td style={t.td}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} aria-label="この商品を削除" onClick={() => up((s) => { s.menu[ci].items.splice(ii, 1); })}>削除</button></td>
                      </tr>
                      {it.byKind && <tr key={`${ii}k`} style={{ background: "var(--bg)" }}><td style={t.td}></td><td style={{ ...t.td, color: "var(--sub)" }}>　↳ 場内指名／フリーのとき（{it.bt === "pct" ? "%" : "円"}）{it.bt === "pct" && later("%の個別は 0191")}</td>
                        <td style={t.td} colSpan={4}><span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}><span>場内 <Money value={it.bj ?? kindVal(it, S.kindRate.jo)} onChange={(n) => up((s) => { s.menu[ci].items[ii].bj = n; })} width={70} /></span><span>フリー <Money value={it.bf ?? kindVal(it, S.kindRate.free)} onChange={(n) => up((s) => { s.menu[ci].items[ii].bf = n; })} width={70} /></span></span></td></tr>}
                    </>))}</tbody></table></div>
                <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { s.menu[ci].items.push({ n: "", p: 0, b: 0, keep: false, on: true, byKind: false, bj: null, bf: null, bt: "yen" }); })}>＋ {c.cat}に商品を追加</button></div>
              </>)}
            </div>))}
          <div className="nox-actions" style={{ marginTop: 10 }}><input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新しいカテゴリ名" style={{ ...input, maxWidth: 260 }} aria-label="新しいカテゴリ名" /><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { const nm = newCat.trim(); if (!nm) return; up((s) => { s.menu.push({ cat: nm, on: true, items: [{ n: "", p: 0, b: 0, keep: false, on: true, byKind: false, bj: null, bf: null, bt: "yen" }] }); }); setNewCat(""); }}>＋ カテゴリを追加</button></div>
          <p style={note}>{counts.products > 0 && "既存の商品があるときは投入しません。"}キープ可の商品はボトルとして登録します。</p>
        </section>
      )}

      {/* ── 5 キャスト待遇 ── */}
      {S.step === 4 && (() => { const p = S.pay, b = S.back, pr = S.payroll; const axes: [keyof V5State["normaAxes"], string, string, string, string][] = [["days", "出勤日数", "不足 1 日ごと", "円／日", "日／月"], ["hon", "本指名", "不足 1 件ごと", "円／件", "件／月"], ["dohan", "同伴", "不足 1 回ごと", "円／回", "回／月"], ["sales", "売上", "不足 1 万円ごと", "円／1 万円", "円／月"]]; return (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>キャスト待遇</h2>
          <p style={lead}>使う仕組みを選び、選んだものだけ数字を入れます。細かい設定はあとでマスタの待遇プランから。</p>
          <h3 style={h3}>時給</h3>
          <div style={grid(180)}>
            <Field label="基本時給（在籍）"><Money value={p.base} unit="円／時" pre onChange={(n) => up((s) => { s.pay.base = n; })} /></Field>
            <Field label="体験入店の時給"><Money value={p.trial} unit="円／時" pre onChange={(n) => up((s) => { s.pay.trial = n; })} /></Field>
            <Field label="体験入店の日数"><Money value={p.trialDays} unit="日" onChange={(n) => up((s) => { s.pay.trialDays = n; })} width={70} /></Field>
          </div>
          <p style={note}>体入で登録したキャストは、この時給（保証）で日数分働き、本採用で基本時給とスライドに切り替わります。</p>
          <h3 style={h3}>バック</h3>
          <p style={lead}>指名・同伴は 1 本（1 回）あたりの額。ドリンク・ボトルは値段に対する率の既定です。商品ごとに「円」か「%」をメニューで選べます。</p>
          <Opt title="ドリンクの本数バック" sub="ON＝キャストドリンク 1 杯ごとに下の率で返す。OFF＝本数では返さず、ドリンクの売上を売上小計に含めて指名率・スライドで返す（「誰のドリンクか」はレジに出ません）。"><OnOff on={S.drinkBack} onChange={(v) => up((s) => { s.drinkBack = v; })} label="ドリンクの本数バック" /></Opt>
          <div style={{ ...grid(160), marginTop: 8 }}>
            <Field label="本指名"><Money value={b.hon} unit="円／本" pre onChange={(n) => up((s) => { s.back.hon = n; })} /></Field>
            <Field label="場内指名"><Money value={b.jo} unit="円／本" pre onChange={(n) => up((s) => { s.back.jo = n; })} /></Field>
            <Field label="同伴"><Money value={b.dohan} unit="円／本" pre onChange={(n) => up((s) => { s.back.dohan = n; })} /></Field>
            {S.drinkBack ? <Field label="キャストドリンク"><Money value={b.drink} unit="%" onChange={(n) => up((s) => { s.back.drink = n; })} width={70} /></Field> : <div><span style={t.fieldLabel}>キャストドリンク</span><br /><span style={note}>本数バックは OFF</span></div>}
            <Field label="ボトル・シャンパン"><Money value={b.bottle} unit="%" onChange={(n) => up((s) => { s.back.bottle = n; })} width={70} /></Field>
          </div>
          <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { setS((s) => ({ ...rebuildBack(s), dirty: true })); setSaved("メニューのバックを入れ直しました"); }}>この率でメニューのバックを入れ直す</button></div>
          <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>指名の区分ごとの割合（メニューのバックは「本指名のとき」の値。場内・フリーはこの割合を掛けます）{later("店の割合＝0191")}</span>
            <div style={{ ...grid(140), marginTop: 4 }}>
              <Field label="本指名"><Money value={S.kindRate.hon} unit="%" onChange={(n) => up((s) => { s.kindRate.hon = n; })} width={70} /></Field>
              <Field label="場内指名"><Money value={S.kindRate.jo} unit="%" onChange={(n) => up((s) => { s.kindRate.jo = n; })} width={70} /></Field>
              <Field label="フリー（指名なし）"><Money value={S.kindRate.free} unit="%" onChange={(n) => up((s) => { s.kindRate.free = n; })} width={70} /></Field>
            </div></div>
          <p style={note}>例：シャンパン 10%・本指名 100／場内 50／フリー 30 → 本指名 10%・場内 5%・フリー 3%。商品ごとに違う店は、メニューの行の「区分ごと」で個別に入れられます。</p>
          <h3 style={h3}>時給スライド</h3>
          <p style={lead}>時給を決めるスライドは 1 つだけ選びます。</p>
          <SegSelect value={p.slide} onChange={(v) => up((s) => { s.pay.slide = v as V5State["pay"]["slide"]; s.slideTiers = slideTiersFor(s.pay.slide); })} options={[["sales", "売上スライド"], ["point", "ポイントスライド"], ["rate", "報酬率スライド"], ["none", "使用しない"]] as const} ariaLabel="時給スライド" wrap />
          {p.slide === "rate" && <p style={note}>報酬率＝決定した報酬（時給分）÷売上小計（税・サービス料前・割引前）。率が低いほど店の取り分が多いので、低い率の段ほど時給を上げる形で入れます。{later("段の写像は待遇プランで")}</p>}
          {p.slide !== "none" && (<>
            <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>判定の単位</span><SegSelect value={S.slidePeriod} onChange={(v) => up((s) => { s.slidePeriod = v as "month" | "half"; })} options={[["month", "月単位（前月の実績で今月の時給）"], ["half", "半月単位（前の半月の実績で次の半月）"]] as const} ariaLabel="判定の単位" wrap /></div>
            <p style={note}>判定は「期」ごと。段の変更は自動では確定せず、給与の「要対応」に提案として出て店が適用／除外します。</p>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>{S.slideTiers.map((tr, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontSize: 12 }}>{i + 1}段</span><Money value={tr[0]} unit={p.slide === "point" ? "pt" : p.slide === "rate" ? "%" : "円"} pre={p.slide === "sales"} onChange={(n) => up((s) => { s.slideTiers[i][0] = n; })} /><span style={{ fontSize: 12 }}>→ 時給</span><Money value={tr[1]} unit="円" pre onChange={(n) => up((s) => { s.slideTiers[i][1] = n; })} width={90} />
                {S.slideTiers.length > 1 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { s.slideTiers.splice(i, 1); })}>削除</button>}</div>))}</div>
            {S.slideTiers.length < 10 && <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { const last = s.slideTiers[s.slideTiers.length - 1] ?? [0, s.pay.base]; s.slideTiers.push([Math.round(last[0] * 1.25), last[1] + 500]); })}>＋ 段を追加（最大 10）</button></div>}
          </>)}
          {p.slide === "point" && (<>
            <h3 style={h3}>ポイントの付け方</h3><p style={lead}>本指名・同伴などに pt を付け、期間の合計で時給を決めます。</p>
            <div style={grid(150)}>
              <Field label="本指名 1 本"><Money value={S.pt.hon} unit="pt" step={0.5} onChange={(n) => up((s) => { s.pt.hon = n; })} width={70} /></Field>
              <Field label="場内指名 1 本"><Money value={S.pt.jo} unit="pt" step={0.5} onChange={(n) => up((s) => { s.pt.jo = n; })} width={70} /></Field>
              <Field label="同伴 1 件"><Money value={S.pt.dohan} unit="pt" step={0.5} onChange={(n) => up((s) => { s.pt.dohan = n; })} width={70} /></Field>
              <Field label="指名売上 1pt あたり"><Money value={S.pt.salesPer} unit="円" pre onChange={(n) => up((s) => { s.pt.salesPer = n; })} /></Field>
            </div>
          </>)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}><h3 style={{ ...h3, margin: 0 }}>ノルマ</h3><OnOff on={p.norma} onChange={(v) => up((s) => { s.pay.norma = v; })} label="ノルマ" /></div>
          {p.norma && (<>
            <p style={lead}>使う軸だけ ON にして、目標と未達のときの減額（罰金）を入れます。目標は店の既定です（プランやキャストごとに変えられます）。</p>
            {axes.map(([k, nm, perL, perU, goalU]) => { const on = S.normaAxes[k]; const pn = S.normaPen[k]; return (
              <Opt key={k} title={nm} dimmed={!on} sub={on ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}><span>目標</span><Money value={S.normaGoal[k]} unit={goalU} pre={k === "sales"} onChange={(n) => up((s) => { s.normaGoal[k] = n; })} /><span>未達のとき</span>
                <SegSelect value={pn.m} onChange={(v) => up((s) => { s.normaPen[k].m = v as "per" | "flat"; })} options={[["per", perL], ["flat", "定額"]] as const} ariaLabel={`${nm}の減額の方式`} /><Money value={pn.a} unit={pn.m === "per" ? perU : "円"} pre onChange={(n) => up((s) => { s.normaPen[k].a = n; })} width={90} /></span> : undefined}>
                <OnOff on={on} onChange={(v) => up((s) => { s.normaAxes[k] = v; })} label={nm} /></Opt>); })}
            <p className="nox-alert" style={{ fontSize: 12, margin: "8px 0 0" }}>未達の減額は自動では引きません。給与の「要対応」に提案として出て、店が適用／除外を決めてから確定します。業務委託のキャストは契約書に根拠があることが前提。雇用のキャストは就業規則に根拠があり、労働基準法 91 条の上限内で。</p>
          </>)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}><h3 style={{ ...h3, margin: 0 }}>達成ボーナス</h3><OnOff on={p.bonus} onChange={(v) => up((s) => { s.pay.bonus = v; })} label="達成ボーナス" /></div>
          {p.bonus && <div style={{ marginTop: 6 }}><span style={t.fieldLabel}>段を複数作ったとき</span><SegSelect value={S.bonusMode} onChange={(v) => up((s) => { s.bonusMode = v as "max" | "sum"; })} options={[["max", "届いた一番上の段だけ"], ["sum", "届いた段をすべて合計"]] as const} ariaLabel="段を複数作ったとき" wrap /></div>}
          <h3 style={h3}>売上の数え方（1 卓に指名が複数いるとき）</h3>
          <p style={lead}>売上スライド・ノルマ・ランキング・売上歩合のすべてに使います。</p>
          <SegSelect value={S.salesSplit} onChange={(v) => up((s) => { s.salesSplit = v as "prorate" | "equal"; })} options={[["prorate", "分配率で分ける（本指名どうしで等分・伝票ごとに変更可）"], ["equal", "指名した全員で等分（場内も含む）"]] as const} ariaLabel="売上の数え方" wrap />
          <p style={note}>例：売上 ¥60,000・本指名 A さん＋場内 B さん → 分配率＝A ¥60,000・B ¥0（レジで率を変えれば変わる）／全員で等分＝A・B とも ¥30,000。</p>
          <h3 style={h3}>給与の締め・支払い</h3>
          <div style={grid(200)}>
            <div><span style={t.fieldLabel}>給与の期間</span><br /><SegSelect value={pr.period} onChange={(v) => up((s) => { s.payroll.period = v as "month" | "half" | "daily"; })} options={[["month", "月ごと"], ["half", "半月ごと"], ["daily", "日ごと（日払いの店）"]] as const} ariaLabel="給与の期間" wrap /></div>
            <Field label={<>締め日{pr.close !== "末日" && later("末日固定＝0191")}</>}><SegSelect value={pr.close} onChange={(v) => up((s) => { s.payroll.close = v; })} options={[["末日", "末日"], ["15日", "15日"], ["20日", "20日"], ["25日", "25日"]] as const} ariaLabel="締め日" /></Field>
            <Field label="支払日（翌月）"><Money value={pr.payday} unit="日" onChange={(n) => up((s) => { s.payroll.payday = n; })} width={70} /></Field>
          </div>
          <Opt title="源泉徴収の区分（既定）" sub={<>人ごとに給与の画面で変えられます。雇用（社員・アルバイト）は「給与」＝NOX は税額を計算せず、社会保険料・源泉所得税・住民税を入れた分だけ差し引きます。{later("店の既定＝0191")}<div style={{ ...grid(200), marginTop: 8 }}>
            <div><span style={t.fieldLabel}>委託キャスト</span><br /><SegSelect value={pr.whtCast} onChange={(v) => up((s) => { s.payroll.whtCast = v as "hostess" | "none"; })} options={[["hostess", "ホステス報酬（10.21%・1 日 5,000 円×日数を控除）"], ["none", "対象外"]] as const} ariaLabel="委託キャストの源泉区分" wrap /></div>
            <div><span style={t.fieldLabel}>委託スタッフ</span><br /><SegSelect value={pr.whtStaff} onChange={(v) => up((s) => { s.payroll.whtStaff = v as "none" | "other_204"; })} options={[["none", "対象外"], ["other_204", "その他 204 条（100 万円まで 10.21%）"]] as const} ariaLabel="委託スタッフの源泉区分" wrap /></div></div></>}><span /></Opt>
          <Opt title="前払（仮払）" sub="その日に現金で先に渡し、月の給与から差し引きます。源泉はその場では引きません。"><OnOff on={pr.advance} onChange={(v) => up((s) => { s.payroll.advance = v; })} label="前払" /></Opt>
          <Opt title="日次精算（日払いの店だけ）" dimmed={pr.period !== "daily"} sub="その日の分を確定して払い、源泉は 1 日分（5,000 円控除）で計算します。給与の期間が「日ごと」の店だけ使えます（月ごと・半月ごとの店で使うと控除が二重になるため）。"><OnOff on={pr.period === "daily" && pr.settle} onChange={(v) => up((s) => { s.payroll.settle = v; })} label="日次精算" /></Opt>
          <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>送り（キャストを送る費用の扱い）</span><SegSelect value={pr.okuriMode} onChange={(v) => up((s) => { s.payroll.okuriMode = v as V5State["payroll"]["okuriMode"]; })} options={[["fixed", "定額を給与から引く（店のドライバー）"], ["actual", "タクシー代を店が立て替えて給与から引く"], ["store", "店負担（引かない）"], ["none", "送りなし"]] as const} ariaLabel="送り" wrap /></div>
          {pr.okuriMode === "fixed" && <div style={{ ...grid(160), marginTop: 8 }}>
            <Field label="近距離（1 回）"><Money value={pr.okuriTiers[0]} unit="円" pre onChange={(n) => up((s) => { s.payroll.okuriTiers[0] = n; })} width={90} /></Field>
            <Field label="中距離（1 回）"><Money value={pr.okuriTiers[1]} unit="円" pre onChange={(n) => up((s) => { s.payroll.okuriTiers[1] = n; })} width={90} /></Field>
            <Field label="遠距離（1 回）"><Money value={pr.okuriTiers[2]} unit="円" pre onChange={(n) => up((s) => { s.payroll.okuriTiers[2] = n; })} width={90} /></Field></div>}
          {pr.okuriMode === "actual" && <div style={{ marginTop: 8 }}><Field label="送りの基本額（1 回）"><Money value={pr.okuri} unit="円" pre onChange={(n) => up((s) => { s.payroll.okuri = n; })} width={90} /></Field></div>}
          <p style={note}>遅刻・当欠の精算調整は「控除・送り」であとから設定できます。源泉は精算調整やノルマ未達を引く前の額で計算し、整数で丸めます。</p>
          <h3 style={h3}>キャストのマイページに出すもの</h3>
          <p style={lead}>キャストが自分のスマホで見る画面です。打刻とシフト希望はいつも出ます。</p>
          <Opt title="給与明細" sub="確定した給与をどこまで見せるか。"><SegSelect value={pr.mypage} onChange={(v) => up((s) => { s.payroll.mypage = v as "none" | "net" | "full"; })} options={[["none", "出さない"], ["net", "手取りと期間だけ"], ["full", "明細まで"]] as const} ariaLabel="給与明細" /></Opt>
          {p.norma && <Opt title="ノルマの進捗" sub={<>今月の目標と実績のバー。{later("0191")}</>}><OnOff on={S.mine.norma} onChange={(v) => up((s) => { s.mine.norma = v; })} label="ノルマの進捗" /></Opt>}
          <Opt title="ランキング" sub={<>売上・指名の順位。金額は出しません。{S.mine.rank && <div style={{ marginTop: 6 }}><SegSelect value={S.mine.rankOthers} onChange={(v) => up((s) => { s.mine.rankOthers = v as "self" | "top"; })} options={[["self", "自分の順位だけ"], ["top", "上位の名前も出す"]] as const} ariaLabel="ランキングの出し方" /></div>}</>}><OnOff on={S.mine.rank} onChange={(v) => up((s) => { s.mine.rank = v; })} label="ランキング" /></Opt>
          <Opt title="ドリンクの申告" sub="キャストが自分でドリンクを申告し、店が承認すると給与に入ります。レジで注文を入れる店は不要。"><OnOff on={S.mine.drink} onChange={(v) => up((s) => { s.mine.drink = v; })} label="ドリンクの申告" /></Opt>
          <Opt title="打刻の修正申請" sub="出退勤の押し忘れを本人が申請できます（店の承認後に反映）。"><OnOff on={S.mine.fix} onChange={(v) => up((s) => { s.mine.fix = v; })} label="打刻の修正申請" /></Opt>
          <Opt title="遅刻・当欠の連絡" sub={<>出勤見込みや理由を店に送れます。{later("0191")}</>}><OnOff on={S.mine.late} onChange={(v) => up((s) => { s.mine.late = v; })} label="遅刻・当欠の連絡" /></Opt>
          <Opt title="指名・同伴の予約申請" sub="担当のお客様の予約を申請し、店の承認で予約になります。"><OnOff on={S.mine.resv} onChange={(v) => up((s) => { s.mine.resv = v; })} label="指名・同伴の予約申請" /></Opt>
          <Opt title="出勤ボーナス" sub={<>その日に出た人への加算を本人に見せます。{later("0191")}</>}><OnOff on={S.mine.bonus} onChange={(v) => up((s) => { s.mine.bonus = v; })} label="出勤ボーナス" /></Opt>
        </section>); })()}

      {/* ── 6 スタッフ ── */}
      {S.step === 5 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>スタッフ</h2>
          <p style={lead}>店長・ホール・キッチンなど、キャスト以外で働く人です。あとで招待メールを送ってログインしてもらいます。</p>
          <h3 style={h3}>スタッフの登録</h3>
          {S.staff.map((st, i) => (
            <div key={i} style={{ ...t.card, padding: 10, marginBottom: 8, ...grid(150) }} data-staff-row={i}>
              <Field label="名前"><Text value={st.n} onChange={(v) => up((s) => { s.staff[i].n = v; })} placeholder="例：佐藤 健一" width="100%" ariaLabel="名前" /></Field>
              <Field label="職種"><select value={st.role} onChange={(e) => up((s) => { s.staff[i].role = e.target.value; })} style={input} aria-label="職種">{["店長", "ホール", "キッチン", "送りドライバー", "その他"].map((r) => <option key={r}>{r}</option>)}</select></Field>
              <Field label="権限"><SegSelect value={st.perm} onChange={(v) => up((s) => { s.staff[i].perm = v as "manager" | "staff"; })} options={[["manager", "店長（取消・割引・締め解除まで）"], ["staff", "スタッフ"]] as const} ariaLabel="権限" wrap /></Field>
              {st.perm === "staff" ? <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 48, alignSelf: "end" }}><input type="checkbox" checked={st.shiftOk} onChange={(e) => up((s) => { s.staff[i].shiftOk = e.target.checked; })} style={{ width: 22, height: 22 }} /><span>シフトを組める</span></label> : <div />}
              <Field label="雇用形態"><select value={st.kind} onChange={(e) => up((s) => { s.staff[i].kind = e.target.value; })} style={input} aria-label="雇用形態">{["正社員", "契約社員", "アルバイト", "業務委託"].map((r) => <option key={r}>{r}</option>)}</select></Field>
              <Field label="給与"><SegSelect value={st.basis} onChange={(v) => up((s) => { s.staff[i].basis = v; })} options={[["時給", "時給"], ["月給", "月給"], ["日給", "日給"]] as const} ariaLabel="給与" /></Field>
              <Field label="金額"><Money value={st.amt} unit="円" pre onChange={(n) => up((s) => { s.staff[i].amt = n; })} /></Field>
              <Field label={<>PIN（4〜6 桁）{st.pin && !/^\d{4}$/.test(st.pin) && later("5〜6 桁は 0191")}</>}><Text value={st.pin} onChange={(v) => up((s) => { s.staff[i].pin = v.replace(/\D/g, "").slice(0, 6); })} placeholder="空なら自動" width={110} ariaLabel="PIN" /></Field>
              <div className="nox-actions" style={{ alignSelf: "end" }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} aria-label="この行を削除" onClick={() => up((s) => { s.staff.splice(i, 1); })}>削除</button></div>
            </div>))}
          <div className="nox-actions"><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { s.staff.push({ n: "", role: "ホール", perm: "staff", shiftOk: false, kind: "アルバイト", basis: "時給", amt: 1500, pin: "" }); })}>＋ スタッフを追加</button></div>
          <p style={note}>名前が空の行は登録されません。スタッフがいないお店は空のままで大丈夫です。メールアドレスや電話は、あとでスタッフ管理から入れます。「シフトを組める」スタッフは店長と同じシフトの操作ができます。業務委託のスタッフは源泉の既定が「対象外」です。初回のログインは、完了画面に出るログイン ID と初期パスワードで。</p>
        </section>
      )}

      {/* ── 7 シフト・勤怠 ── */}
      {S.step === 6 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>シフト・勤怠</h2>
          <p style={lead}>シフトの集め方と、打刻のルールです。</p>
          <h3 style={h3}>シフトの集め方{S.shift.mode === "store" && later("店が決める＝0191・いまは休み希望のみ")}</h3>
          <SegSelect value={S.shift.mode} onChange={(v) => up((s) => { s.shift.mode = v as "want" | "off" | "store"; })} options={[["want", "出たい日を出してもらう（シフト希望）"], ["off", "休みだけ出してもらう（休み希望のみ）"], ["store", "店が決めて本人に通知する"]] as const} ariaLabel="シフトの集め方" wrap />
          <p style={note}>{({ off: "休みを出していない日は「出られる日」として、シフト配置の候補になります。", want: "出たい日と時間を出してもらい、店が承認してシフトにします。", store: "店が配置した時点で確定し、本人に通知します。希望は集めません。" } as const)[S.shift.mode]}</p>
          <p style={note}>店が配置したシフトは既定で「確定」です。確定後に足した分も本人に通知されます。定休日には配置できません（特別営業日を入れたときだけ）。</p>
          {S.shift.mode !== "store" && <div style={{ ...grid(180), marginTop: 8 }}>
            <Field label="希望の締切（期間の何日前）"><Money value={S.shift.due} unit="日前" onChange={(n) => up((s) => { s.shift.due = n; })} width={70} /></Field>
            <Field label="送り返した時間の自動確定"><Money value={S.shift.auto} unit="時間後" onChange={(n) => up((s) => { s.shift.auto = n; })} width={70} /></Field></div>}
          <h3 style={h3}>最初のシフト期間</h3>
          <p style={lead}>初期設定が終わったら、この期間の希望を集め始めます（シフト画面で直せます）。</p>
          <div style={grid(160)}>
            <Field label="開始日"><input type="date" value={S.firstShift.from} onChange={(e) => up((s) => { s.firstShift.from = e.target.value; })} style={input} aria-label="開始日" /></Field>
            <Field label="終了日"><input type="date" value={S.firstShift.to} onChange={(e) => up((s) => { s.firstShift.to = e.target.value; })} style={input} aria-label="終了日" /></Field>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}><input type="checkbox" checked={S.firstShift.start} onChange={(e) => up((s) => { s.firstShift.start = e.target.checked; })} style={{ width: 22, height: 22 }} /><span>初期設定の完了と同時に募集を始める</span></label>
          <h3 style={h3}>曜日別の必要人数</h3>
          <p style={lead}>シフト作成で「足りない日」を出すのに使います。定休日は 0 になります。時間帯ごと（30 分刻み）に分けるのはシフト画面であとから。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>{WD.map((w, i) => { const hol = shop.holidays.includes(w); return <label key={w} style={{ textAlign: "center", display: "block" }}><span style={t.fieldLabel}>{w}{hol ? "（休）" : ""}</span><br /><input type="number" min={0} value={hol ? 0 : S.shift.need[i]} disabled={hol} onChange={(e) => up((s) => { s.shift.need[i] = Number(e.target.value); })} className="num" style={{ ...input, width: "100%", textAlign: "center" }} aria-label={`${w}の必要人数`} /></label>; })}</div>
          <h3 style={h3}>打刻</h3>
          <div><span style={t.fieldLabel}>打刻できる場所</span><SegSelect value={S.punch.how} onChange={(v) => up((s) => { s.punch.how = v as "device" | "any"; })} options={[["device", "店の端末（キオスク）だけ"], ["any", "本人のスマホからも"]] as const} ariaLabel="打刻できる場所" wrap /></div>
          {S.punch.how === "any" && <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>条件に合わないとき</span><SegSelect value={S.punch.judge} onChange={(v) => up((s) => { s.punch.judge = v as "soft" | "hard"; })} options={[["hard", "打刻させない"], ["soft", "打刻して記録だけ残す"]] as const} ariaLabel="条件に合わないとき" /></div>}
          <Opt title="出勤していない人はレジを使えない" sub={<>キャスト・スタッフが自分のスマホからレジ（開卓・注文・会計）を使えるのは、出勤の打刻があって退勤する前だけ。店長以上は対象外（操作は記録に残ります）。店の端末を置かないお店は OFF に。{later("打刻ゲート＝0190 の後")}</>}><OnOff on={S.punch.gate} onChange={(v) => up((s) => { s.punch.gate = v; })} label="出勤していない人はレジを使えない" /></Opt>
          <div style={{ marginTop: 8 }}><span style={t.fieldLabel}>勤務時間の丸め</span><SegSelect value={String(S.punch.round)} onChange={(v) => up((s) => { s.punch.round = Number(v) as 1 | 5 | 15 | 30; })} options={[["1", "丸めない"], ["5", "5分"], ["15", "15分"], ["30", "30分"]] as const} ariaLabel="勤務時間の丸め" /></div>
        </section>
      )}

      {/* ── 8 会計・レジ ── */}
      {S.step === 7 && (() => { const r = S.reg, rc = S.receipt; return (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>会計・レジ</h2>
          <p style={lead}>レジの使い方・支払い・領収書の設定です。</p>
          <h3 style={h3}>使う機能</h3>
          <Opt title="店の端末（キオスク）" sub="入口やレジに置く共用の iPad。打刻のほか、本人を選んで PIN を入れると、その人の権限でレジ・シフト・在庫・日報が使えます（給与・マスタ・顧客・分析は出ません）。端末ごとに専用のアカウントを発行します。"><OnOff on={r.kiosk} onChange={(v) => up((s) => { s.reg.kiosk = v; })} label="店の端末" /></Opt>
          <Opt title="売掛" sub="ツケ払い。回収はレジから。"><OnOff on={r.uri} onChange={(v) => up((s) => { s.reg.uri = v; })} label="売掛" /></Opt>
          <Opt title="キャストのレジ使用" sub="自分の卓だけ・自分のスマホから。伝票の取消・割引・手数料カットは店長以上のまま。"><SegSelect value={r.castReg} onChange={(v) => up((s) => { s.reg.castReg = v as "off" | "order" | "pay"; })} options={[["off", "使わない"], ["order", "注文まで"], ["pay", "会計まで"]] as const} ariaLabel="キャストのレジ使用" /></Opt>
          <Opt title="スタッフの割引・手数料カット" sub="スタッフ権限の人がレジで割引や手数料カットをするとき。"><SegSelect value={r.staffDisc ?? "approve"} onChange={(v) => up((s) => { s.reg.staffDisc = v as "approve" | "limit" | "no"; })} options={[["approve", "店長の承認を待つ"], ["limit", "上限内なら即時"], ["no", "できない"]] as const} ariaLabel="スタッフの割引・手数料カット" wrap /></Opt>
          {r.kiosk && (<>
            <h3 style={h3}>店の端末</h3>
            <p style={lead}>いま使っているこの iPad を店の端末として登録します（端末ごとに専用アカウント・初回ログインの端末に固定）。ほかの端末はあとでマスタ › キオスク端末から足せます。</p>
            {S.devReg ? <Message kind="success">✓ この端末を「{S.devName}」として登録します（「この内容で始める」で端末アカウントを発行し、ログイン ID と初期パスワードを完了画面に出します）。<button type="button" style={{ ...t.link, marginLeft: 8 }} onClick={() => up((s) => { s.devReg = false; })}>登録を外す</button></Message>
              : <><div style={grid(220)}><Field label="端末の名前"><Text value={S.devName} onChange={(v) => up((s) => { s.devName = v; })} width="100%" ariaLabel="端末の名前" /></Field></div><div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => up((s) => { s.devReg = true; })} data-devreg="1">この iPad を店の端末として登録</button></div></>}
          </>)}
          <h3 style={h3}>締め</h3>
          <div style={grid(220)}><Field label={<>釣銭準備金（毎日の締めの基準額）{later("0191")}</>}><Money value={S.float} unit="円" pre onChange={(n) => up((s) => { s.float = n; })} /></Field></div>
          <p style={note}>日報の締めで「レジ内の現金予定額」の起点になります。</p>
          <h3 style={h3}>カード手数料・現金割引</h3>
          <p style={lead}>カードで払うとき上乗せする率の既定値。会計のたびに「店の率／率を指定（±0.5%）／額を指定／なし」から選べます。</p>
          <Opt title="現金割引" sub={<>現金で払うお客様に割引する店の設定。領収書・日報・分析に割引額が出ます。{S.cashOff && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}><Money value={S.cashRate} unit="% OFF" step={0.5} onChange={(n) => up((s) => { s.cashRate = n; })} width={70} /><SegSelect value={S.cashBase} onChange={(v) => up((s) => { s.cashBase = v as "total" | "subtotal"; })} options={[["total", "合計から"], ["subtotal", "小計から"]] as const} ariaLabel="割引対象" /></div>}</>}><OnOff on={S.cashOff} onChange={(v) => up((s) => { s.cashOff = v; })} label="現金割引" /></Opt>
          <div style={{ ...grid(200), marginTop: 8 }}>
            <Field label="カード"><Money value={S.cardfee} unit="%" step={0.5} onChange={(n) => up((s) => { s.cardfee = n; })} width={70} /></Field>
            <Field label="端数の扱い（サービス料・税・手数料・割引）"><SegSelect value={S.round} onChange={(v) => up((s) => { s.round = v as "round" | "floor" | "ceil"; })} options={[["round", "四捨五入"], ["floor", "切り捨て"], ["ceil", "切り上げ"]] as const} ariaLabel="端数の扱い" /></Field>
          </div>
          <p style={note}>手数料はキャストの売上・ノルマ・歩合には入りません。割引は引いてから端数を丸めます。</p>
          <h3 style={h3}>領収書</h3>
          <div style={grid(200)}>
            <Field label="発行者名（店名・会社名）"><Text value={rc.name || shop.name} onChange={(v) => up((s) => { s.receipt.name = v; })} width="100%" ariaLabel="発行者名" /></Field>
            <Field label="インボイス登録番号"><Text value={rc.tno} onChange={(v) => up((s) => { s.receipt.tno = v; })} placeholder="T から始まる 13 桁" width="100%" ariaLabel="インボイス登録番号" /></Field>
            <Field label="但し書きの既定"><Text value={rc.tadashi} onChange={(v) => up((s) => { s.receipt.tadashi = v; })} width="100%" ariaLabel="但し書きの既定" /></Field>
          </div>
          <p style={note}>領収書はレジから電子（お客様の URL・90 日）でも紙でも出せます。登録番号があれば簡易インボイス（税率別の内訳付き）になり、無いお店は空のままで発行できます。</p>
        </section>); })()}

      {/* ── 9 確認 ── */}
      {S.step === 8 && (() => { const p = S.pay, r = S.reg, pr = S.payroll; return (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>確認</h2>
          <p style={lead}>この内容で始めます。あとからマスタでいつでも変えられます。</p>
          {W.length > 0 && (<div style={{ ...t.card, padding: 10, borderColor: "var(--warn, #6b5626)" }} data-setup-checks={W.length}><h3 style={{ margin: "0 0 6px", fontSize: 13 }}>要確認 {W.length} 件<span style={{ ...note, display: "inline", marginLeft: 10 }}>このまま始められます</span></h3>
            {W.map(([i, w], k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}><span>{w}</span><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => go(i - 1 < 0 ? 0 : i - 1)}>直す</button></div>)}</div>)}
          {planAll.deferred.length > 0 && <div style={{ marginTop: 10 }} data-setup-deferred={planAll.deferred.length}><Message kind="info">後で（マスタから）になる項目 {planAll.deferred.length} 件: {planAll.deferred.map((d) => `${d.item}（${d.note}）`).join("・")}</Message></div>}
          <div style={{ ...grid(260), marginTop: 10 }}>
            {box(0, "お店", [["タイプ", v5TypeName(type)], ["店舗名", shop.name], ["営業時間", `${shop.open}〜${shop.close}`], ["定休日", shop.holidays.length ? shop.holidays.join("・") : "なし"]])}
            {box(1, "席・卓", [["カウンター", `${seats.counter} 席`], ["テーブル", `${seats.table} 卓`], ["VIP", `${seats.vip} 卓`]])}
            {box(2, "料金", [["ルール", `${S.rules.length} 件`], ["VIP", S.vip.on ? `${S.vip.mode === "table" ? "卓ごと" : "人ごと"} ¥${yen(S.vip.amt)}${S.vip.per === "set" ? "／セット" : "（1 回）"}` : "使わない"], ["本指名・場内・同伴", `¥${yen(S.fees.hon)}・¥${yen(S.fees.jo)}・¥${yen(S.fees.dohan)}`], ["サービス料", `${S.svc}%${seats.vip > 0 ? `／VIP ${S.svcVip}%` : ""}`]])}
            {box(3, "メニュー", [["レジに出す商品", `${menuCount(S)} 品`], ["カテゴリ", `${S.menu.filter((c) => c.on).length} 個`]])}
            {box(4, "キャスト待遇", [["基本時給／体入", `¥${yen(p.base)}／¥${yen(p.trial)}（${p.trialDays} 日）`], ["バック（本指名・同伴）", `¥${yen(S.back.hon)}・¥${yen(S.back.dohan)}`], ["商品バックの割合（本／場内／フリー）", `${S.kindRate.hon}／${S.kindRate.jo}／${S.kindRate.free}%`], ["時給スライド", slideLabel], ["ノルマ／達成ボーナス", `${p.norma ? "使う" : "使わない"}／${p.bonus ? "使う" : "使わない"}`], ["給与", `${({ month: "月ごと", half: "半月ごと", daily: "日ごと" } as const)[pr.period]}・支払 ${pr.payday} 日`]])}
            {box(5, "スタッフ", [["登録", `${S.staff.filter((s) => s.n.trim()).length} 人`]])}
            {box(6, "シフト・勤怠", [["集め方", ({ want: "シフト希望", off: "休み希望のみ", store: "店が決める" } as const)[S.shift.mode]], ["必要人数（日〜土）", S.shift.need.map((n, i) => (shop.holidays.includes(WD[i]) ? 0 : n)).join("・")], ["最初の期間", `${S.firstShift.from.slice(5).replace("-", "/")}〜${S.firstShift.to.slice(5).replace("-", "/")}`], ["打刻", `${S.punch.how === "device" ? "店の端末だけ" : "本人のスマホからも"}・丸め ${S.punch.round === 1 ? "なし" : `${S.punch.round}分`}`]])}
            {box(7, "会計・レジ", [["キャストのレジ使用", ({ off: "使わない", order: "注文まで", pay: "会計まで" } as const)[r.castReg]], ["カード手数料", `${S.cardfee}%`], ["現金割引", S.cashOff ? `${S.cashRate}%（${S.cashBase === "total" ? "合計" : "小計"}から）` : "なし"], ["領収書", S.receipt.tno ? "登録番号あり" : "登録番号なし"], ["店の端末", r.kiosk ? (S.devReg ? `登録する（${S.devName}）` : "あとで登録") : "使わない"]])}
          </div>
          <p style={note}>書込 {planAll.steps.length} 件（店舗設定・営業時間・席・料金・商品・待遇・スタッフ・シフト・端末）。</p>
          {(run.running || run.done > 0 || run.error) && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              <div><b className="num">{run.done}</b> / {run.total} 件{run.running ? " 実行中…" : run.error ? `　失敗（${(run.failedAt ?? 0) + 1} 件目）` : ""}</div>
              {run.error && <Message kind="error">{run.error}　ここまでの書込は残っています。原因を直して「続きから再実行」を押してください（既存データは二重投入しません）。</Message>}
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--sub)", maxHeight: 180, overflowY: "auto" }}>{run.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>)}
        </section>); })()}

      {/* ── 完了 ── */}
      {isDone && (() => { const f = S.castForm; return (
        <div>
          <section className="nox-cardtop" style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
            <div style={{ fontSize: 34, color: "var(--ok)" }}>✓</div>
            <h2 style={{ ...secTitle, fontSize: 18, margin: "6px 0 4px" }}>初期設定が完了しました</h2>
            <p style={note}>続けてキャストを登録しましょう。あとからでも登録できます。店の端末では本人を選んで PIN、スマホでは招待メールからログインします。</p>
            {issued.length > 0 && (<div style={{ textAlign: "left", marginTop: 10 }} data-setup-issued={issued.length}><Message kind="warn">発行したログイン ID と初期パスワード（この画面だけ・印刷して渡してください）</Message>
              <ul style={{ fontSize: 12.5, margin: "6px 0 0", paddingLeft: 18 }}>{issued.map((x, i) => <li key={i}>{x.kind === "device" ? "店の端末" : x.kind === "staff" ? "スタッフ" : "キャスト"} {x.name}：ID <code>{x.login}</code>／初期パスワード <code>{x.password}</code></li>)}</ul></div>)}
          </section>
          <div className="nox-actions" style={{ marginTop: 10 }}><SegSelect value={S.castTab} onChange={(v) => setS((s) => ({ ...s, castTab: v as "one" | "csv" }))} options={[["one", "1 人ずつ登録"], ["csv", "CSV で一括登録"]] as const} ariaLabel="キャストの登録方法" /></div>
          {S.castTab === "one" ? (
            <section style={{ ...card, marginTop: 10 }} data-setup-cast-one="1">
              <h3 style={h3}>キャストを 1 人ずつ登録</h3>
              <div style={grid(180)}>
                <Field label="源氏名（必須）"><Text value={f.g} onChange={(v) => up((s) => { s.castForm.g = v; })} placeholder="例：ひなの" width="100%" ariaLabel="源氏名" /></Field>
                <Field label="本名"><Text value={f.n} onChange={(v) => up((s) => { s.castForm.n = v; })} placeholder="支払調書・源泉に使います" width="100%" ariaLabel="本名" /></Field>
                <Field label="生年月日（18 歳の確認）"><input type="date" value={f.birthday} onChange={(e) => up((s) => { s.castForm.birthday = e.target.value; })} style={input} aria-label="生年月日" /></Field>
                <div><span style={t.fieldLabel}>在籍区分</span><br /><SegSelect value={f.st} onChange={(v) => up((s) => { s.castForm.st = v; })} options={[["在籍", "在籍"], ["体入", "体験入店"]] as const} ariaLabel="在籍区分" /></div>
                <div><span style={t.fieldLabel}>契約区分</span><br /><SegSelect value={f.kind} onChange={(v) => up((s) => { s.castForm.kind = v; })} options={[["業務委託", "業務委託"], ["雇用", "雇用"]] as const} ariaLabel="契約区分" /></div>
                <Field label="待遇プラン"><SegSelect value={f.plan} onChange={(v) => up((s) => { s.castForm.plan = v; })} options={[["基本プラン", "基本プラン"], ["体験入店", "体験入店"]] as const} ariaLabel="待遇プラン" /></Field>
                <Field label="電話"><Text value={f.tel} onChange={(v) => up((s) => { s.castForm.tel = v; })} width="100%" ariaLabel="電話" /></Field>
                <Field label="メール（ログインの招待に使います）"><Text value={f.mail} onChange={(v) => up((s) => { s.castForm.mail = v; })} width="100%" ariaLabel="メール" /></Field>
                <Field label="PIN（店の端末で本人を選んだ後に入れる・4〜6 桁）"><Text value={f.pin} onChange={(v) => up((s) => { s.castForm.pin = v.replace(/\D/g, "").slice(0, 6); })} placeholder="空なら自動で振ります" width="100%" ariaLabel="PIN" /></Field>
                {S.payroll.okuriMode === "fixed" && <div><span style={t.fieldLabel}>送りの距離区分</span><br /><SegSelect value={f.dist} onChange={(v) => up((s) => { s.castForm.dist = v; })} options={[["near", "近"], ["mid", "中"], ["far", "遠"]] as const} ariaLabel="送りの距離区分" /></div>}
                <label style={{ display: "flex", gap: 10, alignItems: "center", alignSelf: "end", minHeight: 48 }}><input type="checkbox" checked={f.invite} onChange={(e) => up((s) => { s.castForm.invite = e.target.checked; })} style={{ width: 22, height: 22 }} /><span>メールがあれば招待を送る</span></label>
              </div>
              <p style={note}>体験入店を選ぶと、待遇プランは「体験入店」（時給 ¥{yen(S.pay.trial)}・{S.pay.trialDays} 日）になります。源泉の区分は契約区分から既定で入ります（業務委託＝{S.payroll.whtCast === "hostess" ? "ホステス報酬" : "対象外"}・雇用＝給与）。生年月日は 18 歳の確認に使います（必須）。</p>
              {castMsg && <Message kind={/失敗/.test(castMsg) ? "error" : "success"}>{castMsg}</Message>}
              <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGold }} disabled={castBusy || !f.g.trim() || !f.birthday} data-addcast="1" onClick={() => void addCast({ g: f.g.trim(), n: f.n, st: f.st, kind: f.kind, plan: f.st === "体入" ? "体験入店" : f.plan, tel: f.tel, mail: f.mail, pin: PIN_RE.test(f.pin) ? f.pin : genPin(), dist: f.dist, inv: f.invite && !!f.mail.trim(), birthday: f.birthday }).then((ok) => { if (ok) up((s) => { s.castForm = { ...s.castForm, g: "", n: "", st: "在籍", plan: "基本プラン", tel: "", mail: "", pin: "", dist: "mid", birthday: "" }; }); })}>{castBusy ? "登録中…" : "登録して次の人へ"}</button></div>
            </section>
          ) : (
            <section style={{ ...card, marginTop: 10 }} data-setup-cast-csv="1">
              <h3 style={h3}>CSV で一括登録</h3>
              <p style={lead}>今の名簿を表計算ソフトで CSV にして取り込みます。1 行目は見出しです。</p>
              <div><span style={t.fieldLabel}>列（この順番）</span><div style={{ ...input, width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{CSV_HEADER}</div></div>
              <p style={note}>在籍区分＝在籍／体入、契約区分＝業務委託／雇用、待遇プラン＝基本プラン／体験入店（空なら在籍区分から自動）、PIN＝4〜6 桁（空なら自動で振る）、送り距離＝近／中／遠（空なら中）。メールがある人には招待を送ります。生年月日は登録後にキャスト画面で入れます（CSV の 9 列に無いため）。</p>
              <div className="nox-actions" style={{ marginTop: 8 }}>
                <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { void navigator.clipboard?.writeText(CSV_HEADER); setCastMsg("見出し行をコピーしました"); }}>見出し行をコピー</button>
                <label style={{ ...t.btnGhost, ...t.btnSm, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>CSV ファイルを選ぶ<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const fl = e.target.files?.[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => setS((s) => ({ ...s, csvRows: parseCsv(String(rd.result)) })); rd.readAsText(fl, "UTF-8"); }} /></label>
              </div>
              {S.csvRows.length > 0 && (<>
                <div className="nox-tablewrap plain" style={{ marginTop: 8 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}><thead><tr>{["", "源氏名", "本名", "在籍区分", "契約区分", "待遇プラン", "電話", "メール", "PIN", "送り距離"].map((h) => <th key={h} style={t.th}>{h}</th>)}</tr></thead>
                  <tbody>{S.csvRows.map((r, i) => <tr key={i}><td style={t.td}>{r.err ? <span className="nox-stpill warn">{r.err}</span> : "✓"}</td>{r.c.map((v, j) => <td key={j} style={t.td}>{v}</td>)}</tr>)}</tbody></table></div>
                <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={t.btnGold} disabled={castBusy} data-importcsv="1" onClick={() => void importCsv()}>{S.csvRows.filter((r) => !r.err).length} 人を登録する</button></div>
              </>)}
              {castMsg && <Message kind={/失敗/.test(castMsg) ? "error" : "success"}>{castMsg}</Message>}
            </section>
          )}
          <section style={{ ...card, marginTop: 10 }} data-setup-cast-list={S.casts.length}>
            <h3 style={h3}>登録したキャスト（{S.casts.length} 人）</h3>
            {S.casts.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} className="nox-pin-list">{S.casts.map((c, i) => <span key={i} className="nox-stpill">{c.g}・{c.st}・{c.kind}・PIN {c.pin}{c.inv ? "・招待済み" : ""}</span>)}</div> : <p style={note}>まだいません。</p>}
            <div className="nox-actions" style={{ marginTop: 10 }}>
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => go(0)}>設定を見直す</button>
              {(S.casts.length > 0 || issued.length > 0) && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} data-printpin="1" onClick={() => window.print()}>PIN の一覧を印刷</button>}
              <Link href="/dashboard" style={{ ...t.btnGold, textDecoration: "none" }} data-setup-home="1">ホームへ</Link>
            </div>
          </section>
        </div>); })()}

      </main>
      {!isDone && (
        /* ★便 SU（M-37 (1)）: 下段＝正本の固定バー（左に 1 / 9・右に 戻る／次へ）。固定バーは主ボタン中央の判定の例外（actions-center-probe「固定バー」） */
        <div className="nox-setup-foot" data-setup-foot="1"><div className="in">
          <span className="pos num" data-setup-pos="1">{S.step + 1} / {V5_STEPS.length}</span>
          {S.step > 0 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={run.running} onClick={() => go(S.step - 1)}>戻る</button>}{/* 教訓122: 隠しボタンで幅を取らない（中央判定） */}
          {S.step < 8 ? <button type="button" style={{ ...t.btnGold }} disabled={S.step === 0 && !type} onClick={next} data-setup-next="1">次へ：{V5_STEPS[S.step + 1]}</button>
            : <button type="button" style={{ ...t.btnGold }} disabled={run.running || !type || !isOwner} onClick={() => void execute()} data-setup-start="1">{run.error ? "続きから再実行" : "この内容で始める"}</button>}
        </div></div>
      )}
    </div>
  );
}
