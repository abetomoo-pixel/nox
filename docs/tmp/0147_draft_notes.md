# 0147_draft_notes（パス 1・起草）

- ファイル: supabase/migrations/0147_store_settings_keys.sql（未追跡）
- sha256: e99b49bb8cd8560a7e321757431aea8accc55981d56415a74bd13d2f2e55065a
- 行数: 320（ヘッダ 62 行＋関数 246 行＋revoke/grant/UPDATE/commit）
- 写経元: docs/tmp/0147_live_def.sql（＝0147_pre.md §1 の pg_get_functiondef 122 行・貼付前 md5(prosrc) 07d114ff0b570462c3330b87497fc17c）
- 関数本体の行数: live 122 行 → 246 行（追加 124 行・削除 0・変更 1 行＝live 11 行目の末尾 '];'→','）

## ★ 一覧（mig 内の行番号）

| ★ | 内容 | 写経元 | mig の行 |
|---|---|---|---|
| ★1 | v_keys の array[...] に 12 キー追記（live 11 行目の '];'→','＋3 行） | live 10〜11 行（v_keys） | 73, 74, 75, 76 |
| ★2 | biz_type: jsonb_typeof 'string'（text 4 キーの行型＝live 76 行）→ enum 検証（mig0042 0042_norm_expansion_okuri_base.sql:92 の `not in (...) → raise`）→ before/after/jsonb_set（live store_code ブロック） | 0042:92／live store_code ブロック | 89, 189, 190, 191, 192, 193, 194, 195, 196 |
| ★3 | billing_mode: ★2 と同型・'bad billing_mode' | 同上 | 90, 198, 199, 200, 201, 202, 203, 204, 205 |
| ★4 | setup_done＋制度 9 の boolean 検証（変数宣言 10 行＋ブロック 10×8 行） | live show_open_status ブロック（93〜100 行） | 91〜295（90 行） |
| ★5 | 埋め戻し UPDATE（既存行のみ・冪等） | 相談役ブロック逐語 | 314, 317, 318 |

## ★ 以外で live と違う行
- 関数末尾 `end $function$` → `end $function$;`（0144 と同じく文として閉じる・pg_get_functiondef は文末の ';' を含まない）。
