"use client";

// 初期設定ウィザード（裁定270-1／271・モック mock/onboarding-2026-08 step1〜5 の構成と文言を踏襲）。
//   STEP 1 業態（5 択・bar 含む）＋店舗名＋営業時間／STEP 2 テンプレ表示＋商品取り込みチェック＋料金の編集／
//   STEP 3 使う制度（store-systems-panel を再利用・既定＝時給・各種バックのみ ON）／STEP 4 会計方式（表示のみの記録）＋機能スイッチ（feature_flags 4 値）／
//   STEP 5 確認表 →「初期設定を完了」＝template-plan の配列を順に実行（進捗・失敗位置・再実行＝冪等ガード）。
//   STEP 間の状態は本コンポーネントの state（URL 遷移なし）。書込は既存 RPC のみ（新しい判定式なし）。UI 規約 238〜244・新トークン 0。
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import SegSelect from "@/components/ui/seg-select";
import StoreSystemsPanel from "@/components/nox/store-systems-panel";
import { SYSTEM_KEYS, type SystemKey } from "@/lib/nox/store-systems";
import {
  BIZ_TYPES, RECEIVABLE_POLICIES, SYSTEM_DEFAULTS_ON, buildSetupPlan, compOf, hoursOf, planSummaryOf, pricingOf, productOverrideArgs, productsPlanOf, seatsOf, templateOf, to30h,
  type BizType, type PlanStep, type PricingInput, type ProductRow,
  type ReceivablePolicy,
} from "@/lib/nox/setup/template-plan";

const STEPS = [
  ["お店について", "業態・店舗名・営業時間"],
  ["料金について", "業態別テンプレート"],
  ["キャスト待遇", "使う制度"],
  ["会計・レジ", "会計方式・機能"],
  ["確認", "設定内容の確認"],
] as const;
const FLAG_LABELS: Record<string, { label: string; desc: string }> = {
  staff_shift: { label: "スタッフシフト", desc: "スタッフのシフトと勤務パターン" },
  reopen_flow: { label: "締め解除フロー", desc: "締め解除・給与確定解除・現金差異承認・伝票統合の解除型" },
  qr_order: { label: "QR注文", desc: "お客様スマホからの注文（準備中の機能スイッチ）" },
  notify: { label: "通知", desc: "お知らせの通知（準備中の機能スイッチ）" },
};
const BILLING_MODES = [["table", "卓会計"], ["individual", "個別会計"], ["mixed", "併用"]] as const;
const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const yen = (n: number) => `¥${n.toLocaleString()}`;

type RunState = { running: boolean; done: number; total: number; failedAt: number | null; error: string | null; completed: boolean; log: string[] };

