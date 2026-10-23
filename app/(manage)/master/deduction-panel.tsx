"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import IssueBulkForm from "@/components/nox/issue-bulk-form"; // ★裁定302-1／302-3（2026-09-25・mig0157）: マスタ「控除・送り」は一括型（チェックボックス一覧）。casts 詳細・給与右パネルは 1 人型 advance-okuri-form のまま

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Cast = { id: string; name: string };
import { OKURI_MODES, OKURI_MODE_LABEL, OKURI_MODE_NOTE, OKURI_MODE_PENDING_NOTE, okuriAsks, okuriModeSelectableOf, type OkuriMode } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）: 4 方式
// ★裁定414: 'store'／'none' は 0177 の適用（P）後に有効化＝それまでは「適用後に選べます」で無効。★便 P175-prep P-7: フラグは flag.ts の 1 か所（okuri4wayOn）
import { okuri4wayOn } from "@/lib/nox/rules-0175/flag";

// F2e-2 天引き運用パネル: 送り方式(okuri_mode)トグル(owner のみ)＋前借り/送り実費 発行フォーム(manager+)。
// 排他は okuri_mode で構造的に担保（flat 店では送り実費発行を RPC が弾く＝ここでも actual のときだけ有効化）。
// 実発行の権限・org/store 照合・paid ガードは全て RPC の二重防御が正（UI はガイド表示のみ）。
// mig0042: 送りベース額（settings_json.okuri_base_amount・owner のみ・actual 時のみ表示）＝
//   発行フォームの金額プリフィル専用（transport_issue/payOf は無改変・額は発行時に都度確定のまま）。
export default function DeductionPanel({
  storeId,
  casts,
  isOwner,
  initialOkuriMode,
  initialOkuriBase,
  bizCutoffHm = "06:00",
}: {
  storeId: string;
  casts: Cast[];
  isOwner: boolean;
  initialOkuriMode: OkuriMode;
  initialOkuriBase: number;
  /** 営業日切替（settings_json.biz_cutoff_hm）＝一括発行の「当日」判定 */
  bizCutoffHm?: string;
}) {
  const supabase = createClient();
  const [okuriMode, setOkuriMode] = useState<OkuriMode>(initialOkuriMode);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeMsg, setModeMsg] = useState("");
  const [okuriBase, setOkuriBase] = useState(initialOkuriBase);
  const [baseInput, setBaseInput] = useState(initialOkuriBase > 0 ? String(initialOkuriBase) : "");
  const [baseBusy, setBaseBusy] = useState(false);
  const [baseMsg, setBaseMsg] = useState("");

  async function saveBase() {
    const v = baseInput === "" ? 0 : Number(baseInput);
    if (!Number.isInteger(v) || v < 0) { setBaseMsg("エラー: ベース額は 0 以上の整数で入力してください"); return; }
    setBaseBusy(true);
    setBaseMsg("");
    const { error } = await supabase.rpc("set_store_okuri_base", { p_store_id: storeId, p_amount: v });
    if (error) setBaseMsg(`エラー: ${error.message}`);
    else { setOkuriBase(v); setBaseMsg(v > 0 ? `送りベース額を ${v.toLocaleString()} 円に設定しました` : "送りベース額を未設定（0）にしました"); }
    setBaseBusy(false);
  }

  async function switchMode(next: OkuriMode) {
    if (next === okuriMode) return;
    setModeBusy(true);
    setModeMsg("");
    try {
      const res = await fetch("/api/store/okuri-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, mode: next }),
      });
      const j = await res.json();
      if (!res.ok) { setModeMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
      setOkuriMode(next);
      setModeMsg(`送り方式を「${OKURI_MODE_LABEL[next]}」に変更しました`); // ★裁定414
    } catch (e) {
      setModeMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ ...t.pheadH1, fontSize: 16, margin: "0 0 12px" }}>天引き（前借り・送り）</h2>{/* ★301-4: 上 24（外側 div）・下 12 */}

      {/* 送り方式トグル（owner のみ操作可・manager は現在値のみ） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>送り方式</h3>
        <p style={{ fontSize: 13, margin: "4px 0" }}>
          現在: <strong style={{ color: "var(--champ)" }} data-okuri-mode-now={okuriMode}>{OKURI_MODE_LABEL[okuriMode]}</strong>　<span style={{ fontSize: 12, color: "var(--sub)" }}>{OKURI_MODE_NOTE[okuriMode]}</span>{/* ★裁定414: 4 方式 */}
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-okuri-4way="1">{/* ★裁定414（S-4 ⑤）: 4 択＝実費／定額／店負担／なし（'store'／'none' は P 前は無効＝「適用後に選べます」） */}
            {OKURI_MODES.map((m) => { const selectable = okuriModeSelectableOf(m, okuri4wayOn()); return (
              <button key={m} onClick={() => switchMode(m)} disabled={modeBusy || okuriMode === m || !selectable} style={okuriMode === m ? btnOn : { ...btn, opacity: selectable ? 1 : 0.5 }}
                title={selectable ? OKURI_MODE_NOTE[m] : OKURI_MODE_PENDING_NOTE} data-okuri-mode-btn={m} data-okuri-pending={selectable ? undefined : "1"}>{OKURI_MODE_LABEL[m]}{selectable ? "" : "（適用後）"}</button>
            ); })}
            <span style={{ fontSize: 12, color: "var(--sub)" }}>※定額の月額固定控除（控除マスタ）は別物のまま。送りの記録は方式を刻み、実費＝現金支払＋控除／定額＝控除のみ／店負担＝諸経費。</span>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>※送り方式の変更は owner のみ可能です。</p>
        )}
        {modeMsg && <Toast msg={modeMsg} style={{ margin: "6px 0 0" }} />}

        {/* 送りベース額（'none' 以外で表示・owner のみ操作可＝記録金額のプリフィル専用）★裁定414 */}
        {okuriAsks(okuriMode) && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line2)" }}>
            <p style={{ fontSize: 13, margin: "0 0 6px" }}>
              送りベース額: <strong style={{ color: "var(--champ)" }}>{okuriBase > 0 ? `${okuriBase.toLocaleString()} 円` : "未設定"}</strong>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>（発行フォームの金額に初期表示・日毎・人毎に発行時変更できます）</span>
            </p>
            {isOwner ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="number" min={0} step={1} value={baseInput} placeholder="例: 3000"
                  onChange={(e) => setBaseInput(e.target.value)} style={{ ...inp, width: 110 }} />
                <button onClick={() => void saveBase()} disabled={baseBusy} style={btn}>保存</button>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>※0 で未設定（プリフィルなし）。</span>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>※送りベース額の変更は owner のみ可能です。</p>
            )}
            {baseMsg && <Toast msg={baseMsg} style={{ margin: "6px 0 0" }} />}
          </div>
        )}
      </section>

      {/* ★裁定302-1／302-3（2026-09-25・mig0157）: 前借り／送り実費の一括発行＝チェックボックス一覧型（出勤者が上・行ごと金額・共通メモ・1 回の発行＝1 tx）＋当日の発行済み一覧。
          送り実費は送り方式が「実費」のときだけ有効（RPC が二重防御）・ベース額をプリフィル（mig0042） */}
      <IssueBulkForm key={`okuri-${okuriBase}-${okuriMode}`} storeId={storeId} casts={casts} okuriMode={okuriMode} okuriBase={okuriBase} bizCutoffHm={bizCutoffHm} />
    </div>
  );
}

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
