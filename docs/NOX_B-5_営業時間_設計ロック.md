# NOX B-5 営業時間 bands 設計ロック（スライスA確定版）

最終更新: 2026-07-13 / 状態: スライスA（④+①）完結・origin/main 8533a18
mig0032 + verify 段25 + UI（lib/nox/business-hours.ts, master 設定パネル, reservation-panel 警告/ブロック）

## 0. 全体像とスコープ

店ごと・曜日別の営業時間（開店/閉店・日跨ぎ対応）+ 定休日を定義するマスタを新設し、
予約・（将来）シフトがそれを参照する。目的は単一でなく複数機能の共通土台。

- **スライスA（本doc・完結）**: ④営業時間マスタ + ①予約バリデーション（定休日拒否・時間外警告）
- **スライスB（完結）**: ②シフト連携（営業時間外シフト制御）
- **スライスC（未着手）**: ③時間帯別集計

## 1. 確定裁定（4論点）

### 裁定1: 定休日=RPC拒否 / 時間外=UI警告（非対称）
- 定休日の予約は reservation RPC が raise 'closed day' で拒否（server 強制・二層目）。
- 営業時間外の予約は **拒否しない**。UI が警告表示するのみ（予約は成立）。
- 理由: 夜職は早入り・延長など営業時間前後の実務がある。時間外完全拒否は硬すぎる。
  定休日（店が閉まっている日）は明確な誤りなので拒否。
- 実装上の含意: RPC は「拒否 or 通過」の二値で「通すが警告」ができない。
  よって時間外警告は UI の責務・RPC は定休日のみ拒否。

### 裁定2: 営業日 dow = cutoff 変換（深夜帯=前営業日）
- 予約 reserved_at を「どの曜日の営業か」に解決する際、cutoff（biz_cutoff_hm・既定06:00）で営業日を出す。
- 深夜帯（cutoff 前の未明）は前営業日の曜日に属する。
  例: 日曜定休なら月曜 03:00 JST は「日曜の営業」＝定休日として拒否。
- 式: `extract(dow from (timezone('Asia/Tokyo', reserved_at) - (cutoff||':00')::interval)::date)`
- extract(dow) は 0=日..6=土で JS getDay と完全一致（実測済み）。
- cutoff は集計RPC（cast_sales_aggregate 等5本）の営業日境界と同じ定義。①はそれを読むだけで cutoff 自体は非改変。

### 裁定3: cast 0行（RLS パターン2）
- store_business_hours の RLS は staffing_needs 型（owner=org全店/manager・staff=自店/cast=0行）。
- cast は予約 UI 非到達なので①②だけなら足りる。営業時間は機密性低いが、
  店マスタ系の一貫性（cast は自分に関係する行のみ）を優先。将来 cast 表示が要れば専用経路を足す。

### 裁定4: 時刻表現=24h超表記（shift-time.ts 互換）
- open_hm '00:00'-'23:59' / close_hm '00:00'-'47:59'（shifts.end_hm と同 regex）。
- 日跨ぎ営業（20:00-翌6:00）は close を 24h超表記（30:00）で表現。
- シフト側（shift_wishes/shifts の start_hm/end_hm）と同じ表現＝②シフト突合が lib/nox/shift-time.ts 1本で成立。
- close > open は 24h超なので text 比較不可。分に変換して比較（split_part → 分計算）。

## 2. ④マスタ仕様（mig0032）

### store_business_hours テーブル（staffing_needs 型踏襲）
- id uuid PK / org_id / store_id / dow smallint(0-6) / is_closed bool default false /
  open_hm text null / close_hm text null / created_at / updated_at
- unique(store_id, dow)
- CHECK: dow 0-6 / both-or-neither（is_closed=true→open/close両null・false→両not null）/
  open_hm regex 00:00-23:59 / close_hm regex 00:00-47:59
- updated_at トリガ = 汎用 touch_updated_at()（29テーブル共有）
- RLS: SELECT のみ（パターン2・cast 0行）
- **grant: authenticated=SELECT のみ**（★教訓4参照）

### set_store_business_hours(p_store_id, p_dow, p_is_closed, p_open_hm, p_close_hm)
- set_staffing_need 写し。null guard → dow検証 → both-or-neither/形式/close>open（分変換）検証 →
  store org照合 → owner/manager(自店)ゲート → before取得 → on conflict(store_id,dow) do update → audit。
- close>open: v_open_min/v_close_min に分変換し v_close_min > v_open_min を強制（bad hours）。

## 3. ①予約バリデーション（mig0032）

