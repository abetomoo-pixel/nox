"use client";

import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";

type Cast = { id: string; name: string };
type OkuriMode = "flat" | "actual";

// F2e-2 天引き運用パネル: 送り方式(okuri_mode)トグル(owner のみ)＋前借り/送り実費 発行フォーム(manager+)。
// 排他は okuri_mode で構造的に担保（flat 店では送り実費発行を RPC が弾く＝ここでも actual のときだけ有効化）。
// 実発行の権限・org/store 照合・paid ガードは全て RPC の二重防御が正（UI はガイド表示のみ）。
export default function DeductionPanel({
  storeId,
  casts,
  isOwner,
  initialOkuriMode,
}: {
  storeId: string;
  casts: Cast[];
  isOwner: boolean;
  initialOkuriMode: OkuriMode;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [okuriMode, setOkuriMode] = useState<OkuriMode>(initialOkuriMode);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeMsg, setModeMsg] = useState("");

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

      {/* 送り実費発行（actual のときのみ有効） */}
      <IssueForm
        title="送り実費の発行"
        endpoint="/api/transport/issue"
        dateLabel="乗車日（営業日）"
        dateField="bizDate"
        storeId={storeId}
        casts={casts}
        today={today}
        disabled={okuriMode !== "actual"}
        hint={okuriMode === "actual" ? "当月精算（繰越なし）。手取り不足で引き切れない残は再回収されません。" : "※送り方式が「実費」の店のみ発行できます（上で切替）。"}
      />
    </div>
  );
}

function IssueForm({
  title, endpoint, dateLabel, dateField, storeId, casts, today, disabled, hint,
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
}) {
  const [castId, setCastId] = useState(casts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
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
      setAmount("");
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
