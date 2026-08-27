"use client";

// 機密（本名/生年月日/マイナンバー）＋税務（雇用区分/インボイス/登録番号）の登録。
//   ■ 機密は owner 限定: get_cast_sensitive は owner/cast本人のみ（manager は封印で読めない＝T6a）。
//     real_name/birthday は上書き更新（現値を読めない manager の blind write が既存を消す事故を避けるため
//     機密編集は owner に限定）。マイナンバーは平文入力 → set_cast_sensitive が DB 内で pgp_sym 暗号化（Vault 鍵）。
//     空欄のマイナンバーは「変更なし」（既存 enc 温存）。full 平文は owner の「表示」（service 経路・全件 audit）のみ。
//   ■ 税務は manager+: cast_tax_profiles はパターン2（manager+ 可視）。
//
// ★M-11a（2026-08-27）: モックの2カラム構成へ追随
//   （上=バナー／左=キャスト機密情報カード（本人情報＋税務設定）／右=アクセス権限＋最近の閲覧履歴）。
//   RPC・引数・検証・エラー文言は逐語で不変＝表示と配置のみ。
//   ★アクセス権限カードは A-5 の RLS/RPC 実測どおりの静的表:
//     機密（本名・生年月日・マイナンバー）= owner のみ閲覧（get_cast_sensitive）・全平文は支払調書経路のみ。
//     manager/staff は閲覧不可。税務（cast_tax_profiles）は manager+ が閲覧・編集可＝脚注で明示。
//     モックの「経理」ロールは NOX に無い＝出さない（M-10 C-3 でモック側を是正）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Cast = { id: string; name: string };
type Store = { id: string; name: string };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const label: React.CSSProperties = { fontSize: 12, color: "var(--sub)", display: "block" };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 2 };
const subP: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px" };

/** 相対時刻（N分前／N時間前／N日前／それ以前は M/D） */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

const ROLE_LABEL: Record<string, string> = { owner: "オーナー", manager: "店長", staff: "黒服" };

