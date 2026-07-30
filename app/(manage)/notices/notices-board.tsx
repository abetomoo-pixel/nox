"use client";

// お知らせ・連絡ボード（F3e・mig0034）。RLS が可視範囲を物理保証（store_id=auth_store_id()・
// cast は all/cast のみ）＝client 側フィルタ不要。投稿/編集/削除は owner/manager のみ（notice_* RPC が
// 真の防御・UI でも isManagerUp で出し分け）。期限切れ（until<営業日）は削除も raise もせず「期限切れ」
// バッジのみ（0034 設計ロック＝DB は保持・表示側判定）。編集は全フィールド明示送信（規約7）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf, addDays } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";

type Notice = {
  id: string; title: string; body: string; audience: string;
  pinned: boolean; until: string | null; created_at: string;
};

const AUD_LABEL: Record<string, string> = { all: "全員", cast: "キャスト", staff: "黒服" };
const AUD_OPTIONS: Array<[string, string]> = [["all", "全員"], ["cast", "キャスト"], ["staff", "黒服"]];
// 掲載期限セグメント（モックの日数セグメント 0/1/3/7 に対応・0=期限なし）
const UNTIL_SEG: Array<[number, string]> = [[0, "期限なし"], [1, "当日"], [3, "3日"], [7, "7日"]];

// RPC エラーの日本語化（notices 系）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad title")) return "件名を入力してください（80字以内）";
  if (msg.includes("bad body")) return "本文を入力してください（4000字以内）";
  if (msg.includes("bad audience")) return "公開範囲の指定が不正です";
  if (msg.includes("bad pinned")) return "ピン設定が不正です";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// 段0R 第3陣: 器は共通クラス nox-panel・見出しは nox-panel > h3（白）へ統一＝card/secTitle は撤去。
