import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import PayslipSlip from "@/components/payslip-slip";
import { ATTENDANCE_MONTH_NOTE, closeHmOf, hoursLabelOf, monthAttendanceRowsOf, todayInOutLabelOf } from "@/lib/nox/mine/attendance-month"; // ★裁定326-5（便 M2-1）: 勤怠時刻＋当月一覧（実働は dayWorkedHours）
import { nextPeriodOf } from "@/lib/nox/payroll/attention";
import { mdLabelOf } from "@/lib/nox/payroll/finalize-guard";
import ReservationRequestCard from "./reservation-request-card"; // ★裁定326-4（便 M3-2）: 予約申請（店設定 reservation_request ON のときだけ）
import ShiftConfirmButton from "./shift-confirm-button";
import * as t from "@/lib/nox/ui/theme";
import PunchActions from "./punch-actions";
import PunchCorrectionForm from "./punch-correction-form"; // ★0154 D1
import PunchCorrectionList from "./punch-correction-list"; // ★0154 D1
import { termOf, type CorrectionRow } from "@/lib/nox/shift/punch-correction";
import PhotoCard from "./photo-card";
import ContractAckGate from "./contract-ack-gate"; // ★0162 ★4（裁定326 追補7-6・便 M5-2）: 契約確認（店 ON かつ未記録のときだけ最上部）
import { contractAckGateOf } from "@/lib/nox/mine/contract-ack";
import AttendanceForm from "./attendance-form";
import NormCard from "./norm-card";
import DrinkClaimForm from "./drink-claim-form";
import PrintPayslipButton from "./print-payslip-button";
import { isSectionOn, type StoreSettings } from "@/lib/nox/store-systems"; // ★裁定269: 使う制度の出し分け
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-8（便 M1-3）: mine_settings の出し分け（既存の自店読取に相乗り＝新規 fetch 0）
import { punchHeadOf, punchStateOf } from "@/lib/nox/shift/punch-state"; // ★裁定326 追補3（便 M1-4）: 打刻カードの 3 状態（todayPunches から＝新規 fetch 0）

export const dynamic = "force-dynamic";

/** 店設定の営業日切替時刻（stores.settings_json.biz_cutoff_hm・既定 '06:00'）。
 *  ★mig0106（起票#14）: cast の RLS でも自店1行は読める（stores_select の id=auth_store_id() 腕）。
 *    経路は app/(manage)/dashboard/page.tsx と同型。 */
async function loadCutoff(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle();
  const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
  return typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
}

const yen = (n: number) => "¥" + n.toLocaleString();
const ATT_LABEL: Record<string, string> = {
  shukkin: "出勤", dohan: "同伴", late: "遅刻連絡", off: "休み", absent: "当欠連絡",
};

