# P 段: 裁定273〜275 の逐語収載＋272 追補（kiosk 腕 現状維持で確定）
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
NEW = '''## 裁定273（本便で確定・Agoora「推奨で」・2026-09-18）業態別公開デモ（273-1〜8）

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_demo_pre.md a〜k を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定273 業態別公開デモ] 273-1 器は org 4 分割・新設(NOX-DEMO-CABARET/GIRLSBAR/SNACK/LOUNGE)。既存 NOX-DEMO(CLUB NOX)は不触。
 273-2 識別子は orgs.is_demo boolean。org_billing.status は使わない。
 273-3 種は TS 純関数が今日の営業日基準で過去 14 日分を決定的に生成→jsonb 1 個→RPC demo_org_reset(p_org_id,p_payload) 1 回
   (service_role 限定・is_demo 以外は raise・子→親削除→jsonb_populate_recordset 投入を 1 トランザクション)。E1/E2/E4 は不採用。
 273-4 suite demo-seed で 凍結合計＝check_group_due＝receipt の三点一致を抜き取り。日報は daily_report_close、給与は payroll_finalize 正規経路。golden 不触。
 273-5 開いている伝票 3 卓と当日の出勤打刻は入場時補充(直近 3 時間に無ければ今基準で足す)。
 273-6 柵は app/api route の共通ガード 1 本(拒否=stripe/billing・invite・staff create/email・mynumber・provision・cast-photo・print)。
   RPC 128 本と billing_writable_of は無改造。set_store_*・flag・商品・顧客・notice は許可。demo org は setup_done に依らず /setup へ飛ばさない。
 273-7 入場は /demo→サーバ完結の generateLink＋verifyOtp。リセット時に demo ユーザーの email/PW を admin で戻す。
 273-8 日次 05:00 JST＋org 単位の手動リセット(10 分間隔)・上部帯・/demo noindex・アプリ全体は LP 以外 disallow。
 未決★ auth.updateUser 経由のメール変更連打による送信枠の消費。公開の前提=Vercel Pro＋Compute 引き上げ(裁定262)。」

適用＝未着手（0149＝orgs.is_demo＋demo_org_reset の mig と TS 種生成・事前読取は docs/tmp/0149_pre.md）。

## 裁定274（本便で確定・Agoora「推奨で」・2026-09-18）R15 シフト画面の情報設計＝5→3 タブ・語は 3 語固定

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_R15_pre.md の分岐点・Q1〜Q5 を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定274 R15] シフト画面を 5→3 タブ(今日／作る＝[作成|仮]／確定＝[承認待ち|確定シフト])・語は 3 語固定(公開/承認/確定)。
 status 拡張・既読と同意の分離は第2期。client 1 便。」

適用＝本便 S 段（client 1 便・DB／RPC／監査文言は不変・表示のみ）。

## 裁定275（本便で確定・Agoora「推奨で」・2026-09-18）M12／M13 ヘッダ整理とメニュー再編＝歯車の口

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_M_survey.md M12/M13 節を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定275 M12/M13] 歯車の口は Modal(「その他」Modal 写経)。下タブ=ホーム/レジ/日報/シフト、その他=キャスト/スタッフ/顧客/給与/分析/領収書(＋在庫)、
 歯車=マスタ/お知らせ/監査/ご契約/ログアウト。在庫は既存画面があればリンク 1 本・無ければ見送り。≥900 は SideNav 下部に同群。MASTER_NAV 不触。」

適用＝本便 R 段（client 1 便・ルート／URL／role ゲート不変・並びと口の追加のみ）。

'''
edit(L, [
 ('''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先''',
  NEW + '''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先'''),
 ('''kiosk から紹介料を起票させるかの是非は裁定273 系で相談役が判断。''',
  '''kiosk から紹介料を起票させるかの是非は裁定273 系で相談役が判断。→ **追補（2026-09-18 午後・本便で確定・Agoora「推奨で」・相談役ブロック「272 追補2」）: check_add_referral の kiosk 腕は現状維持で確定**（改修しない・名簿 A1[K]／billing 段47-3／grants G31 の pin はこのまま）。'''),
])
print("P patch done")
