# Supabase Auth のメールテンプレート（2026-11-05 夜の自走便 6 → 2026-11-06 夜便レーン 5 で仕上げ → **2026-11-10 相談役の文面 4 本で確定**）

## 2026-11-10 確定＝4 本の文面は相談役（v61 §5）のとおり
- **確定 4 本**＝confirm_signup（【NOX】メールアドレスの確認）・invite（【NOX】店舗への招待）・magic_link（【NOX】ログイン用リンク）・recovery（【NOX】パスワード再設定のご案内）。.txt＝§5 の文面そのまま（1 行目「件名:」）・.html＝同じ文面を見出し・本文・ボタン・貼り付け用 URL・注記・署名に配置。**変数は `{{ .ConfirmationURL }}` だけ**（`{{ .Email }}`／`{{ .SiteURL }}` は 4 本から外した）。署名＝「NOX（株式会社Agoora）」。
- **email_change**（Change Email Address）は §5 に無い＝下書きのまま（裁定267＝確認メールは出ない＝予備）。
- 貼るのは Agoora（下の「Supabase 側の貼り方」＝Subject に件名・Message body に .html の全文）。

## 夜便レーン 5（2026-11-06）の仕上げ（記録＝差し込み位置の設計）
- **5 本**＝confirm_signup（Confirm signup＝メールアドレスの確認）・invite（Invite user）・magic_link（Magic Link）・recovery（Reset password）・email_change（Change Email Address）。各 **HTML（.html）とテキスト（.txt）** の両方。
- **Supabase の変数**（Go テンプレート・そのまま貼る）＝`{{ .ConfirmationURL }}`（ボタンと「貼り付け用 URL」の 2 か所・**変えない**）／`{{ .Email }}`（宛先）／`{{ .NewEmail }}`（email_change だけ）／`{{ .SiteURL }}`（フッターのリンク＝Site URL＝https://noxapp.jp）。`{{ .Token }}`（6 桁コード）は使わない（リンク方式）。
- **差し込み位置（固定）**＝HTML は `<!-- ▼ … -->` のコメントの直後＝①件名（Subject 欄）②見出し（18px の行）③本文（14px の行）④ボタンの文言（href は固定）⑤有効期限の注記⑥フッター。テキスト（.txt）は 1 行目「件名:」＋本文＝同じ順。相談役は**この 6 か所の文言だけ**を差し替える（変数と構造は触らない）。
- **送信者**＝Sender name「**NOX**」・Sender email `noreply@noxapp.jp`（Resend のカスタム SMTP）。
- **件名の案**＝【NOX】メールアドレスの確認／【NOX】アカウントのご案内／【NOX】ログイン用リンク／【NOX】パスワード再設定のご案内／【NOX】メールアドレス変更の確認。

## Supabase 側の貼り方（Agoora・URL の ref＝hiqbfagmkrdpmlqhkmsu を目視）
1. **Authentication › Emails（Email Templates）**＝テンプレごとに **Subject** に件名、**Message body（HTML）** に .html の全文を貼る（Source モード）。テキスト版は Supabase の UI に別欄が無い＝HTML が読めないクライアント向けの予備＝そのまま保管（Resend の Plain text には貼らない）。
   - Confirm signup ← confirm_signup.html／Invite user ← invite.html／Magic Link ← magic_link.html／Reset password（Recovery）← recovery.html／Change Email Address ← email_change.html。
2. **Authentication › Providers › Email**＝「Email OTP expiration」を **3600**（秒＝1 時間＝文面の「1 時間有効」と一致）。「Confirm email」は今の設定のまま（招待は inviteUserByEmail＝確認不要）。
3. **Authentication › SMTP Settings**＝Enable Custom SMTP＝Resend（Host smtp.resend.com・Port 465・User resend・Password＝API キー・Sender email noreply@noxapp.jp・Sender name NOX）。Resend 側＝noxapp.jp のドメイン認証（TXT／MX／DKIM）が Verified になってから。
4. **Authentication › URL Configuration**＝Site URL https://noxapp.jp・Redirect URLs に https://noxapp.jp/**（docs/tmp/domain_switch.md §4 の 1・2）。
5. 確認＝自分宛に **/auth/forgot** で 1 通（recovery）→ 件名・ロゴ・ボタン・リンク先が noxapp.jp/auth/set-password であること。ロゴが出なければ https://noxapp.jp/brand/nox_logo_horizontal_dark.png を直接開いて 200 を確認。

（以下は 2026-11-05 の下書きの記録）

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
