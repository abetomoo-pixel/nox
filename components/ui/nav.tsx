"use client";

// 下部タブナビ（モックの .tabbar/.tab）。現在パス（usePathname）で active を1つだけ点灯（最長一致）。
// リンクのみ＝機能ロジックなし（真の権限防御は RLS/RPC・ここは表示ナビ）。
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";

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
    <nav style={t.tabBar}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} style={{ ...t.tab(it.href === active), fontSize: 10.5 }}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
