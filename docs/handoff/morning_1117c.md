# 報告 2026-11-17 午後（相談役 0〜4＋ホストクラブの調べ・CC）

## 0. 3200 番の dev
- 起こした：.claude/launch.json の「nox-dev」（`npm run dev`＝`next dev -p 3200`・設定は変えていない）を Claude の preview（preview_start nox-dev）で 14:1x に起動。以後、止めていない・再起動していない。
- actions-center は 3200 に頼らない形に直した（検査の側だけ・32475b43）：いつも自前の一時の dev（`npx next dev -p 3290`・出力先 NEXT_DIST_DIR=.next-ac・Dropbox の同期から外す印を付ける）を立て、終わりに子のプロセスまで止め（taskkill /T）、tsconfig.json／next-env.d.ts を起動前の中身に戻し、出力先を消す。NOX_UI_BASE を渡したときだけその dev を使う。単独で流して確かめた＝202 本 OK・3290 は止まった・tsconfig は元のまま・.next-ac は無い・3200 は動いたまま。

## 1. 手元の直しを出した（push 71a806dc・32475b43）
- f0 2 連緑（H16 14:36・H17 15:00＝214 段・8,159 件・golden 5931／125802 不変）・手元のビルド・Vercel success（15:05）。
- 本番のデモで確かめた（15:1x〜15:37・終わって reset 15:47）：
  - NEST：ケンが 11/25 の休み（時刻なし）を提出 → 店長の ③シフト配置が**落ちずに開く**（直す前は Application error）。休み希望は ②提出一覧に「ケン 出勤希望 2 日・休み 1 日」と出る（③の承認待ちには出ない作り＝休み希望は採否が要らない）。
  - MUSE：端末でえみ（今日シフトなし）が出勤 → 給与の下書き（2026-11）に「△ シフト無し出勤 1 日（…）」の印。
  - ACE：予約の申請を既定の日時（11/17 20:00＝15 時台なので 20:00 のまま）のまま「申請する」→「申請しました」・承認待ち。夜の既定の寄せは検査 n1117 の n(2) で確かめた。
  - ACE：体入のるなのカード＝「今期の時給 ¥2,200 体入」（直す前は ¥2,500 基本）。

## 2. demo-frozen の直し（初期化の hook の順）
（→ 下の節に結果）

## 3. レジの許可があるキャストが読めるほかの人の列（読取・コードは変えていない）
- ★先頭：**casts の体入の条件（trial_wage＝体入の時給の金額・trial_days・trial_started_on・trial_ends_on）**が、同じ店のほかのキャストの分まで読める。あわせて employment（雇用／委託）・okuri_tier（送りの区分）・rank_id（ランク）・joined_on（入店日）・left_on（退店日）・user_id・shift_request_mode・kind（体入など）も読める。
- PIN に関わる値・連絡先・生年月日・住所は casts に無い（cast_sensitive・users・memberships＝本人の行だけ）＝読めない。
- **daily_reports**（同じ店の日報）＝店の売上・現金・カード・経費・送りの現金・差異・差異の理由・メモ・締めた人の id など 46 列すべて（キャスト別の金額は無い＝店の金額）。
- **seats**＝卓の名前・種類・並び（9 列・機微なし）。
- 列ごとの制限は無い（authenticated に表ごとの SELECT＝列の権限は全部）。行の範囲は RLS（auth_cast_can_register なら同じ店の全員）。

## 4. B-1（デモの端末の固定）＝案②の書き出し（実装しない）
- **mig が要る**：端末の固定の判定は DB の関数（SECURITY DEFINER）で、画面からは外せない。
- **触る関数（7 本）**：kiosk_device_bind（初めての端末で device_fp を書く・違えば 'device bound'）・kiosk_login・kiosk_unlock・kiosk_qr_poll・kiosk_qr_secret（device_fp が入っていて違えば 'device bound'）・kiosk_person_claim（固定が前提＝未固定なら 'not bound'・違えば 'device bound'）・kiosk_person_touch（device_fp が一致する端末のセッションだけ）。
- **案②の形**：kiosk_device_bind は、端末アカウントの会社がデモ（orgs.is_demo＝true）なら device_fp を書かずに ok を返す（固定しない）。ほかの 5 本は「device_fp が null なら通す」作りなので、それで通る。kiosk_person_claim と kiosk_person_touch は固定が前提なので、デモの会社だけ「device_fp を見ない」分岐を足す（本人として入る端末の画面がデモでも使えるように）。
- **デモの会社の見分け方**：既にある orgs.is_demo（0149・NOX-DEMO-ACE〜NEST の 6 社が true・旧 NOX-DEMO は false）を関数の中で読む（新しい列・表は要らない）。実際の店（is_demo＝false）には効かない。
- 検査：anon-guard／k201m の端末の段に「デモの会社は 2 つの指紋から入れる・実際の会社は 'device bound'」を足す。

## 5. ホストクラブの調べ
（→ docs/tmp/host_gap_1117.md・要点は下）
