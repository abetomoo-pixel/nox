# NOX F2完結＋デザインD1完了 引き継ぎ（実装インベントリ正本・CC セッション切替用）

> このファイルは新 CC セッションが最初に読む正本。CLAUDE.md → 本書 → docs/ 各設計書の順に読む。
> 相談役チャットには CC の Read 出力が届かないため、CC がここに残さないと文脈が失われる（過去の教訓）。
> **特にデザイン移行記録（§3）は verify で緑にならない＝ここにしか記録がない。厚く記す。**

作成 2026-07-08 / origin/main = **b757b51**（F2完結＋デザイン既存画面ダーク移行・ahead 0 同期済み）

---

## 0. いま何が終わっているか（1行）

F0基盤 → F1(POS/シフト/日報/順位) → **F2 報酬/税務グループ完結**（F2a マスタ・F2b 機密分離・F2c 給与確定+インセンティブ・F2e-1/2 天引き・F2f シミュレーター・F2d mynumber暗号化/支払調書/payment）→ **デザインフェーズ D0+D1（既存主要画面を黒×ゴールドのモックトーンへダーク移行）** まで完了・push 済み。verify:f0 **816 全緑**。

---

## 1. 設計書インベントリ（docs/・正本宣言）

- **CLAUDE.md**（開発規約・最優先）
- **NOX_データモデル設計_Supabase版.md**（テーブル/列・cast プライバシー3パターン・F2d 追記済み）
- **NOX_認可設計_RLS.md**（RLS/RPC 二重防御9原則・§2.3 プライバシー・§2.4 機密・F2d 追記済み）
- **NOX_計算ロジック設計_payOf.md** ＋ **NOX_payOf_精密仕様_モック抽出.md**（payOf 正本）
- **NOX_段階リリース計画.md**（F0〜F4・F2d ✅ 実装済に更新済み）
- **NOX_BANZEN流用マップ.md**（../makanai-shift からの翻訳マップ）
- **★NOX_デザインシステム.md（新規・D0）＝デザインの正本**（モック nox-nightwork-app.html から写経したトークン。§3 参照）
- 完了引き継ぎ: NOX_F1完了・NOX_F2b完了・NOX_F2e1完了・**本書（F2d/デザインD1 完了＝最新）**
- 専門家質問 docx 3本（社労士/税理士/弁護士・git 追跡外・Downloads 別置き）

---

## 2. 実装済みインベントリ

### マイグレーション（nox-dev 適用済み・0001〜0021 の21本・番号順で新環境再現可）

| # | 名前 | 内容 |
|---|---|---|
| 0001 | f0_auth_core | orgs/stores/users/memberships/casts/認可ヘルパー4本 |
| 0002 | f0_audit | audit_logs＋audit_log_write |
| 0003 | f0_table_grant_tighten | grant 標準型（revoke all→grant select・TRUNCATE 対策） |
| 0004 | f0_internal_fn_service_revoke | 内部関数 4ロール revoke（service_role も剥がす） |
| 0005 | f1a_helper_fix_products_seats | products/seats/bottle_keeps/stock_logs |
| 0006 | f1b_checks_schema | checks/check_nominations/check_lines/payments/check_cast_backs/receivables |
| 0007 | f1b_checks_rpc | 会計 RPC（open/add_line/pay/close/void 等） |
| 0008 | f1d_shift_schema | shift_wishes/shifts/attendance/punches/staffing_needs |
| 0009 | f1d_shift_rpc | シフト/勤怠/打刻 RPC（セルフ/代理/decide） |
| 0010 | f1e_daily_reports | daily_reports＋締め/再締め |
| 0011 | f1f_ranking_staff | get_cast_ranking（順位/件数のみ）・staff 遮断 |
| 0012 | f2a_comp_master_schema | comp_plans/cast_plan/cast_norms/deductions/penalty_config/custom_back_defs |
| 0013 | f2a_comp_master_rpc | 報酬マスタ RPC（set_comp_plan は owner 限定・他 manager+） |
| 0014 | f2a_cast_sales | get_cast_sales/cast_sales_aggregate |
| 0015 | f2b_cast_sensitive_tax | **cast_sensitive**（最強封鎖）/cast_tax_profiles/set・get_cast_sensitive |
| 0016 | f2c_payroll_schema_finalize | **payroll_runs/payslips**・payroll_finalize（service）・payroll_run_create・period_bounds |
| 0017 | f2c_attendance_incentives | **attendance_incentives**（#32・パターン3）・incentive_publish/cancel |
| 0018 | f2e1_receivable_deduct | receivables に deduct_period/deducted_amount 追加・finalize を売掛遷移込みに |
| 0019 | f2e2_advances_transport | **advances/transport**（パターン1）・発行/取消 RPC4本・set_store_okuri_mode |
| 0020 | f2e2_finalize_adv_okuri | payroll_finalize を adv/okuri 遷移込みに改修（ar 部は 0018 と一字一致） |
| 0021 | f2d_mynumber_crypto_payment | **mynumber pgp_sym 暗号化（Vault鍵）**・get_cast_mynumber(_masked)・reg_no check・**payment_records**・payment_record_add |

