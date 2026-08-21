"use client";

// マスタ配下ページの共通ヘッダ（マスタIA再編 レーン④a-3）。
// ★3ページ（商品／商品カテゴリ／在庫の入出庫）で見出しのスケールを揃えるための部品。
//   第2ナビのタブで行き来したときに見出しの大きさが変わると段差として見えるため、
//   タイトル・件数バッジ・説明文の寸法をここ1箇所に集約する。
// 表示のみ＝データ取得も権限判定も持たない。右端の action は任意（商品ページだけが渡す）。
import * as t from "@/lib/nox/ui/theme";

// ★B1（2026-08-21）: モック .pagehead と同形の**英字イーブロー**を1段足す。
//   マスタ配下は第2ナビで行き来するため、ここを直せば7ページとも同時に揃う。
export default function MasterPageHead({ eyebrow, title, count, unit = "件", desc, action }: {
  /** 英字イーブロー（モック逐語）。省略時は出さない。 */
  eyebrow?: string;
  title: string;
  /** 件数バッジ。undefined なら出さない。 */
  count?: number;
  unit?: string;
  desc: string;
  /** 右端の主アクション（例「＋ 商品を追加」）。無いページは省略する。 */
  action?: React.ReactNode;
}) {
  return (
    <div className="nox-pthead">
      <div className="nox-pthead-main">
        {eyebrow && <div className="nox-pth-eye">{eyebrow}</div>}
        <div className="title">
          <h2>{title}</h2>
          {count !== undefined && <span className="nox-countbadge" style={t.num}>{count}{unit}</span>}
        </div>
        <p className="desc">{desc}</p>
      </div>
      {action}
    </div>
  );
}
