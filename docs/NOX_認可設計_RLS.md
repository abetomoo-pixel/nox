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
- 案A 採用理由：NOX はコンプラ要件が最重（お金/マイナンバー/源泉/風営法）＝認可は柔軟性より堅さ優先。可変 capability は事故リスク＋RLS 複雑化を持ち込む。第2層（castプライバシー）が既に複雑なので第1層は単純に保つ。capability 可変は将来ニーズが顕在化してから追加（YAGNI）。→ **2026-07-09 に但し書き発動＝§1.5（staff 機能別フラグ層・mig0022）**。owner/manager/cast の role 固定は不変。

### 1.3 標準店スコープ RLS（大半のテーブル）
```sql
-- SELECT
using (
  org_id = auth_org_id()
  and (auth_role() = 'owner' or store_id = auth_store_id())
)
```
書き込みは SECURITY DEFINER RPC 経由（直 INSERT/UPDATE/DELETE ポリシーは原則作らない・BANZEN 0030-0033 踏襲）。

### 1.5 staff 機能別フラグ層（2026-07-09 追加・YAGNI 但し書き発動・mig0022）

案A の但し書き「将来ニーズが顕在化してから追加」に基づき、staff（黒服）についてのみ機能別の可否をデータで持つ層を追加する（Agoora が顕在化を認定＝「黒服の権限は人ごとに会計・顧客の2軸で ON/OFF できる」要件）。**role 固定（第1層）は維持**。

- フラグは memberships の明示列（JSON 不採用・頑丈さ優先）＝ `can_register`（会計）/ `can_crm`（顧客CRM）/ `can_shift`（シフト管理）。**default false（fail-closed）**＝立て忘れは「見えない」に倒れる。
- **owner/manager/cast は role 固定でフラグを参照しない。staff のみがフラグ対象**（他 role の行のフラグ値は無意味）。
- 参照は SECURITY DEFINER ヘルパー（`auth_staff_can_register()` / `auth_staff_can_crm()` / `auth_staff_can_shift()`）経由（memberships 直読みの無限再帰回避・既存4本と同型・revoke public/anon＋grant authenticated）。
- RLS/RPC での型: 第3連結を `auth_role() in ('owner','manager') or (auth_role()='staff' and auth_staff_can_*())`（＋パターン1テーブルは cast 自己行枝を保持）に置換。
- 軸の増加は `can_xxx boolean not null default false` を1列追加するだけ。
- フラグ変更は audit_log に記録（誰がいつ ON にしたか）。**フラグ書込RPC: set_staff_perms（束3-1・mig0024・2026-07-09 実装済み）**
  - owner=org 内全店 / manager=自店のみ / staff・cast=自他とも forbidden（権限昇格封じ）
  - 対象は staff のみ（role<>'staff' は 'not a staff'＝owner/manager/cast のフラグは触らせない）
  - 規約7: p_can_register/p_can_crm/p_can_shift は明示 boolean・null は 'bad flag'（UI は3値全送信）
  - 越境: memberships に org_id 列は無い＝stores join で org 照合（他 org は not found・存在オラクル封じ）
  - audit_log_write で before/after 記録。memberships UPDATE のみ（INSERT/DELETE=スタッフ追加は束3-2）
  - フラグ read: 追加なし＝既存 memberships_select（owner=org 全店/manager=自店）で読める（live 確認済み・
    読み取り RPC 不採用・memberships の policy は 1本のまま不変＝認可土台の非汚染は verify G12 で恒久 assert）
