# NOX 開発規約（CLAUDE.md）

ナイトワーク向け 会計・シフト・報酬管理。BANZEN（../makanai-shift）の実証パターンを翻訳して作る。
設計書の正本は docs/（データモデル・認可RLS・payOf 精密仕様・段階リリース計画・BANZEN流用マップ）。
用語置換の基本: tenant→org / auth_tenant_id→auth_org_id / auth_staff_id→auth_cast_id / staff→cast / makanai-shift→nox。

## DB 運用（DB-first, code-second）

- スキーマ・RPC を先に確定し、それからコード。マイグレーションは `supabase/migrations/` に連番。
- **マイグレーションは単一トランザクション**（begin〜commit）・冒頭コメントにマイグレーション名・翻訳元・検証クエリ。
- 適用は人間が SQL Editor に手貼り。適用後は `select prosrc from pg_proc where proname='...'` 等で検証
  （"Success" 表示だけを信用しない）。
- UUID は `gen_random_uuid()`（core）。pgcrypto が必要な関数のみ `set search_path = public, extensions`。

### テーブル追加の標準型（0003 で確立）

新規テーブルは必ず次の順で作る:

1. `create table` → インデックス
2. `alter table ... enable row level security` → SELECT ポリシー（書込ポリシーは原則作らない）
3. **`revoke all on table ... from public, anon, authenticated;` → 必要 grant のみ戻す（通常 `grant select to authenticated` のみ）**

背景: Supabase は新規テーブルに anon/authenticated へ ALL を既定 grant する。
**TRUNCATE は RLS が適用されない**ため、revoke を怠ると authenticated が全消しできる（0002 検証(4)で発覚）。
「RLS があるから安全」に依存せず、grant 面でも SELECT のみに締める。

### 二重防御（全 SECURITY DEFINER RPC）

1. 冒頭で `if auth_org_id() is null then raise exception 'forbidden'`（NULL 比較の素通り防止）。
2. `revoke execute ... from public, anon`（public だけでは無効・anon に直 grant されるため必ず両方）
   ＋ `grant execute ... to authenticated`。
   **内部専用**（audit_log_write 等）は `public, anon, authenticated, service_role` の**4ロール明示 revoke**・grant なし
   （Supabase 既定 grant は関数にも service_role を付ける＝0002 検証(3)で発覚・mig0004 で修正）。
3. ロール判定は `auth_role()` のハードコード（capability テーブルは作らない＝認可設計 §1.2 案A）。
4. お金が動く操作はサーバ再計算＋冪等キー＋トランザクション。
5. cast セルフ RPC のみ `auth_cast_id()` 本人チェック（manager 代理操作には入れない）。

### 認可・RLS

- 認可の真実は memberships（user × store × role）。1ユーザー1アクティブは部分ユニークインデックスで担保
  （F4 のマルチ店舗切替はインデックス drop ＋ ヘルパー差し替えのみ）。
- 標準店スコープ: `org_id = auth_org_id() and (auth_role()='owner' or store_id = auth_store_id())`。
- cast プライバシー3パターン（認可設計 §2.3）: 金額系は `auth_role()<>'cast' or cast_id=auth_cast_id()` 等。
- users↔memberships のポリシー相互参照は Postgres RLS の無限再帰＝禁止（memberships ポリシーから users を引かない）。

## お金（payOf）

- `lib/nox/pay.ts` は DB を知らない純関数。丸めは `lib/nox/money.ts`（roundYen/roundPt1）に集約
  （税理士 floor 指定なら roundYen 1箇所差替）。
- お金は整数（円）・浮動小数禁止。シミュ係数は `1−源泉率`（0.8979 をハードコードしない）。
- 玲奈ゴールデン2系統（verify:nox-pay T1a=pt除外5170 / T1b=モック忠実5931）。正は本指名商品pt 込み。
- F2 差し替え点（源泉日数・二重控除ガード・売上率テーブル・丸め）は pay.ts 冒頭コメントに記録済み。

## verify

- 機能完了ごとに verify スイート緑を確認してからコミット（`npm run verify:nox-pay` 等）。
- anon BLOCKED（"permission denied for function"）・他店0行・cast 0行を能動 assert。
- 内部専用 RPC は anon かつ authenticated の両方で BLOCKED を assert。

## コミット規約

- co-author トレーラー禁止。スラッシュ始まりのメッセージ禁止。パス風トークン（例 /wage）を入れない。
- Bash の `git commit -m` で書く（PowerShell here-string 不可）。
- push はフェーズグループ完了後のみ。mig のコミットは「適用＋検証確認後」。

## 環境メモ

- Dropbox 配下のため `node_modules` / `.next` に `com.dropbox.ignored=1` ストリームを設定（新クローン時に再設定）。
- mock/ はモック実体（計算仕様の正本・ビルド対象外＝tsconfig exclude 済・参照専用）。
