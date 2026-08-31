# NOX R-2b 設計書 v1（裁定100・2026-08-31）

底本＝相談役起草 `NOX_裁定100_R2b設計.md`（2026-08-31 受領・sha256
`c29add11869ff45965cf28a1fc9c33a663f840669d7dc0b1630280c67ce0d8f5`・5,614 bytes・60行）。
§1 は底本の**逐語転記**（1バイト改変なし）。§2 は 2026-08-31 の R-2b 設計前調査（実測）を根拠として添付。
段0 の live 逐語＝`docs/tmp/live_r2b.sql`（0118/0119 起草の底本・記憶で書かない）。

---

## 1. 裁定100 本文（逐語）

# 裁定100（2026-08-31）R-2b 設計＝キャスト別指名種別・同伴の別軸化（裁定74 の実装仕様）

前提: 裁定74（骨子）・75（請求/バック分離は live 既存が正本）・76（dohan rate は現場要望後）・86-②/④・起票#18。
裁定(g)「指名は単一＝1伝票1 nom_type・モック準拠」は本裁定で**明示的に上書き**する。
モック nox-register-pos.html の「指名の分配率」カードは卓単位表現のため R-2b 後に v2 追随が必要（起票#41）。
原則: **器は増やし、既存データの意味は変えない**。backfill で現行の伝票単位の値をキャスト別へ1バイト同値に写す。golden 6値不変は構造で保証する。

## A. 器（mig0118・RPC 不触・挙動ゼロ変更）
1. `check_nominations` に2列追加:
   - `nom_kind text not null default 'free'` CHECK in ('hon','jonai','free')
   - `is_dohan boolean not null default false`
   同伴と指名種別は別軸（裁定74）。同一キャストに hon かつ dohan が同時成立可（裁定86-④ 加算既定）。
2. backfill（idempotent・既存行のみ）: 親 `checks.nom_type` が
   'hon'→nom_kind='hon' / 'jonai'→'jonai' / 'dohan'→nom_kind='free', is_dohan=true / 'free'→そのまま。
   ＝現行「伝票の種別を名簿の全キャストへ帰属」と同値。
3. `check_nominations` に unique (check_id, cast_id)。事前に重複の有無を live で実測（重複があれば mig 前に裁定）。
4. `check_lines` 指名料行の二重登録禁止（裁定74・起票#18）: partial unique index
   (check_id, cast_id, fee_kind) where fee_kind in ('hon_shimei','jonai_shimei','dohan') and void 除外。
   事前に live で重複を実測（2回押し行があれば void 側を裁定）。
5. 同伴料の cast_id 必須: `check (fee_kind <> 'dohan' or cast_id is not null)` を **NOT VALID** で追加
   （既存の cast_id=null 行は温存・新規行のみ強制。本番 DB は空から構築のため実害なし）。
6. `stores.dohan_auto_hon boolean not null default false`（同伴時の本指名自動付与・裁定75 の実列）。
7. `checks.nom_type` は**残す**が正本ではなくなる＝派生サマリ（hon>jonai>dohan>free の優先で RPC が書く）。
   receipt.ts の型互換のため。撤去は R-2c で別裁定。

## B. RPC（mig0119・drop→create・live 逐語 baseline 必須）
1. `check_set_nominations`: 引数を p_check_id, p_nominations jsonb[{cast_id, weight, nom_kind, is_dohan}] へ
   （p_nom_type を撤去＝旧署名 DROP・4者 revoke→grant）。検証: nom_kind ∈ 3値／free は weight=1 固定（据え置き）／
   同一 cast 重複は拒否／`stores.dohan_auto_hon` かつ is_dohan かつ nom_kind='free' → 'hon' へ昇格（明示 jonai は昇格しない）／
   checks.nom_type を派生サマリで更新。
2. `check_dohan_add`: cast_id 必須（null は 'cast required'）。
3. `get_cast_sales`: hon/jonai/dohan 本数を `checks.nom_type` ではなく `check_nominations.nom_kind / is_dohan` から
   キャスト別に数える（A-2 の backfill により既存伝票は同値）。
4. `check_close`: 分配を「卓から1回引く」から「名簿の行ごとに積む」へ。pt 付与は nom_kind='hon' の行のみ（現行踏襲）・
   dohan は is_dohan 行へ。既存伝票は同値。
5. 0115 の `dohan rate requires R-2b` ガードは**本レーンでは外さない**（裁定76: 現場要望後に1行差替の独立 mig）。
   ただし dohanShimeiAmt（fee_kind='dohan'・cast_id=本人）が集計可能になったことを設計書に記録。

## C. 鏡（同時に変える面・裁定92 の表示面込み）
check_close RPC ／ get_cast_sales ／ collect.ts（cast 実績読み）＋pay.ts（本数×バック）／ register-board（指名カード）。
check-calc.ts は nom_type 非参照＝不触。receipt.ts は型のみ＝不触。