- 安全設計＝default deny＋監査＋系統的 verify（フラグ×テーブル×RPC の組み合わせ穴をテストで潰す＝verify:nox-rls の 0行 assert・verify:nox-anon-guard の runtime forbidden/実 INSERT・verify:nox-grants の G4/G4b）。
- 適用状況: `can_register`＝会計6表＋bottle_keeps の RLS と会計6RPC（mig0022・束1・既存 staff は backfill で true）＋bottle_keep_register（mig0023・会計オペ準拠）。`can_crm`＝**適用済み（mig0023・束2）**＝customers SELECT RLS＋書込RPC（customer_register/customer_update）＋集計RPC（customer_summary/customer_list_summary）。`can_shift`＝シフト側は器のみ（トグル手段は set_staff_perms で束3-1 実装済み・シフト管理 RPC 群への実適用は将来フェーズ・店一律トグルは NOX 未実装＝backfill 不要を 2026-07-09 に現物確認）。
- **スタッフ編集RPC 5本（束3-2 Q-1・mig0025・2026-07-10 実装済み）**：
  - `staff_update_profile`（名前変更・owner/manager 自店・users.name 1箇所＝1ユーザー1アクティブで不整合は構造上起きない・対象 staff/manager のみ）
  - `staff_transfer_store`（異動・**owner のみ**＝店跨ぎ操作・同一 org 限定。★出戻り分岐＝UNIQUE(user_id,store_id) は active/inactive 問わず効くため、新店に既存行あれば reactivate（**フラグ既存値維持**・role は異動元引き継ぎ）・なければ INSERT（フラグ default false=fail-closed）。旧を false→新を active の順で 1ユーザー1アクティブの両立瞬間を作らない。inactive 行の異動は 'inactive membership' 明示拒否＝復帰は staff_reactivate に一本化）
  - `staff_change_role`（昇降格・**owner のみ**＝権限昇格経路。p_new_role と現 role の二重ガードで staff↔manager のみ＝owner 増殖・cast 混入封じ。フラグ現状維持＝降格で参照再開・default false なら fail-closed）
  - `staff_deactivate`（在籍解除・owner/manager 自店・is_active=false のみ＝物理削除なし。owner は 'bad target' 保護。解除で membership 経由の認可が全倒れ＝auth_role() null）
  - `staff_reactivate`（再雇用・owner/manager 自店・同店復帰。他 active membership があれば 'already active elsewhere'＝1ユーザー1アクティブ・二重防御は部分ユニーク index。フラグは残存値のまま復帰）
  - 共通ゲート: 対象 membership は stores join で org 照合（他 org・不在は not found＝存在オラクル封じ）・対象 role ∈ (staff,manager)・audit_log_write before/after（old は UPDATE 前確保）。memberships の policy は memberships_select 1本のまま不変（verify G12/G13 で恒久 assert）。
  - verify: 段17（権限マトリクス・出戻り分岐・昇降格のフラグ参照 停止/再開・在籍解除の認可倒れ→reactivate 復帰＝すべて signIn runtime 実測）＋grants G13。スタッフ追加（auth 生成）は束3-2 Q-2（staff_create・mig0026 予定）。

この層の導入により、案A が懸念した「事故リスク・RLS 複雑化」は default deny・staff 枝限定・verify で抑える。role 固定の堅さは owner/manager/cast で維持される。

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
対象：checks, check_lines, payments, receivables, stock_logs, approvals, audit_logs, seats（レジ世界）
※初版でここに列挙していた customers は束2（mig0023）で**パターン1変形へ移行**（cast は指名客のみ可視・下記 F3a-2 追記）。
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

**【F2a 追記（2026-07-03・mig0012）】§2.3 パターン分類への追加**
- **cast_plan＝パターン1変形（staff 遮断）**：`auth_role() in ('owner','manager') or cast_id = auth_cast_id()`。cast は自分の行のみ・**staff は 0行**（overrides_json は個別賃金情報であり、staff の業務範囲＝attendance_set のみ（台帳 #24）に参照不要。get_cast_sales の staff 拒否（F2a 裁定 D6a）と方向統一）。staff は末尾条件の `auth_cast_id()=null` 比較で fail-closed。初版のパターン1対象リストにある cast_plan はこの変形に置き換え。
- **comp_plans＝パターン1変形（割当限定）**：cast は `exists (select 1 from cast_plan cp where cp.cast_id=auth_cast_id() and cp.plan_id=comp_plans.id)` で自分に割当てられたプランのみ可視（F2a 裁定 D1a・初版パターン3欄の「自分のプランのみ」注記の実装形）。サブクエリは cast_plan の RLS を通る**一方向参照**（users↔memberships 型の相互参照ではない＝再帰なし）。
- cast_norms＝パターン1（初版どおり）／deductions・penalty_config・custom_back_defs＝パターン3（罰金・控除・バック規定は周知情報＝F2a 裁定 D2a）。

