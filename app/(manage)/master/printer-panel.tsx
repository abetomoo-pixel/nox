"use client";

// F4b レシートプリンタ管理（owner 専用・mig0044/0045）。
// - set_printer_config（enabled/serial・原則7＝両引数明示送信）・get_printer_config（token は has_token のみ）
// - rotate_store_token: 受信 URL（poll/result）＋token は発行時モーダルで一度だけ表示（kiosk PW 同型）
// - set_store_receipt_profile: レシートヘッダ4項目（settings_json・原則7＝4引数明示送信）
// - 直近ジョブ表: GET /api/print/jobs（print_jobs は deny-all＝route が唯一の読み口）
// ★printer_enabled=false 既定＝OFF ローンチ。実機検証（P4.6 同型の宿題）後に ON。
//
// ★M-11a（2026-08-27）: モックの2カラム構成へ追随（左=プリンタ設定＋印刷ジョブ／右=レシートヘッダ＋プレビュー）。
//   RPC・引数・エラー文言・受信URLの一度だけ表示は逐語で不変＝表示と配置のみ。
//   ★出さないもの（A-4 実測・教訓25）: ONLINE 表示・最終接続（ポーリング時刻を記録していない）・
//     テスト印刷（RPC が無い）・プリンタ名（printer_config に列が無い＝serial のみ）。
//   ★店舗名は表示のみ（storeName prop）＝編集は店舗設定側。プレビューの中央見出しにも使う。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";

type Profile = { address: string; tel: string; regNo: string; footer: string };
type Job = {
  id: string; check_id: string; pay_group: string; status: string;
  is_reprint: boolean; error_code: string | null; created_at: string; printed_at: string | null;
};

const card: React.CSSProperties = t.card;
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };
const btn: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const btnOn: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const inp: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const STATUS_JA: Record<string, string> = {
  queued: "待機中", printing: "印刷中", printed: "印刷済", failed: "失敗", canceled: "取消",
};

export default function PrinterPanel({ storeId, storeName, initialProfile }: { storeId: string; storeName: string; initialProfile: Profile }) {
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
    <div>
      <div className="nox-2col">
        {/* ── 左: プリンタ設定＋印刷ジョブ ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="nox-cardtop" style={card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={h3}>レシートプリンタ</h3>
              <span className="nox-stpill" style={{ marginLeft: "auto" }}>{enabled ? "有効" : "無効"}</span>
            </div>
            <p style={sub}>Server Direct Print 接続</p>
            <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 8px" }}>
              プリンタが受信URLへ定期アクセスして印刷します。実機設定に受信URLを登録してください
              （URL の再発行は下のボタン・発行時に一度だけ表示されます）。
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: "var(--gold)" }} />
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
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h3 style={h3}>印刷ジョブ</h3>
              <button onClick={() => void loadJobs()} disabled={busy} style={{ ...btn, marginLeft: "auto" }}>更新</button>
            </div>
            <p style={sub}>直近{jobs.length ? jobs.length : 0}件の印刷状況</p>
            <div style={{ overflowX: "auto" }}>
              <table className="nox-table">
                <thead>
                  <tr>
                    {["伝票", "種別", "時刻", "状態", "エラー"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 && (
                    <tr><td colSpan={5} style={{ color: "var(--sub)" }}>（印刷ジョブはまだありません）</td></tr>
                  )}
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ ...t.num, whiteSpace: "nowrap" }}>{j.check_id.replace(/-/g, "").slice(0, 8)}-{j.pay_group}{j.is_reprint ? " 再" : ""}</td>
                      <td>{j.is_reprint ? "再発行" : "初回"}</td>
                      <td style={{ ...t.num, whiteSpace: "nowrap" }}>{new Date(j.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ color: j.status === "printed" ? "var(--ok)" : j.status === "failed" ? "var(--bad)" : "var(--ink)" }}>{STATUS_JA[j.status] ?? j.status}</td>
                      <td style={{ color: "var(--sub)" }}>{j.error_code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── 右: レシートヘッダ＋プレビュー ── */}
        <section className="nox-cardtop" style={{ ...card, alignSelf: "start" }}>
          <h3 style={h3}>レシートヘッダ</h3>
          <p style={sub}>店舗情報とフッタを編集（適格簡易請求書の記載事項）</p>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>店舗名</span>
              <input value={storeName} readOnly disabled style={{ ...t.input, opacity: 0.7 }} />
              <span style={{ fontSize: 10.5, color: "var(--sub)" }}>店舗名は店舗設定で変更します。</span></label>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>住所</span>
              <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} style={t.input} maxLength={200} /></label>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>電話番号</span>
              <input value={profile.tel} onChange={(e) => setProfile({ ...profile, tel: e.target.value })} style={{ ...t.input, width: 220 }} maxLength={50} /></label>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>適格請求書発行事業者 登録番号（T+13桁・未登録なら空欄）</span>
              <input value={profile.regNo} onChange={(e) => setProfile({ ...profile, regNo: e.target.value })} placeholder="T1234567890123" style={{ ...t.input, width: 220 }} maxLength={14} /></label>
            <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>フッタ（お礼文など）</span>
              <textarea value={profile.footer} onChange={(e) => setProfile({ ...profile, footer: e.target.value })} rows={2}
                style={{ ...t.input, resize: "vertical", fontFamily: "inherit" }} maxLength={200} /></label>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => void saveProfile()} disabled={busy} style={btnOn}>ヘッダを保存</button>
            </div>
          </div>
          {/* E8-5 staff#6: レシート実プレビュー＝入力中の profile state の再描画のみ（保存前でも反映・
              白地黒字の直値は帳票プレビュー専用＝画面パレット対象外）。 */}
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 6px" }}>プレビュー（入力内容がそのまま印字ヘッダ・フッタに載ります）</p>
            <div style={{
              background: "#fff", color: "#000", width: 240, padding: "14px 12px", borderRadius: 4,
              fontSize: 11, lineHeight: 1.7, fontFamily: "monospace", border: "1px solid var(--line2)",
            }}>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: 12 }}>{storeName || "（店舗名）"}</div>
              <div style={{ textAlign: "center" }}>{profile.address || "（住所 未設定）"}</div>
              <div style={{ textAlign: "center" }}>{profile.tel ? `TEL ${profile.tel}` : "（電話 未設定）"}</div>
              {profile.regNo && <div style={{ textAlign: "center" }}>登録番号 {profile.regNo}</div>}
              <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>小計</span><span>¥10,000</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>サービス料</span><span>¥1,000</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>合計</span><span>¥11,000</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>（内消費税 10%</span><span>¥1,000）</span></div>
              <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              <div style={{ textAlign: "center" }}>{profile.footer || "（フッタ 未設定）"}</div>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--sub)", margin: "4px 0 0" }}>※金額はプレビュー用のサンプルです（実レシートは会計値）。</p>
          </div>
        </section>
      </div>

      {/* 受信URL 一度表示モーダル（kiosk PW 同型・再表示不可） */}
      {issuedToken && (
        <Modal onClose={() => setIssuedToken(null)} maxWidth={520}>
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
        </Modal>
      )}
    </div>
  );
}
