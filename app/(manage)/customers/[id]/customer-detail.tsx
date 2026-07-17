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

type Cast = { id: string; name: string; store_id: string; is_active: boolean };
type CustRow = {
  id: string; store_id: string; name: string; furigana: string | null; birthday: string | null;
  tel: string | null; prefs: string | null; memo: string | null; cast_id: string | null; is_active: boolean;
};
type Summary = {
  customer_id: string; visits: number; last_visit: string | null; total_spend: number;
  active_bottles: number; open_receivable: number;
};
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
  color: "var(--sub)", background: "#23232B", border: "1px solid var(--line2)", whiteSpace: "nowrap",
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
  customerId, casts, canAssign,
}: {
  customerId: string; casts: Cast[]; canAssign: boolean;
}) {
  const [cust, setCust] = useState<CustRow | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 編集フォーム
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eFuri, setEFuri] = useState("");
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
      .select("id, store_id, name, furigana, birthday, tel, prefs, memo, cast_id, is_active")
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
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

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
    // 規約7: 全フィールド明示送信・is_active は明示 boolean。birthday は UI 非編集＝現在値を返送。
    const { error } = await supabase.rpc("customer_update", {
      p_id: cust.id,
      p_name: eName.trim(),
      p_furigana: eFuri.trim() || null,
      p_birthday: cust.birthday,
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

  if (err) {
    return (
      <div>
        <p style={{ ...noneP, marginTop: 8 }}>{err}</p>
        <Link href="/customers" style={{ color: "var(--champ)", fontSize: 13 }}>← 顧客一覧へ戻る</Link>
      </div>
    );
  }
  if (!cust) return <p style={{ ...noneP, marginTop: 8 }}>読み込み中…</p>;

  const last = summary?.last_visit ?? null;

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <Link href="/customers" style={{ color: "var(--sub)", fontSize: 12, textDecoration: "none" }}>← 顧客一覧</Link>
        <h1 style={{ ...t.pheadH1, marginTop: 4, display: "flex", alignItems: "center", gap: 9 }}>
          {cust.name}
          {!cust.is_active && <span style={dormantPill}>休眠</span>}
        </h1>
        <p style={{ ...t.pheadP, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>
            {cust.furigana ? `${cust.furigana}・` : ""}担当 {castName(cust.cast_id)}
            {cust.tel ? `・${cust.tel}` : ""}
          </span>
          {canAssign && (
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
            <select value={assignSel} onChange={(e) => setAssignSel(e.target.value)} style={{ ...input, minWidth: 200 }}>
              <option value="">フリー（担当解除）</option>
              {assignCandidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
          <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--bad)", margin: "6px 0 0" }}>{assignMsg}</p>
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

      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: editOpen ? 11 : 0 }}>
          <h2 style={{ ...secTitle, margin: 0 }}>編集</h2>
          <button
            style={{ ...(editOpen ? t.btnGhost : t.btnGold), ...t.btnSm, marginLeft: "auto" }}
            onClick={() => (editOpen ? setEditOpen(false) : openEdit())}
          >
            {editOpen ? "閉じる" : "編集"}
          </button>
        </div>
        {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes("失敗") ? "var(--bad)" : "var(--ok)", margin: "8px 0 0" }}>{msg}</p>}
        {editOpen && (
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
            <button style={{ ...t.btnGold, opacity: busy || !eName.trim() ? 0.6 : 1 }} disabled={busy || !eName.trim()} onClick={() => void saveEdit()}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
