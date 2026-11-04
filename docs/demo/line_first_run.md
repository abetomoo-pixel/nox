# LINE 連携＝本番の自分の org で初回に確かめる手順（2026-11-04・docs/tmp/line_check.md ⑤から移した・noxapp.jp 切替の後に）

前提＝LINE Developers の設定値 5 つ（ログインチャネル ID・LIFF ID・チャネルシークレット・チャネルアクセストークン（長期）・bot の destination（任意））を 店舗設定 › LINE 連携 に入れてある。LIFF エンドポイント URL と Webhook URL は site 固定＝**noxapp.jp への切替の後**に LINE Developers 側へ写す（vercel.app で先に始めたら両方を書き換える）。デモ org では試せない（送らない・返事しない柵）。読取の全体＝docs/tmp/line_check.md。

## 初回に確かめる手順（8 段）（LINE Developers の設定値 5 つ＝ログインチャネル ID・LIFF ID・チャネルシークレット・チャネルアクセストークン（長期）・bot の destination（任意）を店舗設定 › LINE 連携に入れたあと）
前提＝noxapp.jp への切替が先（LIFF エンドポイント URL と Webhook URL は `<site>` 固定＝切替の後に LINE Developers 側を直す必要がある＝vercel.app で始めるなら両方の URL を後で書き換える）。デモ org では試せない（送らない・返事しない柵）。
1. **公開値の確認**＝店舗設定 › LINE 連携に LIFF エンドポイント URL（`https://noxapp.jp/liff/<storeId>`・サイズ Full・Scope openid）と Webhook URL（`https://noxapp.jp/api/line/webhook/<storeId>`）が出る → LINE Developers の LINE ログインチャネル（LIFF）と Messaging API チャネル（Webhook の利用 ON・応答メッセージ OFF・あいさつメッセージは任意）に写す。
2. **Webhook の到達**＝LINE Developers の「検証」（POST）→ 200 が返る（署名違いなら 401・channel_secret 未保存なら 503＝Vault の保存を確認）。
3. **友だち追加**＝自分の LINE で bot を友だち追加 → 返事「友だち追加ありがとうございます。<店名> のシフトはこちら：…」が来る（access_token が正しい証拠）。来なければ access_token（長期）を見直す。
4. **紐付け**＝スタッフ画面（/staff）で自分の行の「LINE 連携」→ 招待リンクを LINE 内で開く（トーク画面に貼って自分で開く）→ LIFF がログイン→「紐付けています…」→ /dashboard に落ちる。line_links に 1 行（店舗設定 › LINE 連携の KPI「連携 1 人」）。
5. **ログイン**＝LINE のトークから入口 URL（返事のリンク）を開く → そのまま /dashboard に入る（session route）。別の LINE で開くと「まだ紐付いていません」。
6. **push 1 通**＝お知らせを 1 件作り「LINE で送る」（audience＝スタッフ）→ 自分の LINE に「【店名】タイトル」が届く → 店舗設定 › LINE 連携の今月の送信数が 1（台帳 line_push_log に sent 1 行・http 200）。
7. **キャスト経路**＝テスト用のキャスト 1 人を招待（ログインの登録）→ キャスト画面の「LINE 連携」→ 紐付け → /mine に落ちる → シフトを 1 件追加して shift_added の push が届く（届かなければ台帳の failed の http_status と error_detail を読む）。
8. **後始末**＝テスト用のキャストと line_links の行を消す（line_links は UI に削除が無い＝**解除の口は無い**＝管理者が SQL で消す・または別の LINE で再紐付け＝on conflict で上書き）。


## ローンチ前の最小 3 点（M-77・便 B の後の便）
- ① 期間の公開で、その期間に配置されたキャスト全員に 1 通（「◯/◯〜◯/◯ のシフトが公開されました」＋本人の出勤日・台帳 kind＝既存の shift_published）。
- ② unfollow の Webhook で line_links を「ブロック」にして以後の push を止める（キャスト詳細に「LINE ブロック中」バッジ・状態列は 0195 に同乗）。
- ③ キャスト詳細「アカウント」に「LINE の紐付けを解除」（再紐付けは招待リンク）。
- 退勤忘れ・給与・日報・管理者宛ては ローンチ後（kind は残す・画面の説明文を現状に合わせる）。
