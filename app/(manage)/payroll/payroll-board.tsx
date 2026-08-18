"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { buildPayrollCsv, type PayrollCsvRow, type PayrollCsvPay } from "@/lib/nox/payroll/csv";
import PayslipSlip, { type PayslipRow } from "@/components/payslip-slip";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos } from "@/lib/nox/cast-photo";
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
  breakdown?: { pay: PayrollCsvPay & { wHours?: number }; extras?: { amount: number }[] };
};
type Blocker = { castName: string; reason: string };
type Incentive = { id: string; bizDate: string; amountMode: string; amount: number; recipientCount: number; distributedTotal: number; warnEmptyPool: boolean };

// 3段フロー（期間選択→プレビュー→確定）。プレビューは参考値（確定時点で再計算が正）。
export default function PayrollBoard({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
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
    if (info && (info.status === "finalized" || info.status === "paid")) {
      // E8-5 payroll#5: 件数だけでなく paid_amount も読む（未支払 KPI＝Σnet−Σpaid）。件数判定は不変。
      const { data: prRows } = await supabase.from("payment_records").select("paid_amount").eq("run_id", info.id);
      const prs = (prRows ?? []) as { paid_amount: number }[];
      setPayCount(prs.length);
      const paidSum = prs.reduce((a, r) => a + r.paid_amount, 0);
      // 段Y2: 合計サマリ＝確定済み payslips の凍結値をそのまま加算するだけ（D3 CSV と同じ読み取り経路）
      const { data: ps } = await supabase.from("payslips").select("net, breakdown_json").eq("run_id", info.id);
      const slips = (ps ?? []) as { net: number; breakdown_json: BreakdownJson }[];
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
        setIncentives([]);
        setMsg(`エラー(${res.status}): ${j.error ?? ""}`);
        return;
      }
      setRows(j.rows as Row[]);
      setBlockers((j.blockers ?? []) as Blocker[]);
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
          setMsg(`確定不可（税区分/プラン未設定）: ${(j.blockers as Blocker[]).map((b) => b.castName).join("、")}`);
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
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>給与</h1>
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
      {runInfo && (
        <section className="nox-cardtop" style={t.card}>
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
          {/* E8-5 payroll#1: 段の可視化（集計→確定→支払）＋次アクション。★状態の表示だけ＝
              各操作ボタンは従来どおり各セクション（機能・権限・無効化条件は不変）。
              モックの4段目「公開」（LINE 明細公開）は T3 後送りのため出さない。 */}
          {(() => {
            const stage = runInfo.status === "paid" ? 3 : runInfo.status === "finalized" ? 2 : 1;
            const next = stage === 1 ? "次: プレビューを確認して「この期間を確定する」"
              : stage === 2 ? "次: 下の「支払記録」で支払いを記録"
              : "この期間は支払済みです";
            return (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 10px" }}>
                {(["集計・確認", "確定", "支払"] as const).map((label, i) => (
                  <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                      border: `1px solid ${i + 1 <= stage ? "var(--gold)" : "var(--line2)"}`,
                      color: i + 1 <= stage ? "var(--champ)" : "var(--sub)",
                      background: i + 1 <= stage ? "#1F1B12" : "transparent",
                    }}>{i + 1} {label}</span>
                    {i < 2 && <span style={{ color: "var(--sub)", fontSize: 11 }}>→</span>}
                  </span>
                ))}
                <span style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>{next}</span>
              </div>
            );
          })()}

          {/* 合計サマリ4カード＝★確定済みの凍結値（payslips.breakdown_json）の Σ のみ。
              定義は D3 CSV の payrollCsvCells と逐語同一（総支給=gross+extras／控除計=7項目の和／
              うち源泉=withholding／差引=payslips.net）。率計算・丸め直し・整合補正は一切しない。 */}
          {sum4 && (
            <div className="nox-paysum">
              <div className="nox-paycard">
                <div className="l">総支給（gross）</div>
                <div className="v num">¥{sum4.gross.toLocaleString()}</div>
              </div>
              <div className="nox-paycard">
                {/* 段0R 第2陣: ラベルのみモック逐語へ（値の定義＝7項目の和に源泉を含む事実と一致）。数値は不変。 */}
                <div className="l">控除計（源泉含む）</div>
                <div className="v num">−¥{sum4.ded.toLocaleString()}</div>
              </div>
              <div className="nox-paycard">
                <div className="l">うち源泉</div>
                <div className="v num">¥{sum4.wh.toLocaleString()}</div>
              </div>
              <div className="nox-paycard net">
                <div className="l">差引支給（net）</div>
                <div className="v num">¥{sum4.net.toLocaleString()}</div>
              </div>
            </div>
          )}
          {sum4 && (
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: 0 }}>
              ※確定時に凍結された明細の合計です（画面側での再計算はしていません）。
            </p>
          )}
          {/* E8-5 payroll#5（T1）: 未支払＋前月比（表示専用・定義は PaymentPanel / 前月 run Σnet と同一） */}
          {sum4 && (unpaid !== null || prevNet !== null) && (
            <p style={{ fontSize: 12, margin: "8px 0 0", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {unpaid !== null && (
                <span style={{ color: unpaid > 0 ? "var(--bad)" : "var(--ok)", fontWeight: 700 }}>
                  未支払 ¥{unpaid.toLocaleString()}{unpaid <= 0 && "（全額支払済み）"}
                </span>
              )}
              {prevNet !== null && prevNet > 0 && (
                <span style={{ color: "var(--sub)" }}>
                  差引支給の前月比 <span className="num" style={{ fontWeight: 700, color: sum4.net >= prevNet ? "var(--ok)" : "var(--bad)" }}>
                    {sum4.net >= prevNet ? "+" : ""}{Math.round(((sum4.net - prevNet) / prevNet) * 100)}%
                  </span>（前月 ¥{prevNet.toLocaleString()}）
                </span>
              )}
            </p>
          )}
        </section>
      )}

      {msg && <p style={{ color: "var(--bad)", fontSize: 13 }}>{msg}</p>}
      {finalized && <p style={{ color: "var(--champ)", fontSize: 14, fontWeight: "bold" }}>{finalized}</p>}

      {/* 段2: プレビュー（参考値） */}
      {rows && (
        <>
          {blockers.length > 0 && (
            <div style={t.alert}>
              ⚠ 確定不可の cast（要 税区分/プラン登録）:{" "}
              {blockers.map((b) => `${b.castName}(${b.reason === "no_tax" ? "税区分未登録" : "プラン未設定"})`).join("、")}
            </div>
          )}
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
                <tr key={r.castId} onClick={() => setDetailCast((v) => (v === r.castId ? null : r.castId))}
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
                </tr>
                );
              })}
            </tbody>
          </table>
          {/* E8-5 payroll#3: 行タップ→個別内訳（preview breakdown の再掲＝サーバ計算値のみ・確定時は再計算が正） */}
          {(() => {
            const r = detailCast ? rows.find((x) => x.castId === detailCast) : null;
            const pay = r?.breakdown?.pay;
            if (!r || !pay) return null;
            const z = (v: number | undefined) => v ?? 0;
            const items: [string, number][] = [
              ["時給（timePay）", z(pay.timePay)],
              ["本指名バック", z(pay.honBack)], ["場内バック", z(pay.jonaiBack)], ["同伴バック", z(pay.dohanBack)],
              ["ドリンク", z(pay.drinkBack)], ["シャンパン", z(pay.champBack)], ["ボトル", z(pay.bottleBack)],
              ["売上スライド", z(pay.salesBack)], ["自由バック", z(pay.customTotal)],
            ];
            const deds: [string, number][] = [
              ["固定控除", z(pay.fixedDed)], ["罰金", z(pay.fine)], ["源泉", z(pay.withholding)],
              ["売掛天引き", z(pay.arDeduct)], ["前借り", z(pay.advanceDeduct)], ["送り", z(pay.okuriDeduct)],
              ["ノルマ", z(pay.normPenalty)],
            ];
            return (
              <div className="nox-inset" style={{ padding: "12px 14px", marginBottom: 12 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, margin: "0 0 8px", color: "var(--champ)" }}>
                  {r.castName} の内訳（プレビュー参考値）
                </p>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5 }}>
                  <div>
                    {items.filter(([, v]) => v !== 0).map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, minWidth: 200 }}>
                        <span style={{ color: "var(--sub)" }}>{l}</span><span className="num">¥{v.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    {deds.filter(([, v]) => v !== 0).map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 16, minWidth: 200 }}>
                        <span style={{ color: "var(--sub)" }}>{l}</span><span className="num" style={{ color: "var(--bad)" }}>−¥{v.toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, minWidth: 200, marginTop: 4, fontWeight: 800 }}>
                      <span>差引支給</span><span className="num" style={{ color: "var(--v2-text)" }}>¥{r.net.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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

      {/* 確定済み給与の支払記録（選択中の店舗・期間に対して） */}
      {storeId && <PaymentPanel storeId={storeId} period={period} />}

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
