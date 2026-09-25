"use client";

// ★裁定302（2026-09-25・302-1／302-3）＋304: 前借り／送り実費の一括発行フォーム＝チェックボックス一覧型（マスタ「控除・送り」のみ。
//   casts 詳細・給与右パネルは 1 人型 advance-okuri-form のまま）。
//   候補＝当日（営業日）の出勤者（attendance 出勤打刻あり）を上・他は下・検索で絞り込み・「出勤者を全員チェック」「全解除」・
//   行ごと金額欄（送り実費はベース額プリフィル）・共通メモ 1 欄・「n 人・合計 ¥m」・「一括発行」1 回 → route → bulk RPC（1 tx・件ごと idem）。
//   フォーム直下に当日（営業日）の発行済み一覧（cast・額・メモ・取消＝既存 adv_cancel／transport_cancel の route）。
//   メッセージは裁定281 の型（Message・同じカード内・×で消す）。余白は 301-4 の段階（4/8/12/16/24）。取消の確認はインライン 2 段（265: prompt 不使用）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SegSelect from "@/components/ui/seg-select";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { bizDateOf } from "@/lib/nox/biz-date";
import { ISSUE_DATE_LABEL, ISSUE_LABEL, okuriEnabledOf, type IssueKind } from "@/lib/nox/payroll/advance-okuri";
import { ATTENDED_STATUSES, bulkBodyOf, bulkErrJa, bulkSuccessTextOf, bulkSummaryOf, candidatesOf, checkAttended, issuedRowsOf, uncheckAll, type BulkRow, type IssuedRow } from "@/lib/nox/payroll/issue-bulk";

export type BulkCast = { id: string; name: string };
type IssuedRaw = { id: string; cast_id: string; amount: number; note: string | null; status: string };

