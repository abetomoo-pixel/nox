"use client";

// ★裁定368／370（GV-19・GV-21・便 GV-A・2026-10-14）: お客様を選ぶ共通モーダル。
//   入口＝①ボトル（キープ対象の商品）を明細に入れた直後に自動で開く（368）／②明細の各商品行の「お客様」チップ（370）／③ボトルのキープ登録で伝票にお客様が居ないとき。
//   中身＝最近来店 5 名・担当キャストのお客様・名前／ふりがな／電話検索・「新規登録して追加」・「あとで」（キャスト選択モーダルと同形）。
//   選んだお客様が伝票に未付与なら来店のお客様（併存）として check_customer_add → その行へ check_line_set_customer。顧客セクションへは飛ばない。
//   保存先は従来どおり注文行の customer_id（RPC 不変・N+1 なし＝候補は customers 1 本＋customer_list_summary 1 本）。
//   用語は「お客様」で統一（旧用語は画面・明細・印刷のどこにも出さない＝370）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { CANDIDATE_PAGE, candidatesOf, idleCandidatesOf, lastVisitLabelOf, pageOf, searchCandidatesOf, type Candidate, type CandidateSummary } from "@/lib/nox/register/customer-candidates";

export type CustomerPickTarget = { lineId: string; lineName: string; isBottle: boolean; currentCustomerId: string | null };
type Named = { customer_id: string; name: string; pos: number };
type Cust = { id: string; name: string; furigana: string | null; tel: string | null };

/** 見出し＝ボトルは「このボトルのお客様を選ぶ」・それ以外は「この注文のお客様を選ぶ」（370） */
export function customerPickTitleOf(isBottle: boolean): string { return isBottle ? "このボトルのお客様を選ぶ" : "この注文のお客様を選ぶ"; }
/** 行内チップの文言＝未指定「お客様 未指定」／指定済み＝名前（370） */
export function customerChipLabelOf(name: string | null | undefined): string { return name && name.trim() !== "" ? name : "お客様 未指定"; }
/** 「お客様」チップを出す行＝商品行だけ（料金行＝セット・延長・指名料・サービス料・割引・キープ出しには出さない＝370） */
export function customerChipLineOf(l: { product_id?: string | null; time_auto?: boolean | null; kind?: string | null; fee_kind?: string | null }): boolean {
  return !!l.product_id && !l.time_auto && !l.fee_kind && l.kind !== "time" && l.kind !== "discount" && l.kind !== "keep_out" && l.kind !== "charge";
}

const errJa = (m: string): string => m.includes("forbidden") ? "権限がありません（店長・顧客権限のあるスタッフから操作してください）" : m.includes("not open") ? "会計済みの伝票には付けられません" : m;