// cast マイページ。SELECT はパターン1テーブルのみ（RLS が自分の行だけ返す＝可視性の物理保証）。
export default async function MinePage() {
  const supabase = await createClient();
  const cutoff = await loadCutoff(supabase);
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  const month = bizToday.slice(0, 7);

  // ★裁定326-2（便 M2-1）: 「今月のバック」「報酬シミュレーター」の 2 カードは削除（check_cast_backs の読取と sim-data の読取も外した）

  // ★0154 D1（裁定294／295）: 自分の cast 行（id・employment＝用語）・修正申請（RLS 本人・表が無ければ空）
  const { data: meCast } = await supabase.from("casts").select("id, employment").limit(1).maybeSingle();
  const term = termOf((meCast?.employment as string | null) ?? null);
  const { startIso: bizStartIso, endIso: bizEndIso } = bizDateRange(bizToday, cutoff);
  // ★裁定326-5（便 M2-1）: 当月の自分の打刻を 1 本で読む（勤怠一覧）→ 当日分はここから絞る（旧 todayPunches の fetch と置換＝新規 fetch 0）
  const nextMonth = nextPeriodOf(month);
  const { startIso: monthStartIso } = bizDateRange(`${month}-01`, cutoff);
  const { startIso: monthEndIso } = bizDateRange(`${nextMonth}-01`, cutoff);
  const { data: monthPunches } = await supabase.from("punches").select("id, type, punched_at").gte("punched_at", monthStartIso).lt("punched_at", monthEndIso).order("punched_at");
  const todayPunches = ((monthPunches ?? []) as { id: string; type: string; punched_at: string }[]).filter((p) => Date.parse(p.punched_at) >= Date.parse(bizStartIso) && Date.parse(p.punched_at) < Date.parse(bizEndIso));
  const { data: corrRows } = await supabase.from("punch_corrections").select("id, cast_id, punch_id, biz_date, kind, before_at, after_at, reason, decision, decide_reason, ack, ack_at, requested_at, decided_at").order("requested_at", { ascending: false }).limit(20);

  // 最終打刻(自分の行のみ)
  const { data: punches } = await supabase
    .from("punches")
    .select("type, punched_at")
    .order("punched_at", { ascending: false })
    .limit(1);
  const last = punches?.[0];

  // 直近の確定シフト（★326-5: 当月初からまとめて読み、直近 7 件はここから絞る・当月の確定分は勤怠一覧の実働計算に使う＝新規 fetch 0）
  const { data: shiftsAll } = await supabase
    .from("shifts")
    .select("id, date, start_hm, end_hm, status") // ★SD V2-3: id 追加（shift_cast_confirm の対象特定）
    .gte("date", `${month}-01`)
    .order("date");
  type ShiftLite = { id: string; date: string; start_hm: string; end_hm: string; status: string };
  const shifts = ((shiftsAll ?? []) as ShiftLite[]).filter((s) => s.date >= bizToday).slice(0, 7);
  const monthConfirmedShifts = ((shiftsAll ?? []) as ShiftLite[]).filter((s) => s.status === "confirmed" && s.date < `${nextMonth}-01`);

  // 今月の勤怠
  const { data: att } = await supabase
    .from("attendance")
    .select("date, status, eta")
    .gte("date", `${month}-01`)
    .order("date", { ascending: false })
    .limit(10);

  // 今月の出勤ボーナス（attendance_incentives＝パターン3・店の published を可視）。
  // 受給は当日の確定シフト出勤（final∈{ok,late}）が条件・確定額は給与確定時。pooled は受給者数で変動＝暫定表示。
  const { data: incentives } = await supabase
    .from("attendance_incentives")
    .select("biz_date, amount_mode, amount")
    .eq("status", "published")
    .gte("biz_date", `${month}-01`)
    .order("biz_date", { ascending: false })
    .limit(20);

  // 確定済み給与明細（payslips＝金額系・cast 本人可視）。breakdown_json.ar の売掛天引き額を表示（F2e-1）。
  const { data: slips } = await supabase
    .from("payslips")
    .select("period, net, breakdown_json")
    .order("period", { ascending: false })
    .limit(6);
  // breakdown_json の解釈と1件描画は共有 PayslipSlip へ移設（D2＝表示の移設のみ・数値ロジック非改変）。

  // 段M2: 所属店（ヘッダ表示用）。cast の可視 store は自店のみ（RLS）＝先頭行が自店（/mine/ranking と同型）。
  const { data: myStores } = await supabase.from("stores").select("id, name, settings_json").limit(1); // ★裁定269: sys_* は既存の自店読取に列を足すだけ
  const myStore = myStores?.[0];
  const ms = mineSettingsOf(myStore?.settings_json); // ★326-8: drink_claim／punch_correction_request／ranking の出し分け（reservation_request の申請カードは M3）
  // ★0162 ★4（便 M5-2）: 契約確認の要否＝店の contract_ack が ON のときだけ cast_contract_ack_needed()（cast セルフ・非ゲート）。読めなければ出さない（止めない）
  const { data: ackNeeded } = ms.contract_ack ? await supabase.rpc("cast_contract_ack_needed") : { data: null };
  const showContractAck = contractAckGateOf(ms.contract_ack, typeof ackNeeded === "boolean" ? ackNeeded : null);
  const ps = punchStateOf((todayPunches ?? []) as { type: string; punched_at: string }[]); // ★326 追補3: 当日営業日の自分の打刻 → 未出勤／出勤中／退勤済み
  // ★326-5: 当月の勤怠一覧（日付・出勤・退勤・実働＝dayWorkedHours・確定シフトのある日だけ時間が出る）と当日の出勤・退勤時刻
  const attRows = monthAttendanceRowsOf({
    punches: ((monthPunches ?? []) as { type: string; punched_at: string }[]).map((p) => ({ punched_at: p.punched_at, type: p.type as "in" | "out" })),
    shifts: monthConfirmedShifts.map((s) => ({ date: s.date, start_hm: s.start_hm, end_hm: s.end_hm })),
    cutoffHm: cutoff, closeHm: closeHmOf(myStore?.settings_json),
  });
  const todayRow = attRows.find((r) => r.bizDate === bizToday) ?? null;
  // ★0156（起票85・便 V-7）: マイナンバーの廃棄状況（cast_mynumber_discard_status＝cast 本人・値は返さない・audit なし）。廃棄後だけ「廃棄済み YYYY-MM-DD」を出す
  const { data: discardRows } = meCast ? await supabase.rpc("cast_mynumber_discard_status", { p_cast_id: meCast.id as string }) : { data: null };
  const discard = ((discardRows ?? []) as { mynumber_deleted_at: string | null; mynumber_deletion_method: string | null; has_mynumber: boolean }[])[0];
  const discardYmd = discard?.mynumber_deleted_at ? new Date(discard.mynumber_deleted_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) : null;

  // 段M2: 指名ランキングの★自分の行だけ（get_cast_ranking＝金額列を構造的に持たない既存 RPC・
  //   /mine/ranking が既に使っている経路と同一）。他キャストの数字は一切描画しない（順位と母数のみ）。
  const { data: rankAll } = myStore
    ? await supabase.rpc("get_cast_ranking", { p_store_id: myStore.id as string, p_period: month })
    : { data: null };
  type MyRank = { rank: number; hon_count: number; jonai_count: number; dohan_count: number; is_self: boolean };
  const rankRows = (rankAll ?? []) as MyRank[];
  const myRank = rankRows.find((r) => r.is_self) ?? null;

  // 自分指名の予約（F3a-3・read-only）。RLS が cast_id=auth_cast_id() の行のみ返す＝可視性の物理保証（段19-11）。
  // 表示は今営業日（06:00 起点）以降の booked のみ＝cast は予約に行動できないため過去/確定状態は出さない。
  // 客名は customers embed（cast は担当客のみ可視＝customers RLS）→不可視/フリー予約は guest_name フォールバック。
  const { data: rsv } = await supabase
    .from("reservations")
    .select("id, reserved_at, guest_name, party_size, nom_type, memo, customers(name)")
    .eq("status", "booked")
    .gte("reserved_at", `${bizToday}T06:00:00+09:00`)
    .order("reserved_at", { ascending: true });
  type RsvCustomer = { name: string } | { name: string }[] | null;
  // 名前が取れたら「◯◯ 様」・取れない（担当外客=RLS 不可視かつ guest_name なし）は敬称を重ねず「お客様」。
  const rsvName = (customers: RsvCustomer, guest: string | null): string => {
    const c = Array.isArray(customers) ? customers[0] : customers;
    const name = c?.name ?? guest;
    return name ? `${name} 様` : "お客様";
  };
  const rsvWhen = (iso: string): string =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };

  const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
  const noteP: React.CSSProperties = { fontSize: 12, color: "var(--sub)", margin: 0 };
  const thL: React.CSSProperties = { textAlign: "left", fontWeight: 700, color: "var(--sub)", padding: "3px 0", borderBottom: "1px solid var(--line2)" };
  const thR: React.CSSProperties = { ...thL, textAlign: "right" };
  const tdL: React.CSSProperties = { padding: "3px 0", borderBottom: "1px solid var(--line2)" };
  const tdR: React.CSSProperties = { ...tdL, textAlign: "right" };

  return (
    /* 段0R 第3陣: モック正本どおりモバイルファースト1カラム（max-width 430・nox-minewrap）。
       印刷時は既存の .nox-main > * { max-width none } が幅を戻すため payslip の A4 印刷に影響しない。
       ページ見出しはモックどおり撤去＝.me ヘッダ（写真＋名前＋店）が先頭。 */
    <div className="nox-printpage nox-minewrap nox-mv1 nox-mv1-m">
      {/* 段P: プロフィール写真（本人スコープのみ・client 自己完結＝他カードの取得に影響しない）
          段M2: モックの .me ヘッダ（写真＋名前＋店）へ。店名は上で引いた自店を渡すだけ。 */}
      {showContractAck && <ContractAckGate />}{/* ★0162 ★4（便 M5-2）: 初回表示の契約確認＝記録済みは出さない・rev 更新で再表示 */}
      <PhotoCard storeName={myStore?.name as string | undefined} />

      {/* 段M2: 打刻はスマホで一番使うのでヘッダ直後へ（section の中身・PunchActions・最終打刻の
          文言はそのまま＝移設のみ）。 */}
      <section className="nox-panel">
        <h3>打刻{punchHeadOf(ps.state, ps.inAt) && <span className="num" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--ok)" }}>{punchHeadOf(ps.state, ps.inAt)}</span>}</h3>{/* ★326 追補3: 出勤中は見出し横に「出勤中 HH:MM〜」 */}
        <PunchActions state={ps.state} okuriActual={((myStore?.settings_json ?? {}) as Record<string, unknown>).okuri_mode === "actual"}
          okuriBase={typeof ((myStore?.settings_json ?? {}) as Record<string, unknown>).okuri_base_amount === "number" ? (((myStore?.settings_json ?? {}) as Record<string, unknown>).okuri_base_amount as number) : null} />{/* ★0156（裁定309-9）: actual 店のみ「送り あり／なし」 */}
        <p className="nox-pstate">
          最終打刻:{" "}
          {last
            ? `${last.type === "in" ? "出勤" : "退勤"}（${rsvWhen(last.punched_at as string)}）`
            : "なし"}
        </p>
        {/* ★裁定326-5（便 M2-1）: 当日の出勤・退勤時刻（M1 の状態表示は置き換えず追記）＋当月の勤怠一覧（折りたたみ・実働＝給与と同じ dayWorkedHours） */}
        <p className="nox-pstate num">{todayInOutLabelOf(todayRow)}</p>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12.5, color: "var(--sub)", cursor: "pointer" }}>今月の勤怠一覧（{attRows.length} 日）</summary>
          {attRows.length === 0 ? <p style={{ ...noneP, marginTop: 6 }}>打刻なし</p> : (
            <table style={{ width: "100%", fontSize: 12.5, marginTop: 6, borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>日付</th><th style={thR}>出勤</th><th style={thR}>退勤</th><th style={thR}>実働</th></tr></thead>
              <tbody>
                {attRows.map((r) => (
                  <tr key={r.bizDate}>
                    <td className="num" style={tdL}>{mdLabelOf(r.bizDate)}</td>
                    <td className="num" style={tdR}>{r.inHm ?? "—"}</td>
                    <td className="num" style={tdR}>{r.outHm ?? "—"}</td>
                    <td className="num" style={tdR}>{hoursLabelOf(r.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ ...noteP, marginTop: 4 }}>{ATTENDANCE_MONTH_NOTE}</p>
        </details>
      </section>

      {/* ノルマ進捗（mig0042・表示のみ）: 採用軸かつ目標>0 の軸だけ・全非表示ならカード自体出ない
          ★店が採用している軸のときだけ出る現行条件はそのまま（部品側の判定に一切触れていない）。 */}
      {isSectionOn((myStore?.settings_json ?? null) as StoreSettings, "mineNormCard") && <NormCard />}{/* ★裁定269-4: mineNormCard */}

      {/* 印刷隔離の対象マーカーは維持（器だけ差し替え・明細スリップ部品は非改変）
          ★裁定326-1（便 M2-1／M2-4）: payslip_visibility 'off'＝カードごと出さない（PDF ボタンも無し）／'net_only'＝期ヘッダー＋手取り 1 行（compact・PDF は同じ DOM）／'detail'＝現状 */}
      {ms.payslip_visibility !== "off" && (
      <section className="nox-panel nox-print">
        <h3>
          確定給与明細
          <span style={{ marginLeft: "auto" }}>{(slips ?? []).length > 0 && <PrintPayslipButton />}</span>
        </h3>
        {(slips ?? []).length === 0 && <p style={{ ...noneP, marginTop: 11 }}>確定分なし</p>}
        <div style={{ marginTop: 11 }}>
          {(slips ?? []).map((s, i) => (
            <PayslipSlip
              key={i}
              compact={ms.payslip_visibility === "net_only"}
              slip={{ period: s.period as string, net: s.net as number, breakdown_json: s.breakdown_json }}
            />
          ))}
        </div>
        <p style={{ ...noteP, marginTop: 6 }}>{ms.payslip_visibility === "net_only" ? "※手取りと期のみの表示です。内訳は店にご確認ください。" : "※確定後の明細です。売掛・前借り・送りの未収残は店にご確認ください。"}</p>
      </section>
      )}
      {/* ★0156（起票85・便 V-7）: マイナンバー廃棄後だけ本人にも「廃棄済み YYYY-MM-DD」を出す（値は出さない・未廃棄は何も出さない）。★M2: 明細カードの外へ（明細 'off' の店でも出す） */}
      {discardYmd && <p className="nox-pstate" style={{ margin: "0 0 10px" }}>マイナンバー 廃棄済み <span className="num">{discardYmd}</span></p>}

      {/* ★裁定326-2（便 M2-1）: 報酬シミュレーターと今月のバックの 2 カードは削除 */}

      {/* F3f 自己申告ドリンク（独立枠・承認後に給与明細へ合算） */}
      {ms.drink_claim && <DrinkClaimForm month={month} />}{/* ★326-8: drink_claim OFF＝カード非表示 */}

      <section className="nox-panel">
        <h3>今月の出勤ボーナス（{month}）</h3>
        {(incentives ?? []).length === 0 && <p style={noneP}>発行なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(incentives ?? []).map((r, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {r.biz_date}{" "}
              {r.amount_mode === "per_head"
                ? <>定額 <span style={t.num}>{yen(r.amount as number)}</span></>
                : <>プール <span style={t.num}>{yen(r.amount as number)}</span>（受給者数により変動・暫定）</>}
            </li>
          ))}
        </ul>
        <p style={{ ...noteP, marginTop: 6 }}>
          ※受給は当日の確定シフト出勤が条件・確定額は給与確定時に算出。
        </p>
      </section>


      <section className="nox-panel">
        <h3>遅刻・当欠の連絡</h3>
        <AttendanceForm defaultDate={bizToday} />
      </section>

      {/* ★0154 D1（裁定294-2／294-4／295-1）: 出退勤の修正申請（本人）＝店の承認後に punches へ反映・承認分は本人が確認／異議あり */}
      {ms.punch_correction_request && meCast?.id && (/* ★326-8: punch_correction_request OFF＝修正申請カード非表示 */
        <section className="nox-panel">
          <h3>{term}の修正申請</h3>
          <PunchCorrectionForm castId={meCast.id as string} bizToday={bizToday} punches={(todayPunches ?? []) as { id: string; type: string; punched_at: string }[]} term={term}
            finalizedPeriods={((slips ?? []) as { period: string }[]).map((s) => s.period)} />{/* ★裁定315（便 AB-3）: 明細がある期＝確定済み */}
          <div style={{ marginTop: 10 }}>
            <PunchCorrectionList rows={(corrRows ?? []) as CorrectionRow[]} term={term} />
          </div>
        </section>
      )}

      <section className="nox-panel">
        <h3>
          直近のシフト
          {/* 段M2: 希望提出への導線（既存 /mine/wishes へのリンクのみ＝新しい提出 UI は作らない） */}
          <Link href="/mine/wishes" className="nox-link" style={{ marginLeft: "auto", fontSize: 12 }}>
            ＋ 希望を提出
          </Link>
        </h3>
        {(shifts ?? []).length === 0 && <p style={noneP}>予定なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(shifts ?? []).map((s, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {s.date} {fmtWin(s.start_hm as string, s.end_hm as string)}{" "}
              {/* ★SD V2-3（mig0101/0102）: status 3値＝proposed は「確認待ち」＋「確認する」ボタン
                  （shift_cast_confirm＝proposed→confirmed 一方向・本人のみ）。confirmed/planned は表示のみ。 */}
              <span style={{ color: s.status === "confirmed" ? "var(--ok)" : "var(--sub)" }}>
                （{s.status === "confirmed" ? "確定" : s.status === "proposed" ? "確認待ち" : "予定"}）
              </span>
              {s.status === "proposed" && <ShiftConfirmButton shiftId={s.id as string} />}
            </li>
          ))}
        </ul>
      </section>

      {/* 段M2: 指名ランキング＝★自分の順位のみ。順位・母数・自分の件数だけを出し、
          他キャストの名前も数字も描画しない（1位との差のような他人由来の値も出さない）。
          値は /mine/ranking が既に使っている get_cast_ranking の自分の行そのもの＝情報は増えない。 */}
      {ms.ranking && myRank && (/* ★326-8: ranking OFF＝カードもナビもページも出さない（直 URL は /mine へ） */
        <section className="nox-panel">
          <h3>指名ランキング（{month}）</h3>
          <div className="nox-myrank">
            <span className={`nox-medal ${myRank.rank === 1 ? "g1" : myRank.rank === 2 ? "g2" : myRank.rank === 3 ? "g3" : "gx"}`}>
              {myRank.rank}
            </span>
            <div>
              <div className="t num">{myRank.rank}位 / {rankRows.length}人中</div>
              <div className="n num">
                本指名 {myRank.hon_count}件・場内 {myRank.jonai_count}件・同伴 {myRank.dohan_count}件
              </div>
            </div>
            <Link href="/mine/ranking" className="nox-link" style={{ marginLeft: "auto", fontSize: 12 }}>
              一覧 ›
            </Link>
          </div>
        </section>
      )}

      {/* ★裁定326-4／326-8（便 M3-2）: 予約申請カード＝店設定 reservation_request ON のときだけ（OFF＝非表示・予約一覧は残す） */}
      {ms.reservation_request && myStore && <ReservationRequestCard storeId={myStore.id as string} bizToday={bizToday} />}

      <section className="nox-panel">
        <h3>指名予約（今日以降）</h3>
        {(rsv ?? []).length === 0 && <p style={noneP}>予約なし</p>}
        {(rsv ?? []).map((r) => (
          <div key={r.id as string} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ ...t.num, fontWeight: 700 }}>{rsvWhen(r.reserved_at as string)}</span>
              <span style={{ fontWeight: 700 }}>{rsvName(r.customers as RsvCustomer, r.guest_name as string | null)}</span>
              {r.party_size != null && <span style={{ color: "var(--sub)" }}>{r.party_size}名</span>}
              <span style={{
                fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                color: "var(--gold)", background: "var(--card2)", border: "1px solid var(--line2)",
                whiteSpace: "nowrap", marginLeft: "auto",
              }}>予約</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              {NOM_LABEL[r.nom_type as string] ?? "指名種別は来店時に決定"}
              {r.memo ? `・${r.memo}` : ""}
            </div>
          </div>
        ))}
        <p style={{ ...noteP, marginTop: 6 }}>※予約の変更・取消は店舗にご連絡ください。</p>
      </section>

      <section className="nox-panel">
        <h3>今月の勤怠</h3>
        {(att ?? []).length === 0 && <p style={noneP}>記録なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(att ?? []).map((a, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {a.date} {ATT_LABEL[a.status as string] ?? a.status}
              {a.eta ? `（出勤見込み ${a.eta}）` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
