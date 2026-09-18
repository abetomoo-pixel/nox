"use client";

// /mine ノルマ進捗カード（mig0042・表示のみ裁定）。
// データは /api/mine/norm-progress（cast 本人 self ガード・当月・payroll と同一の集計定義）。
// 出し分け: 店フラグ off の軸（売上/指名）は非表示・target=0 の軸も非表示。
// 演出は進捗のみ（達成でゴールド強調・未達でも罰金文言や警告色は出さない＝罰金非接続の裁定）。
// ★裁定272-3（0148）: 「目標を設定」＝cast 本人が自分の当月目標を書く入力口（モーダル → /api/mine/norm-set → set_cast_norm_self）。
//   店の sys_norms OFF は /mine 側の isSectionOn("mineNormCard") で本カードごと非マウント（裁定269-4）＝ここでは判定しない。
//   目標が全軸 0 でもボタンは出す（設定の入口）。0148 手貼り前は route がエラー文言を返して止まる（細工しない）。
//   UI 規約: 補助＝青枠（裁定242）・実行＝青塗り（裁定239）・ボタンは中央（裁定240・.nox-formmodal-foot）。
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import * as t from "@/lib/nox/ui/theme";

import { Message } from "@/components/ui/toast"; // ★裁定281（便 AB）: メッセージ表示の共通部品
type NormProgress = {
  period: string;
  flags: { sales_norm_enabled: boolean; shimei_norm_enabled: boolean; shimei_norm_scope: "hon" | "hon_jonai" };
  targets: { days: number; dohan: number; sales: number; shimei: number };
  actual: { days: number; dohan: number; sales: number; shimei: number; hon: number; jonai: number };
};

const yen = (n: number) => "¥" + n.toLocaleString();

export default function NormCard() {
  const [data, setData] = useState<NormProgress | null>(null);
  // ★裁定272-3: 目標設定モーダル
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ days: string; dohan: string; sales: string; shimei: string }>({ days: "", dohan: "", sales: "", shimei: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(() => {
    return fetch("/api/mine/norm-progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/mine/norm-progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);

  if (!data) return null; // 読込中/取得失敗はカードごと出さない（進捗は補助情報）

  type Axis = { label: string; actual: number; target: number; fmt: (n: number) => string };
  const axes: Axis[] = [];
  const cnt = (n: number) => String(n);
  if (data.targets.days > 0) axes.push({ label: "出勤日数", actual: data.actual.days, target: data.targets.days, fmt: cnt });
  if (data.targets.dohan > 0) axes.push({ label: "同伴", actual: data.actual.dohan, target: data.targets.dohan, fmt: cnt });
  if (data.flags.sales_norm_enabled && data.targets.sales > 0)
    axes.push({ label: "売上", actual: data.actual.sales, target: data.targets.sales, fmt: yen });
  if (data.flags.shimei_norm_enabled && data.targets.shimei > 0)
    axes.push({
      label: data.flags.shimei_norm_scope === "hon_jonai" ? "指名（場内＋本指名）" : "指名（本指名）",
      actual: data.actual.shimei, target: data.targets.shimei, fmt: cnt,
    });

  function openForm() {
    setForm({ days: String(data!.targets.days), dohan: String(data!.targets.dohan), sales: String(data!.targets.sales), shimei: String(data!.targets.shimei) });
    setMsg(null);
    setOpen(true);
  }
  const num = (v: string) => (/^\d{0,12}$/.test(v.trim()) ? Number(v.trim() || "0") : NaN);
  const valid = [form.days, form.dohan, form.sales, form.shimei].every((v) => Number.isInteger(num(v)));

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/mine/norm-set", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: data!.period, days: num(form.days), dohan: num(form.dohan), sales: num(form.sales), shimei: num(form.shimei) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setMsg({ kind: "bad", text: res.status === 409 ? "この店ではノルマを使っていません（店の設定）。" : `エラー(${res.status}): ${j.error ?? "unknown"}` }); return; }
      setMsg({ kind: "ok", text: "目標を保存しました。" });
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { ...t.input, width: "100%" } as const;
  const field = (label: string, key: keyof typeof form, hint?: string) => (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 3 }}>{label}{hint ? <span style={{ marginLeft: 6 }}>{hint}</span> : null}</span>
      <input inputMode="numeric" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
    </label>
  );

  return (
    <section className="nox-panel">
      <h3>
        今月のノルマ進捗（{data.period}）
        <span style={{ marginLeft: "auto" }}>
          {/* ★裁定272-3: 補助＝青枠（裁定242） */}
          <button type="button" onClick={openForm} style={{ ...t.btnGhost, ...t.btnSm }}>目標を設定</button>
        </span>
      </h3>
      {axes.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>目標が未設定です。「目標を設定」から当月の目標を入力できます。</p>
      )}
      {axes.map((a) => {
        const pct = Math.min(100, Math.floor((a.actual / a.target) * 100));
        const done = a.actual >= a.target;
        return (
          <div key={a.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{a.label}</span>
              <span style={{ ...t.num, marginLeft: "auto" }}>
                {a.fmt(a.actual)} <span style={{ color: "var(--sub)" }}>/ {a.fmt(a.target)}</span>
              </span>
              {done && (
                <span style={{
                  fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                  color: "var(--gold)", background: "var(--card2)", border: "1px solid var(--line2)", whiteSpace: "nowrap",
                }}>達成</span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--line2)", marginTop: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: 999,
                background: "linear-gradient(135deg, var(--gold2), var(--gold3))",
              }} />
            </div>
          </div>
        );
      })}
      {msg && !open && <Message kind={msg.kind === "ok" ? "success" : "error"} style={{ margin: "6px 0 0" }}>{msg.text}</Message>}{/* ★裁定281（便 AB） */}
      <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>
        ※進捗の目安表示です（当月の営業日集計・確定値は給与明細が正）。
      </p>

      {open && (
        <Modal onClose={() => { if (!busy) setOpen(false); }} maxWidth={430}>
          <div className="nox-formmodal-head">
            <strong>今月の目標を設定（{data.period}）</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" disabled={busy} onClick={() => setOpen(false)}>×</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>自分の当月目標です。0 は「目標なし」。店が使っていない軸は進捗に出ません。</p>
          {field("出勤日数（日）", "days")}
          {field("同伴（回）", "dohan")}
          {data.flags.sales_norm_enabled && field("売上（円）", "sales")}
          {data.flags.shimei_norm_enabled && field(data.flags.shimei_norm_scope === "hon_jonai" ? "指名（場内＋本指名・回）" : "指名（本指名・回）", "shimei")}
          {msg && <Message kind={msg.kind === "ok" ? "success" : "error"} style={{ margin: "0 0 8px" }}>{msg.text}</Message>}{/* ★裁定281（便 AB） */}
          <div className="nox-formmodal-foot">
            {/* ★裁定239: 実行＝青塗り（t.btnGold＝--primary 塗り） */}
            <button type="button" onClick={() => void submit()} disabled={busy || !valid} style={{ ...t.btnGold, opacity: busy || !valid ? 0.5 : 1 }}>
              {busy ? "保存中…" : "保存する"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={t.btnGhost}>キャンセル</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
