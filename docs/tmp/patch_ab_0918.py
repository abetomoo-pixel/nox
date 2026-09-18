# AB 段: 裁定277・272 追補3・275 追補・教訓91・Y/Z 適用欄・f0 pin 行（引数: run1秒 run2秒 件数 HEAD run1開始 run2開始 3値run1 3値run2）
import sys
r1s, r2s, total, head, t1, t2, v1, v2 = sys.argv[1:9]
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
NEW277 = '''## 裁定277（本便で確定・Agoora「推奨で」・2026-09-18）0149 の設計（277-1〜6）

出典＝相談役ブロック 2026-09-18 午後（0149 事前読取の追補 docs/tmp/0149_pre.md w1〜w6・録画再生 PoC docs/tmp/0149_poc.md を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定277 0149 の設計] 277-1 demo_org_reset に p_mode('all'|'wipe'|'load')。別 mig 0150 で alter role service_role set statement_timeout='30s'。
   0150 が効かなければ route から wipe→load の 2 回呼び。関数レベル SET は不採用。
 277-2 stock_logs の日付は関数内で check_lines 投入後に sale 行の at を元明細の時刻へ当て直す。本番の在庫トリガは不触。
 277-3 帯持ち店の録画は tx 内で時間帯 rule を一時的にずらす。 277-4 audit_logs は payload に入れない。1 org＝伝票 150〜200 枚・payload 1 MB 以下。
 277-5 storage(cast-photos)policy の is_demo 句を 0149 に同乗。
 277-6 payload 全行の org_id＝p_org_id を検査し不一致は raise。表名は関数内の固定配列のみ・payload のキーから SQL を組まない。」

適用＝起草（本便 AC）: supabase/migrations/0149_demo_org_reset.sql（★1〜★10）／0150_service_role_timeout.sql（未追跡・手貼り待ち・sha256 は本便の報告）。突合＝本便 AD（起草者を疑う別パス＝docs/tmp/0149_ad.md）。手貼り後ブロックは相談役。

'''
edit(L, [
 ('''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先''',
  NEW277 + '''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先'''),
 # 272 追補3 ＋ Y の適用欄（kiosk 腕の追補文の直後）
 ('''check_add_referral の kiosk 腕は現状維持で確定**（改修しない・名簿 A1[K]／billing 段47-3／grants G31 の pin はこのまま）。''',
  '''check_add_referral の kiosk 腕は現状維持で確定**（改修しない・名簿 A1[K]／billing 段47-3／grants G31 の pin はこのまま）。
**追補 3（本便で確定・Agoora「推奨で」・2026-09-18・逐語）**: 「[272 追補3] 紹介料の入口=レジ「指名・席」タブ(3c6fcaa)。紹介者未選択=外部紹介は記録のみ(給与に乗らない)。日報への店負担合計の表示は第2期。」
適用＝**client `3c6fcaa`**（2026-09-18・便 Y）: レジ「指名・席」タブの指名カードの直後に「紹介料」カード＝金額＋紹介者 picker（裁定259 の components/nox/picker・未選択＝外部紹介）＋メモ＋「追加」（青塗り・check_add_referral・p_idem_key は client の crypto.randomUUID()）・注記「店が負担する手当です。お客様のお会計には含まれません。」・追加済みは同カードに一覧（キャスト名／外部紹介・メモ・金額・取消＝既存 check_remove_line・入金前のみ＝Danger red 枠）。owner／manager のレジのみ（isManagerUp）・kiosk-register には出さない。明細一覧は lib/nox/register/referral.ts（純関数 detailLinesOf／referralRowsOf／referralTotalOf）で紹介料行を除外・グループ小計の UI 鏡像も除外・合計の下に「紹介料(店負担) ¥n」を別掲＝三面鏡の 4 面目を作らない（合計の権威は checks.total）。suite verify:nox-referral 25→**30**（(8) 入口→明細別掲→due 不変＝groupDueFull(detailLinesOf)＝checks.total・referralTotalOf 3,500・register-board の結線 5 点・kiosk 0）・逆テスト＝detailLinesOf を素通し→re(8-1) 赤→戻して緑。tsc 0・ui-tokens 新規 0。dev 目視（owner-a・段28卓4 を開卓→1,500 追加→一覧「外部紹介 紹介料 ¥1,500 取消」・合計 ¥0 のまま別掲・注文タブの明細に出ない→取消で行 0）。目視の伝票は pg で削除（A1 open 0）。★便中の事故＝教訓91（逆テストの退避で git stash が tracked の Y／Z 変更を退避＝pop で復旧）。'''),
 # 275 追補（2c379bf の適用欄の末尾）
 ('''1280px はサイドバー（店舗群が最後）＋topbar ログアウト＝従来どおり。仮決め＝0918_pm2_decisions.md #4〜#9。''',
  '''1280px はサイドバー（店舗群が最後）＋topbar ログアウト＝従来どおり。仮決め＝0918_pm2_decisions.md #4〜#9。
**追補（本便で確定・Agoora「推奨で」・2026-09-18・逐語）**: 「[275 追補] nav-icons 3 個・在庫を営業群へ(5208cf1)。」
適用＝**client `5208cf1`**（便 Z）: components/ui/nav-icons.tsx に /receipts（紙＋金額行）・/master/stock（箱）・/billing（カード）を既存と同じ線幅 1.7・18px・viewBox 24 で追加＝サイドバー 15 項目すべてにアイコン。layout.tsx＝在庫を分析群から営業群（レジ・日報の下）へ＝≤899 の「その他」でも先頭側。項目集合・URL・role 条件は不変。tsc 0・ui-tokens 新規 0・dev 目視。'''),
 # 教訓91（教訓90 の直前）
 ('''### 教訓90：名簿正本（docs/NOX_課金ゲート対象_v1.md）の説明文に関数名を裸で書かない（相談役起こし）''',
  '''### 教訓91：逆テストの破壊・復元に git checkout／stash を使わない（相談役起こし）

出典＝相談役 2026-09-18 受領（逐語）: 「[教訓91] 逆テストの破壊・復元に git checkout/stash を使わない。出典=9/18 Y 便の stash 事故(tracked 変更の退避→結線欠落で発覚・pop で復旧)。」実例＝2026-09-18 便 Y（紹介料の入口）の逆テストで、untracked の lib/nox/register/referral.ts を `git checkout --` で戻そうとして失敗し、フォールバックに書いた `|| git stash -q` が **tracked の register-board／layout／nav-icons の未コミット変更を退避**した。直後の suite で結線 grep（re(8-4)）が赤・サイドバーのアイコン欠けで発覚し `git stash pop` で完全復旧（DB 影響なし）。対策＝逆テストは python（または sed）で壊して同じ手段で戻す・退避が要るならファイルのコピー（cp）で行う・`git checkout`／`git stash`／`git restore` を逆テストや一時退避に使わない。

### 教訓90：名簿正本（docs/NOX_課金ゲート対象_v1.md）の説明文に関数名を裸で書かない（相談役起こし）'''),
 # f0 pin 行（所要の観察 bullet の直後）
 ('''＝**Compute 引き上げ（裁定262）は「f0 が 20 分超」を先行実施の目安**とする（公開デモの前提＝裁定273 未決★と同じ Pro／Compute の束）。''',
  f'''＝**Compute 引き上げ（裁定262）は「f0 が 20 分超」を先行実施の目安**とする（公開デモの前提＝裁定273 未決★と同じ Pro／Compute の束）。
- **f0 新基準 pin（2026-09-18 夕・59 段 {total}・便 Y／Z＝R11 レジ入口・nav 追補）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 {v1}／run2 前 {v2}・postmaster 2026-09-15 16:46・orgs 3・dev 3200 は Agoora 使用中＝PostgREST 分は Agoora の操作を含む・他プロジェクトの verify なし）→ run1 {r1s}s（{t1} 起動）／run2 {r2s}s（{t2} 起動）＝いずれも **59 段 ALL PASS・{total}・golden 不変・段別 assertion 数も同一（referral 25→30 のみ増・他 58 段は前 pin と同一）・同一 HEAD `{head}`**。★run1 の exit を読んでから run2 を起動。push＝`53ab697..{head}`（3c6fcaa＝R11 レジ入口／5208cf1＝nav-icons 3＋在庫）。'''),
])
print("AB patch done")