**【F2e-2 追記（2026-07-07・mig0019）】§2.3 パターン分類への追加**
- **advances／transport＝パターン1**（`auth_role()<>'cast' or cast_id=auth_cast_id()`・check_cast_backs と同型）。receivables はパターン2（客情報 customer_id 保護）だが、前借り/送りは **customer_id を持たず cast 本人が自分の債務を /mine で照合すべき**ため**パターン1**（cast 自己可視）。書込ポリシー0＝発行/取消は RPC 経由のみ。
- **set_store_okuri_mode＝owner 限定（D3a）**：`okuri_mode`（送り方式）は店ポリシー＝comp_plan/penalty_config と同格で owner のみ変更可。`transport_issue` は `okuri_mode='actual'` でのみ受理（fail-closed＝#8 一律送り代 vs 送り実費の**構造的排他**・payOf 内ガードでなく設定で排他）。

**【F3a-2 追記（2026-07-09・mig0023）】§2.3 パターン分類への追加（customers・束2）**
- **customers＝パターン1変形（staff は can_crm・cast は指名客のみ）**：初版パターン2対象リストの customers はこの変形に置き換え（束2で新設・§1.5 can_crm 適用）。
  SELECT: owner=org 全店全客 / manager=自店全客 / staff=自店∧can_crm（false は **0行**）/ cast=自店の**指名客のみ**（`cast_id = auth_cast_id()`・列1本で RLS 物理保証＝解釈A・check_nominations は辿らない）。店スコープ必須。anon 0行。
- **INSERT/UPDATE/DELETE policy なし**（書込は SECURITY DEFINER RPC・casts/checks 型）：customer_register（owner/manager/staff can_crm・担当付与は owner/manager のみ）/ customer_update（同権限・is_active 休眠切替＝物理削除なし・cast_id は触らない）/ customer_assign_cast（**owner/manager のみ**・staff can_crm でも不可・越境 cast は 'invalid cast'）。
- **集計**：customer_summary（単一）/ customer_list_summary（一覧）。visits / last_visit / total_spend / active_bottles / open_receivable は**列に持たず都度集計**。definer で RLS を迂回するため、cast の担当客スコープ・org/店スコープを RPC 冒頭ガード／CTE で再現（物理保証・規約8）。
- **churn**：last_visit から 30日以上=離反（30-59=中 / 60以上=高・モック準拠）。customer_list_summary が churn_tier（none/mid/high）を返し、新規/リピート/優良のラベルは UI 側判定。
- **会計連動**：check_open に `p_customer_id uuid default null` 末尾追加（null=フリー客＝従来動作・非 null は同 org かつ卓の店と同店を検証＝'invalid customer'）。receivables.customer_id は check_pay が伝票（v_chk.customer_id）から導出＝**F1b から連動済み・mig0023 では無改修**。bottle_keep_register は can_register 準拠（ボトルは会計オペ・product 検証は check_add_line 同型）。

### 2.4 列レベルの制御（RLSの行制御だけでは不十分）
- **real_name / mynumber**：cast の SELECT では返さない。**列マスク or 別テーブル分離**。
  - 推奨：mynumber は casts/cast_tax_profiles から分離した別テーブル `cast_sensitive`（real_name/birthday/mynumber）に置き、**閲覧専用 SECURITY DEFINER RPC ＋ アクセスログ必須**でのみ取得。通常クエリでは触れない。
  - real_name は castMng（manager 以上）のキャスト詳細でのみ表示。

