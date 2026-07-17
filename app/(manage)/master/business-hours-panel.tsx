"use client";

// 営業時間設定パネル（B-5 スライスA・mig0032）。店×曜日(0-6)の 営業/定休＋open/close。
// 読み=store_business_hours 直 SELECT（RLS: owner=org 全店/manager=自店/cast 0行）・
// 書き=set_store_business_hours RPC（owner/manager 自店・真の防御は RPC ゲート）。
// close の 24h超表記（30:00=翌06:00）は UI では「time 入力＋翌日チェック」で受け、送信時に変換
// （DB 正本は HH:MM 24h超表記＝shifts.end_hm と同規約）。保存は曜日ごと（未設定の曜日を
// 意図せず一括作成しない＝行なし「未設定」は後方互換で予約を縛らない状態のまま残せる）。
// owner 複数店は store select・manager は RLS で自店 1 件のため select 非表示。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { hm2min, min2hm } from "@/lib/nox/shift-time";
import { DOW_LABELS, type BusinessHourRow } from "@/lib/nox/business-hours";

type Store = { id: string; name: string };
type DowForm = { exists: boolean; closed: boolean; open: string; close: string; nextDay: boolean };

const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

const emptyForm = (): DowForm => ({ exists: false, closed: false, open: "20:00", close: "06:00", nextDay: true });

function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad hours")) return "閉店は開店より後にしてください（時刻の指定が不正です）";
  if (msg.includes("bad dow")) return "曜日の指定が不正です";
  if (msg.includes("forbidden")) return "営業時間を変更する権限がありません";
  return msg;
}

export default function BusinessHoursPanel({
  stores,
}: {
  stores: Store[];
}) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [forms, setForms] = useState<DowForm[]>(() => Array.from({ length: 7 }, emptyForm));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const supabase = createClient();
    setMsg(null);
    const { data, error } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeSel);
    if (error) { setMsg(`読み込みに失敗: ${error.message}`); return; }
    const next = Array.from({ length: 7 }, emptyForm);
    for (const r of (data ?? []) as BusinessHourRow[]) {
      if (r.is_closed) {
        next[r.dow] = { exists: true, closed: true, open: "20:00", close: "06:00", nextDay: true };
      } else {
        const closeMin = hm2min(r.close_hm ?? "00:00");
        next[r.dow] = {
          exists: true, closed: false, open: r.open_hm ?? "20:00",
          close: closeMin >= 1440 ? min2hm(closeMin - 1440) : (r.close_hm ?? "00:00"),
          nextDay: closeMin >= 1440,
        };
      }
    }
    setForms(next);
  }, [storeSel]);

  useEffect(() => { void load(); }, [load]);

  const patch = (dow: number, p: Partial<DowForm>) =>
    setForms((fs) => fs.map((f, i) => (i === dow ? { ...f, ...p } : f)));

  async function saveDow(dow: number) {
    const f = forms[dow];
    let closeHm: string | null = null;
    if (!f.closed) {
      if (!f.open || !f.close) { setMsg(`${DOW_LABELS[dow]}曜: 開店・閉店を入力してください`); return; }
      const closeMin = hm2min(f.close) + (f.nextDay ? 1440 : 0);
      if (closeMin <= hm2min(f.open)) { setMsg(`${DOW_LABELS[dow]}曜: 閉店は開店より後にしてください（日跨ぎは「翌日」をオン）`); return; }
      closeHm = min2hm(closeMin);  // 24h超表記へ変換（翌06:00 → 30:00）
    }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_store_business_hours", {
      p_store_id: storeSel,
      p_dow: dow,
      p_is_closed: f.closed,           // 規約7: 常に明示 boolean
      p_open_hm: f.closed ? null : f.open,
      p_close_hm: f.closed ? null : closeHm,
    });
    setBusy(false);
    if (error) { setMsg(`${DOW_LABELS[dow]}曜の保存に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg(`${DOW_LABELS[dow]}曜の営業時間を保存しました`);
    await load();
  }

  return (
    <section className="nox-cardtop" style={t.card}>
      <h2 style={secTitle}>営業時間（曜日別）</h2>
      {stores.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={input}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {msg && (
        <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes("失敗") || msg.includes("ください") ? "var(--bad)" : "var(--ok)", margin: "0 0 8px" }}>
          {msg}
        </p>
      )}
      <div style={{ display: "grid", gap: 7 }}>
        {forms.map((f, dow) => (
          <div key={dow} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
            padding: "7px 10px", background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13, width: 22 }}>{DOW_LABELS[dow]}</span>
            {!f.exists && <span style={{ fontSize: 11, color: "var(--sub)" }}>未設定</span>}
            <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={f.closed} onChange={(e) => patch(dow, { closed: e.target.checked })} />
              定休日
            </label>
            {!f.closed && (
              <>
                <span style={t.fieldLabel}>開店</span>
                <input type="time" value={f.open} onChange={(e) => patch(dow, { open: e.target.value })} style={{ ...input, maxWidth: 108 }} />
                <span style={t.fieldLabel}>閉店</span>
                <input type="time" value={f.close} onChange={(e) => patch(dow, { close: e.target.value })} style={{ ...input, maxWidth: 108 }} />
                <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={f.nextDay} onChange={(e) => patch(dow, { nextDay: e.target.checked })} />
                  翌日
                </label>
                {f.nextDay && <span style={{ fontSize: 11, color: "var(--sub)" }}>閉店 翌{f.close}</span>}
              </>
            )}
            <button style={{ ...t.btnGold, ...t.btnSm, marginLeft: "auto", opacity: busy ? 0.6 : 1 }} disabled={busy}
              onClick={() => void saveDow(dow)}>
              保存
            </button>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>
        ※定休日は予約を受け付けません（深夜は前営業日扱い＝例: 日曜定休なら月曜早朝も不可）。
        営業時間外の予約は警告つきで登録できます。未設定の曜日は制限しません。
      </p>
    </section>
  );
}
