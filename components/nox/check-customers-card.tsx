"use client";

// ★裁定305（mig0153・2026-09-25・D1）: レジ「指名・席」タブの「顧客」カード＝伝票の顧客一覧（check_customer_names＝can_register の cast にも出る）・
//   追加（customers の直 SELECT＝RLS・client filter＝305-8）・外す（check_customer_remove）・注文行の「誰の注文」（check_line_set_customer・null＝解除）・
//   キープ出し（顧客の active なキープから 1 タップ＝bottle_keep_out・冪等キーは押下ごと・印字名「キープ出し …」は RPC が付ける）。
//   RPC の二重防御が正（権限・org／店・open・'not on check'・'keep not active'）。fetch＝1 回（names／customers／bottle_keeps の 3 クエリ並列）。メッセージは裁定281 の型。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// ★裁定321（2026-09-29・便 X-11-2）: 「新規登録して追加」＝名前必須・ふりがな・電話任意 → customer_register → check_customer_add。詳細は /customers で後編集。
//   customer_register の権限は owner／manager／顧客権限のある staff（RPC 追加 0 の便＝cast とレジ権限のみの staff は 'forbidden' の文言を出す）。
// ★便 X-11-2b: 候補表示＝検索欄が空なら一覧は出さず「最近来店 5 人」「担当キャストの顧客（5 人まで）」。1 文字以上で名前／ふりがな／電話の部分一致・
//   最終来店日の降順・10 件＋「さらに表示」。0 件のときは「新規登録して追加」を主ボタンに。材料＝customers の直読（tel を含む）＋ customer_list_summary の戻り。
// ★便 X-11-3: 候補の行から直接「追加」（選択→追加の 2 段をやめる）・メッセージは追加欄の直下に出す（カードの最下部だと見えない）。
import { CANDIDATE_PAGE, candidatesOf, idleCandidatesOf, lastVisitLabelOf, pageOf, searchCandidatesOf, type Candidate, type CandidateSummary } from "@/lib/nox/register/customer-candidates";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";

type Named = { customer_id: string; pos: number; name: string; bottle_names: string[] };
type Cust = { id: string; name: string; furigana: string | null; tel?: string | null };
type Keep = { id: string; customer_id: string | null; bottle_name: string | null; product_id: string; remaining_pct: number | null; shelf_no: string | null; last_used_at: string | null };
export type CustomerLine = { id: string; name_snapshot: string; kind: string; line_total: number; customer_id?: string | null; time_auto?: boolean };

/** RPC のエラー語→和文（裁定281・握り潰さない） */
export function checkCustomerErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (m.includes("exists")) return "その顧客はすでにこの伝票に付いています";
  if (m.includes("bad name")) return "名前は 1〜80 文字で入力してください";
  if (m.includes("invalid customer")) return "顧客が不正です（同じ店の顧客を選択してください）";
  if (m.includes("not on check")) return "この伝票に付いていない顧客です（先に顧客を追加してください）";
  if (m.includes("keep not active")) return "このキープは出せません（保管中ではありません）";
  if (m.includes("not open")) return "会計済みの伝票には操作できません";
  if (m.includes("billing locked")) return "ご契約の状態により操作できません";
  if (m.includes("forbidden")) return "権限がありません";
  return `処理できませんでした（コード: ${m || "unknown"}）`;
}

