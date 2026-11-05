# Supabase Auth のメールテンプレート（下書き・2026-11-05 夜の自走便 6）

文面は相談役が差し替える前提。変数は Supabase の Go テンプレート（`{{ .ConfirmationURL }}`＝リンク・`{{ .SiteURL }}`＝Site URL＝https://noxapp.jp・`{{ .Email }}`／`{{ .NewEmail }}`・`{{ .Token }}`＝6 桁コード）。

| ファイル | Supabase の Email Templates | 件名（案） | 使う場面（NOX） |
|---|---|---|---|
| invite.html | Invite user | 【NOX】アカウントのご案内 | オーナーの招待（scripts/admin/create-org.mjs＝inviteUserByEmail→/auth/set-password）。スタッフ／キャストの招待は自前トークン（/i/<token>）＝このテンプレは使わない |
| recovery.html | Reset password | 【NOX】パスワード再設定のご案内 | /auth/forgot（M-84＝resetPasswordForEmail・redirectTo /auth/set-password）・ダッシュボードの Send password recovery |
| magic_link.html | Magic Link | 【NOX】ログイン用リンク | 今は画面から送らない（LINE ログイン／デモ入場はサーバで verifyOtp＝メールは出ない）＝予備 |
| email_change.html | Change Email Address | 【NOX】メールアドレス変更の確認 | スタッフのメール変更（裁定267＝admin.updateUserById＝確認メールは出ない）＝予備 |

- 送信元＝`noreply@noxapp.jp`（Resend のカスタム SMTP＝Supabase › Authentication › SMTP Settings・Sender name「NOX」）。
- ロゴ＝`https://noxapp.jp/brand/nox_logo_horizontal_dark.png`（暗い地の帯に置く・SVG はメールクライアントが落とすので PNG）。ボタン＝金（#c9a24a・文字 #1a1a1a）。本文の地＝白・文字 #1a1a1a・補足 #666。
- リンクの有効期限＝Email OTP expiration（推奨 3600 秒）に合わせて文面の「1 時間」を直す。
- 貼り方＝Supabase › Authentication › Email Templates › 各テンプレの Subject と Body（HTML）に貼る → 自分宛に /auth/forgot で 1 通出して見た目を確認。