### DB 関数 59本（proacl 実測・2026-07-08）

- **公開 RPC 43本**（authenticated grant・anon 不在＝二重防御）: adv_cancel/adv_issue, attendance_set/_self, check_add_line/close/open/pay/remove_line/set_nominations/void, daily_report_close/reclose, get_cast_mynumber_masked, get_cast_ranking, get_cast_sales, get_cast_sensitive, incentive_cancel/publish, payment_record_add, payroll_run_create, period_bounds, product_stock_add, punch_proxy/self, set_cast_norm/plan/sensitive/tax_profile, set_comp_plan, set_custom_back_def, set_deduction, set_penalty_config, set_product, set_seat, set_staffing_need, set_store_okuri_mode, shift_set, shift_wish_decide/submit/withdraw, transport_cancel/issue
- **service_role 限定 3本**（authenticated/anon 不在＝サーバ経路のみ）: **get_cast_mynumber**（full 平文・支払調書）, **payroll_finalize**, **payroll_mark_paid**
- **内部 owner-only 8本**（4ロール revoke・grant なし）: audit_log_write, audit_log_write_service, cast_sales_aggregate, check_group_due, check_recalc, check_round_amount, comp_plan_slide_check, daily_report_aggregate
- **認可ヘルパー 4本**（SECURITY DEFINER・search_path=public 固定）: auth_org_id, auth_role, auth_store_id, auth_cast_id
- **trigger 関数 1本**: touch_updated_at

暗号化3 RPC（set_cast_sensitive/get_cast_mynumber/get_cast_mynumber_masked）は **search_path=public, extensions**（pgcrypto 罠回避）。

### テーブル 36本・cast プライバシー分類（全 RLS 有効）

- **パターン1（cast は自分の行のみ・`auth_role()<>'cast' or cast_id=auth_cast_id()`）**: casts, payslips, payments(cast_backs), check_cast_backs, cast_norms, cast_plan, cast_tax_profiles(※2), attendance, punches, shift_wishes, **advances, transport, payment_records**（F2e-2/F2d 新設）
- **パターン2（cast 0行・`auth_role()<>'cast'`）**: checks, check_lines, check_nominations, payments, receivables, stock_logs, audit_logs, staffing_needs, cast_tax_profiles（manager+ 可視・cast 0行）
- **パターン3（周知・共有）**: comp_plans(割当変形), deductions, penalty_config, custom_back_defs, attendance_incentives, products, seats, bottle_keeps, shifts, daily_reports, stores, orgs, memberships(認可の真実)
- **★最強封鎖（cast_sensitive・policy 0 grant 0）**: RLS 有効・**SELECT ポリシー無し・grant 0**＝全ロール直 SELECT 不可。取得は閲覧 RPC のみ。**F2d で mynumber_enc を pgp_sym 暗号化（Vault鍵）＝封印は暗号化後も不変**。

### 画面（Next.js 15 App Router・ポート3200・100% inline React.CSSProperties）

- 認証: /login（★ダーク移行済）
- cast（/mine 配下・mine シェル★ダーク）: **/mine・/mine/wishes・/mine/ranking（全ダーク）**
- 店側（(manage) 配下・manage シェル★ダーク）: **/register・/shift・/report・/payroll・/master（全ダーク）**
- API route: /api/payroll/{preview,finalize}, /api/{advance,transport}/{issue,cancel}, /api/incentive/{publish,cancel}, /api/store/okuri-mode, /api/cast/mynumber（owner・service）, /api/payment/record（manager+）, /auth/signout