export default function CheckCustomersCard({ checkId, storeId, isOpen, lines, products, onChanged, castIds = [] }: {
  checkId: string; storeId: string; isOpen: boolean;
  /** ★X-11-2b: 伝票の指名キャスト（担当キャストの顧客の候補に使う） */
  castIds?: string[];
  /** 伝票の明細（注文者の付け替え対象＝自動時間行以外） */
  lines: CustomerLine[];
  products: { id: string; name: string }[];
  /** RPC 後に親の伝票を読み直す */
  onChanged: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [named, setNamed] = useState<Named[] | null>(null);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [keeps, setKeeps] = useState<Keep[]>([]);
  const [summary, setSummary] = useState<CandidateSummary[]>([]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(CANDIDATE_PAGE);
  const [active, setActive] = useState(-1); // ★X-11-8: 検索候補の ↑↓ の位置
  const [reg, setReg] = useState<{ open: boolean; name: string; furigana: string; tel: string }>({ open: false, name: "", furigana: "", tel: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);

  const load = useCallback(async () => {
    const [n, c, sm] = await Promise.all([
      supabase.rpc("check_customer_names", { p_check_id: checkId }),
      supabase.from("customers").select("id, name, furigana, tel").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.rpc("customer_list_summary", { p_store_id: storeId, p_include_dormant: true }), // ★X-11-2b: 最終来店・担当（読めないロールは空＝名前順の検索だけになる）
    ]);
    setSummary(sm.error ? [] : ((sm.data ?? []) as CandidateSummary[]));
    const rows = ((n.data ?? []) as Named[]);
    setNamed(n.error ? [] : rows);
    setCusts(((c.data ?? []) as Cust[]));
    const ids = rows.map((r) => r.customer_id);
    if (ids.length === 0) { setKeeps([]); return; }
    const { data: ks } = await supabase.from("bottle_keeps").select("id, customer_id, bottle_name, product_id, remaining_pct, shelf_no, last_used_at").in("customer_id", ids).eq("status", "active").order("opened_at");
    setKeeps((ks ?? []) as Keep[]);
  }, [supabase, checkId, storeId]);
  useEffect(() => { void load(); }, [load]);

  const onCheck = new Set((named ?? []).map((r) => r.customer_id));
  const candidates = candidatesOf(custs, summary, onCheck);
  const idle = idleCandidatesOf(candidates, castIds);
  const hits = pageOf(searchCandidatesOf(candidates, q), shown);
  const searching = q.trim() !== "";
  const nameOf = (id: string | null | undefined) => (named ?? []).find((r) => r.customer_id === id)?.name ?? custs.find((c) => c.id === id)?.name ?? "（顧客）";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "（商品）";

  async function call(label: string, fn: string, args: Record<string, unknown>, okText: string) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: `${label}: ${checkCustomerErrJa(error.message)}` }); return; }
    setMsg({ kind: "success", text: okText });
    await load();
    await onChanged();
  }

  // ★裁定321: 新規登録して追加（customer_register → check_customer_add）。登録は通ったが追加に失敗したときは、その旨を出して一覧に残す
  async function registerAndAdd() {
    if (busy) return;
    const name = reg.name.trim();
    if (name === "" || name.length > 80) { setMsg({ kind: "error", text: "名前は 1〜80 文字で入力してください" }); return; }
    setBusy(true); setMsg(null);
    const r1 = await supabase.rpc("customer_register", { p_store_id: storeId, p_name: name, p_furigana: reg.furigana.trim() || null, p_tel: reg.tel.trim() || null });
    if (r1.error) {
      setBusy(false);
      setMsg({ kind: "error", text: r1.error.message.includes("forbidden") ? "顧客の新規登録に失敗: 登録する権限がありません（店長・顧客権限のあるスタッフから登録してください）" : `顧客の新規登録に失敗: ${checkCustomerErrJa(r1.error.message)}` });
      return;
    }
    const r2 = await supabase.rpc("check_customer_add", { p_check_id: checkId, p_customer_id: r1.data as string });
    setBusy(false);
    setMsg(r2.error
      ? { kind: "error", text: `${name} を登録しましたが、伝票への追加に失敗: ${checkCustomerErrJa(r2.error.message)}` }
      : { kind: "success", text: `${name} を登録して付けました` });
    setReg({ open: false, name: "", furigana: "", tel: "" }); setQ(""); setShown(CANDIDATE_PAGE);
    await load();
    if (!r2.error) await onChanged();
  }
  const addRow = (c: Candidate, i = -1) => (
    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 4px", borderBottom: "1px solid var(--line2)", ...(i >= 0 && i === active ? { outline: "1px solid var(--champ)", borderRadius: 8 } : {}) }}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 700 }}>{c.name}</span>
        {c.furigana && <span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 6 }}>{c.furigana}</span>}
        <span style={{ display: "block", fontSize: 11, color: "var(--sub)" }}>{lastVisitLabelOf(c.lastVisit)}{c.visits > 0 ? `・${c.visits} 回` : ""}</span>
      </span>
      <button type="button" className="nox-btn" disabled={busy}
        onClick={() => void call("追加", "check_customer_add", { p_check_id: checkId, p_customer_id: c.id }, `${c.name} を追加しました`)}>追加</button>
    </div>
  );

  const targetLines = lines.filter((l) => !l.time_auto && l.kind !== "keep_out");
  return (
    <div className="nox-cardtop" style={t.card}>
      <h3 style={t.cardTitle}>顧客</h3>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" }}>この伝票のお客様。最初の 1 人が来店の名義（併存）になります。注文行ごとに「誰の注文」を付けられます。</p>
      {named === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>—</p>}
      {named !== null && named.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>顧客はまだ付いていません。</p>}
      {named !== null && named.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {named.map((r) => (
            <div key={r.customer_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span className="num" style={{ fontSize: 11, color: "var(--sub)", width: 18 }}>{r.pos + 1}</span>
              <span style={{ fontWeight: 700 }}>{r.name}</span>
              {r.bottle_names.length > 0 && <span style={{ fontSize: 11.5, color: "var(--sub)" }}>キープ {r.bottle_names.join("・")}</span>}
              {isOpen && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy}
                onClick={() => void call("外す", "check_customer_remove", { p_check_id: checkId, p_customer_id: r.customer_id }, `${r.name} を外しました`)}>外す</button>}
            </div>
          ))}
        </div>
      )}
      {isOpen && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>顧客を追加</div>
          {custs.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>顧客一覧を読める権限がありません（既存の顧客の追加は店長・顧客権限のあるスタッフから）。</p>}
          {custs.length > 0 && (
            <>
              <input value={q} onChange={(e) => { setQ(e.target.value); setShown(CANDIDATE_PAGE); setActive(-1); }} placeholder="名前・ふりがな・電話で検索" aria-label="顧客を検索" disabled={busy}
                onKeyDown={(e) => {
                  // ★X-11-8: キーボード ↑↓ で候補を選び Enter で追加（検索中の一覧が対象）
                  if (!searching || hits.rows.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.rows.length - 1, a + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  else if (e.key === "Enter" && active >= 0 && hits.rows[active]) { e.preventDefault(); const c = hits.rows[active]; void call("追加", "check_customer_add", { p_check_id: checkId, p_customer_id: c.id }, `${c.name} を追加しました`); }
                }}
                style={{ ...t.input, width: "100%", maxWidth: 320, marginBottom: 6 }} />
              {/* ★X-11-2b: 検索欄が空＝一覧は出さない。最近来店 5 人と担当キャストの顧客だけ */}
              {!searching && (
                <>
                  {idle.recent.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)" }}>最近来店</div>
                      {idle.recent.map((c) => addRow(c))}
                    </div>
                  )}
                  {idle.mine.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)" }}>担当キャストの顧客</div>
                      {idle.mine.map((c) => addRow(c))}
                    </div>
                  )}
                  {idle.recent.length === 0 && idle.mine.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>名前・ふりがな・電話の一部を入れると候補が出ます。</p>}
                </>
              )}
              {searching && (
                <div style={{ marginBottom: 6 }}>
                  {hits.rows.map((c, i) => addRow(c, i))}
                  {hits.rest > 0 && (
                    <div className="nox-actions" style={{ marginTop: 6 }}>
                      <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setShown((n) => n + CANDIDATE_PAGE)}>さらに表示（残り {hits.rest} 人）</button>
                    </div>
                  )}
                  {hits.rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>該当する顧客がいません。</p>}
                </div>
              )}
            </>
          )}
          {/* ★裁定321: 新規登録して追加（0 件のときは主ボタン） */}
          {!reg.open ? (
            <div className="nox-actions" style={{ justifyContent: "flex-start", marginTop: 4 }}>
              <button type="button" disabled={busy}
                style={searching && hits.rows.length === 0 ? { ...t.btnGold, ...t.btnSm } : { ...t.btnGhost, ...t.btnSm }}
                onClick={() => setReg({ open: true, name: q.trim(), furigana: "", tel: "" })}>新規登録して追加</button>
            </div>
          ) : (
            <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 4 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ ...t.fieldLabel, display: "block" }}>名前（必須）
                  <input value={reg.name} maxLength={80} autoFocus disabled={busy} onChange={(e) => setReg((v) => ({ ...v, name: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 3 }} aria-label="新しい顧客の名前" />
                </label>
                <label style={{ ...t.fieldLabel, display: "block" }}>ふりがな（任意）
                  <input value={reg.furigana} maxLength={80} disabled={busy} onChange={(e) => setReg((v) => ({ ...v, furigana: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 3 }} aria-label="新しい顧客のふりがな" />
                </label>
                <label style={{ ...t.fieldLabel, display: "block" }}>電話（任意）
                  <input value={reg.tel} maxLength={30} inputMode="tel" disabled={busy} onChange={(e) => setReg((v) => ({ ...v, tel: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 3 }} aria-label="新しい顧客の電話" />
                </label>
              </div>
              <p style={{ fontSize: 11, color: "var(--sub)", margin: "6px 0 0" }}>誕生日・好み・担当などの詳細は、あとで顧客ページで編集できます。</p>
              <div className="nox-actions" style={{ marginTop: 8 }}>
                <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => setReg({ open: false, name: "", furigana: "", tel: "" })}>やめる</button>
                <button type="button" style={{ ...t.btnGold, ...t.btnSm, opacity: busy || reg.name.trim() === "" ? 0.5 : 1 }} disabled={busy || reg.name.trim() === ""} onClick={() => void registerAndAdd()}>{busy ? "登録中…" : "登録して追加"}</button>
              </div>
            </div>
          )}
          {/* ★X-11-3: メッセージは追加欄の直下（最下部だと誰の注文／キープ出しの下に隠れて見えない） */}
          {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message></div>}
        </div>
      )}
      {/* 誰の注文＝注文行ごとに顧客を付ける（null＝解除） */}
      {isOpen && named !== null && named.length > 0 && targetLines.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen}>誰の注文 {whoOpen ? "を閉じる" : "を付ける"}</button>
          {whoOpen && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {targetLines.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name_snapshot} <span className="num" style={{ color: "var(--sub)" }}>¥{l.line_total.toLocaleString("en-US")}</span></span>
                  <select value={l.customer_id ?? ""} disabled={busy} aria-label={`${l.name_snapshot} の注文者`} style={{ ...t.input, width: "auto", padding: "6px 8px", fontSize: 12 }}
                    onChange={(e) => { const v = e.target.value || null; void call("注文者", "check_line_set_customer", { p_line_id: l.id, p_customer_id: v }, v ? `${l.name_snapshot} を ${nameOf(v)} の注文にしました` : `${l.name_snapshot} の注文者を解除しました`); }}>
                    <option value="">（未指定＝均等割り）</option>
                    {named.map((r) => <option key={r.customer_id} value={r.customer_id}>{r.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* キープ出し＝顧客の active なキープから 1 タップ（bottle_keep_out・冪等キーは押下ごと） */}
      {named !== null && named.length > 0 && keeps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>キープ出し（0 円の明細「キープ出し」を足します・在庫は減りません）</div>
          <div style={{ display: "grid", gap: 6 }}>
            {keeps.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span>{k.bottle_name ?? productName(k.product_id)}<span style={{ color: "var(--sub)", marginLeft: 6 }}>{nameOf(k.customer_id)}{k.remaining_pct != null ? `・残 ${k.remaining_pct}%` : ""}{k.shelf_no ? `・棚 ${k.shelf_no}` : ""}</span></span>
                {isOpen && <button type="button" className="nox-btn" style={{ marginLeft: "auto" }} disabled={busy}
                  onClick={() => void call("キープ出し", "bottle_keep_out", { p_keep_id: k.id, p_check_id: checkId, p_idem_key: crypto.randomUUID() }, `${k.bottle_name ?? productName(k.product_id)} を出しました`)}>出す</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isOpen && msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
    </div>
  );
}
