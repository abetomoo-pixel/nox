# C3/C4 追加実測（税） — T4〜T6 回答受領後の現状照合

読み取り専用調査（2026-08-28）。**設計はしない**。dev DB = mig0001〜0110。
回答正本 = `docs/expert/NOX_税理士回答_T4-T6_2026-08-28.md`。

## 結論（3行）

1. **「TAX込み調整＝非課税」は実装に存在しない**＝モックの商品サンプル1行のみ（しかも `active:false`）。
   実装の伝票補正は `kind='discount'` 行で、税は値引き後の `groupDue` から算出＝**税理士の指示
   （課税売上への値引きとして税額に反映）と現行実装は既に一致**している。是正対象はモック側の概念だけ。
2. **端数は「サービス料の円丸め1回＋店設定丸め1回＋税 floor 1回」の3層・各1回**で、
   「一伝票×税率ごとに1回」の要件を**現行で満たす**（1レシート=1 pay_group=1インボイス）。
   丸め鏡像は DB（`check_group_due`）／TS（`check-calc.ts`）／`receipt.ts` の3点セット＝**同時改修が既定の規律**。
3. `receipt.ts` は適格簡易請求書の6要件を**単一税率10%内税の前提でならすべて充足**。
   C3/C4 で動く golden は **52（receipt）のみ**＝64（率バック）と51（課金ゲート）は税と無関係。

## a. モック正本の確定材料（裁定はしない）

| 観点 | `nox-rate-settings-redesign.html`（pricing-board.tsx:3 が底本と宣言） | `pages-2026-08/nox-pricing-settings.html`（教訓40 の照合正本群） |
|---|---|---|
| 会計ルールの区画 | h2「時間課金と会計の運用ルール」＋h3 サービス・カード料金／端数処理 | h1「会計ルール」→h2 営業日・時間計算／**税・サービス料**／端数・精算／確認・権限 |
| 内税/外税 | **出現ゼロ**（語が無い） | 「消費税 内税・外税の扱いを選択します」＋**適用しない**の3択 |
| 非課税 | **出現ゼロ** | 3回（うち1回が商品サンプル「TAX込み調整」の `tax:'非課税'`） |
| カード | 「カードTAX率 %」（＝実装の `card_tax_rate` と同語彙・日報集計用） | 「カード手数料 カード決済の場合のみ加算されます %」＝**客への転嫁を示唆** |
| 端数 | 「丸め単位 1/10/100/1,000円・丸め方」＝実装の `round_unit/round_mode` と一致 | 「端数・精算」区画（スイッチは実装で disabled） |

**材料の含意**: redesign 版は**現行実装と同じ税モデル**（内税固定・カードTAX=日報集計）で、
pages-2026-08 版だけが T5/T6 の新概念（内税外税切替・カード転嫁・非課税）を先取りしている。
T5 回答は pages 版の3択を「同列 3択にはしない」と修正したため、**どちらのモックもそのままでは正にならない**
（正は回答の推奨構造）。→ 正本裁定は C3/C4 設計時に。

## b. 「TAX込み調整」の全経路

- **出現は1箇所のみ**: `mock/pages-2026-08/nox-pricing-settings.html:166`
  `{name:'TAX込み調整',category:'その他',note:'指定伝票のみ手動で適用',price:0,unit:'1伝票',tax:'非課税',active:false}`
  ＝**商品マスターのサンプルデータの1行**。実装（app/lib/DB）に「TAX込み調整」「非課税」の概念は**一切ない**。
