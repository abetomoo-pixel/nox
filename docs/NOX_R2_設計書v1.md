# NOX R2 レジ第2弾 設計書 v1（2026-08-20・相談役起草）

対象3テーマ＋追加1件: T-a 延長メニュー複数／T-a' 開卓時ルール手動選択（初回セット・Agoora 要件 2026-08-20）／T-b 延長後合流の時点起算（money-core）／T-c 領収書本格版（採番・QR・発行台帳・匿名公開ページ）。
事前調査 = CC 報告 2026-08-20（11論点）。本書の裁定番号は R2-1〜R2-13。

## 0. 正本文言の供給（docs 不在分・本書で正本化）

- **正本A（v8 §3 逐語）**: 「延長メニュー複数（30分¥3000/60分¥5000・manual 店・pricing_rules extension 複数行が受け皿）」「延長後合流の時点起算（裁定確定: セット中合流=遡及・延長後合流=そのブロックから加算。apply 按分改稿=money-core）」
- **正本B（BANZEN 資産・相談役供給）**: ①anon 面は公開専用 SECURITY DEFINER RPC のみで構成し**最小本数を白名単管理**（BANZEN は pos_receipt_public / pos_receipt_doc_public の2関数固定）。②QR トークンは推測不能な乱数 UUID・**有効期限90日**。③期限切れ・不在は **raise せず null/空を return**（遅延失効・存在推測を与えない）。④公開ページは PII 最小（店名・金額・日付・発行番号のみ／顧客名・cast 名は載せない）。

## 1. 裁定

**R2-1（複数メニューの持ち方）**: checks のスカラー2列（ext_fee/ext_min）は**既定メニュー**として維持し、**checks.ext_menu_snap jsonb を新設**——check_open 時に当該店・当該条件で有効な extension ルール全件を `[{rule_id, label, duration_min, amount}]` で凍結（priority 順）。check_extension_add に **p_rule_id uuid default null** を追加（null=既定＝現行互換）。押下時は**スナップから**解決（live pricing_rules は読まない＝凍結原則維持・R2-4 同時解決）。行は '延長料金(N分)' に額・分を凍結（unit_price_snapshot が受け皿＝調査どおり）。

**R2-2（一覧読取）**: 新 RPC 不要。営業中の選択肢 = checks.ext_menu_snap（RLS で既に読める checks の列）。マスタのプレビューは pricing_rules 直読の現行どおり。

**R2-3（auto 店）**: 複数メニューは **manual 専用**（正本A どおり）。auto 店の部分ユニーク・1本運用は不変。check_extension_add の 'auto mode' ガード維持。

**R2-4（凍結整合）**: 開栓時に全 extension メニューを ext_menu_snap へ凍結。開栓後のマスタ変更は既存伝票に波及しない（設計書 v1.2 の凍結原則をそのまま拡張）。

**R2-5（T-a' 開卓時ルール手動選択）**: check_open に **p_set_rule_id uuid default null** を追加。null=現行の自動一致（priority 先勝ち）・指定時は当該ルール（同店・fee_kind='set'・is_active）を検証して set_fee/set_min へ凍結。監査 JSON に override_rule_id を記録。**選び直しは不可**（開卓やり直し＝void→再開卓の現行運用。部分編集を作らない）。UI はレジ開卓モーダルに「料金ルール（既定: 自動）」セレクタ。kiosk は既定固定（セレクタ非表示）。**初回セット行の当面運用**: 本機能出荷まで is_active=false 維持（Agoora 実施済み想定・未実施なら即実施）。

**R2-6（時点起算の正式裁定＝正本A を台帳収蔵）**: セット中の人数変更=全遡及（現行維持）・**延長ブロック確定後の変更=そのブロック以降のみ**。manual 店は既に時点起算＝不触。改修対象は **auto 店の apply のみ**。

**R2-7（確定ブロックの表現）**: check_lines に **block_no integer**（NULL可・auto extension 行のみ使用）を追加し、auto 店の部分ユニークを **(check_id, fee_kind, block_no) where time_auto** へ張り替え。apply の意味論: 経過ブロック n 個のうち**確定済み（開始時刻が過ぎた）ブロックは初回生成時の units で行凍結・以後不触**、進行中ブロックのみ現況 units で upsert。set 行（block_no null）は従来どおり全遡及。鏡像3点セット（RPC/check-calc/receipt）同時改修の規律適用。

**R2-8（verify 張り替え）**: 承認。pricing-apply 約19本＋set-people 6〜10本の期待値を新意味論へ張り替え・**rewind（started_at 後付け）方式**の持ち込み可。段49(4) は正解のまま残す。張り替え前後で「旧意味論なら緑・新意味論で赤」の adversarial を最低2本（遡及が消えたことの証明）。総額保存則 assertion は「確定分＋進行分の和」へ書き換え。

