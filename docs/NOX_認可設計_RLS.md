# NOX — 認可設計（RBAC + RLS + castプライバシー）

> `NOX_データモデル設計_Supabase版.md` §3 の詳細化。出典：`SPEC.md` §3（capabilityマトリクス）＋ `NOX-architecture.md` §5（RBAC）。
> 確定（2026-06-25）：①capability = **ロール固定（案A）**（コード/ポリシーにハードコード・capability可変テーブルは作らない）／②castプライバシー = **RLSで物理保証（DBレベル）**／③castはchecks（レジ）を一切見ない。
> ⚠ 認証・認可・コンプラは専門家レビュー前提。

---

## 0. 認可の2層構造

NOX の認可は2層。第1層は BANZEN と同型、第2層が NOX 固有。

| 層 | 制御 | BANZEN 対応 |
|---|---|---|
| **第1層：店スコープ** | org→store→データ・owner=org全店/manager・staff=自店 | ◎ そのまま（auth_org_id/role/store_id） |
| **第2層：castプライバシー** | 同じ店でも cast は自分の金額のみ・他キャスト/店舗総額は不可視 | △ NOX固有・新規 |

**第1層をロール固定で単純化し、第2層（castプライバシー）に設計の力を集中する**のが本設計の方針。

---

## 1. 第1層：店スコープ（ロール固定・BANZEN踏襲）

### 1.1 認可ヘルパー（最初の mig で定義・BANZEN から翻訳）
- `auth_org_id()` ← BANZEN `auth_tenant_id()`
- `auth_role()` ← memberships.role（owner/manager/staff/cast）
- `auth_store_id()` ← memberships.store_id
- `auth_cast_id()` ← cast ロールのユーザーに紐づく casts.id（cast セルフ用・BANZEN `auth_staff_id()` に対応）

**認可の真実は memberships（user × store × role）**。退職者は is_active=false で即時失効。

### 1.2 capabilityマトリクス（SPEC §3・ロール固定でコードに反映）
| capability | owner | manager | staff | cast |
|---|---|---|---|---|
| register（レジ会計） | ✓ | ✓ | ✓ | – |
| report（日報） | ✓ | ✓ | ✓ | – |
| castMng（キャスト管理） | ✓ | ✓ | – | – |
| pay（報酬閲覧） | ✓ | ✓ | – | – |
| closeMonth（給与確定） | ✓ | ✓ | – | – |
| master（設定・マスタ） | ✓ | ✓ | – | – |
| audit（監査ログ） | ✓ | – | – | – |

- capability は**テーブルに持たない**。RLS ポリシー・RPC 内で `auth_role()` を直接判定（ハードコード）。
- 案A 採用理由：NOX はコンプラ要件が最重（お金/マイナンバー/源泉/風営法）＝認可は柔軟性より堅さ優先。可変 capability は事故リスク＋RLS 複雑化を持ち込む。第2層（castプライバシー）が既に複雑なので第1層は単純に保つ。capability 可変は将来ニーズが顕在化してから追加（YAGNI）。

### 1.3 標準店スコープ RLS（大半のテーブル）
```sql
-- SELECT
using (
  org_id = auth_org_id()
  and (auth_role() = 'owner' or store_id = auth_store_id())
)
```
書き込みは SECURITY DEFINER RPC 経由（直 INSERT/UPDATE/DELETE ポリシーは原則作らない・BANZEN 0030-0033 踏襲）。

---

## 2. 第2層：castプライバシー（NOX固有・RLSで物理保証）

### 2.1 要件（SPEC §3）
- cast は**他キャストの金額**が見えない。
- cast は**店舗総額**が見えない。
- ランキングは cast には**件数/順位のみ**（金額は見えない）。
- 本名（real_name）・マイナンバーは castMng（manager以上）でのみ表示。

### 2.2 強制方法：RLS（DBレベル物理保証）
アプリ層フィルタではなく RLS で強制。cast が何をどう問い合わせても他人の金額が返らないことを DB が保証。アプリのバグで漏れない（BANZEN「センシティブは RLS で守る」の読み取り版）。

### 2.3 テーブル3パターン分類

#### パターン1：cast が自分の行だけ見える（cast_id を持つ・金額含む）
対象：payslips, payment_records, check_nominations, attendance, shift_wishes, drink_claims, advances, transport_settlements, cast_norms, cast_plan, cast_tax_profiles
```sql
using (
  org_id = auth_org_id()
  and (auth_role() = 'owner' or store_id = auth_store_id())
  and (auth_role() <> 'cast' or cast_id = auth_cast_id())   -- ★castは自分のcast_idのみ
)
```
→ cast は自分の行だけ。manager 以上は店スコープで全行。BANZEN の staff セルフ RLS と同型。

#### パターン2：cast が全く見えない（レジ・店舗総額・他者管理）
対象：checks, check_lines, payments, receivables, customers, stock_logs, approvals, audit_logs, seats（レジ世界）
```sql
using (
  org_id = auth_org_id()
  and (auth_role() = 'owner' or store_id = auth_store_id())
  and auth_role() <> 'cast'                                  -- ★castは0行
)
```
→ レジ・会計・顧客・在庫・承認・監査は黒服以上の世界（確定事項③：cast は checks を一切見ない）。