### verify スイート（`npm run verify:f0`＝seed:f0 後・全緑 **816 assertions**）

| スイート | 数 | 内容 |
|---|---|---|
| nox-pay | 83 | payOf 純関数・玲奈ゴールデン2系統 |
| nox-shift-time | 44 | シフト時刻正規化 |
| nox-punch-match | 75 | 打刻↔シフト突合 |
| nox-anon-guard | 104 | anon/authenticated BLOCKED（内部・service 限定の両ロール assert） |
| nox-rls | 337 | RLS 物理保証・RPC 往復（F2d 暗号化往復含む） |
| nox-grants | 67 | grant/ACL/RLS introspection（Postgres 直結・G1〜G10） |
| nox-payroll | 106 | 給与確定・天引き・原子性 |

- ゴールデン: 玲奈 T1a=5170/T1b=5931（正=本指名商品pt込み）・net=697832（F2f 複合）・net=697832 手計算 pin・period_bounds 閏。
- **注意（seed 汚染）**: ブラウザスモークで cast の punch/wish 等を実操作すると verify シード不変（例 castA1b は punch 0）が壊れ rls が赤くなる。スモークは「読取・DOM 検査」に留め、punch/提出ボタンを実クリックしない。汚染時は該当行を admin 削除して回復（本セッションで castA1b stray punch 1件を削除して 816 回復の実績）。

---

## 3. ★デザインフェーズ移行記録（最重要・verify 対象外＝ここが唯一の記録）

### 3.1 正本宣言

**mock/nox-nightwork-app.html を NOX デザインの正本**とする（相談役宣言・色/タイポ/余白/radius/コンポーネント標準/レイアウトの参照元。従来の「計算仕様の出典」に追加）。tsconfig exclude・**参照専用**（ビルド対象外）維持。写経したトークンは **docs/NOX_デザインシステム.md** が正本。

### 3.2 裁定（DS1/DS2'/DS3）

- **DS1（トークン配布機構）＝CSS 変数 in globals ＋ TS テーマモジュール**。**Tailwind 不採用**（既存 100% inline React.CSSProperties 方針を維持・className 書き換えを避ける）。
  - `app/globals.css`: 13 トークンを **`.nox-dark`** に定義＋Google Fonts @import（Cormorant Garamond/Outfit/Zen Kaku Gothic New）＋`.nox-num`（Outfit tabular）＋`.nox-cardtop::before`/`.nox-lcardtop::before`（gold 上端線＝inline 不可の ::before のみ CSS）。**既存ライト `:root`/body は無変更**。
  - `lib/nox/ui/theme.ts`: トークン定数（colors/radius/font）＋CSSProperties プリミティブ（card/cardTitle/btnGold/btnGhost/btnSm/input/fieldLabel/kpi/kpiVal/th/td/num/pill/rolePill/tabBar/topBar/brand/appBg/loginBg/wrap/alert/bd* 等）。**色は `.nox-dark` の `var(--x)` を参照＝単一ソース**（プリミティブは `.nox-dark` 配下でのみ解決＝opt-in 契約）。`roleLabelJa` も此処（server/client 両用の純関数＝"use client" なし）。
  - `components/ui/primitives.tsx`: 薄い `<Card>/<Button>/<Pill>`（hooks なし＝server/client 両用）。
  - `components/ui/nav.tsx`: `<TabBar>`（"use client"・usePathname で active 最長一致点灯）。
- **DS2'（ダーク適用範囲）＝opt-in `.nox-dark`**。ダークを **body 全体に先敷きしない**。移行が完了した画面/シェルだけが `.nox-dark` をまとう。**未移行画面はライト従来値のまま無変更**＝「dark chrome + light content」の崩れた中間状態を作らない。移行はページ/シェル単位。
- **DS3（ナビ）＝mock 準拠**＝sticky top brand "NOX"（Cormorant・字間3px・champ 色）＋**下部 tabbar**（現在地 gold 点灯）＋role pill（gold グラデ黒字）・**モバイルファースト max-width 520px 中央**・radial-gradient 背景。

### 3.3 移行済み画面と維持した権限表示分岐（★JSX 条件式は不変・見た目のみ）