export default function SetupWizard({ store, counts, orgFlags }: {
  store: { id: string; name: string; setupDone: boolean; current: { card_tax_rate: number; round_unit: number; round_mode: string; time_mode: string; time_per: string } };
  counts: { seats: number; products: number; plans: number; rules: number };
  orgFlags: Array<{ key: string; enabled: boolean }>;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  // STEP 1
  const [biz, setBiz] = useState<BizType | null>(null);
  const [storeName, setStoreName] = useState(store.name);
  const [hours, setHours] = useState<{ open: string; close: string; cutoff: string }>(hoursOf(null));
  const [hoursTouched, setHoursTouched] = useState(false);
  // STEP 2
  const [includeProducts, setIncludeProducts] = useState(true);
  const [pricing, setPricing] = useState<PricingInput | null>(null);
  // STEP 3（既定＝時給・各種バックのみ ON）
  const [systems, setSystems] = useState<Record<SystemKey, boolean>>(() => Object.fromEntries(SYSTEM_KEYS.map((k) => [k, SYSTEM_DEFAULTS_ON.includes(k)])) as Record<SystemKey, boolean>);
  // STEP 4
  const [billingMode, setBillingMode] = useState<"table" | "individual" | "mixed">("table");
  const [receivablePolicy, setReceivablePolicy] = useState<ReceivablePolicy>("customer_only"); // ★裁定272-5
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(FLAG_LABELS).map((k) => [k, orgFlags.find((f) => f.key === k)?.enabled ?? false])));
  // STEP 5
  const [run, setRun] = useState<RunState>({ running: false, done: 0, total: 0, failedAt: null, error: null, completed: false, log: [] });
  const [liveCounts, setLiveCounts] = useState(counts);

  const tpl = biz ? templateOf(biz) : null;
  const pricingEff = pricing ?? (biz ? pricingOf(tpl) : null);
  const pp = useMemo(() => productsPlanOf(tpl), [tpl]);
  const comp = compOf(tpl);
  const seats = seatsOf(tpl);
  const usage = useMemo(() => Object.fromEntries(SYSTEM_KEYS.map((k) => [k, 0])) as Record<SystemKey, number>, []); // 新規店＝全 0

  function pickBiz(b: BizType) {
    setBiz(b);
    const tt = templateOf(b);
    if (!hoursTouched) setHours(hoursOf(tt));
    setPricing(pricingOf(tt)); // 業態を選び直したら料金はテンプレ既定へ
  }
  const changedFlags = Object.keys(FLAG_LABELS).filter((k) => (orgFlags.find((f) => f.key === k)?.enabled ?? false) !== flags[k]).map((k) => ({ key: k, enabled: flags[k] }));
  const plan: PlanStep[] = useMemo(() => (biz && pricingEff)
    ? buildSetupPlan({ storeId: store.id, biz, storeName: storeName.trim() !== store.name ? storeName : null, hours, systems, includeProducts, billingMode, receivablePolicy, pricing: pricingEff, current: store.current, flags: changedFlags })
    : [], [biz, pricingEff, store.id, store.name, storeName, hours, systems, includeProducts, billingMode, receivablePolicy, store.current, changedFlags]);
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
          for (const o of productOverrideArgs(store.id, tpl, productRows)) {
            const { error } = await supabase.rpc("set_product", o.args);
            if (error) throw new Error(`${o.name}: ${error.message}`);
          }
        } else {
          const { error } = await supabase.rpc(st.rpc, st.args ?? {});
          if (error) throw new Error(error.message);
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
    setRun((r) => ({ ...r, running: false, completed: true }));
    router.push("/dashboard");
  }

  const canNext = step === 0 ? !!biz && storeName.trim().length > 0 : true;
  const closeLabel = hours.close === to30h(hours.open, hours.close) ? hours.close : `${hours.close}（翌 ${to30h(hours.open, hours.close)}）`;

  return (
    <div className="nox-mv1" style={{ maxWidth: 880 }}>
      <div className="nox-pthead">
        <div className="nox-pthead-main">
          <div className="title"><h2>初期設定</h2></div>
          <p className="desc">{store.name} の初期設定です。すべて後から変更できます。{store.setupDone && "（設定済みの店です＝再実行は既存データを二重投入しません）"}</p>
        </div>
      </div>
      {/* ステップ帯（モック上部の 1〜5） */}
      <ol style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0, margin: "0 0 14px" }}>
        {STEPS.map(([label, sub], i) => (
          <li key={label} className="nox-stpill" style={{ padding: "6px 10px", borderColor: i === step ? "var(--gold)" : undefined, color: i === step ? "var(--champ)" : i < step ? "var(--ok)" : "var(--sub)" }}>
            <b className="num">{i + 1}</b> {label}<span style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.8 }}>{sub}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 1　お店について</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 10px" }}>最初に業態を選び、そのあと店舗情報を確認します。業態カードを押してもすぐには進みません＝選択を確認してから「次へ」。</p>
          <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>1. お店のタイプ <span style={{ fontWeight: 400, color: "var(--sub)" }}>料金・待遇の初期テンプレートに使います</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {BIZ_TYPES.map((b) => {
              const on = biz === b.key;
              const tt = templateOf(b.key);
              const pr = pricingOf(tt);
              return (
                <button key={b.key} type="button" aria-pressed={on} onClick={() => pickBiz(b.key)}
                  style={{ ...t.card, textAlign: "left", cursor: "pointer", padding: 12, border: on ? "1px solid var(--gold)" : "1px solid var(--line)", background: on ? "var(--goldface2)" : "var(--card2)", color: on ? "var(--champ)" : "var(--ink)" }}>
                  {on && <span style={{ fontSize: 10.5, fontWeight: 800 }}>選択中</span>}
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{b.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--sub)" }}>{b.sub}</div>
                  <div style={{ fontSize: 11.5, marginTop: 4 }} className="num">{tt ? `通常 ${yen(pr.set_fee)} / ${pr.set_min}分` : `チャージ ${yen(pr.set_fee)}〜`}</div>
                </button>
              );
            })}
          </div>
          {!biz && <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>まずお店のタイプを選択してください。選択後もこのページに残るので、基本情報を確認してから次へ進めます。</p>}
          <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 6px" }}>2. 店舗の基本情報 <span style={{ fontWeight: 400, color: "var(--sub)" }}>あとから変更できます</span></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "block" }}><span style={t.fieldLabel}>店舗名</span><br /><input value={storeName} maxLength={50} onChange={(e) => setStoreName(e.target.value)} style={{ ...input, width: 220 }} /></label>
            <label style={{ display: "block" }}><span style={t.fieldLabel}>営業開始</span><br /><input type="time" value={hours.open} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, open: e.target.value })); }} style={input} /></label>
            <label style={{ display: "block" }}><span style={t.fieldLabel}>営業終了</span><br /><input type="time" value={hours.close} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, close: e.target.value })); }} style={input} /></label>
            <label style={{ display: "block" }}><span style={t.fieldLabel}>営業日の切替時刻</span><br /><input type="time" value={hours.cutoff} onChange={(e) => { setHoursTouched(true); setHours((h) => ({ ...h, cutoff: e.target.value })); }} style={input} /></label>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "6px 0 0" }}>営業時間は全曜日に同じ値を入れます（曜日別は後から「営業時間・定休日」で）。終了が開始より早い場合は翌日扱い＝{closeLabel}。</p>
        </section>
      )}

      {step === 1 && biz && pricingEff && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 2　料金について</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 10px" }}>{BIZ_TYPES.find((b) => b.key === biz)?.label} 向けの初期テンプレートです。{tpl?.assumption ?? "バーは空テンプレ（料金 1 行・商品なし）です。"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {([
              ["set_fee", `セット料金（${pricingEff.set_min}分）`], ["ext_fee", `延長料金（${pricingEff.ext_min}分）`],
              ["hon_fee", "本指名料"], ["jonai_fee", "場内指名料"], ["dohan_fee", "同伴料"], ["service_rate", "サービス料（%）"],
            ] as const).map(([k, label]) => (
              <label key={k} style={{ display: "block" }}><span style={t.fieldLabel}>{label}</span><br />
                <input type="number" inputMode="numeric" min={0} value={pricingEff[k]} onChange={(e) => setPricing({ ...pricingEff, [k]: Number(e.target.value) })} style={{ ...input, width: "100%" }} className="num" />
              </label>
            ))}
            {pricingEff.ext2 && <label style={{ display: "block" }}><span style={t.fieldLabel}>延長料金（{pricingEff.ext2.min}分・2 段目）</span><br />
              <input type="number" inputMode="numeric" min={0} value={pricingEff.ext2.fee} onChange={(e) => setPricing({ ...pricingEff, ext2: { min: pricingEff.ext2!.min, fee: Number(e.target.value) } })} style={{ ...input, width: "100%" }} className="num" /></label>}
            {pricingEff.vip_charge != null && <label style={{ display: "block" }}><span style={t.fieldLabel}>VIPチャージ</span><br />
              <input type="number" inputMode="numeric" min={0} value={pricingEff.vip_charge} onChange={(e) => setPricing({ ...pricingEff, vip_charge: Number(e.target.value) })} style={{ ...input, width: "100%" }} className="num" /></label>}
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 6, fontSize: 12.5 }}>
            <div><b>席</b>：{seats.length ? `卓 ${tpl?.seats.table_count ?? 0}・VIP ${tpl?.seats.vip_count ?? 0}・カウンター ${tpl?.seats.counter_count ?? 0}（合計 ${seats.length}）` : "なし"}</div>
            <div><b>報酬既定</b>：{comp ? `時給 ${yen(comp.base)}・本指名 ${yen(comp.hon_back)}／場内 ${yen(comp.jonai_back)}／同伴 ${yen(comp.dohan_back)}（待遇プラン「標準」）` : "なし（後から待遇プランで設定）"}</div>
            <div><b>商品</b>：{tpl ? `${tpl.products.length} 件のうち ${pp.included.length} 件を投入（食品など ${pp.excludedTotal} 件は除外${pp.excludedTotal ? `＝${Object.entries(pp.excluded).map(([k, v]) => `${k} ${v}`).join("・")}` : ""}）・バック設定の上書き ${pp.overrides} 件` : "なし"}</div>
          </div>
          {tpl && pp.included.length > 0 && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={includeProducts} onChange={(e) => setIncludeProducts(e.target.checked)} style={{ width: 18, height: 18 }} />
              商品テンプレも取り込む（{pp.included.length} 件）
            </label>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 3　キャスト待遇（使う制度）</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 10px" }}>採用する待遇制度を選びます。既定は「時給・最低保証」と「各種バック」のみ ON。OFF にした制度は該当する画面の節が表示されないだけで、後から変更できます。</p>
          <StoreSystemsPanel settings={systems} onChange={(k, next) => setSystems((s) => ({ ...s, [k]: next }))} usage={usage} />
          {/* ★0154 D4（裁定293 追補1-1）: 精算調整のひな形は完了時に既定 3 件（遅刻／当欠／早退・額 0）を作る＝文と額は「報酬制度」で編集 */}
          <p style={{ ...t.sub, fontSize: 12, margin: "10px 0 0" }}>精算調整のひな形（遅刻／当欠／早退・既定額 0）は初期設定の完了時に作られます。文と額は「マスタ ▸ 報酬制度」で編集できます。</p>
        </section>
      )}

      {step === 3 && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 4　会計・レジ</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 10px" }}>会計方式と利用機能を設定します。必要な機能だけ有効にする想定です。</p>
          <div style={{ fontSize: 12, fontWeight: 800, margin: "0 0 6px" }}>会計方式 <span style={{ fontWeight: 400, color: "var(--sub)" }}>表示のみの記録＝レジの挙動は変わりません</span></div>
          <SegSelect value={billingMode} onChange={(v) => setBillingMode(v as "table" | "individual" | "mixed")} options={BILLING_MODES} ariaLabel="会計方式" />
          {/* ★裁定272-5（0148）: 受取方針＝stores.receivable_policy（実列・set_store_receivable_policy・既定 customer_only） */}
          <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 6px" }}>売掛の受取方針 <span style={{ fontWeight: 400, color: "var(--sub)" }}>誰の売掛を扱うか（後から変更できます）</span></div>
          <SegSelect value={receivablePolicy} onChange={(v) => setReceivablePolicy(v as ReceivablePolicy)} options={RECEIVABLE_POLICIES} ariaLabel="売掛の受取方針" />
          <div style={{ fontSize: 12, fontWeight: 800, margin: "14px 0 6px" }}>使う機能 <span style={{ fontWeight: 400, color: "var(--sub)" }}>会社の既定（全店）として保存します</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(FLAG_LABELS).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <div><div style={{ fontSize: 13, fontWeight: 800 }}>{v.label}</div><div style={{ fontSize: 11.5, color: "var(--sub)" }}>{v.desc}</div></div>
                <div className="nox-seg" role="group" aria-label={v.label}>
                  <button type="button" className={!flags[k] ? "on" : ""} onClick={() => setFlags((f) => ({ ...f, [k]: false }))}>OFF</button>
                  <button type="button" className={flags[k] ? "on" : ""} onClick={() => setFlags((f) => ({ ...f, [k]: true }))}>ON</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 4 && biz && pricingEff && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>STEP 5　設定内容を確認</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 10px" }}>初期設定の内容を確認します。すべて後から変更できます。</p>
          <div className="nox-tablewrap plain">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {([
                  ["業態", BIZ_TYPES.find((b) => b.key === biz)?.label ?? biz],
                  ["店舗名", storeName],
                  ["営業時間", `${hours.open}〜${closeLabel}（切替 ${hours.cutoff}・全曜日）`],
                  ["席", seats.length ? `${seats.length} 席${liveCounts.seats > 0 ? "（既存 " + liveCounts.seats + " 席あり＝投入しない）" : ""}` : "なし"],
                  ["料金", `セット ${yen(pricingEff.set_fee)}/${pricingEff.set_min}分・延長 ${yen(pricingEff.ext_fee)}/${pricingEff.ext_min}分${pricingEff.ext2 ? `・延長 ${yen(pricingEff.ext2.fee)}/${pricingEff.ext2.min}分` : ""}・本指名 ${yen(pricingEff.hon_fee)}・場内 ${yen(pricingEff.jonai_fee)}・同伴 ${yen(pricingEff.dohan_fee)}・サービス料 ${pricingEff.service_rate}%${pricingEff.vip_charge != null ? `・VIP ${yen(pricingEff.vip_charge)}` : ""}`],
                  ["報酬既定", comp ? `時給 ${yen(comp.base)}（待遇プラン「標準」）${liveCounts.plans > 0 ? "（既存プランあり＝投入しない）" : ""}` : "なし"],
                  ["使う制度", SYSTEM_KEYS.filter((k) => systems[k]).length + " / 9 を ON"],
                  ["会計方式", `${BILLING_MODES.find(([k]) => k === billingMode)?.[1]}（表示のみの記録）`],
                  ["受取方針", RECEIVABLE_POLICIES.find(([k]) => k === receivablePolicy)?.[1] ?? receivablePolicy], // ★裁定272-5
                  ["機能", changedFlags.length ? changedFlags.map((f) => `${FLAG_LABELS[f.key].label} ${f.enabled ? "ON" : "OFF"}`).join("・") : "変更なし"],
                  ["商品", includeProducts && pp.included.length ? `${pp.included.length} 件を投入（除外 ${pp.excludedTotal} 件・バック上書き ${pp.overrides} 件）${liveCounts.products > 0 ? "（既存 " + liveCounts.products + " 件あり＝投入しない）" : ""}` : "取り込まない"],
                  ["書込", `${plan.length} 件（店舗設定 ${summary.settings}・営業時間 ${summary.hours}・席 ${summary.seats}・料金 ${summary.pricing}・報酬 ${summary.comp}・商品 ${summary.products + summary.overrides}・機能 ${summary.flags}・完了 ${summary.done}）`],
                ] as const).map(([k, v]) => (
                  <tr key={k}><th style={{ ...t.th, width: 110 }}>{k}</th><td style={t.td}>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {(run.running || run.done > 0 || run.error) && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              <div><b className="num">{run.done}</b> / {run.total} 件{run.running ? " 実行中…" : run.completed ? " 完了" : run.error ? `　失敗（${run.failedAt! + 1} 件目）` : ""}</div>
              {run.error && <p style={{ color: "var(--bad)", margin: "4px 0 0" }}>{run.error}<br /><span style={{ color: "var(--sub)" }}>ここまでの書込は残っています。原因を直してから「初期設定を完了」を押すと続きから再実行できます（席・商品は既存があれば二重投入しません）。</span></p>}
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--sub)", maxHeight: 180, overflowY: "auto" }}>{run.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {/* footnav: 戻る（左・補助）／次へ・完了（右・主要）＝裁定244 */}
      <div className="nox-formmodal-foot" style={{ marginTop: 14 }}>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={step === 0 || run.running} onClick={() => setStep((s) => Math.max(0, s - 1))}>戻る</button>
        {step < 4 ? (
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={!canNext} onClick={() => setStep((s) => Math.min(4, s + 1))}>次へ：{STEPS[step + 1][0]}</button>
        ) : (
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={run.running || plan.length === 0} onClick={() => void execute()}>{run.error ? "続きから再実行" : "初期設定を完了"}</button>
        )}
      </div>
    </div>
  );
}