**R2-9（発行台帳の器）**: **新テーブル receipt_issues**。ePOS の「採番テーブルは作らない」裁定はレシート（会計証跡・純関数）の話であり、領収書（金銭受領証・再発行管理が本体）は別物＝台帳が正当。列: id/org_id/store_id/check_id(FK)/serial(int)/amount/recipient(宛名)/proviso(但し書き)/issued_at/issued_by/token(uuid unique default gen_random_uuid())/expires_on(date default 発行+90日)/voided(boolean default false)。UNIQUE(store_id, serial)。grants 規範形・RLS select=owner/manager 自店。

**R2-10（採番）**: **store×通し連番**（serial = 同 store の max+1 を FOR UPDATE 採番・表示形式 'R-{serial 6桁}'）。粒度 = **1枚1行**（分割発行は枚数分の行・各 amount 記録・Σamount ≤ 伝票総額を RPC ガード）。発行 RPC `receipt_issue`（closed 伝票のみ・owner/manager/staff-register・billing ゲート入り＝金銭記録の作成）・取消 `receipt_issue_void`（再発行管理・voided=true・理由 note）。

**R2-11（anon 面）**: NOX 初の anon grant。**白名単 = nox_receipt_public の1関数から開始**（正本B ①の最小原則。doc 版が要る時に2本目を裁定）。token で引き→ voided/期限切れ/不在は **null return**（正本B ③）。返却 = 店名・serial 表示形式・amount・発行日・取引日のみ（正本B ④）。anon-guard 934本は「BLOCKED 全数」から「白名単1件を除き BLOCKED」へ・grants 282本の pin 更新——**両方に白名単の機械 assert**（E8-6c 教訓21 と同型: 白名単は verify が live と同期強制）。

**R2-12（日付・インボイス）**: 領収書に**発行日（issued_at）と取引日（closed_at の biz_date）を併記**。適格請求書事項（登録番号・税率別内訳）は ePOS レシートの既在表示と同項目を簡易領収書にも印字（10%内税前提は receipt golden の現行前提を踏襲）。公開ページは金額・日付・発行番号のみ（インボイス表示は紙側）。

**R2-13（既知欠落2点の解消）**: E8-1 分割領収書の「伝票総額粒度」「印刷実行日」は receipt_issues 化で自然解消（1枚1行 amount・issued_at/取引日併記）。既存の揮発 UI は receipt_issue 結線へ置換。

## 2. mig 分割と順序（DB-first・1レーンずつ）

| mig | サブレーン | 内容 | 非冪等 | モデル |
|---|---|---|---|---|
| **0097** | R2-b（先行・money-core） | check_lines.block_no＋部分ユニーク張り替え＋check_time_charge_apply 改稿（確定ブロック凍結）＋check_set_people 注記整合 | 非冪等 | Fable 5 |
| **0098** | R2-a | checks.ext_menu_snap＋check_open 拡張（p_set_rule_id・snap 凍結・アリティ変更）＋check_extension_add 拡張（p_rule_id） | 非冪等 | Fable 5（check_open=kiosk 腕持ち） |
| **0099** | R2-c | receipt_issues＋receipt_issue／receipt_issue_void（billing ゲート＝pin+2）＋nox_receipt_public（anon 白名単1号） | 非冪等 | Fable 5（anon 面新設） |

順序理由: b が apply の意味論を確定させてから a の複数メニューを載せる（逆順だと a の行生成を b で再改修）。c は独立だが anon 面・pin 波及が重いので単独レーン。各 mig とも恒久手順（底本逐語採取→相談役起草→照合→手貼り→検証バンドル→app 実装→目視→push）。

## 3. 検証計画（段54〜56 想定）

- 段54（R2-b）: rewind 方式で「延長2ブロック確定→合流→確定分不変・進行分のみ増」の直接検証・張り替え約25〜29本・adversarial 2本（遡及消滅の証明）・golden: rate-back 64/receipt 52 不変（ePOS は set/ext 行の額を読むだけ＝行分割の影響は実測で確認）
- 段55（R2-a）: snap 凍結（開栓後マスタ変更が snap に波及しない）・p_rule_id 検証（他店/他 fee_kind/inactive 拒否）・null=既定互換・check_open override の凍結実測・kiosk 経路の既定固定
- 段56（R2-c）: 採番の直列化（並行発行で連番衝突なし）・Σamount ≤ 総額・void→公開 null・期限切れ null・**anon 実セッションでの公開 RPC 実行**（NOX 初＝rls スイートの anon fixture 流用）・anon-guard/grants の白名単 assert・billing pin 92→94 adversarial

## 4. パーク（R2 に含めない）

QR 印字レイアウト詳細（ライブラリ選定は実装時）・doc 版公開 RPC・領収書 PDF 化・インボイス税率混在（全品10%前提の変更は税理士回答後）・auto 店の複数メニュー。