| 画面/シェル | 移行 | 維持した権限分岐（実機多ロール確認済み） |
|---|---|---|
| /login | D0 | （ロール分岐なし）モックの .lcard＝ロール選択ピッカーは持ち込まない |
| mine シェル | D0 | 下部 tabbar マイ/希望/ランキング・role pill |
| /mine | D0 | cast 自己のみ（RLS パターン1）・確定明細の売掛/前借り/送りは bad 色 |
| /mine/wishes | D1b | **pending のみ取下げ可**（`w.status==='pending' && WithdrawButton`） |
| /mine/ranking | D1b | **順位/名前/件数のみ・¥ 皆無**（F1f G-a・DOM 全文で ¥/円/JPY 不在確認済） |
| manage シェル | D1a | **給与/マスタ tab は isManagerUp のみ**（staff は レジ/シフト/日報 の3 tab） |
| /register | D1a | **取消(void)ボタンは isManagerUp のみ**（staff 非表示） |
| /shift | D1a | **採用/見送り/確定/必要人数/出勤ボーナス発行は isManagerUp のみ**・出勤板は staff 可 |
| /report | D1a | **締め/再締めは isManagerUp のみ**（staff は操作ボタンなし） |
| /payroll | D1a | manager+ 専用（staff は route redirect）・net/天引き表示 |
| /master | D1a | **機密セクションは isOwner のみ**（manager 封印）・**D3a プラン/罰金は owner のみ編集・manager 読取「オーナーのみ」注記**・税務は manager+・支払調書 reveal は owner |

### 3.4 shared コンポーネントの variant パターン

`SimulatorPanel`（/mine cast・/master 店の両用）は **`variant?: "light"|"dark"`**（既定 light）。/mine と /master は `variant="dark"` を渡す。**styling のみ切替＝simulate/useMemo/useState/handlers は variant 非依存で不変**。新たな shared コンポーネントも同型 opt-in で。

### 3.5 デザインフェーズ絶対条件（今後の画面追加でも厳守）

1. **機能ロジック不可侵**（RLS/RPC/payOf/暗号化/権限境界/route）＝CSS・レイアウト・コンポーネントのみ。
2. **verify:f0 816 緑維持が各サブフェーズの gate**（CSS 変更は verify を赤にしない＝緑維持＝ロジック無改変の代理指標）。
3. **権限表示分岐は JSX 条件式を触らず見た目のみ変更**（cast に金額なし・staff に void/締め/採用なし・manager に機密なし・D3a 出し分け）。
4. **モックのデモ機能（F3/F4＝レジ拡張/予約/顧客台帳/分析）は持ち込まない**。既存画面の見た目を寄せるのみ。
5. **新画面/コンポーネントのダーク化手順**: 親が `.nox-dark` を供給する配下で `import * as t from "@/lib/nox/ui/theme"` → `t.card`/`t.btnGold`/`t.input`/`t.th`/`t.num` 等を inline に使う。カードに `className="nox-cardtop"`。ページに `.nox-dark` を自分で足さない（シェルが供給）。

### 3.6 運用の落とし穴（本セッションで踏んだ）

- **dev 起動中に `npm run build` を回さない**：dev と build が `.next` を共有し破損する（`Cannot find module './543.js'` 等）。回復＝dev プロセス kill＋`.next` 削除＋dev 再起動。gate の build は dev を止めてから。
- **RSC 境界**：server component（layout 等）から "use client" モジュールの関数を直呼びすると実行時エラー（画面が空描画）。純関数は非 client モジュール（theme.ts）に置く（roleLabelJa の教訓）。

---

## 4. F2c〜F2d 各フェーズ実装確定（裁定要点）

