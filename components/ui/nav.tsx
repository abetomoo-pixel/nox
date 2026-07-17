"use client";

// タブナビ（モックの .tabbar/.tab）。現在パス（usePathname）で active を1つだけ点灯（最長一致）。
// リンクのみ＝機能ロジックなし（真の権限防御は RLS/RPC・ここは表示ナビ）。
// R-2（2026-07-17）: inline style から globals.css の .nox-tabbar/.nox-tab へ移行。
//   ≤899 は従来どおり下部タブバー・900+ は左サイドバー（分岐は CSS の @media が担い、この部品は無分岐のまま）。
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? "";
  // 最長一致で active を1つに絞る（/mine と /mine/wishes の二重点灯を防ぐ）
  const active = items.reduce<string>((best, it) => {
    const hit = path === it.href || path.startsWith(it.href + "/");
    if (!hit) return best;
    return it.href.length > best.length ? it.href : best;
  }, "");
  return (
    <nav className="nox-tabbar">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={it.href === active ? "nox-tab on" : "nox-tab"}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
