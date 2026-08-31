"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { buildPayrollCsv, type PayrollCsvRow, type PayrollCsvPay } from "@/lib/nox/payroll/csv";
import PayslipSlip, { type PayslipRow } from "@/components/payslip-slip";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
import { kpiOfDraftRows, issuesOfDraft, payStatusOf } from "@/lib/nox/payroll/ui-calc";
import PaymentPanel from "./payment-panel";
import InvoicePanel from "./invoice-panel";
import PaymentTaxPanel from "./payment-tax-panel";

type Store = { id: string; name: string };
// D3: payslips.breakdown_json（finalize が凍結）の CSV が使う部分。back 内訳の生値は CSV に出さず合算のみ。
type BreakdownPay = PayrollCsvPay;
type BreakdownExtra = { amount: number };
// cast_name＝(a) 発行時点の源氏名（finalize route が凍結）。旧データには無いので optional。
type BreakdownJson = { pay: BreakdownPay; extras?: BreakdownExtra[]; cast_name?: string };
// 明細に出す名前の解決＝凍結名 → casts の現在名 → "(不明)" の3段。
//   ★確定後に改名しても発行済み明細の表示名は変わらない（凍結名が最優先）。
//   cast_name を持たない旧 payslip は従来どおり現在名で描画する（後方互換）。
const slipCastName = (bj: unknown, current: string | undefined): string =>
  (bj as { cast_name?: string } | null)?.cast_name ?? current ?? "(不明)";
type Row = {
  castId: string; castName: string; net: number; taxMode: string; anomalyCount: number;
  arDeductTotal?: number; arCarriedTotal?: number;
  advDeductTotal?: number; advCarriedTotal?: number; // F2e-2 前借り（繰越あり）
  okuriDeductTotal?: number; // F2e-2 送り実費（繰越なし）
  // E8-5 payroll#2: preview API が返している breakdown（route.ts:21）を Row 型が捨てていたのを復元。
  //   ★値はサーバ計算のまま＝画面側での再計算はしない（wHours/gross と控除計の表示にだけ使う）。
  // ★U-1（裁定99-⑤）: preview は PayResult 全キーを返す＝右パネル明細用に保証/達成/制裁も型で受ける。
  breakdown?: {
    pay: PayrollCsvPay & {
      wHours?: number; guaranteeAdd?: number; achievementBonus?: number;
      sanction?: { original?: number; applied?: number } | null;
      plan?: { name?: string }; // ★U-1 是正B: 右パネルのプラン名（PayResult.plan エコー）
    };
    extras?: { amount: number }[];
  };
};
type Blocker = { castName: string; reason: string };
// ★裁定98: sanction 二層ガードの警告（blocker と別枠・確定は止めない）。
//   ラベル写像と要対応の整形は ui-calc（裁定99-④・純関数）へ集約＝ここでは issuesOfDraft を呼ぶだけ。
type Warning = { castName: string; kind: string; detail: string };
type Incentive = { id: string; bizDate: string; amountMode: string; amount: number; recipientCount: number; distributedTotal: number; warnEmptyPool: boolean };

