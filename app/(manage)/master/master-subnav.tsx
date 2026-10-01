"use client";

// マスタ第2ナビ（マスタIA再編 レーン①・裁定C → ★裁定330（便 MC1・2026-10-01）: 3 層＝パンくず「マスタ ▸ {群} ▾ ▸ {入口} ▾」＋入口内タブ）。
// ★表示のみ。ここには権限判定を書かない（入口の遮断は master/layout.tsx＝server 側・オーナー限定の中身は各 page が持つ）。
// ★定義は lib/nox/master/nav.ts の1本のみ。この部品は配列を描くだけ＝行が増えればナビが増える。
// ★色値は新規に足さず canonical トークン（--sub / --ink）と既存 nox-* クラス（.nox-secbar／.nox-seg／.nox-ctoolbar）を使う。
//   タブは既存 .nox-seg（casts/report と同じセグメント）。?tab=／#hash のタブは URL をそのまま持つ Link（pricing は ?tab を読む・system は hash を読む＝既存）。
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MASTER_NAV, resolveMasterNav } from "@/lib/nox/master/nav";
import * as t from "@/lib/nox/ui/theme";

const crumbRoot: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
const crumbSep: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
const crumbSelect: React.CSSProperties = {
  ...t.input, width: "auto", padding: "5px 9px", fontSize: 13, fontWeight: 700,
};

export default function MasterSubnav() {
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const router = useRouter();
  // hash は Next のナビゲーション API に無い＝window から読み hashchange を拾う（system-board と同じ流儀）
  const [hash, setHash] = useState("");
  useEffect(() => {
    const apply = () => setHash(typeof window === "undefined" ? "" : window.location.hash);
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [pathname, sp]);
  const search = sp?.toString() ? `?${sp.toString()}` : "";
  const cur = resolveMasterNav(pathname, search, hash);
  const tabs = cur?.page.tabs ?? [];

  return (
    <>
      <nav className="nox-secbar" aria-label="パンくず" style={{ marginBottom: tabs.length > 1 ? 12 : 18 }}>
        <Link href="/master" style={crumbRoot}>マスタ</Link>
        {cur && (
          <>
            <span style={crumbSep} aria-hidden="true">▸</span>
            <select
              aria-label="マスタの群を切り替え"
              style={crumbSelect}
              value={cur.group.key}
              onChange={(e) => {
                const g = MASTER_NAV.find((x) => x.key === e.target.value);
                if (g?.pages[0]) router.push(g.pages[0].href);
              }}
            >
              {MASTER_NAV.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
            <span style={crumbSep} aria-hidden="true">▸</span>
            {cur.group.pages.length > 1 ? (
              <select
                aria-label="入口を切り替え"
                style={crumbSelect}
                value={cur.page.href}
                onChange={(e) => router.push(e.target.value)}
              >
                {cur.group.pages.map((p) => (
                  <option key={p.href} value={p.href}>{p.label}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{cur.page.label}</span>
            )}
          </>
        )}
      </nav>

      {/* 入口内タブ＝タブが2つ以上あるときだけ出す（1件のタブ行は情報量ゼロ）。既存の page／?tab=／#hash をそのまま Link で持つ */}
      {tabs.length > 1 && (
        <div className="nox-ctoolbar" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          <div className="nox-seg" style={{ flex: "0 0 auto" }}>
            {tabs.map((p) => {
              const on = p.href === cur?.tab?.href;
              return (
                <Link key={p.href} href={p.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
