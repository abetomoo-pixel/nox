"use client";

// ★夜間便 N4（2026-09-24・裁定275 追補2-2／3）: ヘッダー右の 2 つの口。
//   HeaderGear ＝ 歯車（マスタ・監査・ご契約＝gear 群）→ 一覧型（アイコン＋説明＋「›」）の Modal。
//   UserChip   ＝ 「登録名｜役割」→ 自分の情報（表示のみ）＋ログアウト（form POST /auth/signout＝経路不変）。
//   ★ルート／URL／権限ゲートは非改変＝表示だけ。既存トークン・既存部品（Modal・NavIcon・.nox-navsheet-*）のみ・ui-tokens 新規 0。
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Modal from "./modal";
import { NavIcon } from "./nav-icons";
import { GEAR_LABEL, NAV_DESC, activeHrefOf, userChipLabelOf, type NavGroup } from "@/lib/nox/ui/nav-tabs";

/** 一覧型の行（メニュー Modal と設定 Modal で共用）＝アイコン＋ラベル＋説明＋「›」 */
export function NavListRow({ href, label, on, onClick }: { href: string; label: string; on: boolean; onClick?: () => void }) {
  return (
    <Link href={href} className={on ? "nox-navsheet-i nox-navrow on" : "nox-navsheet-i nox-navrow"} aria-current={on ? "page" : undefined} onClick={onClick}>
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
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const items = groups.flatMap((g) => g.items);
  if (items.length === 0) return null;
  const active = activeHrefOf(path, items);
  return (
    <>
      <button type="button" className={active ? "nox-hdrbtn on" : "nox-hdrbtn"} aria-label={GEAR_LABEL} title={GEAR_LABEL} onClick={() => setOpen(true)}>
        <span aria-hidden="true">⚙</span>
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth={520} scroll>
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>{GEAR_LABEL}</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setOpen(false)}>×</button>
            </div>
            {groups.map((g, gi) => (
              <div key={g.label ?? `gear${gi}`} className="nox-navsheet-g">
                {g.items.map((it) => <NavListRow key={it.href} href={it.href} label={it.label} on={it.href === active} onClick={() => setOpen(false)} />)}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function UserChip({ name, email, roleJa, storeLabel }: { name: string | null; email: string | null; roleJa: string; storeLabel?: string }) {
  const [open, setOpen] = useState(false);
  const label = userChipLabelOf({ name, email, roleJa });
  return (
    <>
      <button type="button" className="nox-hdrbtn nox-userchip" title="自分の情報" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth={430}>
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>自分の情報</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setOpen(false)}>×</button>
            </div>
            <dl className="nox-userinfo">
              <dt>登録名</dt><dd>{(name ?? "").trim() || "—"}</dd>
              <dt>メール</dt><dd>{email || "—"}</dd>
              <dt>役割</dt><dd>{roleJa}</dd>
              {storeLabel && <><dt>店舗</dt><dd>{storeLabel}</dd></>}
            </dl>
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
