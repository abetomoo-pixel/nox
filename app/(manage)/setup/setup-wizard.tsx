"use client";

// 初期設定ウィザード v5（裁定331・便 W5-1・正本モック docs/handoff/mock/20261001/nox-setup-v5.html の 6 ステップ・文言を踏襲）。
//   STEP 1 お店について（業態 5・お店の特徴 5・店舗情報・営業時間と席）／STEP 2 料金（サービス料・セット・延長・VIP・指名料）／STEP 3 商品（分類と件数・取り込みの ON/OFF）／
//   STEP 4 キャスト報酬（勤務時間の数え方・遅刻の猶予・報酬プラン・達成ボーナス 1 段・売上スライド・控除・支払い・1 日の報酬の目安）／
//   STEP 5 会計と運用（会計方式・カード手数料・売掛・紹介料・使う機能・キャストのスマホ画面）／STEP 6 確認 →「この内容で始める」＝template-plan の配列を順に実行 → 完了画面「次にやること」。
//   C／D 項目（インボイス登録・締め日／支払日・消費税の表示・支払い方法・打刻方法・多段ボーナス・売上歩合のみ・ランク別指名料）は本便では出さない（SETUP_HIDDEN_ITEMS）。
//   進捗＝上部ステッパー（✓＝通過済み）＋進捗バー。途中保存＝localStorage の下書き（店ごと・完了で消す）。あとで設定＝STEP 2〜5 を既定値（laterDefaultsOf）で飛ばす。
//   書込は既存 RPC のみ（新 route 0・migration 0）。UI 規約 238〜244・新トークン 0。
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import SegSelect from "@/components/ui/seg-select";
import type { MineSettings } from "@/lib/nox/store/mine-settings";
const PAYSLIP_LABEL: Record<MineSettings["payslip_visibility"], string> = { off: "見せない", net_only: "手取りだけ", detail: "明細まで" }; // モック STEP 5 の語（店舗設定の表示ラベルとは別）
import {
  BIZ_TYPES, NOM_MODES, RECEIVABLE_POLICIES, SETUP_STEPS, VIP_MODES, bizNoteOf, buildSetupPlan, composeDraft, defaultFeaturesOf, featureLabelOf, hoursOf,
  laterDefaultsOf, nextActionsOf, planSummaryOf, previewLinesOf, pricingOf, productCategoriesOf, productOverrideArgs, productsPlanOf, seatsOf, templateOf, to30h,
  type BizType, type DraftPlan, type NomMode, type PlanStep, type PricingInput, type ProductRow, type ReceivablePolicy, type SeatCounts, type SetupCurrent, type SetupFeatures, type VipMode,
} from "@/lib/nox/setup/template-plan";

const FLAG_LABELS: Record<string, { label: string; desc: string }> = {
  staff_shift: { label: "スタッフシフト", desc: "スタッフのシフトと勤務パターン" },
  reopen_flow: { label: "締め解除フロー", desc: "締め解除・給与確定解除・現金差異承認・伝票統合の解除型" },
  qr_order: { label: "QR注文", desc: "お客様スマホからの注文（準備中の機能スイッチ）" },
  notify: { label: "通知", desc: "お知らせの通知（準備中の機能スイッチ）" },
};
const BILLING_MODES = [["table", "卓会計"], ["individual", "個別会計"], ["mixed", "併用"]] as const;
const LAST = SETUP_STEPS.length - 1;
const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const lead: React.CSSProperties = { ...t.sub, fontSize: 12, margin: "4px 0 10px" };
const h3: React.CSSProperties = { fontSize: 12, fontWeight: 800, margin: "14px 0 6px" };
const hint: React.CSSProperties = { fontWeight: 400, color: "var(--sub)" };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--line)" };
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const DRAFT_KEY = (storeId: string) => `nox.setup.v5.draft.${storeId}`;

type RunState = { running: boolean; done: number; total: number; failedAt: number | null; error: string | null; completed: boolean; log: string[] };
type Draft = {
  step: number; visited: number[]; skipped: number[];
  biz: BizType | null; features: SetupFeatures | null; storeName: string; tel: string; address: string;
  hours: { open: string; close: string; cutoff: string }; hoursTouched: boolean; seats: SeatCounts | null;
  pricing: PricingInput | null; includeProducts: boolean; plans: DraftPlan[] | null; planIdx: number;
  payTimeBasis: "punch" | "shift"; lateGraceMin: number | null; norms: boolean; okuriBase: number;
  billingMode: "table" | "individual" | "mixed"; cardFee: { on: boolean; rate: number }; receivablePolicy: ReceivablePolicy; flags: Record<string, boolean>; mine: MineSettings;
  savedAt: string;
};

/** ON/OFF スイッチ（既存の nox-seg 2 値＝機能スイッチと同じ描画） */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="nox-seg" role="group" aria-label={label}>
      <button type="button" className={!on ? "on" : ""} onClick={() => onChange(false)}>OFF</button>
      <button type="button" className={on ? "on" : ""} onClick={() => onChange(true)}>ON</button>
    </div>
  );
}
function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div><div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>{sub && <div style={{ fontSize: 11.5, color: "var(--sub)" }}>{sub}</div>}</div>
      {children}
    </div>
  );
}
function NumField({ label, value, unit, onChange, width = 140 }: { label: string; value: number; unit: string; onChange: (n: number) => void; width?: number }) {
  return (
    <label style={{ display: "block" }}><span style={t.fieldLabel}>{label}</span><br />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input type="number" inputMode="numeric" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...input, width }} className="num" aria-label={label} />
        <span style={{ fontSize: 12, color: "var(--sub)" }}>{unit}</span>
      </span>
    </label>
  );
}

