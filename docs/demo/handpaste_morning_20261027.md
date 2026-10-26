# 明朝の手貼り一覧（Agoora 向け・2026-10-27 朝・0180〜0186）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に、下の表の順に 1 本ずつ全文を貼って Run（どれも `begin;`〜`commit;` の単一トランザクション・冒頭に貼り先証明）。**0185 を最優先**（レジ端末の「PIN だけで解除」が本番で失敗している＝今は従来の操作担当選択で動かしている）。
2. 各 Run の後に、そのファイルの末尾 **===== verify =====** を貼って返った行を CC へ（期待値は表の右端・詳しくは各 handpaste_018n.md）。Success の表示だけでは適用の証明にならない（恒久注意28）。
3. 貼る前に URL の ref（hiqbfagmkrdpmlqhkmsu）を目視。sha16 が表と違うファイルは貼らない（CC に確認）。

| 順 | ファイル（supabase/migrations/） | 行 | sha256 先頭 16 桁 | 中身（1 行） | verify の期待値（CC へ返すもの） |
|---|---|---|---|---|---|
| 1 | **0185_kiosk_qr_reverse.sql** | 265 | **a00055c966c294e1** | キオスクの QR の向き（キオスクが QR→スマホで読む）＋**PIN だけの解除の不具合の直し**（search_path・min(uuid)） | tables rls 2 本 true・table grants 0・rpc 3 行とも authenticated あり・retired 2 true・operator qr 180 true・**search_path fixed true**・qr_secret left 0 |
| 2 | 0180_okuri_flat_tiers.sql | 883 | **57a84a11276ba974** | 送り 定額徴収の距離区分（最大 3 段）・キャストの送り区分 | (2)(3)(4)＝md5 set_store_profile ffc76412・okuri_today_summary d1b5ca84・set_cast_okuri_tier 719129cd／casts.okuri_tier text null 可＋CHECK／白名単 true |
| 3 | 0181_check_open_service_rate_by_seat.sql | 329 | **10769e5f9d9603ea** | 開卓のときの卓種別サ料（VIP 35% 等）を伝票に凍結 | (2)＝md5 9869c236・has_star t・proacl {postgres,service_role,authenticated} |
| 4 | 0182_check_move_seat_pricing.sql | 316 | **454bf43a4c790086** | 席移動で席種が変わるときの料金（VIP セット・延長） | service_pre 1・move_seat has 0182 true・group_due has 0182 true・group_due acl に authenticated なし・move_seat acl に authenticated あり |
| 5 | 0183_shift_staff_reservation_guest_norm_intent.sql | 911 | **f7a98b59338ce400** | シフト ON のスタッフ＝店長と同じ・新規客の予約・ノルマ未達の意思・**★4 源泉区分と控除（裁定432）**・**★5 定休日の実出勤を確定シフトに（M-14）** | can_shift 句 11・guest fn 1・rtc has 0183 true・432 tables 2・432 rpc 3・432 kind cols 2・intents 1・intents grant SELECT |
| 6 | 0184_withholding_integer.sql | 97 | **94c5fcab2281d17b** | 日払いの源泉 10.21% を整数で（裁定431 ②） | daily_pay_issue integer true・acl に authenticated あり |
| 7 | 0186_w10_make.sql | 215 | **15143fd04f488674** | 特別営業日・臨時休業／既定に従うへ戻す／納付記録の取消／監査ログの出力の記録（W-10） | special table true・special grant SELECT・rpc 5＝5・closed-day 0186＝2 |

**順番の理由**: 0185 は本番の不具合の直し（PIN だけの解除）を含むので最初。ほかは互いに独立（同じ関数を触らない）＝番号順で貼る。0183 は旧 sha16（1819fa1f…・045043b7…）を破棄して上の f7a98b59… が正。

**貼った後に CC へ返すもの**（1 本ごと・まとめても可）:
- 「018n を貼った」＋ verify の返り値（表の右端の行）。
- Run でエラーが出たときは、エラーの全文（ロールバックされて本番は無傷＝単一トランザクション）。

**CC がやること（受け取った後）**: 貼った mig ごとにフラグを true（0180＝OKURI_TIERS_APPLIED・0182＝SEAT_MOVE_PRICING_APPLIED・0183＝MIG_0183_APPLIED・0185＝MIG_0185_APPLIED・0186＝MIG_0186_APPLIED・0181／0184 はフラグなし）→ suite の pin 張替え（関数数・grants の表数・md5）→ f0 2 連 → live（各 handpaste_018n.md の「適用後に CC がやること」）→ push → mig を収蔵（git add）。

**手貼り案内の個票**: docs/demo/handpaste_0180.md・0181.md・0182.md・0183.md・0184.md・0185.md・0186.md。
