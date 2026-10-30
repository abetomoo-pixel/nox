"use client";

// スタッフ管理ボード（F3a 束3 UI）。一覧＝memberships＋users 直接 SELECT（RLS: owner=org 全店/manager=自店）。
// 操作は全て RPC 経由＝トグル set_staff_perms（束3-1）・編集 staff_update_profile/transfer_store/change_role・
// 在籍解除/再雇用 staff_deactivate/reactivate（Q-1）・追加 POST /api/staff/create（Q-2）。
// UI の出し分け（owner/manager・自店・自分の行）は利便のための表示制御＝真の防御は RPC ゲート（二重に守る）。
import { useCallback, useEffect, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import PageHead from "@/components/ui/page-head";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import PhotoEdit from "@/components/ui/photo-edit"; // ★X-13-4: 名前の横に写真（現在・変更・削除）＝キャスト詳細と同じ部品
import Toast, { Message } from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import { FieldStack, TelLink } from "@/components/ui/responsive-kit"; // ★裁定381（GV-B W-10）・★0172: TelLink（スタッフの電話）

import { useIsDemo } from "@/lib/nox/demo/context"; // ★N7-2 ③
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
// ★0162（裁定329／329 追補1・便 M5-1）: スタッフ写真＝キャストと同じ bucket・同じ縮小・u_{user_id}.jpg。登録／差替え＝uploadUserPhoto・削除＝storage.remove → clear_user_photo
import { resolveOrgId } from "@/lib/nox/cast-photo";
import { photoActionLabelOf, removeUserPhoto, signUserPhotos, uploadUserPhoto } from "@/lib/nox/staff-photo";
import { mig0183On, mig0190On, rules0175On } from "@/lib/nox/rules-0175/flag"; // ★追補 3 R-8 // ★便 M-9（0183） // ★0190（裁定436 ①c）: 在籍解除の失効（route）
import { ownerOnlyNoteOf, roleChangeTargetsOf, roleChangeTextOf, roleLabelOf, rolePillKindOf, staffListRolesOf } from "@/lib/nox/rules-0175/roles";
import { INVITE_STATE_LABEL, LOGIN_METHOD_NOTE, LOGIN_METHOD_OPTIONS, inviteErrJa, inviteExpiryTextOf, inviteFormErrorOf, inviteStateOf, type LoginMethod } from "@/lib/nox/people/invite"; // ★便 ON-3（0176 ★2 I-1）: 登録→招待の 2 段
import { LINE_BIND_NOTE, liffBindUrlOf } from "@/lib/nox/line/liff-endpoint"; // ★便 ON-3（0176 ★1 401）: LINE 連携のリンク
import ContactChangesPanel from "@/components/nox/contact-changes-panel"; // ★便 ON-3（0176 ★4 400）: 連絡先の変更（未確認） // ★追補 3 R-8（裁定425 候補）: 役割「管理者」
type Mem = {
  id: string; user_id: string; store_id: string; role: string; is_active: boolean;
  can_register: boolean; can_crm: boolean; can_shift: boolean; can_view_backs: boolean;
  can_close: boolean; can_reopen: boolean; // ★C層③（mig0138・横断 §2）: 締め／解除の個別付与
  tel: string | null; line_id: string | null; // ★0172（裁定381・便 P172）: 電話・LINE ID（memberships の列）
};
type UserRow = { id: string; name: string | null; email: string; auth_user_id: string; photo_updated_at: string | null }; // ★0162（裁定329・便 M5-1）: スタッフ写真
type Store = { id: string; name: string };

type CreateResult = { membership_id: string; login_email: string; initial_password: string | null };

const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;
const rolePillMini = (role: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 800, letterSpacing: 0.5, borderRadius: 999, padding: "2px 8px",
  color: rolePillKindOf(role) === "admin" ? "var(--card)" : role === "manager" ? "var(--on-gold)" : "var(--ink)", // ★追補 3 R-8: 管理者＝濃い地（オーナーの隣）
  background: rolePillKindOf(role) === "admin" ? "var(--ink)" : role === "manager" ? "linear-gradient(135deg,var(--gold2),var(--gold3))" : "var(--card2)",
  border: role === "manager" || rolePillKindOf(role) === "admin" ? "0" : "1px solid var(--line2)",
});
/** ★追補 3 R-8（裁定425 候補）: 役割の表示名＝フラグ true で「管理者」・false は従来の roleLabelJa */
const labelOf = (r: string) => (rules0175On() ? roleLabelOf(r) : t.roleLabelJa(r));

// 段L2: 権限チップの定義＝現行テーブルの見出し語彙をそのまま使う（会計/顧客/シフト*/バック†）。
//   4つとも出す＝can_view_backs を落とさない（表示項目を減らさない）。
type PermKey = "can_register" | "can_crm" | "can_shift" | "can_view_backs" | "can_close" | "can_reopen";
const PERM_DEFS: Array<[ PermKey, string ]> = [
  ["can_register", "会計"],
  ["can_crm", "顧客"],
  ["can_shift", "シフト"],
  ["can_view_backs", "バック"],
  ["can_close", "締め"],   // ★C③-11: 日報の締め・差異承認（staff∧can_close）
  ["can_reopen", "解除"],  // ★C③-11: 日報／給与の解除（staff∧can_reopen）
];