**【F2b 実装確定（2026-07-06・mig0015）】§2.4 の実装反映（裁定 T1〜T8）**
- **cast_sensitive の分離強度＝最強形（T1a）**：RLS 有効・**SELECT ポリシーを一切作らない**・**grant を SELECT すら戻さない（authenticated に 0 grant）**。結果として anon/authenticated/owner/manager/cast 本人の**全ロールが直 SELECT 不可**（pattern2 の「cast 0行」より厳しい）。取得は閲覧専用 SECURITY DEFINER RPC `get_cast_sensitive` のみ。
- **閲覧権限（T6a）**：get＝owner ＋ cast 本人の自己閲覧のみ（**manager も直閲覧不可**＝最小権限）。set＝manager 以上（採用時登録）。
- **アクセスログ（T7a・§2.4 確定路線）**：`get_cast_sensitive` は**全閲覧を audit_logs に記録**（action='read_cast_sensitive'・target=cast_sensitive:id・値なし＝誰が誰の機密をいつ見たかのみ）。**本人の自己閲覧も例外なく記録**（補強2）。
- **原則6 の脚注（唯一の例外）**：原則6「書込 RPC は audit」に対し、`get_cast_sensitive` は**読取だが §2.4 がログを明示要求する唯一の例外**。読取 RPC は原則6 対象外（get_cast_ranking/get_cast_sales が前例）だが、機密閲覧のみ「読取でも記録」。
- **平文リーク遮断（逸脱）**：`set_cast_sensitive` の audit は before/after に平文を入れず `{fields_changed:[…]}` のマスク形式（audit_logs に real_name/mynumber 平文を残さない）。
- **mynumber（T2a）**：`mynumber_enc bytea` 列を用意するが F2b では **null 運用**（実暗号化は鍵管理確定後の F2d）。RPC の search_path は **public のみ**（extensions 不要＝攻撃面を広げない）。F2d 暗号化導入時に `public, extensions` へ変更（pgcrypto トラップ回避）の TODO を RPC ヘッダーに明記。
- **cast_tax_profiles（T4a）**：パターン2（cast 0行・manager 以上）。`mode`（委託/雇用）が payOf taxMode の正本・`invoice`/`reg_no` は F2d 前提。casts.employment は残置（T3a・非正規化表示用・drop しない）。
- **verify:nox-grants G1 の整合（T5a）**：G1 は「authenticated は SELECT 以下」の意（SELECT 以外の権限が 0）。cast_sensitive は **0 grant の明示例外**として、authenticated 権限が皆無であることを専用 assert で positive に固定。

**【F2d 実装確定（2026-07-08・mig0021）】mynumber 暗号化・支払調書経路・payment_records の認可（T2a の TODO クローズ）**
- **mynumber 暗号化（D1）**：T2a の null 運用を解消。`mynumber_enc` を **pgp_sym（対称）＋Vault 鍵**で暗号化・鍵はコード/mig に非埋込。暗号化3 RPC（set_cast_sensitive/get_cast_mynumber/get_cast_mynumber_masked）は **search_path=`public, extensions`**（T2a 予告どおり pgcrypto 罠回避）。
- **閲覧3段の権限分離（D1-c）**：① `get_cast_sensitive`＝owner/cast 本人（**mynumber_enc は返さず `mynumber_set boolean` のみ**）。② `get_cast_mynumber`（full 平文）＝**service_role 限定**（owner route ゲート・p_org_id 明示照合・**復号は全件 audit**〔read_cast_mynumber・§2.4 のログ要求を service 版 audit_log_write_service で担保〕・cast 本人も平文不可）。③ `get_cast_mynumber_masked`＝**cast 本人のみ・末尾4桁**（owner/manager 取得不可・読取だが audit）。**封印（grant0・policy0）は暗号化後も不変**。
- **インボイス（D2）**：`set_cast_tax_profile` に `reg_no ^T[0-9]{13}$` 形式チェック追加（RPC＋列制約 not valid）。
- **payment_records＝パターン1（D3）**：§2.3 パターン1（cast 本人が自分の支払記録を可視・customer_id なし）。`payment_record_add`（manager+・org/store 照合・run finalized/paid ガード・**Σ paid_amount ≤ payslip.net**〔payslip FOR UPDATE 直列化〕・冪等キー・audit）。書込ポリシー0＝RPC 経由のみ（advances/transport と同流儀）。
- **UI の権限整合**：機密（real_name/birthday/mynumber）編集は **owner 限定**（get_cast_sensitive が owner/本人限定＝manager は封印で現値を読めず、real_name/birthday の上書き更新で blind write が既存を消す事故を回避）。税務（mode/invoice/reg_no）は manager+（cast_tax_profiles パターン2）。支払調書 reveal（/api/cast/mynumber）は owner のみ・service 経路。
- **verify**：RPC 往復（auth 込み・F2d 完了条件）＝暗号化往復平文一致・masked 末尾4桁・full service 限定・reg_no・payment Σ≤net/idem・パターン1・封印不変。grants G10 で payment_records RLS/proacl/search_path を introspection 恒久回帰。

