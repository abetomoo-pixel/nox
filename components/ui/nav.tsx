"use client";

// タブナビ（モックの .tabbar/.tab）。現在パス（usePathname）で active を1つだけ点灯（最長一致）。
// リンクのみ＝機能ロジックなし（真の権限防御は RLS/RPC・ここは表示ナビ）。
// R-2（2026-07-17）: inline style から globals.css の .nox-tabbar/.nox-tab へ移行。
//   ≤899 は従来どおり下部タブバー・900+ は左サイドバー（分岐は CSS の @media が担い、この部品は無分岐のまま）。
// ★UI刷新v2 段N（2026-07-27・正本 nox-nav-redesign-mock-v2.html）:
//   - 900+ サイドバーに「群見出し」を出す（表示のみ＝クリック不可・折り畳みなし）。
//   - ★ルート/URL/ページ実体/権限ゲートは非改変＝ここは並び・群・ラベルの表示だけ。
//   - 両レイアウトを常に DOM に出し、表示切替は CSS の @media が担う（SSR/ハイドレーション差異を作らない）。
//   - spPriority 未指定なら従来どおり全項目を1列に並べる＝/mine の挙動は不変。
// ★夜間便 N4（2026-09-24・裁定275 追補2）: ≤899 の下タブ＝優先 4 本＋5 本目「メニュー」（旧「その他」）・歯車は下タブから外し
//   ヘッダー右（components/ui/header-chips.tsx）へ。メニューにお知らせ（gear 群から移す）。振り分けは純関数 lib/nox/ui/nav-tabs.ts splitNav。
//   メニューは一覧型（アイコン＋説明＋「›」＝NavListRow）。選択中タブ＝アイコン＋上辺の線＋太字（CSS .nox-nav-bottom .nox-tab.on）。
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Modal from "./modal"; // ★裁定251（M2）: メニューのシートは共通 Modal 部品を通す
import { NavIcon } from "./nav-icons";
import { NavListRow } from "./header-chips";
import { GEAR_LABEL, MENU_LABEL, OPEN_MENU_EVENT, activeHrefOf, splitNav, type NavGroup, type NavItem } from "@/lib/nox/ui/nav-tabs";

export type { NavItem, NavGroup };

// 段0R その2: hideSide＝900+ のサイドバーを (manage)/layout の .nox-side（aaa 基準シェル）へ移したため
//   TabBar 側の .nox-nav-side を出さないためのフラグ。既定 false＝/mine は従来どおり両方出す。
// gear は互換のため残す（N4 で下タブの歯車を廃止＝渡しても描かない）。
export function TabBar({ groups, spPriority, hideSide = false }: { groups: NavGroup[]; spPriority?: string[]; hideSide?: boolean; gear?: boolean }) {
  const path = usePathname() ?? "";
  const [sheet, setSheet] = useState(false);
  const [section, setSection] = useState<"menu" | "settings">("menu");
  // ★裁定306-11: 開く＝履歴に 1 段積む（戻るで閉じる）・閉じる＝外側タップ／×／Esc は history.back() で同じ経路を通す
  const openSheet = (sec: "menu" | "settings") => {
    setSection(sec);
    setSheet(true);
    try { window.history.pushState({ ...(window.history.state ?? {}), noxSheet: 1 }, ""); } catch { /* noop */ }
  };
  const closeSheet = () => {
    if (typeof window !== "undefined" && window.history.state?.noxSheet) { window.history.back(); return; }
    setSheet(false);
  };
  useEffect(() => {
    const onPop = () => setSheet(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // ★306-11: ヘッダーの歯車（≤899px）＝同じシートを「設定」節から開く
  useEffect(() => {
    const onOpen = (e: Event) => { const sec = (e as CustomEvent<{ section?: string }>).detail?.section === "settings" ? "settings" : "menu"; openSheet(sec); };
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 「設定」節から開いたときはその節へスクロール
  useEffect(() => {
    if (!sheet || section !== "settings") return;
    requestAnimationFrame(() => document.getElementById("nox-sheet-settings")?.scrollIntoView({ block: "start" }));
  }, [sheet, section]);
  // ★裁定251（M2）: Esc で閉じる（シートが開いている間だけ keydown を購読）
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);
  const flat = groups.flatMap((g) => g.items);
  const active = activeHrefOf(path, flat);
  // ★N4: ≤899 の振り分け＝優先 4 本／メニュー（残り＋お知らせ）／歯車（ヘッダーへ＝ここでは描かない）
  const { primary, menuGroups, gearGroups } = splitNav(groups, spPriority);
  const gearItems = gearGroups.flatMap((g) => g.items); // ★306-11: シートの「設定」節（≤899px の 歯車 の行き先）
  const menuItems = menuGroups.flatMap((g) => g.items);
  const menuActive = menuItems.some((it) => it.href === active);

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

      {/* ≤899 ＝ ボトムタブ（優先 4 本＋メニュー＝5 本）。900+ は CSS で非表示。 */}
      <nav className="nox-tabbar nox-nav-bottom">
        {primary.map((it) => (
          <Link key={it.href} href={it.href} className={it.href === active ? "nox-tab on" : "nox-tab"} aria-current={it.href === active ? "page" : undefined}>
            <NavIcon href={it.href} />
            {it.label}
          </Link>
        ))}
        {menuItems.length > 0 && (
          <button type="button" className={menuActive ? "nox-tab on" : "nox-tab"} aria-haspopup="dialog" aria-expanded={sheet} onClick={() => openSheet("menu")}>
            <NavIcon href="menu" />
            {MENU_LABEL}
          </button>
        )}
      </nav>

      {/* 「メニュー」＝残り項目の一覧型シート。★裁定251（M2・2026-09-14）: 共通 Modal 部品（maxWidth 520・scroll・≤900 はボトムシート）。
          × ボタン（.nox-formmodal-x）と Esc（useEffect の keydown）で閉じる。/mine の TabBar も同じ部品を通る（メニューは出ない）。 */}
      {sheet && (
        <Modal onClose={closeSheet} maxWidth={520} scroll>
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>{section === "settings" ? GEAR_LABEL : MENU_LABEL}</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={closeSheet}>×</button>
            </div>
            {menuGroups.map((g, gi) => (
              <div key={g.label ?? `s${gi}`} className="nox-navsheet-g">
                {g.label && <div className="nox-navgroup-h">{g.label}</div>}
                {g.items.map((it) => <NavListRow key={it.href} href={it.href} label={it.label} on={it.href === active} onClick={closeSheet} />)}
              </div>
            ))}
            {/* ★306-11: 「設定」節（gear 群）＝≤899px の 歯車 はここから開く（ページ内パネルを差し込まない） */}
            {gearItems.length > 0 && (
              <div id="nox-sheet-settings" className="nox-navsheet-g">
                <div className="nox-navgroup-h">{GEAR_LABEL}</div>
                {gearItems.map((it) => <NavListRow key={it.href} href={it.href} label={it.label} on={it.href === active} onClick={closeSheet} />)}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
