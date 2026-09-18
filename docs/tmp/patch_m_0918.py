# M 段: 教訓88／90・裁定259 追補・裁定272 適用欄補記・f0 pin 節の停止 1 行
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
 # 教訓90（教訓89 の直前＝降順）
 ('''### 教訓89：fixture の認証情報（auth のメール等）を書き換える逆テストは finally の復元を先に書いてから壊す（相談役起こし）''',
  '''### 教訓90：名簿正本（docs/NOX_課金ゲート対象_v1.md）の説明文に関数名を裸で書かない（相談役起こし）

出典＝相談役 2026-09-18 受領（逐語）: 「名簿正本(docs/NOX課金ゲート対象v1.md)の説明文に関数名を裸で書かない。パーサ docNames が名簿行として拾い全数がずれる」。実例＝2026-09-18 0148 B-1: A1 の check_add_referral の説明文に「課税額から除外（check_group_due）」、A7 の set_cast_norm_self の説明文に「auth_cast_id() 由来」と書いたところ、verify:nox-billing 段47-1 の docNames（`## A. 対象`〜`## B. 除外` 区間の live 名一致トークンを名簿として拾う）が check_group_due・auth_cast_id を A の名簿に数え「対象 130（期待 128）」「対象→live: check_group_due,auth_cast_id にゲートなし」で赤。説明文を「DB の group due 計算」「呼び出し元 JWT から導出」に書き換えて緑（`8af0be5`）。対策＝名簿の A／B 区間の説明文では他の関数名を書かない（書くなら区間外のヘッダ bullet か、名簿行として意図した名前だけ）。

### 教訓89：fixture の認証情報（auth のメール等）を書き換える逆テストは finally の復元を先に書いてから壊す（相談役起こし）'''),
 # 教訓88（教訓87 の直前）
 ('''### 教訓87：裁定本文に「N 箇所」と書くときは実ファイルの逐語 grep で内訳を確定してから書く（相談役起こし）''',
  '''### 教訓88：DB を触る script（node -e 含む）は finally で接続を閉じる（相談役起こし）

出典＝相談役 2026-09-17 提案・2026-09-18 承認（逐語）: 「DB を触る script(node -e 含む)は finally で接続を閉じる」。背景＝Supabase Free（t4g.nano）は backends が少なく、検証や調査の使い捨て script（node -e／docs/tmp/*.mjs）が例外で落ちると接続が残り、次の f0 が statement timeout 型の赤や無応答（教訓85）を引く。実例＝0148 便（2026-09-18）は A 段の q0918_0148_post.mjs から O 段の読取まで全 script を `try { … } finally { await db.end().catch(() => {}) }` で書き、f0 4 走の走行前 3 値は backends 16〜20（全て Supabase 内部＋走行中 suite）で残骸 0。suite 本体（verify-nox-*.ts）も同じ形（`finally { await db.end() }`）＝1 トランザクション＋ROLLBACK 型の suite は例外時も rollback→end の順で閉じる。

### 教訓87：裁定本文に「N 箇所」と書くときは実ファイルの逐語 grep で内訳を確定してから書く（相談役起こし）'''),
 # 裁定259 追補 2（裁定260 の直前）
 ('''## 裁定260（Agoora 承認 2026-09-15）pin の走査対象は許可列挙で書く''',
  '''追補 2（2026-09-18・M-3）: レジ会計タブの明細表（register-board 2820・表内に Picker）は M1 第 2 レーン（`9cff22c`）の横スクロール容器を当てず据え置き＝**クローズ**（Picker のポップが容器の overflow で切れるため。ポータル化は第 2 期）。259-b の据え置き 2 箇所（sensitive-tax 228・stock-board 256）と同じ扱い。

## 裁定260（Agoora 承認 2026-09-15）pin の走査対象は許可列挙で書く'''),
 # 裁定272 適用欄補記 (i)(ii)
 ('''＝説明文では関数名を避ける（本便で文言修正）。''',
  '''＝説明文では関数名を避ける（本便で文言修正・教訓90）。
補記（2026-09-18・M-4）: (i) set_store_* の実数＝控え（0147_pre §7）12 本（biz_cutoff／business_hours／cast_register／norm_config／okuri_base／okuri_mode／pin_policy／pricing／profile／receipt_profile／tax_config／time_pricing）に対し live は **13 本**＝控え外は **set_store_receivable_policy（0148 ★8 新設）のみ**。0148 前後で控え 12 本の md5 は全て不変（11 本は pg_get_functiondef の md5・set_store_profile は prosrc md5 f2196d09… で照合）。A-5 の検証式は当初「set_store_* 走査 15 本」を前提にしていたため新設 1 本で 16 本になり NG 表示＝式を「控え 12＋新設 1＋money-core 3＝16 本・新設は控えと照合しない」に直して OK（DB 側の不一致ではない）。(ii) **check_add_referral は kiosk 腕（`auth_kiosk_register_store_id()`／`auth_kiosk_operator()` の OR 連鎖・`coalesce(auth_org_id(), auth_kiosk_org_id())`）を持つ**＝check_add_line の冒頭〜role 判定（custom 分岐の写経元）をそのまま逐語で写したことに由来。名簿 A1 は [K] で収載・billing 段47-3（kiosk 腕 16→17）・grants G31（18→19／20→21／18→19）の pin をそれに合わせた。**現状維持**（腕を外す改修はしていない）。kiosk から紹介料を起票させるかの是非は裁定273 系で相談役が判断。'''),
 ('''教訓88（DB を触る node -e は finally で閉じる）は本便の全 script で遵守（提案のまま・収載は Agoora 判断）。''',
  '''教訓88（DB を触る node -e は finally で閉じる）は本便の全 script で遵守（2026-09-18 承認＝教訓88 として収載）。'''),
 # f0 pin 節: 停止 1 の経緯 1 行
 ('''push＝`488a169..9cff22c`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。''',
  '''push＝`488a169..9cff22c`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。
- **本日（2026-09-18）の f0 走数＝6（緑 4・無効 1・停止 1）**: 停止 1＝11:50:48 に run1（11:43〜11:50・40 段目 reopen で赤）の結果を読む前に run2 を bg 起動してしまい、直後に赤を確認して TaskStop（起動 sleep 中＝段 0・suite 未起動・DB 不触＝f0_run13.start 未作成）。型判定＝走行前の手順ミス（裁定230「赤なら再走せず段名を報告して止まる」の順序違反・DB 応答や設計上の衝突ではない）。以後は run1 の exit を読んでから run2 を起動する。'''),
])
print("M patch done")
