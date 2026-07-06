# NOX F2b セキュリティセルフレビュー報告書（相談役レビュー用）

> 作成: 2026-07-06（F2b 締め・小規模）。対象: mig0015（cast_sensitive／cast_tax_profiles＋RPC3本）・verify 追記。
> レビュー通過＋verify 全緑で F2b を push（F2b は小フェーズ・UI は F2c/F2d に合流のため UI サブフェーズなし）。

---

## 1. 成果物と検証状態

| 成果物 | 検証 |
|---|---|
| mig0015: cast_sensitive（機密分離・RLS 有効＋ポリシー0＋grant0）／cast_tax_profiles（パターン2） | anon-guard 段10・rls F2b 節16本・grants G7 |
| RPC: set_cast_sensitive（manager 以上・平文非リークマスク audit）／get_cast_sensitive（owner＋cast 本人・全閲覧ログ）／set_cast_tax_profile（manager 以上・通常 audit） | prosrc/ACL 実測・T6a 分岐・null 消去検出 |
| 設計書: データモデル §2.2・認可設計 §2.4 に F2b 実装確定を追記 | — |
| **再実行結果** | typecheck ✅・**verify:f0 全緑 567 assertions**（pay 83／shift-time 44／punch-match 75／anon-guard 81／rls 246／grants 38） |

## 2. 二重防御・機密設計チェックリスト

| 観点 | 状態 | 根拠 |
|---|---|---|
| cast_sensitive の物理封鎖（T1a） | ✅ | RLS 有効・**SELECT ポリシー0**・**grant0**＝anon/authenticated/owner/manager/cast 本人の全ロールで直 SELECT が permission denied（rls で各ロール実測）。取得は get_cast_sensitive のみ |
| grants G7 positive assert（T5a） | ✅ | cast_sensitive の authenticated 権限=0行・ポリシー=0行を DB 直結で固定（「書き忘れでない」ことを機械保証） |
| RPC 冒頭 null guard（原則1） | ✅ 3本 | auth_org_id() is null → forbidden。get の cast 分岐は auth_cast_id() is null も fail-closed |
| ロール分岐（T6a） | ✅ | get＝owner＋cast 本人のみ（manager/staff 拒否）／set＝manager 以上。cast 他人 get 拒否・クロス org 拒否を実測 |
| 全閲覧ログ（T7a・原則6 の唯一の例外） | ✅ | get_cast_sensitive は読取だが §2.4 が記録要求＝audit 'read_cast_sensitive'（値なし）。owner 閲覧・**cast 本人自己閲覧も +1**（例外なし）を実測 |
| 平文非リーク（逸脱） | ✅ | set の audit は before/after 値なし・after={fields_changed:[…]}。after_json に real_name 平文が含まれないことを実測 |
| null 消去検出（実値比較） | ✅ | fields_changed は before 行との `is distinct from` 比較＝null 上書き（機密消去）も changed に載る。同値 upsert は空配列。実測固定 |
| revoke public,anon＋grant authenticated（原則2） | ✅ 3本 | anon-guard 段10 が全数プローブ |
| 全書込 RPC の audit（原則6） | ✅ set 2本 | set_cast_sensitive／set_cast_tax_profile とも perform audit_log_write |
| search_path（補強2） | ✅ | 3本とも public のみ（extensions 不要＝攻撃面を広げない）。F2d 暗号化導入時に public,extensions へ変更する TODO を RPC ヘッダーに明記 |
| mynumber（T2a） | ✅ | mynumber_enc bytea 列は F2b では null 運用（暗号化は F2d・鍵管理確定後） |
| casts.employment 残置（T3a） | ✅ | drop せず・payOf 正本は cast_tax_profiles.mode。real_name/birthday は casts に元々無く**移行不要** |

## 3. 指摘・教訓（F2b 新規）

| # | 事象 | 教訓・恒久対策 |
|---|---|---|
| F2b-1 | **plpgsql の `text[] || 'literal'` が `array || array` に解決され `malformed array literal: "real_name"`** で set_cast_sensitive が失敗（初回 verify で捕捉） | Postgres の `\|\|` は `anyarray\|\|anyarray` と `anyarray\|\|anyelement` の両候補があり、右�operand が unknown（文字列リテラル）だと配列同士連結に解決され、リテラルを配列としてパースして失敗する。**text array への要素追加は `array_append(arr, elem)` を使う**（`\|\|` に頼らない）。verify がなければ本番の機密書込が全滅する重大バグだった＝「Success 表示を信用せず動作 assert」の価値の実証 |
| F2b-2 | **verify signIn のレート制限 → `process.exit(1)` が退職回帰テストの `finally`（membership 復元）を飛ばし、managerA1 が is_active=false のまま残留 → 次 run 以降が全 store 不可視で連鎖クラッシュ** | 認証を**ユーザー単位でセッションキャッシュ化**（1 run 1認証・signOut を無害化）。①認証回数が約6回に激減しレート制限を回避、②退職回帰中の再認証が消え process.exit による finally スキップ＝破損再発を根絶。RLS は毎クエリで auth ヘルパーを live 評価するため退職回帰（membership flip→0行）は正しく動く |
| F2b-3 | mynumber 実登録・暗号化は F2b スコープ外（T2a/T8a＝箱まで） | F2d（税理士フロー・鍵管理確定）で pgp_sym を導入。search_path 変更 TODO を残置 |

## 4. F2c/F2d への申し送り

- **F2c**（給与確定・#4）：payOf 入力 object をサーバが組む——daily.sales=get_cast_sales／lateN・absentN=punch-match+punch-io／マスタ=comp_plans 系6テーブル／taxMode=cast_tax_profiles.mode。再計算→payslips.breakdown_json 凍結。#32 出勤インセンティブの独立行を受け入れる構造とする。専門家ゲート暫定既定（#7 源泉=出勤日数・#10 丸め=round・#11 雇用係数=1.0）。service_role 監査経路（#6）を決定。penalty_config の grace 3列を punch-match config へ供給。
- **F2d**（源泉・インボイス・支払調書）：cast_sensitive の mynumber 暗号化（pgp_sym・鍵管理確定・search_path=public,extensions へ変更）＋cast_tax_profiles.invoice/reg_no を使用。
- **UI**：cast_tax_profiles の税区分設定・cast_sensitive の機密登録 UI は F2c/F2d の給与文脈で /master or castMng に追加（F2b では UI を作らない＝空箱回避）。
