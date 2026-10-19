"use client";

// ★裁定368／370（GV-19・GV-21・便 GV-A）→★裁定377（GV-B W-7・2026-10-15）: お客様を選ぶ共通モーダル＝ボトルキープ登録・お客様チップ・伝票の顧客追加の 3 入口で同じ部品。
//   ①この伝票のお客様 ②候補（伝票キャストの担当客 5 → 最近来店 10）③全員（50 音チップ＋担当キャストチップ・50 件ずつ）④新規登録して選ぶ（名前必須）。検索欄は最上部固定。
//   mode: "line"＝注文行のお客様を付ける（未付与なら併存で check_customer_add → check_line_set_customer）／"add"＝伝票にお客様を追加（check_customer_add だけ）／"select"＝選ぶだけ（親が使う＝キープの持ち主）。
//   候補は customers 1 本＋customer_list_summary 1 本（N+1 なし・RPC 新設なし）。用語は「お客様」で統一（旧用語は画面・明細・印刷のどこにも出さない＝370）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import * as t from "@/lib/nox/ui/theme";
import { candidatesOf, idleCandidatesOf, lastVisitLabelOf, searchCandidatesOf, type Candidate, type CandidateSummary } from "@/lib/nox/register/customer-candidates";

export type CustomerPickTarget = { lineId: string; lineName: string; isBottle: boolean; currentCustomerId: string | null };
export type CustomerPickMode = "line" | "add" | "select";
type Named = { customer_id: string; name: string; pos: number };
type Cust = { id: string; name: string; furigana: string | null; tel: string | null };
export type PickTab = "check" | "cand" | "all" | "new";
export const PICK_TAB_LABEL: Record<PickTab, string> = { check: "この伝票のお客様", cand: "候補", all: "全員", new: "新規登録して選ぶ" };
export const PICK_PAGE = 50;
/** 50 音チップ＝ふりがな（無ければ名前）の先頭で分類 */
export const KANA_ROWS: ReadonlyArray<readonly [string, RegExp]> = [
  ["あ", /^[あ-おぁ-ぉアーオァ-ォ]/], ["か", /^[か-ごカ-ゴ]/], ["さ", /^[さ-ぞサ-ゾ]/], ["た", /^[た-どっタ-ドッ]/], ["な", /^[な-のナ-ノ]/],
  ["は", /^[は-ぽハ-ポ]/], ["ま", /^[ま-もマ-モ]/], ["や", /^[や-よゃ-ょヤ-ヨャ-ョ]/], ["ら", /^[ら-ろラ-ロ]/], ["わ", /^[わ-んワ-ン]/],
];
export const kanaRowOf = (s: string): string => { const h = (s ?? "").trim(); for (const [k, re] of KANA_ROWS) if (re.test(h)) return k; return "他"; };

/** 見出し＝ボトルは「このボトルのお客様を選ぶ」・それ以外は「この注文のお客様を選ぶ」（370）。add＝「伝票にお客様を追加」・select＝「お客様を選ぶ」 */
export function customerPickTitleOf(isBottle: boolean, mode: CustomerPickMode = "line"): string {
  if (mode === "add") return "伝票にお客様を追加";
  if (mode === "select") return "お客様を選ぶ";
  return isBottle ? "このボトルのお客様を選ぶ" : "この注文のお客様を選ぶ";
}
/** 行内チップの文言＝未指定「お客様 未指定」／指定済み＝名前（370） */
export function customerChipLabelOf(name: string | null | undefined): string { return name && name.trim() !== "" ? name : "お客様 未指定"; }
/** 「お客様」チップを出す行＝商品行だけ（料金行＝セット・延長・指名料・サービス料・割引・キープ出しには出さない＝370） */
export function customerChipLineOf(l: { product_id?: string | null; time_auto?: boolean | null; kind?: string | null; fee_kind?: string | null }): boolean {
  return !!l.product_id && !l.time_auto && !l.fee_kind && l.kind !== "time" && l.kind !== "discount" && l.kind !== "keep_out" && l.kind !== "charge";
}
/** 既定タブ＝この伝票のお客様がいれば①・いなければ候補があれば②・それも 0 なら③（377） */
export function pickDefaultTabOf(i: { onCheck: number; cand: number }): PickTab { return i.onCheck > 0 ? "check" : i.cand > 0 ? "cand" : "all"; }

const errJa = (m: string): string => m.includes("forbidden") ? "権限がありません（店長・顧客権限のあるスタッフから操作してください）" : m.includes("not open") ? "会計済みの伝票には付けられません" : m.includes("exists") ? "すでにこの伝票のお客様です" : m;

