"use client";

// K レジ用キオスク（裁定11/15・mig0056〜0059 と対・タブレット常設前提）。
// 認証2層: ①端末＝Supabase auth（register kiosk アカウント・users/memberships 非連動）
//          ②操作担当＝kiosk_login（membership 選択＋PIN 4桁＝staff_pin・サーバ側 kiosk_sessions）。
// 画面ガードは利便のみ＝kiosk_operator_list が 0行なら「レジ端末ではない」を表示するだけで、
// 真の防御は RPC（会計12本の kiosk 腕＝0057/0058・読取2本の正ガード＝0059）。
// 読取は 0059 の kiosk_register_state / kiosk_check_detail の2本のみ（直テーブル SELECT なし＝RLS 0行）。
// ★UI 契約（0059 (b)）: state/detail をタイマー自動ポーリングしない（読取だけで滑走 idle が
//   延命され 15分失効が死ぬため）。読取は操作起点のみ。idle 表示と自動ロックはローカル時計のみで行い、
//   タイマーから RPC は一切呼ばない（サーバ側 15分失効は独立に効く＝forbidden で operator 選択へ戻る）。
// void・割引承認・ボトルキープは kiosk 非対象（裁定11 確定①②＋顧客系非開示）＝UI からも出さない。
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupDue } from "@/lib/nox/check-calc";
import { useTapBatch } from "@/lib/nox/ui/use-tap-batch";
import * as t from "@/lib/nox/ui/theme";

type OpRow = { membership_id: string; user_name: string; role: string; has_pin: boolean };
type StateSeat = { id: string; name: string; kind: string | null };
type StateProduct = { id: string; name: string; type: string; price: number };
type StateCast = { id: string; name: string };
type StateCheck = { id: string; seat_id: string; extra_seat_ids: string[]; total: number };
type RegState = { seats: StateSeat[]; products: StateProduct[]; casts: StateCast[]; checks: StateCheck[] };
type DetailCheck = {
  id: string; seat_id: string; status: string; people: number | null; nom_type: string;
  started_at: string; total: number; service_rate: number; round_unit: number; round_mode: string;
};
type DetailLine = { id: string; kind: string; pay_group: string; name_snapshot: string; unit_price_snapshot: number; qty: number; line_total: number };
type DetailPayment = { id: string; pay_group: string; method: string; amount: number; tendered: number | null; method_detail: string | null };
type DetailNom = { cast_id: string; ratio_weight: number };
type Detail = {
  check: DetailCheck; time_mode: string; lines: DetailLine[]; payments: DetailPayment[];
  nominations: DetailNom[]; extra_seat_ids: string[]; paid_total: number; balance: number;
};
type TimeCalc = { elapsed_min: number; units: number; blocks: number; set_c: number; ext_c: number; total: number; line_id: string };
type Phase = "loading" | "login" | "denied" | "operator" | "pin" | "register";
type Session = { name: string; role: string };

const yen = (n: number) => "¥" + n.toLocaleString();
const METHOD_LABEL: Record<string, string> = { cash: "現金", card: "カード", ar: "売掛", other: "その他" };
const DETAIL_METHODS = new Set(["card", "other"]);
const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
// 段B: 商品タイルの type 別見出し（products.type＝drink/champ/bottle・既存カラム）・滞在経過は started_at から算出。
const TYPE_LABEL: Record<string, string> = { drink: "ドリンク", champ: "シャンパン", bottle: "ボトル" };
const TYPE_ORDER = ["drink", "champ", "bottle"] as const;
const elapsedMin = (started: string, now: number) => Math.max(0, Math.floor((now - new Date(started).getTime()) / 60000));
const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };
const IDLE_MS = 15 * 60_000; // サーバ側 15分失効（確定④）のローカル鏡像＝表示と自動ロックのみ

// B1/B2 席操作エラーの日本語化（register-board 写経）
function seatErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("seat occupied")) return "その席は使用中です";
  if (msg.includes("home seat")) return "主席は解除できません（席移動を使ってください）";
  if (msg.includes("not open")) return "締められています";
  if (msg.includes("same seat")) return "同じ席です";
  if (msg.includes("inactive seat")) return "無効な席です";
  if (msg.includes("bad seat")) return "席の指定が不正です";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}
// B4 時間料金エラーの日本語化（register-board 写経）
function timeErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("has payments")) return "入金後は時間料金を反映できません（訂正は責任者へ）";
  if (msg.includes("not open")) return "この伝票は締められています（反映できません）";
  if (msg.includes("bad time settings")) return "店の時間料金設定が不正です（マスタで確認してください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