export default function SetupWizard({ store, counts, orgFlags, isOwner }: {
  store: { id: string; name: string; setupDone: boolean; current: SetupCurrent };
  counts: { seats: number; products: number; plans: number; rules: number };
  orgFlags: Array<{ key: string; enabled: boolean }>;
  isOwner: boolean;
}) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<number[]>([0]);
  const [skipped, setSkipped] = useState<number[]>([]);
  // STEP 1
  const [biz, setBiz] = useState<BizType | null>(null);
  const [features, setFeatures] = useState<SetupFeatures | null>(null);
  const [storeName, setStoreName] = useState(store.name);
  const [tel, setTel] = useState(store.current.receipt.tel);
  const [address, setAddress] = useState(store.current.receipt.address);
  const [hours, setHours] = useState<{ open: string; close: string; cutoff: string }>({ open: "20:00", close: "01:00", cutoff: "06:00" });
  const [hoursTouched, setHoursTouched] = useState(false);
  const [seats, setSeats] = useState<SeatCounts | null>(null);
  // STEP 2〜3
  const [pricing, setPricing] = useState<PricingInput | null>(null);
  const [includeProducts, setIncludeProducts] = useState(true);
  // STEP 4
  const [plans, setPlans] = useState<DraftPlan[] | null>(null);
  const [planIdx, setPlanIdx] = useState(0);
  const [payTimeBasis, setPayTimeBasis] = useState<"punch" | "shift">("punch"); // ★裁定324: 既定 実打刻
  const [lateGraceMin, setLateGraceMin] = useState<number | null>(null);
  const [norms, setNorms] = useState(false);
  const [okuriBase, setOkuriBase] = useState(1000);
  // STEP 5
  const [billingMode, setBillingMode] = useState<"table" | "individual" | "mixed">("table");
  const [cardFee, setCardFee] = useState<{ on: boolean; rate: number }>({ on: store.current.card_tax_rate > 0, rate: store.current.card_tax_rate > 0 ? store.current.card_tax_rate : 4 });
  const [receivablePolicy, setReceivablePolicy] = useState<ReceivablePolicy>("customer_only");
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(FLAG_LABELS).map((k) => [k, orgFlags.find((f) => f.key === k)?.enabled ?? false])));
  const [mine, setMine] = useState<MineSettings>(store.current.mine);
  // STEP 6
  const [run, setRun] = useState<RunState>({ running: false, done: 0, total: 0, failedAt: null, error: null, completed: false, log: [] });
  const [liveCounts, setLiveCounts] = useState(counts);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const draft = useMemo(() => (biz && features ? composeDraft(biz, features) : null), [biz, features]);
  const seatsEff = useMemo(() => seats ?? draft?.seats ?? { table_count: 0, vip_count: 0, counter_count: 0 }, [seats, draft]);
  const pricingEff = pricing ?? (draft ? pricingOf(draft) : null);
  const plansEff = useMemo(() => plans ?? draft?.plans ?? [], [plans, draft]);
  const products = useMemo(() => draft?.products ?? [], [draft]);
  const pp = useMemo(() => productsPlanOf(products), [products]);
  const cats = productCategoriesOf(products);
  const later = biz && draft ? laterDefaultsOf(biz, draft, store.current) : null;

  /** 業態／特徴を変えると料金・商品・報酬で調整した値は初期値に戻る（モックの warn どおり） */
  function applyTemplate(b: BizType, f: SetupFeatures) {
    setBiz(b); setFeatures(f);
    if (!hoursTouched) setHours(hoursOf(templateOf(b)));
    setSeats(null); setPricing(null); setPlans(null); setPlanIdx(0);
    const tt = templateOf(b);
    setReceivablePolicy(tt.features.accounts_receivable ? "customer_only" : "disabled");
    setMine((m) => ({ ...m, shift_request_mode: tt.features.shift_request_mode }));
  }
  const pickBiz = (b: BizType) => { if (b !== biz) applyTemplate(b, defaultFeaturesOf(b)); };
  const setFeat = <K extends keyof SetupFeatures>(k: K, v: SetupFeatures[K]) => { if (biz && features) applyTemplate(biz, { ...features, [k]: v }); };

  // ── 途中保存（localStorage・店ごと）: 復元は hydration 後・保存は変更ごと・完了で消す ──
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(DRAFT_KEY(store.id)) : null;
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d.biz && d.features) {
          setStep(d.step); setVisited(d.visited); setSkipped(d.skipped ?? []); setBiz(d.biz); setFeatures(d.features); setStoreName(d.storeName); setTel(d.tel); setAddress(d.address);
          setHours(d.hours); setHoursTouched(d.hoursTouched); setSeats(d.seats); setPricing(d.pricing); setIncludeProducts(d.includeProducts); setPlans(d.plans); setPlanIdx(d.planIdx ?? 0);
          setPayTimeBasis(d.payTimeBasis); setLateGraceMin(d.lateGraceMin); setNorms(d.norms); setOkuriBase(d.okuriBase); setBillingMode(d.billingMode); setCardFee(d.cardFee);
          setReceivablePolicy(d.receivablePolicy); setFlags(d.flags); setMine(d.mine); setRestoredAt(d.savedAt);
        }
      }
    } catch { /* 下書きが壊れていれば無視（最初から） */ }
    setHydrated(true);
  }, [store.id]);
  useEffect(() => {
    if (!hydrated || !biz || run.completed) return;
    const d: Draft = { step, visited, skipped, biz, features, storeName, tel, address, hours, hoursTouched, seats, pricing, includeProducts, plans, planIdx, payTimeBasis, lateGraceMin, norms, okuriBase, billingMode, cardFee, receivablePolicy, flags, mine, savedAt: new Date().toISOString() };
    try { window.localStorage.setItem(DRAFT_KEY(store.id), JSON.stringify(d)); } catch { /* 容量超過などは無視 */ }
  }, [hydrated, run.completed, store.id, step, visited, skipped, biz, features, storeName, tel, address, hours, hoursTouched, seats, pricing, includeProducts, plans, planIdx, payTimeBasis, lateGraceMin, norms, okuriBase, billingMode, cardFee, receivablePolicy, flags, mine]);
  function restart() {
    try { window.localStorage.removeItem(DRAFT_KEY(store.id)); } catch { /* noop */ }
    window.location.reload();
  }

  const changedFlags = Object.keys(FLAG_LABELS).filter((k) => (orgFlags.find((f) => f.key === k)?.enabled ?? false) !== flags[k]).map((k) => ({ key: k, enabled: flags[k] }));
  const plan: PlanStep[] = useMemo(() => (biz && features && pricingEff)
    ? buildSetupPlan({ storeId: store.id, biz, features, storeName: storeName.trim() !== store.name ? storeName : null, tel, address, hours, seats: seatsEff, includeProducts, products, pricing: pricingEff, plans: plansEff,
      payTimeBasis, lateGraceMin, norms, okuriBase, billingMode, cardFee, receivablePolicy, mine, current: store.current, flags: changedFlags })
    : [], [biz, features, pricingEff, store, storeName, tel, address, hours, seatsEff, includeProducts, products, plansEff, payTimeBasis, lateGraceMin, norms, okuriBase, billingMode, cardFee, receivablePolicy, mine, changedFlags]);
  const summary = planSummaryOf(plan);

  async function refreshCounts() {
    const [{ count: s }, { count: p }, { count: pl }, { count: ru }] = await Promise.all([
      supabase.from("seats").select("id", { count: "exact", head: true }).eq("store_id", store.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
      supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", store.id),
      supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    ]);
    const next = { seats: s ?? 0, products: p ?? 0, plans: pl ?? 0, rules: ru ?? 0 };
    setLiveCounts(next);
    return next;
  }

  async function execute() {
    if (run.running || !biz) return;
    const c = await refreshCounts();
    const guardOk = (st: PlanStep) => st.guard === "seats_empty" ? c.seats === 0 : st.guard === "products_empty" ? c.products === 0
      : st.guard === "plans_empty" ? c.plans === 0 : st.guard === "rules_empty" ? c.rules === 0 : true;
    const log: string[] = [];
    setRun({ running: true, done: 0, total: plan.length, failedAt: null, error: null, completed: false, log });
    let productRows: ProductRow[] | null = null;
    const created: Record<string, unknown> = {}; // set_comp_plan が返した plan id（達成ボーナスの p_plan_id）
    for (let i = 0; i < plan.length; i++) {
      const st = plan[i];
      if (!guardOk(st)) { log.push(`skip: ${st.label}（既存データあり＝二重投入しない）`); setRun((r) => ({ ...r, done: i + 1, log: [...log] })); continue; }
      try {
        if (st.argsOf === "product_overrides") {
          if (!productRows) {
            const { data, error } = await supabase.from("products").select("id, name, type, category, category_id, price, hon_pt, reorder_point, back_exempt_from_split, is_active").eq("store_id", store.id);
            if (error) throw new Error(`products 読取: ${error.message}`);
            productRows = (data ?? []) as ProductRow[];
          }
          for (const o of productOverrideArgs(store.id, products, productRows)) {
            const { error } = await supabase.rpc("set_product", o.args);
            if (error) throw new Error(`${o.name}: ${error.message}`);
          }
        } else if (st.argsOf === "comp_component") {
          const planId = st.after ? created[st.after] : null;
          if (typeof planId !== "string") { log.push(`skip: ${st.label}（プランが作られていない）`); setRun((r) => ({ ...r, done: i + 1, log: [...log] })); continue; }
          const { error } = await supabase.rpc(st.rpc, { ...(st.args ?? {}), p_plan_id: planId });
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase.rpc(st.rpc, st.args ?? {});
          if (error) throw new Error(error.message);
          created[st.key] = data;
        }
        log.push(`ok: ${st.label}`);
        setRun((r) => ({ ...r, done: i + 1, log: [...log] }));
      } catch (e) {
        log.push(`失敗: ${st.label} — ${(e as Error).message}`);
        setRun({ running: false, done: i, total: plan.length, failedAt: i, error: (e as Error).message, completed: false, log: [...log] });
        await refreshCounts();
        return;
      }
    }
    try { window.localStorage.removeItem(DRAFT_KEY(store.id)); } catch { /* noop */ }
    setRun((r) => ({ ...r, running: false, completed: true }));
  }

  // ── 判定（モック canNext／missing） ──
  const missing: string[] = [];
  if (!storeName.trim()) missing.push("店舗名");
  if (!address.trim()) missing.push("住所");
  const canNext = (i: number) => (i === 0 ? !!biz && !!storeName.trim() && !!address.trim() : true);
  const closeLabel = hours.close === to30h(hours.open, hours.close) ? hours.close : `${hours.close}（翌 ${to30h(hours.open, hours.close)}）`;
  const footHint = step === 0 && !biz ? "業態を選ぶと次へ進めます" : step === 0 && !canNext(0) ? "店舗名・住所を入れてください" : `STEP ${step + 1} / ${SETUP_STEPS.length}`;
  function go(i: number) { if (!biz && i > 0) return; setStep(i); setVisited((v) => (v.includes(i) ? v : [...v, i])); if (typeof window !== "undefined") window.scrollTo(0, 0); }
  function skipLater() {
    if (!later) return;
    if (step === 1) setPricing(later.pricing);
    if (step === 2) setIncludeProducts(later.includeProducts);
    if (step === 3) { setPlans(later.plans); setPayTimeBasis(later.payTimeBasis); setLateGraceMin(later.lateGraceMin); setNorms(later.norms); setOkuriBase(later.okuriBase); }
    if (step === 4) { setBillingMode(later.billingMode); setCardFee(later.cardFee); setReceivablePolicy(later.receivablePolicy); setMine(later.mine); }
    setSkipped((s) => (s.includes(step) ? s : [...s, step]));
    go(step + 1);
  }
  const unskip = () => setSkipped((s) => s.filter((x) => x !== step));
  const bizLabel = biz && features ? featureLabelOf(biz, features) : "";
  const curPlan = plansEff[Math.min(planIdx, Math.max(0, plansEff.length - 1))] ?? null;
  const preview = curPlan ? previewLinesOf(curPlan, products) : null;
  const updPlan = (patch: Partial<DraftPlan>) => setPlans(plansEff.map((p, i) => (i === planIdx ? { ...p, ...patch } : p)));
  const vipSeatsNote = features?.vip === "none" ? "VIP 席は「お店の特徴」で VIP の取り方を選ぶと使えます" : null;

  if (run.completed) {
    const acts = nextActionsOf(includeProducts ? pp.stock : 0, isOwner);
    return (
      <div className="nox-mv1" style={{ maxWidth: 880 }}>
        <section className="nox-cardtop" style={{ ...card, textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: 34, color: "var(--ok)" }}>✓</div>
          <h2 style={{ ...secTitle, fontSize: 18, margin: "6px 0 4px" }}>お店の準備ができました</h2>
          <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 16px" }}>お店のルールはすべて入りました。営業を始める前に、次の準備をしてください。</p>
          <div style={{ textAlign: "left" }}>
            {acts.map((a, i) => (
              <Row key={a.href} title={`${i + 1}. ${a.title}`} sub={a.sub}><Link href={a.href} style={{ ...t.btnGhost, ...t.btnSm, textDecoration: "none" }}>開く</Link></Row>
            ))}
          </div>
          <p style={{ ...t.sub, fontSize: 11.5, margin: "16px 0 0", textAlign: "left" }}>書込 {run.done} / {run.total} 件。設定は「マスタ」からいつでも変更できます。<Link href="/dashboard" style={{ marginLeft: 8 }}>ダッシュボードへ</Link></p>
        </section>
      </div>
    );
  }

  return (
    <div className="nox-mv1" style={{ maxWidth: 880 }}>
      <div className="nox-pthead">
        <div className="nox-pthead-main">
          <div className="title"><h2>初期設定</h2>{bizLabel && <span className="nox-stpill" style={{ marginLeft: 8 }}>{bizLabel}</span>}</div>
          <p className="desc">{store.name} の初期設定です。すべて後から変更できます。{store.setupDone && "（設定済みの店です＝再実行は既存データを二重投入しません）"}</p>
        </div>
      </div>
      {/* 進捗＝ステッパー（モック上部の 1〜6・✓＝通過済み）＋進捗バー */}
      <ol style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "0 0 8px" }} aria-label="初期設定のステップ">
        {SETUP_STEPS.map(([label, sub], i) => {
          const done = visited.includes(i) && i !== step && canNext(i);
          return (
            <li key={label}>
              <button type="button" className="nox-stpill" aria-current={i === step ? "step" : undefined} disabled={!biz && i > 0} onClick={() => go(i)}
                style={{ padding: "6px 10px", cursor: !biz && i > 0 ? "not-allowed" : "pointer", background: "transparent", borderColor: i === step ? "var(--gold)" : undefined, color: i === step ? "var(--champ)" : done ? "var(--ok)" : "var(--sub)" }}>
                <b className="num">{done ? "✓" : i + 1}</b> {label}<span style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.8 }}>{sub}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={SETUP_STEPS.length} aria-valuenow={step + 1} aria-label="進捗" style={{ height: 4, borderRadius: 2, background: "var(--line)", margin: "0 0 14px", overflow: "hidden" }}>
        <div style={{ width: `${((step + 1) / SETUP_STEPS.length) * 100}%`, height: "100%", background: "var(--gold)" }} />
      </div>
      {restoredAt && <p style={{ ...t.sub, fontSize: 11.5, margin: "0 0 10px" }}>途中保存した下書きを復元しました（{new Date(restoredAt).toLocaleString("ja-JP")}）。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={restart}>最初からやり直す</button></p>}

      {step === 0 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 1　お店について</h2>
          <p style={lead}>業態と特徴を選ぶと、料金・商品・報酬の初期値が組み上がります。次の画面から金額や名前を調整します。</p>
          <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>業態 <span className="nox-stpill warn" style={{ marginLeft: 6 }}>必須</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {BIZ_TYPES.map((b) => {
              const on = biz === b.key;
              const tt = templateOf(b.key);
              const r = tt.pricing_rules.find((x) => x.enabled) ?? tt.pricing_rules[0];
              return (
                <button key={b.key} type="button" aria-pressed={on} onClick={() => pickBiz(b.key)}
                  style={{ ...t.card, textAlign: "left", cursor: "pointer", padding: 12, border: on ? "1px solid var(--gold)" : "1px solid var(--line)", background: on ? "var(--goldface2)" : "var(--card2)", color: on ? "var(--champ)" : "var(--ink)" }}>
                  {on && <span style={{ fontSize: 10.5, fontWeight: 800 }}>選択中</span>}
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{b.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--sub)" }}>{b.sub}</div>
                  <div style={{ fontSize: 11.5, marginTop: 4 }} className="num">{r?.set_min ? `セット ${r.set_fee.toLocaleString()}円 / ${r.set_min}分〜` : `チャージ ${(r?.set_fee ?? 0).toLocaleString()}円`}</div>
                </button>
              );
            })}
          </div>
          {!biz && <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>まず業態を選んでください。</p>}
          {biz && features && (
            <>
              <div style={h3}>お店の特徴 <span style={hint}>当てはまるものを選んでください。料金表・報酬プランの形が変わります</span></div>
              <Row title="VIP 席" sub="VIP の料金の取り方"><SegSelect value={features.vip} onChange={(v) => setFeat("vip", v as VipMode)} options={VIP_MODES} ariaLabel="VIP 席" /></Row>
              <Row title="指名料" sub="お客様に請求する指名料"><SegSelect value={features.nom} onChange={(v) => setFeat("nom", v as NomMode)} options={NOM_MODES} ariaLabel="指名料" /></Row>
              <Row title="売上スライド" sub="売上で時給が上がる"><Switch on={features.slide} onChange={(v) => setFeat("slide", v)} label="売上スライド" /></Row>
              <Row title="新人保証" sub="入店直後は高めの時給を保証"><Switch on={features.newbie} onChange={(v) => setFeat("newbie", v)} label="新人保証" /></Row>
              <Row title="達成ボーナス" sub="月の売上・本指名で支給"><Switch on={features.bonus} onChange={(v) => setFeat("bonus", v)} label="達成ボーナス" /></Row>
              {visited.length > 1 && <p className="nox-alert" style={{ fontSize: 12, margin: "8px 0 0" }}>業態や特徴を変えると、料金・商品・報酬で調整した値は初期値に戻ります。</p>}

              <div style={h3}>店舗情報 <span style={hint}>領収書と給与明細に印字されます</span> <span className="nox-stpill warn" style={{ marginLeft: 6 }}>必須</span></div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>店舗名（領収書の表記）</span><br /><input value={storeName} maxLength={50} placeholder="例：CLUB NOX" onChange={(e) => setStoreName(e.target.value)} style={{ ...input, width: 220 }} /></label>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>電話番号</span><br /><input value={tel} inputMode="tel" maxLength={50} placeholder="03-0000-0000" onChange={(e) => setTel(e.target.value)} style={{ ...input, width: 160 }} /></label>
                <label style={{ display: "block", flex: "1 1 260px" }}><span style={t.fieldLabel}>住所</span><br /><input value={address} maxLength={200} placeholder="東京都新宿区歌舞伎町…" onChange={(e) => setAddress(e.target.value)} style={{ ...input, width: "100%" }} /></label>
              </div>

              <div style={h3}>営業時間と席</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>営業開始</span><br /><input type="time" value={hours.open} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, open: e.target.value })); }} style={input} /></label>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>営業終了</span><br /><input type="time" value={hours.close} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, close: e.target.value })); }} style={input} /></label>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>営業日の切替時刻</span><br /><input type="time" value={hours.cutoff} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, cutoff: e.target.value })); }} style={input} /></label>
                <div style={{ fontSize: 12, color: "var(--sub)", alignSelf: "center" }}>営業日の区切り: {bizNoteOf(hours.open, hours.close)}</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
                <NumField label="通常席" value={seatsEff.table_count} unit="卓" onChange={(n) => setSeats({ ...seatsEff, table_count: Math.max(0, n) })} width={90} />
                <NumField label="VIP 席" value={seatsEff.vip_count} unit="卓" onChange={(n) => setSeats({ ...seatsEff, vip_count: Math.max(0, n) })} width={90} />
                <NumField label="カウンター" value={seatsEff.counter_count} unit="席" onChange={(n) => setSeats({ ...seatsEff, counter_count: Math.max(0, n) })} width={90} />
                {vipSeatsNote && <span style={{ fontSize: 11.5, color: "var(--sub)", alignSelf: "center" }}>{vipSeatsNote}</span>}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>営業時間は全曜日に同じ値を入れます（曜日別は後から「営業時間・定休日」で）。終了が開始より早い場合は翌日扱い＝{closeLabel}。席は既存の席があるときは投入しません。</p>
            </>
          )}
        </section>
      )}

      {step === 1 && draft && pricingEff && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 2　料金</h2>
          <p style={lead}>曜日と時間帯で料金を分けられます（曜日・時間帯の行は「マスタ › 料金・会計 › 料金適用ルール」で）。名前・金額をお店に合わせてください。</p>
          {skipped.includes(1) && <p className="nox-alert" style={{ fontSize: 12, margin: "0 0 10px" }}>あとで設定（既定値のまま）にしています。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={unskip}>ここで設定する</button></p>}
          <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>セット料金 <span style={hint}>税・サービス料は会計時に加算します</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <NumField label={pricingEff.set_min ? `セット（${pricingEff.set_min}分）` : "チャージ"} value={pricingEff.set_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, set_fee: n })} />
            <NumField label="延長（30分）" value={pricingEff.ext_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, ext_fee: n })} />
            <NumField label="サービス料" value={pricingEff.service_rate} unit="%" onChange={(n) => setPricing({ ...pricingEff, service_rate: n })} />
            {pricingEff.vip_charge != null && <NumField label="VIP 加算（1人・60分）" value={pricingEff.vip_charge} unit="円" onChange={(n) => setPricing({ ...pricingEff, vip_charge: n })} />}
          </div>
          {pricingEff.vip_rows && (
            <>
              <div style={h3}>VIP 専用の料金表 <span style={hint}>VIP 席の会計に使います</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <NumField label={`VIP セット（${pricingEff.vip_rows.set_min}分）`} value={pricingEff.vip_rows.set_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, vip_rows: { ...pricingEff.vip_rows!, set_fee: n } })} />
                <NumField label="VIP 延長（30分）" value={pricingEff.vip_rows.ext_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, vip_rows: { ...pricingEff.vip_rows!, ext_fee: n } })} />
              </div>
            </>
          )}
          {features?.nom !== "none" && (
            <>
              <div style={h3}>指名料（お客様に請求） <span style={hint}>同伴を付けると本指名料も自動で付きます</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <NumField label="本指名" value={pricingEff.hon_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, hon_fee: n })} />
                <NumField label="場内指名" value={pricingEff.jonai_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, jonai_fee: n })} />
                <NumField label="同伴" value={pricingEff.dohan_fee} unit="円" onChange={(n) => setPricing({ ...pricingEff, dohan_fee: n })} />
              </div>
            </>
          )}
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "10px 0 0" }}>席: 通常 {seatsEff.table_count}・VIP {seatsEff.vip_count}・カウンター {seatsEff.counter_count}（合計 {seatsOf(seatsEff).length}）。カード手数料・丸めは STEP 5 と店舗設定で。</p>
        </section>
      )}

      {step === 2 && draft && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 3　商品</h2>
          <p style={lead}>業態の標準メニューを登録します。名前と価格はあとから「マスタ › 商品管理」でお店のメニューに合わせてください。バックは「バックあり」の商品に率か金額が入っています。</p>
          {skipped.includes(2) && <p className="nox-alert" style={{ fontSize: 12, margin: "0 0 10px" }}>あとで設定（既定値のまま）にしています。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={unskip}>ここで設定する</button></p>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {cats.map((c) => <span key={c} className="nox-stpill">{c} <b className="num">{products.filter((p) => p.display_category === c && (!p.status || p.status === "active")).length}</b></span>)}
            <span className="nox-stpill ok" style={{ marginLeft: "auto" }}>{includeProducts ? pp.included.length : 0} / {pp.included.length} 品を登録</span>
          </div>
          <div className="nox-tablewrap plain">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr><th style={t.th}>メニュー名</th><th style={t.th}>分類</th><th style={{ ...t.th, textAlign: "right" }}>価格（税・サ別）</th><th style={t.th}>バック</th><th style={t.th}>在庫</th></tr></thead>
              <tbody>
                {pp.included.map((p) => (
                  <tr key={p.name}>
                    <td style={t.td}>{p.name}</td><td style={{ ...t.td, color: "var(--sub)" }}>{p.category}</td>
                    <td style={{ ...t.td, textAlign: "right" }} className="num">{yen(p.price)}</td>
                    <td style={t.td}>{p.back.isDefault ? <span style={{ color: "var(--sub)" }}>なし</span> : p.back.back_mode === "rate" ? `率 ${p.back.back_value}%` : p.back.unit4 && p.back.unit4.hon === p.back.unit4.free ? `金額 ${yen(p.back.unit4.hon)}` : `指名別 ${yen(p.back.unit4?.hon ?? 0)}〜`}{p.hon_pt > 0 ? `・${p.hon_pt}pt` : ""}</td>
                    <td style={t.td}>{p.stock ? <span className="nox-stpill">管理</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={includeProducts} onChange={(e) => setIncludeProducts(e.target.checked)} style={{ width: 18, height: 18 }} />
            商品テンプレを取り込む（{pp.included.length} 件・バックあり {pp.overrides} 件・在庫管理 {pp.stock} 件）
          </label>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>既存の商品があるときは投入しません。1 品ずつの選択・追加は「マスタ › 商品管理」で。</p>
        </section>
      )}

      {step === 3 && draft && curPlan && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 4　キャスト報酬</h2>
          <p style={lead}>キャストごとの上書き（保証時給など）は登録後に「キャスト」から。商品のバックは前の画面で設定済みです。</p>
          {skipped.includes(3) && <p className="nox-alert" style={{ fontSize: 12, margin: "0 0 10px" }}>あとで設定（既定値のまま）にしています。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={unskip}>ここで設定する</button></p>}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: 14 }}>
            <div>
              {/* ★裁定324（0159）: 勤務時間の計算基準＝既定 実打刻。保存は完了時に set_store_pay_time_basis(…,'now')（'shift' のときだけ） */}
              <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>勤務時間の数え方</div>
              <SegSelect value={payTimeBasis} onChange={(v) => setPayTimeBasis(v as "punch" | "shift")} options={[["punch", "実際の出退勤（既定）"], ["shift", "確定シフトどおり"]]} ariaLabel="勤務時間の計算基準" />
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>{payTimeBasis === "shift" ? "確定シフトの時間で払います。遅刻・早上がりは打刻から判定して差し引き、シフトより長い分は払いません。" : "出勤〜退勤の打刻で計算します。打刻の修正は店長が行います。"}</p>
              <div style={{ marginTop: 10 }}>
                <NumField label="遅刻とみなすまでの猶予" value={lateGraceMin ?? 10} unit="分" onChange={(n) => setLateGraceMin(Math.max(0, n))} width={90} />
              </div>

              <div style={h3}>報酬プラン <span style={hint}>{plansEff.length > 1 ? "キャスト登録時にプランを選びます" : "全員共通のプランです"}</span></div>
              {plansEff.length > 1 && (
                <div className="nox-seg" role="tablist" aria-label="報酬プラン" style={{ marginBottom: 8, width: "fit-content" }}>
                  {plansEff.map((p, i) => <button key={p.name + i} type="button" role="tab" aria-selected={i === planIdx} className={i === planIdx ? "on" : ""} onClick={() => setPlanIdx(i)}>{p.name}</button>)}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "block" }}><span style={t.fieldLabel}>プラン名</span><br /><input value={curPlan.name} maxLength={80} onChange={(e) => updPlan({ name: e.target.value })} style={{ ...input, width: "100%" }} /></label>
                <NumField label="基本時給" value={curPlan.base} unit="円/時" onChange={(n) => updPlan({ base: n })} />
                {features?.nom !== "none" && (<>
                  <NumField label="本指名バック" value={curPlan.hon} unit="円/件" onChange={(n) => updPlan({ hon: n })} />
                  <NumField label="場内指名バック" value={curPlan.jonai} unit="円/件" onChange={(n) => updPlan({ jonai: n })} />
                  <NumField label="同伴バック" value={curPlan.dohan} unit="円/件" onChange={(n) => updPlan({ dohan: n })} />
                </>)}
              </div>
              {curPlan.name === "新人保証" && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>保証する期間（例：入店から 2 か月）はキャスト登録時に入れます。終了後は標準プランに戻ります。</p>}

              {curPlan.bonus.length > 0 && (
                <>
                  <div style={h3}>達成ボーナス <span style={hint}>目標達成時に支給（1 段）。目標の額はキャスト別目標（ノルマ）で設定します</span></div>
                  <NumField label="達成時の支給額" value={curPlan.bonus[0].add_yen} unit="円" onChange={(n) => updPlan({ bonus: [{ ...curPlan.bonus[0], add_yen: n }] })} />
                </>
              )}
              {curPlan.slide.length > 0 && (
                <>
                  <div style={h3}>売上スライド <span style={hint}>その日の売上で当日の時給が決まります（3 段）</span></div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {curPlan.slide.filter((x) => x.at > 0).map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                        <NumField label="売上" value={x.at} unit="円以上 →" onChange={(n) => updPlan({ slide: curPlan.slide.map((y) => (y === x ? { ...y, at: n } : y)) })} />
                        <NumField label="時給" value={x.wage} unit="円/時" onChange={(n) => updPlan({ slide: curPlan.slide.map((y) => (y === x ? { ...y, wage: n } : y)) })} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={h3}>控除・支払い</div>
              <Row title="不就労控除" sub="遅刻・早上がり・欠勤の時間分を差し引きます"><span className="nox-stpill ok">常に ON</span></Row>
              <Row title="精算調整のひな形" sub="契約で決めた調整を 1 タップで登録。金額 0 で用意します"><span className="nox-stpill ok">完了時に 3 件</span></Row>
              <Row title="ノルマ（目標）" sub="月目標を店がキャスト別に設定"><Switch on={norms} onChange={setNorms} label="ノルマ" /></Row>
              <Row title="日払い・前借り" sub="支払った額は給与から自動で差し引きます"><span className="nox-stpill ok">使える</span></Row>
              <Row title="送りの基本額" sub="退勤時に金額が入り、店長が確定します"><NumField label="送りの基本額" value={okuriBase} unit="円" onChange={(n) => setOkuriBase(Math.max(0, Math.min(99999, n)))} width={100} /></Row>
            </div>
            {preview && (
              <aside style={{ ...t.card, padding: 12, alignSelf: "start" }} aria-label="1 日の報酬の目安">
                <div style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 4px" }}>1 日の報酬の目安</div>
                <div style={{ fontSize: 11, color: "var(--sub)", margin: "0 0 8px" }}>{curPlan.name}・確定シフト 5 時間・本指名 1・場内 1・ドリンク 4 杯</div>
                {preview.lines.map(([l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}><span>{l}</span><b className="num">{yen(v)}</b></div>)}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}><span>合計</span><b className="num">{yen(preview.total)}</b></div>
                <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>源泉徴収前の額です。ボーナス・スライドは月末に加わります。</p>
              </aside>
            )}
          </div>
        </section>
      )}

      {step === 4 && draft && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 5　会計と運用</h2>
          <p style={lead}>レジの会計ルールと、キャストのスマホに見せるものを決めます。</p>
          {skipped.includes(4) && <p className="nox-alert" style={{ fontSize: 12, margin: "0 0 10px" }}>あとで設定（既定値のまま）にしています。<button type="button" style={{ ...t.link, marginLeft: 6 }} onClick={unskip}>ここで設定する</button></p>}
          <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>会計</div>
          <Row title="会計方式" sub="表示のみの記録＝レジの挙動は変わりません"><SegSelect value={billingMode} onChange={(v) => setBillingMode(v as "table" | "individual" | "mixed")} options={BILLING_MODES} ariaLabel="会計方式" /></Row>
          <Row title="カード手数料をお客様に上乗せ" sub="カード払いのときだけ加算">
            <span style={{ display: "inline-flex", gap: 10, alignItems: "flex-end" }}>
              {cardFee.on && <NumField label="上乗せ率" value={cardFee.rate} unit="%" onChange={(n) => setCardFee({ on: true, rate: Math.max(0, n) })} width={70} />}
              <Switch on={cardFee.on} onChange={(v) => setCardFee({ ...cardFee, on: v })} label="カード手数料" />
            </span>
          </Row>
          {/* ★裁定272-5（0148）: 受取方針＝stores.receivable_policy（3 値・モックの 2 択を現行 3 値へ） */}
          <Row title="売掛（ツケ）" sub="未回収分を誰が負うか"><SegSelect value={receivablePolicy} onChange={(v) => setReceivablePolicy(v as ReceivablePolicy)} options={RECEIVABLE_POLICIES} ariaLabel="売掛の受取方針" /></Row>
          <Row title="紹介料（キャッチ）" sub="紹介者マスタと、レジの「紹介」ボタンを使います"><span style={{ fontSize: 12, color: "var(--sub)" }}>紹介者は「マスタ › 紹介者・紹介料」で登録</span></Row>

          <div style={h3}>使う機能 <span style={hint}>会社の既定（全店）として保存します</span></div>
          {Object.entries(FLAG_LABELS).map(([k, v]) => <Row key={k} title={v.label} sub={v.desc}><Switch on={flags[k]} onChange={(on) => setFlags((f) => ({ ...f, [k]: on }))} label={v.label} /></Row>)}

          {/* ★0160（326 の 8 キー）: キャストのスマホ画面＝set_store_mine_settings（差分だけ） */}
          <div style={h3}>キャストのスマホ画面 <span style={hint}>あとから店舗設定で切り替えられます</span></div>
          <Row title="給与明細"><SegSelect value={mine.payslip_visibility} onChange={(v) => setMine({ ...mine, payslip_visibility: v as MineSettings["payslip_visibility"] })} options={(Object.entries(PAYSLIP_LABEL) as Array<[string, string]>)} ariaLabel="給与明細" /></Row>
          <Row title="シフトの出し方" sub={mine.shift_request_mode === "off_only" ? "休み希望がない日は「出勤できる」として扱います。" : "キャストは出勤できる日と時間を提出します。"}><SegSelect value={mine.shift_request_mode} onChange={(v) => setMine({ ...mine, shift_request_mode: v as MineSettings["shift_request_mode"] })} options={[["shift", "出勤希望を出す"], ["off_only", "休み希望だけ出す"]]} ariaLabel="シフトの出し方" /></Row>
          <Row title="指名予約・同伴予約の申請" sub="キャストが申請→店が承認"><Switch on={mine.reservation_request} onChange={(v) => setMine({ ...mine, reservation_request: v })} label="予約申請" /></Row>
          <Row title="ドリンクの自己申告" sub="キャストが飲んだ杯数を申告"><Switch on={mine.drink_claim} onChange={(v) => setMine({ ...mine, drink_claim: v })} label="ドリンク申告" /></Row>
          <Row title="出退勤の修正申請" sub="押し忘れをキャストが申請→店長が確定"><Switch on={mine.punch_correction_request} onChange={(v) => setMine({ ...mine, punch_correction_request: v })} label="修正申請" /></Row>
          <Row title="指名ランキング" sub="オフにするとページごと表示しません"><Switch on={mine.ranking} onChange={(v) => setMine({ ...mine, ranking: v, ranking_show_others: v ? mine.ranking_show_others : false })} label="ランキング" /></Row>
        </section>
      )}

      {step === LAST && biz && features && draft && pricingEff && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 6　確認</h2>
          <p style={lead}>この内容でお店を作ります。完了後もマスタからすべて変更できます。</p>
          {missing.length > 0 && <p className="nox-alert" style={{ fontSize: 12, margin: "0 0 10px" }}>未入力があります：{missing.join("、")}</p>}
          <div className="nox-tablewrap plain">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {([
                  [0, "お店について", `${featureLabelOf(biz, features)}／${storeName || "店舗名 未入力"}／${address || "住所 未入力"}${tel ? `／${tel}` : ""}／${hours.open}〜${closeLabel}（切替 ${hours.cutoff}）／席 通常 ${seatsEff.table_count}・VIP ${seatsEff.vip_count}・カウンター ${seatsEff.counter_count}${liveCounts.seats > 0 ? "（既存 " + liveCounts.seats + " 席あり＝投入しない）" : ""}`],
                  [1, "料金", `サービス料 ${pricingEff.service_rate}%・${pricingEff.set_min ? `セット ${yen(pricingEff.set_fee)}/${pricingEff.set_min}分` : `チャージ ${yen(pricingEff.set_fee)}`}・延長 ${yen(pricingEff.ext_fee)}/30分${pricingEff.vip_rows ? `・VIP セット ${yen(pricingEff.vip_rows.set_fee)}` : ""}${pricingEff.vip_charge != null ? `・VIP 加算 ${yen(pricingEff.vip_charge)}` : ""}・指名料 ${features.nom === "none" ? "取らない" : `本指名 ${yen(pricingEff.hon_fee)}／場内 ${yen(pricingEff.jonai_fee)}／同伴 ${yen(pricingEff.dohan_fee)}`}`],
                  [2, "商品", includeProducts && pp.included.length ? `${pp.included.length} 品を登録（バックあり ${pp.overrides} 品・在庫管理 ${pp.stock} 品）${liveCounts.products > 0 ? "（既存 " + liveCounts.products + " 件あり＝投入しない）" : ""}` : "取り込まない"],
                  [3, "キャスト報酬", `勤務時間 ${payTimeBasis === "shift" ? "確定シフトどおり" : "実際の出退勤"}・遅刻の猶予 ${lateGraceMin ?? 10} 分${lateGraceMin == null ? "（既定）" : ""}・${plansEff.map((p) => `${p.name} 時給 ${yen(p.base)}${p.hon ? `／本指名 ${yen(p.hon)}` : ""}${p.slide.length ? "／スライド" : ""}${p.bonus.length ? `／達成 ${yen(p.bonus[0].add_yen)}` : ""}`).join("・")}${liveCounts.plans > 0 ? "（既存プランあり＝投入しない）" : ""}・ノルマ ${norms ? "使う" : "使わない"}・送り ${yen(okuriBase)}`],
                  [4, "会計と運用", `${BILLING_MODES.find(([k]) => k === billingMode)?.[1]}・カード手数料 ${cardFee.on ? `${cardFee.rate}%` : "なし"}・売掛 ${RECEIVABLE_POLICIES.find(([k]) => k === receivablePolicy)?.[1]}・機能 ${changedFlags.length ? changedFlags.map((f) => `${FLAG_LABELS[f.key].label} ${f.enabled ? "ON" : "OFF"}`).join("・") : "変更なし"}`],
                  [4, "キャストのスマホ画面", `給与明細 ${PAYSLIP_LABEL[mine.payslip_visibility]}・シフト ${mine.shift_request_mode === "shift" ? "出勤希望" : "休み希望だけ"}・予約申請 ${mine.reservation_request ? "受け付ける" : "受け付けない"}・ドリンク申告／修正申請／ランキング ${[mine.drink_claim, mine.punch_correction_request, mine.ranking].map((x) => (x ? "ON" : "OFF")).join("／")}`],
                  [-1, "書込", `${plan.length} 件（店舗設定 ${summary.settings}・営業時間 ${summary.hours}・席 ${summary.seats}・料金 ${summary.pricing}・報酬 ${summary.comp}・商品 ${summary.products + summary.overrides}・機能 ${summary.flags}・完了 ${summary.done}）`],
                ] as const).map(([i, k, v]) => (
                  <tr key={k}>
                    <th style={{ ...t.th, width: 130, verticalAlign: "top" }}>{k}{i >= 0 && <><br /><button type="button" style={{ ...t.link, fontSize: 11 }} onClick={() => go(i)}>修正</button>{skipped.includes(i) && <span style={{ fontSize: 10.5, color: "var(--sub)", marginLeft: 4 }}>あとで設定</span>}</>}</th>
                    <td style={t.td}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(run.running || run.done > 0 || run.error) && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              <div><b className="num">{run.done}</b> / {run.total} 件{run.running ? " 実行中…" : run.error ? `　失敗（${run.failedAt! + 1} 件目）` : ""}</div>
              {run.error && <p style={{ color: "var(--bad)", margin: "4px 0 0" }}>{run.error}<br /><span style={{ color: "var(--sub)" }}>ここまでの書込は残っています。原因を直してから「この内容で始める」を押すと続きから再実行できます（席・商品・プラン・料金行は既存があれば二重投入しません）。</span></p>}
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--sub)", maxHeight: 180, overflowY: "auto" }}>{run.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {/* footnav: 戻る（左・補助）／あとで設定（STEP 2〜5・補助）／次へ・完了（右・主要）＝裁定244 */}
      <div className="nox-formmodal-foot" style={{ marginTop: 14, alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--sub)", marginRight: "auto" }}>{footHint}</span>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={step === 0 || run.running} onClick={() => go(step - 1)}>戻る</button>
        {step > 0 && step < LAST && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={!later} onClick={skipLater}>あとで設定</button>}
        {step < LAST ? (
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={!canNext(step)} onClick={() => go(step + 1)}>次へ：{SETUP_STEPS[step + 1][0]}</button>
        ) : (
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={run.running || plan.length === 0 || missing.length > 0} onClick={() => void execute()}>{run.error ? "続きから再実行" : "この内容で始める"}</button>
        )}
      </div>
    </div>
  );
}