- **F2c（0016/0017）給与確定**: サーバが payOf 再計算→payslips に breakdown_json 凍結・冪等・トランザクション。net はサーバ権威。payroll_finalize=service 限定。period は 'YYYY-MM'（period_bounds が唯一の暦月境界写像）。#32 出勤インセンティブ=パターン3・extras[] で payslip に加算・publish/cancel は paid 期間ガード。
- **F2e-1（0018）売掛天引き**: receivables に deduct_period（繰越）+deducted_amount（部分・<=amount）。finalize が deducted/部分/繰越へ遷移。#8 二重控除ガード。receivables はパターン2 維持（customer_id 保護）で cast へは payslips.breakdown_json.ar で表示。
- **F2e-2（0019/0020）前借り/送り**: advances（繰越あり）/transport（繰越なし）＝パターン1。手取り floor（takeHomeFloor）を割らない範囲で **送り→前借り→売掛** の順に消費（allocateCategory）。stores.settings_json.okuri_mode（flat/actual）で #8 一律送り代 vs 実費を構造的排他。**台帳 #33 留保**＝transport open 据置の掃除機構（後続）。
- **F2f（mig ゼロ）シミュレーター**: lib/nox/payroll/sim.ts simulate（確定と同じ payOf 共有・純関数）。cast=自分プラン固定+open残反映（売掛は不反映＝確定明細誘導）、店=任意プラン試算。SimulatorPanel。
- **F2d（0021）mynumber/支払調書/payment**: mynumber を **pgp_sym 対称暗号化＋Supabase Vault 鍵 `nox_mynumber_key`**（鍵はコード/mig 非埋込）。閲覧3段＝get_cast_sensitive（mynumber_set boolean のみ）/get_cast_mynumber（full 平文・service 限定・支払調書・全件 audit・cast 本人も平文不可）/get_cast_mynumber_masked（cast 本人のみ末尾4桁）。reg_no `^T[0-9]{13}$` check。payment_records（1確定 run×cast 複数行可＝部分支払い先取り・パターン1）＋payment_record_add（Σ≤net・FOR UPDATE・冪等）。**源泉日数 D4 は現状維持（社労士回答待ち＝pay.ts 1箇所差替で追従）**。

---

## 5. 未実装／次の待ち行列

- **D2（デザイン微調整・要否は Agoora 判断）**: 既存主要画面は D0+D1 で全ダーク＝design グループ実質完了。D2 は細部の統一感/モックとの最終整合（微調整）。あるいは design グループはここで締め。
- **専門家ゲート回答反映**: 社労士（源泉日数 D4・雇用係数=暫定1.0）／税理士（源泉税率・端数・支払調書法定様式）／弁護士（売掛規制・天引き同意）。回答時 pay.ts/該当箇所を差替。
- **台帳 #33**: transport open 据置の掃除機構（auto-close ジョブ or write-off RPC）。
- **F3**: CRM/AI DM/申告承認/採用/操作統制（drink_claims/approvals/notices/trials 等）＝弁護士・風営法ゲート。
- **F4**: 外部連携/キオスク/PCI/加盟店審査（Stripe 等・リードタイム長）。

---

## 6. 台帳スナップショット（F2d まで・正本は F0 セルフレビュー §5 と各完了引き継ぎ）

- **クローズ済**: #6 #14b #32（F2c）・#8 売掛分＋前借り/送り分（F2e-1/2）・#7 #10 #11 は F2d で mynumber/支払調書実装によりコア対応（法定様式の細部は税理士ゲート）。
- **オープン/留保**: #33（transport 掃除・後続）・専門家ゲート（#7 支払調書様式/#10 源泉/#11 インボイス細部・売掛規制）・源泉日数 D4。

---

## 7. 環境・規約・継続

- dev ポート **3200 固定**（`next dev -p 3200`）。Dropbox 配下ゆえ node_modules/.next に com.dropbox.ignored=1。
- **コミット規約**（CLAUDE.md）: co-author トレーラー禁止・スラッシュ始まり禁止・パス風トークン回避・`git commit -m`（複雑な本文は `-F <file>` で shell クォート回避＝本セッションで括弧が bash parse error になった教訓）。**push はフェーズグループ完了時のみ**。
- **DB-first**: スキーマ/RPC 先確定→コード。mig は人間が SQL Editor 手貼り（貼り先証明・prosrc 差分照合・"Success" 非信用・単一トランザクション）。デザインは DB-first の外（mig 不要）。
- seed:f0 は dev 専用（NOX-VERIFY-* 常設・password は .env.local の SEED_PASSWORD）。
- BANZEN 流用マップ継続（../makanai-shift の実証パターンを翻訳・用語置換 tenant→org/staff→cast 等）。

**新 CC への申し送り**: 次は Agoora が D2 要否を判断 → design 締め or D2 微調整 → その後 F3/F4 or 専門家ゲート反映。デザイン作業時は §3 を必読（theme.ts の使い方・opt-in ダーク・権限分岐維持・.next 落とし穴）。
