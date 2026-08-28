# 法務追加実測（L） — L1〜L6 回答受領後の現状照合

読み取り専用調査（2026-08-28）。**設計・是正はしない（c 項は列挙のみ）**。dev DB = mig0001〜0110。
回答正本 = `docs/expert/NOX_弁護士回答_L1-L6_2026-08-28.md`。関連裁定 = 87/88/89・起票#36/#37。

## 結論（3行）

1. **マイナンバーは既に L5 推奨形に近い**＝`cast_sensitive.mynumber_enc bytea`（通常 PII と同居はするが列は分離）・
   `pgp_sym_encrypt`・鍵は **Supabase Vault の `nox_mynumber_key`**・平文到達は `get_cast_mynumber`（service 専用・
   全読取 audit）1本のみ。**不足は retention（delete_after 相当が無い）と key_version の器**＝RT レーンの対象。
2. **receivables→給与控除は「一続き」**＝`cast_liability` / `settlement_request` 段が存在せず、
   `receivables`（cast_id 直付き）→ `payroll_finalize` の天引きへ直結。**雇用/委託（employment・taxMode）は
   控除ロジックで一切参照されない**（CSV 表示と blockers のみ）＝裁定89 の4段分割・雇用/委託別チェックは**全て未実装**。
3. **「audit_logs 永久」前提は5系統13箇所**に分布（下記 c）。ただし CLAUDE.md 原則6 は書込義務の規定であり
   裁定88 の追記どおり不変。**削除を積極的に禁止する assert は G6＋grant 面**で、RT 実装時はこの2点の扱いが本丸。

## a. マイナンバーの現行実装（全経路実測）

- **テーブル**: `cast_sensitive`（8列）＝`cast_id / org_id / store_id / real_name / birthday / **mynumber_enc bytea** / created_at / updated_at`。
  deny-all（直 SELECT は全ロール permission denied＝rls F2b で係留済み）
- **暗号化**: `extensions.pgp_sym_encrypt(p_mynumber, v_key)`（対称・pgcrypto）。
  **鍵** = `vault.decrypted_secrets` の **`nox_mynumber_key`**（Supabase Vault。DB 内 secret・鍵欠落は `mynumber key missing` で fail-closed）
- **参照 RPC（mynumber を本文に含む5本・prosrc 実測）**:
  | RPC | 平文到達 | 権限 | audit |
  |---|---|---|---|
  | `set_cast_sensitive(uuid,text,date,text)` | 書込のみ（暗号化して格納） | owner/manager 自店 | fields_changed のみ（平文非リーク＝rls F2b 係留） |
  | `get_cast_sensitive(uuid)` | **しない**（`mynumber_set` boolean のみ返す） | owner ∨ cast 本人 | read_cast_sensitive +1 |
  | `get_cast_mynumber_masked(uuid)` | 下4桁マスク | owner | read 系 audit |
  | `get_cast_mynumber(uuid,uuid,uuid)` | **する（唯一の復号点）** | **service 専用**（支払調書経路・p_org/p_actor 照合） | `read_cast_mynumber`（audit_log_write_service） |
  | `cast_create_apply(...)` | 書込経路（採用時） | 内部 | あり |
- **L5 推奨形との差分**: 別テーブル分離✓（casts に平文列なし）・別鍵✓（Vault）・権限分離✓。
  **無いもの** = `key_version`・`collected_at`・`legal_purpose`・`delete_after`（回答の cast_tax_identifiers 型の retention 列群）＝**起票#36 RT の対象**

## b. receivables → 給与控除の現行経路（「一続き」箇所の特定）

```
receivables（cast_id 直付き・発生時点でキャスト負担が確定）   ← ★cast_liability 段が存在しない
   ↓ collect.ts loadReceivables（status/残額）
   ↓ 古い順 = coalesce(deduct_period, biz_date-period) asc, created_at asc, id asc（collect.ts:292/316）
   ↓ partial = remaining を net 上限まで部分充当（E9 で確定額算出）
   ↓ assemble.ts arDeduct → payroll_finalize が deduct_period/deducted_amount を UPDATE   ← ★settlement_request 段なし
```

- **「一続き」の箇所** = `receivables` テーブル自体が customer 売掛とキャスト負担を**兼ねている**
  （行が cast_id を持った時点で負担根拠の記録なしに天引き対象になる）＋ `payroll_finalize` が
  **無条件に**（＝契約根拠・同意記録・雇用/委託の別を見ずに）充当する2点。
- **雇用/委託の区別**: `casts.employment`（CHECK '委託'/'雇用'）と `cast_tax_profiles.mode` の**2系統が存在**するが、
  控除ロジックはどちらも読まない。参照実測 = `csv.ts:26`（taxMode 表示）・`core.ts:3`（no_tax blocker＝存在確認のみ）。
  → **payroll_deduction 直前チェック（裁定89 の C1 実装分）は完全に純増**。
