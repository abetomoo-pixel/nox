# NOX 運用 runbook

> 純増⑤ 段3 で新設（2026-07-27）。**本番構築・障害復旧・既知の不安定要因**を1枚に集約する運用の正本。
> 設計の正本は他 docs（データモデル／認可 RLS／payOf 精密仕様）、mig の適用順と特記は
> `NOX_本番手貼りリスト.md`、裁定の記録は `NOX_裁定台帳.md`。ここは「動かす／戻す」ための手順に絞る。

---

## ① 本番構築手順

### 1-1. 前提（プラン）
- **Supabase は Pro プラン確定**（日次自動バックアップ／PITR はオプション）。
  → バックアップ体制は**二層**：**一次＝Supabase の自動バックアップ／PITR**（データ本体）、
  **二次＝`npm run backup:schema`**（スキーマ定義のテキスト・②参照）。

### 1-2. DB（先）→ コード（後）の順で構築する
**★順序厳守**：先にコードを出すと、未適用の RPC/列を UI が呼んで 500 になる。

1. **本番 Supabase プロジェクトを作成**し、SQL Editor を開く。
2. **`NOX_本番手貼りリスト.md` に従って mig を 0001 から連番どおり欠番なく手貼り**する。
   - **Run 前に URL の ref（プロジェクト ID）を目視確認**（貼り先ミス防止）。
   - 検証クエリの先頭に**貼り先証明** `select 'nox-project-proof', count(*) from public.orgs;` を含める。
   - **"Success" 表示だけを信用しない**。手貼りリストの特記（非idempotent・supersede・
     ACL 再適用・`notify pgrst, 'reload schema';` の要否）を都度確認する。
   - 特に注意：**0049**（再実行厳禁）／**0057→0058**（順序必須・0058 が 0057 を supersede）／
     **0062・0063**（`set_product` の署名変更＝**旧版 drop ＋ ACL 再適用が必須**。
     PostgreSQL は署名が変わると ACL を引き継がない）。
3. 適用後、**`npm run backup:schema` を本番向けに1回実行**して定義のスナップショットを取る（②参照）。
4. **コードのデプロイ**（Vercel 等）。

### 1-3. 本番の環境変数＝**3キーのみ**
| キー | 本番 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **必要** | クライアント／サーバ両方 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **必要** | 公開鍵（anon 相当） |
| `SUPABASE_SECRET_KEY` | **必要** | service_role。**アプリで使うのは `lib/supabase/admin.ts` の1ファイルのみ**（payroll finalize/reopen・print・provision 等の route 経由） |
| `SUPABASE_DB_URL` | **置かない** | Postgres 直結。`verify:nox-grants` と `backup:schema` の**ローカル運用専用** |
| `SEED_PASSWORD` | **置かない** | seed/verify 専用。**本番に seed は流さない**（CLAUDE.md 規約） |

### 1-4. デプロイ後の確認
- ログイン →（owner）ホーム／レジ／マスタが 500 なく開くこと。
- レジで 1 伝票を open → 明細追加 → 会計 → 締め（**在庫トリガが `stock_logs` に `sale` を積む**ことを master の在庫欄で確認）。

---

## ② 障害復旧

### 2-1. データの復旧（一次）
**Supabase Pro の日次自動バックアップ／PITR を使う**（ダッシュボード操作）。
アプリ側・repo 側にデータのバックアップは持たない（機微情報を手元に置かない方針）。

### 2-2. スキーマ定義の突合・復旧補助（二次）
```bash
npm run backup:schema
```
- 出力＝**`backups/nox-schema-<YYYYMMDD-HHmmss>.sql`**（`.gitignore` 済み＝**コミットしない**）。
- 収録＝①テーブル DDL ②制約（PK/UK/FK/CHECK）③インデックス ④**RLS 有効フラグ＋全ポリシー逐語**
  ⑤**全関数（`pg_get_functiondef`＝RPC の実体）** ⑥トリガ定義 ⑦grants（テーブル/関数 ACL）。
- **★データ行は1件も含まない**（機微情報を手元ファイルに残さない設計）。
- 用途＝**手貼り運用ゆえの「repo の mig 群」と「live の実体」の乖離チェック**。
  例：`set_product` の引数が14個か／`product_categories_select` の USING 句／
  トリガ `checks_stock_void` の WHEN 句が生きているか、を1ファイルで確認できる。
- 実行には `SUPABASE_DB_URL` が必要（対象プロジェクトの接続文字列に差し替えて実行する）。

### 2-3. 部分復旧の考え方
- **関数だけ壊れた**＝該当 mig を再適用（手貼りリストの「再適用可」注記を確認）。
- **列・テーブルが壊れた**＝一次バックアップからの復元が原則（DDL だけ戻してもデータは戻らない）。

---

## ③ 既知の不安定要因と対処

