"use client";

// ★0154 D1（2026-09-24・裁定294-2／295）: /mine 本人の打刻修正申請（punch_id または営業日＋区分・時刻・理由必須→punch_correction_request＝pending）。
//   今日の自分の打刻（punches＝RLS 本人）から直す打刻を選ぶ or「打刻を追加」。メッセージは裁定281 の型。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SegSelect from "@/components/ui/seg-select";
import Toast from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { HM_30, KIND_LABEL, hmOnBizOf, requestArgsOf, type PunchKind } from "@/lib/nox/shift/punch-correction";

export type OwnPunch = { id: string; type: string; punched_at: string };

export default function PunchCorrectionForm({ castId, bizToday, punches, term }: { castId: string; bizToday: string; punches: OwnPunch[]; term: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<PunchKind>("in");
  const [date, setDate] = useState(bizToday);
  const [target, setTarget] = useState<string>("new");
  const [hm, setHm] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const candidates = punches.filter((p) => p.type === kind);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    const a = requestArgsOf({ castId, punchId: target === "new" ? null : target, biz: date, kind, hm, reason });
    if (!a.ok) { setMsg(a.err); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("punch_correction_request", a.args);
    setBusy(false);
    setMsg(error ? `申請できませんでした: ${rpcErrJa(error.message)}` : `${KIND_LABEL[kind]}の修正を申請しました（店の承認後に${term}へ反映されます）`);
    if (!error) { setHm(""); setReason(""); router.refresh(); }
  }

  const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <SegSelect value={kind} onChange={(v) => { setKind(v as PunchKind); setTarget("new"); }} options={[["in", "出勤"], ["out", "退勤"]]} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
      </div>
      {candidates.length > 0 && date === bizToday && (
        <select value={target} onChange={(e) => { setTarget(e.target.value); const p = candidates.find((x) => x.id === e.target.value); if (p) setHm(hmOnBizOf(p.punched_at, bizToday)); }} style={{ ...input, width: "100%" }} aria-label="直す打刻">
          <option value="new">打刻を追加する</option>
          {candidates.map((p) => <option key={p.id} value={p.id}>{KIND_LABEL[kind]} {hmOnBizOf(p.punched_at, bizToday)} を直す</option>)}
        </select>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input value={hm} onChange={(e) => setHm(e.target.value)} placeholder="時刻 HH:MM（翌日は 24:00〜）" inputMode="numeric" maxLength={5} required pattern={HM_30.source} style={{ ...input, width: 190 }} aria-label="時刻" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（必須・200 字まで）" maxLength={200} required style={{ ...input, flex: "1 1 200px" }} aria-label="理由" />
        <button type="submit" disabled={busy} style={{ ...t.btnGold, ...t.btnSm, opacity: busy ? 0.7 : 1 }}>{busy ? "送信中…" : "修正を申請"}</button>
      </div>
      <Toast msg={msg} />
    </form>
  );
}