// 3段フロー（期間選択→プレビュー→確定）。プレビューは参考値（確定時点で再計算が正）。
export default function PayrollBoard({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]); // ★裁定98
  // ★U-1（裁定99-②）: 確定済み期の cast 別支払状態（payslips.net×Σpayment_records）。draft は null＝「未確定」。
  const [castPaid, setCastPaid] = useState<Map<string, { net: number; paid: number }> | null>(null);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [finalized, setFinalized] = useState<string | null>(null);
  // D3 給与明細CSV: 選択中 store/period の run 状態（finalized/paid のみ CSV 活性）
  // 段Y2: finalized_at＝run バーに確定日時を出すため列を1つ足しただけ（既存列の表示・判定には使わない）。
  const [runInfo, setRunInfo] = useState<{ id: string; status: string; finalized_at: string | null } | null>(null);
  const [csvMsg, setCsvMsg] = useState("");
  // D2 報酬明細（印刷）: finalized/paid run の payslips を per-cast スリップで表示→window.print（A4・1人1枚）。
  const [printRows, setPrintRows] = useState<{ castName: string; slip: PayslipRow }[] | null>(null);
  const [printMsg, setPrintMsg] = useState("");
  // D1 確定解除（owner のみ・finalized のみ）: 支払記録件数（>0 で解除無効化）とメッセージ。
  const [payCount, setPayCount] = useState<number | null>(null);
  const [reopenMsg, setReopenMsg] = useState("");
  // ── 段Y2: 確定済み run の合計サマリ（★凍結値 breakdown_json.pay の Σ のみ）──
  //   ★率計算も丸め直しも net との整合補正も一切しない。各項目の定義は D3 CSV
  //     （lib/nox/payroll/csv.ts payrollCsvCells・verify:nox-payroll-csv 済）と逐語同一:
  //       総支給 = pay.gross + Σextras.amount
  //       控除計 = fixedDed + fine + withholding + arDeduct + advanceDeduct + okuriDeduct + normPenalty
  //       うち源泉 = withholding ／ 差引 = payslips.net（凍結・extras 込み）
  //   プレビュー（未確定）では凍結値が無いので出さない＝従来の net 合計バーのまま。
  const [sum4, setSum4] = useState<{ gross: number; ded: number; wh: number; net: number; n: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [castIdOf, setCastIdOf] = useState<Record<string, string>>({});
  // E8-5 payroll#5（T1）: 未支払＝Σnet−Σpaid（PaymentPanel と同じ payment_records 直読）・
  //   前月比＝前月 run（finalized/paid）の Σnet との比較。どちらも表示専用。
  const [unpaid, setUnpaid] = useState<number | null>(null);
  const [prevNet, setPrevNet] = useState<number | null>(null);
  // E8-5 payroll#4（T2）: プレビュー表の名前検索（client フィルタ）
  const [rowQ, setRowQ] = useState("");
  // E8-5 payroll#3: 行タップ→個別内訳（preview breakdown の再掲・選択中 castId）
  const [detailCast, setDetailCast] = useState<string | null>(null);
  // ★U-1 是正B: 右パネルの「明細プレビュー」（PayslipSlip 全体）の開閉
  const [slipPreview, setSlipPreview] = useState(false);

  // run 状態を読む（payroll_runs は owner/manager RLS 可視）。store/period 変更・確定完了で再読込。
  //   ★store/period が変わったら印刷プレビュー/解除状態は破棄（別店の明細を刷らない・別 run の payCount を残さない）。
  //   finalized/paid なら支払記録件数も読む（D1 解除の無効化判定＝物理前提と同じく payment_records の有無）。
  const loadRun = useCallback(async () => {
    setPrintRows(null); setPrintMsg(""); setReopenMsg(""); setPayCount(null);
    if (!storeId || !period) { setRunInfo(null); return; }
    const { data } = await supabase.from("payroll_runs").select("id, status, finalized_at").eq("store_id", storeId).eq("period", period).maybeSingle();
    const info = data ? { id: data.id as string, status: data.status as string, finalized_at: (data.finalized_at as string | null) ?? null } : null;
    setRunInfo(info);
    setSum4(null);
    setUnpaid(null); setPrevNet(null);
    setCastPaid(null);
    if (info && (info.status === "finalized" || info.status === "paid")) {
      // E8-5 payroll#5: 件数だけでなく paid_amount も読む（未支払 KPI＝Σnet−Σpaid）。件数判定は不変。
      // ★U-1（裁定99-②）: cast_id も読み、キャスト別表の支払状態列（payStatusOf）に使う。
      const { data: prRows } = await supabase.from("payment_records").select("cast_id, paid_amount").eq("run_id", info.id);
      const prs = (prRows ?? []) as { cast_id: string; paid_amount: number }[];
      setPayCount(prs.length);
      const paidSum = prs.reduce((a, r) => a + r.paid_amount, 0);
      // 段Y2: 合計サマリ＝確定済み payslips の凍結値をそのまま加算するだけ（D3 CSV と同じ読み取り経路）
      const { data: ps } = await supabase.from("payslips").select("cast_id, net, breakdown_json").eq("run_id", info.id);
      const slips = (ps ?? []) as { cast_id: string; net: number; breakdown_json: BreakdownJson }[];
      {
        const m = new Map<string, { net: number; paid: number }>();
        for (const sl of slips) m.set(sl.cast_id, { net: sl.net, paid: 0 });
        for (const p of prs) {
          const cur = m.get(p.cast_id) ?? { net: 0, paid: 0 };
          cur.paid += p.paid_amount;
          m.set(p.cast_id, cur);
        }
        setCastPaid(m);
      }
      if (slips.length > 0) {
        let gross = 0, ded = 0, wh = 0, net = 0;
        // ★欠落キーは 0 扱い（裁定 2026-07-28）。payroll_finalize は実績ゼロの cast に
        //   breakdown_json.pay = {"net":0}（他17キー欠落）を書くため、素の加算だと NaN になる。
        //   ここで行うのは「無い項目は 0 円」という既定のみ＝率計算も丸め直しも net との整合補正もしない。
        //   dev 実データ検算: 2026-09 run Σgross 33,924 − Σ控除計 4,953 = 28,971 = Σnet ✔ /
        //   2029-01 run（{"net":0} を含む）0 − 0 = 0 = Σnet ✔（不一致 0 件）。
        const z = (v: number | undefined) => v ?? 0;
        for (const sl of slips) {
          const pay = sl.breakdown_json.pay;
          const extras = (sl.breakdown_json.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0);
          gross += z(pay.gross) + extras;
          ded += z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct)
            + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty);
          wh += z(pay.withholding);
          net += sl.net;
        }
        setSum4({ gross, ded, wh, net, n: slips.length });
        // E8-5 payroll#5: 未支払 KPI（Σnet−Σpaid・PaymentPanel と同一定義）
        setUnpaid(net - paidSum);
      }
      // E8-5 payroll#5: 前月比＝前月 run（finalized/paid）の Σnet（無ければ出さない）
      const [y, m] = period.split("-").map(Number);
      const prevPeriod = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
      const { data: prevRun } = await supabase.from("payroll_runs").select("id, status")
        .eq("store_id", storeId).eq("period", prevPeriod).maybeSingle();
      if (prevRun && (prevRun.status === "finalized" || prevRun.status === "paid")) {
        const { data: pps } = await supabase.from("payslips").select("net").eq("run_id", prevRun.id as string);
        setPrevNet(((pps ?? []) as { net: number }[]).reduce((a, r) => a + r.net, 0));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, period]);
  useEffect(() => { void loadRun(); }, [loadRun, finalized]);

  // 段P: 明細表のアバターを写真に（写真ありの行だけ 1 リクエスト・失敗時は頭文字へフォールバック）。
  //   ★表示だけ＝金額にも並びにも一切関与しない。
  useEffect(() => {
    if (!rows || rows.length === 0) { setPhotoUrls(new Map()); return; }
    let alive = true;
    void (async () => {
      const ids = rows.map((r) => r.castId);
      const { data } = await supabase.from("casts").select("id, photo_updated_at").in("id", ids);
      const list = (data ?? []) as { id: string; photo_updated_at: string | null }[];
      const orgId = await resolveOrgId(supabase);
      if (!orgId || !alive) return;
      const m = await signCastPhotos(supabase, orgId, list);
      if (alive) { setPhotoUrls(m); setCastIdOf(Object.fromEntries(list.map((c) => [c.id, c.id]))); }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "店舗";

  // D3: 確定済み run の payslips を owner/manager 直読みして給与明細CSVを生成（client Blob・BOM UTF-8）。
  //   機微（口座/マイナンバー/back 内訳生値）は含めない＝合算のみ。tax-report（支払調書）とは別物。
  async function exportPayrollCsv() {
    if (!runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")) return;
    setCsvMsg(""); setBusy(true);
    try {
      const runId = runInfo.id;
      const [{ data: ps }, { data: prs }] = await Promise.all([
        supabase.from("payslips").select("cast_id, period, net, breakdown_json").eq("run_id", runId),
        supabase.from("payment_records").select("cast_id, paid_amount").eq("run_id", runId),
      ]);
      const slips = (ps ?? []) as { cast_id: string; period: string; net: number; breakdown_json: BreakdownJson }[];
      if (slips.length === 0) { setCsvMsg("この期間に給与明細がありません（確定済みの run が空です）。"); return; }
      const castIds = slips.map((s) => s.cast_id);
      const [{ data: cs }, { data: tp }] = await Promise.all([
        supabase.from("casts").select("id, name").in("id", castIds),
        supabase.from("cast_tax_profiles").select("cast_id, mode").in("cast_id", castIds),
      ]);
      const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
      const modeOf = new Map((tp ?? []).map((r) => [r.cast_id as string, r.mode as string]));
      const paidOf = new Map<string, number>();
      for (const r of (prs ?? []) as { cast_id: string; paid_amount: number }[]) {
        paidOf.set(r.cast_id, (paidOf.get(r.cast_id) ?? 0) + r.paid_amount);
      }
      const csvRows: PayrollCsvRow[] = slips
        .slice()
        .sort((a, b) => (nameOf.get(a.cast_id) ?? "").localeCompare(nameOf.get(b.cast_id) ?? "", "ja"))
        .map((s) => ({
          castName: slipCastName(s.breakdown_json, nameOf.get(s.cast_id)),
          taxMode: modeOf.get(s.cast_id) ?? "—",
          period: s.period,
          pay: s.breakdown_json.pay,
          extrasTotal: (s.breakdown_json.extras ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0),
          net: s.net,
          paidTotal: paidOf.get(s.cast_id) ?? 0,
        }));
      const csv = buildPayrollCsv(csvRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `給与明細_${storeName}_${period}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setCsvMsg(`給与明細CSVを出力しました（${csvRows.length} 名分）。`);
    } catch (e) {
      setCsvMsg(`出力に失敗: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // D2: 確定済み run の payslips＋cast 名を読み、per-cast スリップを画面表示（印刷は別ボタン＝window.print）。
  //   データ源は D3 CSV と同じ payslips.breakdown_json＝CSV の合算列とスリップ行内訳は同数値。RLS: owner=全店/manager=自店。
  async function loadPayslipsForPrint() {
    if (!runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")) return;
    setPrintMsg(""); setPrintRows(null); setBusy(true);
    try {
      const { data: ps } = await supabase
        .from("payslips")
        .select("cast_id, period, net, breakdown_json")
        .eq("run_id", runInfo.id);
      const slips = (ps ?? []) as { cast_id: string; period: string; net: number; breakdown_json: unknown }[];
      if (slips.length === 0) { setPrintRows([]); setPrintMsg("この期間に給与明細がありません（確定済みの run が空です）。"); return; }
      const { data: cs } = await supabase.from("casts").select("id, name").in("id", slips.map((s) => s.cast_id));
      const nameOf = new Map((cs ?? []).map((c) => [c.id as string, c.name as string]));
      const rows = slips
        .map((s) => ({ castName: slipCastName(s.breakdown_json, nameOf.get(s.cast_id)), slip: { period: s.period, net: s.net, breakdown_json: s.breakdown_json } }))
        .sort((a, b) => a.castName.localeCompare(b.castName, "ja"));
      setPrintRows(rows);
      setPrintMsg(`報酬明細を読み込みました（${rows.length} 名分）。印刷は A4・1人1枚で出力されます。`);
    } catch (e) {
      setPrintMsg(`読込に失敗: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    setMsg("");
    setFinalized(null);
    try {
      const res = await fetch("/api/payroll/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period }),
      });
      const j = await res.json();
      if (!res.ok) {
        setRows(null);
        setBlockers([]);
        setWarnings([]);
        setIncentives([]);
        setMsg(`エラー(${res.status}): ${j.error ?? ""}`);
        return;
      }
      setRows(j.rows as Row[]);
      setBlockers((j.blockers ?? []) as Blocker[]);
      setWarnings((j.warnings ?? []) as Warning[]); // ★裁定98
      setIncentives((j.incentives ?? []) as Incentive[]);
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!confirm(`${period} の給与を確定します。確定後はマスタ変更の影響を受けません。よろしいですか？`)) return;
    setBusy(true);
    setMsg("");
    try {
      const idemKey = crypto.randomUUID();
      const res = await fetch("/api/payroll/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period, idemKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(j.blockers)) {
          setMsg(`確定不可（税区分/プラン/雇用区分 未設定）: ${(j.blockers as Blocker[]).map((b) => b.castName).join("、")}`);
        } else {
          setMsg(`エラー(${res.status}): ${j.error ?? ""}`);
        }
        return;
      }
      setFinalized(`確定完了: ${j.castCount} 名分（run ${j.runId}）`);
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // D1 確定解除（owner のみ）: finalized→draft。天引き（売掛/前借り/送り）は取り消し・確定明細は削除。
  //   真の防御は payroll_reopen（service・owner authz は route＝decideTaxReportAccess）。成功後 loadRun 再発火（1c）。
  async function reopen() {
    if (!runInfo || runInfo.status !== "finalized") return;
    if (!confirm(`${period} の確定を解除して draft に戻します。天引き（売掛・前借り・送り）は取り消され、確定明細は削除されます。よろしいですか？`)) return;
    setReopenMsg("");
    setBusy(true);
    try {
      const idemKey = crypto.randomUUID();
      const res = await fetch("/api/payroll/reopen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, period, idemKey }),
      });
      const j = await res.json();
      if (!res.ok) {
        setReopenMsg(
          res.status === 409 && String(j.error ?? "").includes("payments exist") ? "支払記録があるため解除できません。"
            : res.status === 409 ? `解除できません: ${j.error ?? ""}`
            : `エラー(${res.status}): ${j.error ?? ""}`,
        );
        return;
      }
      setReopenMsg("確定を解除しました（draft に戻しました）。もう一度プレビューから確定できます。");
      setRows(null); // 旧プレビュー表を消す（再プレビューを促す）
      await loadRun(); // 1c: runInfo 再読込→CSV/印刷/支払/この解除セクションが draft 状態へ反転
    } catch (e) {
      setReopenMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // 段Y2: 確定日時の表示整形（値は payroll_runs.finalized_at そのまま・判定には使わない）
  const runFinalizedAt = runInfo?.finalized_at
    ? new Date(runInfo.finalized_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const total = rows?.reduce((s, r) => s + r.net, 0) ?? 0;
  const anomalyTotal = rows?.reduce((s, r) => s + r.anomalyCount, 0) ?? 0;

  return (
    <div className="nox-printpage">
      {/* 段0R 第2陣: ヘッダを新シェルの nox-hero へ（master/home/casts/customers/analytics と同基準・表示のみ）。
          印刷時は印刷ページ直下の隔離ルールで従来どおり自動的に落ちる（旧ヘッダと同じ扱い）。 */}
      {/* U-1（裁定99-①）: hero はモック逐語「給与管理」。副文は現行フローの説明を維持。 */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>給与管理</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            プレビュー → 確定 → 明細（印刷・CSV）・支払記録。確定後の金額は凍結された明細の値です。
          </p>
        </div>
      </div>

      {/* 段1: 期間選択 */}
      <section className="nox-cardtop" style={{ ...t.card, display: "flex", gap: 12, alignItems: "flex-end" }}>
        <label style={t.fieldLabel}>
          店舗
          <br />
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label style={t.fieldLabel}>
          期間（YYYY-MM）
          <br />
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...t.input, width: "auto", marginTop: 5 }} />
        </label>
        <button onClick={preview} disabled={busy || !storeId} style={t.btnGold}>
          プレビュー
        </button>
      </section>

      {/* 段Y2: run バー＝期間・確定バッジ・確定日時を1行に集約（モック）。
          ★ボタンの機能・権限出し分け・無効化条件はいずれも各節の現行実装のまま＝ここは状態の可視化だけ。
            D1 解除／D2 印刷／D3 CSV／確定ボタンは従来どおり各セクションに置いたまま動かしていない。 */}
      {/* U-1（裁定99-①③④）: 4ステップ＋KPI 4枚＋要対応。draft 期（run 行なし＝プレビューのみ）でも描画する。
          ★状態の表示だけ＝各操作ボタンは従来どおり各セクション（機能・権限・無効化条件は不変）。
          モックの4段目「公開」（LINE 明細公開）は T3 後送りのため「支払・明細」（裁定99-⑦）。 */}
      {/* U-1 是正A: 枠（ステップ/KPI/要対応）はプレビュー前から常時描画＝値は「—」で待つ。 */}
      {(() => {
        const status = runInfo?.status ?? "draft";
        // KPI: 確定期＝凍結 sum4（現行定義のまま）／draft 期＝プレビュー rows の表示層合算（裁定99-③・純関数）
        const isFrozen = status === "finalized" || status === "paid";
        const kpi = isFrozen ? sum4 : rows ? kpiOfDraftRows(rows) : null;
        const issues = rows ? issuesOfDraft(blockers, warnings) : null;
        // ステップ状態: draft＝①済（rows あり）②現在地／finalized＝③まで済・④現在地／paid＝全て済
        const stage = status === "paid" ? 4 : status === "finalized" ? 3 : rows ? 1 : 0;
        const next = status === "paid" ? "この期間は支払済みです"
          : status === "finalized" ? "次: 下の「支払・明細」で支払いを記録"
          : rows ? "次: 要対応を確認して「この期間を確定する」"
          : "次: プレビューで勤怠・売上を取り込む";
        const STEPS = [
          ["集計", "プレビューで取込"], ["内容確認", "要対応を解消"],
          ["給与確定", "確定後は金額を固定"], ["支払・明細", "支払記録と出力"],
        ] as const;
        return (
        <section className="nox-cardtop" style={t.card}>
          {runInfo && (
            <div className="nox-runbar">
              <span className="p num">{period}</span>
              <span className={`nox-runbadge ${runInfo.status === "paid" ? "paid" : runInfo.status === "finalized" ? "fin" : ""}`}>
                {runInfo.status === "paid" ? "支払済" : runInfo.status === "finalized" ? "確定済み" : "下書き（未確定）"}
              </span>
              {runFinalizedAt && (
                <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>確定 {runFinalizedAt}</span>
              )}
              {sum4 && <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{sum4.n} 名</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 10px" }}>
            {STEPS.map(([label, sub], i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                    border: `1px solid ${done || active ? "var(--gold)" : "var(--line2)"}`,
                    color: done || active ? "var(--champ)" : "var(--sub)",
                    background: active ? "var(--goldface)" : "transparent",
                  }} title={sub}>{done ? "✓" : i + 1} {label}</span>
                  {i < 3 && <span style={{ color: "var(--sub)", fontSize: 11 }}>→</span>}
                </span>
              );
            })}
            <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{next}</span>
          </div>

          {/* KPI 4枚（裁定99-③）: 支給総額／控除合計／差引支給額／未支払。
              確定期＝凍結値 Σ（定義は D3 CSV の payrollCsvCells と逐語同一）・draft 期＝rows の表示層合算（参考値）。
              率計算・丸め直し・整合補正は一切しない。 */}
          {/* U-1 是正A: KPI 枠は常時表示＝未プレビューは「—」。是正C: 控除 0 円は符号なし。 */}
          <div className="nox-paysum">
            <div className="nox-paycard">
              <div className="l">支給総額{kpi && !isFrozen ? "（参考値）" : ""}</div>
              <div className="v num">{kpi ? `¥${kpi.gross.toLocaleString()}` : "—"}</div>
              {kpi && isFrozen && prevNet !== null && prevNet > 0 && sum4 ? (
                <div className="l" style={{ marginTop: 2 }}>
                  差引の前月比 <span className="num" style={{ fontWeight: 700, color: sum4.net >= prevNet ? "var(--ok)" : "var(--bad)" }}>
                    {sum4.net >= prevNet ? "+" : ""}{Math.round(((sum4.net - prevNet) / prevNet) * 100)}%
                  </span>
                </div>
              ) : null}
            </div>
            <div className="nox-paycard">
              <div className="l">控除合計（源泉含む）</div>
              <div className="v num">{kpi ? (kpi.ded > 0 ? `−¥${kpi.ded.toLocaleString()}` : "¥0") : "—"}</div>
              <div className="l" style={{ marginTop: 2 }}>うち源泉 <span className="num">{kpi ? `¥${kpi.wh.toLocaleString()}` : "—"}</span></div>
            </div>
            <div className="nox-paycard net">
              <div className="l">差引支給額</div>
              <div className="v num">{kpi ? `¥${kpi.net.toLocaleString()}` : "—"}</div>
              <div className="l" style={{ marginTop: 2 }}>{kpi ? `${kpi.n} 名分` : "プレビューで算出"}</div>
            </div>
            <div className="nox-paycard">
              <div className="l">未支払</div>
              {kpi && isFrozen && unpaid !== null ? (
                <>
                  <div className="v num" style={{ color: unpaid > 0 ? "var(--bad)" : "var(--ok)" }}>¥{unpaid.toLocaleString()}</div>
                  <div className="l" style={{ marginTop: 2 }}>{unpaid <= 0 ? "全額支払済み" : "支払記録は下の「支払・明細」"}</div>
                </>
              ) : (
                <>
                  <div className="v num">—</div>
                  <div className="l" style={{ marginTop: 2 }}>確定後に支払を記録</div>
                </>
              )}
            </div>
          </div>
          {kpi && (
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: 0 }}>
              {isFrozen
                ? "※確定時に凍結された明細の合計です（画面側での再計算はしていません）。"
                : "※プレビュー（参考値）の合計です。確定時点で再計算した値が正となります。"}
            </p>
          )}

          {/* 要対応（裁定99-④）: 「集計」ステップ直下。是正A: 枠は常時＝未プレビューは案内文。 */}
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, fontSize: 13,
            border: `1px solid ${issues?.some((x) => x.kind === "blocker") ? "var(--bad)" : "var(--line2)"}` }}>
            <strong style={{ color: issues?.some((x) => x.kind === "blocker") ? "var(--bad)" : "var(--champ)" }}>
              要対応{issues && issues.length > 0 ? `（${issues.length}件）` : ""}
            </strong>
            {!issues ? (
              <span style={{ marginLeft: 10, color: "var(--sub)" }}>プレビューを押すと表示されます</span>
            ) : issues.length === 0 ? (
              <span style={{ marginLeft: 10, color: "var(--ok)" }}>要対応なし</span>
            ) : (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {issues.map((x, i) => (
                  <li key={i} style={{ color: x.kind === "blocker" ? "var(--bad)" : undefined }}>
                    {x.castName}: {x.label} — <span style={{ color: "var(--sub)" }}>{x.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        );
      })()}

      {msg && <p style={{ color: "var(--bad)", fontSize: 13 }}>{msg}</p>}
      {finalized && <p style={{ color: "var(--champ)", fontSize: 14, fontWeight: "bold" }}>{finalized}</p>}

      {/* 段2: プレビュー（参考値） */}
      {/* U-1 是正A: キャスト別表の枠はプレビュー前から描画（ヘッダ＋案内の空行） */}
      {!rows && (
        <section className="nox-cardtop" style={t.card}>
          <table className="nox-table">
            <thead>
              <tr>
                <th style={t.th}>キャスト</th>
                <th style={{ ...t.th, textAlign: "right" }}>総支給</th>
                <th style={{ ...t.th, textAlign: "right" }}>控除計</th>
                <th style={{ ...t.th, textAlign: "right" }}>差引支給(net)</th>
                <th style={t.th}>状態</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} style={{ ...t.td, color: "var(--sub)", textAlign: "center", padding: "18px 0" }}>プレビューを押すと表示されます</td></tr>
            </tbody>
          </table>
        </section>
      )}
      {rows && (
        <>
          {/* U-1（裁定99-④）: blockers/warnings の一覧は上の「要対応」区画へ統合（表示位置の移設のみ・状態は不変）。 */}
          <p style={{ fontSize: 12, color: "var(--sub)" }}>※参考値です。確定時点で再計算した値が正となります。</p>
          {incentives.length > 0 && (
            <div className="nox-cardtop" style={{ ...t.card, border: "1px solid var(--line2)", fontSize: 13 }}>
              <strong style={{ color: "var(--champ)" }}>出勤ボーナス（給与へ加算済み）</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {incentives.map((inc) => (
                  <li key={inc.id} style={{ color: inc.warnEmptyPool ? "var(--bad)" : undefined }}>
                    {inc.bizDate} {inc.amountMode === "per_head" ? "定額/人" : "プール按分"} <span style={t.num}>¥{inc.amount.toLocaleString()}</span> →
                    {" "}総配分 <span style={t.num}>¥{inc.distributedTotal.toLocaleString()}</span>・受給 <span style={t.num}>{inc.recipientCount}</span> 人
                    {inc.warnEmptyPool && " ⚠ 受給者0人（プール未配分）"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {anomalyTotal > 0 && (
            <p style={{ fontSize: 12, color: "var(--bad)" }}>打刻 anomaly（out 欠損等）: 計 <span style={t.num}>{anomalyTotal}</span> 件。確定は止まりませんが内容をご確認ください。</p>
          )}
          {/* 段Y2: 明細表＝★列構成・並び・数値は現行と完全に同一。
              変えたのは (a) キャスト名に段P の写真アバターを添える (b) net を白太で強調
              (c) ≤641 で補助列（税区分・売掛・前借り・送り・anomaly）を CSS で畳む
                  ＝列を削除するのではなく狭い画面で隠すだけ（>641 では全列が出る）。 */}
          {/* ★U-1 是正B: 表=左 2/3・明細=右 1/3（sticky）。狭幅は flexWrap で縦積み。 */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 480px", minWidth: 0 }}>
          {/* E8-5 payroll#4（T2）: 名前検索＝client フィルタ（並び・数値は不変） */}
          <input value={rowQ} onChange={(e) => setRowQ(e.target.value)} placeholder="キャスト名で絞り込み"
            aria-label="キャスト名で絞り込み" style={{ ...t.input, width: 220, marginBottom: 8 }} />
          <table className="nox-paytable" style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={t.th}>キャスト</th>
                <th className="fold" style={t.th}>税区分</th>
                {/* E8-5 payroll#2: preview breakdown の復元列（時間・総支給・控除計＝サーバ計算値の再掲のみ） */}
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>時間</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>総支給</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>控除計</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>売掛</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>前借り</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>送り</th>
                <th style={{ ...t.th, textAlign: "right" }}>差引支給(net)</th>
                <th className="fold" style={{ ...t.th, textAlign: "right" }}>anomaly</th>
                {/* ★U-1（裁定99-②）: 状態列＝支払状態のみ（未確定/未払/一部/支払済・キャスト単位確定は作らない） */}
                <th style={t.th}>状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => !rowQ.trim() || r.castName.toLowerCase().includes(rowQ.trim().toLowerCase())).map((r) => {
                const z = (v: number | undefined) => v ?? 0;
                const pay = r.breakdown?.pay;
                const extras = (r.breakdown?.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0);
                const gross = pay ? z(pay.gross) + extras : null;
                const ded = pay
                  ? z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct)
                    + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty)
                  : null;
                return (
                <tr key={r.castId} onClick={() => { setSlipPreview(false); setDetailCast((v) => (v === r.castId ? null : r.castId)); }}
                  style={{ cursor: "pointer", background: detailCast === r.castId ? "var(--card2)" : undefined }}>
                  <td style={t.td}>
                    {/* 段0R 第2陣: モック .castcell 逐語（アバター30px・gap9・名前 bold）。表示のみ・値と並びは不変。 */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                      <CastAvatar name={r.castName} url={photoUrls.get(castIdOf[r.castId] ?? r.castId)} variant="flat" size={30} />
                      <span style={{ fontWeight: 700 }}>{r.castName}</span>
                    </span>
                  </td>
                  <td className="fold" style={t.td}>{r.taxMode}</td>
                  <td className="fold" style={{ ...t.td, ...t.num, textAlign: "right" }}>{pay?.wHours != null ? `${pay.wHours}h` : "-"}</td>
                  <td className="fold" style={{ ...t.td, ...t.num, textAlign: "right" }}>{gross != null ? gross.toLocaleString() : "-"}</td>
                  <td className="fold" style={{ ...t.td, ...t.num, textAlign: "right", color: ded ? "var(--bad)" : "var(--sub)" }}>{ded ? `−${ded.toLocaleString()}` : "-"}</td>
                  {dedCell(r.arDeductTotal, r.arCarriedTotal, "fold")}
                  {dedCell(r.advDeductTotal, r.advCarriedTotal, "fold")}
                  {dedCell(r.okuriDeductTotal, undefined, "fold")}
                  {/* net＝読む情報の最重要値ゆえ白太（値そのものは r.net のまま・書式も toLocaleString で不変） */}
                  <td style={{ ...t.td, ...t.num, textAlign: "right", fontWeight: 700, color: "var(--v2-text)" }}>{r.net.toLocaleString()}</td>
                  <td className="fold" style={{ ...t.td, ...t.num, textAlign: "right", color: r.anomalyCount ? "var(--bad)" : "var(--sub)" }}>{r.anomalyCount || "-"}</td>
                  {(() => {
                    // ★U-1（裁定99-②）: 支払状態。確定済み期＝payStatusOf(凍結 net, Σpaid)・draft/run なし＝未確定。
                    const cp = castPaid?.get(r.castId);
                    const st = castPaid && cp ? payStatusOf(cp.net, cp.paid) : "未確定";
                    const col = st === "支払済" ? "var(--ok)" : st === "一部" ? "var(--gold)" : st === "未払" ? "var(--bad)" : "var(--sub)";
                    return <td style={{ ...t.td, fontWeight: 700, color: col }}>{st}</td>;
                  })()}
                </tr>
                );
              })}
            </tbody>
          </table>
          {/* U-1 是正B: 旧・行タップ下展開パネルは右 sticky パネルへ置換（削除） */}
          {/* 複数キャスト表の「締め」＝合計バー。段0R 第3陣: 金ベタ地＋黒文字（t.slipFoot 共用）をやめ、
              panel 地＋白太金額へ＝金は選択・主ボタン・バッジの3役のみの裁定に一致。
              ★合計値と行数の式は不変。t.slipFoot 自体は非改変＝payslip 帳票（ps-foot・
                print CSS が .ps-foot で反転）側の見た目に影響させない（print 側に slipFoot の参照なしを grep 確認済み）。 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10,
                        background: "var(--card2)", border: "1px solid var(--line)", color: "var(--ink)",
                        borderRadius: 9, padding: "9px 13px", fontWeight: 800 }}>
            <span>合計（{rows.length} 名）</span>
            <b style={{ ...t.slipFootVal, color: "var(--ink)" }}>¥{total.toLocaleString()}</b>
          </div>

          {/* 段3: 確定 */}
          <button onClick={finalize} disabled={busy || blockers.length > 0 || rows.length === 0} style={blockers.length ? { ...t.btnGhost } : { ...t.btnGold }}>
            この期間を確定する
          </button>
          {blockers.length > 0 && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--bad)" }}>未登録 cast を解消してください</span>}
          </div>

          {/* ★U-1 是正B: 右パネル明細（sticky・PayslipSlip と同じ順序・0円行は非表示・数値は preview 再掲のみ） */}
          <aside style={{ flex: "1 1 260px", minWidth: 260, position: "sticky", top: 12 }}>
            <section className="nox-cardtop" style={{ ...t.card, marginBottom: 0 }}>
              {(() => {
                const r = detailCast ? rows.find((x) => x.castId === detailCast) : null;
                const pay = r?.breakdown?.pay;
                if (!r || !pay) {
                  return <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>行を選択すると内訳を表示</p>;
                }
                const z = (v: number | undefined) => v ?? 0;
                const extrasTotal = (r.breakdown?.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0);
                const sanctionApplied = z(pay.sanction?.applied);
                const sanctionOriginal = z(pay.sanction?.original);
                const whLabel = r.taxMode === "委託" ? "源泉（報酬・料金）" : r.taxMode === "雇用" ? "源泉（給与）" : "源泉";
                const earnRows: [string, number][] = [
                  ["保証給与", z(pay.timePay)], ["最低保証加算", z(pay.guaranteeAdd)],
                  ["本指名", z(pay.honBack)], ["場内", z(pay.jonaiBack)], ["同伴", z(pay.dohanBack)],
                  ["歩合", z(pay.salesBack)], ["達成ボーナス", z(pay.achievementBonus)],
                  ["その他バック", z(pay.drinkBack) + z(pay.champBack) + z(pay.bottleBack) + z(pay.customTotal) + extrasTotal],
                ];
                const dedRows: [string, number][] = [
                  [whLabel, z(pay.withholding)], ["送り", z(pay.okuriDeduct)],
                  [sanctionOriginal > sanctionApplied ? `制裁（原額 ¥${sanctionOriginal.toLocaleString()}→上限適用）` : "制裁（罰金・減給）", sanctionApplied],
                  ["前借り", z(pay.advanceDeduct)], ["売掛", z(pay.arDeduct)],
                  ["その他", z(pay.fixedDed) - sanctionApplied + z(pay.fine) + z(pay.normPenalty)],
                ];
                const earnTotal = z(pay.gross) + extrasTotal;
                const dedTotal = dedRows.reduce((s, [, v]) => s + v, 0);
                const line = (l: string, v: number, neg = false) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "2px 0" }}>
                    <span style={{ color: "var(--sub)" }}>{l}</span>
                    <span className="num" style={neg ? { color: "var(--bad)" } : undefined}>{neg ? "−" : ""}¥{v.toLocaleString()}</span>
                  </div>
                );
                return (
                  <>
                    <p style={{ fontSize: 13, fontWeight: 800, margin: "0 0 2px", color: "var(--champ)" }}>
                      {r.castName}
                      {(r.taxMode === "委託" || r.taxMode === "雇用") && (
                        <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                          border: "1px solid var(--line2)", color: "var(--champ)" }}>{r.taxMode}</span>
                      )}
                    </p>
                    {pay.plan?.name && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px" }}>{pay.plan.name}</p>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 0 8px" }}>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>差引支給額</span>
                      <span className="num" style={{ fontSize: 20, fontWeight: 800, color: "var(--v2-text)" }}>¥{r.net.toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: 11.5, fontWeight: 800, color: "var(--champ)", margin: "8px 0 2px" }}>支給</p>
                    {earnRows.filter(([, v]) => v !== 0).map(([l, v]) => line(l, v))}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, borderTop: "1px solid var(--line2)", marginTop: 4, paddingTop: 4 }}>
                      <span>支給合計</span><span className="num">¥{earnTotal.toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: 11.5, fontWeight: 800, color: "var(--champ)", margin: "10px 0 2px" }}>控除</p>
                    {dedRows.filter(([, v]) => v !== 0).map(([l, v]) => line(l, v, true))}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, borderTop: "1px solid var(--line2)", marginTop: 4, paddingTop: 4 }}>
                      <span>控除合計</span><span className="num" style={{ color: dedTotal > 0 ? "var(--bad)" : undefined }}>{dedTotal > 0 ? `−¥${dedTotal.toLocaleString()}` : "¥0"}</span>
                    </div>
                    <button onClick={() => setSlipPreview((v) => !v)} style={{ ...t.btnGhost, ...t.btnSm, marginTop: 10 }}>
                      {slipPreview ? "明細プレビューを閉じる" : "明細プレビュー"}
                    </button>
                    {slipPreview && (
                      <div style={{ marginTop: 10 }}>
                        <PayslipSlip
                          castName={r.castName}
                          slip={{
                            period,
                            net: r.net,
                            // preview 行から breakdown_json を合成（pay/extras は素通し・ar/adv/okuri は今期天引き額のみ）
                            breakdown_json: {
                              pay, extras: r.breakdown?.extras ?? [],
                              ar: r.arDeductTotal ? [{ action: "deducted", amount: r.arDeductTotal }] : [],
                              adv: r.advDeductTotal ? [{ action: "deducted", amount: r.advDeductTotal }] : [],
                              okuri: r.okuriDeductTotal ? [{ action: "deducted", amount: r.okuriDeductTotal }] : [],
                            },
                          }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          </aside>
          </div>
        </>
      )}

      {/* D1 確定を解除（★owner のみ・finalized のみ・支払記録ありは無効化＋理由表示）。draft へ戻し天引きを取り消す。 */}
      {isOwner && runInfo?.status === "finalized" && (
        <section className="nox-cardtop" style={{ ...t.card, borderColor: "var(--bad)" }}>
          {/* E5b: t.cardTitle の再発明（13.5/800）を本定数へ。margin と危険色 bad はローカル上書き＝算出値は不変 */}
          <h3 style={{ ...t.cardTitle, margin: "0 0 4px", color: "var(--bad)" }}>確定を解除</h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
            確定（{period}）を draft に戻します。売掛・前借り・送りの天引きは取り消され、確定明細は削除されます。
            支払記録がある期間は解除できません。
          </p>
          <button
            onClick={() => void reopen()}
            disabled={busy || payCount === null || payCount > 0}
            style={payCount === 0 ? { ...t.btnGhost, borderColor: "var(--bad)", color: "var(--bad)" } : { ...t.btnGhost, opacity: 0.5 }}
            title={payCount && payCount > 0 ? "支払記録があるため解除できません" : ""}
          >
            確定を解除
          </button>
          {payCount !== null && payCount > 0 && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--bad)" }}>支払記録が {payCount} 件あるため解除できません（先に支払記録をご確認ください）</span>
          )}
          {reopenMsg && <p style={{ fontSize: 12, marginTop: 8, color: reopenMsg.includes("エラー") || reopenMsg.includes("できません") ? "var(--bad)" : "var(--ok)" }}>{reopenMsg}</p>}
        </section>
      )}

      {/* U-1（裁定99-①⑦⑧）: 下段2枚＝「支払・明細」「税務・出力」。各区画の中身・呼び出し経路・権限・
          無効化条件は現行のまま＝配置とグループ見出しのみの移設。LINE 明細公開は出さない（T3 後送り維持）。 */}
      {/* ── 下段1: 支払・明細（4段目ステップの実体＝支払記録。明細プレビューは右パネル/下の印刷＝PayslipSlip） ── */}
      <h2 style={{ ...t.cardTitle, fontSize: 15, margin: "18px 0 6px" }}>支払・明細</h2>
      {storeId && <PaymentPanel storeId={storeId} period={period} />}

      {/* ── 下段2: 税務・出力（CSV／一括PDF／インボイス集計／納付管理＝裁定99-⑧） ── */}
      <h2 style={{ ...t.cardTitle, fontSize: 15, margin: "18px 0 6px" }}>税務・出力</h2>
      {/* D3 給与明細CSV（確定済み run のみ活性・全cast の支給/控除/差引・振込フォーマットではない＝口座なし）。
          支払調書CSV（invoice-panel＝源泉/インボイス・委託のみ・暦年）とは別物。 */}
      {storeId && (
        <section className="nox-cardtop" style={{ ...t.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ ...t.cardTitle, margin: "0 0 4px" }}>給与明細CSV</h3>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>
              確定済み（{period}）の全キャストの支給・控除・差引を CSV 出力します（BOM UTF-8）。
              口座・マイナンバーは含みません（振込用フォーマットは別）。支払調書CSVとは別物です。
            </p>
          </div>
          <button
            onClick={() => void exportPayrollCsv()}
            disabled={busy || !runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")}
            style={runInfo && (runInfo.status === "finalized" || runInfo.status === "paid") ? { ...t.btnGold } : { ...t.btnGhost, opacity: 0.5 }}
            title={runInfo ? "" : "この期間はまだ確定されていません"}
          >
            給与明細CSVを出力
          </button>
        </section>
      )}
      {csvMsg && <p style={{ fontSize: 12, color: csvMsg.includes("失敗") || csvMsg.includes("ありません") ? "var(--bad)" : "var(--ok)" }}>{csvMsg}</p>}

      {/* D2 報酬明細（印刷/PDF）: 確定済み run の per-cast スリップを A4・1人1枚で印刷。
          読込後のみ nox-print（印刷対象）＝未読込時は nox-noprint で印刷経路から外す。数値は D3 CSV と同一 breakdown_json 源。 */}
      {storeId && (
        <section
          className={printRows && printRows.length > 0 ? "nox-cardtop nox-print" : "nox-cardtop nox-noprint"}
          style={{ ...t.card }}
        >
          <div className="nox-noprint" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h3 style={{ ...t.cardTitle, margin: "0 0 4px" }}>報酬明細（印刷 / PDF）</h3>
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>
                確定済み（{period}）の全キャストの明細を1人1枚の A4 で印刷します（白地・依存なし）。
                「PDFで保存」も可。給与明細CSV（合算）と同じ確定値です。
              </p>
            </div>
            <button
              onClick={() => void loadPayslipsForPrint()}
              disabled={busy || !runInfo || (runInfo.status !== "finalized" && runInfo.status !== "paid")}
              style={runInfo && (runInfo.status === "finalized" || runInfo.status === "paid") ? { ...t.btnGhost } : { ...t.btnGhost, opacity: 0.5 }}
              title={runInfo ? "" : "この期間はまだ確定されていません"}
            >
              報酬明細を読み込む
            </button>
            {printRows && printRows.length > 0 && (
              <button onClick={() => window.print()} style={{ ...t.btnGold }}>印刷 / PDFで保存</button>
            )}
          </div>
          {printMsg && (
            <p className="nox-noprint" style={{ fontSize: 12, margin: "8px 0 0", color: printMsg.includes("失敗") || printMsg.includes("ありません") ? "var(--bad)" : "var(--ok)" }}>{printMsg}</p>
          )}
          {printRows && printRows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {printRows.map((r, i) => (
                <div key={i} className="nox-print-page">
                  <PayslipSlip slip={r.slip} castName={r.castName} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* F2d インボイス・支払調書（税区分管理＋支払調書CSV・源泉計算には非接触） */}
      {storeId && <InvoicePanel storeId={storeId} period={period} isOwner={isOwner} />}

      {/* 裁定28 納付管理（owner のみ・org 合算＝store/period に依存しない）。
          注意行の判定は既存の runInfo から導出＝新規取得を増やさない。 */}
      {isOwner && <PaymentTaxPanel hasUnpaidFinalized={runInfo?.status === "finalized"} />}
    </div>
  );
}

// 天引きセル（−¥X ＋ 繰越表示）。carried 未指定（送り実費＝繰越なし）は繰越を出さない。
// 段Y2: 第3引数 cls は SP 列畳み（.fold）のためだけ＝セルの中身・数値・色は一切変えていない。
function dedCell(deduct?: number, carried?: number, cls?: string) {
  return (
    <td className={cls} style={{ ...t.td, ...t.num, textAlign: "right", color: deduct ? "var(--bad)" : "var(--sub)" }}>
      {deduct ? `−${deduct.toLocaleString()}` : "-"}
      {carried ? <span style={{ color: "var(--champ)", fontSize: 11 }}>（繰越 {carried.toLocaleString()}）</span> : null}
    </td>
  );
}
