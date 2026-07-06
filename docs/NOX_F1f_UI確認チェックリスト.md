# NOX F1f UI 確認チェックリスト（完走記録・2026-07-03）

> 目的: UI 層で「見えてはいけないものが見えない・操作できてはいけないものが操作できない」ことの確認台帳。
> DB 層は verify:f0（381 assertions）が物理保証を強制済み＝本表は「UI が余計なものを描いていないか」に集中。
> 実施: CC の dev 実機トレース（DOM 検査）＋ Agoora 目視（確認①〜④・いずれも全項目 OK 済み）。

## 機械確認（コマンド再現可能・2026-07-03 実行）

| # | 内容 | コマンド | 結果 |
|---|---|---|---|
| G-a | cast 画面からパターン2テーブルへの `.from()` なし | `grep -rEn "from\(\s*['\"\`](checks\|check_lines\|payments\|check_nominations\|receivables\|seats\|stock_logs\|bottle_keeps\|staffing_needs\|daily_reports\|audit_logs)['\"\`]" app/mine/` | **0件 ✅** |
| G-b | `daily_report_aggregate` の rpc 呼び出しなし（内部専用維持） | `grep -rEn "rpc\(\s*['\"\`]daily_report_aggregate" app/` | **0件 ✅** |
| G-c | 内部専用4関数（recalc/group_due/round_amount/audit_log_write）の app 呼び出しなし | 同型 grep | **0件 ✅** |

## ロール×画面マトリクス

凡例: ✅=確認済み（CC 実機トレース＋Agoora 目視） ／ ―=対象外（リダイレクトで到達不能）

### 認証・ルーティング（確認①）

| 項目 | cast | staff | manager | owner |
|---|---|---|---|---|
| ログイン後の着地 | /mine ✅ | /register ✅ | /register ✅ | /register ✅ |
| /register 直打ち | →/mine ✅ | 表示 ✅ | 表示 ✅ | 表示 ✅ |
| /mine 直打ち | 表示 ✅ | →/register ✅ | →/register ✅ | →/register ✅ |
| 未ログインで保護パス | →/login ✅（middleware・5パス） | 同 | 同 | 同 |
| ログアウト（sb Cookie 破棄・再進入不可） | ✅ | ✅ | ✅ | ✅ |
| nav に「マスタ」 | ― | **非表示 ✅** | 表示 ✅ | 表示 ✅ |

### cast 画面（確認②）

| 項目 | 結果 |
|---|---|
| /mine バックが自分の分のみ（A1a=¥8,500/14pt・A1b=¥750/2pt の分離） | ✅（F1b 分配ゴールデンと一致） |
| /mine 打刻・遅刻当欠連絡の操作 | ✅（punch_self／attendance_set_self） |
| /mine/wishes 提出（24h超表記→「翌」正規化表示）・pending のみ取下げ可 | ✅ |
| /mine/ranking 順位・名前・件数のみ・**ページ全体に ¥ 出現なし**（DOM 全文検査） | ✅ |
| 他 cast の金額・店舗総額・レジ情報がどの cast 画面にも出ない | ✅（G-a で構造的にも担保） |

### レジ /register（確認③）

| 項目 | staff | manager |
|---|---|---|
| 卓 open・指名（重み）・明細・分割 group・部分入金・close | ✅ 操作可 | ✅ 操作可 |
| group 請求・合計表示＝ゴールデン（A 37,900／B 16,500／計 54,400） | ✅ | ✅ |
| 現金の釣銭表示・残額超過の拒否・入金後の明細削除不可 | ✅ | ✅ |
| **取消（void）ボタン** | **非表示 ✅**＋RPC 直呼びも forbidden 実測 | 表示・動作 ✅ |

### シフト /shift・日報 /report・マスタ /master（確認④）

| 項目 | staff | manager |
|---|---|---|
| /shift 採用/見送り・シフト登録・確定化・必要人数 | **UI 非描画 ✅** | ✅ 動作（採用→wish_id 来歴付き planned→確定） |
| /shift 出勤板（attendance_set＝台帳 #24 開放） | **✅ 操作可**（実測・保存確認） | ✅ |
| /report プレビュー閲覧 | ✅ | ✅ |
| /report 締め・再締め | **UI 非描画 ✅**＋RPC forbidden | ✅（プレビューと凍結値の全項目一致・reclosed_count 表示） |
| /master 操作フォーム | 非描画（isManagerUp ガード）＋RPC forbidden | ✅（商品編集・席・在庫 Σdelta） |

### 報酬設計マスタ /master 拡張（確認⑤・F2a-4・mig0012〜0014）

CC 実機トレース（owner=nox-verify-owner-a／manager=nox-verify-manager-a1 実ログイン・DOM/a11y スナップショット）。★は Agoora 目視の確定対象。

| # | 項目 | CC トレース |
|---|---|---|
| 1 | 6タブ描画（プラン/割当/ノルマ/控除/罰金・閾値/自由バック） | ✅ owner で6タブ全出現 |
| 2 | ★プランタブ: owner は編集フォーム（保証時給・本/場内/同伴・売上/ptスライド）表示 | ✅ owner 表示・「オーナーのみ」注記なし |
| 3 | ★D3a プランタブ: manager は編集フォーム非描画＋「オーナーのみ」注記 | ✅ manager で確認 |
| 4 | ★罰金・閾値タブ: owner は設定11項目（数値10＋norm_on）＋保存 | ✅ 保存実行→「保存しました」（RPC 往復） |
| 5 | ★D3a 罰金タブ: manager は入力非描画＋注記＋現在値の読取表示 | ✅ manager で確認 |
| 6 | 割当/ノルマ/控除/自由バックは manager 以上で編集可 | ✅ 割当セレクト2種表示・注記なし |
| 7 | ★割当のプラン選択肢が inactive を除外（廃止プラン非表示） | ✅ 「有効のみ」＝プランAのみ・廃止プラン不在 |
| 8 | slide 3段入力（各段 at/時給・at=0 段は送信時除外・昇順strictは RPC 検証） | ✅ 形式確認 |
| 9 | 原則7: p_is_active（3本）＋p_norm_on＋penalty 全11値の明示送信 | ✅ grep 機械確認 |
| 10 | cast/staff の弾き（cast=layout で /mine・staff=nav 非表示・最終防衛は RPC forbidden） | ✅ layout 分岐＋verify:nox-rls D3a 実測 |

## 補足

- スクリーンショット採取はこの環境の preview キャプチャ層が不調のため、DOM 検査トレース（CC）＋ Agoora のブラウザ目視で代替した（レンダリング自体は正常）。
- boolean 明示値規約（CLAUDE.md 原則7）: /master の set_product/set_seat は is_active を常に明示 boolean で送信することをコードで確認。
- close の idem_key 規約（原則9）: register/report の close・pay・reclose 呼び出しはすべて `crypto.randomUUID()` を送信。