export default function CustomerPickModal({ storeId, checkId, target, mode = "line", castIds = [], casts = [], onClose, onPicked }: {
  storeId: string; checkId: string;
  /** line のときの対象行。add／select では省略可 */
  target?: CustomerPickTarget | null;
  mode?: CustomerPickMode;
  /** 伝票の指名キャスト（候補＝担当キャストのお客様） */
  castIds?: string[];
  /** 担当キャストチップ用（③全員） */
  casts?: { id: string; name: string }[];
  onClose: () => void;
  /** line＝付け替え後（name＝null は外した）／add＝追加後／select＝選んだ（id, name）。親は伝票を読み直す */
  onPicked: (name: string | null, customerId?: string | null) => void | Promise<void>;
}) {
  const supabase = createClient();
  const [named, setNamed] = useState<Named[] | null>(null);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [summary, setSummary] = useState<CandidateSummary[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<PickTab | null>(null);
  const [kana, setKana] = useState("");
  const [castChip, setCastChip] = useState("");
  const [shown, setShown] = useState(PICK_PAGE);
  const [reg, setReg] = useState<{ name: string; furigana: string; tel: string }>({ name: "", furigana: "", tel: "" });
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

  const onCheck = useMemo(() => new Set((named ?? []).map((r) => r.customer_id)), [named]);
  const candidates = useMemo(() => candidatesOf(custs, summary, new Set<string>()), [custs, summary]);
  const idle = useMemo(() => idleCandidatesOf(candidates, castIds), [candidates, castIds]);
  const candList = useMemo(() => { const seen = new Set<string>(); const out: Candidate[] = []; for (const c of [...idle.mine.slice(0, 5), ...idle.recent.slice(0, 10)]) { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } } return out; }, [idle]);
  const checkList = useMemo(() => (named ?? []).map((n) => candidates.find((c) => c.id === n.customer_id) ?? { id: n.customer_id, name: n.name, furigana: null, tel: null, lastVisit: null, castId: null, visits: 0 }), [named, candidates]);
  const searching = q.trim() !== "";
  const hits = useMemo(() => searchCandidatesOf(candidates, q), [candidates, q]);
  const allList = useMemo(() => candidates.filter((c) => (kana === "" || kanaRowOf(c.furigana ?? c.name) === kana) && (castChip === "" || c.castId === castChip)), [candidates, kana, castChip]);
  const curTab: PickTab = tab ?? (named === null ? "cand" : pickDefaultTabOf({ onCheck: checkList.length, cand: candList.length }));
  const currentName = target?.currentCustomerId ? (named ?? []).find((r) => r.customer_id === target.currentCustomerId)?.name ?? custs.find((c) => c.id === target.currentCustomerId)?.name ?? null : null;
  const isBottle = target?.isBottle ?? false;

  /** 選ぶ＝line: 未付与なら併存で追加→行へ／add: 伝票へ追加／select: 親へ返す */
  async function pick(customerId: string | null, name: string | null) {
    if (busy) return;
    if (mode === "select") { await onPicked(name, customerId); return; }
    setBusy(true); setMsg(null);
    if (customerId && !onCheck.has(customerId)) {
      const r1 = await supabase.rpc("check_customer_add", { p_check_id: checkId, p_customer_id: customerId });
      if (r1.error && !r1.error.message.includes("exists")) { setBusy(false); setMsg({ kind: "error", text: `伝票への追加: ${errJa(r1.error.message)}` }); return; }
    }
    if (mode === "add") { setBusy(false); await onPicked(name, customerId); return; }
    if (!target) { setBusy(false); return; }
    const r2 = await supabase.rpc("check_line_set_customer", { p_line_id: target.lineId, p_customer_id: customerId, p_keep: isBottle }) // ★便 P173（裁定392・0173）: ボトルの行＝会計前キープ（pending）を同時に作る（外すと消える・会計で確定・取消で削除）;
    setBusy(false);
    if (r2.error) { setMsg({ kind: "error", text: `お客様の設定: ${errJa(r2.error.message)}` }); return; }
    await onPicked(name, customerId);
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
        <span style={{ display: "block", fontSize: 11, color: "var(--sub)" }}>{lastVisitLabelOf(c.lastVisit)}{c.visits > 0 ? `・${c.visits} 回` : ""}{onCheck.has(c.id) ? "・この伝票のお客様" : ""}{c.castId && casts.find((k) => k.id === c.castId) ? `・担当 ${casts.find((k) => k.id === c.castId)!.name}` : ""}</span>
      </span>
      <span style={{ ...t.tag, fontSize: 10.5 }}>選ぶ</span>
    </button>
  );
  const chip = (on: boolean) => ({ ...t.btnGhost, ...t.btnSm, padding: "3px 10px", borderRadius: 999, ...(on ? { border: "1px solid var(--gold)", color: "var(--champ)", background: "var(--goldface2)" } : {}) });

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={520} scroll>
      <div data-cust-pick="1" data-cust-pick-kind={mode === "line" ? (isBottle ? "bottle" : "line") : mode} data-cust-tab={curTab}>
        <div className="nox-formmodal-head" style={{ position: "sticky", top: 0, background: "var(--card)", zIndex: 2, paddingBottom: 6 }}>{/* ★377: 検索欄は最上部固定 */}
          <strong>{customerPickTitleOf(isBottle, mode)}</strong>
          <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
        </div>
        <div style={{ position: "sticky", top: 36, background: "var(--card)", zIndex: 2, paddingBottom: 6 }}>
          {target && <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>{target.lineName}{currentName ? <span style={{ marginLeft: 8, color: "var(--sub)" }}>いま: <b style={{ color: "var(--champ)" }}>{currentName}</b></span> : null}</p>}
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PICK_PAGE); }} placeholder="名前・ふりがな・電話で検索" aria-label="お客様を検索" /* ★便 GV-C C-14b（GV-61）: 任意の欄＝autofocus なし（スマホでキーボードが候補を隠す） */
            style={{ ...t.input, width: "100%" }} data-cust-search="1" />
        </div>
        {!searching && (
          <div className="nox-segtabs" role="tablist" data-cust-tabs="1" style={{ margin: "8px 0" }}>
            {(["check", "cand", "all", "new"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={curTab === k} className={curTab === k ? "on" : ""} onClick={() => setTab(k)}>{PICK_TAB_LABEL[k]}{k === "check" && checkList.length ? ` ${checkList.length}` : ""}</button>
            ))}
          </div>
        )}
        {named === null && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>読み込み中…</p>}
        {named !== null && searching && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {hits.slice(0, shown).map(row)}
            {hits.length > shown && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setShown((n) => n + PICK_PAGE)}>さらに表示（残り {hits.length - shown}）</button>}
            {hits.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>該当するお客様がいません。「新規登録して選ぶ」から登録できます。</p>}
          </div>
        )}
        {named !== null && !searching && curTab === "check" && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {checkList.map(row)}
            {checkList.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>この伝票にはまだお客様が付いていません。</p>}
          </div>
        )}
        {named !== null && !searching && curTab === "cand" && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {idle.mine.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)" }}>担当キャストのお客様</div>}
            {idle.mine.slice(0, 5).map(row)}
            {idle.recent.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--champ)", marginTop: 4 }}>最近来店</div>}
            {idle.recent.slice(0, 10).filter((c) => !idle.mine.slice(0, 5).some((m) => m.id === c.id)).map(row)}
            {candList.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>候補がありません。「全員」か検索から選べます。</p>}
          </div>
        )}
        {named !== null && !searching && curTab === "all" && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} data-cust-kana="1">
              <button type="button" style={chip(kana === "")} onClick={() => { setKana(""); setShown(PICK_PAGE); }}>すべて</button>
              {KANA_ROWS.map(([k]) => <button key={k} type="button" style={chip(kana === k)} onClick={() => { setKana(k); setShown(PICK_PAGE); }}>{k}</button>)}
            </div>
            {casts.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} data-cust-castchips="1">
                <button type="button" style={chip(castChip === "")} onClick={() => { setCastChip(""); setShown(PICK_PAGE); }}>担当: 全員</button>
                {casts.map((k) => <button key={k.id} type="button" style={chip(castChip === k.id)} onClick={() => { setCastChip(k.id); setShown(PICK_PAGE); }}>{k.name}</button>)}
              </div>
            )}
            {allList.slice(0, shown).map(row)}
            {allList.length > shown && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => setShown((n) => n + PICK_PAGE)}>さらに表示（残り {allList.length - shown}・{PICK_PAGE} 件ずつ）</button>}
            {allList.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>該当するお客様がいません。</p>}
          </div>
        )}
        {named !== null && !searching && curTab === "new" && (
          <div className="nox-inset" style={{ padding: "10px 12px" }} data-cust-new="1">
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
            <button type="button" style={{ ...t.btnPrimary56, marginTop: 10, opacity: busy || reg.name.trim() === "" ? 0.5 : 1 }} disabled={busy || reg.name.trim() === ""} onClick={() => void registerAndPick()} data-cust-register="1">{busy ? "登録中…" : "登録して選ぶ"}</button>
          </div>
        )}
        {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message></div>}
        <div style={t.btnRow48}>
          {mode === "line" && target?.currentCustomerId && <button type="button" style={t.btnSecondary48} disabled={busy} data-cust-clear="1" onClick={() => void pick(null, null)}>お客様を外す</button>}
          <button type="button" style={t.btnSecondary48} disabled={busy} data-cust-later="1" onClick={onClose}>あとで</button>
        </div>
      </div>
    </Modal>
  );
}