export default function CustomerPickModal({ storeId, checkId, target, castIds = [], onClose, onPicked }: {
  storeId: string; checkId: string; target: CustomerPickTarget;
  /** 伝票の指名キャスト（担当キャストのお客様の候補に使う） */
  castIds?: string[];
  onClose: () => void;
  /** 付け替え後（name＝null は外した）。親は伝票を読み直す */
  onPicked: (name: string | null) => void | Promise<void>;
}) {
  const supabase = createClient();
  const [named, setNamed] = useState<Named[] | null>(null);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [summary, setSummary] = useState<CandidateSummary[]>([]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(CANDIDATE_PAGE);
  const [reg, setReg] = useState<{ open: boolean; name: string; furigana: string; tel: string }>({ open: false, name: "", furigana: "", tel: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [n, c, sm] = await Promise.all([
      supabase.rpc("check_customer_names", { p_check_id: checkId }),
      supabase.from("customers").select("id, name, furigana, tel").eq("store_id", storeId).eq("is_active", true).order("name"),
      supabase.rpc("customer_list_summary", { p_store_id: storeId, p_include_dormant: true }),
    ]);
    setSummary(sm.error ? [] : ((sm.data ?? []) as CandidateSummary[]));
    setNamed(n.error ? [] : ((n.data ?? []) as Named[]));
    setCusts(((c.data ?? []) as Cust[]));
  }, [supabase, checkId, storeId]);
  useEffect(() => { void load(); }, [load]);

  const onCheck = new Set((named ?? []).map((r) => r.customer_id));
  const candidates = candidatesOf(custs, summary, new Set<string>()); // 伝票に付いている人も候補に出す（この行に付け替えるため）
  const idle = idleCandidatesOf(candidates, castIds);
  const hits = pageOf(searchCandidatesOf(candidates, q), shown);
  const searching = q.trim() !== "";
  const currentName = target.currentCustomerId ? (named ?? []).find((r) => r.customer_id === target.currentCustomerId)?.name ?? custs.find((c) => c.id === target.currentCustomerId)?.name ?? null : null;

  /** 選ぶ＝伝票に未付与なら併存で追加 → 行へ付ける（null＝外す） */
  async function pick(customerId: string | null, name: string | null) {
    if (busy) return;
    setBusy(true); setMsg(null);
    if (customerId && !onCheck.has(customerId)) {
      const r1 = await supabase.rpc("check_customer_add", { p_check_id: checkId, p_customer_id: customerId });
      if (r1.error && !r1.error.message.includes("exists")) { setBusy(false); setMsg({ kind: "error", text: `伝票への追加: ${errJa(r1.error.message)}` }); return; }
    }
    const r2 = await supabase.rpc("check_line_set_customer", { p_line_id: target.lineId, p_customer_id: customerId });
    setBusy(false);
    if (r2.error) { setMsg({ kind: "error", text: `お客様の設定: ${errJa(r2.error.message)}` }); return; }
    await onPicked(name);
  }
  async function registerAndPick() {
    if (busy) return;
    const name = reg.name.trim();
    if (name === "" || name.length > 80) { setMsg({ kind: "error", text: "名前は 1〜80 文字で入力してください" }); return; }
    setBusy(true); setMsg(null);
    const r1 = await supabase.rpc("customer_register", { p_store_id: storeId, p_name: name, p_furigana: reg.furigana.trim() || null, p_tel: reg.tel.trim() || null });
    setBusy(false);
    if (r1.error) { setMsg({ kind: "error", text: `新規登録: ${errJa(r1.error.message)}` }); return; }
    await pick(r1.data as string, name);
  }

  const row = (c: Candidate) => (
    <button key={c.id} type="button" className="nox-custrow" disabled={busy} data-cust-id={c.id} onClick={() => void pick(c.id, c.name)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: onCheck.has(c.id) ? "var(--goldface2)" : "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 12px", color: "var(--ink)", font: "inherit", cursor: "pointer" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{c.name}</span>
        {c.furigana && <span style={{ fontSize: 11, color: "var(--sub)", marginLeft: 6 }}>{c.furigana}</span>}
        <span style={{ display: "block", fontSize: 11, color: "var(--sub)" }}>{lastVisitLabelOf(c.lastVisit)}{c.visits > 0 ? `・${c.visits} 回` : ""}{onCheck.has(c.id) ? "・この伝票のお客様" : ""}</span>
      </span>
      <span style={{ ...t.tag, fontSize: 10.5 }}>選ぶ</span>
    </button>
  );

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={480} scroll>
      <div data-cust-pick="1" data-cust-pick-kind={target.isBottle ? "bottle" : "line"}>
        <div className="nox-formmodal-head">
          <strong>{customerPickTitleOf(target.isBottle)}</strong>
          <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>{target.lineName}{currentName ? <span style={{ marginLeft: 8, color: "var(--sub)" }}>いま: <b style={{ color: "var(--champ)" }}>{currentName}</b></span> : null}</p>
        <input value={q} onChange={(e) => { setQ(e.target.value); setShown(CANDIDATE_PAGE); }} placeholder="名前・ふりがな・電話で検索" aria-label="お客様を検索" autoFocus
          style={{ ...t.input, width: "100%", marginBottom: 8 }} />
        {named === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>読み込み中…</p>}
        {named !== null && !searching && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {idle.recent.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)" }}>最近来店</div>}
            {idle.recent.map(row)}
            {idle.mine.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)", marginTop: 4 }}>担当キャストのお客様</div>}
            {idle.mine.map(row)}
            {idle.recent.length === 0 && idle.mine.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>名前・ふりがな・電話で検索するか、新規登録してください。</p>}
          </div>
        )}
        {named !== null && searching && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {hits.rows.map(row)}
            {hits.rest > 0 && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setShown((n) => n + CANDIDATE_PAGE)}>さらに表示（残り {hits.rest}）</button>}
            {hits.rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>該当するお客様がいません。</p>}
          </div>
        )}
        {!reg.open ? (
          <button type="button" disabled={busy} data-cust-register="1"
            style={searching && hits.rows.length === 0 ? t.btnPrimary56 : { ...t.btnSecondary48, width: "100%" }}
            onClick={() => setReg({ open: true, name: q.trim(), furigana: "", tel: "" })}>新規登録して追加</button>
        ) : (
          <div className="nox-inset" style={{ padding: "10px 12px" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ ...t.fieldLabel, display: "block" }}>名前（必須）
                <input value={reg.name} maxLength={80} autoFocus disabled={busy} onChange={(e) => setReg((v) => ({ ...v, name: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ ...t.fieldLabel, display: "block" }}>ふりがな（任意）
                <input value={reg.furigana} maxLength={80} disabled={busy} onChange={(e) => setReg((v) => ({ ...v, furigana: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 4 }} />
              </label>
              <label style={{ ...t.fieldLabel, display: "block" }}>電話（任意）
                <input value={reg.tel} maxLength={30} inputMode="tel" disabled={busy} onChange={(e) => setReg((v) => ({ ...v, tel: e.target.value }))} style={{ ...t.input, width: "100%", marginTop: 4 }} />
              </label>
            </div>
            <button type="button" style={{ ...t.btnPrimary56, marginTop: 10, opacity: busy || reg.name.trim() === "" ? 0.5 : 1 }} disabled={busy || reg.name.trim() === ""} onClick={() => void registerAndPick()}>{busy ? "登録中…" : "登録してこの行に付ける"}</button>
            <div style={t.btnRow48}>
              <button type="button" style={t.btnSecondary48} disabled={busy} onClick={() => setReg({ open: false, name: "", furigana: "", tel: "" })}>やめる</button>
            </div>
          </div>
        )}
        {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message></div>}
        <div style={t.btnRow48}>
          {target.currentCustomerId && <button type="button" style={t.btnSecondary48} disabled={busy} data-cust-clear="1" onClick={() => void pick(null, null)}>お客様を外す</button>}
          <button type="button" style={t.btnSecondary48} disabled={busy} data-cust-later="1" onClick={onClose}>あとで</button>
        </div>
      </div>
    </Modal>
  );
}
