"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupDue } from "@/lib/nox/check-calc";
import * as t from "@/lib/nox/ui/theme";
import ReservationPanel from "./reservation-panel";

type Seat = { id: string; name: string; kind: string | null; store_id: string };
type Product = { id: string; name: string; type: string; price: number };
type Cast = { id: string; name: string };

type CheckRow = {
  id: string;
  seat_id: string;
  status: string;
  people: number | null;
  nom_type: string;
  total: number;
  service_rate: number;
  round_unit: number;
  round_mode: string;
};
type Line = {
  id: string;
  kind: string;
  pay_group: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
};
type Payment = { id: string; pay_group: string; method: string; amount: number; tendered: number | null };
type Nom = { cast_id: string; ratio_weight: number };
// F3c 二重承認（approvals・mig0035/0036）
type Approval = {
  id: string; pay_group: string; type: string; amount: number; status: string;
  reason: string | null; requested_by: string; created_at: string;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const METHOD_LABEL: Record<string, string> = { cash: "現金", card: "カード", ar: "売掛", other: "その他" };
const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };
const AP_STATUS_LABEL: Record<string, string> = { pending: "承認待ち", approved: "承認済", rejected: "却下" };
const AP_STATUS_COLOR: Record<string, string> = { pending: "var(--gold2)", approved: "var(--ok)", rejected: "var(--sub)" };

