"use client";
// ★0210（起票140＝ホストの初回料金・相談役 11/25 の決め）: 料金のマスタの「初回料金」カード（旗 MIG_0210_APPLIED の後ろでだけ出す＝列と関数の無い本番では読まない・呼ばない）。
//   区分に「初回料金」の印（1 店に 1 つ・set_pricing_category_first）・初回の区分のセットの行に 2 つの選択（額の持ち方・時間の終わり方＝set_pricing_rule_first）・
//   店設定「税・サ込みの額をホストの報酬の売上に数える」（owner だけ・set_store_profile の first_visit_in_sales・既定は数える）。
//   言葉：台帳の「初回セット行」とぶつかるので「初回料金」と呼ぶ。雛形とデモには入れない（起票140）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Message } from "@/components/ui/toast";
import { PRICE_MODES, PRICE_MODE_LABEL, TIME_ENDS, TIME_END_LABEL, firstVisitErrJa, firstVisitShadowBlockOf, firstVisitShadowsOf, firstVisitPartialShadowsOf, FIRST_VISIT_PARTIAL_NOTE_JA, priceModeOf, setLineNameOf, timeEndOf, type PriceMode, type TimeEnd } from "@/lib/nox/register/first-visit";
import { firstVisitReceiptR1On } from "@/lib/nox/rules-0175/flag"; // ★0210 v2（【F5】）: 税・サ込みは案 R1 の旗の後ろ（税理士の答えが出るまで選べない）

type Cat = { id: string; name: string; is_active: boolean; first_visit: boolean };
type Rule = { id: string; fee_kind: string; amount: number; duration_min: number | null; category_id: string | null; price_mode: string; time_end: string; priority: number; is_active: boolean; seat_kind: string | null;
  rank_id: string | null; dow_mask: number | null; time_from_min: number | null; time_to_min: number | null /* ★0210 v2: 当たらない並びの判定（pricing_resolve_core と同じ条件） */ };
