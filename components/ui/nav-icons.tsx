// ナビ用の線画アイコン（マスタIA再編 レーン④a-4）。
// ★アイコンライブラリは入れない（依存を増やさない＝裁定3 と同じ方針）。絵文字も使わない。
// ★すべて stroke ベースのインライン SVG で、色は currentColor 継承＝リンクの色（通常/hover/現在地の金）に
//   そのまま追随する。サイズは 18px 固定・viewBox は 24 系で統一。
// 対応は href キー1本。未登録の href は null を返す（項目が増えても壊れない＝アイコン無しで出る）。
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  // ホーム＝家
  "/dashboard": <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></>,
  // レジ＝カード（会計端末）
  "/register": <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 15h4" /></>,
  // 日報＝書類
  "/report": <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  // シフト＝カレンダー
  "/shift": <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  // キャスト＝人物1人
  "/casts": <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></>,
  // スタッフ＝人物2人
  "/staff": <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-5.2 6.5-5.2s6.5 1.8 6.5 5.2" /><path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.2" /><path d="M18 14.8c2 .5 3.5 1.8 3.5 4.2" /></>,
  // 給与＝紙幣
  "/payroll": <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></>,
  // 顧客＝名簿カード（人物＋行）＝キャスト/スタッフの人物アイコンと形で区別する
  "/customers": <><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><circle cx="9" cy="10.5" r="2.3" /><path d="M5.3 16.5c.5-1.7 2-2.6 3.7-2.6s3.2.9 3.7 2.6" /><path d="M16 9.5h3.5M16 13.5h3.5" /></>,
  // 分析＝棒グラフ
  "/analytics": <><path d="M3 20h18" /><path d="M6.5 20v-6M12 20V7M17.5 20v-9" /></>,
  // マスタ＝スライダー（設定）
  "/master": <><path d="M4 7.5h9M18 7.5h2M4 16.5h3M11 16.5h9" /><circle cx="15.5" cy="7.5" r="2.2" /><circle cx="9" cy="16.5" r="2.2" /></>,
  // お知らせ＝ベル
  "/notices": <><path d="M18 9.5a6 6 0 1 0-12 0c0 4.8-2 6.2-2 6.2h16s-2-1.4-2-6.2Z" /><path d="M10.4 19a2.2 2.2 0 0 0 3.2 0" /></>,
  // 監査＝盾＋チェック
  "/audit": <><path d="M12 3l7.5 3v6c0 4.6-3.2 7.6-7.5 9-4.3-1.4-7.5-4.4-7.5-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
};

export function NavIcon({ href }: { href: string }) {
  const d = P[href];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {d}
    </svg>
  );
}
