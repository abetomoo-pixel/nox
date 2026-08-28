# NOX C1/C2 報酬モデル v2 設計書 v1（ロック済み）

2026-08-28 相談役起草・同日 Agoora 裁定（§8 の5点すべて推奨案で確定）により**ロック**。
根拠: docs/dp/survey_c12.md（実測）・社労士 S1〜S10 回答・裁定74/75/79/81/82/83・起票#25/#26。
L3（弁護士）依存点は §7 のスロットに隔離してあり、回答前でも他は実装可能な構造。
実装は本書の §6 の順で行い、設計変更は本書の版を上げてから（写しは腐る・正本は repo 収蔵版）。

---

## 0. 位置づけ・依存・非目標

- レーン順: R-2b の前。**dohan の率化のみ R-2b（同伴 cast_id 必須・裁定74）に依存** → 器を先置き・解錠は R-2b 後
- A5（送り控除）を本レーンに編入（v17 §3 の決定どおり）
- 非目標: C3/C4（税区分・内税外税・端数）・SC・pricing_rules・check_close 系。**money 三面鏡は不触**（payroll は三面鏡の外だが golden 5931/125802 が動く＝Fable 5 案件）

## 1. 設計原則

1. **裁定82**: NOX は計算機構を提供し、法適合の判断と責任は店舗に置く。法定チェック・上限・保証は**既定で強制しない**。店舗が選べるオプションとして器を持つ
2. **裁定75**: バック定義は `comp_plans`（＋`cast_plan.overrides_json`）側のみ。`stores` へ二重化しない。「同伴時の本指名自動付与」boolean は **R-2b の mig に同梱**（本レーンで先に入れない）
3. **per_count 既存経路は1バイト不変**（pay.ts:438 の係留）。golden 張り替えは挙動を足す段でのみ起こす
4. 新しい報酬概念は列の増殖ではなく**行型コンポーネント**へ（pricing_rules 一般化と同型の解）【裁定①確定】
5. S3/S7〜S9 の「基本保証＋成果加算型」は**推奨プリセット**として実装し、既定にはしない（裁定82）

## 2. スキーマ（確定）

### 2-1. comp_plans — 既存17列は凍結・追加のみ

- `dohan_back_mode text not null default 'per_count'` / `dohan_back_rate int null` を追加し hon/jonai と**対称化**
- **解錠ガード【裁定②確定＝RPC ガード】**: `mode='rate'` の保存は R-2b 適用まで RPC で拒否（`dohan rate requires R-2b`）。UI は3ボタン目 disabled＋「準備中」ピル。CHECK 制約にはしない（解錠が RPC 差替のみで済み mig を増やさない）
- 率の分母は R-2b 後の `cast_sales_aggregate`（行由来化）に一本化。本レーンでは分母を定義しない

### 2-2. comp_plan_components — 新設（行型・起票#25 の本体）【裁定①確定】

| 列 | 型 | 備考 |
|---|---|---|
| id / org_id / store_id / plan_id | uuid | plan_id → comp_plans FK |
| kind | text | v2.0 は `guarantee_min` / `achievement_bonus` の2種のみ。`point_rate` / `profit_share` は kind 追加だけで増やせる器 |
| mode | text | `amount` / `rate` |
| amount | bigint null | 円 |
| rate | int null | %表現は既存 hon_back_rate と同一規約 |
| params | jsonb | 判定単位・閾値（例: achievement_bonus の {target_kind, thresholds:[{pct,add}]}） |
| priority / is_active / created_at / updated_at | | 既存規約どおり |

- grants: 新テーブル規約（public/anon 全 revoke・authenticated の INSERT/UPDATE/DELETE revoke）・RLS は comp_plans と同じ可視範囲（裁定81＝mig0105 の staff 遮断を継承）
- 保証判定単位（日/半月/月）は当面 params 内。運用実績で列昇格を再裁定

### 2-3. cast_plan の期間化（起票#26)【裁定③確定＝案A】

- `valid_from date not null` / `valid_to date null` を追加＋同一 cast の期間重複を排他制約で禁止
- 既存行は valid_from=導入日で backfill
- 読み手は collect.ts 1箇所に当月判定 where を足すだけ
- 裁定83 との整合: finalize 済み期間は snapshot が守るため、期間列が効くのは**未確定月の再計算のみ**

### 2-4. 控除の種別化（A5 編入・社労士 S1/S2/S3 反映）

