# NOX シフト深部（SD）設計書 v1（2026-08-21・Fable 5 設計ロック）

底本 = docs/tmp/sd0_survey.md ＋ sd0_basebundle.md（live 逐語）。

## 1. 裁定一覧

- **SD-1**: DP3-③ を上書き（wish_id は live 既在＝前提誤り）。原型対比表示は shift-board 改修に同梱
- **SD-2**: E8 番号訂正（#6=承認4段／#7=自動配置／#8=ライフサイクル／#9=マトリクス済み）
- **SD-3**: BANZEN donor 読取のみ許可（BIL-1 前例・変更/コピー禁止・要約採取済み）
- **SD-4**: **給与分母は confirmed のみ**（collect.ts:246 不変・中間 status は分母外）。コメント＋本書で明文化
- **SD-5**: donor「目標金額」鍵の実体=時給×見込時間の昇順（targetYen 未参照）。落とす対象として確認済み
- **SD-6**: v1 移植対象外 = 公休生成・2パス版・break_min（社労士域）・pref 3値（pref/break_min はパーク）
- **SD-7**: need = 帯 required − 既存割当（単層縮退）。shortages =（日×帯）
- **SD-8**: auto apply/clear は各1 RPC 内で原子。**入力は wish_ids**（時刻は wish 逐語）。空配列=完全 no-op。入替対象は auto∧planned のみ（proposed/confirmed は保持）。clear/入替時は wish を pending へ復元
- **SD-9**: 1日1枠は純関数＋RPC ガード担保・DB 部分ユニーク見送り（パーク）
- **裁定①**: status 3値 `planned→proposed→confirmed`＋期間管理。4段対応: 希望=shift_wishes → 管理者確認=planned → キャスト確認=proposed → 確定=confirmed
- **裁定②**: shift_periods 新設（draft/open/closed/published・RLS は staffing_needs 型=cast 0行）
- **裁定③**: position 次元は見送り＝純増起票（黒服シフトは独立レーン・E8-4-2 と整合）
- **裁定④**: 貪欲法は2鍵縮退（①min_month_min 未達 ②公平=見込分の少ない順）。モードB 優先度・社員最低日数・金額鍵は対象外
- **裁定⑤**: shift_rules 新設（店舗単位・max_consec_days/min_month_min・null=無制限）
- **裁定⑥**: shift_cast_confirm 新設（cast 初の shifts 書込 RPC・proposed→confirmed 一方向のみ）
- **裁定⑦**: migration 2分割（0101=スキーマ／0102=RPC）

## 2. スキーマ（mig0101）

- shifts: status CHECK 3値化・source(manual|auto, default manual)・period_id(null FK)
- shift_periods: 期間+wish_deadline+status 4値。0003 標準型（RLS SELECT のみ・フルrevoke→grant select）
- shift_rules: store_id unique・2列 null=無制限。同標準型

## 3. RPC（mig0102・全8本・全て billing gate/audit/二重防御）

| RPC | 実行者 | 要点 |
|---|---|---|
| shift_set（改修） | owner/manager | status 白名単 +proposed のみ。他は逐語 |
| shift_period_set | owner/manager | 期間 upsert |
| shift_period_remove | owner/manager | shifts 参照ゼロのときのみ |
| shift_propose | owner/manager | planned→proposed 配列一括・全か無か・重複除去 |
| shift_cast_confirm | **cast 本人** | proposed→confirmed 一方向。users 参照なし・insert なし |
| shift_auto_apply | owner/manager | wish_ids 一括 accept＝入替型・published 拒否・部分ユニークで二重生成物理防止 |
| shift_auto_clear | owner/manager | auto∧planned 削除＋wish pending 復元 |
| shift_rules_set | owner/manager | store 単位 upsert |

差戻し（proposed→planned）は shift_set の status 再送で可（新 RPC 不要）。

## 4. 純関数 `lib/nox/shift-autoassign.ts`（新規・BANZEN 縮退翻訳）

- 入力: period（日付範囲）・staffing_needs（帯別 required）・pending wishes・既存 shifts（当該範囲）・shift_rules・当月の確定/計画分（見込分計算用）・定休日関数
- 走査: 日→帯。need = required −（その日その帯に重なる既存 shifts 数）
- 候補: その日に pending wish がありその帯に重なる cast ∧ 同日未割当（SD-9）∧ max_consec_days 違反しない
- ソート2鍵: ①min_month_min 未達（rules null なら鍵①スキップ）②見込分昇順（公平）。同値は安定ソート
- 出力: `{ assignWishIds, shortages:[{date,band,short}], unassignedWishes, warnings }`＝プレビュー表示 → apply ボタンで shift_auto_apply(period_id, assignWishIds)
- 出た配置は「たたき台」＝undoAuto 導線（shift_auto_clear）を同画面に併置（DP3 申し送り）

## 5. UI（build タブ・教訓25=表示と状態は同コミット)

計画バー=shift_periods CRUD／募集締切表示／4段フロー表示は 3 status+wishes から実描画／一括「キャスト確認へ」=shift_propose／自動配置=プレビュー→適用→取消／配置ルール区画=shift_rules_set／/mine に cast の「確認する」=shift_cast_confirm。原型対比= shifts.wish_id→shift_wishes 参照（SD-1）。

## 6. verify 追随（CC 更新・実測で pin）

- billing ゲート名簿 188→+7（新6＋shift_set は既収載のはず=実測で確定）
- anon-guard: 新 RPC 6本の BLOCKED assert 追加（938→実測）
- rls: shift_periods/shift_rules の fixture（cast 0行含む）＋proposed status fixture
- grants 283: 自動回帰（revoke 漏れ検出）
- **shift_cast_confirm は verify ハーネスの実 cast signIn で runtime 検証必須**（prosrc緑≠実行成功）
- golden 不変: wage 5931 / labor-forecast 55233（forecastDay は status 非依存）ほか全値

## 7. パーク（台帳へ）

position 次元（黒服シフト）／pref 3値／break_min（社労士）／1日1枠の DB 制約／期間重複の DB 制約（v1 は RPC も画面も許容・警告のみ）
