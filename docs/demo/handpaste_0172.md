# 0172 手貼り案内（Agoora 向け・2026-10-15 起草・便 GV-B W-11＝裁定349・351・355／356・380・381 の器を 1 本に・★相談役の裁定後に貼る）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/0172_settlement_terms_staff.sql` の全文を貼って Run（1 本だけ・所要 1〜2 分）。**0171 の後**に貼る。**相談役が 349〜351／356 を確定し、0172 の★指定を出すまで貼らない。**
2. 中身＝①日払いの種別 daily_pays.kind（settlement＝日次精算／advance＝前払・控除なし）＋daily_pay_issue に p_kind・daily_pays_of_run に kind 別の 3 列 ②扶養控除等申告書（cast_tax_profiles 2 列＋set_cast_dependents_form）③店設定 3 キー（精算方式・途中払い・送り返しの自動確定時間＝set_store_profile の白名単）④利用規約の同意（terms_acceptances＋terms_accept＋terms_accepted_version_ok）⑤スタッフの器 3 表（staff_contracts／staff_punches／staff_payroll_runs＝読取のみ）⑥memberships に電話・LINE ID（staff_create 7 引数・staff_update_profile 4 引数・メール無しは合成）。既存データの読み替えなし（既存の日払いは settlement・計算は client の次便まで不変）。
3. Success 後に §3 の検証クエリを貼り、**返った値（kind 列／settlement だけ／2 列／2 列／4 表／引数 3 行／md5 5 本／proacl 7 行／311・87）を CC へ貼る**。client（日払いの種別・扶養申告書の入力・店設定 3 項目・/terms/accept の開通ゲート・スタッフ登録の電話／LINE ID 保存）は適用後の便。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | supabase/migrations/0172_settlement_terms_staff.sql（HEAD の現物） |
| sha256 | `cea1f38458e899813b8a759be5374b6b00cf5f76d6a7d99b908091bf9252b40a`（77,638 B・922 行（台帳方式）／921（wc -l）・LF・CR 0） |
| 改行 | LF・CR 0 |
| 順序 | 0171（適用待ち）の後 |
| 生成器 | docs/tmp/gen_0172.mjs（写経元＝docs/tmp/0172_live.json＝2026-10-14 読取。live の 5 関数の md5（\r 込み）が pin と一致しないと生成しない） |

手元で再計算する場合（Git Bash）:

```bash
sha256sum supabase/migrations/0172_settlement_terms_staff.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: 増える列は null か既定あり（daily_pays.kind 'settlement'・dependents_form false・memberships tel／line_id null）＝payload に無くても reset は失敗しない。新 4 表は空のまま。settings_json の 3 キーは欠損＝既定（monthly／none／0）。
★route との順序: /api/staff/create は従来の 5 引数名で呼ぶ＝7 引数版は default で通る（p_tel／p_line_id は client 便で送る）。

## 2. 貼る

1. SQL Editor の新規タブに `0172_settlement_terms_staff.sql` の全文（冒頭コメントから `-- ===== end 0172 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

```sql
select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='daily_pays' and column_name='kind';   -- 1 行・text・'settlement'::text
select kind, count(*) from public.daily_pays group by 1;                                                                                     -- settlement だけ（既存行）
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='cast_tax_profiles' and column_name like 'dependents_form%' order by 1;   -- 2 行（boolean・date）
select column_name from information_schema.columns where table_schema='public' and table_name='memberships' and column_name in ('tel','line_id') order by 1;   -- 2 行
select tablename from pg_tables where schemaname='public' and tablename in ('terms_acceptances','staff_contracts','staff_punches','staff_payroll_runs') order by 1;   -- 4 行
select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('daily_pay_issue','staff_create','staff_update_profile') order by 1;   -- 各 1 行（p_kind／p_tel, p_line_id が末尾・旧版なし）
select proname, left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname in ('daily_pay_issue','daily_pays_of_run','set_store_profile','staff_create','staff_update_profile') order by 1;
  -- daily_pay_issue 94f989f9／daily_pays_of_run 37ff6ed0／set_store_profile 67e96c04／staff_create 8c2fef04／staff_update_profile b710ebae
select proname, proacl::text from pg_proc where proname in ('set_cast_dependents_form','terms_accept','terms_accepted_version_ok','daily_pay_issue','daily_pays_of_run','staff_create','staff_update_profile') order by 1;   -- 7 行・authenticated／service_role のみ（anon なし）
select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 311／87
```

返すもの: 10 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合→md5 pin 5 本の張替え（daily_pay_issue 7e9d29d0→94f989f9・daily_pays_of_run b81e8659→37ff6ed0・set_store_profile 2e7b4963→67e96c04・staff_create e69adbe4→8c2fef04・staff_update_profile f6633371→b710ebae）・名簿（関数 311・テーブル 87・'billing locked' 159）・anon-guard に 3 本（set_cast_dependents_form／terms_accept／terms_accepted_version_ok）・grants（新 4 表＝authenticated SELECT のみ）・rls（staff_* の本人行）→client→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**

## 4. 適用記録
- **2026-10-16 10:25 JST Agoora 手貼り（検証 12 項目すべて期待値＝相談役ブロック P172 前提）**→CC live 照合（便 P172 Q-0・docs/tmp/q1016_p172_q0.mjs・SELECT のみ）＝関数 **311**／表 **87**／'billing locked' **159**／md5 5 本（prosrc・\r 除去・先頭 8 桁）＝daily_pay_issue 94f989f9・daily_pays_of_run 37ff6ed0・set_store_profile 67e96c04・staff_create 8c2fef04・staff_update_profile b710ebae＝**pin と全一致**・列 5／新表 4（RLS 有効・authenticated=SELECT のみ）／proacl 7 本（authenticated＋service_role・anon なし）。pin 張替え＝0158 s-2／t-1・billing 段47-1・grants TABLES・名簿 mig0172 追随・新 suite verify:nox-p172（f0 121 段目）。
