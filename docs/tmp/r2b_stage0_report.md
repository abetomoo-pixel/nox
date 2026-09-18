# R-2b 段0 報告（2026-08-31・Fable 5・裁定100 §F）

底本＝`NOX_裁定100_R2b設計.md`（sha256 `c29add11869ff45965cf28a1fc9c33a663f840669d7dc0b1630280c67ce0d8f5`・5,614 bytes・60行・mtime 15:37）。
live 逐語＝`docs/tmp/live_r2b.sql`（487行・貼り先証明 nox-project-proof n=3・4テーブル定義全件＋4 RPC 全文＋実測 d/e/f）。
設計書＝`docs/NOX_R2b設計書v1.md`（§1 逐語＋§2 調査根拠・commit c323808・push なし）・台帳に裁定100＋起票#41 収載済み。

## 実測サマリ（d/e/f）

### (d) check_lines 指名料行の (check_id, cast_id, fee_kind) 重複 — ★4組あり＝裁定待ち

| check_id | cast_id | fee_kind | n |
|---|---|---|---|
| a0af3380-b909-46f0-863e-7e7fbd067bc5 | adef8957-…cef9f | jonai_shimei | **4** |
| a0af3380-b909-46f0-863e-7e7fbd067bc5 | 78b7b932-…4698 | jonai_shimei | 2 |
| a0af3380-b909-46f0-863e-7e7fbd067bc5 | e10e272d-…866b | jonai_shimei | 2 |
| eb79138f-9fde-4c6e-aae6-7b11c6eba582 | 78b7b932-…4698 | jonai_shimei | 2 |

すべて jonai_shimei・2伝票に集中（裁定74 の「2回押すと2行入る」実測の現物）。
**★重複2伝票の実測（2026-08-31 追記・相談役指示）**: 両伝票とも **status='closed'・store=CLUB NOX**
（a0af3380=2026-08-18 開栓／eb79138f=2026-08-17 開栓）。
**★裁定（相談役・2026-08-31）**: unique は**無条件 (check_id, cast_id, fee_kind)**＝裁定100 A-4 の
「void 除外」は**撤回**（check_lines に void 列が無い実測を受けて）。両伝票 closed のため
**partial by created_at＝新規行のみ対象**（`where created_at > '<mig 適用時刻>'` 型）で既存重複は温存。
R-2b は本報告の状態で**停止のまま**（0118 起草は相談役）。

### ★設計に効く実測: check_lines に void 列が無い

`check_lines` に void 系の列は **0本**（live_r2b.sql (a) 節・void の表現は親 `checks.status='void'` のみ）。
裁定100 A-4 の「partial unique index …**and void 除外**」は、**partial index の WHERE 句が親テーブルを参照できないため
そのままでは実装不能**。選択肢（相談役裁定）:
  (i) 重複4組の dedupe（残す1行の選定規則）＋void 除外なしの partial unique（void 伝票の行も一意対象になる）
  (ii) check_lines に is_void 列を追加して同期（器が増える）
  (iii) unique を諦め RPC ガードのみ（裁定93 の部分 unique＋RPC 型の変形）

### (e) check_nominations (check_id, cast_id) 重複 — 0組 ✓（A-3 の unique はそのまま張れる）

### (f) 分布

- checks.nom_type: dohan 11 / free 34 / hon 15 / jonai 11（計71伝票）
- fee_kind='dohan' 行: 全 1 件・うち cast_id null = 1 件（A-5 の NOT VALID CHECK は既存1行温存で成立）

## 名簿・呼び出し形（段0-3）

- A 名簿（ゲート済み・[K]）: `check_set_nominations` / `check_dohan_add` / `check_close`（課金ゲート対象_v1.md:89-90・A1 レジ会計 20本）。check_close は :83 の付随裁定（失効跨ぎもゲート）。
- B 名簿（読取・非ゲート）: `get_cast_sales`（:176）。
- register-board の現行呼び出し（:647-649 逐語）:
  `supabase.rpc("check_set_nominations", { p_check_id: check.id, p_nom_type: nomType, p_nominations: list })`
  （list＝`{cast_id, weight}`・free は weight=1 へ正規化して送る＝R-2a-2 注記）。

## 状態

- **R-2b は本報告で停止＝相談役の裁定待ち**（d の dedupe 規則と void 除外の実装方式）。0118 起草はその後。
- U-2 レーンへ進行（本報告と独立）。