### reservation_is_closed_day(p_store_id, p_reserved_at) → boolean
- reserved_at → JST・cutoff で営業日 → dow → store_business_hours 突合。
- 戻り: true=定休日（拒否対象）/ false=営業日または**未設定**（通す）。
- **時間外は判定しない**（UI 警告の責務）。定休日のみ true。
- 未設定（行なし）は coalesce(v_closed, false)=false で通す＝後方互換。

### reservation_create/update への挿入
- create: store org照合の直後に `if reservation_is_closed_day(...) then raise 'closed day'`。
- update: not editable 判定の直後に同（店は既存行 v_res.store_id）。
- 挿入ブロック以外は F3b-B の全文と完全一致（closed day チェック1ブロックのみ追加）。

## 4. UI（8533a18）

### lib/nox/business-hours.ts（UI 判定の単一ソース）
- DB helper と同じ cutoff 変換で営業日 dow を解決（深夜帯=前営業日）。
- 時間内判定は shift-time.ts の hm2min/min2hm 再利用（24h超表記の意味論共有）。
- 4値: closed / outside / inside / unset ＋「20:00-翌06:00」表示整形。
- ★UI と DB helper が同ロジック＝「UI は営業日判定・RPC は定休日拒否」の食い違いを防ぐ。

### master 営業時間パネル（店設定系）
- 店×曜日7行。close は「time入力＋翌日チェック」で受け、送信時に24h超表記へ変換（DB正本30:00）・読込時逆変換で「翌06:00」復元。
- 保存は曜日ごと（一括だと未設定曜日まで行を作り後方互換を壊す）。
- owner は store select・manager は自店固定。bad hours 日本語化＋クライアント側先行検証。

### 予約パネル
- 定休日: 赤注記＋追加/保存ボタン無効（一次ブロック）＋送信時ガード保険＋RPC二層目。
- 時間外: 黄警告のみで送信可（非対称）。
- 未設定: 無注記。
- 編集は予約の店が register の店と一致する場合のみ UI 判定（owner 他店予約は RPC 二層目委譲）。

## 5. 教訓（本スライスで確立）

### 教訓4: 新テーブルの grant は authenticated も明示 revoke
- `revoke all from public, anon` だけでは不十分。
- Supabase は create table 時に **authenticated へ全権限を自動 grant** する。
- 新テーブルは `revoke insert,update,delete,truncate,references,trigger from authenticated` も明示。
- RLS で実害は止まる（SELECT ポリシーのみ＝書込はポリシー不在で拒否）が、多層防御の grant 層が欠ける。
- verify-nox-grants（grants スイート）がスキーマ全体で最小 grant を監視・store_business_hours も乗った。

## 6. verify（段25・19 assert）

- set: owner営業日set/定休日set/manager自店成功・他店forbidden/staff forbidden/
  bad hours（片方null・close≤open・24h超close>open成功）/upsert上書き。
- 予約: 定休日拒否/深夜帯の前営業日解決/時間外は通る/未設定は通る/update定休日拒否/cast 0行。
- ★汚染防止: store_business_hours 行を try/finally 全消し+残0 assert。
  同一run内で段21（席予約）緑＝営業時間行の非汚染を実証。時刻は当月中旬基準・dow は実日付動的解決。
- f0 1272 全緑・grants 105 緑（grant 独立検証）。

## 7. スライスB（②シフト連携）確定版

実装済み・origin/main e793e65（mig0033 + verify 段26 = 35ac886 → UI）。スライスA裁定を踏襲しつつシフト固有の2裁定を追加。

### 裁定B-1: 定休日=RPC拒否 / 時間外=経営側UI警告（非対称・スライスA裁定1踏襲）
- 定休日のシフトは RPC が raise 'closed day' で拒否（server 強制・二層目）。
- 営業時間外のシフトは拒否しない。経営側 UI が黄警告を出すのみ（登録は成立）。
- 早入り・準備・残業は夜職の日常＝時間外拒否は予約以上に不適。定休日（店が閉まる日）のみ拒否。
- ★cast は store_business_hours 0行（裁定3）＝cast セルフ UI に時間外警告は構造的に出せない。
  サーバ拒否（定休日）だけが cast に効く層、の点でも裁定1の非対称と整合。未設定 dow は通す（後方互換）。

### 裁定B-2: シフトの営業日 dow = date 直（cutoff 変換なし）
- shifts/shift_wishes の date は mig0008 決定3 で「営業日 D」を宣言済み（深夜は 24h超 end_hm で表現）。
  よって date の曜日をそのまま extract(dow) で使う（予約の実時刻→cutoff 変換とは別物）。
