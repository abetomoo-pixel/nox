"use client";

// F4b レシートプリンタ管理（owner 専用・mig0044/0045）。
// - set_printer_config（enabled/serial・原則7＝両引数明示送信）・get_printer_config（token は has_token のみ）
// - rotate_store_token: 受信 URL（poll/result）＋token は発行時モーダルで一度だけ表示（kiosk PW 同型）
// - set_store_receipt_profile: レシートヘッダ4項目（settings_json・原則7＝4引数明示送信）
// - 直近ジョブ表: GET /api/print/jobs（print_jobs は deny-all＝route が唯一の読み口）
// ★printer_enabled=false 既定＝OFF ローンチ。実機検証（P4.6 同型の宿題）後に ON。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Profile = { address: string; tel: string; regNo: string; footer: string };
type Job = {
  id: string; check_id: string; pay_group: string; status: string;
  is_reprint: boolean; error_code: string | null; created_at: string; printed_at: string | null;
};

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.62)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
};
const modalCard: React.CSSProperties = { ...t.card, width: "100%", maxWidth: 520, marginBottom: 0 };
const STATUS_JA: Record<string, string> = {
  queued: "待機中", printing: "印刷中", printed: "印刷済", failed: "失敗", canceled: "取消",
};

export default function PrinterPanel({ storeId, initialProfile }: { storeId: string; initialProfile: Profile }) {
  const supabase = createClient();
  const [enabled, setEnabled] = useState(false);
  const [serial, setSerial] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCfg = useCallback(async () => {
    const { data } = await supabase.rpc("get_printer_config", { p_store_id: storeId });
    const c = data as { printer_enabled: boolean; printer_serial: string | null; has_token: boolean } | null;
    if (c) { setEnabled(c.printer_enabled === true); setSerial(c.printer_serial ?? ""); setHasToken(c.has_token === true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/print/jobs?store_id=${storeId}`);
      if (!res.ok) return;
      const j = (await res.json()) as { jobs: Job[] };
      setJobs(j.jobs ?? []);
    } catch { /* 補助表示 */ }
  }, [storeId]);

  useEffect(() => { void loadCfg(); void loadJobs(); }, [loadCfg, loadJobs]);

  async function saveCfg() {
    if (busy) return;
    setBusy(true); setMsg("");
    // 原則7: enabled/serial とも常に明示送信
    const { error } = await supabase.rpc("set_printer_config", {
      p_store_id: storeId, p_enabled: enabled, p_serial: serial.trim() || null,
    });
    setMsg(error ? `エラー: ${error.message}` : "プリンタ設定を保存しました");
    setBusy(false);
    if (!error) await loadCfg();
  }

  async function rotate() {
    if (busy) return;
    if (hasToken && !confirm("受信URLを再発行しますか？（旧URLは即時無効＝プリンタ側の設定更新が必要です）")) return;
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("rotate_store_token", { p_store_id: storeId });
    setBusy(false);
    if (error) { setMsg(`エラー: ${error.message}`); return; }
    setIssuedToken(data as string); setCopied(false);
    await loadCfg();
  }

  async function saveProfile() {
    if (busy) return;
    setBusy(true); setMsg("");
    // 原則7: 4項目とも常に明示送信（部分 null で黙って消さない）
    const { error } = await supabase.rpc("set_store_receipt_profile", {
      p_store_id: storeId, p_address: profile.address, p_tel: profile.tel,
      p_reg_no: profile.regNo, p_footer: profile.footer,
    });
    setMsg(error
      ? error.message.includes("bad reg_no") ? "エラー: 登録番号は T+13桁で入力してください（例 T1234567890123）" : `エラー: ${error.message}`
      : "レシートヘッダを保存しました");
    setBusy(false);
  }

  const pollUrl = (tok: string) => `${location.origin}/api/print/poll/${tok}`;
  const resultUrl = (tok: string) => `${location.origin}/api/print/result/${tok}`;
  async function copyUrls() {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(`印刷リクエストURL: ${pollUrl(issuedToken)}\n印刷結果URL: ${resultUrl(issuedToken)}`);
    setCopied(true);
  }

  return (
    <div style={{ maxWidth: 720, marginTop: 24 }}>
      <h2 style={h2}>レシートプリンタ</h2>

      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>プリンタ設定（Server Direct Print）</h3>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
          プリンタが受信URLへ定期アクセスして印刷します。実機設定に受信URLを登録してください
          （URL の再発行は下のボタン・発行時に一度だけ表示されます）。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: "#C9A24A" }} />
            {" "}印刷を有効にする
          </label>
          <label style={{ fontSize: 12 }}>シリアル（任意・一致検証）{" "}
            <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="例: TM-m30 のシリアル"
              style={{ ...inp, width: 190 }} />
          </label>
          <button onClick={() => void saveCfg()} disabled={busy} style={btnOn}>保存</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>
            受信URL: <strong style={{ color: hasToken ? "var(--ok)" : "var(--sub)" }}>{hasToken ? "発行済み" : "未発行"}</strong>
          </span>
          <button onClick={() => void rotate()} disabled={busy} style={btn}>{hasToken ? "再発行" : "発行"}</button>
        </div>
        {msg && <p style={{ fontSize: 12, color: msg.startsWith("エラー") ? "var(--bad)" : "var(--ok)", margin: "8px 0 0" }}>{msg}</p>}
      </section>

      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>レシートヘッダ（適格簡易請求書の記載事項）</h3>
        <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>住所</span>
            <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} style={t.input} maxLength={200} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>電話番号</span>
            <input value={profile.tel} onChange={(e) => setProfile({ ...profile, tel: e.target.value })} style={{ ...t.input, width: 220 }} maxLength={50} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>適格請求書発行事業者 登録番号（T+13桁・未登録なら空欄）</span>
            <input value={profile.regNo} onChange={(e) => setProfile({ ...profile, regNo: e.target.value })} placeholder="T1234567890123" style={{ ...t.input, width: 220 }} maxLength={14} /></label>
          <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>フッタ（お礼文など）</span>
            <input value={profile.footer} onChange={(e) => setProfile({ ...profile, footer: e.target.value })} style={t.input} maxLength={200} /></label>
          <div><button onClick={() => void saveProfile()} disabled={busy} style={btnOn}>保存</button></div>
        </div>
      </section>

      <section className="nox-cardtop" style={card}>
        <h3 style={h3}>印刷ジョブ（直近{jobs.length ? jobs.length : 0}件）
          <button onClick={() => void loadJobs()} disabled={busy} style={{ ...btn, marginLeft: 10 }}>更新</button>
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line2)" }}>
                {["伝票", "状態", "種別", "時刻", "エラー"].map((h) => (
                  <th key={h} style={{ padding: 6, color: "var(--sub)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 8, color: "var(--sub)" }}>（印刷ジョブはまだありません）</td></tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: 6, ...t.num, whiteSpace: "nowrap" }}>{j.check_id.replace(/-/g, "").slice(0, 8)}-{j.pay_group}{j.is_reprint ? " 再" : ""}</td>
                  <td style={{ padding: 6, color: j.status === "printed" ? "var(--ok)" : j.status === "failed" ? "var(--bad)" : "var(--ink)" }}>{STATUS_JA[j.status] ?? j.status}</td>
                  <td style={{ padding: 6 }}>{j.is_reprint ? "再発行" : "初回"}</td>
                  <td style={{ padding: 6, ...t.num, whiteSpace: "nowrap" }}>{new Date(j.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={{ padding: 6, color: "var(--sub)" }}>{j.error_code ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 受信URL 一度表示モーダル（kiosk PW 同型・再表示不可） */}
      {issuedToken && (
        <div style={overlay} onClick={() => setIssuedToken(null)}>
          <div className="nox-cardtop" style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={h3}>受信URLを発行しました</h3>
            <div style={{ display: "grid", gap: 6, marginBottom: 10, fontSize: 12 }}>
              <div><span style={t.bdKey}>印刷リクエストURL</span><div style={{ ...t.num, wordBreak: "break-all" }}>{pollUrl(issuedToken)}</div></div>
              <div><span style={t.bdKey}>印刷結果URL</span><div style={{ ...t.num, wordBreak: "break-all" }}>{resultUrl(issuedToken)}</div></div>
            </div>
            <p style={{ ...t.alert, marginBottom: 10 }}>このURLは再表示できません（漏洩時は再発行＝旧URLは即時無効）。プリンタの Server Direct Print 設定に登録してください。</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn} onClick={() => void copyUrls()}>{copied ? "コピーしました ✓" : "URL をコピー"}</button>
              <button style={btnOn} onClick={() => setIssuedToken(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
