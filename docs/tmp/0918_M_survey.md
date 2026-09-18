# 0918_M_survey — M 群の残り（M11・M12・M13・M14・M15・M16・M18・M19・M20・M21）読取調査（コード変更 0・2026-09-18・HEAD 9cff22c）

台帳本文の出典＝裁定247（L3260 逐語）・v32 §5 の遡及収載（L3296）・9/17 調査の判定（L3297）。**逐語（L3296）**:
「| 未 | M3 QR 小／M4 ボタン段積み・文字折返し(送り方式の切替が実例)／**M5 シフト追加モーダルが 2 ペインで機能しない**／M6 日報表／M7 下タブと safe-area／M8 KPI 列数／M11 register 卓ヘッダ(軽微・要再現)／M12 ヘッダ整理(ロゴ・歯車・オーナー→ログアウト)／M13 メニュー再編／M14 ノルマ白紙(再現せず・要確認)／M15 タブ行の切れ／M16 控除ルール表／M17 端末発行の 2 カラム／M18 機能フラグ表(操作列あり)／M19 analytics キャストタブ／M20 源泉納付表(操作列あり)／M21 キャスト別ノルマ表 |」「M12/M13 の線引き(9/14 合意): 下タブ=ホーム/レジ/日報/シフト/その他・その他=キャスト/スタッフ/顧客/給与/分析/領収書/在庫追加・歯車=マスタ/お知らせ/監査/ご契約/ログアウト。ヘッダ左にロゴ。」
**逐語（L3297・9/17 判定）**: 「M11 未実装（要再現）／M12 未実装（nav.tsx に歯車・ロゴ・ログアウト集約の器なし）／M13 未実装（spPriority 4 本＋その他の自動振り分けのまま）／M14 未実装（要確認）／M15 未実装（.nox-subnav2 は折返し型・.nox-seg は overflow hidden＝切り落とし型・画面未特定）／M16・M18・M19・M20・M21 未実装（M1 第 2 レーンの 21 表に含む＝横スクロール容器なし）／M17 実装済み扱い」。
本日（H／I）で状況が動いた項＝M5（済 `6b1f017`）・M16／M19／M21（M1 第 2 レーン `9cff22c` で容器適用済み）。

## M11 register 卓ヘッダ（軽微・要再現）
- 対象ファイル:行＝**未特定**（`grep -n '卓ヘッダ\|seatName\|席・卓'` に該当なし。伝票詳細の backbar は register-board.tsx:2051「backbar（sticky）＝『← フロア』…卓名・滞在」＝sticky ヘッダ 1 本）。
- 変更の型＝表示のみ（見込み）。写経元＝なし。想定 suite＝なし（既存再走）。DB 要否＝不要。見積＝小（再現後）。衝突＝なし。
- ★着手前に Agoora の再現スクショが要る（何が崩れるかが台帳に無い）。

