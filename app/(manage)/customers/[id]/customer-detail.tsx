"use client";

// 顧客詳細ボード（F3b-A 塊2-2）。ヘッダ集計=customer_summary・来店履歴=customer_visit_history
// （直近20件・definer が can_crm 軸へ橋渡し）・実体属性=customers 直 SELECT（RLS）。
// 編集=customer_update（規約7: is_active は常に明示 boolean・全フィールド明示送信＝
// birthday は UI 非編集のため現在値をそのまま返送＝null 化クリア事故を作らない）。
// 担当付け替え=customer_assign_cast（F3b-B-1・owner/manager のみ表示＝UI 一次ガード・
// 真の防御は RPC 側ゲート。候補は自店∧is_active の cast のみ・「フリー」= p_cast_id null 解除。
// customer_update は cast_id 非関与のまま＝担当変更をこの RPC 以外に混ぜない）。
// ボトル明細/登録・客×cast クロスはスコープ外（裁定済み）。
// ボトルは件数のみ（bottle_keeps の SELECT は can_register 軸＝crm 軸の明細経路が現状無い）。
// churn tier の再判定はしない（しきい値は RPC 側の責務）＝詳細は days_since 数値のみ。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal"; // ★裁定253 R7: 顧客編集はモーダル
import Picker from "@/components/nox/picker";

import Toast, { Message } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { rpcErrJa } from "@/lib/nox/ui/rpc-err"; // ★0155（便 S-4）: 'already anonymized'／'bad reason'／'forbidden' の日本語化
type Cast = { id: string; name: string; store_id: string; is_active: boolean };
type CustRow = {
  id: string; store_id: string; name: string; furigana: string | null; birthday: string | null;
  tel: string | null; prefs: string | null; memo: string | null; cast_id: string | null; is_active: boolean;
  anonymized_at: string | null; // ★0155（裁定309-4）: 非 null＝匿名化済み（編集・担当変更・メモ追加は不可）
};
type Summary = {
  customer_id: string; visits: number; last_visit: string | null; total_spend: number;
  active_bottles: number; open_receivable: number;
};
// ★0153（裁定305-6・D2）: キープ一覧（bottle_name・残量・最終利用日・棚）＝bottle_keeps 直 SELECT（RLS＝can_register 軸・読めなければ空）
type KeepRow = { id: string; bottle_name: string | null; product_id: string; remaining_pct: number | null; shelf_no: string | null; last_used_at: string | null; opened_at: string; status: string; products: { name: string } | null };
// ★0153（裁定305-9・D2）: 顧客別売上（customer_sales_summary＝owner／manager・期間）
type SalesRow = { customer_id: string; name: string; amount: number; check_count: number };
type Visit = {
  check_id: string; visited_at: string; total: number;
  seat_name: string | null; nom_casts: string[] | null; status: string;
};

