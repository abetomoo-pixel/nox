"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import IssueBulkForm from "@/components/nox/issue-bulk-form"; // ★裁定302-1／302-3（2026-09-25・mig0157）: マスタ「控除・送り」は一括型（チェックボックス一覧）。casts 詳細・給与右パネルは 1 人型 advance-okuri-form のまま

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Cast = { id: string; name: string };
import { OKURI_MODES, OKURI_MODE_LABEL, OKURI_MODE_NOTE, OKURI_MODE_PENDING_NOTE, okuriAsks, okuriModeSelectableOf, type OkuriMode, OKURI_FLAT_TIERS_MAX, OKURI_TIERS_PENDING_NOTE, okuriFlatTiersErrOf, okuriTierLabelOf, type OkuriFlatTier } from "@/lib/nox/shift/okuri-mode"; // ★裁定414（S-4）: 4 方式
// ★裁定414: 'store'／'none' は 0177 の適用（P）後に有効化＝それまでは「適用後に選べます」で無効。★便 P175-prep P-7: フラグは flag.ts の 1 か所（okuri4wayOn）
import { okuri4wayOn, okuriTiersOn } from "@/lib/nox/rules-0175/flag";

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
  initialOkuriBase, initialOkuriTiers,
  bizCutoffHm = "06:00",
}: {
  storeId: string;
  casts: Cast[];
  isOwner: boolean;
  initialOkuriMode: OkuriMode;
  initialOkuriBase: number;
  /** ★裁定414 追補（0180）: 定額徴収の距離区分（最大 3 段）。フラグ false＝出さない */
  initialOkuriTiers?: OkuriFlatTier[];
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
  // ★裁定414 追補（0180）: 距離区分 3 段（code／name／amount）＝set_store_profile の patch {okuri_flat_tiers}
  const [tiers, setTiers] = useState<OkuriFlatTier[]>(initialOkuriTiers ?? []);
  const [tiersBusy, setTiersBusy] = useState(false);
  const [tiersMsg, setTiersMsg] = useState("");
  async function saveTiers() {
    const err = okuriFlatTiersErrOf(tiers);
    if (err) { setTiersMsg(`エラー: ${err}`); return; }
    setTiersBusy(true); setTiersMsg("");
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { okuri_flat_tiers: tiers } });
    setTiersMsg(error ? `エラー: ${error.message.includes("bad key") ? OKURI_TIERS_PENDING_NOTE : error.message}` : `距離区分を保存しました（${tiers.length} 段）`);
    setTiersBusy(false);
  }
  const setTier = (i: number, k: keyof OkuriFlatTier, v: string) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: k === "amount" ? Math.max(0, Math.trunc(Number(v.replace(/[^0-9]/g, "")) || 0)) : v } : t)));

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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-okuri-4way="1" data-actions-exempt="送りの方式の選択（選択中の方式が青＝状態の表示）">{/* ★裁定414（S-4 ⑤）: 4 択＝実費／定額／店負担／なし（'store'／'none' は P 前は無効＝「適用後に選べます」） */}
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

      {/* ★裁定414 追補（0180・2026-10-26）: 定額徴収の距離区分（最大 3 段）＝退勤の送りの既定額をキャストの区分の額に（当日だけ変更可）。フラグ true かつ定額徴収の店だけ */}
      {okuriTiersOn() && okuriMode === "flat" && (
        <section className="nox-cardtop" style={{ ...card, marginTop: 14 }} data-okuri-tiers="1">
          <h3 style={h3}>送りの距離区分（定額徴収・最大 {OKURI_FLAT_TIERS_MAX} 段）</h3>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>キャスト詳細の「送り区分」で区分を割り当てると、退勤時の送りはその額が既定になります（当日の金額は発行時に変更できます）。区分なしのキャストは送りベース額です。</p>
          {isOwner ? (
            <>
              {tiers.map((tr, i) => (
                <div key={i} className="nox-okuri-tier-row" data-okuri-tier-row={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
                  <input value={tr.code} onChange={(e) => setTier(i, "code", e.target.value)} placeholder="コード（例: near）" aria-label={`区分 ${i + 1} のコード`} style={{ ...inp, width: 110 }} maxLength={32} disabled={tiersBusy} />
                  <input value={tr.name} onChange={(e) => setTier(i, "name", e.target.value)} placeholder="区分名（例: 近距離）" aria-label={`区分 ${i + 1} の名前`} style={{ ...inp, width: 140 }} maxLength={40} disabled={tiersBusy} />
                  <input type="number" min={0} step={1} value={tr.amount} onChange={(e) => setTier(i, "amount", e.target.value)} aria-label={`区分 ${i + 1} の金額（円）`} style={{ ...inp, width: 100 }} disabled={tiersBusy} /> 円
                  <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} disabled={tiersBusy} style={btn} aria-label={`区分 ${i + 1} を削除`}>削除</button>
                </div>
              ))}
              <div className="nox-actions" style={{ marginTop: 6 }}>{/* ★便 BTN: 中央 */}
                <button type="button" onClick={() => setTiers((ts) => [...ts, { code: "", name: "", amount: 0 }])} disabled={tiersBusy || tiers.length >= OKURI_FLAT_TIERS_MAX} style={btn} data-okuri-tier-add="1">＋ 区分を追加</button>
                <button type="button" onClick={() => void saveTiers()} disabled={tiersBusy} style={btnOn} data-okuri-tiers-save="1">保存</button>
              </div>
              {tiersMsg && <Toast msg={tiersMsg} style={{ margin: "6px 0 0" }} />}
            </>
          ) : (
            <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{tiers.length ? tiers.map(okuriTierLabelOf).join("／") : "区分なし（送りベース額）"}　※区分の編集は owner のみ可能です。</p>
          )}
        </section>
      )}
      {!okuriTiersOn() && okuriMode === "flat" && isOwner && <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }} data-okuri-tiers-pending="1">距離区分（最大 3 段）は {OKURI_TIERS_PENDING_NOTE}</p>}

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
