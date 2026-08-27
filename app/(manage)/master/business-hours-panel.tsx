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
// ★DP-R 第3弾: dirty＝「この曜日をこの画面で触った」印。未設定(exists=false)の曜日を
//   一括保存で**意図せず作らない**という mig0032 の設計ロックを保ったまま、
//   一括設定で明示的に触った曜日だけは週間保存の対象に含めるための1ビット。
type DowForm = { exists: boolean; closed: boolean; open: string; close: string; nextDay: boolean; dirty?: boolean };

const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };

const BULK_LABEL: Record<string, string> = { all: "全曜日", weekday: "平日（月〜金）", weekend: "週末（金・土）" };

const emptyForm = (): DowForm => ({ exists: false, closed: false, open: "20:00", close: "06:00", nextDay: true });

function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad hours")) return "閉店は開店より後にしてください（時刻の指定が不正です）";
  if (msg.includes("bad dow")) return "曜日の指定が不正です";
  if (msg.includes("forbidden")) return "営業時間を変更する権限がありません";
  return msg;
}

// ★mig0106（裁定82・起票#14）: 営業日切替時刻（set_store_biz_cutoff）のエラー写像。
//   営業時間の rpcErrJa と分けているのは forbidden の文言が違うため（こちらは owner 限定）。
function cutoffErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad cutoff")) return "切替時刻の形式が不正です";
  if (msg.includes("band crosses cutoff")) {
    return "この時刻では時間帯料金の帯が営業日をまたぎます。先に時間帯料金を直してください";
  }
  if (msg.includes("forbidden")) return "権限がありません（オーナーのみ変更できます）";
  return msg;
}

// UI は4択（mock/pages-2026-08/nox-pricing-settings.html 準拠）。DB 側の許容は 03:00〜12:00。
const CUTOFF_OPTIONS = ["05:00", "06:00", "07:00", "08:00"] as const;

