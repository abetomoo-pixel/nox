# 0187 手貼り案内（Agoora 向け・2026-10-27 起草・便 CASH＋便 EXT＋remove_store_special_day の課金ゲート）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で、まず下の **事前確認 SQL** を貼って Run → `missing` が空（0 行）なら、**supabase/migrations/0187_cash_ext_menu.sql** の全文を貼って Run（1 本だけ）。
2. **営業時間外に貼る**（check_lines の CHECK の差し替えで表のロック＝伝票の書き込みが数秒待たされる・check_pay の DROP→CREATE の間は入金が失敗する）。
3. Success の後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待値は下の表）。Success の表示だけでは適用の証明にならない（恒久注意28）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0187_cash_ext_menu.sql（2,011 行・169,173 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **fcb5ff0b6894e67d** |
| 翻訳元 | live pg_get_functiondef（2026-10-27 16:0x／17:3x・0180〜0186 適用後）＋生成器 docs/tmp/gen_0187.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換） |
| 構文検査 | scripts/mig-check.mjs＝parse ok（statements 22）・$function$ の対応 ok（11 本）・sql の ext_menu_pick ok（plpgsql 10 本は下の試走で本番の構文検査を兼ねる） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0187_rollback.mts・NOX-VERIFY-A1）＝**15/15 OK**・関数数 382→384 |
| 営業中に貼ってよいか | **営業時間外**（上の 2.） |

**中身**
- ★1 便 EXT（Agoora 確定 10/27（2））: 開卓時に凍結する延長パターン＝その営業日の曜日・席種の行を**時間帯を問わず全部**（各行に時間帯 band）。延長を足すとき＝その延長の開始時刻の時間帯に合う行（時間帯つき→選択中のパターン→既定）。手動で行を指定したときはその行。自動延長はブロックごと。席移動（VIP）の再凍結も同じ形。**0187 前に開いている伝票（旧い凍結）は従来どおり**。新設の内部ヘルパー 2 本（ext_menu_build／ext_menu_pick）。
- ★2 便 CASH（Agoora 確定 10/27＋補遺・T15 の回答待ちの仮置き）: 現金割引の基準＝店設定 pay_discount_base（**合計から＝既定**／小計から）。合計から＝税・サ込みの残額×率を**最後に**引く・小計から＝税・サの前の小計から引いてから税・サ。**今の過大な割引（サ・税まで縮む）を直す**。入金ごとの上書き（率を指定／額を指定／なし）＝check_pay に引数 2 つ（DROP→CREATE）。**入金済みの伝票の額は変えない**（過去の行を書き換えない・再計算しない）。
- ★3 remove_store_special_day に課金ゲート（set_store_special_day と揃える）。

## 事前確認 SQL（貼る前・SELECT のみ）＝ plpgsql が参照する列と関数の存在

```sql
select 'nox-project-proof', count(*)::text from public.orgs
union all
select 'missing', string_agg(x, ', ') from (
  select t || '.' || c x from (values
    ('checks','ext_menu_snap'),('checks','ext_rule_id'),('checks','ext_fee'),('checks','ext_min'),('checks','ext_unit'),('checks','time_per'),
    ('checks','set_min'),('checks','started_at'),('checks','category_id'),('checks','service_pre'),('checks','people'),('checks','store_id'),
    ('check_lines','fee_kind'),('check_lines','kind'),('check_lines','block_no'),('check_lines','tax_category'),('check_lines','fee_rate'),('check_lines','time_auto'),('check_lines','pay_group'),
    ('pricing_rules','time_from_min'),('pricing_rules','time_to_min'),('pricing_rules','is_default_ext'),('pricing_rules','billing_unit'),('pricing_rules','duration_min'),
    ('pricing_rules','dow_mask'),('pricing_rules','rank_id'),('pricing_rules','category_id'),('pricing_rules','seat_kind'),('pricing_rules','priority'),
    ('stores','settings_json'),('check_referrals','burden'),('store_special_days','day')
  ) v(t, c)
  where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = v.t and i.column_name = v.c)
  union all
  select f from (values ('biz_minutes_of'),('billing_writable_of'),('check_round_amount'),('check_recalc'),('audit_log_write'),('check_tax_round'),('assert_day_open'),('biz_date_of')) v(f)
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v.f)
) m;
```
期待＝`nox-project-proof 9`・`missing` が **null（空）**。何か出たら貼らずに CC へ。

