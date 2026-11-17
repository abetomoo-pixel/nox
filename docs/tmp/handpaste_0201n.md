# 手貼り 0201n_cast_roster（起草 2026-11-17・CC・貼らない・試走もしていない）

1. SQL Editor の URL の ref が本番（hiqbfagmkrdpmlqhkmsu）であることを目で確かめる。
2. 事前確認＝docs/tmp/0201n_precheck.sql を流す（期待：has_register_branch が 2 行とも true・roster_fn 0・close_ok_fn 1）。
3. 本文＝docs/tmp/0201n_cast_roster.sql を 1 回 Run（単一トランザクション）。
4. 検証＝docs/tmp/0201n_verify.sql（期待は各行の注記）。返りをチャットと CC の両方に。
5. ★貼った直後から、レジの許可だけのキャストはレジのキャストの一覧（指名・席の格子）が空になる＝画面の直し（client 便・MIG_0201N_APPLIED＝キャストの立場は register_cast_roster を呼ぶ）と同じ日に。順は「client をフラグ false で先に push → 貼る → フラグ true の便」。
6. 戻す SQL（必要なとき）：casts_select と daily_reports_select を旧の qual（auth_cast_can_register の枝あり）で作り直し・register_cast_roster を drop。旧の qual は docs/tmp/read_rls_register_1117.cjs の出力（2026-11-17）にある。