## M12 ヘッダ整理（ロゴ・歯車・オーナー→ログアウト）／M13 メニュー再編（合わせて 1 便）
- 現状: app/(manage)/layout.tsx 24〜51 で `groups`（ホーム／営業＝レジ・日報／スタッフ＝シフト・キャスト・スタッフ・給与／顧客／分析＝分析・領収書／店舗＝マスタ・お知らせ・監査・ご契約）を role で組み、135 行で `<TabBar groups spPriority={["/dashboard","/register","/shift","/casts"]} hideSide />`。900+ は `SideNav`（components/ui/side-nav.tsx・nav-icons.tsx のアイコン付き）。topbar（layout 115〜125）は左空・右＝ロールピル＋「ログアウト」（form POST /auth/signout・青枠）。components/ui/nav.tsx 43〜47: ≤899 は spPriority の順で最大 4 本＋残り全部を「その他」Modal（裁定251 M2）へ自動振り分け。**歯車・ロゴ・ログアウト集約の器なし**（nav.tsx に settings 群の概念なし）。
- lib/nox/master/nav.ts＝**マスタ第 2 ナビ**（MASTER_NAV 4 群 12 ページ＝概要／商品・料金 4／店舗・端末 3／キャスト・報酬 6・resolveMasterNav 最長一致）＝M12/M13 の下タブ・歯車とは別層（マスタ内のパンくず・タブ）。M13 で「歯車＝マスタ…」に寄せても MASTER_NAV は不触でよい（/master 配下の第 2 ナビはそのまま）。
- 変更の型＝**入口あり（ナビの並び替え＝表示のみだが導線が変わる）**。9/14 合意の線引き＝下タブ 4 本を「ホーム／レジ／日報／シフト」に変え（現状は casts が 4 本目・日報が「その他」）、「その他」＝キャスト／スタッフ／顧客／給与／分析／領収書／在庫追加、「歯車」＝マスタ／お知らせ／監査／ご契約／ログアウト＝**TabBar に第 3 の口（歯車）を足す**＋ヘッダ左にロゴ（layout の crumb 位置）。
- 写経元＝nav.tsx の「その他」Modal（裁定251 M2 の形をもう 1 口）・SideNav の brand（ロゴ）。想定 suite＝なし（nav は suite 外・tsc＋ui-tokens）。DB 要否＝不要。見積＝**中**（nav.tsx＋layout.tsx＋globals の下タブ幅・ログアウトを Modal 内 form に移す＝/auth/signout の POST は不変）。
- 衝突＝M15（タブ行）とは別物。cast の groups（レジ 1 本）は不変で通す。**「在庫追加」は現状 groups に無い（/master/stock の別口？）＝相談役に線引きの確認**。

## M14 /mine ノルマ白紙（再現せず・要確認）
- 対象＝app/mine/page.tsx 165〜167（`isSectionOn(settings, "mineNormCard") && <NormCard />`＝裁定269-4）・app/mine/norm-card.tsx 48（`if (!data) return null`＝読込中／取得失敗はカードごと出さない）・107（目標未設定の案内文＝0148 で追加）。
- 「白紙」の候補＝(a) 店の sys_norms=false で節が消える（269-4・仕様）／(b) /api/mine/norm-progress の取得失敗で null（48 行）／(c) 目標が全軸 0（0148 前は非表示・**0148 後は「目標が未設定です」＋「目標を設定」が出る**＝本日 dev 適用で状況が変わった）。
- 変更の型＝表示のみ（(b) なら失敗時の 1 行表示）。想定 suite＝なし。DB 要否＝不要。見積＝小。**本番（Vercel）は 0148 未反映（origin 580718a→本日 push 済み 488a169 以降で反映）＝再現確認は本日の push 後に Agoora が実機で**。

## M15 タブ行の切れ（画面未特定）
- 候補 2 型: `.nox-seg`（globals 805＝`overflow: hidden`＋a は `white-space: nowrap`＝**切り落とし型**・使用 12 ファイル 35 箇所＝analytics／audit／casts／customers／business-hours／plan-board／master-subnav／pricing／seats／store-flag-toggle／system／notices）と `.nox-subnav2`（1061＝flex-wrap＝折返し型・切れない）。
- 変更の型＝表示のみ（`.nox-seg` に `overflow-x: auto; -webkit-overflow-scrolling: touch` を足すか、≤899 で `flex-wrap`）。写経元＝`.nox-tablewrap` の auto 化（裁定251）。想定 suite＝ui-tokens（新トークン 0）。DB 要否＝不要。見積＝小（CSS 1〜2 行・ただし 35 箇所の見た目に効く＝目視必須）。衝突＝store-flag-toggle（244 の例外＝.nox-seg 2 択）は幅が短く影響なし。**画面の特定（どの面の seg が切れたか）は Agoora の再撮影待ち**。