// approval RPC エラーの日本語化（F3c）
function apErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("amount exceeds group total")) return "割引額が対象伝票の小計を超えています";
  if (msg.includes("no group total")) return "対象伝票に割引できる金額がありません";
  if (msg.includes("no such group")) return "対象の伝票グループが存在しません";
  if (msg.includes("not applicable")) return "承認前に伝票が締められたため適用できません";
  if (msg.includes("not open")) return "この伝票は締められています（申請できません）";
  if (msg.includes("already decided")) return "この申請は処理済みです";
  if (msg.includes("bad type")) return "種別が不正です";
  if (msg.includes("bad amount")) return "割引額の指定が不正です";
  if (msg.includes("bad reason")) return "理由は200字以内で入力してください";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto" };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function RegisterBoard({
  seats, products, casts, isManagerUp, showReserve, storeId,
}: {
  seats: Seat[]; products: Product[]; casts: Cast[]; isManagerUp: boolean;
  showReserve: boolean; storeId: string;
}) {
  const supabase = createClient();
  // タブ（canonical の register セグメント。顧客・ボトルタブは顧客 UI 実装時に追加）
  const [tab, setTab] = useState<"tables" | "reserve">("tables");
  const [openMap, setOpenMap] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<CheckRow | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [noms, setNoms] = useState<Nom[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // フォーム状態
  const [nomType, setNomType] = useState("hon");
  const [nomWeights, setNomWeights] = useState<Record<string, number>>({});
  const [prodId, setProdId] = useState("");
  const [prodQty, setProdQty] = useState(1);
  const [prodGroup, setProdGroup] = useState("A");
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState(0);
  const [cKind, setCKind] = useState("set");
  const [cGroup, setCGroup] = useState("A");
  const [payGroup, setPayGroup] = useState("A");
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState(0);
  const [payTendered, setPayTendered] = useState("");
  // F3c: 割引/無料 申請・適用フォーム
  const [apType, setApType] = useState<"discount" | "free">("discount");
  const [apGroup, setApGroup] = useState("A");
  const [apAmount, setApAmount] = useState(0);
  const [apReason, setApReason] = useState("");

  const loadOpenMap = useCallback(async () => {
    const { data } = await supabase.from("checks").select("id, seat_id").eq("status", "open");
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.seat_id as string] = r.id as string;
    setOpenMap(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCheck = useCallback(async (checkId: string) => {
    const { data: c } = await supabase.from("checks").select("*").eq("id", checkId).single();
    const { data: ls } = await supabase
      .from("check_lines").select("id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total")
      .eq("check_id", checkId).order("sort_order");
    const { data: ps } = await supabase
      .from("payments").select("id, pay_group, method, amount, tendered").eq("check_id", checkId).order("paid_at");
    const { data: ns } = await supabase
      .from("check_nominations").select("cast_id, ratio_weight").eq("check_id", checkId).order("position");
    const { data: aps } = await supabase
      .from("approvals").select("id, pay_group, type, amount, status, reason, requested_by, created_at")
      .eq("check_id", checkId).order("created_at", { ascending: false });
    setCheck(c as CheckRow);
    setLines((ls ?? []) as Line[]);
    setPayments((ps ?? []) as Payment[]);
    setNoms((ns ?? []) as Nom[]);
    setApprovals((aps ?? []) as Approval[]);
    if (c) {
      setNomType((c as CheckRow).nom_type);
      const w: Record<string, number> = {};
      for (const n of (ns ?? []) as Nom[]) w[n.cast_id] = n.ratio_weight;
      setNomWeights(w);
      // 割引申請の既定 group＝この伝票に存在する最初の pay_group（分割会計対応）
      setApGroup(Array.from(new Set(((ls ?? []) as Line[]).map((l) => l.pay_group))).sort()[0] ?? "A");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadOpenMap(); }, [loadOpenMap]);

  async function openSeat(seat: Seat) {
    setMsg(null);
    const existing = openMap[seat.id];
    if (existing) { await loadCheck(existing); return; }
    const { data, error } = await supabase.rpc("check_open", { p_seat_id: seat.id, p_people: null, p_nom_type: "free" });
    if (error) { setMsg(error.message); return; }
    await loadOpenMap();
    await loadCheck(data as string);
  }

  async function saveNoms() {
    if (!check) return;
    setMsg(null);
    const list = Object.entries(nomWeights)
      .filter(([, w]) => w > 0)
      .map(([cast_id, weight]) => ({ cast_id, weight }));
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: check.id, p_nom_type: nomType, p_nominations: list,
    });
    setMsg(error ? error.message : "指名を保存しました");
    await loadCheck(check.id);
  }

  async function addProductLine() {
    if (!check || !prodId) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: prodId, p_qty: prodQty, p_kind: null,
      p_pay_group: prodGroup || "A", p_name: null, p_unit_price: null,
    });
    setMsg(error ? error.message : null);
    await loadCheck(check.id);
  }

  async function addCustomLine() {
    if (!check || !cName) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: null, p_qty: 1, p_kind: cKind,
      p_pay_group: cGroup || "A", p_name: cName, p_unit_price: cPrice,
    });
    setMsg(error ? error.message : null);
    setCName(""); setCPrice(0);
    await loadCheck(check.id);
  }

  async function removeLine(lineId: string) {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_remove_line", { p_line_id: lineId });
    setMsg(error ? error.message : null);
    await loadCheck(check.id);
  }

  async function pay() {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_pay", {
      p_check_id: check.id, p_method: payMethod, p_amount: payAmount,
      p_pay_group: payGroup || "A",
      p_tendered: payMethod === "cash" && payTendered ? Number(payTendered) : null,
      p_idem_key: crypto.randomUUID(),
    });
    setMsg(error ? error.message : "入金しました");
    setPayTendered("");
    await loadCheck(check.id);
  }

  async function closeCheck() {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_close", { p_check_id: check.id, p_idem_key: crypto.randomUUID() });
    if (error) { setMsg(error.message); return; }
    setMsg(`会計完了 ${yen(check.total)}`);
    setCheck(null);
    await loadOpenMap();
  }

  async function voidCheck() {
    if (!check) return;
    const reason = window.prompt("取消理由を入力してください");
    if (!reason) return;
    const { error } = await supabase.rpc("check_void", { p_check_id: check.id, p_reason: reason });
    if (error) { setMsg(error.message); return; }
    setMsg("伝票を取消しました");
    setCheck(null);
    await loadOpenMap();
  }

  // F3c: 割引/無料 申請（黒服 can_register）・適用（owner/manager 直接）
  async function requestOrApply() {
    if (!check) return;
    setMsg(null);
    const rpc = isManagerUp ? "approval_direct" : "approval_request";
    const { error } = await supabase.rpc(rpc, {
      p_check_id: check.id, p_pay_group: apGroup, p_type: apType,
      p_amount: apType === "discount" ? apAmount : null,
      p_reason: apReason.trim() || null,
    });
    if (error) { setMsg(`${isManagerUp ? "適用" : "申請"}に失敗: ${apErrJa(error.message)}`); return; }
    setMsg(isManagerUp ? "割引/無料を適用しました" : "割引/無料を申請しました（承認待ち）");
    setApAmount(0); setApReason("");
    await loadCheck(check.id);
  }

  // F3c: 承認/却下（owner/manager のみ）
  async function decide(approvalId: string, approve: boolean) {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("approval_decide", { p_approval_id: approvalId, p_approve: approve });
    if (error) { setMsg(`${approve ? "承認" : "却下"}に失敗: ${apErrJa(error.message)}`); return; }
    setMsg(approve ? "承認しました（伝票に反映）" : "却下しました");
    await loadCheck(check.id);
  }

  // group 集計（表示用・権威はサーバ＝check_pay/close が最終判定）
  // ★F3c: discount line（kind='discount'・正の値）を小計から減算＝改修 check_group_due と同一規則。
  const groups = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
  const groupInfo = groups.map((g) => {
    const gl = lines.filter((l) => l.pay_group === g);
    const bx = gl.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
    const disc = gl.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
    const net = Math.max(0, bx - disc);
    const due = check ? groupDue(net, check) : 0;
    const paid = payments.filter((p) => p.pay_group === g).reduce((a, p) => a + p.amount, 0);
    return { g, bx, disc, net, due, paid, remaining: Math.max(0, due - paid) };
  });
  const allCovered = groups.length > 0 && groupInfo.every((gi) => gi.paid >= gi.due);
  // 割引申請フォームの上限＝選択 group の割引前小計（既存 discount を除いた bx）
  const apGroupBx = groupInfo.find((gi) => gi.g === apGroup)?.bx ?? 0;

  // タブセグメント（canonical の .seg 相当を inline で）
  const segBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "9px 10px",
    borderRadius: 9, cursor: "pointer",
    border: on ? "1px solid var(--gold)" : "1px solid var(--line2)",
    background: on ? "linear-gradient(135deg,#1F1B12,#14120C)" : "transparent",
    color: on ? "var(--champ)" : "var(--sub)",
  });

  return (
    <div>
      {showReserve && (
        <div className="nox-cardtop" style={{ ...card, padding: 11 }}>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 480 }}>
            {/* 会計タブへ戻るとき openMap を再読込（予約タブの to_check で開いた伝票を反映） */}
            <button style={segBtn(tab === "tables")} onClick={() => { setTab("tables"); void loadOpenMap(); }}>卓席・会計</button>
            <button style={segBtn(tab === "reserve")} onClick={() => setTab("reserve")}>予約</button>
          </div>
        </div>
      )}

      {tab === "reserve" && showReserve ? (
        <ReservationPanel storeId={storeId} seats={seats} casts={casts} />
      ) : (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* 卓一覧 */}
      <section className="nox-cardtop" style={{ ...card, width: 220 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>卓</h2>
        {seats.map((s) => (
          <button
            key={s.id}
            onClick={() => openSeat(s)}
            style={{
              ...btnLight, display: "block", width: "100%", textAlign: "left", marginBottom: 8,
              borderColor: check?.seat_id === s.id ? "var(--gold)" : openMap[s.id] ? "var(--champ)" : "var(--line2)",
              color: check?.seat_id === s.id ? "var(--champ)" : "var(--ink)",
            }}
          >
            {s.name} {s.kind ? `(${s.kind})` : ""} {openMap[s.id] ? "● 使用中" : "空"}
          </button>
        ))}
        {msg && <p style={{ fontSize: 12, color: "var(--sub)" }}>{msg}</p>}
      </section>

      {/* 伝票 */}
      {check && (
        <section style={{ flex: 1, minWidth: 480 }}>
          <div className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--champ)", margin: 0 }}>
                伝票（{seats.find((s) => s.id === check.seat_id)?.name}）
              </h2>
              <span style={{ fontSize: 13, color: "var(--sub)" }}>{NOM_LABEL[check.nom_type]}</span>
              <span style={{ ...t.num, marginLeft: "auto", fontSize: 18, fontWeight: 700, color: "var(--champ)" }}>{yen(check.total)}</span>
              {/* void は manager 以上のみ表示（RPC 側でも owner/manager を強制＝二重） */}
              {isManagerUp && (
                <button onClick={voidCheck} style={{ ...btnLight, color: "var(--bad)", borderColor: "var(--bad)" }}>
                  取消
                </button>
              )}
            </div>
          </div>

          {/* 指名 */}
          <div className="nox-cardtop" style={card}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>指名（重み比で分配）</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={nomType} onChange={(e) => setNomType(e.target.value)} style={input}>
                <option value="hon">本指名</option>
                <option value="jonai">場内</option>
                <option value="dohan">同伴</option>
                <option value="free">フリー</option>
              </select>
              {casts.map((ca) => (
                <label key={ca.id} style={{ fontSize: 13, color: "var(--ink)", display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={(nomWeights[ca.id] ?? 0) > 0}
                    onChange={(e) =>
                      setNomWeights((w) => ({ ...w, [ca.id]: e.target.checked ? 1 : 0 }))
                    }
                  />
                  {ca.name}
                  {(nomWeights[ca.id] ?? 0) > 0 && nomType !== "free" && (
                    <input
                      type="number"
                      min={1}
                      value={nomWeights[ca.id]}
                      onChange={(e) => setNomWeights((w) => ({ ...w, [ca.id]: Number(e.target.value) }))}
                      style={{ ...input, width: 52 }}
                    />
                  )}
                </label>
              ))}
              <button onClick={saveNoms} style={btnDark}>保存</button>
            </div>
          </div>

          {/* 明細追加 */}
          <div className="nox-cardtop" style={card}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>明細追加</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <select value={prodId} onChange={(e) => setProdId(e.target.value)} style={{ ...input, maxWidth: 220 }}>
                <option value="">商品を選択</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{yen(p.price)}）
                  </option>
                ))}
              </select>
              <input type="number" min={1} value={prodQty} onChange={(e) => setProdQty(Number(e.target.value))} style={{ ...input, width: 60 }} />
              <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
              <input value={prodGroup} onChange={(e) => setProdGroup(e.target.value)} style={{ ...input, width: 40 }} />
              <button onClick={addProductLine} style={btnDark}>追加</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
              <button onClick={addCustomLine} style={btnDark}>追加</button>
            </div>
          </div>

          {/* 明細 */}
          <div className="nox-cardtop" style={card}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>明細</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {lines.map((l) => {
                  const isDisc = l.kind === "discount"; // ★F3c: 承認割引（正の値・表示は −・削除不可＝承認経由のみ）
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
                            onClick={() => removeLine(l.id)}
                            disabled={payments.length > 0}
                            title={payments.length > 0 ? "入金後の訂正は取消（void）で" : ""}
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

          {/* 割引・無料（承認ワークフロー・F3c） */}
          <div className="nox-cardtop" style={card}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>
              割引・無料（{isManagerUp ? "適用・承認" : "申請"}）
            </h3>
            {/* 申請（黒服 can_register）／適用（owner/manager 直接）フォーム */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <select value={apType} onChange={(e) => setApType(e.target.value as "discount" | "free")} style={input}>
                <option value="discount">割引</option>
                <option value="free">無料</option>
              </select>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
              <select value={apGroup} onChange={(e) => setApGroup(e.target.value)} style={{ ...input, width: 60 }}>
                {(groups.length ? groups : ["A"]).map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {apType === "discount" && (
                <>
                  <input
                    type="number" min={1} max={apGroupBx || undefined} value={apAmount}
                    onChange={(e) => setApAmount(Number(e.target.value))} placeholder="割引額"
                    style={{ ...input, width: 100 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--sub)" }}>上限 {yen(apGroupBx)}</span>
                </>
              )}
              <input
                value={apReason} onChange={(e) => setApReason(e.target.value)}
                placeholder="理由（任意）" maxLength={200} style={{ ...input, width: 160 }}
              />
              <button
                onClick={requestOrApply}
                disabled={apType === "discount" && (apAmount <= 0 || apAmount > apGroupBx)}
                style={{ ...btnDark, opacity: apType === "discount" && (apAmount <= 0 || apAmount > apGroupBx) ? 0.4 : 1 }}
              >
                {isManagerUp ? "適用" : "申請"}
              </button>
            </div>
            {/* この伝票の申請一覧（pending は owner/manager が承認/却下・staff は閲覧のみ） */}
            {approvals.length === 0
              ? <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>申請はありません。</p>
              : approvals.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 12.5 }}>
                    <span style={{ color: "var(--sub)" }}>[{a.pay_group}]</span>
                    <span style={{ color: "var(--ink)" }}>{a.type === "free" ? "無料" : "割引"} <span style={t.num}>{yen(a.amount)}</span></span>
                    {a.reason && <span style={{ color: "var(--sub)" }}>（{a.reason}）</span>}
                    <span style={{ marginLeft: "auto", fontWeight: 700, color: AP_STATUS_COLOR[a.status] ?? "var(--sub)" }}>
                      {AP_STATUS_LABEL[a.status] ?? a.status}
                    </span>
                    {a.status === "pending" && isManagerUp && (
                      <span style={{ display: "flex", gap: 6 }}>
                        <button style={btnDark} onClick={() => decide(a.id, true)}>承認</button>
                        <button style={btnLight} onClick={() => decide(a.id, false)}>却下</button>
                      </span>
                    )}
                  </div>
                ))}
          </div>

          {/* 会計 */}
          <div className="nox-cardtop" style={card}>
            <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" }}>会計（伝票グループ別）</h3>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>伝票</span>
              <input value={payGroup} onChange={(e) => setPayGroup(e.target.value)} style={{ ...input, width: 40 }} />
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={input}>
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
                <input
                  placeholder="お預かり" value={payTendered}
                  onChange={(e) => setPayTendered(e.target.value)}
                  style={{ ...input, width: 100 }}
                />
              )}
              <button onClick={pay} style={btnDark}>入金</button>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {payments.map((p) => (
                <span key={p.id} style={{ ...t.num, fontSize: 12, color: "var(--sub)" }}>
                  [{p.pay_group}] {METHOD_LABEL[p.method]} {yen(p.amount)}
                  {p.tendered != null ? `（預 ${yen(p.tendered)}・釣 ${yen(p.tendered - p.amount)}）` : ""}
                </span>
              ))}
            </div>
            <button
              onClick={closeCheck}
              disabled={!allCovered}
              style={{ ...btnDark, marginTop: 10, padding: "10px 28px", opacity: allCovered ? 1 : 0.4 }}
            >
              会計完了（close）
            </button>
          </div>
        </section>
      )}
      {!check && <p style={{ fontSize: 13, color: "var(--sub)", padding: 16 }}>卓を選択してください。</p>}
    </div>
      )}
    </div>
  );
}