## D. UI（register-board・最小）
指名カードの「卓で1種別」セレクタを廃し、キャスト行ごとに 種別（本/場内/フリー）＋同伴チェック＋重み。
指名料/同伴料の課金ボタンはキャスト行に紐づけ（同伴料は cast 必須）。二重押しは RPC 拒否を日本語化。
モック v2（起票#41）は実装後に追随。

## E. 受け入れ条件
- golden 6値不変（5931/125802/55233/64/64/53）・f0 2連緑。
- 新スイート verify-nox-r2b: (1) backfill 同値＝全 live 伝票で旧 nom_type 由来の本数と新キャスト別本数が一致（zero-result は fail）
  (2) 同一 cast に hon+dohan → hon=1・dohan=1 (3) 指名料行の二重登録が拒否 (4) 同伴料 cast なしが拒否
  (5) dohan_auto_hon で free→hon 昇格・jonai は不変 (6) 1伝票に hon と jonai の2 cast → 各自の種別で分配
  (7) nom_type 派生サマリの優先順 (8) dohan rate ガードが封印のまま。全 assert 逆張り。
- 名簿同期（教訓21）: 新旧 RPC を A/B へ収載。billing 名簿本数の増減を明記。
- 実機: レジで 2 cast（本指名＋同伴）→ 締め → 給与プレビューで本数が各自に立つ。CC スクショ＋Agoora済で「済」。

## F. 段取り・モデル
設計書ロック → 段0 live 逐語（Fable 5）→ 0118 起草（相談役）→ 手貼り → CC 検証（f0 不変）→
0119 起草（相談役・4 RPC の live 逐語底本）→ 手貼り → CC 実装（TS/UI/verify）→ 逆張り → f0 2連 → push。
Fable 5 は段0 から push まで継続（money 直撃）。

---

## 2. 根拠（R-2b 設計前調査・2026-08-31 実測）

### 2-1. 現行の器（live）

- `checks.nom_type`＝卓単位の単一値・`CHECK (nom_type IN ('hon','jonai','dohan','free'))`＝裁定(g) の器（A-7 の温存対象）。
- `check_nominations`＝`id/org_id/store_id/check_id/cast_id/ratio_weight int/position int/created_at`。**種別列なし・(check_id,cast_id) の一意制約なし**（A-1/A-3 の対象）。
- `check_lines.fee_kind`＝`CHECK (NULL or IN ('set','extension','dohan','hon_shimei','jonai_shimei'))`。hon/jonai_shimei は cast_id 付き（mig0084）・**dohan 行は cast_id=null**（A-5/B-2 の対象）。二重登録ガードなし＝裁定74 の実測（2回押しで2行）どおり（A-4）。

### 2-2. 三面鏡の現在地

- check_close＝最新定義 0088_billing_gate.sql（:296 分配・最大剰余法・pt は nom_type='hon' のみ／:343 `if v_chk.nom_type = 'hon'`）＝「卓から1回引く」の現行実装（B-4 の改修点）。
- get_cast_sales → collect.ts:437（hon/jonai/dohan 本数の唯一の給与入力）→ pay.ts:487-492（per_count＝本数×円/本・rate＝Σ指名料行×%）。
- check-calc.ts＝nom_type 非参照（請求は行合算）・receipt.ts:44＝受けるが印字しない → C の不触2面の根拠。
- register-board＝卓単位 `nomType`（:367/:486/:1900 の4ボタン）＋`check_set_nominations(p_check_id, p_nom_type, p_nominations[{cast_id,weight}])`（:647）・開栓は p_nom_type='free' 固定（:620）・課金行は別カード（:313 check_shimei_add / check_dohan_add）＝D の改修面。

### 2-3. 封印と分布

- dohan rate ガード＝0115_c1_comp_v2_rpc.sql:115 `raise exception 'dohan rate requires R-2b';`（B-5 で温存）。
- UI 準備中表示＝comp-sections.tsx:309/:370。comp_plans の back_mode は live 全5行 per_count（rate 0件）＝解錠時も既存プラン不変。

### 2-4. verify・golden の影響半径

- rate-back 64本＝玲奈 golden pin（T1a=5170/T1b=5931/125802）＋系統分離 assert（rate 側は check_nominations 本数に反応しない）。payroll 177本に `cast.hon=1（伝票単位）` pin あり＝B-3 の同値 backfill が受け入れ条件（E-1）。SD 55233 は不関与（裁定86 実測）。

### 2-5. モックの現状（起票#41 の根拠）

- nox-register-pos.html の「指名の分配率」カード＝指名区分を卓で1つ選ぶ表現（内部 JS も `t.shareType` 卓単位・`$('shareNominationType')` 単一 select）＝キャスト別種別の表現なし → R-2b 後に v2 追随（起票#41）。

### 2-6. 段0 live 逐語

- `docs/tmp/live_r2b.sql`（貼り先証明 n=3・4テーブル定義全件＋4 RPC 全文＋重複実測 d/e＋分布 f）＝0118/0119 起草の底本。