### 3-1. dev auth の ES256 `kid <nil>` 間欠（Supabase 側事象）
- **症状**：`admin.auth.admin.createUser` が
  `unrecognized JWT kid <nil> for algorithm ES256` を間欠的に返す。稀に
  **サーバ側では作成成功しているのにクライアントへ error を返す**（succeeded-but-errored）。
  その場合リトライが `already been registered` で落ち、**孤児 auth ユーザー**が残る。
  ひどい時は `deleteUser` / `listUsers` など admin API 全般が不安定になる。
- **対処（実装済み）**：`scripts/verify-nox-anon-guard.ts` の `createUserWithRetry`
  ＝ kid<nil> のみ**有界リトライ（最大3回・2s→5s）**＋
  **succeeded-but-errored の lookup 救済**（先行が kid<nil> のときのみ `already registered` を
  email lookup で成功に読み替え。初回からの重複は従来どおりエラー＝本物の回帰を隠さない）。
- **それでも赤いとき**：孤児 auth を掃除してから再走する。
  `nox-verify-*`（seed の9アカウント以外）を service role で削除 → `npm run verify:f0`。

### 3-2. `audit_logs` 肥大で `seed_marker` が窓外へ押し出される
- **症状**：`verify:nox-rls` の `ownerA audit_logs ≥1行（seed_marker）` が `got 1000行` で落ちる。
  `audit_logs` は append-only ＝ verify を何度も回すと膨らみ、
  **PostgREST の既定 1000 行窓**から `seed_marker` が押し出されるため。
- **対処**：verify org の**`seed_marker` 以外**を削除する（`seed_marker` は残す）。
  **★pg 直結（`SUPABASE_DB_URL`）で `delete` する**こと。
  PostgREST 経由で `in()` に1000要素を渡すと **URI 長超過で無言の no-op** になる。

### 3-3. クライアントと DB サーバの時計スキュー
- **症状**：`verify:nox-rls` の B4 時間料金で `elapsed_min` が期待より 1 分小さく落ちる。
  `rewind()` は**クライアント時刻**で `started_at` を置き、経過は**サーバ `now()`** で floor するため、
  クライアントが進んでいると 100 分巻き戻しでも 99 になる（実測スキュー ≈215ms）。
- **対処（実装済み）**：`rewind(cid1, 101)` で 1 分の余裕を持たせた。
  期待値は不変（`blocks=2` の成立区間は `v_d∈[91,120]` ＝ 100 も 101 も同区間）。

### 3-4. npm audit の残件（上流固定）
- **現状**：`npm audit fix` の**非破壊分のみ適用済み**（next 15.5.20→15.5.22 等・major 混入ゼロ）。
- **残件＝上流固定で今は手が無い**：
  - `postcss` / `sharp` は **Next 自身が固定**（`next@latest`(16.2系) でさえ `postcss 8.4.31`）。
    audit の「全解決」提案は **`next@9.3.3` への破壊的ダウングレード**＝**採らない**。
  - `eslint` 系は **`eslint@10`(major)** か **`eslint-config-next@12`(ダウングレード)** 要求＝**採らない**。
- **運用**：**next のマイナー追従を定期タスク化**する（追従のたびに `npm run verify:f0` フルで回帰確認）。

### 3-5. 運用ルール：verify 実行中はデモ org を触らない
- `verify:nox-anon-guard` の段37 は **service role による全表カウントの前後差分**
  （`checks`/`seats`/`kiosk_devices`/`kiosk_sessions`/`staff_pin`）で非汚染を確認している。
- **`NOX-DEMO` org を verify 実行中に操作すると、この差分が崩れて偽陽性**になる。
  → **verify 実行中はデモ org を触らない**（テーブル分離は不要・運用ルールで足りる）。

---

## ④ 裁定記録：Service Worker は採用しない（PWA は SW なし）

- **決定**：PWA 化は **manifest／アイコン／`themeColor`／`appleWebApp`（`display: standalone`）まで**とし、
  **Service Worker は導入しない**。
- **理由（POS の整合性を優先）**：
  1. NOX は**会計＝money-core** を扱う。SW のキャッシュは**古い伝票・古い在庫・古い価格表**を
     見せうる。POS で「画面の数字が実際と違う」は最も避けたい事故。
  2. 会計 RPC は**サーバ権威**（`check_recalc` 等）。オフライン書込を許すと
     **冪等キー・在庫トリガ・バック計算の一貫性**を壊す。
  3. kiosk は**店内 Wi-Fi の常時接続前提**（`kiosk_register_state` は操作起点の読取契約）。
     オフライン耐性の要求が実運用上ほぼ無い。
- **得られるもの（SW 無しでも成立）**：ホーム画面へ追加 → **全画面（standalone）でタブレット常設**。
- **再検討条件**：オフライン運用が実要件になったとき（そのときは**読取専用キャッシュに限定**し、
  money 系は必ずネットワーク必須にする設計から始める）。
