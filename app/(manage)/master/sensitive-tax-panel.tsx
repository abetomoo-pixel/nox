"use client";

// 機密（本名/生年月日/マイナンバー）＋税務（雇用区分/インボイス/登録番号）の登録。
//   ■ 機密は owner 限定: get_cast_sensitive は owner/cast本人のみ（manager は封印で読めない＝T6a）。
//     real_name/birthday は上書き更新（現値を読めない manager の blind write が既存を消す事故を避けるため
//     機密編集は owner に限定）。マイナンバーは平文入力 → set_cast_sensitive が DB 内で pgp_sym 暗号化（Vault 鍵）。
//     空欄のマイナンバーは「変更なし」（既存 enc 温存）。full 平文は owner の「支払調書用に表示」（service 経路・全件 audit）のみ。
//   ■ 税務は manager+: cast_tax_profiles はパターン2（manager+ 可視）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

type Cast = { id: string; name: string };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const label: React.CSSProperties = { fontSize: 12, color: "var(--sub)", display: "block" };

export default function SensitiveTaxPanel({ casts, isOwner }: { casts: Cast[]; isOwner: boolean }) {
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
    const { data: t, error: eT } = await supabase.from("cast_tax_profiles").select("mode, invoice, reg_no").eq("cast_id", castId).maybeSingle();
    if (eT) { setMsg((prev) => prev ?? `税務読込エラー: ${eT.message}（もう一度キャストを選択してください）`); }
    else {
      setMode((t?.mode as string) ?? "委託");
      setInvoice((t?.invoice as string) ?? "");
      setRegNo((t?.reg_no as string) ?? "");
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

  if (casts.length === 0) return null;

  return (
    <section className="nox-cardtop" style={card}>
      <h2 style={{ ...t.pheadH1, fontSize: 16, margin: "0 0 10px" }}>機密・税務情報</h2>
      <label style={label}>
        キャスト
        <br />
        <select value={castId} onChange={(e) => setCastId(e.target.value)} style={{ ...input, minWidth: 160 }}>
          {casts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      {msg && <p style={{ fontSize: 13, color: msg.includes("エラー") ? "var(--bad)" : "var(--ok)", marginTop: 8 }}>{msg}</p>}

      {/* 機密（owner のみ・manager は封印で読めないため非表示） */}
      {isOwner && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>機密（本名・生年月日・マイナンバー）</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 480 }}>
            <label style={label}>本名<input value={realName} onChange={(e) => setRealName(e.target.value)} style={{ ...input, width: "100%" }} /></label>
            <label style={label}>生年月日<input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={{ ...input, width: "100%" }} /></label>
            <label style={{ ...label, gridColumn: "1 / -1" }}>
              マイナンバー（数字12桁・入力すると暗号化保存／空欄は変更なし）
              <input value={mynumber} onChange={(e) => setMynumber(e.target.value)} placeholder={mynumberSet ? "登録済み（変更する場合のみ入力）" : "未登録"} inputMode="numeric" style={{ ...input, width: "100%" }} />
            </label>
          </div>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0" }}>
            登録状態: <strong style={{ color: mynumberSet ? "var(--ok)" : "var(--sub)" }}>{mynumberSet ? "登録済み（暗号化）" : "未登録"}</strong>
            {"　"}※ マイナンバーは暗号化保存され、管理者（manager）は閲覧できません（封印）。
          </p>
          <button onClick={saveSensitive} disabled={!castId || !sensitiveReady} style={btnDark}>機密を保存</button>

          {/* 支払調書（full 平文・全件 audit） */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line2)" }}>
            <button onClick={reveal} disabled={!castId || !mynumberSet} style={btnLight}>支払調書用にマイナンバーを表示</button>
            {revealed && (
              <span style={{ marginLeft: 10, fontFamily: "monospace", fontSize: 14, background: "var(--bg2)", color: "var(--champ)", border: "1px solid var(--line2)", padding: "2px 8px", borderRadius: 4 }}>
                {revealed}
              </span>
            )}
            <p style={{ fontSize: 11, color: "var(--champ)", margin: "4px 0 0" }}>※ 表示は法定調書作成の用途に限定。閲覧は全件 audit_logs に記録されます。</p>
          </div>
        </div>
      )}

      {/* 税務（manager+） */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>税務（雇用区分・インボイス）</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={label}>雇用区分<br />
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={input}>
              <option value="委託">委託</option>
              <option value="雇用">雇用</option>
            </select>
          </label>
          <label style={label}>インボイス<br />
            <select value={invoice} onChange={(e) => setInvoice(e.target.value)} style={input}>
              <option value="">未設定</option>
              <option value="課税">課税</option>
              <option value="免税">免税</option>
            </select>
          </label>
          <label style={label}>登録番号（T＋13桁）<br />
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="T1234567890123" style={{ ...input, width: 160 }} />
          </label>
          <button onClick={saveTax} disabled={!castId || !taxReady} style={btnDark}>税務を保存</button>
        </div>
        {!isOwner && <p style={{ fontSize: 11, color: "var(--sub)", margin: "8px 0 0" }}>※ 本名・マイナンバー等の機密情報の登録・閲覧はオーナーのみ可能です。</p>}
      </div>
    </section>
  );
}