#### パターン3：cast も見えるが内容制限（共有情報）
対象：notices（audience=all/cast）, products（価格表）, comp_plans（自分のプランのみ）
```sql
-- 例：notices
using (
  org_id = auth_org_id() and store_id = auth_store_id()
  and (auth_role() <> 'cast' or audience in ('all','cast'))  -- castはall/cast宛のみ
)
```

### 2.4 列レベルの制御（RLSの行制御だけでは不十分）
- **real_name / mynumber**：cast の SELECT では返さない。**列マスク or 別テーブル分離**。
  - 推奨：mynumber は casts/cast_tax_profiles から分離した別テーブル `cast_sensitive`（real_name/birthday/mynumber）に置き、**閲覧専用 SECURITY DEFINER RPC ＋ アクセスログ必須**でのみ取得。通常クエリでは触れない。
  - real_name は castMng（manager 以上）のキャスト詳細でのみ表示。

---

## 3. 集計の安全提供（RLSだけでは完結しない部分）

### 3.1 問題
「ランキングは件数/順位のみ」「店舗総額は見せない」は、RLS の行制御（見せる/見せない）だけでは表現しにくい。集計結果（他者を含む順位・総額）を見せつつ元の金額を隠す、という要求。

### 3.2 解：集計専用 SECURITY DEFINER RPC（BANZEN「集計はサーバ権威」の応用）
- cast が見るランキングは**生の payslips/checks ではなく、集計済みの順位・件数だけを返す RPC** を経由。
- その RPC は SECURITY DEFINER（RLS バイパス）で店全体を集計し、**cast に見せていい部分（順位・件数）だけ返す**。生の金額は返さない。
- cast は生の金額テーブルには一切アクセスできない（パターン2で0行）。
- 例：`get_cast_ranking(p_store_id, p_period)` → cast には `{rank, count}` のみ／manager 以上には金額込み（呼び出し元ロールで出し分け・冒頭で `auth_org_id() is null` 即拒否）。
- **【F1f 実装確定（2026-07-02・mig0011）】**：`get_cast_ranking` は**全ロール同一の返却形**
  （rank/cast_id/cast_name/hon_count/jonai_count/dohan_count/is_self・金額列なし）で実装。
  「manager 以上には金額込み」は 1 RPC 内のロール分岐で事故る面を作らないため、
  **F2 の pay/castMng 用の別 RPC に分離**する（本節の出し分け案からの意図的変更）。
  読み取り専用 RPC は audit_log_write 対象外（CLAUDE.md 原則6は書込 RPC）・センシティブ閲覧（mynumber）は別枠でアクセスログ必須。

### 3.3 二段構えのまとめ
```
castプライバシー =
  ① RLS で生データを物理隔離（パターン1=自分のみ / パターン2=0行 / パターン3=共有のみ）
  ② 集計は SECURITY DEFINER RPC で安全な部分（順位/件数）だけ提供
  ③ 超センシティブ（mynumber/real_name）は別テーブル＋閲覧専用RPC＋アクセスログ
```

---

## 4. cast セルフ操作（書き込み・本人のみ）

cast が自分で行う操作（Mine/希望/勤怠連絡/ドリンク申告）の書き込み RPC：
- attendance（source=self の遅刻/欠勤連絡）, shift_wishes, drink_claims（pending 作成）
- RPC 内で **`auth_cast_id()` を検証し本人の行のみ操作可**。
- ⚠ manager 代理操作の RPC には `auth_cast_id() is null` ガードを**入れない**（BANZEN request_accept 教訓：代理が staff_id/cast_id null で弾かれるのを防ぐ）。cast セルフ専用 RPC にのみ本人チェックを入れる。

---

## 5. 二重防御（全 RPC・BANZEN 最重要教訓）

NOX の全 SECURITY DEFINER RPC に適用：
1. **冒頭 `if auth_org_id() is null then raise exception 'forbidden'`**（NULL 比較の素通り防止）。
2. **`revoke execute from public, anon` ＋ `grant to authenticated`**（public だけだと anon に直 grant 残る）。
3. ロール判定（`auth_role()='owner'` 等・固定）＋ org/store スコープ確認（クロステナント遮断）。
4. お金が動く操作（給与確定・会計確定）はサーバ再計算＋冪等キー＋トランザクション。
5. マイナンバー閲覧 RPC はアクセスログ必須。
6. cast セルフ RPC のみ `auth_cast_id()` 本人チェック（代理操作には入れない）。

---

## 6. 検証（BANZEN verify 思想）

- **店スコープ**：他店データを引けない（manager A 店 → B 店データ 0 行）。
- **castプライバシー パターン1**：cast が自分の payslip だけ見える・他 cast の payslip は 0 行。
- **castプライバシー パターン2**：cast が checks/payments/customers/audit_logs を 0 行。
- **castプライバシー パターン3**：cast が notices（all/cast）は見える・staff 宛は見えない。
- **列制御**：cast クエリで real_name/mynumber が返らない。
- **集計 RPC**：cast には順位/件数のみ・金額が返らない／manager 以上は金額込み。
- **cast セルフ**：cast が自分の attendance(self)/shift_wishes/drink_claims を作れる・他 cast の行は作れない。
- **anon ガード**：全 RPC が anon で BLOCKED（rpc-anon-guard 相当）。
- **マイナンバー RPC**：呼び出しが audit_logs に記録される。

