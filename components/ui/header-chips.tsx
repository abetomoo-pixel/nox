"use client";

// ★夜間便 N4（2026-09-24・裁定275 追補2-2／3）: ヘッダー右の 2 つの口。
//   HeaderGear ＝ 歯車 → ★X-13-22（便 X-13d-1）: /master（マスタトップ）への直リンク（旧: gear 群の一覧型 Modal／≤899 はメニューシートの「設定」節＝重複のため撤去）。
//   UserChip   ＝ 「登録名｜役割」→ 自分の情報（表示のみ）＋ログアウト（form POST /auth/signout＝経路不変）。
//   ★ルート／URL／権限ゲートは非改変＝表示だけ。既存トークン・既存部品（Modal・NavIcon・.nox-navsheet-*）のみ・ui-tokens 新規 0。
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Modal from "./modal";
import { NavIcon } from "./nav-icons";
import { GEAR_LABEL, NAV_DESC, activeHrefOf, userChipLabelOf, type NavGroup } from "@/lib/nox/ui/nav-tabs";
// ★0162（裁定329・便 M5-1）: スタッフ本人の「写真を変更」＝「自分の情報」Modal に置く（キャストの /mine photo-card と同じ部品・同じ縮小・u_{user_id}.jpg）
import { createClient } from "@/lib/supabase/client";
import CastAvatar from "./cast-avatar";
import { Message } from "./toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { resolveOrgId } from "@/lib/nox/cast-photo";
import { photoActionLabelOf, removeUserPhoto, signUserPhoto, uploadUserPhoto } from "@/lib/nox/staff-photo";

/** 一覧型の行（メニュー Modal と設定 Modal で共用）＝アイコン＋ラベル＋説明＋「›」 */
// ★便 X-8-5（2026-09-29）: replace＝シートが履歴に積んだ 1 段（noxSheet）を行き先で置き換える（シート側は history.back() を呼ばない）
export function NavListRow({ href, label, on, onClick, replace }: { href: string; label: string; on: boolean; onClick?: () => void; replace?: boolean }) {
  return (
    <Link href={href} replace={replace} className={on ? "nox-navsheet-i nox-navrow on" : "nox-navsheet-i nox-navrow"} aria-current={on ? "page" : undefined} onClick={onClick}>
      <span className="nox-navrow-ic" aria-hidden="true"><NavIcon href={href} /></span>
      <span className="nox-navrow-t">
        <span>{label}</span>
        {NAV_DESC[href] && <span className="nox-navdesc">{NAV_DESC[href]}</span>}
      </span>
      <span className="nox-navchev" aria-hidden="true">›</span>
    </Link>
  );
}

export function HeaderGear({ groups }: { groups: NavGroup[] }) {
  // ★X-13-22（便 X-13d-1）: 歯車＝マスタトップ（/master）への直リンク。ポップオーバーとメニューシートを開くイベントの発火は撤去（下タブ「メニュー」の「設定」節と重複していた）。
  //   PC も同じ直リンク。gear 群が 0（権限なし）なら描かない＝従来どおり。選択中の印は gear 群のいずれかのページにいるとき。
  const path = usePathname() ?? "";
  const items = groups.flatMap((g) => g.items);
  if (items.length === 0) return null;
  const active = activeHrefOf(path, items);
  const on = !!active || path === "/master" || path.startsWith("/master/");
  return (
    <Link href="/master" className={on ? "nox-hdrbtn on" : "nox-hdrbtn"} aria-label={GEAR_LABEL} title={`${GEAR_LABEL}（マスタ）`} aria-current={on ? "page" : undefined}>
      <span aria-hidden="true">⚙</span>
    </Link>
  );
}