const yen = (n: number) => "¥" + n.toLocaleString();
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, padding: "8px 10px", fontSize: 13 };
const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
const dormantPill: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
  color: "var(--sub)", background: "var(--card2)", border: "1px solid var(--line2)", whiteSpace: "nowrap",
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function CustomerDetail({
  customerId, casts, canAssign, isOwner = false,
}: {
  customerId: string; casts: Cast[]; canAssign: boolean; isOwner?: boolean; // ★0155（裁定309-4・便 S-4）: 匿名化は owner のみ（節ごと未描画＝S-6）
}) {
  // ★0155（裁定309-4／309 追補1 (c)(d)）: 匿名化（customer_anonymize＝owner のみ・理由必須 ≤200・元に戻せない）
  const [anonOpen, setAnonOpen] = useState(false);
  const [anonReason, setAnonReason] = useState("");
  const [anonBusy, setAnonBusy] = useState(false);
  const [anonMsg, setAnonMsg] = useState<string | null>(null);
  const [cust, setCust] = useState<CustRow | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [keeps, setKeeps] = useState<KeepRow[] | null>(null); // ★0153 D2（null＝未取得）
  const [salesFrom, setSalesFrom] = useState(() => new Date().toISOString().slice(0, 7) + "-01");
  const [salesTo, setSalesTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sales, setSales] = useState<SalesRow | null | undefined>(undefined); // ★0153 D2（undefined＝未取得・null＝期間内 0）
  const [salesErr, setSalesErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 編集フォーム
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eFuri, setEFuri] = useState("");
  // E8-5 customers#10: 誕生日（列は既存・p_birthday を現在値返送のみで入力欄が無かった実質バグの是正）
  const [eBirthday, setEBirthday] = useState("");
  const [eTel, setETel] = useState("");
  const [ePrefs, setEPrefs] = useState("");
  const [eMemo, setEMemo] = useState("");
  const [eActive, setEActive] = useState(true);

  // 担当付け替え（customer_assign_cast・owner/manager のみ）
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSel, setAssignSel] = useState("");   // "" = フリー（担当解除）
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const castName = useMemo(() => {
    const m = new Map(casts.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "フリー");
  }, [casts]);

  // 付け替え候補 = 客の店の在籍 cast のみ（名前解決とは別軸: 退店 cast は候補に出さない）
  const assignCandidates = useMemo(
    () => (cust ? casts.filter((c) => c.is_active && c.store_id === cust.store_id) : []),
    [casts, cust],
  );

  const load = useCallback(async () => {
    const supabase = createClient();
    setErr(null);
    const { data: c, error: eC } = await supabase
      .from("customers")
      .select("id, store_id, name, furigana, birthday, tel, prefs, memo, cast_id, is_active, anonymized_at")
      .eq("id", customerId)
      .maybeSingle();
    if (eC || !c) { setErr("顧客が見つかりません"); setCust(null); return; }
    setCust(c as CustRow);
    const { data: s, error: eS } = await supabase.rpc("customer_summary", { p_customer_id: customerId });
    if (eS) { setErr(`集計の読み込みに失敗: ${eS.message}`); return; }
    setSummary(((s ?? []) as Summary[])[0] ?? null);
    const { data: v, error: eV } = await supabase.rpc("customer_visit_history", { p_customer_id: customerId });
    if (eV) { setErr(`来店履歴の読み込みに失敗: ${eV.message}`); return; }
    setVisits((v ?? []) as Visit[]);
    // ★0153 D2: キープ一覧（+1）
    const { data: ks } = await supabase.from("bottle_keeps").select("id, bottle_name, product_id, remaining_pct, shelf_no, last_used_at, opened_at, status, products(name)").eq("customer_id", customerId).order("opened_at", { ascending: false });
    setKeeps((ks ?? []) as unknown as KeepRow[]);
  }, [customerId]);
  // ★0153 D2: 顧客別売上（+1・期間を変えたときだけ再取得）
  const loadSales = useCallback(async (storeId: string) => {
    const supabase = createClient();
    setSalesErr(null);
    const { data, error } = await supabase.rpc("customer_sales_summary", { p_store_id: storeId, p_from: salesFrom, p_to: salesTo });
    if (error) { setSales(undefined); setSalesErr(error.message.includes("forbidden") ? "権限がありません（店長以上）" : `売上の読み込みに失敗: ${error.message}`); return; }
    setSales(((data ?? []) as SalesRow[]).find((r) => r.customer_id === customerId) ?? null);
  }, [customerId, salesFrom, salesTo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (cust?.store_id) void loadSales(cust.store_id); }, [cust?.store_id, loadSales]);

  function openAssign() {
    if (!cust) return;
    // 現担当を既定選択（退店等で候補外なら「フリー」既定＝誤解除を避けるため保存は明示操作のみ）
    setAssignSel(cust.cast_id && assignCandidates.some((c) => c.id === cust.cast_id) ? cust.cast_id : "");
    setAssignMsg(null);
    setAssignOpen(true);
  }

  // RPC の実 raise: 'invalid cast'（別店/退店ではなく不在/越境）/ 'forbidden' / 'not found'
  function jaAssignError(m: string): string {
    if (m.includes("invalid cast")) return "担当に指定できないキャストです（同じ店のキャストのみ指定できます）";
    if (m.includes("forbidden")) return "担当を変更する権限がありません";
    if (m.includes("not found")) return "顧客が見つかりません";
    return `保存に失敗: ${m}`;
  }

  async function saveAssign() {
    if (!cust) return;
    setAssignBusy(true); setAssignMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_assign_cast", {
      p_id: cust.id,
      p_cast_id: assignSel || null,   // "" = フリー（担当解除）
    });
    setAssignBusy(false);
    if (error) { setAssignMsg(jaAssignError(error.message)); return; }
    setAssignOpen(false);
    await load();   // ヘッダの担当名は再取得した cust.cast_id で更新
  }

  function openEdit() {
    if (!cust) return;
    setEName(cust.name);
    setEFuri(cust.furigana ?? "");
    setEBirthday(cust.birthday ?? "");
    setETel(cust.tel ?? "");
    setEPrefs(cust.prefs ?? "");
    setEMemo(cust.memo ?? "");
    setEActive(cust.is_active);
    setMsg(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!cust) return;
    setBusy(true); setMsg(null);
    const supabase = createClient();
    // 規約7: 全フィールド明示送信・is_active は明示 boolean。
    // E8-5 customers#10: birthday は入力欄から送る（空欄=null＝クリア可）。旧「現在値返送」を廃止。
    const { error } = await supabase.rpc("customer_update", {
      p_id: cust.id,
      p_name: eName.trim(),
      p_furigana: eFuri.trim() || null,
      p_birthday: eBirthday || null,
      p_tel: eTel.trim() || null,
      p_prefs: ePrefs.trim() || null,
      p_memo: eMemo.trim() || null,
      p_is_active: eActive,
    });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${error.message}`); return; }
    setMsg("保存しました");
    setEditOpen(false);
    await load();
  }

  // ★0155（裁定309-4・便 S-4）: 匿名化（owner のみ・理由必須・成功後は再読取＝名前「削除済み顧客」・is_active false・anonymized_at）
  async function anonymize() {
    if (!cust || anonReason.trim() === "") return;
    setAnonBusy(true); setAnonMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_anonymize", { p_customer_id: cust.id, p_reason: anonReason.trim() });
    setAnonBusy(false);
    if (error) { setAnonMsg(`匿名化に失敗: ${rpcErrJa(error.message)}`); return; }
    setAnonOpen(false); setAnonReason("");
    setAnonMsg("匿名化しました（名前・連絡先・メモを消去し、記録を残しました）");
    await load();
  }

  if (err) {
    return (
      <div>
        <Message kind="error" style={{ marginTop: 8 }}>{err}</Message>
        <Link href="/customers" className="nox-link" style={{ fontSize: 13 }}>← 顧客一覧へ戻る</Link>
      </div>
    );
  }
  if (!cust) return <p style={{ ...noneP, marginTop: 8 }}>読み込み中…</p>;

  const last = summary?.last_visit ?? null;

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <Link href="/customers" className="nox-link" style={{ fontSize: 12 }}>← 顧客一覧</Link>
        <h1 style={{ ...t.pheadH1, marginTop: 4, display: "flex", alignItems: "center", gap: 9 }}>
          {cust.name}
          {!cust.is_active && !cust.anonymized_at && <span style={dormantPill}>休眠</span>}
          {cust.anonymized_at && <span style={{ ...dormantPill, color: "var(--bad)" }}>削除済み顧客（匿名化 {new Date(cust.anonymized_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}）</span>}
        </h1>
        <p style={{ ...t.pheadP, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>
            {cust.furigana ? `${cust.furigana}・` : ""}担当 {castName(cust.cast_id)}
            {cust.tel ? `・${cust.tel}` : ""}
          </span>
          {canAssign && !cust.anonymized_at && (
            <button
              style={{ ...t.btnGhost, ...t.btnSm }}
              onClick={() => (assignOpen ? setAssignOpen(false) : openAssign())}
            >
              {assignOpen ? "閉じる" : "担当変更"}
            </button>
          )}
        </p>
        {canAssign && assignOpen && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px", minWidth: 200 }}>{/* ★裁定259／259-a（2026-09-17）: select→Picker。未選択＝「フリー（担当解除）」は onClear で表現 */}
              <Picker dense items={assignCandidates.map((c) => ({ id: c.id, label: c.name }))} value={assignSel || null}
                onPick={setAssignSel} onClear={() => setAssignSel("")} placeholder="担当キャストを検索（未選択＝フリー・担当解除）" />
            </div>
            <button
              style={{ ...t.btnGold, ...t.btnSm, opacity: assignBusy ? 0.6 : 1 }}
              disabled={assignBusy}
              onClick={() => void saveAssign()}
            >
              {assignBusy ? "保存中…" : "保存"}
            </button>
          </div>
        )}
        {assignMsg && (
          <Toast msg={assignMsg} style={{ margin: "6px 0 0" }} />
        )}
      </div>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>来店状況</h2>
        <div style={t.kpiGrid}>
          <div style={t.kpi}>
            <div style={t.kpiLabel}>来店回数</div>
            <div style={t.kpiVal}>{summary?.visits ?? "—"}<span style={{ fontSize: 12, color: "var(--sub)" }}> 回</span></div>
          </div>
          <div style={t.kpi}>
            <div style={t.kpiLabel}>累計利用額</div>
            <div style={t.kpiValGold}>{summary ? yen(summary.total_spend) : "—"}</div>
          </div>
          <div style={t.kpi}>
            <div style={t.kpiLabel}>最終来店</div>
            <div style={{ ...t.kpiVal, fontSize: 17 }}>
              {last ? <>{fmtWhen(last)}<span style={{ fontSize: 12, color: "var(--sub)" }}>（{daysSince(last)}日前）</span></> : "来店なし"}
            </div>
          </div>
          <div style={t.kpi}>
            <div style={t.kpiLabel}>キープ / 売掛</div>
            <div style={{ ...t.kpiVal, fontSize: 17 }}>
              {summary?.active_bottles ?? 0}本
              {summary && summary.open_receivable > 0 && (
                <span style={{ color: "var(--bad)", fontSize: 14 }}>・{yen(summary.open_receivable)}</span>
              )}
            </div>
          </div>
        </div>
        {(cust.prefs || cust.memo) && (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>
            {cust.prefs ? `好み: ${cust.prefs}` : ""}{cust.prefs && cust.memo ? "・" : ""}{cust.memo ?? ""}
          </p>
        )}
      </section>

      {/* ★0153（裁定305-6・D2）: キープ一覧 */}
      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>キープ</h2>
        {keeps === null && <p style={noneP}>—</p>}
        {keeps !== null && keeps.length === 0 && <p style={noneP}>キープはありません</p>}
        {keeps !== null && keeps.length > 0 && (
          <div className="nox-tablewrap">
            <table className="nox-table cardrows">{/* ★X-13-17（便 X-13d-1）: ≤899 は 1 本 1 カード */}
              <thead><tr><th>ボトル</th><th>残量</th><th>最終利用日</th><th>棚</th><th>状態</th></tr></thead>
              <tbody>
                {keeps.map((k) => (
                  <tr key={k.id}>
                    <td>{k.bottle_name ?? k.products?.name ?? "（商品）"}</td>
                    <td className="num" data-label="残量">{k.remaining_pct != null ? `${k.remaining_pct}%` : "—"}</td>
                    <td className="num" data-label="最終利用日">{k.last_used_at ? fmtWhen(k.last_used_at) : "—"}</td>
                    <td data-label="棚">{k.shelf_no ?? "—"}</td>
                    <td data-label="状態">{k.status === "active" ? "保管中" : k.status === "empty" ? "空" : "終了"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ★0153（裁定305-9・D2）: 顧客別売上（注文者つき行＝この顧客・なし＝伝票の顧客で均等割り・端数は最初の顧客） */}
      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>顧客別売上</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>開始</span><input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} style={input} /></label>
          <label style={{ fontSize: 12, color: "var(--sub)" }}><span style={{ display: "block", marginBottom: 6 }}>終了</span><input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} style={input} /></label>
        </div>
        {salesErr && <Message kind="error" onDismiss={() => setSalesErr(null)}>{salesErr}</Message>}{/* 裁定281 */}
        {!salesErr && sales === undefined && <p style={noneP}>—</p>}
        {!salesErr && sales === null && <p style={noneP}>期間内の売上はありません</p>}
        {!salesErr && sales && (
          <div style={t.kpiGrid}>
            <div style={t.kpi}><div style={t.kpiLabel}>売上（均等割り込み）</div><div style={t.kpiValGold}>{yen(Number(sales.amount))}</div></div>
            <div style={t.kpi}><div style={t.kpiLabel}>伝票数</div><div style={t.kpiVal}>{sales.check_count}<span style={{ fontSize: 12, color: "var(--sub)" }}> 枚</span></div></div>
          </div>
        )}
        <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0" }}>注文者を付けた行はその顧客に、付けていない行は伝票の顧客の人数で均等に割ります（端数は最初の顧客）。</p>
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={secTitle}>来店履歴（直近20件）</h2>
        {visits.length === 0 && <p style={noneP}>来店履歴なし</p>}
        {visits.map((v) => (
          <div key={v.check_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ ...t.num, fontWeight: 700 }}>{fmtWhen(v.visited_at)}</span>
              {v.seat_name && <span style={{ color: "var(--sub)", fontSize: 12 }}>{v.seat_name}</span>}
              <span style={{ ...t.num, marginLeft: "auto", color: "var(--champ)", fontWeight: 700 }}>{yen(v.total)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              {v.nom_casts?.length ? `指名 ${v.nom_casts.join("、")}` : "指名なし"}
            </div>
          </div>
        ))}
      </section>

      {/* ★0155（裁定309-4／309 追補1・便 S-4）: 匿名化（owner のみ描画＝S-6・RPC も owner 限定）。物理削除はしない＝来店履歴・売掛の記録は残る */}
      {isOwner && (
        <section className="nox-cardtop" style={t.card}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 style={{ ...secTitle, margin: 0 }}>匿名化（保持期限の履行）</h2>
            {!cust.anonymized_at && (
              <button style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto", color: "var(--bad)" }} onClick={() => { setAnonReason(""); setAnonMsg(null); setAnonOpen(true); }}>匿名化</button>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0", lineHeight: 1.7 }}>
            名前を「削除済み顧客」に置き換え、ふりがな・電話・誕生日・好み・備考とメモ履歴を消去します。来店履歴・売掛の記録は残ります。元に戻せません。
          </p>
          {cust.anonymized_at && (
            <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "8px 0 0" }}>匿名化済み <span className="num">{new Date(cust.anonymized_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}</span></p>
          )}
          {anonMsg && <Toast msg={anonMsg} style={{ margin: "8px 0 0" }} />}
          {anonOpen && (
            <Modal onClose={() => !anonBusy && setAnonOpen(false)} maxWidth={460}>
              <div className="nox-formmodal-head">
                <strong>{cust.name} を匿名化</strong>
                <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !anonBusy && setAnonOpen(false)}>×</button>
              </div>
              <Message kind="warn" style={{ margin: "4px 0 10px" }}>元に戻せません。名前・連絡先・メモ履歴が消え、以後この顧客は編集できなくなります。</Message>
              <label style={t.fieldLabel}>理由（必須・200 文字まで）</label>
              <input value={anonReason} onChange={(e) => setAnonReason(e.target.value)} maxLength={200} disabled={anonBusy}
                placeholder="例: 保持期限の到来（最終来店から 5 年）" style={{ ...input, width: "100%", marginTop: 4 }} />
              <div className="nox-formmodal-foot">
                <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={anonBusy} onClick={() => setAnonOpen(false)}>キャンセル</button>
                <button style={{ ...t.btnGold, opacity: anonBusy || anonReason.trim() === "" ? 0.6 : 1 }} disabled={anonBusy || anonReason.trim() === ""} onClick={() => void anonymize()}>
                  {anonBusy ? "匿名化中…" : "匿名化する"}
                </button>
              </div>
            </Modal>
          )}
        </section>
      )}

      <section className="nox-cardtop" style={t.card}>
        {/* ★裁定253 R7（2026-09-14）: 編集フォームはインライン展開をやめ共通 Modal へ（項目・customer_update の引数は不変）。ボタンは開くだけ */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ ...secTitle, margin: 0 }}>編集</h2>
          {!cust.anonymized_at && <button style={{ ...t.btnGold, ...t.btnSm, marginLeft: "auto" }} onClick={openEdit}>編集</button>}
        </div>
        {/* ★0155（裁定309-4）: 匿名化済みは編集不可（RPC 側の拒否は無い＝表示で閉じる・名前は「削除済み顧客」のまま） */}
        {cust.anonymized_at && <Message kind="info" style={{ margin: "8px 0 0" }}>削除済み顧客のため編集できません。</Message>}
        {msg && <Toast msg={msg} style={{ margin: "8px 0 0" }} />}
        {editOpen && !cust.anonymized_at && (
          <Modal onClose={() => !busy && setEditOpen(false)} maxWidth={480} scroll>
          <div className="nox-formmodal-head">
            <strong>{cust?.name ?? "顧客"} を編集</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !busy && setEditOpen(false)}>×</button>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
            <div>
              <label style={t.fieldLabel}>名前（必須）</label>
              <input value={eName} onChange={(e) => setEName(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>ふりがな</label>
              <input value={eFuri} onChange={(e) => setEFuri(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>電話</label>
              <input value={eTel} onChange={(e) => setETel(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            {/* E8-5 customers#10: 誕生日入力（列は既存・空欄=未登録に戻す） */}
            <div>
              <label style={t.fieldLabel}>誕生日（任意）</label>
              <input type="date" value={eBirthday} onChange={(e) => setEBirthday(e.target.value)} style={{ ...input, marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>好み</label>
              <input value={ePrefs} onChange={(e) => setEPrefs(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <div>
              <label style={t.fieldLabel}>備考</label>
              <input value={eMemo} onChange={(e) => setEMemo(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={!eActive} onChange={(e) => setEActive(!e.target.checked)} />
              休眠にする
            </label>
            {!eActive && (
              <p style={{ fontSize: 11.5, color: "var(--sub)", margin: 0 }}>
                ※休眠にすると顧客一覧には表示されなくなります（このページからいつでも戻せます）。
              </p>
            )}
          </div>
          <div className="nox-formmodal-foot">{/* ★裁定244／253: 脚＝キャンセル左・保存 右・中央 */}
            <button style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setEditOpen(false)}>キャンセル</button>
            <button style={{ ...t.btnGold, opacity: busy || !eName.trim() ? 0.6 : 1 }} disabled={busy || !eName.trim()} onClick={() => void saveEdit()}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
          </Modal>
        )}
      </section>
    </div>
  );
}
