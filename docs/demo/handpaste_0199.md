# 0199 手貼り案内（裁定459・M-114＝LINE 通知の種類ごとの保存＝set_store_profile の白名単に settings_json.line_notify・2026-11-09 起草）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0198（2026-11-09 適用済み・関数 422／表 120）→ 0198 のフラグ便 → **0199**。他の変更は同乗させない（作り直し 1・新設 0・表 0＝関数数は不変）。

## 内容（1 点）
- set_store_profile（owner 限定・店ポリシー）の白名単に `line_notify` を追加。受理＝裁定459 の種類を鍵に持つ **boolean の object だけ**（鍵名は client の lib/nox/line/notify-kinds.ts の既存＝`notice`／`shift_published`／`shift_changed`／`remind`）。知らない鍵／boolean 以外／object 以外＝`'bad line_notify'`。送られた object で置換（鍵の欠けは client の既定）。**DB 既定値なし**＝鍵が無ければ client（lineNotifyOf）が裁定459 の既定（お知らせだけ ON・シフト系 OFF）で動く。
- M-114 の client の既定＝lineNotifyOf(null)＝`{ notice: true, shift_published: false, shift_changed: false, remind: false }`＝裁定459 どおり（verify:nox-benf 4-1 で pin）。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0199_line_notify.sql（LF）→ 手貼り後に supabase/migrations/0199_line_notify.sql へ収蔵 |
| sha256 | 先頭 16 桁 **cbbe84f7e91db680**（915 行・89715 B・LF）＝0198 適用後の live（set_store_profile md5 607313c1＝0198 で不変）から再生成＝0197b 時の下書きと同一 |
| 翻訳元 | live pg_get_functiondef（2026-11-09・0198 適用後・docs/tmp/dump_live_0192.mjs→scratchpad/live0199）＋生成器 docs/tmp/gen_0199.cjs（アンカー置換 2 か所・手打ちなし）・検証＝docs/tmp/0199_verify.sql |
| 試走 | docs/tmp/try_0199.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数と set_store_profile の md5 を tx の外で前後に）＝2026-11-09 **10/10・DB 変更 0**（4 鍵 ok／1 鍵 ok（置換）／知らない鍵 bad／boolean 以外 bad／object 以外 bad／{} ok／manager forbidden／白名単外 bad key／audit に before・after／関数数不変） |
| 関数数・表数 | 422／120 → **422／120**（不変） |

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（md5 は 2026-11-09 の本番＝0198 適用後の値）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift set_store_profile', coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='set_store_profile' and left(md5(replace(p.prosrc, chr(13), '')), 8) <> '607313c1'
union all
select 'already applied', 'yes' from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile' and prosrc like '%''line_notify''];%';
```

## 本文
docs/tmp/0199_line_notify.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0199_verify.sql（7 行＝貼り先証明＋6 行・期待値は各行の見出しに）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 422（不変） |
| set_store_profile count | 1 |
| whitelist has line_notify／bad line_notify guard | yes／yes |
| set_store_profile anon/authenticated exec | 0/1 |
| no store has line_notify yet | 0（貼った直後＝client が保存するまで） |

## 手貼り後（CC＝0199 のフラグ便）
- MIG_0199_APPLIED=true・収蔵・verify:nox-0199（白名単・guard・md5）・pin（0158 の set_store_profile md5 607313c1 → 新値・store-systems の白名単 76→77 キー）・client＝店舗設定 › LINE 連携の種類ごとの保存ボタン（LINE_NOTIFY_SAVE_PENDING_NOTE を外す・set_store_profile に {line_notify: {...}}＝4 鍵を常に明示＝原則7）・f0 2 連 → push → 撮影 375／390。
