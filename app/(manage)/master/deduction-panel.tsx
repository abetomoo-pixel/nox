"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Cast = { id: string; name: string };
type OkuriMode = "flat" | "actual";

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
}: {
  storeId: string;
  casts: Cast[];
  isOwner: boolean;
  initialOkuriMode: OkuriMode;
  initialOkuriBase: number;
}) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
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
      setModeMsg(`送り方式を「${next === "actual" ? "実費" : "一律送り代"}」に変更しました`);
    } catch (e) {
      setModeMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={{ ...t.pheadH1, fontSize: 16 }}>天引き（前借り・送り実費）</h2>

      {/* 送り方式トグル（owner のみ操作可・manager は現在値のみ） */}
      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>送り方式（okuri_mode）</h3>
        <p style={{ fontSize: 13, margin: "4px 0" }}>
          現在: <strong style={{ color: "var(--champ)" }}>{okuriMode === "actual" ? "実費（送り実費を給与天引き）" : "一律送り代（控除マスタで管理）"}</strong>
        </p>
        {isOwner ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => switchMode("flat")} disabled={modeBusy || okuriMode === "flat"} style={okuriMode === "flat" ? btnOn : btn}>一律送り代</button>
            <button onClick={() => switchMode("actual")} disabled={modeBusy || okuriMode === "actual"} style={okuriMode === "actual" ? btnOn : btn}>実費</button>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>※「実費」にすると送り実費の発行が有効になります（一律送り代との二重取り防止）。</span>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>※送り方式の変更は owner のみ可能です。</p>
        )}
        {modeMsg && <p style={{ fontSize: 12, color: modeMsg.startsWith("エラー") || modeMsg.startsWith("通信") ? "var(--bad)" : "var(--ok)", margin: "6px 0 0" }}>{modeMsg}</p>}

        {/* 送りベース額（actual 時のみ表示・owner のみ操作可＝発行金額のプリフィル専用） */}
        {okuriMode === "actual" && (
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
            {baseMsg && <p style={{ fontSize: 12, color: baseMsg.startsWith("エラー") ? "var(--bad)" : "var(--ok)", margin: "6px 0 0" }}>{baseMsg}</p>}
          </div>
        )}
      </section>

      {/* 前借り発行 */}
      <IssueForm
        title="前借りの発行"
        endpoint="/api/advance/issue"
        dateLabel="前借り日"
        dateField="advancedOn"
        storeId={storeId}
        casts={casts}
        today={today}
        disabled={false}
        hint="給与から天引きされます（手取り不足時は翌月へ繰越）。"
      />

      {/* 送り実費発行（actual のときのみ有効・金額はベース額をプリフィル＝0 なら空のまま） */}
      <IssueForm
        key={`okuri-${okuriBase}`}
        title="送り実費の発行"
        endpoint="/api/transport/issue"
        dateLabel="乗車日（営業日）"
        dateField="bizDate"
        storeId={storeId}
        casts={casts}
        today={today}
        disabled={okuriMode !== "actual"}
        defaultAmount={okuriBase}
        hint={okuriMode === "actual" ? "当月精算（繰越なし）。手取り不足で引き切れない残は再回収されません。" : "※送り方式が「実費」の店のみ発行できます（上で切替）。"}
      />
    </div>
  );
}

function IssueForm({
  title, endpoint, dateLabel, dateField, storeId, casts, today, disabled, hint, defaultAmount,
}: {
  title: string;
  endpoint: string;
  dateLabel: string;
  dateField: "advancedOn" | "bizDate";
  storeId: string;
  casts: Cast[];
  today: string;
  disabled: boolean;
  hint: string;
  defaultAmount?: number; // mig0042: 送りベース額プリフィル（0/未指定なら空のまま・発行時に都度変更可）
}) {
  const prefill = defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "";
  const [castId, setCastId] = useState(casts[0]?.id ?? "");
  const [amount, setAmount] = useState(prefill);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    const amt = Number(amount);
    if (!castId) { setMsg("キャストを選択してください"); return; }
    if (!Number.isInteger(amt) || amt <= 0) { setMsg("金額は正の整数で入力してください"); return; }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, castId, amount: amt, [dateField]: date, note: note || null }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`エラー(${res.status}): ${j.error ?? ""}`); return; }
      setMsg("発行しました");
      setAmount(prefill); // 次の発行に備えベース額へ戻す（未設定なら空）
      setNote("");
    } catch (e) {
      setMsg(`通信エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="nox-cardtop" style={{ ...card, opacity: disabled ? 0.6 : 1 }}>
      <h3 style={h3}>{title}</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={lbl}>キャスト<br />
          <select value={castId} onChange={(e) => setCastId(e.target.value)} disabled={disabled} style={inp}>
            {casts.length === 0 && <option value="">（対象なし）</option>}
            {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={lbl}>金額(円)<br />
          <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={disabled} style={{ ...inp, width: 110 }} />
        </label>
        <label style={lbl}>{dateLabel}<br />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={disabled} style={inp} />
        </label>
        <label style={lbl}>メモ<br />
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} style={{ ...inp, width: 160 }} />
        </label>
        <button onClick={submit} disabled={busy || disabled} style={btn}>発行</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>{hint}</p>
      {msg && <p style={{ fontSize: 12, color: msg.startsWith("エラー") || msg.startsWith("通信") || msg.includes("ください") ? "var(--bad)" : "var(--ok)", margin: "6px 0 0" }}>{msg}</p>}
    </section>
  );
}

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
