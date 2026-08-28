# NOX C1/C2 報酬モデル v2 設計書 v1.1（ロック済み・L 回答反映）

2026-08-28 相談役起草。v1（裁定86 で5論点確定）に、同日受領の弁護士 L1〜L6 回答を反映し
**§7 の待ちスロット3点を確定内容で充填**した版。v1 からの変更は §2-4・§3・§7・§8 のみ。
スキーマ・実装順・golden 計画（§2-1〜2-3・§5・§6）は**v1 から不変**。
根拠: docs/dp/survey_c12.md・社労士 S1〜S10・弁護士 L1〜L6・裁定74/75/79/81/82/83/86・起票#25/#26。

---

## 0. 位置づけ・依存・非目標

- レーン順: C3/C4 の後・R-2b の前（v18 §3 の順に復帰）。**dohan の率化のみ R-2b（同伴 cast_id 必須・裁定74）に依存** → 器を先置き・解錠は R-2b 後
- A5（送り控除）を本レーンに編入
- **専門家依存は解消済み**（社労士・弁護士とも回答受領）。外部待ちなしで全段実装可能
- 非目標: C3/C4（税区分・内税外税・端数）・SC・pricing_rules・check_close 系・**retention 実装（新レーン RT へ分離・裁定88）**・売掛4段分割の本体（R-2b/F2e 系・裁定89）。money 三面鏡は不触（payroll golden 5931/125802 が動く＝Fable 5 案件）

## 1. 設計原則

1. **二層ガード原則（裁定87＝裁定82 の精緻化・L3/L6）**:
   - **第1層＝NOX が強制**: 法定数値が存在する領域。深夜時間帯・最低賃金チェック・**雇用の減給制裁上限（労基法91条: 1回=平均賃金半日分・総額=一賃金支払期の1/10）**・税計算・法定保存期間
   - **第2層＝警告＋根拠確認**: 店舗事情に依存する領域。委託の罰金・ノルマ・売掛負担は**警告表示＋契約上の根拠確認の必須化＋確認記録の保存**。委託に NOX 独自の数値上限は**作らない**（法定数値が無いものに独自上限を置くのは逆に危険・L3）
2. **裁定75**: バック定義は `comp_plans` 側のみ。stores へ二重化しない。「同伴時の本指名自動付与」boolean は R-2b の mig に同梱
3. **per_count 既存経路は1バイト不変**。golden 張り替えは挙動段でのみ
4. 新報酬概念は行型コンポーネント（裁定86-①）
5. 「基本保証＋成果加算型」は推奨プリセット（既定にしない）。社労士 S3/S7〜S9 に加え**弁護士 L3 も同方向**（減額・罰金型より扱いやすい）＝推奨の根拠が二重化

## 2. スキーマ（確定）

### 2-1. comp_plans — v1 から不変

- `dohan_back_mode` / `dohan_back_rate` 追加・対称化。`mode='rate'` は R-2b まで RPC ガード＋UI 準備中（裁定86-②）

### 2-2. comp_plan_components — v1 から不変

- 行型・v2.0 の kind は `guarantee_min` / `achievement_bonus`。grants 新テーブル規約・RLS は mig0105 の可視範囲を継承（裁定81）

### 2-3. cast_plan の期間化 — v1 から不変

- `valid_from` / `valid_to` ＋排他制約（裁定86-③・案A）。既存行 backfill。finalize 済みは snapshot が守る（裁定83）

### 2-4. 控除の種別化（A5 編入・S1/S2/S3・L1/L3 反映）【v1.1 更新】

- 6区分の固定語彙: `unworked` / `sanction` / `statutory` / `agreed_cost` / `store_receivable` / `advance_settlement`
- 送り（okuri）は `agreed_cost` 既定・店舗変更可
- **sanction の二層化（裁定87 適用・スロット L3-a 充填）**:
  - **雇用 cast**: 労基法91条の上限を**システム強制**（超過保存を RPC で拒否）
  - **委託 cast**: 数値上限なし。保存時に警告（「確定済み報酬からの控除はフリーランス法上の報酬減額等に該当する場合があります」）＋**契約根拠確認のチェック必須＋確認記録（誰が・いつ・何を確認したか）を保存**
  - `fixed_penalty` / `shortfall_charge` / `customer_bad_debt_transfer` は**高リスク設定として明示警告**（L3）