- 実装の伝票補正の実体 = **`check_lines.kind='discount'`**（F3c 割引/無料承認ワークフロー）:
  - 画面: `register-board.tsx`（申請 `:1118`〜・`apType 'discount'|'free'`）
  - RPC: `discount_request` / `discount_apply` 系（正値で discount 行を insert）
  - 集計: `check_group_due` が `kind<>'discount'` を gross、`='discount'` を減算（`receipt.ts:13-15` に同式）
  - dev 実データの `kind` は7種のみ: drink/bottle/set/charge/time/champ/**discount**（distinct 実測）
- 税への反映: `taxOf(groupDue)`＝**値引き後**の請求額から floor(×10/110)。
  ＝「-600円の非課税取引が発生」する構造は**現行に存在しない**。回答 T4 の要修正点はモック概念の不採用だけで済む。

## c. 端数の現行実装（どの単位で何回）

**読み手の全箇所**（`round_unit`/`round_mode`）:

| 層 | 箇所 | 内容 |
|---|---|---|
| DB | `check_round_amount`（SQL 関数・prosrc 実測） | unit≤1=round／up=ceil／down=floor／else round × unit 復元 |
| DB | `check_group_due` | due = Tp(Bx + round(Bx×service_rate%)) に `check_round_amount` を適用（**1回**） |
| DB | `check_open`（3回出現）・`kiosk_check_detail`（2回） | settings snapshot の凍結・読み出し |
| DB | `set_store_pricing`（9回） | 設定の書込・検証 |
| TS | `lib/nox/check-calc.ts:17-27` | `roundAmount`/`groupDue`＝DB と同式の**表示用鏡像**（権威はサーバ） |
| TS 使用元 | register-board / print poll route / kiosk-register / sales-alloc | 鏡像の消費のみ |

**回数の実測**（1 pay_group の請求額確定まで）:
1. サービス料の円丸め: `roundYen(Bx×rate/100)`＝half-up **1回**
2. 店設定丸め: `check_round_amount(Bx+サ料, round_unit, round_mode)` **1回**（差額はレシートに「端数調整」行）
3. 消費税: `taxOf(groupDue)=floor(groupDue×10/110)` **1回**＝**一伝票（=1 pay_group=1インボイス）×税率ごと1回の要件に現行適合**
- 商品ごとの税丸めは**していない**（T5 の「1商品ごとに切り捨てない」要件も現行適合）
- ★3点セット規律（`check-calc.ts:8-10` 明文）: `check_group_due`（DB）・`check-calc.ts`（鏡像）・`receipt.ts`（税率別内訳）は**必ず同時改修**

## d. receipt.ts の出力項目 vs 適格簡易請求書要件

出力全項目（`receipt.ts:160-204` 実測）: 店名／住所／TEL／**登録番号**（空なら行ごと省略）／再発行表記／
伝票 No（check_id 先頭8桁+pay_group）／**日時**（closed_at の JST）／明細（名称×qty・行計・discount はマイナス）／
小計／割引／サービス料(率%)／端数調整／**合計**／**（内消費税10%）**／支払方法別金額／お預かり・お釣り／footer。

| 適格簡易請求書の要件（T5 回答） | 現行 | 差分 |
|---|---|---|
| ① 発行者の氏名・名称・**登録番号** | 店名＋`reg_no`（T+13桁は `set_store_receipt_profile` 検証済み） | **reg_no 空だと行が消え、レシートは出るが適格簡易請求書ではなくなる**＝T5 の invoice_registered 区分と整合（現行は暗黙・明示化は C4） |
| ② 取引年月日 | closed_at の JST 印字 | 充足 |
| ③ 取引内容 | 明細（name_snapshot×qty） | 充足（軽減税率対象の明示は対象外＝酒類のみ前提） |
| ④ 税率ごとに区分した対価の額 | 「合計」＝10%のみの単一区分 | **単一税率の前提でのみ充足**。8% 併存時は税率別小計が必要（F5 差し替え点として `receipt.ts:8-10` に明文） |
| ⑤ 適用税率または消費税額等 | 「（内消費税10%）」＝税率と税額の両方 | 充足 |
| ⑥ 書類の交付を受ける者（簡易では**不要**） | 出していない | 要件どおり（宛名は領収書 `/r/[token]` 側の別系統） |

**差分の要旨**: 現行の未充足は「複数税率」だけで、それは意図された F5 差し替え点。
C4 で足すのは④の**器**（tax_category 別集計）と①の**明示化**（invoice_registered/business_tax_status）。

## e. golden 52/64/51 の係留先

> ★基準線更新（2026-08-28・読み経路段）: receipt スイートは **52→57**（新 assert 5本＝
> 既定同値の機械証明＋税端数の性質固定。金額系 5931/125802/55233 と XML sha pin 7本は不変・
> 逆張り済み）。以後の golden 6値 = **5931/125802/55233/57/64/51**。本節の「52」は調査時点の値。

| 値 | スイート | 係留対象 | C3/C4 で動くか |
|---|---|---|---|
| **52** | `verify-nox-receipt` | `receipt.ts` 純関数＝XML 全文 sha pin＋税額・合計の意味 assert（DB 不要） | **動く可能性が高い**＝税表示・税率別内訳・endpoint 丸めのいずれを変えても sha が割れる（割れたら差分根拠を台帳に残して張り替え） |
| **64** | `verify-nox-rate-back` | mig0086 率バック＋玲奈 golden 不変（5170/5931/125802） | **動かない**（C1 側の値。税と無関係） |
| **51** | `verify-nox-billing` | 課金ゲート対象 RPC の集合一致（prosrc 機械照合）＋述語真理値表 | **原則動かないが要注意**＝C3/C4 で**書込 RPC を新設/署名変更**すると billing pin（対象名簿の本数）が動く（例: `set_pricing_rule` 署名変更・税設定 setter 新設）。金額計算ではなく**名簿の本数**として動く |

★まとめ: C3/C4 の golden 影響は **52＝実額・51＝名簿・64＝無関係**。5931/125802/55233 は不関与。
