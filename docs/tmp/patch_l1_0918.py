# L-1: M5・M1 第 2 レーンの適用欄＋f0 pin 新基準行＋変遷チェーン（引数: run1秒 run2秒 件数 HEAD run1開始 run2開始 段別内訳）
import sys
r1s, r2s, total, head, t1, t2, detail = sys.argv[1:8]
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
 # 裁定247 に M5 の適用欄
 ('''着手順は M1・M2 を 1 レーンで直して再撮影 → M3〜M8。」''',
  '''着手順は M1・M2 を 1 レーンで直して再撮影 → M3〜M8。」

適用＝**M5 client `6b1f017`**（2026-09-18・追加便 H・Agoora 不在の仮決め＝docs/tmp/0918_pm_decisions.md #1〜3）: shift-add-form 365 の inline grid（`230px minmax(0,1fr)`・@media なし＝9/17 調査）を既存 `.nox-2col` の修飾子 `.nox-2col--side`（globals.css・900+ は 230px＋1fr・gap 12＝旧値と同じ／≤899 は既存規則の 1 列）へ置換＝スマホではキャスト選択の下に月カレンダーが積まれる。表示のみ・中身／経路／RPC 不変・新トークン 0・tsc 0・ui-tokens 新規 0・verify:nox-shift-modal 22 緑。375px 目視（dev）＝`.nox-2col--side` 1 列 307px・モーダル本文 343px・横溢れなし。文言「左でキャストを選択してください」は据え置き（1 列時は「上」＝文言は裁定待ち）。M1 第 2 レーン（`9cff22c`）は裁定251 の適用欄。台帳本文の対象特定＝docs/tmp/0918_M5.md（逐語 grep N=3）。'''),
 # 裁定251 に第 2 レーンの適用欄
 ('''調査の根拠: html／body／シェル 3 層に overflow-x のクランプなし・table 51 のうち横スクロール容器なし 24・`.nox-ptwrap` は overflow hidden（切り落とし）・「その他」シートは Modal 部品を通らず地色／padding／角丸が未適用・× と Esc なし。''',
  '''調査の根拠: html／body／シェル 3 層に overflow-x のクランプなし・table 51 のうち横スクロール容器なし 24・`.nox-ptwrap` は overflow hidden（切り落とし）・「その他」シートは Modal 部品を通らず地色／padding／角丸が未適用・× と Esc なし。
適用＝**第 2 レーン client `9cff22c`**（2026-09-18・追加便 I・docs/tmp/0918_M1_lane2.md）: 第 1 レーンの `.nox-tablewrap.plain` をそのまま **20 表**へ（analytics 2・comp-sections 8＝SlideInput／PlanTab 2／AssignTab 割当表＋適用履歴／NormTab／DeductionTab／BackTab・plan-editor 1・seats 1・payment-panel 1・payroll-board 2・register 伝票グループ別残額 1・kiosk-register 2・mine/ranking 1・simulator 1）＋ `.nox-ptwrap` の overflow hidden→auto（901+ のみ・≤900 のカード積みは不変＝8 表）。**見送り 1**＝register-board 会計タブ明細表（表内 Picker のポップが容器の overflow で切れる＝裁定259 追補の 300px 据え置きと同じ扱い）。「21 表」は 9/14 の実測で本日の実数は 22（analytics コホート表が増えたが既存の overflowX:auto で包まれている＝対象外）。表示のみ・新トークン 0・tsc 0・ui-tokens 新規 0。375px 目視（dev・owner-a／cast-a1a）＝8 ページ＋/mine/ranking で body 横幅 375 のまま・描画された対象表（seats／ranking／ptwrap 2）は容器内に収まる。★verify org はデータが薄く容器から溢れる表は出なかった＝溢れの実機は Agoora（CLUB NOX・docs/tmp/0918_close_checklist.md）。★9/14 の一覧に無い容器なし表＝payment-tax-panel.tsx 99（M20 源泉納付表）を発見＝次の client 便で追補（docs/tmp/0918_M_survey.md）。'''),
 # 変遷チェーン
 ('''・2026-09-18 2 連緑 613s／851s・同一 HEAD d7a2084）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。''',
  f'''・2026-09-18 2 連緑 613s／851s・同一 HEAD d7a2084）。→ **58 本 {total}**（段数・件数不変＝M5 `6b1f017`・M1-2 `9cff22c` は表示のみ・2026-09-18 2 連緑 {r1s}s／{r2s}s・同一 HEAD {head}）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。'''),
 # pin 行（0148 pin 行の直後）
 ('''push＝`580718a..d7a2084`（478303d＝client 前倒し／fe0e19c＝v37 収蔵／8af0be5＝0148 SQL＋名簿・pin＋suite 5 本＋三面鏡／d7a2084＝reopen pin）。''',
  f'''push＝`580718a..d7a2084`（478303d＝client 前倒し／fe0e19c＝v37 収蔵／8af0be5＝0148 SQL＋名簿・pin＋suite 5 本＋三面鏡／d7a2084＝reopen pin）。
- **f0 pin 不変の再確認（2026-09-18 午後・58 段 {total}・M5／M1-2 client）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 12:27:49＝backends 17・postmaster 2026-09-15 16:46・orgs 3／run2 前は下記・他プロジェクトの verify なし）→ run1 {r1s}s（{t1} 起動）／run2 {r2s}s（{t2} 起動）＝いずれも **58 段 ALL PASS・{total}・golden 不変・段別 assertion 数も同一（正午の pin と同一内訳）・同一 HEAD `{head}`**。段別内訳（run2 実測）＝{detail}。push＝`488a169..{head}`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。'''),
])
print("L-1 done")
