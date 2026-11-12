# Supabase に認証メールのテンプレートを貼る手順（Agoora・1 枚・2026-11-12）

正＝2026-11-10 に確定した文面（このフォルダの 5 本）。2026-11-12 のひな形 v0.1 の当てはめ（■15）は取り下げ。
**リンクの形（2026-11-12 ■K-1 で承認）**＝4 本（再設定・招待・確認・マジックリンク）のボタンと「貼り付けて」の URL は `{{ .SiteURL }}/auth/set-password?token_hash={{ .TokenHash }}&type=…`（recovery／invite／email／magiclink）。`{{ .ConfirmationURL }}` は使わない（申し込んだのと別の端末で PKCE のエラーになる＝cross_device_links.md）。email_change は今は送っていない＝対象外・貼らない。
**貼る前の柵**＝/auth/set-password が「開いただけで合言葉を使う」作りを直す便（相談役の確認の後）が本番に出てから貼る。
貼る先の確認＝Supabase の URL の ref が **hiqbfagmkrdpmlqhkmsu**（NOX の本番）であることを目視してから。

## 1. 件名（店名は入れない＝確かめ済み）

| ファイル | Supabase のテンプレート | 件名（Subject 欄に貼る） | NOX で今送っているか |
|---|---|---|---|
| invite.html | Invite user | 【NOX】店舗への招待 | 送っている（オーナーの招待＝scripts/admin/create-org.mjs:119） |
| recovery.html | Reset password | 【NOX】パスワード再設定のご案内 | 送っている（/auth/forgot＝app/auth/forgot/page.tsx:29） |
| confirm_signup.html | Confirm signup | 【NOX】メールアドレスの確認 | 送っていない（予備） |
| magic_link.html | Magic Link | 【NOX】ログイン用リンク | 送っていない（予備） |
| email_change.html | Change Email Address | 【NOX】メールアドレス変更の確認 | 送っていない（予備）＝**対象外・今は貼らない**（■K-1） |

5 本とも件名に店名は入っていない（本文の変数は `{{ .SiteURL }}` と `{{ .TokenHash }}` だけ＝店名の変数なし・署名は「NOX（株式会社レクソル）」）。

## 2. 手順

1. **Authentication › Sign In / Providers › Email**（画面によっては Providers › Email）の **Email OTP expiration** を **3600**（秒＝1 時間）にして保存。文面の「1 時間有効」と合わせる。
1-2. **Authentication › URL Configuration** の **Site URL が `https://noxapp.jp`** であることを目視（リンクの頭になる）。Redirect URLs に `https://noxapp.jp/auth/set-password` があること。
2. **Authentication › SMTP Settings**（Resend の noxapp.jp のドメイン認証が Verified になってから）＝Enable Custom SMTP・Host `smtp.resend.com`・Port `465`・User `resend`・Password＝**NOX 専用の新しい Resend のアカウント**の API キー（チャットにも CC にも貼らない）・Sender email `noreply@noxapp.jp`・Sender name `NOX`。
3. **Authentication › Emails（Email Templates）**＝上の表のとおり、テンプレートごとに Subject に件名、Message body に .html の全文（Source のモード）を貼って保存。Invite user と Reset password は必ず・Confirm signup と Magic Link は予備として貼る・Change Email Address は貼らない（今は送っていない）。貼った後、Message body の中に `ConfirmationURL` の文字が残っていないことを目で確かめる。
4. 確かめ＝自分の本番のアカウントのメールで https://noxapp.jp/auth/forgot から 1 通（Reset password）。**申し込んだのと別の端末（スマホ）と別のブラウザの 2 か所で開いて**、パスワードの入力の前の画面が出ること（「リンクが無効」にならない）。受信箱で見ること＝差出人「NOX &lt;noreply@noxapp.jp&gt;」・件名「【NOX】パスワード再設定のご案内」・ロゴ・金のボタン・ボタンを押した後のアドレスが https://noxapp.jp/auth/set-password（パスワードは変えずに閉じてよい）・署名「NOX（株式会社レクソル）」・迷惑メールに入っていない（できれば「メッセージのソース」で SPF／DKIM／DMARC が PASS）。CC は送信の時刻（auth.users の recovery_sent_at）を読取で確かめられる。
5. 招待は、次にオーナーを登録するとき（create-org.mjs の本流）の 1 通で同じように確かめる（--link と --dry-run はメールを送らない）。
