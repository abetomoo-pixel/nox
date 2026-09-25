"use client";

// 紹介者マスタ＋紹介料の支払一覧（mig0152・裁定280-2／292-3／298-5／298-6／298-7／299・2026-09-25）。
//
// ★送る RPC と引数:
//   set_referrer(p_id, p_store_id, p_kind, p_membership_id, p_name, p_contact, p_withholding_category, p_is_active)＝8 引数・p_is_active は明示 boolean（原則7）
//   referral_payouts_unpaid(p_store_id, p_from, p_to)＝未払一覧（読取・ゲート内蔵）
//   referral_payout_pay(p_payout_id, p_paid_via, p_idem_key)／referral_payouts_pay_bulk(p_payout_ids, p_paid_via, p_idem_key)＝支払確定（源泉は DB が支払時に確定＝298-7）
// ★同名の紹介者は許す（298-5 D6）＝保存は止めず警告だけ出す。cast には導線なし（master/layout の入口ガード＋RLS cast 0 行）。
// ★メッセージは裁定281 の共通部品（Message）＝操作の近く・残留なし。
import { useMemo, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";

export type Referrer = { id: string; kind: string; membership_id: string | null; name: string; contact: string | null; withholding_category: string; is_active: boolean };
export type MemberOpt = { id: string; role: string; name: string };
type Unpaid = { payout_id: string; referrer_id: string; referrer_name: string; referrer_kind: string; withholding_category: string; check_id: string; biz_date: string; amount: number };

const KINDS: ReadonlyArray<readonly [string, string]> = [["external", "外部"], ["staff", "スタッフ"]];
const WH: ReadonlyArray<readonly [string, string]> = [["none", "源泉なし"], ["salesperson", "外交員報酬（10.21%）"], ["employee", "給与側で源泉"]];
const PAID_VIA: ReadonlyArray<readonly [string, string]> = [["cash_daily", "当日現金（日報へ）"], ["monthly", "月締め"]];
const whLabel = (v: string) => WH.find(([k]) => k === v)?.[1] ?? v;
const yen = (n: number) => "¥" + n.toLocaleString("en-US");
const monthRange = () => {
  const d = new Date(Date.now() + 9 * 3600_000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
};

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function ReferrersBoard({ storeId, isManagerUp, initial, members }: {
  storeId: string; isManagerUp: boolean; initial: Referrer[]; members: MemberOpt[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Referrer[]>(initial);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "warn"; text: string } | null>(null);

  // フォーム（id 1 つで新規／編集を兼用）
  const [open, setOpen] = useState(false);
  const [fId, setFId] = useState<string | null>(null);
  const [fKind, setFKind] = useState("external");
  const [fMember, setFMember] = useState<string>("");
  const [fName, setFName] = useState("");
  const [fContact, setFContact] = useState("");
  const [fWh, setFWh] = useState("none");
  const [fActive, setFActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fMsg, setFMsg] = useState<string | null>(null);

  const dupName = useMemo(() => fName.trim() !== "" && rows.some((r) => r.id !== fId && r.name === fName.trim()), [rows, fName, fId]);

  function openNew() { setFId(null); setFKind("external"); setFMember(""); setFName(""); setFContact(""); setFWh("none"); setFActive(true); setFMsg(null); setOpen(true); }
  function openEdit(r: Referrer) { setFId(r.id); setFKind(r.kind); setFMember(r.membership_id ?? ""); setFName(r.name); setFContact(r.contact ?? ""); setFWh(r.withholding_category); setFActive(r.is_active); setFMsg(null); setOpen(true); }

  async function reload() {
    const { data } = await supabase.from("referrers").select("id, kind, membership_id, name, contact, withholding_category, is_active")
      .eq("store_id", storeId).order("is_active", { ascending: false }).order("name");
    setRows((data ?? []) as Referrer[]);
  }

  async function save() {
    if (!isManagerUp || busy) return;
    setFMsg(null);
    if (fName.trim() === "") { setFMsg("名前を入力してください"); return; }
    if (fKind === "staff" && !fMember) { setFMsg("スタッフの所属を選んでください"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_referrer", {
      p_id: fId, p_store_id: storeId, p_kind: fKind, p_membership_id: fKind === "staff" ? fMember : null,
      p_name: fName.trim(), p_contact: fContact.trim() === "" ? null : fContact.trim(),
      p_withholding_category: fWh, p_is_active: fActive, // 明示 boolean（原則7）
    });
    setBusy(false);
    if (error) { setFMsg(rpcErrJa(error.message)); return; }
    setOpen(false);
    setMsg({ kind: "success", text: fId ? "紹介者を更新しました" : "紹介者を登録しました" });
    await reload();
  }

  // ── 未払一覧（298-6）──
  const [range, setRange] = useState(monthRange());
  const [unpaid, setUnpaid] = useState<Unpaid[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [paidVia, setPaidVia] = useState("cash_daily");
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function loadUnpaid() {
    setPayMsg(null);
    const { data, error } = await supabase.rpc("referral_payouts_unpaid", { p_store_id: storeId, p_from: range.from || null, p_to: range.to || null });
    if (error) { setPayMsg({ kind: "error", text: rpcErrJa(error.message) }); setUnpaid([]); return; }
    setUnpaid((data ?? []) as Unpaid[]);
    setSel(new Set());
  }
  async function afterPay(ids: string[]) {
    const { data } = await supabase.from("referral_payouts").select("id, amount, withholding").in("id", ids);
    const rs = (data ?? []) as { id: string; amount: number; withholding: number }[];
    const amt = rs.reduce((a, r) => a + r.amount, 0), wh = rs.reduce((a, r) => a + r.withholding, 0);
    setPayMsg({ kind: "success", text: `支払を確定しました: ${rs.length} 件・額面 ${yen(amt)}・源泉 ${yen(wh)}・渡す額 ${yen(amt - wh)}${paidVia === "cash_daily" ? "（当日現金＝日報の「紹介料(現金)」に集計）" : ""}` });
    await loadUnpaid();
  }
  async function payOne(id: string) {
    if (payBusy) return; setPayBusy(true); setPayMsg(null);
    const { error } = await supabase.rpc("referral_payout_pay", { p_payout_id: id, p_paid_via: paidVia, p_idem_key: crypto.randomUUID() });
    setPayBusy(false);
    if (error) { setPayMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    await afterPay([id]);
  }
  async function payBulk() {
    const ids = [...sel];
    if (payBusy || ids.length === 0) { if (ids.length === 0) setPayMsg({ kind: "error", text: "支払う紹介料を選んでください" }); return; }
    setPayBusy(true); setPayMsg(null);
    const { error } = await supabase.rpc("referral_payouts_pay_bulk", { p_payout_ids: ids, p_paid_via: paidVia, p_idem_key: crypto.randomUUID() });
    setPayBusy(false);
    if (error) { setPayMsg({ kind: "error", text: rpcErrJa(error.message) }); return; }
    await afterPay(ids);
  }
  const selTotal = (unpaid ?? []).filter((u) => sel.has(u.payout_id)).reduce((a, u) => a + u.amount, 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <MasterPageHead eyebrow="Referrers" title="紹介者" count={rows.filter((r) => r.is_active).length} unit="名"
        desc="外部キャッチ・スタッフの紹介者と、紹介料の支払を管理します。紹介はレジの「指名・席」タブで伝票に付けます（1 伝票 1 紹介）。"
        action={isManagerUp ? <button type="button" className="nox-btn" onClick={openNew}>＋ 紹介者を追加</button> : undefined} />
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}

      <div style={card}>
        <h3 style={t.cardTitle}>紹介者一覧</h3>
        {rows.length === 0 ? (
          <p style={{ ...t.sub, fontSize: 12.5, margin: 0 }}>紹介者はまだ登録されていません。</p>
        ) : (
          <div className="nox-tablewrap plain">
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead><tr>{["名前", "区分", "所属", "源泉", "連絡先", "状態", ""].map((h) => <th key={h} style={{ ...t.th, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                    <td style={t.td}><b>{r.name}</b></td>
                    <td style={t.td}>{r.kind === "staff" ? "スタッフ" : "外部"}</td>
                    <td style={t.td}>{r.kind === "staff" ? (members.find((m) => m.id === r.membership_id)?.name ?? "（退店）") : "—"}</td>
                    <td style={t.td}>{whLabel(r.withholding_category)}</td>
                    <td style={t.td}>{r.contact ?? "—"}</td>
                    <td style={t.td}>{r.is_active ? "有効" : "無効"}</td>
                    <td style={{ ...t.td, whiteSpace: "nowrap" }}>{isManagerUp && <button type="button" style={btnLight} onClick={() => openEdit(r)}>編集</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 紹介料の支払（298-6／298-7／298-10）── */}
      <div style={card}>
        <h3 style={t.cardTitle}>紹介料の支払（未払一覧）</h3>
        <p style={{ ...t.sub, fontSize: 12, margin: "0 0 8px", lineHeight: 1.7 }}>
          会計確定で未払が 1 件できます。支払を確定すると源泉（外交員報酬＝同月の支払累計が 120,000 円を超える部分の 10.21%）を DB が計算します。
          当日現金で支払った分は日報の「紹介料(現金)」に集計され、実査差異の式で引かれます。給与には載りません。
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>営業日 <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={input} /></label>
          <span style={{ fontSize: 12 }}>〜</span>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={input} aria-label="終了日" />
          <button type="button" style={btnDark} onClick={() => void loadUnpaid()}>未払を表示</button>
          <SegSelect value={paidVia} onChange={setPaidVia} options={PAID_VIA} ariaLabel="支払方法" />
        </div>
        {unpaid && unpaid.length === 0 && <p style={{ ...t.sub, fontSize: 12.5, margin: 0 }}>この期間の未払はありません。</p>}
        {unpaid && unpaid.length > 0 && (
          <>
            <div className="nox-tablewrap plain">
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead><tr>{["", "営業日", "紹介者", "源泉区分", "紹介料", ""].map((h, i) => <th key={i} style={{ ...t.th, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {unpaid.map((u) => (
                    <tr key={u.payout_id}>
                      <td style={t.td}><input type="checkbox" checked={sel.has(u.payout_id)} aria-label={`${u.referrer_name} ${u.biz_date} を選択`}
                        onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(u.payout_id); else n.delete(u.payout_id); setSel(n); }} /></td>
                      <td style={{ ...t.td, ...t.num }}>{u.biz_date}</td>
                      <td style={t.td}>{u.referrer_name}{u.referrer_kind === "staff" ? "（スタッフ）" : ""}</td>
                      <td style={t.td}>{whLabel(u.withholding_category)}</td>
                      <td style={{ ...t.td, ...t.num }}>{yen(u.amount)}</td>
                      <td style={{ ...t.td, whiteSpace: "nowrap" }}>{isManagerUp && <button type="button" style={btnLight} disabled={payBusy} onClick={() => void payOne(u.payout_id)}>この 1 件を支払う</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isManagerUp && (
              <div className="nox-actions" style={{ marginTop: 8, alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12 }}>選択 {sel.size} 件・<span className="num">{yen(selTotal)}</span></span>
                <button type="button" className="nox-btn" disabled={payBusy || sel.size === 0} onClick={() => void payBulk()}>選択をまとめて支払う</button>
              </div>
            )}
          </>
        )}
        {payMsg && <Message kind={payMsg.kind} onDismiss={() => setPayMsg(null)}>{payMsg.text}</Message>}
      </div>

      {open && (
      <Modal onClose={() => { if (!busy) setOpen(false); }} scroll>
        <h3 style={t.cardTitle}>{fId ? "紹介者を編集" : "紹介者を追加"}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <SegSelect value={fKind} onChange={(v) => { setFKind(v); if (v === "external") setFMember(""); }} options={KINDS} ariaLabel="区分" />
          {fKind === "staff" && (
            <label style={{ fontSize: 12, display: "grid", gap: 4 }}>所属（スタッフ）
              <select value={fMember} onChange={(e) => setFMember(e.target.value)} style={input}>
                <option value="">選択してください</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.role}）</option>)}
              </select>
            </label>
          )}
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>名前
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="例: 〇〇（キャッチ）" style={input} maxLength={80} />
          </label>
          {dupName && <Message kind="warn">同じ名前の紹介者が既にあります（登録は可能です・連絡先で区別してください）</Message>}
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>連絡先（任意）
            <input value={fContact} onChange={(e) => setFContact(e.target.value)} placeholder="電話・LINE 等" style={input} maxLength={200} />
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>源泉区分
            <SegSelect value={fWh} onChange={setFWh} options={WH} ariaLabel="源泉区分" />
            <span style={{ ...t.sub, fontSize: 11 }}>外交員報酬＝同月の支払累計 120,000 円超の部分に 10.21%（支払時に確定）。スタッフ紹介者は給与側で源泉＝ここでは 0。</span>
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} /> 有効（無効にするとレジで選べなくなります）
          </label>
          {fMsg && <Message kind="error" onDismiss={() => setFMsg(null)}>{fMsg}</Message>}
          <div className="nox-actions">
            <button type="button" style={btnLight} onClick={() => setOpen(false)}>閉じる</button>
            <button type="button" className="nox-btn" disabled={busy} onClick={() => void save()}>{fId ? "更新する" : "登録する"}</button>
          </div>
        </div>
      </Modal>
      )}
    </div>
  );
}
