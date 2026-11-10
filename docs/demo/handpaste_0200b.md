# 0200 追補（0200b）手貼り案内＝デモの reset（demo_org_reset）の投入表を 84 に戻す（2026-11-10・0200 フラグ便の f0 走査で発見）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0200（2026-11-10 適用済み＝関数 427・表 121）→ **0200b** → 0200 のフラグ便の 6 店 reset → 0201。

## 何が起きたか（読取）
- 0200 ★8 は demo_org_reset の投入配列 c_load の 1 行目（'stores','memberships',…,'terms_acceptances',）に staff_labor_confirmed／staff_labor_payments を足し、**同じ行の途中に行末コメント（-- ★0200 ★8 …）を差し込んだ**。元の行はコメントの後ろに 'referrers' 〜 'products' の 12 表が続いていたため、**その 12 表がコメントになった**。
- 効いている c_load＝**72 表**（文字列上は 84）。payload の 10 表（casts・seats・products・cast_ranks・product_categories・cast_quotas・shift_periods・shift_wishes・staff_shift_patterns・staff_shift_wishes）が「投入配列に無い」＝**demo_org_reset は必ず 'bad table'**。
- 影響＝デモ 6 店の reset（夜間の定期 reset・手動の reset）が失敗する。**キー検査は wipe より前**＝例外で tx ごと巻き戻る＝**デモのデータは消えない**（今の状態のまま残る・日付が進まない）。c_wipe（91 表）は無傷。
- 見逃した理由＝0200 の検証行「demo_org_reset wipe+load has staff_labor_payments」は prosrc の文字列を like で見ただけ（コメント内でも一致する）。試走（try_0200）は reset を実際に呼んでいなかった。**検知＝verify:nox-demo-reset（2-1 ほか 12 件が 'bad table'）と verify:nox-customers-keep ck(5-1)**。

## 本文（begin〜commit を 1 回 Run）＝docs/tmp/0200b_demo_reset_load_fix.sql
| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0200b_demo_reset_load_fix.sql（LF）→ 手貼り後に supabase/migrations/0200b_demo_reset_load_fix.sql へ収蔵 |
| sha256 | 先頭 16 桁 **961bd94c784f1d81**（143 行） |
| 翻訳元 | live pg_get_functiondef（0200 適用後・demo_org_reset md5 **a40dafba**）＋生成器 docs/tmp/gen_0200b.cjs（アンカー 1 か所＝壊れた 1 行を「コメント行／表の行／残りの表の行」の 3 行に分けるだけ・手打ちなし） |
| 変わるもの | demo_org_reset の本文 1 行だけ（表の並び・c_wipe・本体・署名・ACL は不変＝create or replace は ACL を保つ）。関数 427・表 121 は不変 |
| 試走 | docs/tmp/try_0200b.mjs（BEGIN…ROLLBACK・教訓128／132）＝結果は下 |

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明＋「72」の 2 行なら貼ってよい（84 なら既に直っている＝貼らない）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift demo_org_reset (expect a40dafba)', left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset' and left(md5(replace(prosrc, chr(13), '')), 8) <> 'a40dafba'
union all
select 'c_load tables now (72 = broken)', (select cardinality(regexp_split_to_array(trim(both ',' from regexp_replace(regexp_replace(substring(regexp_replace(prosrc, '--[^\n]*', '', 'g') from 'c_load constant text\[\] := array\[(.*?)\];'), '[^a-z_,]', '', 'g'), ',+', ',', 'g')), ','))::text from pg_proc where pronamespace='public'::regnamespace and proname='demo_org_reset');
```

## 検証クエリ（貼った後）＝docs/tmp/0200b_verify.sql（7 行＝貼り先証明＋6・配列はコメントを除いた本文で数える＝教訓137）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 427（不変） |
| table count | 121（不変） |
| c_load tables, comments stripped | 84 |
| c_wipe tables, comments stripped | 91 |
| c_load has casts/seats/products/referrers live | yes |
| demo_org_reset anon/authenticated/service_role | 0/0/1 |

## 試走の結果（2026-11-10 14:5x・本番 ref で BEGIN…ROLLBACK＝DB 変更 0）＝**7/7**
| 段 | 結果 |
|---|---|
| 教訓128／132 | begin;／commit; は行頭に 1 回ずつ・body に commit なし・begin の直後に lock_timeout |
| 直す前の live（再現） | casts の空配列だけの payload でも 'bad table' |
| 本文 → 検証 7 行 | 10／427／121／**84**／91／yes／0/0/1＝期待どおり |
| c_load／c_wipe（コメントを除いた本文） | 84／91 |
| 本番の payload（6 店）の表 53 | すべて c_load にある |
| 実際の reset（検証用 org A の行を payload に 31 表・demo_org_reset 'all'） | 通る・表別の件数（audit_logs／stock_logs を除く）と Σtotal（101,300）が前後で一致 |
| 2 回目（冪等） | 同じ |
| 関数・表 | 427／121（tx 内も後も不変）＝DB 変更 0 |

## 手貼り後（CC）
- supabase/migrations/0200b_demo_reset_load_fix.sql に収蔵・verify:nox-0200 に 0200b の段（c_load 84 をコメントを除いて数える）・verify:nox-demo-reset／customers-keep の件数 pin を 84 に張り替え。
- その後に 6 店 reset（JST 03:00〜04:00 を避ける）→ 撮影。0200b の手貼りまでは f0 の demo-reset が赤＝push しない。
- 0200 フラグ便の client は 0200b を待たずに作ってよいが、push は f0 の 2 連緑（＝0200b の後）。