export default function BusinessHoursPanel({
  stores,
  isOwner,
}: {
  stores: Store[];
  isOwner: boolean;
}) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [forms, setForms] = useState<DowForm[]>(() => Array.from({ length: 7 }, emptyForm));
  const [msg, setMsg] = useState<string | null>(null);
  // ★mig0106: 営業日切替時刻（stores.settings_json.biz_cutoff_hm・既定 06:00）。
  const [cutoffHm, setCutoffHm] = useState("06:00");
  const [cutoffMsg, setCutoffMsg] = useState<string | null>(null);
  const [cutoffBusy, setCutoffBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  // ★DP-R 第3弾: 一括設定フォーム（モック .bulk）。DB には触らない入力補助。
  const [bulkOpen, setBulkOpen] = useState("20:00");
  const [bulkClose, setBulkClose] = useState("01:00");
  const [bulkNext, setBulkNext] = useState(true);
  const [bulkTarget, setBulkTarget] = useState<"all" | "weekday" | "weekend">("all");

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
    // ★mig0106: 切替時刻も同じ load で読む（stores は RLS で自店1行＝owner は org 全店）。
    //   経路は dashboard/page.tsx と同型＝settings_json.biz_cutoff_hm・不正/未設定は既定 '06:00'。
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeSel).single();
    const sj = (st?.settings_json ?? {}) as Record<string, unknown>;
    const hm = typeof sj.biz_cutoff_hm === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(sj.biz_cutoff_hm)
      ? sj.biz_cutoff_hm : "06:00";
    setCutoffHm(hm);
    setCutoffMsg(null);
  }, [storeSel]);

  // ★mig0106: 切替時刻の保存（owner 限定＝RPC 側も auth_role()<>'owner' で forbidden）。
  async function saveCutoff(hm: string) {
    const prev = cutoffHm;
    setCutoffHm(hm);
    setCutoffBusy(true); setCutoffMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_store_biz_cutoff", { p_store_id: storeSel, p_hm: hm });
    setCutoffBusy(false);
    if (error) { setCutoffHm(prev); setCutoffMsg(`切替時刻の保存に失敗: ${cutoffErrJa(error.message)}`); return; }
    setCutoffMsg(`営業日の切替時刻を ${hm} にしました`);
    await load();
  }

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

  // ★DP-R 第3弾: 週間まとめ保存（モック「週間設定を保存」）。
  //   ★送る RPC も引数も saveDow と同一＝**同じ set_store_business_hours を曜日ぶん順に呼ぶだけ**。
  //   ★対象は「行がある曜日」＋「この画面で一括設定を当てた曜日」だけ＝未設定の曜日は作らない。
  async function saveWeek() {
    const targets = forms.map((f, dow) => ({ f, dow })).filter(({ f }) => f.exists || f.dirty);
    if (targets.length === 0) { setMsg("保存する曜日がありません（先に営業時間を入力してください）"); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const failed: string[] = [];
    for (const { f, dow } of targets) {
      let closeHm: string | null = null;
      if (!f.closed) {
        if (!f.open || !f.close) { failed.push(`${DOW_LABELS[dow]}(未入力)`); continue; }
        const closeMin = hm2min(f.close) + (f.nextDay ? 1440 : 0);
        if (closeMin <= hm2min(f.open)) { failed.push(`${DOW_LABELS[dow]}(閉店が開店以前)`); continue; }
        closeHm = min2hm(closeMin);
      }
      const { error } = await supabase.rpc("set_store_business_hours", {
        p_store_id: storeSel,
        p_dow: dow,
        p_is_closed: f.closed,
        p_open_hm: f.closed ? null : f.open,
        p_close_hm: f.closed ? null : closeHm,
      });
      if (error) failed.push(`${DOW_LABELS[dow]}(${rpcErrJa(error.message)})`);
    }
    setBusy(false);
    setMsg(failed.length === 0
      ? `週間設定を保存しました（${targets.length}曜日）`
      : `一部の曜日を保存できませんでした: ${failed.join(" / ")}`);
    await load();
  }

  // ★DP-R 第3弾: 一括設定（モック「よく使う曜日へ同じ時間をまとめて適用」）。
  //   ★DB は触らない＝**入力欄に流し込むだけ**。保存は各行の「保存」か「週間設定を保存」。
  function applyBulk() {
    const target = bulkTarget === "weekday" ? [1, 2, 3, 4, 5]
      : bulkTarget === "weekend" ? [5, 6]
      : [0, 1, 2, 3, 4, 5, 6];
    setForms((fs) => fs.map((f, i) => target.includes(i)
      ? { ...f, closed: false, open: bulkOpen, close: bulkClose, nextDay: bulkNext, dirty: true }
      : f));
    setMsg(`${BULK_LABEL[bulkTarget]}に ${bulkOpen}〜${bulkNext ? "翌" : ""}${bulkClose} を入力しました（保存ボタンで確定します）`);
  }

  // 表示用の集計（forms の再形のみ＝新規取得なし）
  const openForms = forms.filter((f) => f.exists && !f.closed);
  const weekMin = openForms.reduce((a, f) => {
    const c = hm2min(f.close) + (f.nextDay ? 1440 : 0);
    return a + Math.max(0, c - hm2min(f.open));
  }, 0);
  const spanOf = (f: DowForm) => Math.max(0, hm2min(f.close) + (f.nextDay ? 1440 : 0) - hm2min(f.open));
  // 「通常営業時間（最多設定）」＝同じ 開店〜閉店 の組み合わせが最も多い曜日の設定
  const modeHours = (() => {
    const cnt = new Map<string, number>();
    for (const f of openForms) {
      const k = `${f.open}|${f.nextDay ? "翌" : ""}${f.close}`;
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
    let best: string | null = null; let n = 0;
    for (const [k, v] of cnt) if (v > n) { best = k; n = v; }
    return best ? best.replace("|", " 〜 ") : null;
  })();

  return (
    <>
      {/* ★DP-R 第3弾（教訓26＝構造照合）: モック nox-business-hours-settings の4ブロック構造へ追随。
          ① KPI帯4枚（営業日／週間営業時間／通常営業時間／特別日設定）＝モック逐語の並び。
          ② 週間営業時間カード（一括設定＋曜日テーブル＋深夜営業の注記）
          ③ 特別営業日・臨時休業カード ／ ④ 特別日を追加カード
          ★③④の実体は無い（store_business_hours は「店×曜日」の1テーブルのみで、日付ごとの
            例外を持つ列もテーブルも存在しない＝mig0032）。器はモックの位置に置き、
            操作は disabled ＋「準備中」＝押しても何も起きないものを作らない（教訓25）。
            従来この2ブロックは「営業時間#7 後送り」で**存在ごと出していなかった**が、
            相談役裁定（器を全構築・実体なきものは準備中）に従って器を出す。 */}
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">営業日</div>
          <div className="nox-kpi2-v num">{openForms.length}<small>日</small></div>
          <div className="nox-kpi2-s">週間（定休 {forms.filter((f) => f.exists && f.closed).length}日・未設定 {forms.filter((f) => !f.exists).length}日）</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">週間営業時間</div>
          <div className="nox-kpi2-v num">{Math.floor(weekMin / 60)}<small>時間</small></div>
          <div className="nox-kpi2-s">合計{weekMin % 60 ? `（+${weekMin % 60}分）` : ""}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">通常営業時間</div>
          <div className="nox-kpi2-v num" style={{ fontSize: 17 }}>{modeHours ?? "—"}</div>
          <div className="nox-kpi2-s">{modeHours ? "最多設定" : "営業日が未設定です"}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">特別日設定</div>
          <div className="nox-kpi2-v num">—</div>
          <div className="nox-kpi2-s">準備中</div>
        </div>
      </div>

      {/* ★mig0106（裁定82・起票#14）: 営業日の切替時刻。KPI帯の直下・週間営業時間カードの上に独立 section。
          ★owner のみ編集可（RPC も auth_role()<>'owner' で forbidden＝表示ゲートは二重防御の外側）。
          ★選択肢は4択（mock/pages-2026-08/nox-pricing-settings.html 準拠）。DB の許容は 03:00〜12:00。 */}
      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>営業日の切替時刻</h2>
            <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>
              この時刻より前の伝票・打刻は前日の営業日に含めます。締め済みの日報には影響しません。
            </p>
          </div>
          {isOwner ? (
            <select
              value={cutoffHm}
              disabled={cutoffBusy || !storeSel}
              onChange={(e) => void saveCutoff(e.target.value)}
              style={input}
              aria-label="営業日の切替時刻"
            >
              {CUTOFF_OPTIONS.map((hm) => <option key={hm} value={hm}>{hm}</option>)}
            </select>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <b className="num" style={{ fontSize: 16 }}>{cutoffHm}</b>
              <span className="nox-stpill">オーナーのみ変更できます</span>
            </span>
          )}
        </div>
        {cutoffMsg && <p style={{ ...t.sub, fontSize: 12, margin: "10px 0 0" }}>{cutoffMsg}</p>}
      </section>


      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>週間営業時間</h2>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>曜日ごとに営業時間または定休日を設定します</p>
          </div>
          <button style={{ ...t.btnGold, ...t.btnSm, marginLeft: "auto", opacity: busy ? 0.6 : 1 }} disabled={busy}
            title="行のある曜日と、一括設定で入力した曜日をまとめて保存します"
            onClick={() => void saveWeek()}>週間設定を保存</button>
        </div>
        {stores.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={input}>
              {stores.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
            </select>
          </div>
        )}
        {msg && (
          <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.includes("失敗") || msg.includes("ください") || msg.includes("できません") ? "var(--bad)" : "var(--ok)", margin: "0 0 8px" }}>
            {msg}
          </p>
        )}

        {/* 一括設定（モック .bulk）＝入力欄に流し込むだけ・DB は触らない */}
        <div className="nox-inset" style={{ padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <b style={{ fontSize: 12.5 }}>一括設定</b>
            <span style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>よく使う曜日へ同じ時間をまとめて適用（押しても保存はされません）</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={t.fieldLabel}>開店</span>
            <input type="time" value={bulkOpen} onChange={(e) => setBulkOpen(e.target.value)} style={{ ...input, maxWidth: 108 }} />
            <span style={t.fieldLabel}>閉店</span>
            <input type="time" value={bulkClose} onChange={(e) => setBulkClose(e.target.value)} style={{ ...input, maxWidth: 108 }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={bulkNext} onChange={(e) => setBulkNext(e.target.checked)} />翌日
            </label>
            <span style={t.fieldLabel}>適用先</span>
            <div className="nox-seg">
              {(["all", "weekday", "weekend"] as const).map((k) => (
                <button key={k} className={bulkTarget === k ? "on" : ""} onClick={() => setBulkTarget(k)}>{BULK_LABEL[k]}</button>
              ))}
            </div>
            <button style={{ ...t.btnGold, ...t.btnSm }} onClick={applyBulk}>適用</button>
          </div>
        </div>

        {/* 曜日テーブル（モック .table = 曜日／営業状態／開店／閉店／営業時間／状態） */}
        <div className="nox-tablewrap">
          <table className="nox-table">
            <thead>
              <tr><th>曜日</th><th>営業状態</th><th>開店</th><th>閉店</th><th>営業時間</th><th>状態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {forms.map((f, dow) => (
                <tr key={dow}>
                  <td style={{ fontWeight: 800 }}>{DOW_LABELS[dow]}</td>
                  <td>
                    <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={f.closed} onChange={(e) => patch(dow, { closed: e.target.checked, dirty: true })} />
                      定休日
                    </label>
                  </td>
                  <td>
                    {f.closed ? <span style={{ color: "var(--v2-muted)" }}>—</span> : (
                      <input type="time" value={f.open} onChange={(e) => patch(dow, { open: e.target.value, dirty: true })} style={{ ...input, maxWidth: 108 }} />
                    )}
                  </td>
                  <td>
                    {f.closed ? <span style={{ color: "var(--v2-muted)" }}>—</span> : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="time" value={f.close} onChange={(e) => patch(dow, { close: e.target.value, dirty: true })} style={{ ...input, maxWidth: 108 }} />
                        <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                          <input type="checkbox" checked={f.nextDay} onChange={(e) => patch(dow, { nextDay: e.target.checked, dirty: true })} />翌
                        </label>
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {f.closed ? "—" : `${Math.floor(spanOf(f) / 60)}時間${spanOf(f) % 60 ? `${spanOf(f) % 60}分` : ""}`}
                  </td>
                  <td>
                    <span className={`nox-stpill ${f.exists ? "ok" : ""}`}>{f.exists ? (f.dirty ? "未保存" : "保存済み") : "未設定"}</span>
                  </td>
                  <td>
                    <button style={{ ...t.btnGold, ...t.btnSm, opacity: busy ? 0.6 : 1 }} disabled={busy}
                      onClick={() => void saveDow(dow)}>保存</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0", lineHeight: 1.8 }}>
          <b>深夜営業：</b>閉店が翌日になる場合は「翌」をオンにします（例 20:00〜翌1:00）。
          ※定休日は予約を受け付けません（深夜は前営業日扱い＝例: 日曜定休なら月曜早朝も不可）。
          営業時間外の予約は警告つきで登録できます。未設定の曜日は制限しません。
        </p>
      </section>

      {/* ③ 特別営業日・臨時休業（実体なし＝準備中） */}
      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>特別営業日・臨時休業</h2>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>通常設定より優先して適用されます</p>
          </div>
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>準備中</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0, lineHeight: 1.8 }}>
          日付ごとの臨時休業・特別営業は<b>準備中</b>です。現在は上の曜日設定だけが使われます。
          祝日やイベント日に営業時間を変える場合は、当日その曜日の設定を直してください（翌週も同じ設定になります）。
        </p>
      </section>

      {/* ④ 特別日を追加（実体なし＝入力できない器） */}
      <section className="nox-cardtop" style={t.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>特別日を追加</h2>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>祝日やイベント日の営業時間を個別設定</p>
          </div>
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>準備中</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", opacity: 0.45 }}>
          <span style={t.fieldLabel}>日付</span>
          <input type="date" disabled style={{ ...input, maxWidth: 150 }} />
          <span style={t.fieldLabel}>設定内容</span>
          <div className="nox-seg">
            <button disabled>臨時休業</button>
            <button disabled>特別営業</button>
          </div>
          <span style={t.fieldLabel}>名称・理由</span>
          <input disabled placeholder="例: 年末年始" style={{ ...input, maxWidth: 170 }} />
          <span style={t.fieldLabel}>特別営業時間</span>
          <input type="time" disabled style={{ ...input, maxWidth: 108 }} />
          <span>〜</span>
          <input type="time" disabled style={{ ...input, maxWidth: 108 }} />
          <button style={{ ...t.btnGold, ...t.btnSm }} disabled>特別日を追加</button>
        </div>
      </section>
    </>
  );
}