- 6区分の固定語彙: `unworked` / `sanction` / `statutory` / `agreed_cost` / `store_receivable` / `advance_settlement`
- 送り（okuri）は `agreed_cost` 既定・店舗変更可
- `sanction` の法定上限チェック（1回=平均賃金半日分・総額=賃金支払期の1/10）は**オプションの警告**として器を置く（裁定82）→ 既定値・強制可否は L3 スロット（§7）
- `store_receivable` の天引き可否・上限は L1/L3 スロット。回答まで現行挙動（partial・oldest-first）を変えない

## 3. C2 ノルマ v2

- `cast_norms`（11列）を基礎に、達成判定 → `achievement_bonus` の params 参照で連動（ノルマ側に金額を持たせない＝定義の単一化）
- 未達ペナルティ: L3 スロット。構造のみ確保（kind=`sanction` の components 行＋nullable cap 列)・UI 非表示
- 半月 period × `min_month_min` 単位（起票#28）は SC 側に残置

## 4. 合成規則【裁定④確定】

- 同一キャスト・同一卓で hon_back と dohan_back が同時に立つとき（裁定74 の同時成立）: **既定=加算**。請求側が別料金線で立つ以上バックも独立に積む
- 択一（高い方）は comp_plans のオプションフラグとして持つ（挙動段で実装可否を再確認・v2.0 必須ではない）

## 5. golden・verify 計画

- 張り替え対象: **5931 / 125802 の2値のみ**（verify-nox-pay.ts:170・verify-nox-rate-back.ts:122-123）。**55233 は労務予測の別系統＝不関与**を注記 assert で固定
- 二段構え:
  1. **mig 段**: スキーマ追加のみ（default per_count・components 空・期間列 backfill）→ **golden 6値不変が受け入れ条件**
  2. **挙動段**: guarantee_min → achievement_bonus の順に1 kind ずつ結線。張り替えはこの段でのみ発生し、新旧値の差分根拠（式・入力）を台帳に残す
- 新 assert 逆張り必須・2回連続緑・money 三面鏡の golden（5931/125802 以外の4値）不変

## 6. 実装順【裁定⑤確定＝mig 1本】

1. **mig C1-1（1本）**: dohan 対称化＋comp_plan_components 器＋cast_plan 期間列＋控除種別の器。全て挙動不変の追加のみ・golden 6値不変を1回で証明
2. collect.ts / CompPlan 型 / pay.ts: 読み経路の拡張（components 空なら旧式と同値）
3. `set_comp_plan` v2: 新署名（**旧署名 DROP 明示**＝overload 罠回避）・`set_comp_component` 新設・課金ゲート名簿と billing pin 同時更新（教訓21）
4. UI（/master 待遇タブ）: モック対比を先に実測（教訓40/42）
5. 挙動結線: guarantee_min → achievement_bonus
- **モデル: Fable 5**（money 隣接・golden 張り替え・RLS 新設）。UI 段のみ Opus 可・相談役が段ごとに指示

## 7. L3（弁護士）待ちスロット

| # | スロット | 回答までの凍結状態 |
|---|---|---|
| L3-a | sanction（罰金・減給）の上限器: 強制か警告か・既定値 | 器のみ・UI 非表示 |
| L3-b | 委託 cast への ノルマ・罰金・売掛負担の可否と NOX 側上限 | cast_norms 現行のまま・penalty 結線しない |
| L3-c(=L1) | store_receivable 天引きの規制適合・「売掛不可」店舗設定の要否 | 現行挙動維持 |

## 8. 裁定記録（2026-08-28 確定）

| # | 論点 | 確定 |
|---|---|---|
| ① | 新報酬概念の持ち方 | **行型 comp_plan_components 新設** |
| ② | dohan rate の解錠 | **RPC ガード＋UI 準備中**（CHECK にしない） |
| ③ | cast_plan 期間 | **案A: 期間列＋排他制約** |
| ④ | hon+dohan 合成 | **加算既定**（択一はオプション候補） |
| ⑤ | mig 分割 | **1本（C1-1 一括・golden 不変を1回で証明）** |

---

## 付録: 影響半径（survey_c12 実測より）

- comp_plans 書き手: `set_comp_plan`（14引数→v2 で署名変更）/ `set_cast_plan` の2本のみ
- 読み手: collect.ts:74 の直読 12項目 select（RPC 非経由）
- dohan を本文に含む RPC 26本は **R-2b の半径**であり本レーンでは不触
