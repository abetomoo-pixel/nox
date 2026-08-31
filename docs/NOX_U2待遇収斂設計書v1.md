# NOX U-2 待遇収斂設計書 v1（裁定101・2026-08-31）

底本＝相談役起草 `NOX_裁定101_U2待遇収斂.md`（2026-08-31 受領・sha256
`7ac2eea915b51526ba4eb22187918217be49ee23dbb1278c4dfccea6a49e9d8e`・4,473 bytes・35行）。
§1 は底本の**逐語転記**（1バイト改変なし）。§2 以降は実装用の対応表と準備中一覧（C5＝起票#42）。

---

## 1. 裁定101 本文（逐語）

# 裁定101（2026-08-31）U-2 待遇画面のモック収斂（設計ロック）

正本モック: mock/pages-2026-08/nox-cast-compensation-canonical.html（v2）。構造の正本であって配色の正本ではない（実装は現行トークン）。
起票#38 の収斂レーン。DB・migration・RPC 署名は一切触らない（UI＋純関数のみ）。

## 1. モック v2 への補正3点（v3 を待たず本裁定で確定）
1. ノルマ未達処理の「契約区分（業務委託/雇用）」select は置かない（契約区分は casts.employment＝cast 属性であり、同一プランに委託と雇用が混在しうる）。代わりに説明2行（雇用＝法定上限を給与計算側で自動制約／委託＝契約上の根拠が必要）＋「契約上の根拠を確認した」チェック＋確認メモ欄。ただし penalty_config に確認記録の器が無いため本レーンでは**準備中表示**（C5）。シミュレーションの契約区分トグルは試算入力として維持。
2. キャスト割当行に「個別上書き ▸」折りたたみ（保証時給／本／場内／同伴＝cast_plan.overrides_json・現行 UI と同じ4項目）。割当は set_cast_plan 4引数（適用開始日＝valid_from・履歴生成）。
3. 各種バック末尾に「＋自由バックを追加」（custom_back_defs＝名称／基準／値／達成条件・set_custom_back_def）。「追加機能（準備中）」リストに「率方式バック（R-2b 後）」を1行追加。

## 2. 器なし項目＝すべて (b) 準備中表示（C5 起票#42 に一覧・本レーンで器は作らない）
日給制／保証対象時間帯／保証判定単位の半月・日／pt付与ルール（本指名=2pt 等）・ポイント単価・使い方／売上スライドの粗利基準／延長バック・場内→本指名昇格バック／スライド帯の歩合%列／歩合の丸め2軸（comp_plans に列なし）／未達処理の根拠確認記録／達成ボーナスの params が表せない条件。

## 3. 保存単位＝セクション単位（既存 RPC をそのまま呼ぶ・一括保存ボタンは作らない）
| セクション | RPC | 主な列 |
|---|---|---|
| 基本給・保証 | set_comp_plan（16引数・常時全引数明示） / set_comp_component | comp_plans.base / guarantee_min component |
| 売上歩合・各種バック | set_comp_plan / set_custom_back_def | hon/jonai/dohan_back(+mode) / sales_slide.salesBack / custom_back_defs |
| ポイント制・売上スライド | set_comp_plan | point_slide / sales_slide（3段・現行と同値） |
| 達成ボーナス | set_comp_component | achievement_bonus component（params の範囲内） |
| ノルマ | set_cast_norm / set_store_norm_config / set_penalty_config | cast_norms / penalty_config |
| キャスト割当 | set_cast_plan（4引数） | cast_plan（valid_from・overrides_json） |
各セクションに 保存済み／未保存 の状態表示。保存失敗はそのセクションだけ赤（他セクションに波及させない）。

## 4. 画面構成（モック順）
編集中プラン選択（新規／複製／無効化・適用人数）→ 全体構成ナビ → 採用する待遇方式（値の有無から自動判定・保存なし）→ 基本給・保証 → 売上歩合・各種バック → ポイント制 → 売上スライド → 達成ボーナス → シミュレーション（既存 sim-data・計算期間日数＋委託/雇用トグル維持）→ ノルマ＋未達処理 → キャスト割当 → 右カラム サマリー（sticky・派生表示）。
旧タブ: 控除・送り／キャスト会計 は残す。待遇プラン／ノルマ は新ページへ統合し旧タブは新ページへリダイレクト。

## 5. 受け入れ条件
- 新設純関数（採用方式の自動判定・サマリー整形・準備中判定）に assert＋逆張り。
- f0 2連緑・golden 6値不変（UI のみ＝本数不変。動いたら停止）。
- 各セクションコミット後に CC が dev で DOM 実測＋console 0（スクショはペイン表示時）。完了条件＝f0＋CC 検収＋Agoora 実機の3点。台帳の実機欄。
- 率方式（R-2b 後）が入る時は「売上歩合・各種バック」セクションの本/場内/同伴に 円/本｜率(%) トグルを足すだけで済む構造にしておく。

モデル: Opus（UI・純関数のみ）。

---

## 2. セクション → RPC/列の対応（実測補注つき）

§3 の表が正本。実測補注:
- set_comp_plan＝pronargs 16（live）・rate 送信は mode='rate' のときのみ（排他 CHECK 同輪郭）・dohan は per_count 固定送信（0115 封印）。
- set_comp_component＝pronargs 9・kind 2値（guarantee_min/achievement_bonus）・params は object のみ検証（0115 実測）。
- set_cast_plan＝pronargs 4（mig0116）・p_valid_from null=現在行上書き／指定=履歴生成・過去日 'bad valid_from'。
- set_custom_back_def＝7引数（rls:2145 の呼び形が正）。
- set_cast_norm＝6引数（rls:2119）・set_penalty_config＝12引数全明示（comp-sections PenaltyTab）・set_store_norm_config＝4引数。
- 採用方式の自動判定＝`lib/nox/comp-methods.ts adoptedMethodsOf`（段2-①・c9f663a）。

## 3. 準備中一覧（C5＝起票#42・器は作らない）

§2 の逐語列挙が正本。表示は「準備中」バッジ＋（あれば）解錠条件:
1. 日給制 2. 保証対象時間帯 3. 保証判定単位の半月・日（現行 params={period:'month'} 固定）
4. pt付与ルール・ポイント単価・使い方 5. 売上スライドの粗利基準 6. 延長バック・場内→本指名昇格バック
7. スライド帯の歩合%列 8. 歩合の丸め2軸（comp_plans に列なし・相談役裁定で C5 確定）
9. 未達処理の根拠確認記録（penalty_config に器なし・裁定98 の deductions 側と混同しない）
10. 達成ボーナスの params が表せない条件（thresholds 1段のみ）
11. 率方式バック（R-2b 後・裁定86-②）＝「追加機能（準備中）」リストへ。
