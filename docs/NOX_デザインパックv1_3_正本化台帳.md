# NOX デザインパック v1.3 正本化台帳(裁定124・2026-09-04)

v1.0(4)+v1.1(3)+v1.2(4)に給与管理を追加した改版=全11ページ・メニュー全面。過去版の記述は不変。

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


## v1.1 追加収蔵(3ページ・mock/pages-2026-09/・照合値必渡)

| ファイル | sha256 | bytes | 出所 | 正規化 |
|---|---|---|---|---|
| nox-register-integrated-v12_1.html | 569d741594a39752800fa915d29253dcc733d11b5c0b36b40a3a8378fa0152a2 | 44,793 | v12(80b4537a…・title v9) | 意味名37箇所・中立/ソフト/r をパック値へ・field/brand-soft 追加 |
| nox-shift-management-integrated-v4_1.html | 60049d0178fed939b45ce6ae033e58182ac09bb6851bfa2b8ca6134a0c1f7e32 | 44,817 | v4(c7237c99…・title v2) | :root 全面をパック値へ差替(別世代値)・意味名30箇所。:root 外 HEX 直書き97箇所は未正規化(実装時に共通トークンへ) |
| nox-cast-staff-management-redesign-v3_1.html | f3d4faf71c81a519ab6cf148d223e97c0c6730ae0d9b5fb86f6e2900aafbc8ad | 32,648 | v3(1a38a7df…・title v2) | :root 全面をパック値へ差替(別世代値・soft が不透明 HEX)・意味名22箇所。:root 外 HEX 直書き88箇所は未正規化 |

- ページ固有トークン: `--side`(シフト・サイドバー地 #0b0b0a)は据え置き(パック未定義。実装で必要なら追加)
- 6ページ全体の :root は同一(v1.0 確定トークン+side/sidebar/row のページ固有3本)
- 裁定124-5 の適用順は据え置き: 113 UI(報酬)→ 残5ページは写像 D調査(⑬)→ 裁定 → ページ別 UI レーン
- デザイン受領はここで一旦終了(2026-09-04 Agoora)


## v1.2 追加収蔵(最終ラウンド4ページ・mock/pages-2026-09/・照合値必渡)

出所=nox-final-redesign-round-v2(index 85606731…・4本とも別世代値・title v1)。:root 全面をパック値へ差替・意味名写像。:root 外 HEX 直書きは未正規化(実装時に共通トークンへ)。

| ファイル | sha256 | bytes | 出所 sha | 写像数 | :root 外 HEX |
|---|---|---|---|---|---|
| nox-home-redesign-v2_1.html | 2f4e7d6216da19925f3475a301a2d84c5a1cdaed981df6ee5f763532636446dd | 16,266 | 86fea023… | 25 | 48 |
| nox-daily-monthly-ar-redesign-v2_1.html | 6bb6141ffc43e9c1ff62cb41928bbea8ee518df593ad0e3e10032eca32d601ee | 23,502 | 40d38e37… | 27 | 60 |
| nox-analysis-redesign-v2_1.html | 1608b5ed1f4d3facf08dc554a3bc01884b39872e9e7307955a6f60eec7e5df34 | 21,743 | f97b85c2… | 19 | 49 |
| nox-announcements-redesign-v2_1.html | 17b1add17d32350f3675184631fbe93cfee0b750125e81b3ff0b70787dc16e18 | 24,714 | f174b24e… | 21 | 68 |

- 主題(index 記載): 日報・月報・売掛=営業日境界/現金差異/締め解除→訂正→再締め/月次確定/売掛回収方法。ホーム=営業前・中・後の主役切替/予約/店舗切替。分析=会計売上・販売実績・指名実績・担当顧客の定義分離/概算人件費/顧客売上按分禁止。お知らせ・通知=手動と自動通知の分離/配信方式/対象拡張/監査・未達
- 10ページで管理画面デザインは一旦完結(マスタ設定の一部を除く・2026-09-04 Agoora)。写像 D調査は対応表 v1 の §8〜§11 として追補


## v1.3 追加収蔵(給与管理・mock/pages-2026-09/)

| ファイル | sha256 | bytes | 出所 sha | 写像数 | :root 外 HEX |
|---|---|---|---|---|---|
| nox-payroll-redesign-v2_1.html | 7029b49488c94788a570d040fcc30d7cf321e0b045f9cec8a16b77fbacfa3a20 | 29,910 | 8c607651…(title v1) | 21 | 78 |

- 構造: 5タブ(計算・確認/確定・訂正/支払・明細/税務・出力/履歴)・給与グループ・集計元の状態・確定前の要確認・手動調整・対象者ごとの確定・期間ステータス・**確定後の訂正**(=D-1 給与確定取消と同族)・支払状況・明細公開・CSV/PDF・銀行振込データ・源泉徴収・納付管理・処理履歴
- 設計思想正本: docs/NOX_UI_MOCKS_HANDOFF_20260904.md(951838f9…・裁定126)
- これでメニュー全面(11ページ)のデザイン受領完了(2026-09-04 Agoora)。写像 D調査は対応表 v1 §13 として追補

## 裁定124(本パック)

1. 命名=意味名が正。色名トークンは今後作らない
2. 値=本パックの :root が正。globals.css の該当トークンを本値へ更新(旧値=blue-accent v2 は台帳へ退避)
3. 裁定120 の派生2本: `--danger-bd` は新 danger から再導出 rgba(226,103,98,.28)・`--danger-ink` #e7aaa7 は据え置き(暗面上の文字色として可読性維持)
4. MD v1 は全画面適用(裁定122)。数値は MD 原本が正
5. 適用順: 113 UI(報酬 v3.1)→ 店舗設定 v3・料金 v8.1 は写像 D調査(既存機能との対応表)→ 裁定 → UI レーン
6. blue-accent v2(859f1501…)は「色・操作系正本」を本パックへ譲り、参照用として残置(削除しない)