export function UserChip({ name, email, roleJa, storeLabel, meId = null, mePhotoAt = null, canPhoto = false, isDemo = false }: {
  name: string | null; email: string | null; roleJa: string; storeLabel?: string;
  /** ★0162（便 M5-1）: 自分の users.id・写真の最終更新・写真を触れる役割（owner／manager／staff＝cast は /mine）・デモは導線を隠す */
  meId?: string | null; mePhotoAt?: string | null; canPhoto?: boolean; isDemo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [supabase] = useState(() => createClient());
  const [photoAt, setPhotoAt] = useState<string | null>(mePhotoAt);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [photoDone, setPhotoDone] = useState<string | null>(null);
  const showPhoto = canPhoto && !isDemo && !!meId;
  // 開いたときだけ署名 URL（1 回・1 人分）。写真が無い（null）なら発行しない
  useEffect(() => {
    if (!open || !showPhoto || !meId) return;
    let alive = true;
    void (async () => {
      const org = await resolveOrgId(supabase);
      if (!alive || !org) return;
      setOrgId(org);
      const u = photoAt ? await signUserPhoto(supabase, org, meId, photoAt) : null;
      if (alive) setPhotoUrl(u);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showPhoto, meId, photoAt]);
  async function onPickPhoto(f: File | null) {
    if (!f || !meId || !orgId) return;
    setBusy(true); setPhotoErr(null); setPhotoDone(null);
    try {
      const stamped = await uploadUserPhoto(supabase, orgId, meId, f);
      setPhotoAt(stamped);
      setPhotoDone("写真を保存しました");
    } catch (e) {
      setPhotoErr(rpcErrJa(e instanceof Error ? e.message : "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  }
  async function onRemovePhoto() {
    if (!meId || !orgId) return;
    if (!confirm("自分の写真を削除しますか？")) return;
    setBusy(true); setPhotoErr(null); setPhotoDone(null);
    try {
      await removeUserPhoto(supabase, orgId, meId); // ★329 追補1: storage.remove（delete policy）→ clear_user_photo（null 戻し）
      setPhotoAt(null); setPhotoUrl(null);
      setPhotoDone("写真を削除しました");
    } catch (e) {
      setPhotoErr(rpcErrJa(e instanceof Error ? e.message : "削除に失敗しました"));
    } finally {
      setBusy(false);
    }
  }
  const label = userChipLabelOf({ name, email, roleJa });
  return (
    <>
      <button type="button" className="nox-hdrbtn nox-userchip" title="自分の情報" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth={430} variant="top">{/* ★起票94（便 X-12-3）: 名前・メール行とログアウトが常に viewport 内 */}
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>自分の情報</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setOpen(false)}>×</button>
            </div>
            {showPhoto && (
              // ★0162（裁定329・便 M5-1）: 本人の写真＝CastAvatar（未登録は頭文字）＋「写真を登録／変更」（nox-photoedit＝/mine と同じ）＋「写真を削除」（写真があるとき）
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <CastAvatar name={(name ?? "").trim() || "?"} url={photoUrl} size={56} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label>
                    <span className="nox-photoedit" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>{photoActionLabelOf(!!photoAt, busy)}</span>
                    <input type="file" accept="image/*" disabled={busy} onChange={(e) => { void onPickPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} style={{ display: "none" }} />
                  </label>
                  {photoAt && <button type="button" className="nox-photoedit" disabled={busy} onClick={() => void onRemovePhoto()}>写真を削除</button>}
                </div>
              </div>
            )}
            {photoErr && <Message kind="error" style={{ margin: "0 0 8px" }}>{photoErr}</Message>}
            {photoDone && <Message kind="success" style={{ margin: "0 0 8px" }}>{photoDone}</Message>}
            <dl className="nox-userinfo">
              <dt>登録名</dt><dd>{(name ?? "").trim() || "—"}</dd>
              <dt>役割</dt><dd>{roleJa}</dd>
              {storeLabel && <><dt>店舗</dt><dd>{storeLabel}</dd></>}
            </dl>
            {/* ★X-13-2（便 X-13a）: メールは PC・スマホとも非表示（ログイン ID を画面に出さない）。変更の案内 1 行は残す。≤900px は Modal の既存シート（variant top は ≥901 のみ） */}
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "8px 0 0" }}>登録名・メールの変更はスタッフ画面（オーナー）から行います。</p>
            <div className="nox-navsheet-g nox-actions" style={{ marginTop: 14 }}>
              <form action="/auth/signout" method="post" style={{ display: "flex" }}>
                <button type="submit" className="nox-btn ghost">ログアウト</button>{/* ★裁定242-(6): ログアウト＝補助（青枠）・POST /auth/signout は不変 */}
              </form>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
