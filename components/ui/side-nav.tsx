"use client";

// 900+ の左サイドバー（マスタIA再編 レーン④a-4）。
// 由来: (manage)/layout.tsx の <aside className="nox-side"> をそのまま切り出したもの。
//   ★群構成・項目集合・順序・遷移先・role ゲートは1つも変えていない（groups は layout が組んで渡す）。
//   ★client 部品にしたのは現在地判定のため。server layout は route 間の遷移で再レンダされないことがあり、
//     x-pathname ヘッダ由来だとハイライトが取り残される。usePathname なら遷移ごとに追随する。
//   ★最長一致で active を1つに絞る規則は components/ui/nav.tsx の TabBar と同一
//     （/master と /master/products の二重点灯を防ぐ）。TabBar 側は1文字も触っていない。
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "./nav";
import { NavIcon } from "./nav-icons";

// E2（2026-08-17）: モック骨格に合わせ、サイドバー上部の**ブランド**を受け取る。
//   ★受け取るのは表示文字列だけ＝groups（項目集合・順序・role ゲート）には一切触れていない。
//   モックの `.brand`＝「N（brandmark 37px）／NOX／店名」と同一構成。
//   ★モックの `.sidefoot` は**ページ状態行**（「最終更新 15:58」「LINE通知 正常」等）で、
//     NOX に対応するデータが無いため**描かない**（無いものを埋めるとナビに新情報を足すことになる）。
export default function SideNav({ groups, storeLabel }: {
  groups: NavGroup[];
  storeLabel?: string;
}) {
  const path = usePathname() ?? "";
  const flat = groups.flatMap((g) => g.items);
  const active = flat.reduce<string>((best, it) => {
    const hit = path === it.href || path.startsWith(it.href + "/");
    if (!hit) return best;
    return it.href.length > best.length ? it.href : best;
  }, "");

  return (
    <aside className="nox-side">
      {/* E2: モック .brand（brandmark＋NOX＋店名）。リンクではない＝遷移を増やさない。 */}
      <div className="brand">
        <div className="brandmark" aria-hidden="true">N</div>
        <div>
          <b>NOX</b>
          {storeLabel && <small>{storeLabel}</small>}
        </div>
      </div>
      {groups.map((g, gi) => (
        // 群ごとに包む＝見出しの無い群（項目1つの「顧客」「分析」）でも切れ目が線で分かる
        <div key={g.label ?? `g${gi}`} className="nox-sidegroup">
          {/* ★1項目しかない群は見出しを出さない＝「顧客/顧客」「分析/分析」の重複表示を解消（S-1R ⑧）。 */}
          {g.label && g.items.length > 1 && <div className="group">{g.label}</div>}
          {g.items.map((it) => {
            const on = it.href === active;
            return (
              <Link key={it.href} href={it.href} className={on ? "active" : undefined}
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  // E8-1b F4: アクティブ項目の再クリック＝同一 URL 遷移は App Router で no-op のため、
                  // 画面側（register-board 等）がフロアへ戻る等のリセットに使えるイベントを流す。
                  if (on) window.dispatchEvent(new CustomEvent("nox:nav-reclick", { detail: it.href }));
                }}>
                <NavIcon href={it.href} />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
