# 0201b 手貼り案内（売掛の正本・キャストの 18 歳判定・税込の表示＝2026-11-10 夜便で起草）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0201（合図待ち）→ 0201 のフラグ便 → **0201b**。0201 とは関数が重ならない（0201＝punch_self／kiosk_login／staff_punch／staff_pin_status＋新設 4・0201b＝下の 3 本）。

## 内容（★1〜★3・新設 0・表 0・作り直し 3＝同じ署名・ACL 不変）
- ★1 **set_store_receivable_policy**＝列 receivable_policy と同時に **settings_json.ar_enabled** を書く（disabled なら false・それ以外は true）。売掛の正本＝ar_enabled（ar_policy_ok・レジ・店舗設定が読む）。**データの移行はしない**＝食い違う店は一覧だけ（下の「試走の結果」）。
- ★2 **set_cast_sensitive**＝生年月日が 18 歳未満（JST の暦日で今日の 18 年前より後）なら **'under 18'**（cast_create の判定と同じ）。生年月日なし（null）は今どおり通す。
- ★3 **set_store_profile**＝白名単から **tax_inclusive_display** を外す（送られたら 'bad key'）。税込の表示は **stores.price_display が正本**（計算と開卓時の凍結の実体）＝表示の印は price_display から導く（client＝0201b のフラグ便で、店舗設定・レジ・給与の「内税表示」を price_display 読みに）。列 tax_inclusive_display は読まない列に（値は変えない）。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0201b_ar_age_taxdisplay.sql（LF）→ 手貼り後に supabase/migrations/0201b_ar_age_taxdisplay.sql へ収蔵 |
| sha256 | 先頭 16 桁 **83d59c5b78778d2a**（1009 行） |
| 翻訳元 | live pg_get_functiondef（0200b 適用後・scratchpad/live0201b）＝set_store_profile md5 f4347735・set_cast_sensitive 3f63388c・set_store_receivable_policy e2bdda47＋生成器 docs/tmp/gen_0201b.cjs（アンカー置換 3 か所・行の途中のコメント 0＝check_midline_comment.cjs） |
| 関数数・表数 | 不変（0201 の後＝431／121・0201 の前なら 427／121） |
| 試走 | docs/tmp/try_0201b.mjs（BEGIN…ROLLBACK・作り直した 3 本を実際に呼ぶ＝教訓138）＝結果は下 |

## 仮置き（相談役の裁定待ち）
1. ★1 列 receivable_policy は残し、ar_enabled と同時に書く（列を読む画面＝日報の売掛タブは client で ar_enabled 読みに直す）。列の廃止は後。
2. ★1 食い違う店のデータは直さない（一覧だけ）＝店の人が店舗設定で売掛を保存し直すと揃う。
3. ★2 生年月日なしは通す（null 拒否はしない＝既存の登録の流れを止めない）。
4. ★3 tax_inclusive_display は白名単から外すだけ（列の値はそのまま・読まない）。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || p.proname, left(md5(replace(p.prosrc, chr(13), '')), 8)
  from pg_proc p join (values ('set_store_profile','f4347735'),('set_cast_sensitive','3f63388c'),('set_store_receivable_policy','e2bdda47')) x(n, m) on x.n = p.proname
 where p.pronamespace='public'::regnamespace and left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m;
```

## 検証クエリ（貼った後）＝docs/tmp/0201b_verify.sql（7 行＝貼り先証明＋6）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 不変（0201 の後 431） |
| receivable_policy writes ar_enabled | yes |
| set_cast_sensitive under 18 | yes |
| set_store_profile whitelist without tax_inclusive_display | yes |
| 3 fns anon/authenticated exec | 0/3 |
| stores where policy and ar_enabled disagree | 件数（情報だけ・移行しない） |

## 試走の結果（2026-11-10 夜・本番 ref で BEGIN…ROLLBACK＝0200b 適用後の live・DB 変更 0）＝**9/9**
- 教訓128／132＝begin;／commit; は行頭に 1 回ずつ・body に commit なし・lock_timeout。教訓138＝作り直した 3 本をすべて実際に呼んだ。
- 検証 7 行＝10／427（0201 の前＝不変）／yes／yes／yes／0/3／4（情報）。※白名単の行は最初、監査の jsonb_build_object の同じ文字列に反応して no になった＝白名単の配列（v_keys）の中だけを見る形に直した（教訓137 と同じ形）。
- ★1 disabled＝列 disabled・ar_enabled false／customer_only＝列 customer_only・ar_enabled true／ar_policy_ok（レジの売掛）＝true。
- ★2 18 歳の誕生日の前日＝under 18／ちょうど 18 歳＝ok／生年月日なし＝ok。
- ★3 tax_inclusive_display＝bad key／ほかのキー（pay_day）は今どおり ok。
- 関数・表＝427／121 のまま（作り直し 3）。

**食い違う店（列は売掛を使う・ar_enabled が無い＝レジに売掛が出ない）＝4 店・一覧だけ（移行しない）**
| 会社 | 店 | 列 | ar_enabled |
|---|---|---|---|
| NOX-DEMO-ACE（デモ） | CLUB ACE | customer_only | なし |
| NOX-DEMO-LUNA（デモ） | CLUB LUNA | customer_only | なし |
| NOX-DEMO-NOIR（デモ） | CLUB NOIR | customer_only | なし |
| TEST CLUB | TEST CLUB | customer_only | なし |
- デモ 3 店は gen-demo に ar_enabled を足せば reset で揃う（client 便）。TEST CLUB は店舗設定で売掛を保存し直せば揃う。
