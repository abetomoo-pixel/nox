# T 段の台帳: 274／275 の適用欄・M15／M18 の適用欄（裁定247）・f0 pin 新基準行（59 段）・変遷チェーン（引数: run1秒 run2秒 件数 HEAD run1開始 run2開始）
import sys
r1s, r2s, total, head, t1, t2 = sys.argv[1:7]
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)
L = 'docs/NOX_裁定台帳.md'
edit(L, [
 # 裁定274 適用欄
 ('''適用＝本便 S 段（client 1 便・DB／RPC／監査文言は不変・表示のみ）。''',
  f'''適用＝**client `9e6cf85`**（2026-09-18・便 S・docs/tmp/0918_R15_impl.md）: lib/nox/shift/tabs.ts 新設（純関数＝SHIFT_VIEWS 今日／作る／確定・VIEW_TABS 作る＝[build 作成|calendar 仮シフト]／確定＝[queue 承認待ち|roster 確定シフト]・viewOfTab／tabOfView＝旧 5 キーの写像・深リンク維持）。shift-board は旧 5 タブの nav を 3 タブ＋`.nox-seg` の 2 択に置換し、state 型・setTab 5 箇所・各パネルの分岐は不変（承認待ちの件数バッジは「確定」タブに丸数字＋seg に素の数字）。語の統一＝**行を承認する動詞のみ「承認」（置換 15・13 種）**＝トースト（承認に失敗／承認しました）・確認ダイアログ・title・CTA「承認する（n 件）」・行ボタン「承認」・一括「件を一括承認」・案内文「「確定」タブの承認待ち」×3。状態名（確定＝confirmed／未確定／確定シフト／確定時間／確定人時／確定者）・監査ラベル（shift_confirm_bulk「確定」）・DB status 値・RPC 名は不変（91→81 箇所）。suite verify:nox-shift-tabs **14**（純関数＋shift-board の結線を逐語 grep・逆テスト＝viewOfTab の calendar を confirm に→3 本赤→戻して緑）＝f0 59 段目。既存 suite に UI 文言・タブキーの pin は 0（張り替え点 0）。tsc 0・ui-tokens 新規 0。dev 目視（owner-a・375／1280）＝3 タブが 1 行・seg の切替と 3 タブ往復で state が保たれる・body 横幅不動。cast 側（/mine）は本便の変更対象外＝不変。仮決め＝docs/tmp/0918_pm2_decisions.md #10〜#14。'''),
 # 裁定275 適用欄
 ('''適用＝本便 R 段（client 1 便・ルート／URL／role ゲート不変・並びと口の追加のみ）。''',
  f'''適用＝**client `2c379bf`**（2026-09-18・便 R）: components/ui/nav.tsx＝NavGroup に `gear`・TabBar に `gear` prop＝≤899 の下タブ（spPriority 4 本）＋「その他」Modal＋**「歯車」Modal**（見出し「設定」・gear=true の群＝マスタ／お知らせ／監査／ご契約＋脚にログアウト＝form POST /auth/signout・「その他」Modal の写経・Esc／× で閉じる・⚙ は文字 U+2699・aria-label「設定」）。app/(manage)/layout.tsx＝下タブ **ホーム／レジ／日報／シフト**（旧: ホーム／レジ／シフト／キャスト）・分析群の末尾に **在庫**（/master/stock＝既存画面・URL 不変・manager 以上）・店舗群を gear・topbar 左に **≤899 のみロゴ**（SideNav の .brand 写経・900+ は CSS で非表示＝同じ情報を 2 箇所に出さない）・topbar のログアウトは **≤899 で非表示＝歯車へ集約**（900+ は従来どおり）。項目集合・URL・role ゲート・MASTER_NAV（lib/nox/master/nav.ts）は不変。cast は レジ＋歯車（ログアウトのみ）。role 別の口＝docs/tmp/0918_pm2_decisions.md R-3 表。tsc 0・ui-tokens 新規 0。dev 目視＝375px で下タブ 6 項目（ホーム 37／レジ 27／日報 27／シフト 38／その他 38／⚙ 15 px）が 375 に収まり body 不動・その他＝キャスト／スタッフ／給与／顧客／分析／領収書／在庫・歯車＝4 本＋ログアウト・1280px はサイドバー（店舗群が最後）＋topbar ログアウト＝従来どおり。仮決め＝0918_pm2_decisions.md #4〜#9。'''),
 # 裁定247 に M15／M18 の適用欄（M5 の適用欄の直後）
 ('''M1 第 2 レーン（`9cff22c`）は裁定251 の適用欄。台帳本文の対象特定＝docs/tmp/0918_M5.md（逐語 grep N=3）。''',
  '''M1 第 2 レーン（`9cff22c`）は裁定251 の適用欄。台帳本文の対象特定＝docs/tmp/0918_M5.md（逐語 grep N=3）。
適用＝**M15／M18 client `ee2a3fc`**（2026-09-18・便 Q・docs/tmp/0918_M_survey.md）: M15＝`.nox-seg` を `overflow: hidden auto`（横のみ auto・iOS 慣性）＋ `> * { flex: 0 0 auto }`＝幅に収まらないタブ行を切り落とさず容器内で横スクロール（12 ファイル 35 箇所共通・収まる幅では従来と同じ描画）。M18＝`.nox-tablewrap.stickyfirst`（先頭列 sticky left・地色 --card）を feature-flags-panel の表に＝店舗列で横に伸びても行見出しが残る。表示のみ・新トークン 0・tsc 0・ui-tokens 新規 0。M20（源泉納付表）は既に inline overflowX:auto で包まれていた（K-1 の「容器なし」は誤り）＝`91e53f7` で共通容器へ統一。仮決め＝0918_pm2_decisions.md #2〜#3。'''),
 # 変遷チェーン
 ('''→ **58 本 4,337**（段数・件数不変＝M5 `6b1f017`・M1-2 `9cff22c` は表示のみ・2026-09-18 2 連緑 753s／843s・同一 HEAD 9cff22c）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。''',
  f'''→ **58 本 4,337**（段数・件数不変＝M5 `6b1f017`・M1-2 `9cff22c` は表示のみ・2026-09-18 2 連緑 753s／843s・同一 HEAD 9cff22c）。→ **59 本 {total}**（4,337＋shift-tabs 新設 14（裁定274）・2026-09-18 2 連緑 {r1s}s／{r2s}s・同一 HEAD {head}）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。'''),
 # pin 行
 ('''push＝`488a169..9cff22c`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。''',
  f'''push＝`488a169..9cff22c`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。
- **f0 新基準 pin（2026-09-18 午後・59 段 {total}・裁定274／275・M15／M18・N）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 13:48:37＝backends 16・postmaster 2026-09-15 16:46・orgs 3／run2 前 14:05:04＝backends 18・同・他プロジェクトの verify なし）→ run1 {r1s}s（{t1} 起動）／run2 {r2s}s（{t2} 起動）＝いずれも **59 段 ALL PASS・{total}・golden 不変・段別 assertion 数も同一（58 段は前 pin と同一＋59 段目 shift-tabs 14）・同一 HEAD `{head}`**。★run1 の exit を読んでから run2 を起動（正午の停止 1 の再発防止）。push＝`bc56be6..{head}`（91e53f7＝M5 文言＋payment-tax-panel／10f15a1＝裁定273〜275／ee2a3fc＝M15・M18／2c379bf＝M12・M13／9e6cf85＝R15）。'''),
])
print("T patch done")
