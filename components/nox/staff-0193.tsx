"use client";

// ★0193（下書き・MIG_0193_APPLIED 配下）: スタッフ詳細の 3 節＝肩書（set_membership_title）・役割の変更（set_membership_role＝管理者だけ・最後の 1 人は 'last owner'）・個人情報（get／set_staff_sensitive＝読むのは「表示」を押したときだけ＝閲覧は監査）。
// ★便 A M-80 追記③（2026-11-04・教訓133）: ボタンはすべて中央（.nox-actions）＝肩書の保存は入力欄の下・「管理者にする／店長に戻す」・「表示する」・「個人情報を保存」。
//   種別（bank_account_type）は 普通／当座／貯蓄 のボタン群（SegSelect）・生年月日は DatePicker（YYYY-MM-DD の手打ちをやめる）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import DatePicker from "@/components/ui/date-picker";
import { BANK_ACCOUNT_TYPE_OPTS } from "@/lib/nox/staff/work";

type Sel = { id: string; role: string; title?: string | null };
const ERR: Record<string, string> = { "last owner": "最後の 1 人の管理者は変更・退店できません", self: "自分の役割は変えられません", forbidden: "権限がありません", "bad bank_account_no": "口座番号は数字 8 桁までです", "too long": "長すぎます（20 字まで）" };
const errJa = (m: string) => Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? m;
const FIELDS: [string, string][] = [["real_name", "本名"], ["birthday", "生年月日"], ["address", "住所"], ["phone", "電話"], ["bank_name", "銀行"], ["bank_branch", "支店"], ["bank_account_type", "種別"], ["bank_account_no", "口座番号"], ["bank_account_holder_kana", "名義（カナ）"]];
const BANK_TYPE_OPTS: ReadonlyArray<readonly [string, string]> = [["", "—"], ...BANK_ACCOUNT_TYPE_OPTS];

export default function Staff0193({ sel, isOwner, roleRaw, onChanged }: { sel: Sel; isOwner: boolean; roleRaw: string; onChanged: () => void }) {
  const supabase = createClient();
  const [title, setTitle] = useState(sel.title ?? "");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sens, setSens] = useState<Record<string, string> | null>(null);
  const run = async (f: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => { setBusy(true); setMsg(null); const { error } = await f(); setBusy(false); if (error) { setMsg({ kind: "error", text: errJa(error.message) }); return false; } setMsg({ kind: "success", text: ok }); onChanged(); return true; };
  const field = (k: string, l: string) => {
    if (!sens) return null;
    if (k === "birthday") return <label key={k} style={{ display: "grid", gap: 2 }}><span style={{ ...t.sub, fontSize: 11.5 }}>{l}</span><DatePicker value={sens[k]} onChange={(v) => setSens({ ...sens, [k]: v })} ariaLabel="生年月日" width="100%" testId="staff-birthday" /></label>;
    if (k === "bank_account_type") return <label key={k} style={{ display: "grid", gap: 2 }}><span style={{ ...t.sub, fontSize: 11.5 }}>{l}</span><SegSelect value={sens[k]} onChange={(v) => setSens({ ...sens, [k]: v })} options={BANK_TYPE_OPTS} ariaLabel="口座の種別" /></label>;
    return <label key={k} style={{ display: "grid", gap: 2 }}><span style={{ ...t.sub, fontSize: 11.5 }}>{l}</span><input value={sens[k]} onChange={(e) => setSens({ ...sens, [k]: e.target.value })} style={t.input} /></label>;
  };
  return (
    <div data-staff-0193="1" style={{ display: "grid", gap: 10, margin: "8px 0" }}>
      <label style={{ display: "grid", gap: 3 }}><span style={t.fieldLabel}>肩書（店長・マネージャー・主任など・20 字まで・空なら権限の名前）</span>
        <input value={title} maxLength={20} onChange={(e) => setTitle(e.target.value)} style={t.input} />
        <span className="nox-actions" data-staff-title-actions="1"><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} data-staff-title-save="1" onClick={() => void run(() => supabase.rpc("set_membership_title", { p_membership_id: sel.id, p_title: title }), "肩書を保存しました")}>保存</button></span></label>
      {isOwner && roleRaw === "owner" && sel.role !== "cast" && (
        <div style={{ display: "grid", gap: 4 }} data-staff-role-change="1">
          <span style={t.fieldLabel}>役割</span>
          <div className="nox-actions">
            {sel.role !== "owner" && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { if (window.confirm("管理者にしますか？（全店舗・何でもできる権限になります。既存の管理者全員にお知らせが届きます）")) void run(() => supabase.rpc("set_membership_role", { p_membership_id: sel.id, p_new_role: "owner" }), "管理者にしました"); }}>管理者にする</button>}
            {sel.role === "owner" && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => { if (window.confirm("店長に戻しますか？（既存の管理者全員にお知らせが届きます）")) void run(() => supabase.rpc("set_membership_role", { p_membership_id: sel.id, p_new_role: "manager" }), "店長に戻しました"); }}>店長に戻す</button>}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }} data-staff-sensitive="1">
        <span style={t.fieldLabel}>個人情報（本名・生年月日・住所・電話・振込先）＝閲覧と変更は監査に残ります</span>
        {sens === null ? <div className="nox-actions"><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={async () => { setBusy(true); const { data, error } = await supabase.rpc("get_staff_sensitive", { p_membership_id: sel.id }); setBusy(false); if (error) { setMsg({ kind: "error", text: errJa(error.message) }); return; } const j = (data ?? {}) as Record<string, unknown>; setSens(Object.fromEntries(FIELDS.map(([k]) => [k, j[k] == null ? "" : String(j[k])]))); }}>表示する</button></div> : (<>
          {FIELDS.map(([k, l]) => field(k, l))}
          <div className="nox-actions"><button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy} onClick={() => void run(() => supabase.rpc("set_staff_sensitive", { p_membership_id: sel.id, p_patch: Object.fromEntries(Object.entries(sens).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()])) }), "個人情報を保存しました")}>個人情報を保存</button></div>
        </>)}
      </div>
      {msg && <Message kind={msg.kind} style={{ margin: 0 }}>{msg.text}</Message>}
    </div>
  );
}
