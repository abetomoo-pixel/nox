"use client";

// ★0198（裁定461 ①・M-120・2026-11-07）: 今日タブの「出勤」（代行）の直後に出す「今日の控除」のチェック群（小さく・省略可）。
//   店側だけの操作（店長以上・staff の本人セッション＝同じページ）。行＝その店の日ごとのルール（per=day・有効・キャスト別の適用で使わないは除く・額の上書きを反映）。
//   既定＝always は on／pick は off（cast_day_deductions にその日の行があればそれ）。既定どおりの行は外せる。
//   保存＝cast_day_deductions_set（既定と違う行だけ＝0195 と同じ式＝kintai-edit の dayDedRowsOf・staff 経路は 0198）。「省略」＝何も送らない。
//   MIG_0198_APPLIED の配下（呼び手＝shift-board が mig0198On() のときだけ出す）。
import { useEffect, useState } from "react";
import { dayDedRowsOf, kintaiErrJa, type DayDedRule } from "@/components/nox/kintai-edit";
import { DAY_DED_AFTER_HEAD, DAY_DED_AFTER_NOTE } from "@/lib/nox/payroll/day-ded-pick";
import { Message } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

export default function DayDedAfterPunch({ storeId, castId, castName, biz, onClose, onDone }: {
  storeId: string; castId: string; castName: string; biz: string; onClose: () => void; onDone: (text: string) => void;
}) {
  const [rules, setRules] = useState<DayDedRule[] | null>(null);
  const [initial, setInitial] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const [dR, rcR, cdR] = await Promise.all([
        supabase.from("deductions").select("id, name, amount, per, day_rule, store_id").eq("store_id", storeId).eq("per", "day").eq("is_active", true).order("name"),
        supabase.from("deduction_rule_casts").select("rule_id, enabled, amount_override").eq("cast_id", castId),
        supabase.from("cast_day_deductions").select("deduction_id, enabled").eq("cast_id", castId).eq("biz_date", biz),
      ]);
      if (!alive) return;
      const rc = new Map(((rcR.data ?? []) as { rule_id: string; enabled: boolean; amount_override: number | null }[]).map((x) => [x.rule_id, x]));
      const cd = new Map(((cdR.data ?? []) as { deduction_id: string; enabled: boolean }[]).map((x) => [x.deduction_id, x.enabled]));
      const rs: DayDedRule[] = ((dR.data ?? []) as { id: string; name: string; amount: number; day_rule: string | null }[])
        .filter((d) => rc.get(d.id)?.enabled !== false)
        .map((d) => ({ id: d.id, name: d.name, amount: rc.get(d.id)?.amount_override ?? d.amount, dayRule: d.day_rule === "pick" ? "pick" : "always" }));
      const init: Record<string, boolean> = Object.fromEntries(rs.map((r) => [r.id, cd.get(r.id) ?? r.dayRule === "always"]));
      setRules(rs); setInitial(init); setState(init);
      if (rs.length === 0) onClose(); // 日ごとのルールが無い店＝何も聞かない
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, castId, biz]);

  async function save() {
    if (busy || !rules) return;
    const rows = dayDedRowsOf(rules, initial, state);
    if (!rows) { onClose(); return; } // 既定どおり＝送らない
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc("cast_day_deductions_set", { p_cast_id: castId, p_biz_date: biz, p_rows: rows });
    setBusy(false);
    if (error) { setErr(kintaiErrJa(error.message)); return; }
    onDone(`${castName} の今日の控除を記録しました`);
    onClose();
  }

  if (!rules || rules.length === 0) return null;
  return (
    <section data-day-ded-after={castId} className="nox-cardtop" style={{ ...t.card, position: "fixed", right: 16, bottom: 76, zIndex: 60, width: "min(360px, calc(100vw - 32px))", padding: 12, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--champ)", marginBottom: 2 }}>{DAY_DED_AFTER_HEAD}</div>
      <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 8 }}>{castName} さん・{DAY_DED_AFTER_NOTE}</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {rules.map((r) => { const on = state[r.id] ?? initial[r.id] ?? r.dayRule !== "pick"; return (
          <div key={r.id} className="nox-seg nox-punchseg" role="group" aria-label={r.name} data-day-ded-after-rule={r.id} data-day-ded-after-on={on ? "1" : "0"} style={{ width: "fit-content" }}>{/* ★教訓133: ネイティブの checkbox は使わず 2 択のボタン */}
            <button type="button" className={!on ? "on" : ""} disabled={busy} onClick={() => setState((m) => ({ ...m, [r.id]: false }))}>なし</button>
            <button type="button" className={on ? "on" : ""} disabled={busy} onClick={() => setState((m) => ({ ...m, [r.id]: true }))}>{r.name}（¥{r.amount.toLocaleString("en-US")}）{r.dayRule === "always" ? "・既定" : ""}</button>
          </div>
        ); })}
      </div>
      {err && <Message kind="error" style={{ margin: "0 0 8px" }}>{err}</Message>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={onClose} data-day-ded-after-skip>省略</button>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void save()} data-day-ded-after-save>{busy ? "記録中…" : "記録する"}</button>
      </div>
    </section>
  );
}