export default function IssueBulkForm({ storeId, casts, okuriMode, okuriBase = 0, bizCutoffHm = "06:00" }: {
  storeId: string;
  casts: BulkCast[];
  /** 店の送り方式（'actual' のときだけ送り実費を有効化） */
  okuriMode?: string | null;
  /** 送りベース額（送り実費のプリフィル・0＝空） */
  okuriBase?: number;
  /** 営業日切替（stores.settings_json.biz_cutoff_hm・既定 06:00） */
  bizCutoffHm?: string;
}) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), bizCutoffHm);
  const okuriOn = okuriEnabledOf(okuriMode);
  const [kind, setKind] = useState<IssueKind>("advance");
  const [date, setDate] = useState(bizToday);
  const [q, setQ] = useState("");
  const [attended, setAttended] = useState<string[]>([]);
  const [rows, setRows] = useState<BulkRow[]>(() => candidatesOf(casts, []));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [idemKey, setIdemKey] = useState<string>(() => crypto.randomUUID());
  const [issued, setIssued] = useState<IssuedRow[] | null>(null); // null＝未取得（件数を描かない）
  const [issuedErr, setIssuedErr] = useState(false);
  const [cancelArm, setCancelArm] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const prefillOf = useCallback((k: IssueKind) => (k === "transport" ? okuriBase : 0), [okuriBase]);

  // ★302-1: 当日（営業日）の出勤者と発行済み一覧＝1 回の取得（attendance／advances／transport の 3 クエリ並列・他に既存取得なし＝+1）
  const load = useCallback(async () => {
    const [at, ad, tr] = await Promise.all([
      supabase.from("attendance").select("cast_id, status").eq("store_id", storeId).eq("date", bizToday),
      supabase.from("advances").select("id, cast_id, amount, note, status").eq("store_id", storeId).eq("advanced_on", bizToday).order("created_at"),
      supabase.from("transport").select("id, cast_id, amount, note, status").eq("store_id", storeId).eq("biz_date", bizToday).order("created_at"),
    ]);
    if (at.error || ad.error || tr.error) { setIssuedErr(true); return; }
    const ids = ((at.data ?? []) as { cast_id: string; status: string }[]).filter((r) => ATTENDED_STATUSES.includes(r.status)).map((r) => r.cast_id);
    setAttended(ids);
    setIssuedErr(false);
    setIssued(issuedRowsOf((ad.data ?? []) as IssuedRaw[], (tr.data ?? []) as IssuedRaw[]));
  }, [supabase, storeId, bizToday]);
  useEffect(() => { void load(); }, [load]);
  // 候補の並び（出勤者が上）とプリフィルは attended／kind が決まるたびに組み直す（チェックと金額はリセット＝発行の取り違え防止）
  useEffect(() => { setRows(candidatesOf(casts, attended, prefillOf(kind))); }, [casts, attended, kind, prefillOf]);

  const label = ISSUE_LABEL[kind];
  const disabled = kind === "transport" && !okuriOn;
  const summary = bulkSummaryOf(rows);
  const nq = q.trim().toLowerCase();
  const shown = nq ? rows.filter((r) => r.name.toLowerCase().includes(nq)) : rows;
  const nameOf = (castId: string) => casts.find((c) => c.id === castId)?.name ?? "(不明)";
  const setRow = (castId: string, patch: Partial<BulkRow>) => setRows((rs) => rs.map((r) => (r.castId === castId ? { ...r, ...patch } : r)));

  async function submit() {
    if (busy || disabled) return;
    setMsg(null);
    const b = bulkBodyOf({ kind, storeId, date, note, rows, idemKey });
    if (!b.ok) { setMsg({ kind: "error", text: b.err }); return; }
    setBusy(true);
    try {
      const res = await fetch(b.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b.body) });
      const j = (await res.json().catch(() => ({}))) as { ids?: string[]; error?: string };
      if (!res.ok) { setMsg({ kind: "error", text: bulkErrJa(res.status, j.error) }); return; } // 失敗時は同じ idemKey で再送＝冪等
      setMsg({ kind: "success", text: bulkSuccessTextOf(kind, b.body.items.length, summary.total, date) });
      setIdemKey(crypto.randomUUID());
      setRows((rs) => uncheckAll(rs));
      setNote("");
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: `通信エラー: ${(e as Error).message}` });
    } finally { setBusy(false); }
  }

  async function cancelIssued(row: IssuedRow) {
    if (cancelBusy) return;
    setCancelBusy(row.id);
    setMsg(null);
    try {
      const endpoint = row.kind === "advance" ? "/api/advance/cancel" : "/api/transport/cancel";
      const body = row.kind === "advance" ? { advanceId: row.id } : { transportId: row.id };
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMsg({ kind: "error", text: bulkErrJa(res.status, j.error) }); return; }
      setMsg({ kind: "info", text: `${nameOf(row.castId)} の${ISSUE_LABEL[row.kind]} ¥${row.amount.toLocaleString("en-US")} を取り消しました` });
      setCancelArm(null);
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: `通信エラー: ${(e as Error).message}` });
    } finally { setCancelBusy(null); }
  }

  const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)", marginBottom: 6 };
  const inp: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
  const smallBtn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

  return (
    <section className="nox-cardtop" style={{ ...t.card, marginBottom: 0, paddingBottom: 16 }}>
      {/* ★301-4: 見出し→12→ブロック（ラベル→6→入力）→16→…→注記 8→カード下端 16 */}
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 12px" }}>前借り／送り実費の一括発行</h3>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={lbl}>種別</div>
          <SegSelect value={kind} onChange={(v) => setKind(v as IssueKind)} options={[["advance", "前借り"], ["transport", "送り実費"]]} ariaLabel="発行の種別" />
        </div>
        <label style={{ fontSize: 12, color: "var(--sub)", minWidth: 160 }}><span style={{ display: "block", marginBottom: 6 }}>{ISSUE_DATE_LABEL[kind]}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} style={inp} />
        </label>
        <label style={{ fontSize: 12, color: "var(--sub)", flex: "1 1 180px" }}><span style={{ display: "block", marginBottom: 6 }}>検索</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="キャスト名で絞り込み" style={inp} />
        </label>
      </div>
      {disabled && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 16px" }}>※送り方式が「実費」の店のみ発行できます（控除・送りで切替）。</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" style={smallBtn} onClick={() => setRows((rs) => checkAttended(rs))} disabled={disabled}>出勤者を全員チェック</button>
        <button type="button" style={smallBtn} onClick={() => setRows((rs) => uncheckAll(rs))} disabled={disabled}>全解除</button>
        <span style={{ fontSize: 12, color: "var(--sub)" }}>出勤者 {attended.length} 人（{bizToday} の出勤打刻あり）が上に並びます</span>
      </div>
      <div className="nox-bulk-list" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {shown.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>（対象なし）</p>}
        {shown.map((r) => (
          <label key={r.castId} className="nox-bulk-row" style={{ display: "grid", gridTemplateColumns: "auto 1fr 140px", gap: 8, alignItems: "center", opacity: disabled ? 0.6 : 1 }}>
            <input type="checkbox" checked={r.checked} onChange={(e) => setRow(r.castId, { checked: e.target.checked })} disabled={disabled} aria-label={`${r.name} を選択`} />
            <span style={{ fontSize: 13 }}>
              {r.name}
              {r.attended && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 8px", border: "1px solid var(--line2)", color: "var(--champ)" }}>出勤</span>}
            </span>
            <input type="number" min={1} step={1} inputMode="numeric" value={r.amount} placeholder="金額(円)" aria-label={`${r.name} の金額`}
              onChange={(e) => setRow(r.castId, { amount: e.target.value })} disabled={disabled} style={inp} />
          </label>
        ))}
      </div>
      <label style={{ fontSize: 12, color: "var(--sub)", display: "block", marginBottom: 16 }}><span style={{ display: "block", marginBottom: 6 }}>メモ（全員共通）</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} disabled={disabled} style={inp} />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="num" style={{ fontSize: 13, fontWeight: 800 }}>{summary.label}</span>
        <button type="button" className="nox-btn" onClick={() => void submit()} disabled={busy || disabled || summary.n === 0}>{busy ? "発行中…" : `${label}を一括発行`}</button>{/* 実行＝青塗り（裁定242） */}
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>
        {kind === "advance" ? "給与から天引きされます（手取り不足時は翌月へ繰越）。1 回の発行は 1 まとまり＝1 人でも拒否されると全員分が発行されません。" : "当月精算（繰越なし）。金額は送りベース額をあらかじめ入れています（行ごとに変更可）。"}
      </p>
      {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}

      {/* ★302-3: 当日（営業日）の発行済み一覧＝cast・額・メモ・取消（既存 route） */}
      <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "24px 0 12px" }}>本日（{bizToday}）の発行済み</h3>
      {issuedErr && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>取得できませんでした</p>}
      {!issuedErr && issued === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>—</p>}
      {issued !== null && !issuedErr && issued.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>本日の発行はありません</p>}
      {issued !== null && !issuedErr && issued.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {issued.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="nox-bulk-issued" style={{ display: "grid", gridTemplateColumns: "72px 1fr auto auto", gap: 8, alignItems: "center", fontSize: 13, opacity: r.status === "cancelled" ? 0.6 : 1 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--sub)" }}>{ISSUE_LABEL[r.kind]}</span>
              <span>{nameOf(r.castId)}{r.note && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--sub)" }}>{r.note}</span>}</span>
              <span className="num">¥{r.amount.toLocaleString("en-US")}</span>
              {r.status === "cancelled" ? (
                <span style={{ fontSize: 12, color: "var(--sub)" }}>取消済</span>
              ) : cancelArm === r.id ? (
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={{ ...smallBtn, color: "var(--bad)", borderColor: "var(--bad)" }} onClick={() => void cancelIssued(r)} disabled={cancelBusy === r.id}>{cancelBusy === r.id ? "取消中…" : "取り消す"}</button>
                  <button type="button" style={smallBtn} onClick={() => setCancelArm(null)}>やめる</button>
                </span>
              ) : (
                <button type="button" style={smallBtn} onClick={() => setCancelArm(r.id)}>取消</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
