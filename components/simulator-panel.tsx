"use client";

import { useMemo, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import type { BackMode, CompPlan, PlanOverride, TaxMode } from "@/lib/nox/pay";
import type { StoreMasters } from "@/lib/nox/payroll/assemble";
import { simulate, type SimInput } from "@/lib/nox/payroll/sim";
import * as t from "@/lib/nox/ui/theme";

// F2f 報酬シミュレーター（cast/店 1画面・役割分岐）。
//   cast モード＝自分のプラン/店マスタ固定・open 残（前借り/送り）を反映・売掛は確定明細参照の注記誘導。
//   店モード＝プラン選択＋base/バック編集で任意プラン試算・天引きなし。
//   計算は確定と同じ payOf を共有（lib/nox/payroll/sim.simulate＝純関数）＝表示と確定でズレない。
// 使い捨て（保存なし・mig ゼロ）。実データは props（server 側で RLS 読取）で受け取る。
// D-4（2026-07-17）: light variant を廃止。使用箇所は master/page.tsx と mine/page.tsx の 2 つだけで、
//   どちらも .nox-dark 配下かつ variant="dark" 明示＝light 側は一度も描画されない死にコードだった。
//   合わせて variant prop も削除（"dark" 固定＝分岐が無いなら受け取る意味がない）。見た目は dark 側のまま不変。
export default function SimulatorPanel({
  mode,
  plans,
  masters,
  openAdv,
  openOkuri,
  defaultTaxMode,
  override,
  compact = false,
}: {
  mode: "cast" | "store";
  plans: CompPlan[];
  masters: StoreMasters;
  openAdv: number; // cast の open 前借り残（店=0）
  openOkuri: number; // cast の open 送り実費残（店=0）
  defaultTaxMode: TaxMode;
  override?: PlanOverride; // cast の cast_plan.overrides_json（店モードは未使用）
  /** ★裁定106 B2: 主入力（税区分・期間日数・出勤・時間・総売上・指名3・ドリンク）以外を「詳細」で畳む（既定 false＝従来） */
  compact?: boolean;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [taxMode, setTaxMode] = useState<TaxMode>(defaultTaxMode);
  // 店モードのみ base/バック編集（任意プラン試算）。cast は選択プランを固定。
  // D3: hon/jonai は方式（円/本｜率）も編集対象。率の値は mode='rate' のときだけ effPlan に載せる（排他 CHECK と同輪郭）。
  const [edit, setEdit] = useState<{
    base: string; honBack: string; jonaiBack: string; dohanBack: string;
    honBackMode: BackMode; honBackRate: string; jonaiBackMode: BackMode; jonaiBackRate: string;
  } | null>(null);
  const [f, setF] = useState({
    // ★periodDays は既定値を置かない（裁定23＝源泉の 5,000円×日数 は計算期間の暦日数で、
    //   店・期間ごとに異なる。既定値を置くと誤った日数のまま試算されるため未入力はエラーにする）。
    periodDays: "",
    days: "20", hoursPerDay: "6", sales: "600000",
    hon: "10", jonai: "5", dohan: "3",
    honShimeiAmt: "0", jonaiShimeiAmt: "0", // D3: rate 方式の母数（期間の指名料額・円）

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
      honBackMode: edit.honBackMode,
      honBackRate: edit.honBackMode === "rate" ? num(edit.honBackRate) : null,
      jonaiBackMode: edit.jonaiBackMode,
      jonaiBackRate: edit.jonaiBackMode === "rate" ? num(edit.jonaiBackRate) : null,
    };
  }, [selectedPlan, mode, edit]);

  // D3: 入力出し分け用の実効方式（per_count=本数入力・rate=期間の指名料額入力）。
  //   cast モードは override が方式を差し替え得るため、pay.ts applyOverride と同じ
  //   ペア原子判定（mode＋対の値が揃うときのみ採用）をここでも適用して表示とお金の計算を一致させる。
  const ov = mode === "cast" ? override : undefined;
  const effHonMode: BackMode =
    ov?.honBackMode === "rate" && typeof ov.honBackRate === "number" ? "rate"
    : ov?.honBackMode === "per_count" && typeof ov.honBack === "number" ? "per_count"
    : (effPlan?.honBackMode ?? "per_count");
  const effJonaiMode: BackMode =
    ov?.jonaiBackMode === "rate" && typeof ov.jonaiBackRate === "number" ? "rate"
    : ov?.jonaiBackMode === "per_count" && typeof ov.jonaiBack === "number" ? "per_count"
    : (effPlan?.jonaiBackMode ?? "per_count");

  // ★計算期間の日数は必須入力（未入力・0以下は試算しない＝源泉が過大になる誤表示を作らない）。
  const periodDaysNum = Number(f.periodDays);
  const periodDaysOk = f.periodDays.trim() !== "" && Number.isFinite(periodDaysNum) && periodDaysNum > 0;

  const result = useMemo(() => {
    if (!effPlan) return null;
    if (!periodDaysOk) return null;
    const input: SimInput = {
      periodDays: periodDaysNum,
      days: num(f.days), hoursPerDay: num(f.hoursPerDay), sales: num(f.sales),
      hon: num(f.hon), jonai: num(f.jonai), dohan: num(f.dohan),
      honShimeiAmt: num(f.honShimeiAmt), jonaiShimeiAmt: num(f.jonaiShimeiAmt),
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
  }, [effPlan, f, mode, override, masters, taxMode, applyDeducts, openAdv, openOkuri, periodDaysOk, periodDaysNum]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const yen = (n: number) => "¥" + Math.round(n).toLocaleString();

  if (!selectedPlan) {
    return (
      <div style={{ ...s.card }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>報酬シミュレーター</h2>
        <p style={{ fontSize: 13, color: s.sub }}>
          {mode === "cast" ? "報酬プランが未割当です。店にご確認ください。" : "報酬プランが未登録です。プラン管理から作成してください。"}
        </p>
      </div>
    );
  }

  return (
    <div className="nox-cardtop" style={{ ...s.card }}>
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
          <SegSelect value={taxMode} onChange={(v) => setTaxMode(v as TaxMode)}
            options={[["委託", "委託"], ["雇用", "雇用"]] as const} />
        </label>
      </div>

      {/* 店モードのみ: プランの base/バックを編集（任意プラン試算） */}
      {mode === "store" && (
        <div style={{ ...s.card, background: s.nestBg, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>プラン値（編集して任意プランを試算）</strong>
            <button onClick={() => setEdit(edit ? null : {
              base: String(selectedPlan.base), honBack: String(selectedPlan.honBack), jonaiBack: String(selectedPlan.jonaiBack), dohanBack: String(selectedPlan.dohanBack),
              honBackMode: selectedPlan.honBackMode ?? "per_count",
              honBackRate: selectedPlan.honBackRate != null ? String(selectedPlan.honBackRate) : "",
              jonaiBackMode: selectedPlan.jonaiBackMode ?? "per_count",
              jonaiBackRate: selectedPlan.jonaiBackRate != null ? String(selectedPlan.jonaiBackRate) : "",
            })} style={s.btnSm}>
              {edit ? "元に戻す" : "編集する"}
            </button>
          </div>
          {edit && (
            <>
              <div style={{ ...s.row, marginTop: 8 }}>
                <label style={s.lbl}>保証時給<br /><input type="number" value={edit.base} onChange={(e) => setEdit({ ...edit, base: e.target.value })} style={s.inpS} /></label>
                <label style={s.lbl}>同伴(円/本)<br /><input type="number" value={edit.dohanBack} onChange={(e) => setEdit({ ...edit, dohanBack: e.target.value })} style={s.inpS} /></label>
              </div>
              <div style={s.row}>
                <label style={s.lbl}>本指名方式<br />
                  <SegSelect value={edit.honBackMode} onChange={(v) => setEdit({ ...edit, honBackMode: v as BackMode })}
            options={[["per_count", "円/本"], ["rate", "率(%)"]] as const} />
                </label>
                {edit.honBackMode === "rate" ? (
                  <label style={s.lbl}>本指名率(%)<br /><input type="number" value={edit.honBackRate} onChange={(e) => setEdit({ ...edit, honBackRate: e.target.value })} style={s.inpS} /></label>
                ) : (
                  <label style={s.lbl}>本指名(円/本)<br /><input type="number" value={edit.honBack} onChange={(e) => setEdit({ ...edit, honBack: e.target.value })} style={s.inpS} /></label>
                )}
                <label style={s.lbl}>場内方式<br />
                  <SegSelect value={edit.jonaiBackMode} onChange={(v) => setEdit({ ...edit, jonaiBackMode: v as BackMode })}
            options={[["per_count", "円/本"], ["rate", "率(%)"]] as const} />
                </label>
                {edit.jonaiBackMode === "rate" ? (
                  <label style={s.lbl}>場内率(%)<br /><input type="number" value={edit.jonaiBackRate} onChange={(e) => setEdit({ ...edit, jonaiBackRate: e.target.value })} style={s.inpS} /></label>
                ) : (
                  <label style={s.lbl}>場内(円/本)<br /><input type="number" value={edit.jonaiBack} onChange={(e) => setEdit({ ...edit, jonaiBack: e.target.value })} style={s.inpS} /></label>
                )}
              </div>
            </>
          )}
          <p style={{ fontSize: 11, color: s.sub, margin: "6px 0 0" }}>※売上/pt スライドは選択プランの設定をそのまま使用します。</p>
        </div>
      )}

      {/* 勤務・売上 */}
      <fieldset style={s.fs}><legend style={s.lg}>勤務・売上</legend>
        <div style={s.row}>
          {/* ★源泉の 5,000円×日数 に使う「計算期間の日数」（暦日数・両端含む）。出勤日数とは別物。 */}
          <label style={s.lbl}>計算期間の日数<br />
            <input type="number" value={f.periodDays} onChange={set("periodDays")} placeholder="例 31" style={s.inpS} />
          </label>
          <label style={s.lbl}>出勤日数<br /><input type="number" value={f.days} onChange={set("days")} style={s.inpS} /></label>
          <label style={s.lbl}>1日の時間<br /><input type="number" value={f.hoursPerDay} onChange={set("hoursPerDay")} style={s.inpS} /></label>
          <label style={s.lbl}>総売上(円)<br /><input type="number" value={f.sales} onChange={set("sales")} style={s.inp} /></label>
        </div>
        {!periodDaysOk && (
          <p style={{ fontSize: 12, color: "var(--bad)", margin: "6px 0 0" }}>
            計算期間の日数を入力してください（源泉の 5,000円×日数 に使う暦日数・両端含む。例: 7月なら 31）。
          </p>
        )}
      </fieldset>

      {/* 指名・バック */}
      <fieldset style={s.fs}><legend style={s.lg}>指名・バック</legend>
        {/* D3: 方式に合わせて入力を出し分け（per_count=本数・rate=期間の指名料額）。
            rate の母数は「レジで指名料を追加した伝票の指名料額」（裁定vi）＝本数入力はバックに効かないため出さない。 */}
        <div style={s.row}>
          {effHonMode === "rate" ? (
            <label style={s.lbl}>本指名料額(円/期間)<br /><input type="number" value={f.honShimeiAmt} onChange={set("honShimeiAmt")} style={s.inp} /></label>
          ) : (
            <label style={s.lbl}>本指名(本)<br /><input type="number" value={f.hon} onChange={set("hon")} style={s.inpS} /></label>
          )}
          {effJonaiMode === "rate" ? (
            <label style={s.lbl}>場内指名料額(円/期間)<br /><input type="number" value={f.jonaiShimeiAmt} onChange={set("jonaiShimeiAmt")} style={s.inp} /></label>
          ) : (
            <label style={s.lbl}>場内(本)<br /><input type="number" value={f.jonai} onChange={set("jonai")} style={s.inpS} /></label>
          )}
          <label style={s.lbl}>同伴(本)<br /><input type="number" value={f.dohan} onChange={set("dohan")} style={s.inpS} /></label>
          {!compact && (
            <label style={s.lbl}>本指名商品pt<br /><input type="number" value={f.pointProducts} onChange={set("pointProducts")} style={s.inpS} /></label>
          )}
        </div>
        {(effHonMode === "rate" || effJonaiMode === "rate") && (
          <p style={{ fontSize: 11, color: s.sub, margin: "0 0 6px" }}>
            ※率方式は、レジで「指名料を追加」した伝票の指名料額が対象です。期間中の指名料額の合計を入れてください。
          </p>
        )}
        <div style={s.row}>
          <label style={s.lbl}>ドリンクバック(円)<br /><input type="number" value={f.drink} onChange={set("drink")} style={s.inpS} /></label>
          {!compact && (
            <>
              <label style={s.lbl}>シャンパン(円)<br /><input type="number" value={f.champ} onChange={set("champ")} style={s.inpS} /></label>
              <label style={s.lbl}>ボトル(円)<br /><input type="number" value={f.bottle} onChange={set("bottle")} style={s.inpS} /></label>
            </>
          )}
        </div>
        {!compact && (
          <div style={s.row}>
            <label style={s.lbl}>シャンパン本数<br /><input type="number" value={f.champCnt} onChange={set("champCnt")} style={s.inpS} /></label>
            <label style={s.lbl}>ボトル本数<br /><input type="number" value={f.bottleCnt} onChange={set("bottleCnt")} style={s.inpS} /></label>
          </div>
        )}
      </fieldset>

      {/* ★裁定106 B2（compact）: 主入力以外＝「詳細」で畳む（値・計算は不変＝表示だけ） */}
      {compact ? (
        <details style={{ margin: "0 0 12px" }}>
          <summary style={{ fontSize: 12.5, color: "var(--champ)", cursor: "pointer", fontWeight: 700 }}>詳細（pt・シャンパン/ボトル・罰金・ノルマ）</summary>
          <fieldset style={s.fs}><legend style={s.lg}>追加バック・pt</legend>
            <div style={s.row}>
              <label style={s.lbl}>本指名商品pt<br /><input type="number" value={f.pointProducts} onChange={set("pointProducts")} style={s.inpS} /></label>
              <label style={s.lbl}>シャンパン(円)<br /><input type="number" value={f.champ} onChange={set("champ")} style={s.inpS} /></label>
              <label style={s.lbl}>ボトル(円)<br /><input type="number" value={f.bottle} onChange={set("bottle")} style={s.inpS} /></label>
            </div>
            <div style={s.row}>
              <label style={s.lbl}>シャンパン本数<br /><input type="number" value={f.champCnt} onChange={set("champCnt")} style={s.inpS} /></label>
              <label style={s.lbl}>ボトル本数<br /><input type="number" value={f.bottleCnt} onChange={set("bottleCnt")} style={s.inpS} /></label>
            </div>
          </fieldset>
          <fieldset style={s.fs}><legend style={s.lg}>罰金・ノルマ</legend>
            <div style={s.row}>
              <label style={s.lbl}>遅刻回数<br /><input type="number" value={f.lateN} onChange={set("lateN")} style={s.inpS} /></label>
              <label style={s.lbl}>欠勤回数<br /><input type="number" value={f.absentN} onChange={set("absentN")} style={s.inpS} /></label>
              <label style={s.lbl}>ノルマ日数<br /><input type="number" value={f.normDays} onChange={set("normDays")} style={s.inpS} /></label>
              <label style={s.lbl}>ノルマ同伴<br /><input type="number" value={f.normDohan} onChange={set("normDohan")} style={s.inpS} /></label>
            </div>
          </fieldset>
        </details>
      ) : (
      <fieldset style={s.fs}><legend style={s.lg}>罰金・ノルマ</legend>
        <div style={s.row}>
          <label style={s.lbl}>遅刻回数<br /><input type="number" value={f.lateN} onChange={set("lateN")} style={s.inpS} /></label>
          <label style={s.lbl}>欠勤回数<br /><input type="number" value={f.absentN} onChange={set("absentN")} style={s.inpS} /></label>
          <label style={s.lbl}>ノルマ日数<br /><input type="number" value={f.normDays} onChange={set("normDays")} style={s.inpS} /></label>
          <label style={s.lbl}>ノルマ同伴<br /><input type="number" value={f.normDohan} onChange={set("normDohan")} style={s.inpS} /></label>
        </div>
      </fieldset>
      )}

      {/* cast: 天引き反映トグル */}
      {mode === "cast" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, margin: "4px 0 12px", color: s.body }}>
          <input type="checkbox" checked={applyDeducts} onChange={(e) => setApplyDeducts(e.target.checked)} />
          未清算の前借り/送りを手取りから引く（前借り {yen(openAdv)}・送り {yen(openOkuri)}）
        </label>
      )}

      {/* 段M2: 今月の報酬（見込み）カード＝★既に計算済みの result.pay を並べ替えて出すだけ
          （新しい計算も新しい取得もゼロ・下の内訳表はそのまま残す＝情報を減らさない）。
          cast モードのみ＝店の試算モードでは出さない。 */}
      {result && mode === "cast" && (
        <div className="nox-paysub">
          <div className="nox-ps">
            <div className="l">時給分</div>
            <div className="v num">{yen(result.pay.timePay)}</div>
          </div>
          <div className="nox-ps">
            <div className="l">バック</div>
            <div className="v num">
              {yen(result.pay.honBack + result.pay.jonaiBack + result.pay.dohanBack
                + result.pay.drinkBack + result.pay.champBack + result.pay.bottleBack
                + result.pay.salesBack + result.pay.customTotal)}
            </div>
          </div>
          <div className="nox-ps">
            <div className="l">控除</div>
            <div className="v num">
              −{yen(result.pay.fixedDed + result.pay.fine + result.pay.withholding + result.pay.normPenalty
                + result.pay.advanceDeduct + result.pay.okuriDeduct)}
            </div>
          </div>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div style={{ ...s.card, ...s.resultCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: s.body }}>差引支給（手取り）</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: s.net, fontFamily: t.font.num }}>{yen(result.pay.net)}</span>
          </div>
          <table style={{ width: "100%", fontSize: 13, marginTop: 8, borderCollapse: "collapse" }}>
            <tbody>
              <Line label="時給（加重平均）" v={`¥${Math.round(result.pay.wage).toLocaleString()}/h × ${result.pay.wHours}h`} />
              <Line label="時給給与" v={yen(result.pay.timePay)} />
              <Line label="指名バック（本/場内/同伴）" v={yen(result.pay.honBack + result.pay.jonaiBack + result.pay.dohanBack)} />
              <Line label="商品・売上・自由バック" v={yen(result.pay.drinkBack + result.pay.champBack + result.pay.bottleBack + result.pay.salesBack + result.pay.customTotal)} />
              <Line label="総支給（gross）" v={yen(result.pay.gross)} bold />
              <Line label="− 固定控除" v={`−${yen(result.pay.fixedDed)}`} minus />
              <Line label="− 罰金" v={`−${yen(result.pay.fine)}`} minus />
              <Line label={`− 源泉（${taxMode}）`} v={`−${yen(result.pay.withholding)}`} minus />
              <Line label="− ノルマ未達" v={`−${yen(result.pay.normPenalty)}`} minus />
              {result.pay.advanceDeduct > 0 && <Line label="− 前借り" v={`−${yen(result.pay.advanceDeduct)}`} minus />}
              {result.pay.okuriDeduct > 0 && <Line label="− 送り実費" v={`−${yen(result.pay.okuriDeduct)}`} minus />}
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

function Line({ label, v, bold, minus }: { label: string; v: string; bold?: boolean; minus?: boolean }) {
  const labelColor = minus ? "var(--bad)" : "var(--sub)";
  const valColor = minus ? "var(--bad)" : "var(--ink)";
  return (
    <tr>
      <td style={{ padding: "3px 0", color: labelColor }}>{label}</td>
      {/* 数値は t.font.num へ委譲（★DP2 T1: 実体は "'Outfit', sans-serif" → var(--font-sans)） */}
      <td style={{ padding: "3px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: valColor, fontFamily: t.font.num }}>{v}</td>
    </tr>
  );
}

// D-4（2026-07-17）: 旧 styleSet(dark) を廃止し、dark 側の値だけをここへ移した（light 分岐は死にコードのため削除）。
//   ★視覚は 1px も変えない。theme へ委譲したのは「完全同値のもの」だけ:
//     - card = t.card の派生（差分は padding 15→16・marginBottom 13→16 の 2 つだけ＝明示上書きで同値を保つ）
//     - 数値フォント指定は t.font.num＝呼び出し側で参照（★DP2 T1: 実体は Outfit → var(--font-sans)）
//   以下は theme に近い物があるが値が違うため据置（寄せると視覚が動く）:
//     - inp/inpS: t.input と radius 11→9・padding "11px 12px"→8・width "100%"→140/84 が違い、
//       かつ t.input の fontSize:13 を持たない（足すと文字サイズが変わる）
//     - btnSm: t.btnGhost+t.btnSm と padding "7px 11px"→"6px 12px" が違い、
//       かつ display:inline-flex/gap を持たない（足すとボタンの箱が変わる）
//     - lbl/lg: fontSize 12（t.sub は 11）
//     - row/fs/resultCard: theme に同等プリミティブなし（simulator 固有）
const s = {
  card: { ...t.card, padding: 16, marginBottom: 16 } as React.CSSProperties,
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