export default function SensitiveTaxPanel({ casts, stores, isOwner }: { casts: Cast[]; stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const [castId, setCastId] = useState(casts[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  // 機密（owner のみ）
  const [realName, setRealName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [mynumber, setMynumber] = useState(""); // 平文入力・空=変更なし（保存後は必ずクリア）
  const [mynumberSet, setMynumberSet] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null); // 支払調書・一時表示
  // 読込成功フラグ。set_* は real_name/birthday/mode/invoice/reg_no を無条件上書きするため、
  // 「現在の cast の現値を確かに読めた」ときだけ保存を許可＝読込エラー時に別 cast の残値を blind write する事故を封じる。
  const [sensitiveReady, setSensitiveReady] = useState(false);
  const [taxReady, setTaxReady] = useState(false);

  // 税務（manager+）
  const [mode, setMode] = useState("委託");
  const [invoice, setInvoice] = useState(""); // ''=未設定
  const [regNo, setRegNo] = useState("");
  // mig0073: 登録の効力期間・通知受領日。★本パネルに入力 UI は持たない（編集は payroll のインボイス欄）が、
  //   set_cast_tax_profile は upsert で excluded を無条件代入するため、読んだ現値をそのまま送り返さないと
  //   ここから保存した瞬間に3日付が null で消える（＝素通し必須）。
  const [regValidFrom, setRegValidFrom] = useState<string | null>(null);
  const [regValidTo, setRegValidTo] = useState<string | null>(null);
  const [regNotifiedOn, setRegNotifiedOn] = useState<string | null>(null);
  // E8-5 staff#8: 機微アクセスの閲覧履歴（audit_logs は記録済み＝読取追加のみ・owner 限定表示・直近10件）
  // ★M-11a: actor→ロール名・store_id→店舗名・target→キャスト名の写像を足す（読取のみ）。
  const [viewAudit, setViewAudit] = useState<{ id: string; action: string; target: string; at: string; actor_user_id: string | null; store_id: string | null }[]>([]);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    void supabase.from("audit_logs").select("id, action, target, at, actor_user_id, store_id")
      .in("action", ["read_cast_sensitive", "read_cast_mynumber_masked"])
      .order("at", { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setViewAudit((data ?? []) as typeof viewAudit); });
    void supabase.from("memberships").select("user_id, role, is_active")
      .then(({ data }) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as { user_id: string; role: string; is_active: boolean }[]) {
          if (r.is_active && !m[r.user_id]) m[r.user_id] = r.role;
        }
        setRoleByUser(m);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const load = useCallback(async () => {
    setMsg(null);
    setRevealed(null);
    setMynumber("");
    // cast 切替時・読込前に必ず初期化＝直前 cast の値が残って別 cast に上書き保存される事故を防ぐ。
    setRealName(""); setBirthday(""); setMynumberSet(false);
    setMode("委託"); setInvoice(""); setRegNo("");
    setSensitiveReady(false); setTaxReady(false);
    if (!castId) return;
    // 機密の読み戻しは owner のみ（manager は get_cast_sensitive で forbidden＝封印）。成功時のみ ready＝保存可。
    if (isOwner) {
      const { data: s, error: eS } = await supabase.rpc("get_cast_sensitive", { p_cast_id: castId });
      if (eS) { setMsg(`機密読込エラー: ${eS.message}（もう一度キャストを選択してください）`); }
      else {
        const row = (s ?? [])[0] as { real_name?: string | null; birthday?: string | null; mynumber_set?: boolean } | undefined;
        setRealName(row?.real_name ?? "");
        setBirthday(row?.birthday ?? "");
        setMynumberSet(row?.mynumber_set === true);
        setSensitiveReady(true);
      }
    }
    // 税務（cast_tax_profiles はパターン2＝manager+ 可視・直 SELECT で現状を読む）。成功時のみ ready。
    const { data: t, error: eT } = await supabase.from("cast_tax_profiles")
      .select("mode, invoice, reg_no, reg_valid_from, reg_valid_to, reg_notified_on").eq("cast_id", castId).maybeSingle();
    if (eT) { setMsg((prev) => prev ?? `税務読込エラー: ${eT.message}（もう一度キャストを選択してください）`); }
    else {
      setMode((t?.mode as string) ?? "委託");
      setInvoice((t?.invoice as string) ?? "");
      setRegNo((t?.reg_no as string) ?? "");
      setRegValidFrom((t?.reg_valid_from as string | null) ?? null);
      setRegValidTo((t?.reg_valid_to as string | null) ?? null);
      setRegNotifiedOn((t?.reg_notified_on as string | null) ?? null);
      setTaxReady(true);
    }
  }, [castId, isOwner, supabase]);

  useEffect(() => { void load(); }, [load]);

  async function saveSensitive() {
    setMsg(null);
    const p_mynumber = mynumber.trim() === "" ? null : mynumber.trim();
    if (p_mynumber !== null && !/^\d{12}$/.test(p_mynumber)) { setMsg("マイナンバーは数字12桁で入力してください"); return; }
    const { error } = await supabase.rpc("set_cast_sensitive", {
      p_cast_id: castId,
      p_real_name: realName.trim() === "" ? null : realName.trim(),
      p_birthday: birthday === "" ? null : birthday,
      p_mynumber, // 空=変更なし（既存 enc 温存）
    });
    if (error) { setMsg(`機密保存エラー: ${error.message}`); return; }
    setMynumber("");
    setMsg("機密情報を保存しました");
    void load();
  }

  async function saveTax() {
    setMsg(null);
    const p_reg_no = regNo.trim() === "" ? null : regNo.trim();
    if (p_reg_no !== null && !/^T\d{13}$/.test(p_reg_no)) { setMsg("登録番号は T＋数字13桁（例 T1234567890123）で入力してください"); return; }
    const { error } = await supabase.rpc("set_cast_tax_profile", {
      p_cast_id: castId,
      p_mode: mode,
      p_invoice: invoice === "" ? null : invoice,
      p_reg_no,
      // mig0073: 読んだ現値をそのまま返す（本パネルは3日付を編集しない＝素通しで消さない）
      p_reg_valid_from: regValidFrom,
      p_reg_valid_to: regValidTo,
      p_reg_notified_on: regNotifiedOn,
    });
    if (error) { setMsg(`税務保存エラー: ${error.message}`); return; }
    setMsg("税務情報を保存しました");
    void load();
  }

  async function reveal() {
    setMsg(null);
    setRevealed(null);
    const res = await fetch("/api/cast/mynumber", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ castId }),
    });
    const j = await res.json();
    if (!res.ok) { setMsg(`表示エラー(${res.status}): ${j.error ?? ""}`); return; }
    setRevealed(j.mynumber ?? "（未登録）");
  }

  // 閲覧履歴の写像（target='cast_sensitive:<cast_id>'＝A-6 実測）。
  const castNameOf = (target: string): string => {
    const id = target.split(":")[1] ?? "";
    return casts.find((c) => c.id === id)?.name ?? "キャスト";
  };
  const storeNameOf = (id: string | null): string => (id && stores.find((s) => s.id === id)?.name) ?? "—";
  const actorLabel = (uid: string | null): string => {
    const role = uid ? roleByUser[uid] : undefined;
    return role ? (ROLE_LABEL[role] ?? role) : "—";
  };
  // 同一 actor×target が1分以内に連続する行は1行へ畳む（×N）。
  const folded: Array<{ row: (typeof viewAudit)[number]; n: number }> = [];
  for (const a of viewAudit) {
    const last = folded[folded.length - 1];
    if (last && last.row.actor_user_id === a.actor_user_id && last.row.target === a.target
      && Math.abs(new Date(last.row.at).getTime() - new Date(a.at).getTime()) <= 60_000) {
      last.n += 1;
    } else {
      folded.push({ row: a, n: 1 });
    }
  }

  if (casts.length === 0) return null;

  return (
    <div>
      {/* ── 上部バナー ── */}
      <div style={{ ...t.alert, display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ minWidth: 0 }}>
          <b>機密情報へのアクセスは監査ログに記録されます</b>
          <span style={{ display: "block", fontSize: 11, opacity: 0.85 }}>マイナンバーの表示・変更はオーナー権限のみ実行できます。</span>
        </span>
        <span className="nox-stpill" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>ENCRYPTED</span>
      </div>

      <div className="nox-2col nox-2col--32">
        {/* ── 左: キャスト機密情報（本人情報＋税務設定） ── */}
        <section className="nox-cardtop" style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              <h3 style={h3}>キャスト機密情報</h3>
              <p style={{ ...subP, margin: 0 }}>本人確認・支払調書作成に使用</p>
            </span>
            <select value={castId} onChange={(e) => setCastId(e.target.value)} style={{ ...input, minWidth: 160, marginLeft: "auto" }} aria-label="キャスト">
              {casts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {msg && <p style={{ fontSize: 13, color: msg.includes("エラー") ? "var(--bad)" : "var(--ok)", marginTop: 8 }}>{msg}</p>}

          {/* 本人情報（owner のみ・manager は封印で読めないため非表示） */}
          {isOwner && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>本人情報</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={label}>本名<input value={realName} onChange={(e) => setRealName(e.target.value)} style={{ ...input, width: "100%" }} /></label>
                <label style={label}>生年月日<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={{ ...input, width: "100%" }} /></label>
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={label}>マイナンバー</span>
                  {mynumberSet && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 6px" }}>
                      {revealed ? (
                        <span style={{ fontFamily: "monospace", fontSize: 14, background: "var(--bg2)", color: "var(--champ)", border: "1px solid var(--line2)", padding: "2px 8px", borderRadius: 4 }}>{revealed}</span>
                      ) : (
                        <span className="num" style={{ letterSpacing: 2, color: "var(--sub)" }}>•••• •••• ••••</span>
                      )}
                      <button onClick={reveal} disabled={!castId} style={btnLight}>表示</button>
                    </div>
                  )}
                  <input value={mynumber} onChange={(e) => setMynumber(e.target.value)}
                    placeholder={mynumberSet ? "登録済み（変更する場合のみ入力）" : "未登録"} inputMode="numeric" style={{ ...input, width: "100%" }} />
                  <span style={{ fontSize: 10.5, color: "var(--sub)" }}>
                    数字12桁・入力すると暗号化保存／空欄は変更なし。表示は法定調書作成の用途に限定され、閲覧は全件 audit_logs に記録されます。
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button onClick={saveSensitive} disabled={!castId || !sensitiveReady} style={btnDark}>機密情報を保存</button>
              </div>
            </div>
          )}

          {/* 税務設定（manager+） */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>税務設定</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={label}>雇用区分<br />
                <SegSelect value={mode} onChange={(v) => setMode(v)}
                options={[["委託", "委託"], ["雇用", "雇用"]] as const} />
              </label>
              <label style={label}>インボイス<br />
                <SegSelect value={invoice} onChange={(v) => setInvoice(v)}
                options={[["", "未設定"], ["課税", "課税"], ["免税", "免税"]] as const} />
              </label>
              <label style={label}>登録番号（T＋13桁）<br />
                <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="T1234567890123" style={{ ...input, width: 160 }} />
              </label>
            </div>
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <button onClick={saveTax} disabled={!castId || !taxReady} style={btnDark}>税務情報を保存</button>
            </div>
            {!isOwner && <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>※ 本名・マイナンバー等の機密情報の登録・閲覧はオーナーのみ可能です。</p>}
          </div>
        </section>

        {/* ── 右: アクセス権限＋最近の閲覧履歴 ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="nox-cardtop" style={card}>
            <h3 style={h3}>アクセス権限</h3>
            <p style={subP}>機密情報を閲覧できる役割（RLS / RPC の実測）</p>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              <div style={t.bdRow}><span style={t.bdKey}>オーナー</span>
                <span style={t.bdVal}>表示・編集・支払調書用の全表示 <b style={{ color: "var(--ok)" }}>●許可</b></span></div>
              <div style={t.bdRow}><span style={t.bdKey}>店長</span>
                <span style={t.bdVal}>閲覧不可（封印） <b style={{ color: "var(--sub)" }}>●制限</b></span></div>
              <div style={t.bdRow}><span style={t.bdKey}>黒服</span>
                <span style={t.bdVal}>閲覧不可 <b style={{ color: "var(--sub)" }}>●制限</b></span></div>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0" }}>
              ※ 税務設定（雇用区分・インボイス・登録番号）は店長も閲覧・編集できます（機密＝本名・生年月日・マイナンバーのみ封印）。
            </p>
          </section>

          {/* E8-5 staff#8: 閲覧履歴（記録は既存＝読取のみ・owner 限定・直近10件。全量は /audit 機微アクセスビューへ） */}
          {isOwner && folded.length > 0 && (
            <section className="nox-cardtop" style={card}>
              <h3 style={h3}>最近の閲覧履歴</h3>
              <p style={subP}>機密情報の監査ログ（直近10件）</p>
              {folded.map(({ row: a, n }) => (
                <div key={a.id} title={a.target}
                  style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: "var(--ink)" }}>
                      {castNameOf(a.target)} の機密情報を閲覧{n > 1 && <span style={{ color: "var(--v2-muted)" }}>（×{n}）</span>}
                    </b>
                    <small style={{ display: "block", color: "var(--sub)" }}>{actorLabel(a.actor_user_id)} / {storeNameOf(a.store_id)}</small>
                  </span>
                  <span className="num" style={{ marginLeft: "auto", color: "var(--v2-muted)", whiteSpace: "nowrap" }}>{relTime(a.at)}</span>
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>すべての履歴は「操作履歴」ページ（機微アクセスビュー）で確認できます。</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
