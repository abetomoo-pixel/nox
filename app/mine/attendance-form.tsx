"use client";

import { useState } from "react";
import { HM_FORMAT_ERR, hmRangeErrorOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import SegSelect from "@/components/ui/seg-select";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { etaOptionsOf } from "@/lib/nox/shift/half-hour"; // ★便 M2 M-16（補遺）
import { ETA_CHIP_MINUTES, etaChipLabelOf, etaOfChip } from "@/lib/nox/mine/eta-chips"; // ★便 M-3（Agoora 確定 ④）: 見込みは予定開始からのチップ＋その他
// cast セルフ連絡は遅刻/当欠のみ（RPC 側でも enforce＝attendance_set_self）。
export default function AttendanceForm({ defaultDate, startHm = null }: { defaultDate: string; startHm?: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<"late" | "absent">("late");
  const [eta, setEta] = useState("");
  const [etaMode, setEtaMode] = useState<number | "other">(startHm ? 15 : "other"); // ★便 M-3: チップ（分）／その他（時刻入力）
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // ★裁定318: 出勤見込みは正規化後の値を送る（形が違えば送らずに知らせる）
    const etaRaw = status === "late" ? (etaMode === "other" ? eta : etaOfChip(startHm, etaMode) ?? "") : ""; // ★便 M-3
    const etaN = status === "late" && etaRaw ? normalizeHHMM(etaRaw) : null;
    if (status === "late" && etaRaw && !etaN) { setMsg(HM_FORMAT_ERR); return; }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("attendance_set_self", {
      p_date: date,
      p_status: status,
      p_eta: etaN,
      p_reason: reason || null,
    });
    // ★便 ON-3（0176 ★3 I-4）: 同日の複数連絡の履歴＝attendance_contact_log（本人＝source self・失敗しても連絡は止めない）
    if (!error) { const { data: myCastId } = await supabase.rpc("auth_cast_id"); if (myCastId) { const { error: eC } = await supabase.rpc("attendance_contact_log", { p_cast_id: myCastId as string, p_biz_date: date, p_kind: status, p_eta: etaN, p_reason: reason || null }); if (eC) console.error(`attendance_contact_log: ${eC.message}`); } }
    setMsg(error ? "送信に失敗しました。時刻の形式を確認してください（例 2000・20:00）" : "店に届きました");
    setBusy(false);
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      <SegSelect value={status} onChange={(v) => setStatus(v as "late" | "absent")}
            options={[["late", "遅刻"], ["absent", "当欠"]] as const} />
      {status === "late" && startHm && (/* ★便 M-3（Agoora 確定 ④）: 予定開始からのチップ＋その他（当欠では出さない） */
        <span role="radiogroup" aria-label="出勤見込み" data-eta-chips="1" style={{ display: "flex", gap: 6, flexWrap: "wrap", flexBasis: "100%" }}>
          {ETA_CHIP_MINUTES.map((m) => <button key={m} type="button" role="radio" aria-checked={etaMode === m} className={`nox-chip${etaMode === m ? " on" : ""}`} style={{ minHeight: 40 }} data-eta-chip={m} onClick={() => setEtaMode(m)}>{etaChipLabelOf(startHm, m)}</button>)}
          <button type="button" role="radio" aria-checked={etaMode === "other"} className={`nox-chip${etaMode === "other" ? " on" : ""}`} style={{ minHeight: 40 }} data-eta-chip="other" onClick={() => setEtaMode("other")}>その他</button>
        </span>
      )}
      {status === "late" && (etaMode === "other" || !startHm) && (
        <select value={eta} onChange={(e) => setEta(e.target.value)} aria-label="出勤見込み" style={{ ...input, width: 170 }} data-eta-select="1">{/* ★便 M2 M-16（補遺）: 「その他」も 30 分刻みの選択式（24 時を超えたら翌） */}
          <option value="">見込みを選ぶ</option>
          {etaOptionsOf(startHm).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <input
        placeholder="理由（任意）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...input, width: 160 }}
      />
      <button type="submit" data-att-submit="1" disabled={busy || (status === "late" && etaMode === "other" && hmRangeErrorOf(eta) !== null)} style={{ ...t.btnGold, padding: "8px 28px", minHeight: 44, flexBasis: "100%", maxWidth: 240, margin: "4px auto 0", justifyContent: "center", opacity: busy || (status === "late" && hmRangeErrorOf(eta) !== null) ? 0.7 : 1 }}>{/* ★318 追補 */}
        送信
      </button>
      {msg && <Toast msg={msg} />}
    </form>
  );
}