const hmMin = (hm: unknown): number => { const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(String(hm ?? "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : 360; };
/** ★0210 v2: 案 R1（レシートの書き方）が税理士の答えの前＝税・サ込みを選べない理由 */
const R1_WAIT_JA = "税・サ込みの額は、レシートの書き方を税理士に確かめている間は選べません";

export default function FirstVisitCard({ storeId, isOwner, version, setMin }: { storeId: string; isOwner: boolean; version: number; setMin: number }) {
  const supabase = createClient();
  const [cats, setCats] = useState<Cat[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [vals, setVals] = useState<Record<string, { pm: PriceMode; te: TimeEnd }>>({});
  const [inSales, setInSales] = useState(true);
  const [cutMin, setCutMin] = useState(360); // ★0210 v2: 営業日の切替（biz_cutoff_hm・既定 06:00）
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const load = useCallback(async () => {
    const [{ data: cs }, { data: rs }, { data: st }] = await Promise.all([
      supabase.from("pricing_categories").select("id, name, is_active, first_visit").eq("store_id", storeId).order("sort").order("name"),
      supabase.from("pricing_rules").select("id, fee_kind, amount, duration_min, category_id, price_mode, time_end, priority, is_active, seat_kind, rank_id, dow_mask, time_from_min, time_to_min").eq("store_id", storeId).eq("fee_kind", "set").order("priority").order("created_at"),
      supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle(),
    ]);
    const c = (cs ?? []) as Cat[]; const r = (rs ?? []) as Rule[];
    setCats(c); setRules(r);
    setVals(Object.fromEntries(r.map((x) => [x.id, { pm: priceModeOf(x.price_mode), te: timeEndOf(x.time_end) }])));
    setInSales(((st as { settings_json?: Record<string, unknown> } | null)?.settings_json?.first_visit_in_sales) !== false);
    setCutMin(hmMin((st as { settings_json?: Record<string, unknown> } | null)?.settings_json?.biz_cutoff_hm));
  }, [supabase, storeId]);
  useEffect(() => { void load(); }, [load, version]);

  const errOf = (m: string) => firstVisitErrJa(m) ?? (m.includes("billing locked") ? "ご利用プランが停止中のため保存できません" : m.includes("forbidden") ? "権限がありません" : m);
  async function setFirst(c: Cat, on: boolean) {
    if (!on && !window.confirm(`「${c.name}」の初回料金の印を外します。この区分のセットの行は「サービス料と税を足す・延長に移る」に戻ります。よろしいですか？`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_pricing_category_first", { p_id: c.id, p_first_visit: on });
    setBusy(false);
    setMsg(error ? { text: errOf(error.message), bad: true } : { text: on ? `「${c.name}」を初回料金の区分にしました` : `「${c.name}」の印を外しました`, bad: false });
    await load();
  }
  async function saveRule(r: Rule) {
    const v = vals[r.id] ?? { pm: "base" as PriceMode, te: "extend" as TimeEnd };
    // ★0210 v2（相談役 11/25 の便 F【F5】の決め）: 初回の区分のセットの行が当たらない並びなら、保存で止めて理由を出す（DB の set_pricing_rule_first も 'first visit shadowed' で止める）
    const fvIds = cats.filter((c) => c.first_visit && c.is_active).map((c) => c.id);
    const block = firstVisitShadowBlockOf(rules, rules.map((x) => (x.id === r.id ? { ...x, price_mode: v.pm, time_end: v.te } : x)), fvIds, cutMin);
    if (block) { setMsg({ text: block, bad: true }); return; }
    if (v.pm === "all_in" && priceModeOf(r.price_mode) !== "all_in" && !firstVisitReceiptR1On()) { setMsg({ text: R1_WAIT_JA, bad: true }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_pricing_rule_first", { p_id: r.id, p_price_mode: v.pm, p_time_end: v.te });
    setBusy(false);
    setMsg(error ? { text: errOf(error.message), bad: true } : { text: "保存しました（これから開く卓から効きます）", bad: false });
    await load();
  }
  async function saveInSales(on: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { first_visit_in_sales: on } });
    setBusy(false);
    setMsg(error ? { text: errOf(error.message), bad: true } : { text: "保存しました", bad: false });
    await load();
  }

  const fc = cats.find((c) => c.first_visit && c.is_active) ?? null;
  const fr = fc ? rules.filter((r) => r.category_id === fc.id) : [];
  const shadowed = new Set(fc ? firstVisitShadowsOf(rules, [fc.id], cutMin, false).map((h) => h.ruleId) : []); // ★0210 v2: 当たらない並びの行（選択に依らず表示）
  const partial = new Set(fc ? firstVisitPartialShadowsOf(rules, [fc.id], cutMin).map((h) => h.ruleId) : []); // ★0210 版 3（【G4】①）: 一部の場面で通常の料金が当たる行＝注意だけ（保存は通す）
  if (cats.length === 0) return null;
  return (
    <section className="nox-cardtop" data-first-visit-card="1" style={{ marginBottom: 14, padding: 14, border: "1px solid var(--line)", borderRadius: 12 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>初回料金</h3>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
        初回の来店にだけ当てる料金です。区分の 1 つに印を付け、その区分のセットの行で「額の持ち方」と「時間の終わり方」を選びます。開卓のときにスタッフ・キャスト・端末も選べます。来店の記録があるお客様には注意が出ます（止めません）。決めた内容は開卓した時点で伝票に固定されます。
      </p>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {cats.filter((c) => c.is_active).map((c) => (
          <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
            <input type="checkbox" checked={c.first_visit} disabled={busy || (!!fc && fc.id !== c.id)} onChange={(e) => void setFirst(c, e.target.checked)} />
            {c.name}{c.first_visit ? "（初回料金）" : ""}
          </label>
        ))}
      </div>
      {fc && (fr.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>「{fc.name}」のセットの行がまだありません。料金の表で区分「{fc.name}」のセット料金を作ってください。</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
          {fr.map((r) => {
            const v = vals[r.id] ?? { pm: "base" as PriceMode, te: "extend" as TimeEnd };
            const min = r.duration_min ?? setMin;
            const behind = shadowed.has(r.id);
            return (
              <div key={r.id} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid var(--line)", borderRadius: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{min}分 ¥{r.amount.toLocaleString()}{r.is_active ? "" : "（停止中）"}</div>
                <label style={{ fontSize: 13 }}>額の持ち方{" "}
                  <select value={v.pm} disabled={busy} onChange={(e) => setVals((p) => ({ ...p, [r.id]: { ...v, pm: e.target.value as PriceMode } }))}>
                    {PRICE_MODES.map((m) => <option key={m} value={m} disabled={m === "all_in" && !firstVisitReceiptR1On() && priceModeOf(r.price_mode) !== "all_in"}>{PRICE_MODE_LABEL[m]}{m === "all_in" && !firstVisitReceiptR1On() ? "（税理士の確認待ち）" : ""}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>時間の終わり方{" "}
                  <select value={v.te} disabled={busy} onChange={(e) => setVals((p) => ({ ...p, [r.id]: { ...v, te: e.target.value as TimeEnd } }))}>
                    {TIME_ENDS.map((m) => <option key={m} value={m}>{TIME_END_LABEL[m]}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: 12, color: "var(--sub)" }} data-first-visit-preview="1">
                  伝票の行：「{setLineNameOf(min, v.pm)}」{v.pm === "all_in" ? `・1 名 ¥${r.amount.toLocaleString()} ちょうど（サービス料・消費税・端数の丸めを足さない）` : "・サービス料と税を足して丸める（今と同じ）"}
                  {v.te === "end" ? "・時間で終わり（延長しない・10 分前に黄色・店長以上が延長に切り替えられる）" : v.te === "unlimited" ? "・時間無制限（延長しない・終わらない）" : "・時間を過ぎると延長に移る"}
                </div>
                {!behind && partial.has(r.id) && <div style={{ fontSize: 12, color: "var(--sub)" }} data-first-visit-partial="1">{FIRST_VISIT_PARTIAL_NOTE_JA}</div>}
                {behind && <div style={{ fontSize: 12, color: "var(--warn, #e0b341)", fontWeight: 700 }}>この行は区分なしのセット料金より下に並んでいて、開卓で当たりません。料金の表で上に移すまで、額の持ち方と時間の終わり方は保存できません。</div>}
                <div><button type="button" disabled={busy} onClick={() => void saveRule(r)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontWeight: 700 }}>保存</button></div>
              </div>
            );
          })}
        </div>
      ))}
      {isOwner && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }} data-first-visit-in-sales="1">
          <input type="checkbox" checked={inSales} disabled={busy} onChange={(e) => void saveInSales(e.target.checked)} />
          税・サ込みの額をホストの報酬の売上に数える（既定は数える）
        </label>
      )}
      {msg && <Message kind={msg.bad ? "error" : "success"} style={{ margin: "8px 0 0", fontSize: 12 }}>{msg.text}</Message>}
    </section>
  );
}