## verify の期待値（Success の後に末尾 ===== verify ===== を貼る）

| k | 期待 |
|---|---|
| nox-project-proof | 9 |
| fee_kind check has pay_discount_total | true |
| helpers 2 (acl postgres only) | 2 |
| check_pay args | **13**（1 本だけ＝旧い 11 引数は DROP 済み） |
| check_pay acl | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}（並びは違ってよい・anon なし） |
| has 0187 (8 fns) | 8（check_group_due／referral_recalc を含む・check_open〜remove_store_special_day のうち ★0187 の語を持つ本数） |
| md5 ext_menu_build | 52acaa4a |
| md5 ext_menu_pick | 6600a25c |
| md5 check_open | c9f322fd |
| md5 check_move_seat | bcb9276a |
| md5 check_extension_add | e08c0d83 |
| md5 check_time_charge_apply | 020c079d |
| md5 check_group_due | 7948247d |
| md5 check_pay | 08933d4c |
| md5 set_store_profile | 4cf860c3 |
| md5 referral_recalc | b4a8291b |
| md5 remove_store_special_day | 7201f28a |

（md5＝本体の CR を除いた md5 の先頭 8 桁。試走で本番の定義から取った値）

## 試走で確かめたこと（docs/tmp/t0187_rollback.mts・15/15）
- 回帰＝直近 400 伝票の pay_group ごとの due が適用前後で同じ（入金済み・旧い凍結とも額を変えない）。
- EXT① 凍結は時間帯を問わず全行（別の曜日・VIP は入らない）・全行に band。② 手動の既定＝今の時間帯の行（開卓時の既定より時間帯の行）。③ 行の指定＝その行。④ 旧い凍結＝従来の ext_fee。⑤ 自動延長＝ブロックの開始時刻の時間帯（#1 既定 ¥2,000／#2・#3 時間帯の行 ¥1,500）。⑥ 自動延長・旧い凍結＝全ブロック従来。⑦ 席移動（旧い凍結の伝票・卓→VIP）＝VIP の再凍結は新しい形・既定は VIP の行。
- CASH① 合計から＝小計 10,000・サ 30%・外税 10%＝14,300 → 現金 10% 1,430 を最後に引く＝12,870（従来の過大 12,255 にならない）。② 小計から＝1,000 を引いてから税・サ＝12,870。③ 丸め 100 円切捨＝合計から 12,870／小計から 12,800。④ 額を指定 1,000・額 0＝割引なし。⑤ 率を指定 5%＝715・率 101＝bad disc_rate・残額超え＝bad disc_amount。⑥ 店設定 pay_discount_base＝total／subtotal・不正値は bad pay_discount_base。
- remove_store_special_day の課金ゲート・anon は check_pay を BLOCKED・内部 2 本は anon も authenticated も BLOCKED。

## 適用後に CC がやること
1. 本番の読取で照合（sha16・md5 11 本がファイルと一致・関数数 382→384・check_pay の引数 13 の 1 本・proacl）。試走と同じ t0187 を mig を流さずに本番の定義で（BEGIN…ROLLBACK・残留 0）。
2. 0187 を収蔵（未追跡→追跡）・フラグ **MIG_0187_APPLIED** を true（client＝入金モーダルの割引欄・店設定「支払方法の調整」と割引対象・延長のご案内・M-17 の赤字の額）・pin 張替え（関数数・課金ゲートの名簿＝内部 2 本は B 側・md5）・f0 2 連・golden 不変。
3. live＝デモ MUSE（現金 10%）の割引行が「現金割引 10%」で合計から引かれる・小計からに切り替えて同じ伝票の形・延長のご案内（今の時間帯の延長だけ・タップで追加）・席移動で VIP の延長額・主ボタン中央・390。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