export default function StaffBoard({
  isOwner, roleRaw = "", stores, myStoreId, myAuthUserId, tabs,
}: {
  isOwner: boolean; roleRaw?: string; stores: Store[]; myStoreId: string; myAuthUserId: string; // ★追補 3 R-8: roleRaw＝本来の役割（フラグ true のとき admin が来る）
  tabs?: React.ReactNode; // ★0172（裁定356・便 P172）: 一覧／勤怠・報酬のタブ（page が描く）
}) {
  const supabase = createClient();
  const isDemo = useIsDemo(); // ★N7-2 ③
  const [mems, setMems] = useState<Mem[]>([]);
  const [users, setUsers] = useState<Record<string, UserRow>>({});
  // ★0162（便 M5-1）: 写真＝org_id を 1 回引き、users の photo_updated_at から署名 URL（user_id → URL）
  const [orgId, setOrgId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [phBusy, setPhBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 編集対象（行クリックで選択）
  const [sel, setSel] = useState<Mem | null>(null);
  const [transferTo, setTransferTo] = useState<Mem | null>(null); // ★便 M2 事後承認 A 15-③（Agoora 確定 10/27）: オーナーの譲渡＝確認ダイアログを 1 段（相手の名前・「譲渡する」）
  const [eName, setEName] = useState("");
  const [eStore, setEStore] = useState("");
  const [eEmail, setEEmail] = useState(""); // ★裁定267-2: メール（ログイン ID）変更＝owner のみ・POST /api/staff/update-email
  const [eTel, setETel] = useState("");   // ★0172（裁定381・便 P172）: 編集シートの電話・LINE ID（staff_update_profile の p_tel／p_line_id＝null は変更なし）
  const [eLine, setELine] = useState("");

  // 追加モーダル
  const [addOpen, setAddOpen] = useState(false);
  const [aName, setAName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aStore, setAStore] = useState(myStoreId || stores[0]?.id || "");
  const [aRole, setARole] = useState<"staff" | "manager">("staff");
  const [aIdemKey, setAIdemKey] = useState("");
  // ★裁定381（GV-B W-10）→★0172（便 P172）: 電話・LINE ID は memberships.tel／line_id へ保存（staff_create 7 引数）。契約区分（staff_contracts）は器のみ＝書込 RPC は次便＝注記
  const [aTel, setATel] = useState("");
  const [aLine, setALine] = useState("");
  const [aErr, setAErr] = useState<string | null>(null);
  const [aResult, setAResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  // ★便 ON-3（0176 ★2 I-1）: ログインの方法（初期パスワード＝従来／招待リンク＝本人がパスワードを決める）・招待の結果・招待中の一覧・LINE 連携
  const [aMethod, setAMethod] = useState<LoginMethod>("password");
  const [aInvite, setAInvite] = useState<{ url: string; expires_at: string | null; email: string } | null>(null);
  const [aWork, setAWork] = useState<{ contract_kind: string; pay_kind: string; amount: string }>({ contract_kind: "parttime", pay_kind: "hourly", amount: "" }); // ★便 M3 M-20／M-21
  const [invites, setInvites] = useState<{ id: string; store_id: string; email: string; name: string; role: string; expires_at: string; accepted_at: string | null }[]>([]);
  const [lineLinked, setLineLinked] = useState<Set<string>>(new Set());
  const [bindUrl, setBindUrl] = useState<string | null>(null);
  const [bindCopied, setBindCopied] = useState(false);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  useEffect(() => { void resolveOrgId(supabase).then((o) => setOrgId(o)); }, [supabase]);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    void signUserPhotos(supabase, orgId, Object.values(users)).then((m) => { if (alive) setPhotoUrls(m); });
    return () => { alive = false; };
  }, [orgId, users, supabase]);
  /** ★0162（便 M5-1）: 写真の登録／差替え（owner・manager 自店＝真の防御は storage policy と set_user_photo_updated_at の同一式） */
  async function pickStaffPhoto(userId: string, f: File | null) {
    if (!f || !orgId) return;
    setPhBusy(true); setMsg(null);
    try {
      await uploadUserPhoto(supabase, orgId, userId, f);
      await load();
      setMsg("写真を保存しました");
    } catch (e) {
      setMsg(rpcErrJa(e instanceof Error ? e.message : "保存に失敗しました"));
    } finally {
      setPhBusy(false);
    }
  }
  /** ★0162（329 追補1）: 削除＝storage.remove（delete policy）→ clear_user_photo（null 戻し） */
  async function removeStaffPhoto(userId: string, name: string) {
    if (!orgId) return;
    if (!confirm(`${name} の写真を削除しますか？`)) return;
    setPhBusy(true); setMsg(null);
    try {
      await removeUserPhoto(supabase, orgId, userId);
      await load();
      setMsg("写真を削除しました");
    } catch (e) {
      setMsg(rpcErrJa(e instanceof Error ? e.message : "削除に失敗しました"));
    } finally {
      setPhBusy(false);
    }
  }

  const load = useCallback(async () => {
    // 一覧＝staff/manager のみ（cast はキャスト管理で別画面）。inactive（在籍解除済み）も表示＝再雇用の入口。
    const { data: mm } = await supabase
      .from("memberships")
      .select("id, user_id, store_id, role, is_active, can_register, can_crm, can_shift, can_view_backs, can_close, can_reopen, tel, line_id") // ★0172: +tel／line_id
      .in("role", staffListRolesOf(rules0175On())); // ★追補 3 R-8（裁定425 候補）: フラグ true で管理者も一覧に
    const rows = (mm ?? []) as Mem[];
    const userIds = [...new Set(rows.map((m) => m.user_id))];
    const map: Record<string, UserRow> = {};
    if (userIds.length) {
      const { data: us } = await supabase.from("users").select("id, name, email, auth_user_id, photo_updated_at").in("id", userIds); // ★0162: +photo_updated_at
      for (const u of (us ?? []) as UserRow[]) map[u.id] = u;
    }
    // 並び: 店 → manager 先頭 → 名前
    rows.sort((a, b) =>
      storeName(a.store_id).localeCompare(storeName(b.store_id))
      || (a.role === b.role ? 0 : a.role === "manager" ? -1 : 1)
      || (map[a.user_id]?.name ?? "").localeCompare(map[b.user_id]?.name ?? ""));
    setMems(rows);
    setUsers(map);
    // ★便 ON-3: 招待中（未受諾・期限内）と LINE 連携済み（line_links subject membership）＝RLS（owner 全店／manager 自店）
    const [{ data: inv }, { data: ll }] = await Promise.all([
      supabase.from("staff_invites").select("id, store_id, email, name, role, expires_at, accepted_at").is("accepted_at", null).order("created_at", { ascending: false }).limit(100),
      supabase.from("line_links").select("subject_id").eq("subject_kind", "membership"),
    ]);
    setInvites(((inv ?? []) as typeof invites).filter((i) => inviteStateOf(i, Date.now()) === "ok"));
    setLineLinked(new Set(((ll ?? []) as { subject_id: string }[]).map((x) => x.subject_id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isSelf = (m: Mem) => users[m.user_id]?.auth_user_id === myAuthUserId;

  async function rpc(label: string, fn: string, args: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setMsg(error ? `${label}に失敗: ${error.message}` : `${label}しました`);
    setBusy(false);
    await load();
    return !error;
  }
  // ★0190（裁定436 ①c）: 在籍解除＝ban／再雇用＝unban を route に頼む（RPC 成功の後だけ・RPC 側は staff_pin の削除と kiosk_sessions の終了を済ませている）。
  //   失敗は在籍解除を止めない（memberships.is_active=false が真の防御・再実行で ban し直せる）＝メッセージに注記を足すだけ
  async function retireAuth(membershipId: string, mode: "ban" | "unban") {
    if (!mig0190On()) return;
    let ok = false;
    try {
      const res = await fetch("/api/auth/retire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "staff", id: membershipId, mode }) });
      ok = res.ok;
    } catch { ok = false; }
    if (!ok) setMsg((m) => `${m ?? ""}（ログインの失効は後で再実行できます）`);
  }

  // トグル＝規約7: 4フラグとも明示 boolean を常に全送信（部分更新しない）
  async function toggleFlag(m: Mem, key: PermKey) {
    // ★規約 7＝6 フラグとも明示 boolean を全送信（mig0138 で 7 引数化・部分更新しない）
    const next = {
      can_register: m.can_register, can_crm: m.can_crm, can_shift: m.can_shift, can_view_backs: m.can_view_backs,
      can_close: m.can_close, can_reopen: m.can_reopen,
      [key]: !m[key],
    };
    await rpc("権限を更新", "set_staff_perms", {
      p_membership_id: m.id,
      p_can_register: next.can_register, p_can_crm: next.can_crm, p_can_shift: next.can_shift,
      p_can_view_backs: next.can_view_backs, p_can_close: next.can_close, p_can_reopen: next.can_reopen,
    });
  }

  function openEdit(m: Mem) {
    setSel(m);
    setEName(users[m.user_id]?.name ?? "");
    setEEmail(users[m.user_id]?.email ?? "");
    setETel(m.tel ?? ""); setELine(m.line_id ?? ""); // ★0172
    setEStore(stores.find((s) => s.id !== m.store_id)?.id ?? "");
  }

  // ★便 ON-3（0176 ★1 401）: LINE 連携のリンク＝line_bind_token_create（owner／自店 manager・平文トークンは 1 回だけ）→ <origin>/liff/<store>?t=…&m=bind
  async function issueBind(m: Mem) {
    setBusy(true); setMsg(null); setBindUrl(null); setBindCopied(false);
    const { data, error } = await supabase.rpc("line_bind_token_create", { p_subject_kind: "membership", p_subject_id: m.id, p_purpose: "bind" });
    setBusy(false);
    if (error || typeof data !== "string") { setMsg(`LINE 連携のリンクを発行できませんでした: ${rpcErrJa(error?.message ?? "")}`); return; }
    setBindUrl(liffBindUrlOf(window.location.origin, m.store_id, data));
  }

  function openAdd() {
    setAName(""); setAEmail(""); setATel(""); setALine(""); setAStore(isOwner ? (stores[0]?.id ?? "") : myStoreId); // ★裁定381
    setARole("staff"); setAErr(null); setAResult(null); setCopied(false);
    setAMethod("password"); setAInvite(null); // ★便 ON-3
    setAWork({ contract_kind: "parttime", pay_kind: "hourly", amount: "" }); // ★便 M3 M-20／M-21: 追加の時点で働き方
    setAIdemKey(crypto.randomUUID()); // 送信意図ごとに1つ＝リトライは同キー（route が二重作成を止める）
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!aName.trim()) { setAErr("名前を入力してください"); return; }
    // ★便 ON-3（0176 ★2 I-1）: 招待リンク＝POST /api/staff/invite（staff_invite_create・Auth は作らない・URL は 1 回だけ表示）
    if (aMethod === "invite") {
      const v = inviteFormErrorOf({ name: aName, email: aEmail, method: aMethod }); if (v) { setAErr(v); return; }
      setBusy(true); setAErr(null);
      try {
        const res = await fetch("/api/staff/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: aName.trim(), email: aEmail.trim(), storeId: isOwner ? aStore : myStoreId, role: isOwner ? aRole : "staff" }) });
        const body = (await res.json()) as { url?: string; expires_at?: string | null; email?: string; error?: string };
        if (!res.ok || !body.url) setAErr(inviteErrJa(body.error ?? `招待に失敗しました（${res.status}）`));
        else { setAInvite({ url: body.url, expires_at: body.expires_at ?? null, email: body.email ?? aEmail.trim() }); await load(); }
      } catch (e) { setAErr((e as Error).message); } finally { setBusy(false); }
      return;
    }
    setBusy(true); setAErr(null);
    try {
      const res = await fetch("/api/staff/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: aName.trim(),
          email: aEmail.trim() || undefined, // 空なら送らない＝合成 email を route が自動発行
          storeId: isOwner ? aStore : myStoreId, // manager は自店固定（RPC でも二重に守る）
          role: isOwner ? aRole : "staff",       // manager は staff 固定
          idemKey: aIdemKey,
          tel: aTel.trim() || undefined,     // ★0172（裁定381）: 任意＝空は送らない（route が null）
          lineId: aLine.trim() || undefined,
        }),
      });
      const body = (await res.json()) as CreateResult & { error?: string };
      if (!res.ok) setAErr(body.error ?? `追加に失敗しました（${res.status}）`);
      else {
        // ★便 M3 M-20／M-21: 働き方（雇用形態・給与の形・額）＝staff_contract_set（額が空なら契約は作らない）
        const n = Number(String(aWork.amount).replace(/[,，\s円¥]/g, ""));
        if (body.membership_id && aWork.amount.trim() !== "" && Number.isInteger(n) && n >= 0) {
          const { error: eC } = await supabase.rpc("staff_contract_set", { p_membership_id: body.membership_id, p_patch: { contract_kind: aWork.contract_kind, pay_kind: aWork.pay_kind, [aWork.pay_kind]: n } });
          if (eC) setMsg(`働き方の保存に失敗: ${rpcErrJa(eC.message)}（スタッフは追加済み＝勤怠・報酬から入れ直せます）`);
        }
        setAResult(body); await load();
      }
    } catch (e) {
      setAErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ★裁定381（GV-B W-10）: 編集シートの保存＝1 ボタン（名前は staff_update_profile・メールは owner のみ POST /api/staff/update-email＝変わった項目だけ送る）
  async function saveEdit() {
    if (!sel) return;
    const u = users[sel.user_id];
    const nameChanged = eName.trim() !== (u?.name ?? "");
    const emailChanged = isOwner && !isDemo && eEmail.trim().length > 0 && eEmail.trim().toLowerCase() !== (u?.email ?? "").toLowerCase();
    const telChanged = eTel.trim() !== (sel.tel ?? "");   // ★0172（裁定381）: 変わった項目だけ（''＝消す・null＝変更なし＝RPC の nullif(trim)）
    const lineChanged = eLine.trim() !== (sel.line_id ?? "");
    if (!nameChanged && !emailChanged && !telChanged && !lineChanged) { setMsg("変更はありません"); return; }
    setBusy(true); setMsg(null);
    try {
      const done: string[] = [];
      if (nameChanged || telChanged || lineChanged) {
        if (eName.trim() === "") { setMsg("名前を入力してください"); return; }
        const { error } = await supabase.rpc("staff_update_profile", { p_membership_id: sel.id, p_name: eName.trim(), p_tel: telChanged ? eTel.trim() : null, p_line_id: lineChanged ? eLine.trim() : null }); // ★0172: 4 引数
        if (error) { setMsg(`${nameChanged ? "名前" : "連絡先"}の更新に失敗: ${rpcErrJa(error.message)}`); return; }
        if (nameChanged) done.push("名前");
        if (telChanged) done.push("電話番号");
        if (lineChanged) done.push("LINE ID");
      }
      if (emailChanged) {
        const res = await fetch("/api/staff/update-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: sel.user_id, email: eEmail.trim() }) });
        const j = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
        if (!res.ok) { setMsg(`${done.length > 0 ? "名前は保存しました・" : ""}メールの更新に失敗: ${j.error ?? res.status}`); await load(); return; }
        done.push("メール（新しいメールでログインします）");
      }
      setMsg(`${done.join("・")}を保存しました`);
      await load();
      setSel(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!aResult?.initial_password) return;
    await navigator.clipboard.writeText(`${aResult.login_email}\n${aResult.initial_password}`);
    setCopied(true);
  }

  return (
    <div className="nox-mv1 nox-mv1-m">
      {/* 段0R 第3陣: ヘッダを新シェルの nox-hero へ（他画面と同基準・表示のみ）。
          ＋追加ボタンは casts/customers と同じくツールバー行（nox-ctoolbar）の右端へ＝
          onClick も disabled 条件も文言も1文字も変えていない。 */}
      <PageHead eyebrow="STAFF ACCOUNTS" title="スタッフ"
        desc="スタッフ・店長の権限と在籍を管理します（キャストはマスタ側で管理）。" />
      <Toast msg={msg} />
      {tabs}{/* ★0172（裁定356・便 P172）: 一覧／勤怠・報酬 */}

      <div className="nox-actions" style={{ marginBottom: 8 }}>{/* ★便 M3 M-20: 「＋スタッフを追加」＝.nox-actions 中央（キャストの追加と同じ形） */}
        {!isDemo && <button style={{ ...btnGold, minHeight: 44 }} onClick={openAdd} disabled={busy} data-staff-add="1">＋ スタッフを追加</button>}{/* ★裁定381 */}{/* ★N7-2 ③: デモはスタッフ作成の導線を隠す */}
      </div>

      <section className="nox-panel">
        <h3>スタッフ一覧（行クリックで編集）</h3>
        {/* 段L2: テーブル→名簿行＋権限チップ（モック .srow/.perms/.perm）。
            ★出す情報は現行と完全に同一＝名前(自分)・ログインID・店(owner)・役職・4権限・在籍状態。
              権限は can_view_backs も含めて4つとも出す（列を落とさない）。
            ★トグルは既存 toggleFlag → set_staff_perms をそのまま呼ぶ＝送る引数も経路も不変。
              staff 以外は役職で固定＝チップを押せない（現行の「固定」表示と同義）。
            ★アバターは共通部品を使うが写真は無い＝段P の写真は cast_id 由来のキャスト専用で、
              スタッフ（users）の写真は現スキーマに存在しない。頭文字フォールバックのまま。 */}
        {mems.map((m) => {
          const u = users[m.user_id];
          const dim = !m.is_active;
          return (
            <div key={m.id} className="nox-srow2" onClick={() => openEdit(m)}
              style={{ cursor: "pointer", opacity: dim ? 0.55 : 1, background: sel?.id === m.id ? "var(--card2)" : "transparent" }}>
              <CastAvatar name={u?.name ?? ""} url={photoUrls.get(m.user_id)} size={34} />{/* ★0162（便 M5-1）: スタッフ写真（未登録は頭文字） */}
              <div style={{ minWidth: 0 }}>
                <div className="nm">
                  {u?.name ?? "—"}
                  {isSelf(m) && <span style={{ ...t.sub, marginLeft: 5 }}>(自分)</span>}
                  <span style={{ ...rolePillMini(m.role), marginLeft: 6 }} data-role-pill={m.role}>{labelOf(m.role)}</span>
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: m.is_active ? "var(--ok)" : "var(--bad)" }}>
                    {m.is_active ? "在籍" : "解除"}
                  </span>
                </div>
                <div className="role">
                  {u?.email ?? "—"}{isOwner ? ` / ${storeName(m.store_id)}` : ""}{m.tel ? <> / <TelLink tel={m.tel} /></> : null}{/* ★0172（裁定381）: tel: リンク */}
                </div>
              </div>
              <div className="nox-perms" onClick={(e) => e.stopPropagation()}>
                {PERM_DEFS.map(([k, label]) => (m.role !== "staff" || !m.is_active) ? (
                  <span key={k} className={`nox-perm ro ${m[k] ? "on" : ""}`} data-perm-ro="1"
                    title={m.role !== "staff" ? "オーナー/店長は役職で権限固定（フラグ対象外）" : "退店済み（権限は変えられません）"}>{label}</span>
                ) : (
                  <button
                    key={k} type="button"
                    className={`nox-perm ${m[k] ? "on" : ""}`}
                    disabled={m.role !== "staff" || busy || !m.is_active}
                    title={m.role !== "staff" ? "オーナー/店長は役職で権限固定（フラグ対象外）" : `${label}権限を切り替え`}
                    onClick={() => void toggleFlag(m, k)}
                  >
                    {label}
                  </button>
                ))}
                {m.role !== "staff" && <span style={{ ...t.sub, fontSize: 10, alignSelf: "center" }}>固定</span>}
              </div>
            </div>
          );
        })}
        <p style={{ ...t.sub, margin: "8px 0 0" }} data-staff-shift-note={mig0183On() ? "manager" : "open"}>{mig0183On() ? "* シフト＝シフトの作成・配置・承認まで（店長と同じ）。OFF のスタッフはメニューに出ず、開いてもホームへ戻ります。" : "* シフト＝シフト画面を開ける権限（OFF のスタッフはメニューに出ず、開いてもホームへ戻ります）。"}</p>{/* ★便 M-9（裁定429）: 0183 手貼り後に注記を「店長と同じ」に */}{/* ★裁定381（GV-B W-10）: can_shift を効かせた（shift/page.tsx・layout.tsx） */}
        <p style={{ ...t.sub, margin: "3px 0 0" }}>† バック＝キャストのバック金額（報酬）の閲覧権限。会計権限とは独立です（既定オフ・必要なスタッフのみ付与）。</p>
      </section>

      {/* 編集パネル（Q-1 編集5RPC）。★裁定253 R5（2026-09-14）: インラインの nox-panel をやめ共通 Modal へ（器のみ＝5 RPC・引数・confirm は不変）。
          閉じる＝×・背景タップ・Esc（「閉じる」ボタンは × に集約）。脚＝Danger 左端（在籍を解除）・補助（役職変更）・実行 右端（再雇用）＝244。 */}
      {sel && (
        <Modal onClose={() => !busy && setSel(null)} maxWidth={480} scroll>
          <div className="nox-formmodal-head">
            <strong>編集: {users[sel.user_id]?.name ?? "—"}</strong>
            <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => !busy && setSel(null)}>×</button>
          </div>
          <p style={{ ...t.sub, margin: "-8px 0 12px" }}>{storeName(sel.store_id)} / {labelOf(sel.role)} / {sel.is_active ? "在籍" : "解除"}</p>
          {/* ★X-13-4（便 X-13a）: 名前の横に写真（現在・変更・削除）＝共通部品 PhotoEdit（キャスト詳細 X-13-5 と同じ経路）。デモは表示するが無効（裁定328 ④） */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <PhotoEdit name={users[sel.user_id]?.name ?? ""} url={photoUrls.get(sel.user_id)} hasPhoto={!!users[sel.user_id]?.photo_updated_at} busy={phBusy || busy || !orgId} size={56}
              disabled={isDemo} disabledReason="デモ環境では写真を変更できません" note="自動で縮小・JPEG 化されます。スタッフ一覧・シフトに表示されます。"
              onPick={(f) => void pickStaffPhoto(sel.user_id, f)} onRemove={() => void removeStaffPhoto(sel.user_id, users[sel.user_id]?.name ?? "")} />
          </div>
          {/* ★裁定381（GV-B W-10）: 入力は 1 行 1 項目・保存は 1 ボタン（変わった項目だけ送る＝名前 staff_update_profile／メール owner のみ update-email） */}
          <div style={{ display: "grid", gap: 10, marginTop: 12 }} data-staff-edit="1">
            <FieldStack label="名前" htmlFor="staff-edit-name">
              <input id="staff-edit-name" placeholder="名前" value={eName} onChange={(e) => setEName(e.target.value)} style={{ ...t.input, width: "100%" }} />
            </FieldStack>
            {/* ★0172（裁定381・便 P172）: 電話・LINE ID（memberships.tel／line_id）＝空で保存＝消す */}
            <FieldStack label="電話番号" htmlFor="staff-edit-tel">
              <input id="staff-edit-tel" inputMode="tel" placeholder="090-0000-0000" maxLength={30} value={eTel} onChange={(e) => setETel(e.target.value)} style={{ ...t.input, width: "100%" }} data-staff-edit-tel="1" />
            </FieldStack>
            <FieldStack label="LINE ID" htmlFor="staff-edit-line">
              <input id="staff-edit-line" placeholder="@line_id" maxLength={40} value={eLine} onChange={(e) => setELine(e.target.value)} style={{ ...t.input, width: "100%" }} data-staff-edit-line="1" />
            </FieldStack>
            {/* ★便 ON-3（0176 ★1 401）: LINE 連携（line_links）＝紐付けのリンクを発行（line_bind_token_create 'membership'・7 日・1 回だけ）→ 本人が LINE で開く。デモは出さない */}
            <FieldStack label="LINE 連携" htmlFor="staff-edit-line-bind">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-staff-line-bind={lineLinked.has(sel.id) ? "linked" : "none"}>
                <span style={{ fontSize: 12.5, color: lineLinked.has(sel.id) ? "var(--ok)" : "var(--sub)" }}>{lineLinked.has(sel.id) ? "連携済み（LINE に通知が届きます）" : "未連携"}</span>
                {!isDemo && <button id="staff-edit-line-bind" type="button" style={btnGhost} disabled={busy} onClick={() => void issueBind(sel)}>{lineLinked.has(sel.id) ? "別の LINE に付け替えるリンク" : "連携のリンクを発行"}</button>}
              </div>
              {bindUrl && (
                <div style={{ display: "grid", gap: 4, marginTop: 6 }} data-staff-line-bind-url="1">
                  <span style={{ fontSize: 12, wordBreak: "break-all" }}>{bindUrl}</span>
                  <span style={{ display: "flex", gap: 8 }}><button type="button" style={btnGhost} onClick={() => { void navigator.clipboard?.writeText(bindUrl).then(() => setBindCopied(true)).catch(() => undefined); }}>{bindCopied ? "コピーしました ✓" : "リンクをコピー"}</button></span>
                  <span style={{ ...t.sub }}>{LINE_BIND_NOTE}</span>
                </div>
              )}
            </FieldStack>
            {isOwner && !isDemo && (
              <FieldStack label="メール（ログインID）" htmlFor="staff-edit-email" note="変更すると新しいメールでログインします">
                <input id="staff-edit-email" type="email" placeholder="メール（ログインID）" value={eEmail} onChange={(e) => setEEmail(e.target.value)} style={{ ...t.input, width: "100%" }} />
              </FieldStack>
            )}
            <button type="button" style={t.btnPrimary56} disabled={busy} data-staff-save="1" onClick={() => void saveEdit()}>{busy ? "保存中…" : "保存"}</button>
          </div>
          {isOwner && stores.length > 1 && sel.is_active && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <span style={t.fieldLabel}>異動先</span>
              <select value={eStore} onChange={(e) => setEStore(e.target.value)} style={input}>
                {stores.filter((s) => s.id !== sel.store_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button style={btnGhost} disabled={busy || !eStore} onClick={async () => {
                if (!confirm(`${users[sel.user_id]?.name ?? ""} を ${storeName(eStore)} へ異動しますか？（出戻りは元の権限設定で復帰します）`)) return;
                await rpc("異動", "staff_transfer_store", { p_membership_id: sel.id, p_new_store_id: eStore });
                setSel(null);
              }}>異動を実行</button>
            </div>
          )}
          <div className="nox-formmodal-foot">
            {/* ★裁定244: Danger 左端（在籍を解除）・補助（役職変更）・実行 右端（再雇用）。★裁定253 R5: 閉じるは × へ集約・脚は .nox-formmodal-foot（中央） */}
            {sel.is_active && !isSelf(sel) && (
              // ★裁定146（裁定120 適用）: 在籍解除＝取り消し困難な操作＝Danger 系トークン（--bad 系は警告面用・値は同系）
              <button style={{ ...btnGhost, color: "var(--danger)", border: "1px solid var(--danger-bd)" }} disabled={busy} onClick={async () => {
                if (!confirm(`${users[sel.user_id]?.name ?? ""} の在籍を解除しますか？（ログイン権限が即時に失効します・削除はされません）`)) return;
                const ok = await rpc("在籍を解除", "staff_deactivate", { p_membership_id: sel.id });
                if (ok) await retireAuth(sel.id, "ban"); // ★0190（裁定436 ①c）
                setSel(null);
              }}>在籍を解除</button>
            )}
            {isOwner && sel.is_active && !isSelf(sel) && rules0175On() && (/* ★追補 3 R-8（裁定425 候補・0175 v2 ★28）: 役割の候補＝呼び手の本来の役割 × 相手の今の役割（オーナー＝管理者の任命・解除も・管理者＝店長↔スタッフだけ）＝RPC set_membership_role。フラグ false＝下の従来ボタン */
              <span data-role-change="0175" style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {roleChangeTargetsOf(roleRaw, sel.role).map((to) => (
                  <button key={to} style={btnGhost} disabled={busy} data-role-to={to} onClick={async () => {
                    if (!confirm(`${users[sel.user_id]?.name ?? ""} を ${roleChangeTextOf(sel.role, to)}しますか？${to === "admin" ? "（管理者はオーナーと同じ権限＝解約・移譲・契約と請求・管理者任命だけ不可）" : ""}`)) return;
                    await rpc("役職を変更", "set_membership_role", { p_membership_id: sel.id, p_new_role: to });
                    setSel(null);
                  }}>{roleChangeTextOf(sel.role, to)}</button>
                ))}
                {ownerOnlyNoteOf(roleRaw) && <span style={{ ...t.sub, fontSize: 11 }} data-owner-only-note="1">管理者の任命・解除は{ownerOnlyNoteOf(roleRaw)}</span>}
              </span>
            )}
            {roleRaw === "owner" && sel.is_active && !isSelf(sel) && rules0175On() && (sel.role === "admin" || sel.role === "manager") && (/* ★便 M2 A 15-③: オーナーの譲渡＝オーナー本人だけ・相手は有効な管理者／店長（owner_transfer と同じ条件） */
              <button style={btnGhost} disabled={busy} data-owner-transfer={sel.id} onClick={() => { setTransferTo(sel); setSel(null); }}>オーナーを譲渡</button>
            )}
            {isOwner && sel.is_active && !isSelf(sel) && !rules0175On() && (
              <button style={btnGhost} disabled={busy} onClick={async () => {
                const to = sel.role === "staff" ? "manager" : "staff";
                if (!confirm(`${users[sel.user_id]?.name ?? ""} を ${labelOf(to)} に${to === "manager" ? "昇格" : "降格"}しますか？`)) return;
                await rpc("役職を変更", "staff_change_role", { p_membership_id: sel.id, p_new_role: to });
                setSel(null);
              }}>{sel.role === "staff" ? "店長に昇格" : "スタッフに降格"}</button>
            )}
            {!sel.is_active && (
              <button style={btnGold} disabled={busy} onClick={async () => {
                const ok = await rpc("再雇用", "staff_reactivate", { p_membership_id: sel.id });
                if (ok) await retireAuth(sel.id, "unban"); // ★0190（裁定436 ①c）: 再雇用＝ban を解く
                setSel(null);
              }}>再雇用（復帰）</button>
            )}
          </div>
        </Modal>
      )}

      {transferTo && (/* ★便 M2 A 15-③: 譲渡の確認（DB 変更なし＝owner_transfer を呼ぶだけ・1 回で移る） */
        <Modal onClose={() => !busy && setTransferTo(null)} maxWidth={420}>
          <div data-owner-transfer-confirm={transferTo.id}>
            <h3 style={{ margin: "0 0 10px" }}>オーナーを譲渡しますか？</h3>
            <p style={{ margin: "0 0 6px", fontSize: 14 }}>譲渡する相手：<b>{users[transferTo.user_id]?.name ?? "—"}</b>（{roleLabelOf(transferTo.role)}）</p>
            <p style={{ ...t.sub, fontSize: 12.5, lineHeight: 1.7, margin: "0 0 14px" }}>譲渡するとすぐに相手がオーナーになり、あなたは管理者になります。店舗の解約・オーナーの変更・NOX の契約と請求・管理者の任命と解除は、新しいオーナーだけが行えます。元に戻すには新しいオーナーに譲渡し直してもらいます。</p>
            <div className="nox-actions">
              <button style={btnGhost} disabled={busy} onClick={() => setTransferTo(null)}>やめる</button>
              <button style={btnGold} disabled={busy} data-owner-transfer-go="1" onClick={async () => {
                const ok = await rpc("オーナーを譲渡", "owner_transfer", { p_membership_id: transferTo.id });
                setTransferTo(null);
                if (ok) window.location.reload(); // 自分の役割が管理者に変わる＝画面の権限を読み直す
              }}>譲渡する</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ★便 ON-3（0176 ★4）: 連絡先の変更（未確認）＝0 件なら出ない */}
      <ContactChangesPanel canConfirm={isOwner || myStoreId !== ""} />
      {/* ★便 ON-3（0176 ★2 I-1）: 招待中（未受諾・期限内）＝受諾で users／memberships ができて一覧に移る */}
      {invites.length > 0 && (
        <section className="nox-panel" data-staff-invites={invites.length} style={{ marginBottom: 12 }}>
          <h3>招待中（{invites.length}）</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4, fontSize: 12.5 }}>
            {invites.map((i) => <li key={i.id} data-staff-invite={i.id}><b>{i.name}</b>（{labelOf(i.role)}・{storeName(i.store_id)}）<span style={{ color: "var(--sub)" }}> {i.email}・{INVITE_STATE_LABEL[inviteStateOf(i, Date.now())]}・{inviteExpiryTextOf(i.expires_at)}</span></li>)}
          </ul>
          <p style={{ ...t.sub, margin: "6px 0 0" }}>リンクは発行時に 1 回だけ表示されます。期限切れは再登録（同じメールで再発行）してください。</p>
        </section>
      )}
      {/* 追加モーダル（Q-2・POST /api/staff/create） */}
      {addOpen && (
        <Modal onClose={() => !busy && !aResult && !aInvite && setAddOpen(false)}>
            {aInvite ? (/* ★便 ON-3（0176 ★2 I-1）: 招待リンク（1 回だけ表示・14 日） */
              <>
                <h2 style={secTitle}>招待リンクを発行しました</h2>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }} data-staff-invite-result="1">
                  <div style={t.bdRow}><span style={t.bdKey}>宛先</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{aInvite.email}</span></div>
                  <div style={t.bdRow}><span style={t.bdKey}>招待リンク</span><span style={{ ...t.bdVal, wordBreak: "break-all", fontSize: 12 }} data-staff-invite-url="1">{aInvite.url}</span></div>
                  {aInvite.expires_at && <div style={t.bdRow}><span style={t.bdKey}>有効期限</span><span style={t.bdVal}>{inviteExpiryTextOf(aInvite.expires_at)}</span></div>}
                </div>
                <p style={{ ...t.alert, marginBottom: 10 }}>このリンクは再表示できません。本人に送ってください（リンクを開いてパスワードを決めるとログインできます）。</p>
                <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
                  <button style={btnGhost} onClick={() => { void navigator.clipboard?.writeText(aInvite.url).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "コピーしました ✓" : "リンクをコピー"}</button>
                  <button style={btnGold} onClick={() => setAddOpen(false)}>閉じる</button>
                </div>
              </>
            ) : !aResult ? (
              <>
                <h2 style={secTitle}>スタッフ登録</h2>{/* ★裁定381 */}
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>名前（必須）</span>
                    <input value={aName} onChange={(e) => setAName(e.target.value)} style={t.input} placeholder="例: 山田 太郎" />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>メールアドレス（任意）</span>
                    <input value={aEmail} onChange={(e) => setAEmail(e.target.value)} style={t.input}
                      placeholder={aMethod === "invite" ? "招待リンクの宛先（必須）" : "入力したときだけログインIDに使います（未入力なら自動発行）"} type="email" />
                  </label>
                  {/* ★便 ON-3（0176 ★2 I-1）: ログインの方法＝初期パスワード（従来・即時）／招待リンク（本人がパスワードを決める・メール必須・Auth は受諾まで作らない） */}
                  <label style={{ display: "grid", gap: 4 }} data-staff-login-method={aMethod}>
                    <span style={t.fieldLabel}>ログインの方法</span>
                    <SegSelect value={aMethod} onChange={(v) => setAMethod(v as LoginMethod)} options={LOGIN_METHOD_OPTIONS} ariaLabel="ログインの方法" />
                    <span style={{ ...t.sub, lineHeight: 1.6 }}>{LOGIN_METHOD_NOTE[aMethod]}</span>
                  </label>
                  {/* ★裁定381（GV-B W-10）→★0172（便 P172）: 電話・LINE ID は staff_create の p_tel／p_line_id で保存。契約区分は staff_contracts（器のみ＝書込 RPC は次便）＝注記 */}
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>電話番号（任意）</span>
                    <input value={aTel} onChange={(e) => setATel(e.target.value)} style={t.input} inputMode="tel" placeholder="090-0000-0000" maxLength={30} data-staff-tel="1" />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>LINE ID（任意）</span>
                    <input value={aLine} onChange={(e) => setALine(e.target.value)} style={t.input} placeholder="@line_id" maxLength={40} data-staff-line="1" />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>配属店</span>
                    {isOwner ? (
                      <select value={aStore} onChange={(e) => setAStore(e.target.value)} style={t.input}>
                        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ ...t.input, display: "block", color: "var(--sub)" }}>{storeName(myStoreId)}（自店）</span>
                    )}
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={t.fieldLabel}>役職</span>
                    {isOwner ? (
                      /* ★裁定40: 権限付与は**ボタン化＋確認ダイアログ必須**。
                         ボタンは1タップで入るぶん取り違えが起きやすいので、店長を選ぶときだけ確認を挟む
                         （スタッフへ戻すときは確認しない＝権限が上がる方向にだけガードを置く）。
                         ★既存の役職変更（staff_change_role）は元からボタン＋confirm で、ここはその流儀に揃えた。
                         送る値（staff / manager）も submitAdd の引数も1文字も変えていない。 */
                      <SegSelect
                        value={aRole} onChange={(v) => setARole(v as "staff" | "manager")}
                        options={[["staff", "スタッフ（staff）"], ["manager", "店長（manager）"]] as const}
                        ariaLabel="役職"
                        confirm={(nv, nl) => nv === "manager"
                          ? `${aName.trim() || "この方"} を ${nl} として追加しますか？（店長は売上・給与・設定を操作できます）`
                          : undefined}
                      />
                    ) : (
                      <span style={{ ...t.input, display: "block", color: "var(--sub)" }}>スタッフ（staff）</span>
                    )}
                  </label>
                  <div data-staff-add-work="1" style={{ display: "grid", gap: 6 }}>{/* ★便 M3 M-20／M-21: 働き方（任意＝額が空なら契約は後で） */}
                    <span style={t.fieldLabel}>働き方（任意・あとで「勤怠・報酬」からも）</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <label style={t.fieldLabel}>雇用形態<br /><SegSelect value={aWork.contract_kind} onChange={(v) => setAWork({ ...aWork, contract_kind: v })} options={[["contractor", "業務委託"], ["parttime", "アルバイト・パート"], ["employee", "正社員"]] as const} ariaLabel="雇用形態" /></label>
                      <label style={t.fieldLabel}>給与の形<br /><SegSelect value={aWork.pay_kind} onChange={(v) => setAWork({ ...aWork, pay_kind: v })} options={[["hourly", "時給"], ["daily", "日給"], ["monthly", "月給"]] as const} ariaLabel="給与の形" /></label>
                      <label style={t.fieldLabel}>額<br /><input value={aWork.amount} onChange={(e) => setAWork({ ...aWork, amount: e.target.value })} inputMode="numeric" placeholder="例: 1,500" style={{ ...t.input, width: 120 }} aria-label="働き方の額" /></label>
                    </div>
                    <span style={{ ...t.sub, lineHeight: 1.6 }}>源泉区分は雇用形態から既定で入ります（業務委託＝対象外・社員／アルバイト＝給与）。</span>
                  </div>
                  <p style={{ ...t.sub, margin: 0, lineHeight: 1.6 }}>電話番号・LINE ID は登録時に保存されます。</p>
                  <div className="nox-inset" data-staff-after="1" style={{ padding: "12px 14px" }}>{/* ★便 X13-H H-12 ①: キャストと同じ形の案内 */}
                    <p style={{ fontSize: 12, fontWeight: 800, color: "var(--champ)", margin: "0 0 8px" }}>登録した後に設定する項目</p>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.9 }}>
                      <li><b style={{ color: "var(--v2-text)" }}>写真</b>：一覧でそのスタッフを選び「写真」から設定します（任意）。</li>
                      <li><b style={{ color: "var(--v2-text)" }}>権限</b>：一覧の行の権限チップで、できる操作を選びます。</li>
                      <li><b style={{ color: "var(--v2-text)" }}>ログイン</b>：登録したメールアドレスでログインします（初期パスワードは登録直後に 1 回だけ表示）。</li>
                      <li><b style={{ color: "var(--v2-text)" }}>契約</b>：「勤怠・報酬」タブで区分・時給（月給）と支給見込みを確認できます。</li>
                    </ol>
                  </div>
                  {aErr && <Message kind="error" style={{ margin: 0 }}>{aErr}</Message>}
                  <button type="button" style={t.btnPrimary56} disabled={busy} data-staff-register="1" onClick={() => void submitAdd()}>{busy ? "登録中…" : aMethod === "invite" ? "登録して招待リンクを発行" : "登録する"}</button>
                  <div style={t.btnRow48}>
                    <button type="button" style={t.btnSecondary48} disabled={busy} onClick={() => setAddOpen(false)}>キャンセル</button>
                  </div>
                </div>
              </>
            ) : aResult.initial_password ? (
              <>
                <h2 style={secTitle}>スタッフを登録しました</h2>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{aResult.login_email}</span></div>
                  <div style={t.bdRow}><span style={t.bdKey}>初期パスワード</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{aResult.initial_password}</span></div>
                </div>
                <p style={{ ...t.alert, marginBottom: 10 }}>このパスワードは再表示できません。スタッフに安全に渡してください。</p>
                <div className="nox-actions" style={{ display: "flex", gap: 8 }}>
                  <button style={btnGhost} onClick={() => void copyPassword()}>{copied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
                  <button style={btnGold} onClick={() => setAddOpen(false)}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>既存スタッフを再配属しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {aResult.login_email} は登録済みのため、既存のログイン情報のまま配属を追加しました（パスワードの再発行はありません）。
                </p>
                <div className="nox-actions" style={{ display: "flex" }}>
                  <button style={btnGold} onClick={() => setAddOpen(false)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}
    </div>
  );
}