const bigBtn: React.CSSProperties = {
  border: "1px solid var(--line2)", borderRadius: 14, background: "linear-gradient(180deg,var(--card2),var(--card))",
  color: "var(--ink)", fontSize: 18, fontWeight: 800, padding: "18px 10px", cursor: "pointer",
  fontFamily: "inherit",
};
const keyBtn: React.CSSProperties = {
  ...bigBtn, fontSize: 26, padding: 0, height: 72, fontVariantNumeric: "tabular-nums",
};
const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto" };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function KioskRegisterPage() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [operators, setOperators] = useState<OpRow[]>([]);
  const [target, setTarget] = useState<OpRow | null>(null);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [lockMsg, setLockMsg] = useState<string | null>(null);

  const [state, setState] = useState<RegState | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seatMsg, setSeatMsg] = useState<string | null>(null);
  const [timeCalc, setTimeCalc] = useState<TimeCalc | null>(null);
  const [timeMsg, setTimeMsg] = useState<string | null>(null);
  const [printCard, setPrintCard] = useState<{ checkId: string; groups: string[] } | null>(null);
  const [printMsg, setPrintMsg] = useState<Record<string, string>>({});

  // フォーム状態（register-board 写経）
  const [nomType, setNomType] = useState("hon");
  const [nomWeights, setNomWeights] = useState<Record<string, number>>({});
  const [prodGroup, setProdGroup] = useState("A"); // 段B: タイル追加先の伝票グループ（既定 A）
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState(0);
  const [cKind, setCKind] = useState("set");
  const [cGroup, setCGroup] = useState("A");
  const [payGroup, setPayGroup] = useState("A");
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState(0);
  const [payTendered, setPayTendered] = useState("");
  const [payDetail, setPayDetail] = useState("");

  // ローカル idle（表示＋自動ロックのみ・★このタイマーから RPC は呼ばない＝0059 (b) 契約）
  const lastActionRef = useRef<number>(Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const markAction = () => { lastActionRef.current = Date.now(); };

  const loadOperators = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("kiosk_operator_list");
    const rows = (data ?? []) as OpRow[];
    if (error || rows.length === 0) return false;
    setOperators(rows);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 操作担当選択へ戻す（セッション失効・交代・ローカル idle 到達の共通経路）
  const lockToOperator = useCallback((reason: string | null) => {
    setSession(null); setDetail(null); setState(null); setTarget(null); setPin("");
    setLockMsg(reason); setPhase("operator");
    void loadOperators(); // 操作起点（ロック直後の一覧再取得＝has_pin 変化も拾う）
  }, [loadOperators]);

  // forbidden＝サーバ側セッション失効（idle/logout/権限）→ operator へ戻す。それ以外は false。
  const sessionLostIf = useCallback((e: { message?: string } | null): boolean => {
    if (e?.message?.includes("forbidden")) {
      lockToOperator("セッションが切れました。操作担当を選び直してください。");
      return true;
    }
    return false;
  }, [lockToOperator]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPhase("login"); return; }
      setPhase((await loadOperators()) ? "operator" : "denied");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ローカル時計 tick（30秒）＝idle 表示と自動ロックのみ。★RPC 呼出なし（grep ゲート対象）。
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
      if (phaseRef.current === "register" && Date.now() - lastActionRef.current > IDLE_MS) {
        lockToOperator("15分間操作がなかったためロックしました。PIN を入れ直してください。");
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [lockToOperator]);

  async function doDeviceLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setLoginErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPw });
    if (error) { setLoginErr("ログインIDまたはパスワードが違います"); setBusy(false); return; }
    setLoginPw("");
    setPhase((await loadOperators()) ? "operator" : "denied");
    setBusy(false);
  }

  // ── 0059 読取（操作起点のみ）──
  const refreshState = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase.rpc("kiosk_register_state");
    if (error) { sessionLostIf(error); return; }
    setState(data as RegState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLostIf]);

  const loadDetail = useCallback(async (checkId: string): Promise<void> => {
    const { data, error } = await supabase.rpc("kiosk_check_detail", { p_check_id: checkId });
    if (error) {
      if (!sessionLostIf(error)) setMsg(error.message.includes("not found") ? "伝票が見つかりません" : error.message);
      return;
    }
    const d = data as Detail;
    setDetail(d);
    setTimeCalc(null); setTimeMsg(null);
    setNomType(d.check.nom_type);
    const w: Record<string, number> = {};
    for (const n of d.nominations) w[n.cast_id] = n.ratio_weight;
    setNomWeights(w);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLostIf]);

  // 段B タップ注文: 商品タイル連打を束ねて check_add_line(p_qty=N) を1回（直列 flush・単一 pending・権威はサーバ）。
  const commitLine = useCallback(
    async (pid: string, qty: number): Promise<{ error: { message?: string } | null }> => {
      if (!detail) return { error: { message: "伝票がありません" } };
      const { error } = await supabase.rpc("check_add_line", {
        p_check_id: detail.check.id, p_product_id: pid, p_qty: qty, p_kind: null,
        p_pay_group: prodGroup || "A", p_name: null, p_unit_price: null,
      });
      if (error) sessionLostIf(error); // forbidden＝セッション失効→operator へ（それ以外は無害）
      return { error };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, prodGroup, sessionLostIf],
  );
  const reloadCurrent = useCallback(async () => {
    if (detail) { await loadDetail(detail.check.id); await refreshState(); }
  }, [detail, loadDetail, refreshState]);
  const tb = useTapBatch(commitLine, reloadCurrent, (m) => setMsg(m));

  // ── 操作担当（PIN セッション）──
  function pickOperator(o: OpRow) {
    if (!o.has_pin) return;
    setTarget(o); setPin(""); setPinMsg(null); setPhase("pin");
  }
  function keyIn(d: string) { setPin((p) => (p.length >= 4 ? p : p + d)); }

  async function doPinLogin() {
    if (!target || pin.length !== 4 || busy) return;
    setBusy(true); setPinMsg(null);
    const { data, error } = await supabase.rpc("kiosk_login", { p_membership_id: target.membership_id, p_pin: pin });
    setBusy(false);
    if (error) { setPinMsg("この端末は現在使用できません（店に確認してください）"); return; }
    const j = data as { ok: boolean; reason?: string; operator_name?: string; role?: string; locked_until?: string };
    if (!j.ok) {
      if (j.reason === "wrong_pin" || j.reason === "bad_pin") setPinMsg("PINが違います");
      else if (j.reason === "locked") {
        const until = j.locked_until
          ? new Date(j.locked_until).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })
          : "";
        setPinMsg(`ロック中です${until ? `（${until} 頃に解除）` : ""}`);
      } else if (j.reason === "no_pin") setPinMsg("PINが設定されていません（マスタ管理で設定してください）");
      else setPinMsg("ログインできませんでした（選び直してください）");
      setPin("");
      return;
    }
    setSession({ name: j.operator_name ?? target.user_name, role: j.role ?? target.role });
    setLockMsg(null); setMsg(null); setSeatMsg(null); setDetail(null); setPrintCard(null);
    markAction();
    setPhase("register");
    await refreshState();
  }

  // 交代/離席（サーバ側セッションも明示終了）
  async function operatorLogout() {
    markAction();
    await supabase.rpc("kiosk_logout").then(() => undefined, () => undefined);
    lockToOperator("操作担当を交代してください。");
  }

  // ── 会計操作（register-board 写経・各操作後に 0059 で再読取＝操作起点）──
  const openBySeat = (seatId: string): StateCheck | undefined =>
    (state?.checks ?? []).find((c) => c.seat_id === seatId || c.extra_seat_ids.includes(seatId));

  async function openSeat(seat: StateSeat) {
    markAction();
    if (!(await tb.flush())) return; // 別 check へ切替前に保留を現 check へ確定（失敗＝中止）
    setMsg(null); setSeatMsg(null);
    const existing = openBySeat(seat.id);
    if (existing) { await loadDetail(existing.id); return; }
    const { data, error } = await supabase.rpc("check_open", { p_seat_id: seat.id, p_people: null, p_nom_type: "free" });
    if (error) { if (!sessionLostIf(error)) setMsg(error.message); return; }
    await refreshState();
    await loadDetail(data as string);
  }

  async function saveNoms() {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const list = Object.entries(nomWeights)
      .filter(([, w]) => w > 0)
      .map(([cast_id, weight]) => ({ cast_id, weight }));
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: detail.check.id, p_nom_type: nomType, p_nominations: list,
    });
    if (error && sessionLostIf(error)) return;
    setMsg(error ? error.message : "指名を保存しました");
    await loadDetail(detail.check.id);
  }

  // （段B: 商品プルダウンの addProductLine は廃止＝タイル tap→tb.flush の check_add_line に置換）

  async function addCustomLine() {
    if (!detail || !cName) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: detail.check.id, p_product_id: null, p_qty: 1, p_kind: cKind,
      p_pay_group: cGroup || "A", p_name: cName, p_unit_price: cPrice,
    });
    if (error && sessionLostIf(error)) return;
    setMsg(error ? error.message : null);
    setCName(""); setCPrice(0);
    await loadDetail(detail.check.id);
    await refreshState();
  }

  async function removeLine(lineId: string) {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setMsg(null);
    const { error } = await supabase.rpc("check_remove_line", { p_line_id: lineId });
    if (error && sessionLostIf(error)) return;
    setMsg(error ? error.message : null);
    await loadDetail(detail.check.id);
    await refreshState();
  }

  async function applyTimeCharge() {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setTimeMsg(null);
    const { data, error } = await supabase.rpc("check_time_charge_apply", { p_check_id: detail.check.id });
    if (error) { if (!sessionLostIf(error)) setTimeMsg(timeErrJa(error.message)); return; }
    await loadDetail(detail.check.id); // timeCalc は loadDetail でクリアされるため下で再設定
    setTimeCalc(data as TimeCalc);
    await refreshState();
  }

  // B1/B2 席操作（kiosk は reservations を読めない＝予約 soft 警告なし・拒否系は RPC が握る）
  async function addSeat(seatId: string) {
    if (!detail || !seatId) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const { error } = await supabase.rpc("check_add_seat", { p_check_id: detail.check.id, p_seat_id: seatId });
    if (error) { if (!sessionLostIf(error)) setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg("相席（同一会計）に追加しました。");
    await loadDetail(detail.check.id);
    await refreshState();
  }
  async function removeSeat(seatId: string) {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const { error } = await supabase.rpc("check_remove_seat", { p_check_id: detail.check.id, p_seat_id: seatId });
    if (error) { if (!sessionLostIf(error)) setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg("相席を解除しました。");
    await loadDetail(detail.check.id);
    await refreshState();
  }
  async function moveSeat(seatId: string) {
    if (!detail || !seatId) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止）
    setSeatMsg(null);
    const { error } = await supabase.rpc("check_move_seat", { p_check_id: detail.check.id, p_to_seat_id: seatId });
    if (error) { if (!sessionLostIf(error)) setSeatMsg(seatErrJa(error.message)); return; }
    setSeatMsg("席を移動しました。");
    await loadDetail(detail.check.id);
    await refreshState();
  }

  async function pay() {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止・入金前提）
    setMsg(null);
    const dtl = DETAIL_METHODS.has(payMethod) && payDetail.trim() ? payDetail.trim() : null;
    const { error } = await supabase.rpc("check_pay", {
      p_check_id: detail.check.id, p_method: payMethod, p_amount: payAmount,
      p_pay_group: payGroup || "A",
      p_tendered: payMethod === "cash" && payTendered ? Number(payTendered) : null,
      p_idem_key: crypto.randomUUID(),
      p_method_detail: dtl,
    });
    if (error && sessionLostIf(error)) return;
    setMsg(error ? error.message : "入金しました");
    setPayTendered(""); setPayDetail("");
    await loadDetail(detail.check.id);
  }

  async function closeCheck() {
    if (!detail) return;
    markAction();
    if (!(await tb.flush())) return; // money 系: 保留を先に確定（失敗＝中止・締め前提）
    setMsg(null);
    const { error } = await supabase.rpc("check_close", { p_check_id: detail.check.id, p_idem_key: crypto.randomUUID() });
    if (error) { if (!sessionLostIf(error)) setMsg(error.message); return; }
    setMsg(`会計完了 ${yen(detail.check.total)}`);
    // F4b: クローズ後のレシート印刷（printer 無効店は enqueue が 'printer disabled' を返す＝そのまま表示）
    const gs = Array.from(new Set(detail.lines.map((l) => l.pay_group))).sort();
    setPrintCard({ checkId: detail.check.id, groups: gs });
    setPrintMsg({});
    setDetail(null);
    await refreshState();
  }

  async function enqueuePrint(checkId: string, g: string) {
    markAction();
    const { data, error } = await supabase.rpc("print_enqueue", { p_check_id: checkId, p_pay_group: g });
    if (error) {
      if (sessionLostIf(error)) return;
      setPrintMsg((m) => ({ ...m, [g]: error.message.includes("printer disabled") ? "プリンタが無効です" : `失敗: ${error.message}` }));
      return;
    }
    const r = data as { is_reprint: boolean; already_queued: boolean };
    setPrintMsg((m) => ({
      ...m,
      [g]: r.already_queued ? "印刷待ちに追加済みです" : r.is_reprint ? "印刷します（再発行）" : "印刷します",
    }));
  }

  // 段B: 伝票詳細シート（≤900）の背景タップで閉じる＝保留を確定してから閉じる（失敗＝中止・シート維持）
  async function closeDetail() {
    if (!(await tb.flush())) return;
    setDetail(null);
  }

  // group 集計（register-board 写経・権威はサーバ＝check_pay/close が最終判定）
  const lines = detail?.lines ?? [];
  const payments = detail?.payments ?? [];
  const groups = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
  const groupInfo = groups.map((g) => {
    const gl = lines.filter((l) => l.pay_group === g);
    const bx = gl.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
    const disc = gl.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
    const net = Math.max(0, bx - disc);
    const due = detail ? groupDue(net, detail.check) : 0;
    const paid = payments.filter((p) => p.pay_group === g).reduce((a, p) => a + p.amount, 0);
    return { g, bx, disc, net, due, paid, remaining: Math.max(0, due - paid) };
  });

  const seats = state?.seats ?? [];
  const emptySeats = seats.filter((s) => !openBySeat(s.id));
  const idleMin = Math.floor((nowMs - lastActionRef.current) / 60_000);

  return (
    <main className="nox-dark" style={{ ...t.loginBg, minHeight: "100dvh", position: "relative", padding: 20 }}>
      <div style={{ maxWidth: phase === "register" ? 1100 : 720, margin: "0 auto", paddingTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ ...t.brand, fontSize: 24 }}>NOX</span>
          <span style={{ fontSize: 13, color: "var(--sub)" }}>レジ</span>
          {phase === "register" && session && (
            <>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--champ)", fontWeight: 700 }}>
                {session.name}（{ROLE_LABEL[session.role] ?? session.role}）
              </span>
              <span style={{ fontSize: 11.5, color: "var(--sub)" }}>
                無操作 <span style={t.num}>{Math.max(0, idleMin)}</span> 分（15分で自動ロック）
              </span>
              <button onClick={() => void operatorLogout()} style={btnLight}>交代／離席</button>
            </>
          )}
          {(phase === "operator" || phase === "pin" || phase === "denied") && (
            <button
              onClick={async () => { await supabase.auth.signOut(); setOperators([]); setPhase("login"); }}
              style={{ ...btnLight, marginLeft: "auto", opacity: 0.6 }}
            >
              端末ログアウト
            </button>
          )}
        </div>

        {phase === "loading" && <p style={{ textAlign: "center", color: "var(--sub)" }}>読み込み中…</p>}

        {phase === "login" && (
          <form onSubmit={doDeviceLogin} className="nox-lcardtop" style={{ ...t.lcard, maxWidth: 430, margin: "0 auto" }}>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>レジ端末ログイン</h1>
            <p style={{ ...t.sub, margin: "0 0 12px" }}>店に発行されたレジ端末アカウント（k-〜）でログインしてください。</p>
            <label style={t.fieldLabel}>ログインID</label>
            <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required autoComplete="username"
              style={{ ...t.input, marginTop: 5, marginBottom: 12 }} />
            <label style={t.fieldLabel}>パスワード</label>
            <input type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} required
              autoComplete="current-password" style={{ ...t.input, marginTop: 5 }} />
            {loginErr && <p style={{ color: "var(--bad)", fontSize: 12.5, margin: "10px 0 0" }}>{loginErr}</p>}
            <button type="submit" disabled={busy} style={{ ...t.btnGold, width: "100%", marginTop: 14, padding: "13px 0", fontSize: 15 }}>
              {busy ? "確認中…" : "ログイン"}
            </button>
          </form>
        )}

        {phase === "denied" && (
          <div className="nox-cardtop" style={{ ...card, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>このアカウントはレジ端末ではありません</p>
            <p style={{ ...t.sub, margin: 0 }}>レジ用の端末アカウント（オーナーがマスタ管理で用途「レジ」を発行）でログインし直してください。</p>
            <button onClick={async () => { await supabase.auth.signOut(); setPhase("login"); }}
              style={{ ...btnLight, marginTop: 14 }}>ログアウト</button>
          </div>
        )}

        {phase === "operator" && (
          <>
            <p style={{ textAlign: "center", fontSize: 15, color: "var(--champ)", fontWeight: 700, margin: "0 0 8px" }}>
              操作担当を選んでください
            </p>
            {lockMsg && <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--sub)", margin: "0 0 14px" }}>{lockMsg}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {operators.map((o) => (
                <button key={o.membership_id} onClick={() => pickOperator(o)} disabled={!o.has_pin}
                  style={{ ...bigBtn, opacity: o.has_pin ? 1 : 0.35, cursor: o.has_pin ? "pointer" : "not-allowed" }}>
                  {o.user_name}
                  <div style={{ fontSize: 11, color: "var(--sub)", fontWeight: 600, marginTop: 4 }}>
                    {ROLE_LABEL[o.role] ?? o.role}{!o.has_pin ? "・PIN未設定" : ""}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "pin" && target && (
          <div style={{ maxWidth: 380, margin: "0 auto" }}>
            <p style={{ textAlign: "center", fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{target.user_name}</p>
            <p style={{ textAlign: "center", ...t.sub, margin: "0 0 14px" }}>PIN（4桁）を入力してください</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 18 }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{
                  width: 18, height: 18, borderRadius: 999,
                  border: "1px solid var(--line2)",
                  background: i < pin.length ? "var(--gold)" : "transparent",
                }} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} style={keyBtn} onClick={() => keyIn(d)}>{d}</button>
              ))}
              <button style={{ ...keyBtn, fontSize: 15, color: "var(--sub)" }} onClick={() => setPin("")}>クリア</button>
              <button style={keyBtn} onClick={() => keyIn("0")}>0</button>
              <button style={{ ...keyBtn, fontSize: 20, color: "var(--sub)" }} onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
            </div>
            {pinMsg && <p style={{ textAlign: "center", color: "var(--bad)", fontSize: 13, fontWeight: 700, margin: "12px 0 0" }}>{pinMsg}</p>}
            <button disabled={pin.length !== 4 || busy} onClick={() => void doPinLogin()}
              style={{ ...t.btnGold, width: "100%", marginTop: 16, padding: "16px 0", fontSize: 18, fontWeight: 900, borderRadius: 14, opacity: pin.length === 4 ? 1 : 0.4 }}>
              ログイン
            </button>
            <button onClick={() => { setTarget(null); setPin(""); setPhase("operator"); }}
              style={{ ...btnLight, marginTop: 12, width: "100%" }}>もどる</button>
          </div>
        )}

        {phase === "register" && (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {printCard && (
              <section className="nox-cardtop" style={{ ...card, width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: 0 }}>
                    レシート印刷（伝票 {printCard.checkId.replace(/-/g, "").slice(0, 8)}）
                  </h2>
                  {printCard.groups.map((g) => (
                    <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button style={btnDark} onClick={() => void enqueuePrint(printCard.checkId, g)}>
                        {printCard.groups.length > 1 ? `グループ${g} を印刷` : "レシート印刷"}
                      </button>
                      {printMsg[g] && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 9px",
                          color: printMsg[g].startsWith("失敗") || printMsg[g].includes("無効") ? "var(--bad)" : "#C9A24A",
                          background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
                        }}>{printMsg[g]}</span>
                      )}
                    </span>
                  ))}
                  <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => setPrintCard(null)}>閉じる</button>
                </div>
              </section>
            )}

            {/* 卓一覧（state.checks＝0059。更新ボタン＝操作起点の再読取・自動ポーリングはしない） */}
            <section className="nox-cardtop" style={{ ...card, width: 220 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <h2 style={{ ...t.cardTitle, margin: 0 }}>卓</h2>
                <button onClick={() => { markAction(); void refreshState(); }} style={{ ...btnLight, marginLeft: "auto", padding: "2px 9px", fontSize: 11.5 }}>更新</button>
              </div>
              <div style={{ marginTop: 8 }}>
                {seats.map((s) => {
                  const oc = openBySeat(s.id);
                  const isPrimary = oc?.seat_id === s.id;
                  const hostName = oc && !isPrimary ? seats.find((h) => h.id === oc.seat_id)?.name ?? "他卓" : null;
                  return (
                    <button
                      key={s.id}
                      onClick={() => void openSeat(s)}
                      style={{
                        ...btnLight, display: "block", width: "100%", textAlign: "left", marginBottom: 8,
                        borderColor: detail?.check.seat_id === s.id ? "var(--gold)" : oc ? "var(--champ)" : "var(--line2)",
                        color: detail?.check.seat_id === s.id ? "var(--champ)" : "var(--ink)",
                      }}
                    >
                      {s.name} {s.kind ? `(${s.kind})` : ""}{" "}
                      {oc ? (isPrimary ? "● 使用中" : `● ${hostName} と同一会計`) : "空"}
                    </button>
                  );
                })}
              </div>
              {msg && <p style={{ fontSize: 12, color: "var(--sub)" }}>{msg}</p>}
            </section>

            {/* 伝票（読取は 0059 detail・≤900px はボトムシート＝段A nox-sheet-up 流用／>900px は現行 inline を 1px 不変で維持） */}
            {detail && (
              <>
              <div className="nox-detail-backdrop" onClick={() => void closeDetail()} aria-hidden="true" />
              <div className="nox-detailwrap">
                <div className="nox-detail-handle" aria-hidden="true" />
                <section>
                <div className="nox-cardtop" style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--champ)", margin: 0 }}>
                      伝票（{seats.find((s) => s.id === detail.check.seat_id)?.name ?? "—"}）
                    </h2>
                    <span style={{ fontSize: 13, color: "var(--sub)" }}>{NOM_LABEL[detail.check.nom_type]}</span>
                    {detail.check.status === "open" && (
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>滞在 <span style={t.num}>{elapsedMin(detail.check.started_at, nowMs)}</span> 分</span>
                    )}
                    <span style={{ ...t.num, marginLeft: "auto", fontSize: 18, fontWeight: 700, color: "var(--champ)" }}>{yen(detail.check.total)}</span>
                    {/* 取消（void）はレジ端末に出さない＝裁定11 確定①（責任者操作） */}
                  </div>
                </div>

                {/* 指名 */}
                <div className="nox-cardtop" style={card}>
                  <h3 style={t.cardTitle}>指名（重み比で分配）</h3>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={nomType} onChange={(e) => setNomType(e.target.value)} style={input}>
                      <option value="hon">本指名</option>
                      <option value="jonai">場内</option>
                      <option value="dohan">同伴</option>
                      <option value="free">フリー</option>
                    </select>
                    {/* 段B: cast チップ化（タップで選択トグル・重みは選択時のみ inline input＝データ形 nomWeights は不変） */}
                    {(state?.casts ?? []).map((ca) => {
                      const w = nomWeights[ca.id] ?? 0;
                      const on = w > 0;
                      return (
                        <span key={ca.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <button
                            type="button"
                            className={on ? "nox-chip on" : "nox-chip"}
                            onClick={() => setNomWeights((prev) => ({ ...prev, [ca.id]: on ? 0 : 1 }))}
                          >
                            {ca.name}
                          </button>
                          {on && nomType !== "free" && (
                            <input
                              type="number" min={1} value={w} aria-label={`${ca.name} 重み`}
                              onChange={(e) => setNomWeights((prev) => ({ ...prev, [ca.id]: Number(e.target.value) }))}
                              style={{ ...input, width: 46, padding: "6px 6px" }}
                            />
                          )}
                        </span>
                      );
                    })}
                    <button onClick={() => void saveNoms()} style={btnDark}>保存</button>
                  </div>
                </div>

                {/* B1/B2 席（相席・席移動）＝open のみ。kiosk は予約が読めない＝soft 警告なし（拒否系は RPC） */}
                {detail.check.status === "open" && (
                  <div className="nox-cardtop" style={card}>
                    <h3 style={t.cardTitle}>席</h3>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>現在</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--champ)" }}>
                        {seats.find((s) => s.id === detail.check.seat_id)?.name ?? "—"}
                        <span style={{ fontSize: 11, color: "var(--sub)", fontWeight: 400 }}> （主席）</span>
                      </span>
                      {detail.extra_seat_ids.map((sid) => (
                        <span key={sid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--ink)" }}>
                          ＋{seats.find((s) => s.id === sid)?.name ?? "他卓"}（同一会計）
                          <button onClick={() => void removeSeat(sid)} title="相席を解除"
                            style={{ ...btnLight, padding: "1px 7px", fontSize: 12, color: "var(--bad)", borderColor: "var(--bad)" }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value="" onChange={(e) => { if (e.target.value) void addSeat(e.target.value); }} style={{ ...input, maxWidth: 200 }}>
                        <option value="">相席（同一会計）に席を追加</option>
                        {emptySeats.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>)}
                      </select>
                      <select value="" onChange={(e) => { if (e.target.value) void moveSeat(e.target.value); }} style={{ ...input, maxWidth: 200 }}>
                        <option value="">席移動（移動先を選択）</option>
                        {emptySeats.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind ? `（${s.kind}）` : ""}</option>)}
                      </select>
                    </div>
                    {seatMsg && <p style={{ fontSize: 12, fontWeight: 700, color: seatMsg.includes("できません") || seatMsg.includes("使用中") || seatMsg.includes("無効") || seatMsg.includes("同じ席") ? "var(--bad)" : "var(--sub)", margin: "8px 0 0" }}>{seatMsg}</p>}
                  </div>
                )}

                {/* B4 時間制（自動）＝time_mode='auto' かつ open。内訳は返値 jsonb（0059 は料金表スナップ非開示） */}
                {detail.time_mode === "auto" && detail.check.status === "open" && (
                  <div className="nox-cardtop" style={card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <h3 style={{ ...t.cardTitle, margin: 0 }}>時間料金（自動）</h3>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>
                        経過 <span style={t.num}>{Math.max(0, Math.floor((nowMs - new Date(detail.check.started_at).getTime()) / 60000))}</span> 分
                        （着席 {new Date(detail.check.started_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）
                      </span>
                    </div>
                    <button onClick={() => void applyTimeCharge()} style={{ ...btnDark, marginTop: 8 }} disabled={payments.length > 0}
                      title={payments.length > 0 ? "入金後は反映できません" : ""}>
                      時間料金を明細へ反映／更新
                    </button>
                    {timeCalc && (
                      <p style={{ fontSize: 12, color: "var(--ink)", margin: "10px 0 0" }}>
                        経過 <span style={t.num}>{timeCalc.elapsed_min}</span> 分・単位 <span style={t.num}>{timeCalc.units}</span>・
                        延長 <span style={t.num}>{timeCalc.blocks}</span> 回 → セット <span style={t.num}>{yen(timeCalc.set_c)}</span>＋
                        延長 <span style={t.num}>{yen(timeCalc.ext_c)}</span> ＝ 合計 <span style={{ ...t.num, fontWeight: 700, color: "var(--champ)" }}>{yen(timeCalc.total)}</span>
                      </p>
                    )}
                    {timeMsg && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "8px 0 0" }}>{timeMsg}</p>}
                  </div>
                )}

                {/* 明細追加 */}
                <div className="nox-cardtop" style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <h3 style={{ ...t.cardTitle, margin: 0 }}>商品（タップで追加）</h3>
                    <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: "auto" }}>伝票グループ</span>
                    <input value={prodGroup} onChange={(e) => setProdGroup(e.target.value)} aria-label="伝票グループ" style={{ ...input, width: 40 }} />
                  </div>
                  {/* type 別（drink/champ/bottle）タイル。タップ＝連打束ね（700ms・p_qty=N の1行）。バッジ=pre-commit。 */}
                  {TYPE_ORDER.map((ty) => {
                    const items = (state?.products ?? []).filter((p) => p.type === ty);
                    if (items.length === 0) return null;
                    return (
                      <div key={ty} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--sub)", margin: "0 0 6px" }}>{TYPE_LABEL[ty]}</div>
                        <div className="nox-tilegrid">
                          {items.map((p) => {
                            const n = tb.badgeOf(p.id);
                            return (
                              <button key={p.id} type="button" className="nox-tile" onClick={() => tb.tap(p.id)}>
                                {n > 0 && <span className="nox-tile-badge">+{n}</span>}
                                <span className="nox-tile-name">{p.name}</span>
                                <span className="nox-tile-price">{yen(p.price)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {(state?.products ?? []).length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>商品が未登録です。</p>}
                  {/* カスタム明細（kind/名称/価格）＝据置 */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                    <select value={cKind} onChange={(e) => setCKind(e.target.value)} style={input}>
                      <option value="set">セット</option>
                      <option value="time">延長</option>
                      <option value="charge">料金</option>
                      <option value="custom">その他</option>
                    </select>
                    <input placeholder="名称（例 セット60分）" value={cName} onChange={(e) => setCName(e.target.value)} style={{ ...input, width: 170 }} />
                    <input type="number" min={0} value={cPrice} onChange={(e) => setCPrice(Number(e.target.value))} style={{ ...input, width: 90 }} />
                    <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
                    <input value={cGroup} onChange={(e) => setCGroup(e.target.value)} style={{ ...input, width: 40 }} />
                    <button onClick={() => void addCustomLine()} style={btnDark}>追加</button>
                  </div>
                </div>

                {/* 明細 */}
                <div className="nox-cardtop" style={card}>
                  <h3 style={t.cardTitle}>明細</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <tbody>
                      {lines.map((l) => {
                        const isDisc = l.kind === "discount"; // 承認割引（責任者画面で適用されたもの＝表示のみ）
                        return (
                          <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: 6, color: "var(--sub)" }}>[{l.pay_group}]</td>
                            <td style={{ padding: 6, color: isDisc ? "var(--bad)" : "var(--ink)" }}>{l.name_snapshot}</td>
                            <td style={{ ...t.num, padding: 6, textAlign: "right", color: "var(--sub)" }}>{isDisc ? "" : `${yen(l.unit_price_snapshot)} × ${l.qty}`}</td>
                            <td style={{ ...t.num, padding: 6, textAlign: "right", color: isDisc ? "var(--bad)" : "var(--ink)" }}>
                              {isDisc ? `−${yen(l.line_total)}` : yen(l.line_total)}
                            </td>
                            <td style={{ padding: 6 }}>
                              {isDisc ? (
                                <span style={{ fontSize: 11, color: "var(--sub)" }}>承認割引</span>
                              ) : (
                                <button
                                  onClick={() => void removeLine(l.id)}
                                  disabled={payments.length > 0 || detail.check.status !== "open"}
                                  title={payments.length > 0 ? "入金後の訂正は責任者へ" : ""}
                                  style={{ ...btnLight, padding: "2px 8px", fontSize: 12 }}
                                >
                                  削除
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 会計（割引・無料の申請/適用は責任者画面のみ＝裁定11 確定②） */}
                <div className="nox-cardtop" style={card}>
                  <h3 style={t.cardTitle}>会計（伝票グループ別）</h3>
                  <table style={{ borderCollapse: "collapse", fontSize: 13, marginBottom: 10 }}>
                    <thead>
                      <tr>
                        <th style={t.th}>伝票</th>
                        <th style={t.th}>小計</th>
                        <th style={t.th}>割引</th>
                        <th style={t.th}>請求（サ料込）</th>
                        <th style={t.th}>入金済</th>
                        <th style={t.th}>残額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupInfo.map((gi) => (
                        <tr key={gi.g}>
                          <td style={t.td}>{gi.g}</td>
                          <td style={{ ...t.td, ...t.num }}>{yen(gi.bx)}</td>
                          <td style={{ ...t.td, ...t.num, color: gi.disc > 0 ? "var(--bad)" : "var(--sub)" }}>{gi.disc > 0 ? `−${yen(gi.disc)}` : "—"}</td>
                          <td style={{ ...t.td, ...t.num, fontWeight: 700, color: "var(--champ)" }}>{yen(gi.due)}</td>
                          <td style={{ ...t.td, ...t.num }}>{yen(gi.paid)}</td>
                          <td style={{ ...t.td, ...t.num, color: gi.remaining > 0 ? "var(--bad)" : "var(--ok)" }}>{yen(gi.remaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.check.status === "open" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
                      <input value={payGroup} onChange={(e) => setPayGroup(e.target.value)} style={{ ...input, width: 40 }} />
                      <select
                        value={payMethod}
                        onChange={(e) => { setPayMethod(e.target.value); if (!DETAIL_METHODS.has(e.target.value)) setPayDetail(""); }}
                        style={input}
                      >
                        {Object.entries(METHOD_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={1} value={payAmount}
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        style={{ ...input, width: 110 }}
                      />
                      {payMethod === "cash" && (
                        <input placeholder="お預かり" value={payTendered}
                          onChange={(e) => setPayTendered(e.target.value)} style={{ ...input, width: 100 }} />
                      )}
                      {DETAIL_METHODS.has(payMethod) && (
                        <input placeholder="内訳（任意）例: stera端末 / PayPay" value={payDetail} maxLength={50}
                          onChange={(e) => setPayDetail(e.target.value)} style={{ ...input, width: 200 }} />
                      )}
                      <button onClick={() => void pay()} style={btnDark}>入金</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {payments.map((p) => (
                      <span key={p.id} style={{ ...t.num, fontSize: 12, color: "var(--sub)" }}>
                        [{p.pay_group}] {METHOD_LABEL[p.method]}{p.method_detail ? `（${p.method_detail}）` : ""} {yen(p.amount)}
                        {p.tendered != null ? `（預 ${yen(p.tendered)}・釣 ${yen(p.tendered - p.amount)}）` : ""}
                      </span>
                    ))}
                  </div>
                  {detail.check.status === "open" && (
                    <button
                      onClick={() => void closeCheck()}
                      disabled={groups.length === 0 || groupInfo.some((gi) => gi.paid < gi.due)}
                      style={{ ...t.btnGold, marginTop: 12, padding: "12px 26px", fontSize: 15, fontWeight: 800,
                               opacity: groups.length === 0 || groupInfo.some((gi) => gi.paid < gi.due) ? 0.4 : 1 }}
                    >
                      会計を締める（クローズ）
                    </button>
                  )}
                </div>
                </section>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
