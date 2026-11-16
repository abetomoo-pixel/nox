// ★2026-11-16（■8・裁定499-10）: 店舗設定の 6 タブの並び（店舗情報／レジ／シフトと打刻／給与／キャスト画面／税と請求）＋LINE 連携。
//   ?tab= の切替だけ（各タブはサーバーで描く）。375 では 2 列×3 段＋LINE（文字は 1 行で全部見せる・44px 以上）。
import Link from "next/link";
import type { StoreProfileTab } from "@/lib/nox/master/nav";

export const STORE_SETTINGS_TAB_LABELS: ReadonlyArray<readonly [StoreProfileTab, string]> = [
  ["info", "店舗情報"], ["register", "レジ"], ["shift", "シフトと打刻"], ["pay", "給与"], ["mine", "キャスト画面"], ["tax", "税と請求"], ["line", "LINE 連携"],
];

export default function StoreSettingsTabs({ current }: { current: StoreProfileTab }) {
  return (
    <nav className="nox-seg nox-segtabs nox-segtabs--grid2" style={{ width: "100%", marginBottom: 12 }} aria-label="店舗設定のタブ" data-store-settings-tabs="1">
      {STORE_SETTINGS_TAB_LABELS.map(([k, label]) => (
        <Link key={k} href={`/master/store-profile?tab=${k}`} className={current === k ? "on" : ""} aria-current={current === k ? "page" : undefined}
          style={{ flex: "1 1 110px", fontWeight: 800, fontSize: 12.5, padding: "10px 6px", minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", borderTop: "1px solid var(--line)", marginTop: -1,
            boxShadow: current === k ? "inset 0 -2px 0 var(--primary)" : undefined }}
          data-store-tab={k}>{label}</Link>
      ))}
    </nav>
  );
}
