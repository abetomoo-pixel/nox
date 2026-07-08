"use client";

import { useMemo, useState } from "react";
import type { CompPlan, PlanOverride, TaxMode } from "@/lib/nox/pay";
import type { StoreMasters } from "@/lib/nox/payroll/assemble";
import { simulate, type SimInput } from "@/lib/nox/payroll/sim";

// F2f 報酬シミュレーター（cast/店 1画面・役割分岐）。
//   cast モード＝自分のプラン/店マスタ固定・open 残（前借り/送り）を反映・売掛は確定明細参照の注記誘導。
//   店モード＝プラン選択＋base/バック編集で任意プラン試算・天引きなし。
//   計算は確定と同じ payOf を共有（lib/nox/payroll/sim.simulate＝純関数）＝表示と確定でズレない。
// 使い捨て（保存なし・mig ゼロ）。実データは props（server 側で RLS 読取）で受け取る。
// variant: 見た目のみ（"dark"＝.nox-dark 配下用／"light"＝従来・既定）。計算・ロジックは variant 非依存。
export default function SimulatorPanel({
  mode,
  plans,
  masters,
  openAdv,
  openOkuri,
  defaultTaxMode,
  override,
  variant = "light",
}: {
  mode: "cast" | "store";
  plans: CompPlan[];
  masters: StoreMasters;
  openAdv: number; // cast の open 前借り残（店=0）
  openOkuri: number; // cast の open 送り実費残（店=0）
  defaultTaxMode: TaxMode;
  override?: PlanOverride; // cast の cast_plan.overrides_json（店モードは未使用）
  variant?: "light" | "dark";
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [taxMode, setTaxMode] = useState<TaxMode>(defaultTaxMode);
  // 店モードのみ base/バック編集（任意プラン試算）。cast は選択プランを固定。
  const [edit, setEdit] = useState<{ base: string; honBack: string; jonaiBack: string; dohanBack: string } | null>(null);
  const [f, setF] = useState({
    days: "20", hoursPerDay: "6", sales: "600000",
    hon: "10", jonai: "5", dohan: "3",
    drink: "0", champ: "0", bottle: "0",
    pointProducts: "0", champCnt: "0", bottleCnt: "0",
    lateN: "0", absentN: "0",
    normDays: "0", normDohan: "0",
  });
  // cast は自分の open 残を反映（トグルで外して gross 感を見ることも可）。店は常に天引きなし。
  const [applyDeducts, setApplyDeducts] = useState(mode === "cast");

  const selectedPlan = plans.find((p) => p.id === planId) ?? plans[0];
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // 実効プラン: 店モードで編集中なら base/バックを上書き（slide は元プランのまま）。
  const effPlan: CompPlan | undefined = useMemo(() => {
    if (!selectedPlan) return undefined;
    if (mode !== "store" || !edit) return selectedPlan;
    return {
      ...selectedPlan,
      base: num(edit.base), honBack: num(edit.honBack), jonaiBack: num(edit.jonaiBack), dohanBack: num(edit.dohanBack),
    };
  }, [selectedPlan, mode, edit]);

  const result = useMemo(() => {
    if (!effPlan) return null;
    const input: SimInput = {
      days: num(f.days), hoursPerDay: num(f.hoursPerDay), sales: num(f.sales),
      hon: num(f.hon), jonai: num(f.jonai), dohan: num(f.dohan),
      productBack: { drink: num(f.drink), champ: num(f.champ), bottle: num(f.bottle) },
      pointProducts: num(f.pointProducts), champCnt: num(f.champCnt), bottleCnt: num(f.bottleCnt),
      lateN: num(f.lateN), absentN: num(f.absentN),
      norm: { days: num(f.normDays), dohan: num(f.normDohan) },
      plan: effPlan, override: mode === "cast" ? override : undefined, masters, taxMode,
      advanceDeduct: applyDeducts ? openAdv : 0,
      okuriDeduct: applyDeducts ? openOkuri : 0,
      // 売掛(ar)は反映しない（(a) 裁定＝receivables はパターン2 で cast 読取不可・確定明細参照へ誘導）。
      arDeduct: 0,
    };
    return { pay: simulate(input) };
  }, [effPlan, f, mode, override, masters, taxMode, applyDeducts, openAdv, openOkuri]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const yen = (n: number) => "¥" + Math.round(n).toLocaleString();

  const dark = variant === "dark";
  const s = styleSet(dark);

  if (!selectedPlan) {
    return (
      <div style={{ ...s.card, maxWidth: 620 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>報酬シミュレーター</h2>
        <p style={{ fontSize: 13, color: s.sub }}>
          {mode === "cast" ? "報酬プランが未割当です。店にご確認ください。" : "報酬プランが未登録です。プラン管理から作成してください。"}
        </p>
      </div>
    );
  }

  return (
    <div className={dark ? "nox-cardtop" : undefined} style={{ ...s.card, maxWidth: 620 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>報酬シミュレーター（{mode === "cast" ? "自分の見込み" : "採用・プラン試算"}）</h2>
      <p style={{ fontSize: 12, color: s.sub, marginTop: 0 }}>
        ※確定給与と同じ計算式で試算します（保存されません）。実績ではなく仮の数字を入れて手取りの目安を見るものです。
      </p>

      {/* プラン・税区分 */}
      <div style={s.row}>
        <label style={s.lbl}>報酬プラン<br />
          {mode === "store" ? (
            <select value={planId} onChange={(e) => { setPlanId(e.target.value); setEdit(null); }} style={s.inp}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span style={{ ...s.inp, display: "inline-block", background: s.fixedBg }}>{selectedPlan.name}（固定）</span>
          )}
        </label>
        <label style={s.lbl}>税区分<br />
          <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)} style={s.inp}>
            <option value="委託">委託</option>
            <option value="雇用">雇用</option>
          </select>
        </label>
      </div>

      {/* 店モードのみ: プランの base/バックを編集（任意プラン試算） */}
      {mode === "store" && (
        <div style={{ ...s.card, background: s.nestBg, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>プラン値（編集して任意プランを試算）</strong>
            <button onClick={() => setEdit(edit ? null : { base: String(selectedPlan.base), honBack: String(selectedPlan.honBack), jonaiBack: String(selectedPlan.jonaiBack), dohanBack: String(selectedPlan.dohanBack) })} style={s.btnSm}>
              {edit ? "元に戻す" : "編集する"}
            </button>
          </div>
          {edit && (
            <div style={{ ...s.row, marginTop: 8 }}>
              <label style={s.lbl}>保証時給<br /><input type="number" value={edit.base} onChange={(e) => setEdit({ ...edit, base: e.target.value })} style={s.inpS} /></label>
              <label style={s.lbl}>本指名<br /><input type="number" value={edit.honBack} onChange={(e) => setEdit({ ...edit, honBack: e.target.value })} style={s.inpS} /></label>
              <label style={s.lbl}>場内<br /><input type="number" value={edit.jonaiBack} onChange={(e) => setEdit({ ...edit, jonaiBack: e.target.value })} style={s.inpS} /></label>
              <label style={s.lbl}>同伴<br /><input type="number" value={edit.dohanBack} onChange={(e) => setEdit({ ...edit, dohanBack: e.target.value })} style={s.inpS} /></label>
            </div>
          )}
          <p style={{ fontSize: 11, color: s.sub, margin: "6px 0 0" }}>※売上/pt スライドは選択プランの設定をそのまま使用します。</p>
        </div>
      )}

      {/* 勤務・売上 */}
      <fieldset style={s.fs}><legend style={s.lg}>勤務・売上</legend>
        <div style={s.row}>
          <label style={s.lbl}>出勤日数<br /><input type="number" value={f.days} onChange={set("days")} style={s.inpS} /></label>
          <label style={s.lbl}>1日の時間<br /><input type="number" value={f.hoursPerDay} onChange={set("hoursPerDay")} style={s.inpS} /></label>
          <label style={s.lbl}>総売上(円)<br /><input type="number" value={f.sales} onChange={set("sales")} style={s.inp} /></label>
        </div>
      </fieldset>

      {/* 指名・バック */}
      <fieldset style={s.fs}><legend style={s.lg}>指名・バック</legend>
        <div style={s.row}>
          <label style={s.lbl}>本指名<br /><input type="number" value={f.hon} onChange={set("hon")} style={s.inpS} /></label>
          <label style={s.lbl}>場内<br /><input type="number" value={f.jonai} onChange={set("jonai")} style={s.inpS} /></label>
          <label style={s.lbl}>同伴<br /><input type="number" value={f.dohan} onChange={set("dohan")} style={s.inpS} /></label>
          <label style={s.lbl}>本指名商品pt<br /><input type="number" value={f.pointProducts} onChange={set("pointProducts")} style={s.inpS} /></label>
        </div>
        <div style={s.row}>
          <label style={s.lbl}>ドリンクバック(円)<br /><input type="number" value={f.drink} onChange={set("drink")} style={s.inpS} /></label>
          <label style={s.lbl}>シャンパン(円)<br /><input type="number" value={f.champ} onChange={set("champ")} style={s.inpS} /></label>
          <label style={s.lbl}>ボトル(円)<br /><input type="number" value={f.bottle} onChange={set("bottle")} style={s.inpS} /></label>
        </div>
        <div style={s.row}>
          <label style={s.lbl}>シャンパン本数<br /><input type="number" value={f.champCnt} onChange={set("champCnt")} style={s.inpS} /></label>
          <label style={s.lbl}>ボトル本数<br /><input type="number" value={f.bottleCnt} onChange={set("bottleCnt")} style={s.inpS} /></label>
        </div>
      </fieldset>

      {/* 罰金・ノルマ */}
      <fieldset style={s.fs}><legend style={s.lg}>罰金・ノルマ</legend>
        <div style={s.row}>
          <label style={s.lbl}>遅刻回数<br /><input type="number" value={f.lateN} onChange={set("lateN")} style={s.inpS} /></label>
          <label style={s.lbl}>欠勤回数<br /><input type="number" value={f.absentN} onChange={set("absentN")} style={s.inpS} /></label>
          <label style={s.lbl}>ノルマ日数<br /><input type="number" value={f.normDays} onChange={set("normDays")} style={s.inpS} /></label>
          <label style={s.lbl}>ノルマ同伴<br /><input type="number" value={f.normDohan} onChange={set("normDohan")} style={s.inpS} /></label>
        </div>
      </fieldset>

      {/* cast: 天引き反映トグル */}
      {mode === "cast" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, margin: "4px 0 12px", color: s.body }}>
          <input type="checkbox" checked={applyDeducts} onChange={(e) => setApplyDeducts(e.target.checked)} />
          未清算の前借り/送りを手取りから引く（前借り {yen(openAdv)}・送り {yen(openOkuri)}）
        </label>
      )}

      {/* 結果 */}
      {result && (
        <div style={{ ...s.card, ...s.resultCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: s.body }}>差引支給（手取り）</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: s.net, fontFamily: dark ? "'Outfit', sans-serif" : undefined }}>{yen(result.pay.net)}</span>
          </div>
          <table style={{ width: "100%", fontSize: 13, marginTop: 8, borderCollapse: "collapse" }}>
            <tbody>
              <Line dark={dark} label="時給（加重平均）" v={`¥${Math.round(result.pay.wage).toLocaleString()}/h × ${result.pay.wHours}h`} />
              <Line dark={dark} label="時給給与" v={yen(result.pay.timePay)} />
              <Line dark={dark} label="指名バック（本/場内/同伴）" v={yen(result.pay.honBack + result.pay.jonaiBack + result.pay.dohanBack)} />
              <Line dark={dark} label="商品・売上・自由バック" v={yen(result.pay.drinkBack + result.pay.champBack + result.pay.bottleBack + result.pay.salesBack + result.pay.customTotal)} />
              <Line dark={dark} label="総支給（gross）" v={yen(result.pay.gross)} bold />
              <Line dark={dark} label="− 固定控除" v={`−${yen(result.pay.fixedDed)}`} minus />
              <Line dark={dark} label="− 罰金" v={`−${yen(result.pay.fine)}`} minus />
              <Line dark={dark} label={`− 源泉（${taxMode}）`} v={`−${yen(result.pay.withholding)}`} minus />
              <Line dark={dark} label="− ノルマ未達" v={`−${yen(result.pay.normPenalty)}`} minus />
              {result.pay.advanceDeduct > 0 && <Line dark={dark} label="− 前借り" v={`−${yen(result.pay.advanceDeduct)}`} minus />}
              {result.pay.okuriDeduct > 0 && <Line dark={dark} label="− 送り実費" v={`−${yen(result.pay.okuriDeduct)}`} minus />}
            </tbody>
          </table>
          {mode === "cast" && (
            <p style={{ fontSize: 11, color: s.sub, margin: "4px 0 0" }}>
              ※売掛（客のツケ負担分）の天引きは、このシミュレーターには含まれません。確定分は「確定給与明細」をご確認ください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, v, bold, minus, dark }: { label: string; v: string; bold?: boolean; minus?: boolean; dark?: boolean }) {
  const labelColor = minus ? (dark ? "var(--bad)" : "#c0392b") : (dark ? "var(--sub)" : "#4a4a4a");
  const valColor = minus ? (dark ? "var(--bad)" : "#c0392b") : (dark ? "var(--ink)" : "#222");
  return (
    <tr>
      <td style={{ padding: "3px 0", color: labelColor }}>{label}</td>
      <td style={{ padding: "3px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: valColor, fontFamily: dark ? "'Outfit', sans-serif" : undefined }}>{v}</td>
    </tr>
  );
}

// 見た目のみ（light＝従来／dark＝.nox-dark 配下用・CSS 変数参照）。ロジックは variant 非依存。
function styleSet(dark: boolean) {
  if (!dark) {
    return {
      card: { border: "1px solid #ebebeb", borderRadius: 8, padding: 16, background: "#fff", marginBottom: 16 } as React.CSSProperties,
      row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 } as React.CSSProperties,
      lbl: { fontSize: 12, color: "#404040" } as React.CSSProperties,
      inp: { padding: 6, border: "1px solid #ccc", borderRadius: 4, width: 140 } as React.CSSProperties,
      inpS: { padding: 6, border: "1px solid #ccc", borderRadius: 4, width: 84 } as React.CSSProperties,
      fs: { border: "1px solid #eee", borderRadius: 6, padding: "6px 10px 10px", marginBottom: 12 } as React.CSSProperties,
      lg: { fontSize: 12, color: "#6b6b6b", padding: "0 4px" } as React.CSSProperties,
      btnSm: { padding: "4px 10px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12 } as React.CSSProperties,
      sub: "#8f8f8f",
      body: "#4a4a4a",
      fixedBg: "#f7f7f7",
      nestBg: "#fafafa",
      resultCard: { background: "#f6f9f7", border: "1px solid #cde8d4" } as React.CSSProperties,
      net: "#1e824c",
    };
  }
  return {
    card: { background: "linear-gradient(180deg,var(--card2),var(--card))", border: "1px solid var(--line)", borderRadius: 16, padding: 16, marginBottom: 16, position: "relative", overflow: "hidden" } as React.CSSProperties,
    row: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 } as React.CSSProperties,
    lbl: { fontSize: 12, color: "var(--sub)" } as React.CSSProperties,
    inp: { padding: 8, border: "1px solid var(--line2)", borderRadius: 9, width: 140, background: "var(--bg2)", color: "var(--ink)", fontFamily: "inherit" } as React.CSSProperties,
    inpS: { padding: 8, border: "1px solid var(--line2)", borderRadius: 9, width: 84, background: "var(--bg2)", color: "var(--ink)", fontFamily: "inherit" } as React.CSSProperties,
    fs: { border: "1px solid var(--line)", borderRadius: 11, padding: "6px 10px 10px", marginBottom: 12 } as React.CSSProperties,
    lg: { fontSize: 12, color: "var(--sub)", padding: "0 4px" } as React.CSSProperties,
    btnSm: { padding: "6px 12px", background: "transparent", color: "var(--ink)", border: "1px solid var(--line2)", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 800 } as React.CSSProperties,
    sub: "var(--sub)",
    body: "var(--ink)",
    fixedBg: "var(--bg2)",
    nestBg: "var(--bg)",
    resultCard: { background: "linear-gradient(180deg,var(--card2),var(--card))", border: "1px solid var(--line2)" } as React.CSSProperties,
    net: "var(--champ)",
  };
}