**【F2c 実装確定（2026-07-06・mig0016）】給与凍結テーブルの認可（裁定 F1c〜F4c）**
- **payslips＝金額系＋staff 遮断**：§3.2 金額系（`auth_role()<>'cast' or cast_id=auth_cast_id()`）に **staff 遮断**を加える＝店スコープ `and auth_role()<>'staff' and (auth_role()<>'cast' or cast_id=auth_cast_id())`。owner=自店全・manager=自店・cast=本人のみ・**staff=0行**（個別賃金明細は黒服にも出さない＝cast_plan／get_cast_sales の staff 遮断と方向統一）。cast は自分の payslip を /mine で読むため `period` を payslips に非正規化（run へのアクセス不要）。
- **payroll_runs＝店スコープ管理オブジェクト**：owner/manager のみ可視（cast/staff 0行）。status は `draft/finalized/paid` の3状態・`period_start/period_end`（解決済み窓）を finalize が凍結。
- **確定書き込みの権威（裁定 F1c）**：payOf は TS 純関数（案1）ゆえ確定はサーバ再計算が権威。サーバ（Next.js API・service_role）が payslip 群を算出→**service_role 限定 RPC `payroll_finalize` に渡し原子的に凍結**（payslips 差し替え＋run 確定＋監査を1トランザクション）。`payroll_mark_paid` も service_role 限定（finalized→paid・箱のみ・実結線は F2e）。authenticated は payslip 値を注入不可。
- **#6 service 経路監査＝`audit_log_write_service`（mig0002 の宿題の解）**：service キーは auth.uid()/auth_org_id() を持たず既存 audit_log_write が使えないため、`p_org_id`/`p_actor` を明示に受ける**完全内部専用**（4ロール revoke・grant なし）ヘルパーを新設。finalize/mark_paid（SECURITY DEFINER・owner=postgres）内部の perform のみで通る＝service_role は監査を finalize/mark_paid 経由でしか書けない（任意監査書込を許さない）。

**【F2c 実装確定（2026-07-06・mig0017）】attendance_incentives（台帳 #32）の認可**
- **パターン3（周知）**：`SELECT to authenticated using (org_id=auth_org_id() and (auth_role()='owner' or store_id=auth_store_id()))`（cast プライバシー条件なし＝全ロールが自店 published を可視）。書込ポリシーなし＝発行/取消は RPC 経由のみ。
- **`incentive_publish`／`incentive_cancel`＝manager 以上**（二重防御標準型・null guard・org 照合・ロール判定・audit）。paid 期間は publish/cancel とも拒否（凍結済み payslip との不整合防止）。staff/cast は発行/取消不可（RLS 可視は周知のため全ロール可）。

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
- **castプライバシー パターン2**：cast が checks/payments/audit_logs を 0 行。
- **customers（パターン1変形・束2）**：cast は指名客のみ（他 cast の指名客・フリー客は 0 行）・staff can_crm=false は 0 行・他店の客は manager/staff から 0 行（店スコープ）。
- **castプライバシー パターン3**：cast が notices（all/cast）は見える・staff 宛は見えない。
- **列制御**：cast クエリで real_name/mynumber が返らない。
- **集計 RPC**：cast には順位/件数のみ・金額が返らない／manager 以上は金額込み。
- **cast セルフ**：cast が自分の attendance(self)/shift_wishes/drink_claims を作れる・他 cast の行は作れない。
- **anon ガード**：全 RPC が anon で BLOCKED（rpc-anon-guard 相当）。
- **マイナンバー RPC**：呼び出しが audit_logs に記録される。
- **スタッフ編集（束3-2 Q-1・段17）**：編集5RPC の権限マトリクス（owner 成功／manager 自店成功・他店 forbidden／異動・昇降格は owner のみ／staff・cast forbidden）・出戻り分岐（reactivate＝membership id 同一・フラグ既存値維持）・昇降格でフラグ参照の停止/再開・deactivate 後 auth_role()=null＋RLS 全倒れ 0行（認可倒れ）を runtime 実測。

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