- ★予約用 reservation_is_closed_day（cutoff 変換）とは別ヘルパー shift_is_closed_day を新設。
  予約用をシフトに流用すると深夜帯で1日ズレる（二重変換）＝別関数で誤用防止（UI 側も別関数で同型）。

### 裁定B-3: 挿入点3本（shift_wish_submit / shift_set / shift_wish_decide）
- shift_wish_submit: cast の誤提出を即拒否（casts 解決直後）。
- shift_set: create/update 共通。ロール照合の**後**に判定（他店曜日の probing 防止＝mig0007 の照合順の流儀）。
- shift_wish_decide: **accept のみ**拒否（提出後に定休日設定された競合の防波堤）。
  reject は定休日でも可（accept 拒否時は raise でロールバック＝wish は pending のまま・reject は rejected へ遷移）。

## 7-2. mig0033 / verify 段26（35ac886）

### mig0033（dev/本番とも適用済み）
- ヘルパー shift_is_closed_day(store_id, date)＝date の extract(dow) で store_business_hours を突合。
  行なし=false（後方互換）。grant authenticated（reservation_is_closed_day と同格・boolean のみ返る）
  ＝cast UI の定休日事前判定の専用経路を兼ねる（裁定3「将来 cast 表示が要れば専用経路」の最小形）。
- 3 RPC 書き直しは live（=mig0009 全文）＋挿入1ブロックのみ。挿入以外の完全一致を正規化 diff で機械証明済み。

### verify 段26（anon-guard・16 assert）
- anon BLOCKED / 定休日 wish=closed day＋wish 0行（ロールバック実証）/ 時間外 wish 成功（非対称）/
  未設定 dow 成功（後方互換）/ 定休日 shift_set(create)=closed day /
  時間外 create 成功→update で定休日へ=closed day＋既存行 date 不変の物理確認 /
  cast helper 直呼び=定休日 true・未設定 false（authenticated grant の boolean 専用経路）/
  decide 競合=accept 拒否・wish pending 維持・shifts 未生成／reject は定休日でも可=rejected。
- ★汚染防止: 営業時間行の残存は段21 や verify:nox-rls（2026-07-15 固定日 wish）を closed day で壊すため
  try/finally 全消し＋残0 の物理確認 assert。f0 1288 全緑（旧1272+16）・grants/rls 非汚染。

## 7-3. UI（e793e65・純フロント・mig なし）

- lib/nox/business-hours.ts: シフト用に shiftDateDow（date→dow）＋shiftHoursStatus（4値・date 直）を追加。
  時間内判定は shift-time の hm2min/spanMinutes 再利用（24h超/跨ぎ表記を同一正規化・inside=シフト全体が営業時間内）。
  予約用 businessHoursStatus（cutoff 変換）は無変更（★シフトに流用禁止をコメント明記）。
- シフト管理（shift-board）: 新規フォーム＝定休日は赤注記＋登録無効（一次ブロック・二層目は RPC）・
  時間外は黄警告のみで登録可（20:00-翌06:00 の逆変換表示・非対称）・未設定は無注記。
  確定シフト一覧＝定休日化された行に赤チップ＋確定無効（update 経路）。
  希望採否＝定休日 wish は「採用不可・見送り可」チップ＋採用のみ無効（裁定B-3 の非対称を UI に明示）。rpcErrJa で closed day 日本語化。
- cast 希望提出（wish-form）: shift_is_closed_day を直呼びして定休日を事前ブロック（boolean のみ＝営業時間帯は漏れない）。
  時間外警告は cast に出せない（テーブル 0行＝構造的制約）。二層目は RPC 'closed day' の日本語化フォールバック。

### staffing_needs との整合（スライスC への含み）
- staffing_needs（曜日別必要人数）と store_business_hours（曜日別営業時間）が揃った。
  「営業する曜日の必要人数」の整合はスライスC 以降で視野。

## 8. スライスC（③時間帯別集計）

- 未着手。時間帯別（アーリー/ゴールデン/ラスト等）の売上・指名・客数分析。
- 営業時間 bands を時間帯区分に使うか、別の bands 概念を立てるかは未裁定。

## canonical / 正本

- 対の正本: NOX_認可設計_RLS.md / NOX_F3a-3_予約機能_設計ロック確定版.md / NOX_F3b-B_席予約_設計ロック確定版.md
- mock: nox-nightwork-app-responsive.html