const input: React.CSSProperties = { ...t.input, fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const chkLabel: React.CSSProperties = { ...t.fieldLabel, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" };

export default function NoticesBoard({ isManagerUp }: { isManagerUp: boolean }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [rows, setRows] = useState<Notice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 投稿フォーム
  const [fTitle, setFTitle] = useState("");
  const [fBody, setFBody] = useState("");
  const [fAud, setFAud] = useState("all");
  const [fPinned, setFPinned] = useState(false);
  const [fUntilSeg, setFUntilSeg] = useState(0);
  // 編集（inline・until は date 入力で任意値を保持）
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eBody, setEBody] = useState("");
  const [eAud, setEAud] = useState("all");
  const [ePinned, setEPinned] = useState(false);
  const [eUntil, setEUntil] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notices")
      .select("id, title, body, audience, pinned, until, created_at")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Notice[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const untilFromSeg = (seg: number): string | null => (seg === 0 ? null : addDays(bizToday, seg));

  async function post() {
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("notice_create", {
      p_title: fTitle, p_body: fBody, p_audience: fAud, p_pinned: fPinned, p_until: untilFromSeg(fUntilSeg),
    });
    setBusy(false);
    if (error) { setMsg(`投稿に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("お知らせを投稿しました");
    setFTitle(""); setFBody(""); setFAud("all"); setFPinned(false); setFUntilSeg(0);
    await load();
  }

  function startEdit(n: Notice) {
    setEditId(n.id); setETitle(n.title); setEBody(n.body); setEAud(n.audience);
    setEPinned(n.pinned); setEUntil(n.until ?? ""); setMsg(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setMsg(null); setBusy(true);
    // 規約7: 全フィールド明示送信（pinned は明示 boolean・until は空=null）
    const { error } = await supabase.rpc("notice_update", {
      p_notice_id: editId, p_title: eTitle, p_body: eBody, p_audience: eAud,
      p_pinned: ePinned, p_until: eUntil || null,
    });
    setBusy(false);
    if (error) { setMsg(`変更に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("お知らせを変更しました");
    setEditId(null);
    await load();
  }

  async function del(n: Notice) {
    if (!window.confirm(`「${n.title}」を削除しますか？`)) return;
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("notice_delete", { p_notice_id: n.id });
    setBusy(false);
    if (error) { setMsg(`削除に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("削除しました");
    await load();
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  const isExpired = (n: Notice) => !!n.until && n.until < bizToday;

  return (
    <div>
      {/* 段0R 第3陣: ヘッダを新シェルの nox-hero へ（他画面と同基準・表示のみ） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>お知らせ</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            店舗の連絡ボード（{isManagerUp ? "投稿・編集可" : "閲覧のみ"}）
          </p>
        </div>
      </div>
      <Toast msg={msg} />

      {isManagerUp && (
        <section className="nox-panel">
          <h3>お知らせを投稿</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="件名（80字まで）" maxLength={80} style={input} />
            <textarea value={fBody} onChange={(e) => setFBody(e.target.value)} placeholder="本文（4000字まで）" maxLength={4000} rows={3}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={t.fieldLabel}>公開範囲</span>
              <select value={fAud} onChange={(e) => setFAud(e.target.value)} style={{ ...input, width: "auto" }}>
                {AUD_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label style={chkLabel}>
                <input type="checkbox" checked={fPinned} onChange={(e) => setFPinned(e.target.checked)} />ピン留め
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={t.fieldLabel}>掲載期限</span>
              {UNTIL_SEG.map(([v, l]) => (
                <button key={v} style={v === fUntilSeg ? btnDark : btnLight} onClick={() => setFUntilSeg(v)}>{l}</button>
              ))}
            </div>
            <div>
              <button style={{ ...btnDark, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={post}>投稿</button>
            </div>
          </div>
        </section>
      )}

      <section className="nox-panel">
        <h3>お知らせ一覧</h3>
        {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>お知らせはありません。</p>}
        {rows.map((n) => editId === n.id ? (
          <div key={n.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} maxLength={80} style={input} />
            <textarea value={eBody} onChange={(e) => setEBody(e.target.value)} maxLength={4000} rows={3}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={eAud} onChange={(e) => setEAud(e.target.value)} style={{ ...input, width: "auto" }}>
                {AUD_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label style={chkLabel}>
                <input type="checkbox" checked={ePinned} onChange={(e) => setEPinned(e.target.checked)} />ピン留め
              </label>
              <span style={t.fieldLabel}>掲載期限</span>
              <input type="date" value={eUntil} onChange={(e) => setEUntil(e.target.value)} style={{ ...input, width: "auto" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...btnDark, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={saveEdit}>保存</button>
              <button style={btnLight} onClick={() => setEditId(null)}>キャンセル</button>
            </div>
          </div>
        ) : (
          /* 段L2: 一覧行のリッチ化（モック .nrow/.nhead/.aud/.nbody）。
             ★出す情報は現行と完全に同一（ピン・件名・公開範囲・期限切れ・投稿日時・本文・掲載期限・編集/削除）。
             audience の出し分けは RLS と RPC が担い、ここは表示だけ＝機能不変。 */
          <div key={n.id} className="nox-nrow">
            <div className="nox-nhead">
              {n.pinned && <span className="nox-aud" style={{ borderColor: "var(--gold)", color: "var(--gold)", fontWeight: 700 }}>ピン</span>}
              <span className="t">{n.title}</span>
              <span className="nox-aud">{AUD_LABEL[n.audience] ?? n.audience}</span>
              {isExpired(n) && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bad)" }}>期限切れ</span>}
              <span className="when num">{when(n.created_at)}</span>
            </div>
            <p className="nox-nbody">{n.body}</p>
            {n.until && <p className="num" style={{ fontSize: 11, color: "var(--v2-muted)", margin: "3px 0 0" }}>掲載期限 {n.until}</p>}
            {isManagerUp && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button style={btnLight} onClick={() => startEdit(n)}>編集</button>
                <button style={btnLight} onClick={() => void del(n)}>削除</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
