"use client";

// ★0154 D1（2026-09-24・裁定294-2／295）: 今日タブ「修正」＝owner／manager の出退勤時刻の修正（裁定265 型モーダル・理由必須）。
//   punch_correction_request を呼ぶ＝owner／manager は同 tx で approved（申請＝確定・punches が更新される）。成功で onDone（行の再読込は呼び出し側）。
//   メッセージは裁定281 の型（Message・同じカード内）。RPC の英語はrpcErrJa で和文化。
// ★裁定310（2026-09-28・便 X-2）: 本体を PunchCorrectionForm（Modal なし）に切り出し、/shift 今日タブの「調整」モーダルのタブ①（出退勤）に埋め込む。
//   既定 export の PunchCorrectionModal は同じ本体を Modal で包むだけ（文言・RPC・引数は不変）。
// ★裁定315（0158・便 AB-3）: 確定済み・支払済みの期の日も修正できる（旧: 'period finalized' の赤エラー）。その日は注記を添える（給与は変わらず、給与画面の要対応に積まれる）。
import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { KIND_LABEL, requestArgsOf, requestInitOf, type PunchKind } from "@/lib/nox/shift/punch-correction";
import HmInput from "@/components/ui/hm-input"; // ★裁定318（便 X-9-2）: 時刻入力の共通部品（blur で HH:MM に正規化）
import { hmRangeErrorOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import { isFinalizedDay, POST_FINALIZE_NOTE } from "@/lib/nox/payroll/attention";

export type PunchCorrectionProps = {
  castId: string; castName: string; biz: string; kind: PunchKind;
  punchId?: string | null; punchAtIso?: string | null; shiftStartHm?: string | null; shiftEndHm?: string | null;
  /** 用語（労働時間／稼働実績） */
  term: string;
  onClose: () => void; onDone: (text: string) => void;
};

/** 修正フォーム本体（Modal なし）。見出し・時刻・理由・実行／キャンセル。埋め込み先が枠を持つ。 */
export function PunchCorrectionForm({ castId, castName, biz, kind, punchId, punchAtIso, shiftStartHm, shiftEndHm, term, onClose, onDone, showHead = true }: PunchCorrectionProps & { showHead?: boolean }) {
  const supabase = createClient();
  const init = requestInitOf({ kind, biz, punchId, punchAtIso, shiftStartHm, shiftEndHm });
  const [hm, setHm] = useState(init.hm);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = KIND_LABEL[kind];
  // ★裁定315: その営業日の月の run が確定済み／支払済みか（payroll_runs＝RLS owner／manager 自店・cast の所属店で引く）
  const [finalizedPeriods, setFinalizedPeriods] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: c } = await supabase.from("casts").select("store_id").eq("id", castId).maybeSingle();
      if (!c?.store_id) return;
      const { data: r } = await supabase.from("payroll_runs").select("period").eq("store_id", c.store_id as string).eq("period", biz.slice(0, 7)).in("status", ["finalized", "paid"]);
      if (alive) setFinalizedPeriods(((r ?? []) as { period: string }[]).map((x) => x.period));
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castId, biz]);
  const postFinalize = isFinalizedDay(biz, finalizedPeriods);

  async function submit() {
    if (busy) return;
    setErr(null);
    const a = requestArgsOf({ castId, punchId: init.punchId, biz, kind, hm, reason });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("punch_correction_request", a.args);
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    onDone(`${castName} の${label}を ${normalizeHHMM(hm) ?? hm} に修正しました（${term}の記録に反映されます）`);
    onClose();
  }

  const disabled = busy || reason.trim().length === 0 || hm.trim().length === 0 || hmRangeErrorOf(hm) !== null; // ★318 追補: 範囲外は送信非活性
  return (
    <>
      {showHead && (
        <div className="nox-formmodal-head">
          <strong>{label}の時刻を修正</strong>
          <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
        </div>
      )}
      <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
        {castName}・{biz}（{init.mode === "update" ? `現在 ${init.hm}` : "打刻なし＝新しく記録します"}）
      </p>
      <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>
        {label}時刻（例 2000・20:00／翌日は 24:00〜47:59）
        <HmInput value={hm} onChange={setHm} placeholder={kind === "in" ? "20:00" : "26:00"} autoFocus style={{ ...t.input, width: "100%", marginTop: 4 }} />
      </label>
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 6px" }}>理由は必須です（200 字まで・本人に表示され、監査に残ります）</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="例: 打刻忘れ（本人申告）" style={{ ...t.input, width: "100%" }} />
      {postFinalize && <div style={{ marginTop: 8 }}><Message kind="info">{POST_FINALIZE_NOTE}</Message></div>}
      {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
      <div className="nox-formmodal-foot">
        <button type="button" onClick={() => void submit()} disabled={disabled} style={{ ...t.btnGold, opacity: disabled ? 0.5 : 1 }}>{busy ? "修正中…" : "修正する"}</button>
        <button type="button" onClick={onClose} disabled={busy} style={t.btnGhost}>キャンセル</button>
      </div>
    </>
  );
}

export default function PunchCorrectionModal(props: PunchCorrectionProps) {
  return (
    <Modal onClose={props.onClose} maxWidth={430}>
      <PunchCorrectionForm {...props} />
    </Modal>
  );
}