- **store_receivable（裁定89 適用・スロット L3-b/c 充填）**:
  - `stores.receivable_policy text not null default 'customer_only'`: `disabled` / `customer_only` / `cast_liability_allowed` の3値。**既定は customer_only**（キャスト負担なし＝OFF 寄りが安全・L1）
  - payroll deduction の**直前に雇用/委託別チェック**を必ず通す（雇用=S1/S2 の賃金全額払い系・委託=L3 のフリーランス法系。一続きの自動控除にしない）
  - 売掛→負担→回収の4段分割（`customer_receivable → cast_liability → settlement_request → payroll_deduction`）の**本体は本レーン外**（起票#37・R-2b/F2e 系）。本レーンは policy 器と直前チェックのみ

## 3. C2 ノルマ v2【v1.1 更新】

- `cast_norms` を基礎に、達成判定 → `achievement_bonus` の params 参照で連動（v1 のまま）
- **未達ペナルティ（スロット充填）**: kind=`sanction` の components 行として実装可。二層ガード（§2-4）がそのまま適用される＝雇用は91条強制・委託は警告＋根拠確認。UI 非表示の凍結は解除してよいが、**実装順は挙動段の最後**（guarantee_min → achievement_bonus → sanction）
- 半月 period × `min_month_min` 単位（起票#28）は SC 側に残置

## 4. 合成規則 — v1 から不変

- hon+dohan 同時成立時は**加算既定**（裁定86-④）。択一はオプション候補

## 5. golden・verify 計画 — v1 から不変

- 張り替えは 5931/125802 のみ・55233 不関与を assert 固定・二段構え（mig 段=golden 6値不変が受け入れ条件）

## 6. 実装順 — v1 から不変（挙動段の末尾に sanction 追加）

1. mig C1-1（1本・裁定86-⑤）: dohan 対称化＋components 器＋cast_plan 期間列＋控除種別の器＋`stores.receivable_policy`
2. collect.ts / 型 / pay.ts: 読み経路（挙動不変）
3. `set_comp_plan` v2（旧署名 DROP 明示）・`set_comp_component` 新設・課金ゲート名簿＋billing pin 同時更新（教訓21）
4. UI: モック対比を先に実測（教訓40/42）
5. 挙動結線: guarantee_min → achievement_bonus → **sanction（二層ガード込み）**
- **モデル: Fable 5**。UI 段のみ Opus 可・段ごとに相談役が指示

## 7. 旧 L3 スロット — 全点確定（2026-08-28 L1〜L6 回答により充填）

| # | 旧スロット | 確定内容 |
|---|---|---|
| L3-a | sanction 上限器 | **雇用=91条をシステム強制／委託=上限なし・警告＋契約根拠確認必須＋記録**（裁定87） |
| L3-b | 委託への ノルマ・罰金・売掛負担 | **設定可。ただし高リスク3種（定額罰金・未達チャージ・貸倒転嫁）は明示警告＋根拠確認**。NOX 独自の数値上限は作らない（L3） |
| L3-c(=L1) | 売掛天引きの規制適合 | **2025 改正風営法は直接の上限規制ではない**。`receivable_policy` 3値の器を持ち既定 customer_only。回収は雇用/委託別チェック経由（裁定89）。現行 partial・oldest-first は債権管理ロジックとして維持 |

## 8. 裁定記録

| 裁定 | 内容 |
|---|---|
| 86（2026-08-28） | 5論点確定: 行型 components／RPC ガード解錠／期間列 案A／加算既定／mig 1本 |
| 87（2026-08-28） | **二層ガード原則**（NOX 強制層と警告層の分離・裁定82 の精緻化） |
| 88（2026-08-28） | audit_logs「全件・削除なし」方針の撤回。データ種別別 retention へ（**実装は新レーン RT**・本設計書の対象外） |
| 89（2026-08-28） | receivable_policy 3値＋売掛4段分割の方針採用（本レーンは器と直前チェックのみ・本体は起票#37） |

### 版履歴
- v1（2026-08-28）: 裁定86 でロック
- v1.1（2026-08-28）: L1〜L6 回答受領によりスロット充填（§2-4/§3/§7/§8）。スキーマ・golden 計画は不変

---

## 付録: 影響半径（survey_c12 実測より・v1 から不変）

- comp_plans 書き手: `set_comp_plan` / `set_cast_plan` の2本のみ。読み手: collect.ts:74 直読
- dohan を本文に含む RPC 26本は R-2b の半径・本レーン不触