---

## 7. BANZEN との対応（認可）

| NOX 認可 | BANZEN 対応 | 再利用度 |
|---|---|---|
| 第1層 店スコープ（ロール固定） | tenant/store スコープ RLS | ◎ そのまま |
| auth_org_id/role/store_id/cast_id | auth_tenant_id/role/store_id/staff_id | ◎ |
| 二重防御 RPC | 0025/0026/0035 | ◎ |
| cast セルフ操作（本人のみ） | staff セルフ（自分の打刻/希望） | ◎ 同型 |
| 第2層 castプライバシー（RLS行隔離） | （BANZEN になし） | △ 新規 |
| 集計 SECURITY DEFINER RPC | （集計はサーバ権威の思想は共通） | ○ 応用 |
| mynumber 別テーブル＋閲覧RPC＋ログ | （BANZEN になし） | △ 新規 |

NOX 固有の新規は「castプライバシーの行隔離」「集計の安全提供」「マイナンバー厳格管理」の3点に集中。それ以外はБANZEN 資産がそのまま効く。

---

## 7.5 店舗キオスク（店舗用iPad）認証（2026-06-25 確定）

NOX も BANZEN 同様、店舗に iPad を置く運用が必要（夜職は共用端末前提が強い）。ただし**NOX のキオスクは運営専用**で、BANZEN より使い手が限定される。

### 7.5.1 使い手と用途（NOX 固有）
- **使い手**：黒服（staff）・店長（manager）のみ。**cast はキオスクを使わない**。
- **用途**：レジ会計（checks）・シフト確認/操作・（店長なら）管理。
- **cast の扱い**：cast は全て**個人スマホでログイン**（打刻・マイページ・希望・ランキング）。キオスクには一切関わらない。

### 7.5.2 BANZEN との差分
| | BANZEN | NOX |
|---|---|---|
| キオスクの使い手 | staff 全員（打刻＋レジ） | 黒服・店長のみ（レジ・シフト） |
| cast/一般スタッフの打刻 | キオスクで打刻 | **cast は個人スマホで打刻**（キオスク不使用） |
| センシティブ情報 | （staff の打刻履歴程度） | **cast 報酬等は共用端末に出ない**（cast がキオスクを触らないため経路ゼロ） |

→ NOX のキオスクは**むしろシンプル**。cast がキオスクを使わないので、cast プライバシー（§2・RLS で物理保証）と完全整合。センシティブな報酬情報が共用端末に漏れる経路が構造的に存在しない。

### 7.5.3 認証構造（BANZEN キオスク資産を再利用）
二系統の認証（BANZEN と同型）：
1. **個人ログイン**（従来）：店長・黒服・cast が各自の端末/スマホでログイン。cast のマイページ・報酬・希望はここ。
2. **店舗キオスク**（新規）：iPad が「店舗端末」として常時ログイン。レジ・シフト画面にだけアクセス可・設定変更は個人ログインの世界。

- **端末の正体**：店舗用キオスクアカウント（限定権限）。memberships に kiosk 相当ロール/アカウントを追加（NOX は既に memberships 構造なので素直に乗る）。
- **個人識別**：キオスク内で黒服/店長を名前選択（デフォルト）＋PIN オプション（店ごとに厳格さ選択）。レジ（お金・現金扱いが大きい夜職）は PIN 推奨。
- **記録主体**：識別した黒服/店長が checks 等の操作者として記録。
- **キオスク用 RLS**：キオスクアカウントは checks（レジ）・shifts（シフト）にアクセス可、設定/マスタ/監査は不可（個人ログインの owner/manager のみ）。

### 7.5.4 BANZEN キオスク資産の再利用度
| キオスク要素 | BANZEN | NOX 再利用 |
|---|---|---|
| キオスクアカウント（限定権限） | memberships に kiosk ロール | ◎ そのまま（NOX も memberships） |
| 名前選択＋PIN オプション | staff 識別 | ◎ 黒服/店長識別に流用 |
| 記録主体の連携 | orders.staff_id | ◎ checks の操作者記録 |
| cast 除外 | （BANZEN は全 staff 使用） | △ NOX 固有（cast はキオスク不使用＝より単純） |

→ BANZEN で作るキオスク認証の土台がそのまま効く。NOX は cast を除外する分、適用範囲が限定的でむしろ実装が楽。

---

## 8. 専門家確認フラグ（認可関連）

- **マイナンバー（番号法）**：別テーブル・暗号化・アクセスログ・保持期間・閲覧権限分離 → 専門家。
- **個人情報**：real_name/birthday/tel の暗号化・最小権限・保持期間。
- **風営法**：年齢確認（trials の採用フロー）。
- **労基**：天引き同意の権限・記録。
- いずれも最終判断は専門家。
