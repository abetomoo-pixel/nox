"use client";

// ★0154 D4（2026-09-24・裁定293 追補1）: 「精算調整を登録」（委託のみ・裁定265 型モーダル）。
//   ひな形（store の settlement_presets）と額を初期表示・額は変更可 → payroll_adjustment_add(source='settlement'・basis＝ひな形の文・target＝当日の shift)。
//   run＝当期（営業日の月）の draft を探す（無ければ「当期の給与が未作成です」）。runId を渡されたときはそれを使う（給与明細から）。
import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import * as t from "@/lib/nox/ui/theme";
import { TARGET_LABEL, presetsOf, settlementArgsOf, type SettlementPreset, type SettlementTarget } from "@/lib/nox/payroll/settlement";

export default function SettlementModal({ storeId, castId, castName, biz, shiftId, target, runId, onClose, onDone }: {
  storeId: string; castId: string; castName: string;
  /** 当日の営業日（明細からの登録は null＝理由に日付を付けない） */
  biz?: string | null; shiftId?: string | null;
  /** 検知した対象（ひな形の初期選択） */
  target?: SettlementTarget | null;
  /** 明細から＝当期 draft run の id（今日タブからは null＝営業日の月で探す） */
  runId?: string | null;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const supabase = createClient();
  const [presets, setPresets] = useState<SettlementPreset[] | null>(null);
  const [code, setCode] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState<{ id: string; status: string } | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("stores").select("settings_json").eq("id", storeId).maybeSingle();
      const list = presetsOf((data?.settings_json ?? null) as Record<string, unknown> | null);
      if (!alive) return;
      setPresets(list);
      const first = list.find((p) => p.target === target) ?? list[0];
      if (first) { setCode(first.code); setAmount(String(first.amount)); }
      if (runId) { setRun({ id: runId, status: "draft" }); return; }
      const period = (biz ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
      const { data: r } = await supabase.from("payroll_runs").select("id, status").eq("store_id", storeId).eq("period", period).maybeSingle();
      if (alive) setRun(r ? { id: r.id as string, status: r.status as string } : null);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, runId, biz]);

  const preset = presets?.find((p) => p.code === code) ?? null;
  const runNg = run === null ? "当期の給与が未作成です（給与画面でプレビューを 1 回押すと作成されます）" : run && run.status !== "draft" ? "当期の給与は確定済みのため登録できません" : null;

  async function submit() {
    if (busy || !preset || !run) return;
    setErr(null);
    const n = Number(amount.replace(/[,，¥￥\s]/g, ""));
    const a = settlementArgsOf({ runId: run.id, castId, preset, amount: n, biz, shiftId });
    if (!a.ok) { setErr(a.err); return; }
    setBusy(true);
    const { error } = await supabase.rpc("payroll_adjustment_add", a.args);
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    onDone(`${castName} の精算調整（${preset.name}・¥${n.toLocaleString()}）を登録しました`);
    onClose();
  }

  const disabled = busy || !preset || !run || !!runNg || amount.trim() === "";
  return (
    <Modal onClose={() => { if (!busy) onClose(); }} maxWidth={430}>
      <div className="nox-formmodal-head">
        <strong>精算調整を登録</strong>
        <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button>
      </div>
      <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>{castName}{biz ? `・${biz}` : ""}（委託・契約根拠つきの減額）</p>
      {presets === null || run === undefined ? <p style={{ fontSize: 12, color: "var(--sub)" }}>読み込み中…</p> : (
        <>
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>ひな形
            <select value={code} disabled={busy} onChange={(e) => { setCode(e.target.value); const p = presets.find((x) => x.code === e.target.value); if (p) setAmount(String(p.amount)); }} style={{ ...t.input, width: "100%", marginTop: 4 }}>
              {presets.map((p) => <option key={p.code} value={p.code}>{p.name}（{TARGET_LABEL[p.target]}・既定 ¥{p.amount.toLocaleString()}）</option>)}
            </select>
          </label>
          <label style={{ ...t.fieldLabel, display: "block", marginBottom: 6 }}>額（円・変更可）
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" disabled={busy} style={{ ...t.input, width: "100%", marginTop: 4 }} />
          </label>
          {preset && <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px" }}>根拠: {preset.basis || "（未設定＝報酬制度の精算調整で文を設定してください）"}</p>}
          {runNg && <Message kind="warn">{runNg}</Message>}
          {err && <div style={{ marginTop: 8 }}><Message kind="error">{err}</Message></div>}
        </>
      )}
      <div className="nox-formmodal-foot">
        <button type="button" onClick={() => void submit()} disabled={disabled} style={{ ...t.btnGold, opacity: disabled ? 0.5 : 1 }}>{busy ? "登録中…" : "登録する"}</button>
        <button type="button" onClick={onClose} disabled={busy} style={t.btnGhost}>キャンセル</button>
      </div>
    </Modal>
  );
}
