# NOX デザインパック v1.0 正本化台帳(裁定124・2026-09-04)

出所=Agoora v1.zip(sha256 faf3cfb314395676b09f254c56dd6a5e3fa51ca3011f5f8daaa1cb51231c6f07・2026-09-04)。
相談役が正規化のうえ正本化。**本パックが NOX 管理画面の色・文字・余白・操作系の正本**(blue-accent v2 は本パックで上書き)。
「本体が正・モックが従」の原則は不変=構造・文言の正本であり、実装済み機能の削除根拠にはしない。

## 収蔵ファイル(mock/pages-2026-09/ 配下・照合値必渡)

| ファイル | sha256 | bytes | 役割 |
|---|---|---|---|
| nox-compensation-plan-unified-v3_1.html | 72555ac8927208607835c5534e4782dc5a95ced5c93220120a095c259f8f08e1 | 29,883 | 報酬プラン管理(113 UI の構造・文言正本) |
| nox-master-store-settings-v3.html | 5e4c593c54a83d84b42a929aa4341cbde0423d4b022ff2fba03a74dd571cc918 | 43,691 | マスタ一覧+店舗設定(基本情報/利用機能/店舗運用) |
| nox-pricing-settings-unified-v8_1.html | 2815b0d1226e2c9244b327c828143e05eb436c712101baca28bc58af41689c12 | 56,297 | 料金設定(13セクション) |
| NOX_UI_COMMON_RULES_v1.md | 285b6eb5a5f934f1aea786cda2be41895fdb364320f10c02e9f60dfea1aafe2c | 4,668 | 共通UIルール(裁定122・全画面適用・原本が正) |

## 正規化内容(出所→正本の差分・すべて相談役実施)

1. **料金 v8 → v8.1**: トークン命名を色名→意味名へ(gold→brand・gold2→brand2・blue→primary・blue2→primary2・blue-soft→primary-soft・green→success・yellow→warning・red→danger・各 -soft 同様・radius→r)。計41箇所。中立色を他2本の値へ統一(panel/panel2/line-strong/text/sub/muted)。primary2/primary-soft/danger-soft の微差を統一。brand-soft・field を追加定義。**表示上の差は視認不能レベル**
2. **報酬 v3 → v3.1**: 第3タブ文言「1本あたり固定額」→「販売数 × 固定額」(2箇所・裁定123)
3. 店舗設定 v3・MD v1: 無改変

## 確定トークン(:root・3本共通)

- 中立: bg #070707 / panel #11110f / panel2 #151512 / field #090909 / line #302e28 / line-strong #484339 / text #f4f1e9 / sub #b8b2a8 / muted #7f7a71
- ブランド: brand #d8ad55 / brand2 #f0cf82 / brand-soft rgba(216,173,85,.10)
- 操作: primary #2f7fe7 / primary2 #61a7ff / primary-soft rgba(47,127,231,.15)
- 状態: success #4dc37d(.11) / warning #d9a43a(.10) / danger #e26762(.11)
- 文字: page 26 / section 17 / subsection 14 / body 13 / label 12 / help 11(px)
- 形: r 10px / row 46px(報酬のみ定義・全画面既定として採用)/ sidebar 205px(料金のみ定義・既定として採用)

## 裁定124(本パック)

1. 命名=意味名が正。色名トークンは今後作らない
2. 値=本パックの :root が正。globals.css の該当トークンを本値へ更新(旧値=blue-accent v2 は台帳へ退避)
3. 裁定120 の派生2本: `--danger-bd` は新 danger から再導出 rgba(226,103,98,.28)・`--danger-ink` #e7aaa7 は据え置き(暗面上の文字色として可読性維持)
4. MD v1 は全画面適用(裁定122)。数値は MD 原本が正
5. 適用順: 113 UI(報酬 v3.1)→ 店舗設定 v3・料金 v8.1 は写像 D調査(既存機能との対応表)→ 裁定 → UI レーン
6. blue-accent v2(859f1501…)は「色・操作系正本」を本パックへ譲り、参照用として残置(削除しない)