## M16 控除ルール表
- 対象＝comp-sections.tsx DeductionTab（本日 833→835 行付近・`<table className="nox-table" style={{ marginBottom: 10 }}>`）＝**M1 第 2 レーン `9cff22c` で `.nox-tablewrap plain` 適用済み**（表内 sticky／Picker 0）。
- 残り＝列数が多く潰れる場合の th nowrap は未適用（裁定252 の `.nw` はプレビュー表専用）＝実機で潰れが残るなら「`.nw` の適用範囲を広げる」裁定 1 本。見積＝小。DB 不要。

## M18 機能フラグ表（操作列あり）
- 対象＝app/(manage)/master/feature-flags-panel.tsx 78〜（既に `.nox-tablewrap`（枠つき）で包まれている＝容器あり）。列＝機能／会社の既定／店舗ごとの列（stores.map）＝店舗数で横に伸びる・各セルが ON／OFF 操作（flag_set）。
- 「操作列あり」の含意＝横スクロールで操作セルが画面外に隠れる（容器はある）。案＝(a) 先頭列（機能名）を sticky-left にする（`position: sticky; left: 0`＝新 CSS 1 規則・容器内 sticky は効く）／(b) ≤899 はカード積み（.nox-ptable の型を借りる＝中）。変更の型＝表示のみ。想定 suite＝flags 20 は DB 側のみ＝影響なし。DB 不要。見積＝小（a）／中（b）。

## M19 analytics キャストタブ
- 対象＝analytics-board.tsx 1143（キャストランキング）・1213（顧客ランキング）＝**`9cff22c` で容器適用済み**。1291（コホート）は既存 overflowX:auto。
- 残り＝キャストタブそのものの崩れ（KPI カード列数＝M8 と同根の可能性）。再撮影で判定。見積＝小〜中。DB 不要。

## M20 源泉納付表（操作列あり）
- 対象＝**app/(manage)/payroll/payment-tax-panel.tsx 99**（`<table style={{ width: "100%" }}>`・7 列＝支払月／税区分／人数／支払額計／源泉税額計／納付期限／納付状態＋操作）。**M1 第 2 レーンの 21 表の一覧に載っていなかった（9/14 の grep 漏れ＝一覧は payroll/payment-panel.tsx 106 を拾い、payment-tax-panel.tsx は拾っていない）＝容器なしのまま**。
- 処置案＝`.nox-tablewrap plain` を 1 枚（第 2 レーンと同型・表内 sticky／Picker なし＝要確認）。変更の型＝表示のみ。見積＝小（1 表）。DB 不要。**次の client 便で M1 第 2 レーンの追補として 1 表足す**（本日は I-4 コミット後に判明＝着手せず）。

## M21 キャスト別ノルマ表
- 対象＝comp-sections.tsx NormTab（763→765 行付近）＝**`9cff22c` で容器適用済み**。norma-board.tsx は NormTab を呼ぶだけ。残り＝M16 と同じ（潰れ型なら `.nw` の範囲裁定）。

## 推奨の着手順と束ね

1. **M20 1 表の追補**（M1 第 2 レーン追補・client 1 本・小）＋ **M15 `.nox-seg` の auto 化**（CSS 1〜2 行・小）＝同じ「横スクロール」系で 1 便（globals.css を触るのは M15 のみ）。
2. **M12＋M13**（nav.tsx＋layout.tsx＝同じファイル群・中）＝1 便。着手前に「在庫追加」の所在と、歯車の口の形（Modal か ページか）を相談役裁定。
3. **M18**（feature-flags-panel の先頭列 sticky-left・小）＝単独 or 1. に同乗（CSS 1 規則）。
4. **M11・M14・M19（残り）** は Agoora の再撮影／本番 0148 反映後の再現待ち＝着手しない。
5. M16／M21 は容器適用済み＝再撮影で潰れが残るときだけ `.nw` の範囲裁定。
束ね候補: 1.＋3.（globals.css＋2 パネル）／2. 単独（nav 系）。
