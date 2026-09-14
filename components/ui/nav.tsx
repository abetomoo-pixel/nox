"use client";

// タブナビ（モックの .tabbar/.tab）。現在パス（usePathname）で active を1つだけ点灯（最長一致）。
// リンクのみ＝機能ロジックなし（真の権限防御は RLS/RPC・ここは表示ナビ）。
// R-2（2026-07-17）: inline style から globals.css の .nox-tabbar/.nox-tab へ移行。
//   ≤899 は従来どおり下部タブバー・900+ は左サイドバー（分岐は CSS の @media が担い、この部品は無分岐のまま）。
// ★UI刷新v2 段N（2026-07-27・正本 nox-nav-redesign-mock-v2.html）:
//   - 900+ サイドバーに「群見出し」を出す（表示のみ＝クリック不可・折り畳みなし）。
//   - ≤899 は ボトムタブ4本（spPriority で指定）＋「その他」＝残りをボトムシート（段A 基盤 .nox-modal-*）。
//   - ★ルート/URL/ページ実体/権限ゲートは非改変＝ここは並び・群・ラベルの表示だけ。
//   - 両レイアウトを常に DOM に出し、表示切替は CSS の @media が担う（SSR/ハイドレーション差異を作らない）。
//   - spPriority 未指定なら従来どおり全項目を1列に並べる＝/mine の挙動は不変。
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Modal from "./modal"; // ★裁定251（M2）: 「その他」シートは共通 Modal 部品を通す

export type NavItem = { href: string; label: string };
/** 群（label=null は見出しを出さない＝ホームや /mine のようなフラット表示） */
export type NavGroup = { label: string | null; items: NavItem[] };

// 段0R その2: hideSide＝900+ のサイドバーを (manage)/layout の .nox-side（aaa 基準シェル）へ移したため
//   TabBar 側の .nox-nav-side を出さないためのフラグ。既定 false＝/mine は従来どおり両方出す。
export function TabBar({ groups, spPriority, hideSide = false }: { groups: NavGroup[]; spPriority?: string[]; hideSide?: boolean }) {
  const path = usePathname() ?? "";
  const [sheet, setSheet] = useState(false);
  // ★裁定251（M2）: Esc で閉じる（シートが開いている間だけ keydown を購読）
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);
  const flat = groups.flatMap((g) => g.items);

  // 最長一致で active を1つに絞る（/mine と /mine/wishes の二重点灯を防ぐ）
  const active = flat.reduce<string>((best, it) => {
    const hit = path === it.href || path.startsWith(it.href + "/");
    if (!hit) return best;
    return it.href.length > best.length ? it.href : best;
  }, "");

  // ≤899 のボトムタブ：spPriority 指定時はその順で最大4本、残りは「その他」シートへ。
  const primary = spPriority
    ? spPriority.map((href) => flat.find((it) => it.href === href)).filter((x): x is NavItem => !!x).slice(0, 4)
    : flat;
  const rest = flat.filter((it) => !primary.some((p) => p.href === it.href));
  const restActive = rest.some((it) => it.href === active);

  return (
    <>
      {/* 900+ ＝ サイドバー（群見出しつき）。≤899 は CSS で非表示。 */}
      {!hideSide && (
      <nav className="nox-tabbar nox-nav-side">
        {groups.map((g, gi) => (
          <div key={g.label ?? `g${gi}`} className="nox-navgroup">
            {g.label && <div className="nox-navgroup-h">{g.label}</div>}
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className={it.href === active ? "nox-tab on" : "nox-tab"}>
                {it.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      )}

      {/* ≤899 ＝ ボトムタブ（4本＋その他）。900+ は CSS で非表示。 */}
      <nav className="nox-tabbar nox-nav-bottom">
        {primary.map((it) => (
          <Link key={it.href} href={it.href} className={it.href === active ? "nox-tab on" : "nox-tab"}>
            {it.label}
          </Link>
        ))}
        {rest.length > 0 && (
          <button type="button" className={restActive ? "nox-tab on" : "nox-tab"} onClick={() => setSheet(true)}>
            その他
          </button>
        )}
      </nav>

      {/* 「その他」＝残り項目のシート。★裁定251（M2・2026-09-14）: className の借用（地色・padding・角丸が当たらず
          背景が透けていた）をやめ、共通 Modal 部品（maxWidth 520・scroll＝高さ上限 88vh＋中身スクロール・≤900 はボトムシート・
          ハンドルは Modal が描く）を通す。× ボタン（.nox-formmodal-x）と Esc（useEffect の keydown）で閉じる手段を足した。
          /mine の TabBar も同じ部品を通る。 */}
      {sheet && (
        <Modal onClose={() => setSheet(false)} maxWidth={520} scroll>
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>メニュー</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setSheet(false)}>×</button>
            </div>
            {groups.map((g, gi) => {
              const items = g.items.filter((it) => rest.some((r) => r.href === it.href));
              if (items.length === 0) return null;
              return (
                <div key={g.label ?? `s${gi}`} className="nox-navsheet-g">
                  {g.label && <div className="nox-navgroup-h">{g.label}</div>}
                  {items.map((it) => (
                    <Link key={it.href} href={it.href}
                      className={it.href === active ? "nox-navsheet-i on" : "nox-navsheet-i"}
                      onClick={() => setSheet(false)}>
                      {it.label}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}
