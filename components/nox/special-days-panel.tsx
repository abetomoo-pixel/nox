"use client";

// ★便 W-10 #10（2026-10-26・0186 起草＝フラグ MIG_0186_APPLIED の間だけ mount）: 特別営業日・臨時休業＝日付ごとに曜日の設定より優先。
//   store_special_days（店×日付で 1 行）・set_store_special_day／remove_store_special_day（owner／manager 自店）。シフトの定休日判定と予約の定休日判定も同じ表を見る（0186）。
import TimeInput from "@/components/ui/time-input"; // ★便 M5b M-51: 時刻欄の共通部品（時計アイコン・時と分を選ぶ・翌の表示）
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { specialDayLineOf, specialDayErrorOf, type SpecialDay } from "@/lib/nox/business-hours-special";
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本

export default function SpecialDaysPanel({ storeId, editable }: { storeId: string; editable: boolean }) {
  const [rows, setRows] = useState<SpecialDay[]>([]);
  const [day, setDay] = useState("");
  const [kind, setKind] = useState<"closed" | "open">("closed");
  const [openHm, setOpenHm] = useState("20:00");
  const [closeHm, setCloseHm] = useState("26:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const { data } = await createClient().from("store_special_days").select("day, kind, open_hm, close_hm, note").eq("store_id", storeId).gte("day", today).order("day");
    setRows((data ?? []) as SpecialDay[]);
    // ★便 M5b M-51 追補 2: 時刻の初期値＝店の営業時間（最初の営業曜日の開始／終了・閉店が開店以前なら翌日＝24 時超の形）。固定の 20:00〜26:00 をやめる
    const { data: bh } = await createClient().from("store_business_hours").select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId).order("dow");
    const r = ((bh ?? []) as { is_closed: boolean; open_hm: string | null; close_hm: string | null }[]).find((x) => !x.is_closed && x.open_hm && x.close_hm);
    if (r) { const o = r.open_hm!.slice(0, 5), c = r.close_hm!.slice(0, 5); setOpenHm(o); setCloseHm(c <= o ? `${String(Number(c.slice(0, 2)) + 24).padStart(2, "0")}:${c.slice(3, 5)}` : c); }
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    const e = specialDayErrorOf({ day, kind, open_hm: openHm, close_hm: closeHm });
    if (e) { setMsg({ kind: "error", text: e }); return; }
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("set_store_special_day", { p_store_id: storeId, p_day: day, p_kind: kind, p_open_hm: kind === "open" ? openHm : null, p_close_hm: kind === "open" ? closeHm : null, p_note: note.trim() || null });
    setBusy(false);
    if (error) { setMsg({ kind: "error", text: /forbidden/.test(errJa(error.message)) ? "権限がありません（店長・管理者のみ）" : errJa(error.message) }); return; }
    setMsg({ kind: "success", text: `${day} を${kind === "closed" ? "臨時休業" : "特別営業"}にしました` }); setDay(""); setNote("");
    await load();
  }
  async function remove(d: string) {
    if (!confirm(`${d} の特別日を消して曜日の設定に戻しますか？`)) return;
    setBusy(true);
    const { error } = await createClient().rpc("remove_store_special_day", { p_store_id: storeId, p_day: d });
    setBusy(false);
    setMsg(error ? { kind: "error", text: errJa(error.message) } : { kind: "success", text: `${d} を曜日の設定に戻しました` });
    await load();
  }

  return (
    <section className="nox-cardtop" style={t.card} data-special-days="1">
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 2px" }}>特別営業日・臨時休業</h2>
      <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "0 0 10px" }}>日付ごとの設定は曜日の設定より優先します（シフトの定休日・予約の受付も同じ）</p>
      {rows.length === 0 ? <p style={{ ...t.sub, margin: "0 0 10px" }}>今日以降の特別日はありません。</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <li key={r.day} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }} data-special-day={r.day}>
              <span className="num">{specialDayLineOf(r)}</span>
              {editable && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={busy} onClick={() => void remove(r.day)}>消す</button>}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={t.fieldLabel}>日付<br /><input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ ...t.input, maxWidth: 160 }} aria-label="特別日の日付" /></label>
            <div className="nox-seg" role="group" aria-label="設定内容">
              {([["closed", "臨時休業"], ["open", "特別営業"]] as const).map(([k, l]) => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}
            </div>
            {kind === "open" && (
              <>
                <label style={t.fieldLabel}>開店<TimeInput value={openHm} onChange={setOpenHm} maxHour={23} style={{ ...t.input, maxWidth: 100 }} ariaLabel="開店" /></label>
                <label style={t.fieldLabel}>閉店<TimeInput value={closeHm} onChange={setCloseHm} style={{ ...t.input, maxWidth: 100 }} ariaLabel="閉店" /></label>
              </>
            )}
            <label style={t.fieldLabel}>名称・理由<br /><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="例: 年末年始" style={{ ...t.input, maxWidth: 200 }} /></label>
          </div>
          <div className="nox-actions" style={{ marginTop: 10 }}>{/* ★便 BTN（裁定242） */}
            <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !day} onClick={() => void save()} data-special-day-save="1">特別日を保存</button>
          </div>
        </>
      )}
      {msg && <div style={{ marginTop: 8 }}><Message kind={msg.kind}>{msg.text}</Message></div>}
    </section>
  );
}
