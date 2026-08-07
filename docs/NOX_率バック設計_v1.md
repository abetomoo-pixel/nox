# NOX 率バック設計 v1（ロック版・2026-08-08）

正本=comp_plan 一本（料金レーン裁定B）。pricing_rules に back を持たない（二重計上封じ・v1.2 確定）。
母数の正本=0084 で凍結を開始した check_lines（fee_kind + cast_id + line_total）。

## 裁定（i–vi 確定済み・推奨採用）
- i: 率対象は hon_shimei / jonai_shimei のみ。dohan は円/本据え置き
  （check_dohan_add が cast_id を凍結しない＝母数が構造的に取れない。将来要るなら p_cast_id 追加から＝post-launch）
- ii: hon / jonai は方式を独立に切替可（hon=率・jonai=円/本の混在可）
- iii: 母数 = check_lines.line_total（サ料・丸め前の行額）
- iv: 丸め = Σ後 roundYen 1回（money.ts 規約準拠・rate商品バック/売上バックと同系。floor は源泉専用=裁定23）
- v: 円/本列（hon_back/jonai_back）は mode='rate' でも保持（切替往復で値が消えない）
- vi: ★帰属系統の乗換 = per_count は check_nominations×nom_type（在席満額計上）、
  rate は Σ(check_lines: fee_kind一致 ∧ cast_id=本人)。
  含意=rate 方式の店はレジ「指名料を追加」を押さない限りバック0円。仕様（請求した指名料の%が率バック）。
  → plan UI に運用注記必須「率方式はレジで指名料を追加した伝票が対象です」

## DB（mig0086）
comp_plans に4列:
- hon_back_mode   text NOT NULL default 'per_count' CHECK in ('per_count','rate')
- hon_back_rate   integer NULL CHECK (null or 0..100)
- jonai_back_mode / jonai_back_rate 同型
- 排他 CHECK: (hon_back_mode='rate') = (hon_back_rate is not null)  ※jonai 同型
default 'per_count' が backfill を兼ねる＝既存全プラン現行同値（玲奈 golden 5170/5931 は per_count 経路不動）。

RPC 改稿2本（live 全文起点）:
- set_comp_plan: 10→14引数（末尾に mode/rate ×2・default 'per_count'/null）。旧シグネチャは drop
  （PostgREST の rpc 曖昧ディスパッチ回避）。default により旧形式呼び出しは動くが、
  ★rate プランを旧形式で update すると per_count に戻る（値は消えない）＝D3 で UI を同時更新して閉じる。
  検証追加: mode 2値・rate 0..100・排他（(mode='rate')=(rate not null)）
- set_cast_plan: overrides キーを8種に拡張（+honBackMode/honBackRate/jonaiBackMode/jonaiBackRate）。
  mode=string 2値・rate=int 0..100。★原子性検証:
  honBackMode あり→ 'rate' なら honBackRate 必須・'per_count' なら honBack 必須／
  honBackRate あり→ honBackMode='rate' が同時に必須。jonai 同型。
  「mode だけ override して値が plan から来る合成」を RPC 権威で拒否。

## 計算（payOf・money-core・app=Fable 5）
- collect.ts: 新 load＝check_lines を store×窓で集計
  （fee_kind in ('hon_shimei','jonai_shimei') ∧ cast_id not null、checks!inner join、
   窓= checks.started_at [startTs, endTs)・neq status 'void'＝close 非依存＝0047 drink_claims 系列に整列）
  → cast 別 honShimeiAmt / jonaiShimeiAmt を CastRaw へ追加
- pay.ts: honBack = eplan.honBackMode==='rate'
    ? roundYen(cast.honShimeiAmt * eplan.honBackRate / 100)
    : cast.hon * eplan.honBack          ※jonai 同型・per_count 経路は1バイト不変
- applyOverride: mode/rate をペア原子で適用（RPC が保証するが TS 側も同輪郭で防御）
- payslip: breakdown_json.pay.honBack へ円凍結＝slip/CSV 無改修で成立。方式の明示表示は post-launch
- Simulator: mode 別入力出し分け（per_count=本数・rate=期間の指名料額）＋単位表示。SimInput 拡張

## 検証（段45）
1. ★玲奈 golden 5170/5931・withholding 125802 完全不変（per_count 構造 assert＋実測）
2. rate fixture: Σ指名行×% = roundYen 一致・void 除外・open 伝票算入（0047 系列）・他 cast 不算入・窓境界
3. 混在（hon=rate/jonai=per_count）・override 原子性（ペア○・単独×＝RPC 負系）
4. 排他 CHECK/RPC 負系・切替往復で円/本値残存・旧形式 update の mode 戻り（既知挙動として固定）
5. verify:f0 全緑・pay 83→+N

## スコープ外（post-launch）
dohan 率・固定額 'flat'・payslip 方式表示・支払調書等への波及なし（gross 合算は同型）
