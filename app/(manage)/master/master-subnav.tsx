"use client";

// マスタ第2ナビ（マスタIA再編 レーン①・裁定C）。パンくず「マスタ ▸ {群名} ▾」＋群内タブ。
// ★表示のみ。ここには権限判定を書かない（入口の遮断は master/layout.tsx＝server 側）。
// ★定義は lib/nox/master/nav.ts の1本のみ。この部品は配列を描くだけ＝行が増えればナビが増える。
// ★色値は新規に足さず canonical トークン（--sub / --ink / --line2）と既存 nox-* クラスを使う。
//   タブは既存 .nox-seg（casts/report と同じセグメント）。≤900 は横スクロールで溢れさせない
//   （inline に @media は書けないが overflow-x は断点不要＝画面幅を問わず同じ挙動で足りる）。
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MASTER_NAV, resolveMasterNav } from "@/lib/nox/master/nav";
import * as t from "@/lib/nox/ui/theme";

const crumbRoot: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
const crumbSep: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
const crumbCur: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--ink)" };
const crumbSelect: React.CSSProperties = {
  ...t.input, width: "auto", padding: "5px 9px", fontSize: 13, fontWeight: 700,
};

export default function MasterSubnav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const cur = resolveMasterNav(pathname);
  // 群が1つだけの間はドロップダウンにしない（選択肢1件の ▾ は操作できるように見えて何も起きない）
  const multiGroup = MASTER_NAV.length > 1;
  const tabs = cur?.group.pages ?? [];

  return (
    <>
      <nav className="nox-secbar" aria-label="パンくず" style={{ marginBottom: tabs.length > 1 ? 12 : 18 }}>
        <span style={crumbRoot}>マスタ</span>
        {cur && (
          <>
            <span style={crumbSep} aria-hidden="true">▸</span>
            {multiGroup ? (
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
            ) : (
              <span style={crumbCur}>{cur.group.label}</span>
            )}
          </>
        )}
      </nav>

      {/* 群内タブ＝ページが2つ以上あるときだけ出す（1件のタブ行は情報量ゼロ） */}
      {tabs.length > 1 && (
        <div className="nox-ctoolbar" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          <div className="nox-seg" style={{ flex: "0 0 auto" }}>
            {tabs.map((p) => {
              const on = p.href === cur?.page.href;
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