- 前借り（advances）・送り（transport）も同型の直結（同じ FIFO・同じ finalize）＝4段分割の設計は3種に波及。

## c. 「audit_logs 永久・削除なし」前提の全列挙（5系統・列挙のみ・是正しない）

| # | 系統 | 箇所 | 内容 |
|---|---|---|---|
| 1 | CLAUDE.md | :35 / :40-41 / :46 | 原則6（全書込 RPC audit_log_write・例外なし）＋4ロール revoke。★**裁定88 の追記どおり不変**（保持期間の規定ではない） |
| 2 | 設計書 | `NOX_データモデル設計_Supabase版.md` :121/:206/:208/:216/:360 | punches/stock_logs の append-only 宣言（audit_logs 隣接。RT の retention 表では別区分） |
| 3 | 設計書 | `NOX_F0_セキュリティセルフレビュー.md` :28 | 「append-only（audit_logs）✅ UPDATE/DELETE ポリシー無し＋G6」 |
| 4 | 設計書 | `NOX_BANZEN流用マップ.md` :32/:71 | append-only wrapper パターンの流用宣言 |
| 5 | 台帳 | `NOX_裁定台帳.md` :430 | 「audit_logs は append-only ゆえ多数 run で肥大」（挙動記述） |
| 6 | 台帳 | 同 :831 | withholding_payments「実質 append-only」 |
| 7 | 台帳 | 同 :1048 | customer_notes「append-only＋論理削除」（E8-3-3） |
| 8 | mig コメント | `0002_f0_audit.sql` :1/:5/:12/:47/:56/:86・`0003` :9/:56 | append-only の二重化（ポリシー不在＋revoke 明示）の設計宣言 |
| 9 | コード | `app/(manage)/audit/audit-board.tsx:4` | 「audit_logs は append-only（G6）・読取のみ」 |
| 10 | verify assert | `verify-nox-grants.ts` G6（:210-217） | **audit_logs ポリシー=select 1本のみを能動 assert**＝削除ポリシー追加で赤くなる |
| 11 | verify assert | 同 G1/G2（スキーマ全体） | authenticated=SELECT のみ＝**DELETE grant を足すと赤**（RT はバッチを service/definer 経路にすれば不抵触） |
| 12 | verify 前提 | `verify-nox-anon-guard.ts:148` | 「audit_logs は append-only のため残置＝従来どおり」（固定カウントの前提） |
| 13 | 運用系 | `NOX_本番手貼りリスト.md` :43 ほか・`verify-nox-rls.ts:57`／`verify-nox-inventory.ts:290` | withholding_payments 実質 append-only・stock_logs「append-only 肥大対策」の掃除記述 |

★含意（列挙の注記まで）: 永久保存を**直接 assert する検証は無い**（G6/G1 は「経路が無い」ことの検証）。
RT レーンが削除/匿名化を **SECURITY DEFINER バッチ**で実装する限り G6/G1 は緑のまま成立し、
是正が必須なのは**文書側の宣言（#2〜#4・#8・#9）と固定カウント前提（#12）**。

## d. cast 退職時に現状起きること（実測）

- **入口**: `cast_leave(uuid,date)`（`left_on` 設定＋`is_active=false`）／`cast_rejoin(uuid)`（復帰）。
  CHECK `casts_active_left_on_chk: is_active = (left_on IS NULL)`（mig0074）＝状態と日付が常に対。
- **波及トリガは無い**（casts のトリガは `casts_touch_updated_at` のみ）＝**退職で他テーブルは一切変化しない**。
- 止まるもの（is_active=false の参照側効果）: `kiosk_cast_list` から消える（active のみ）・`set_cast_pin` が
  `inactive cast` 拒否・シフト/打刻の対象選択から外れる・payroll は在籍期間分のみ集計。
- **残るもの（削除されない）**: `cast_sensitive`（**mynumber_enc 含む**）・cast-photo（Storage 実体と
  `photo_updated_at`）・`punches`/`attendance`/`shifts`・`payslips`/`receivables`/`advances`/`transport`・
  `cast_pin` 行・audit_logs 全系列。**物理削除の経路はどこにも無い**（`staff_deactivate` も「物理削除なし」明文＝認可設計:79）。
- **L5 との差分**: 「退職→不要 PII（写真・LINE ID）の自動削除候補化」「マイナンバーの速やかな削除」の器が**無い**。
  法定保存対象（給与・勤怠・税務）を残す点は現行と一致（何も消さないので過剰保持側に倒れている）＝**起票#36 RT の対象**。
