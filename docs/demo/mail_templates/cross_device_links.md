# 認証メールのリンクを別の端末で開いても通る形にする案（■J の追加・2026-11-12・相談役の確認待ち＝貼る前に見る）

## 起きたこと（Agoora の実機・2026-11-12）
- /auth/forgot で申し込んだのと同じブラウザで開く＝再設定が通った。
- 別のブラウザ・別の端末で開く＝PKCE のエラー。

## 原因（コードの読取）
- /auth/forgot はブラウザの Supabase client（@supabase/ssr の createBrowserClient＝既定で PKCE）で resetPasswordForEmail を呼ぶ（app/auth/forgot/page.tsx:27-29）。
  PKCE では、申し込んだブラウザに「code_verifier」が保存される。
- 確定済みのテンプレートのリンク＝`{{ .ConfirmationURL }}`（5 本とも）。PKCE のときは Supabase の /auth/v1/verify を通って `/auth/set-password?code=…` に戻る。
  set-password は `exchangeCodeForSession(code)`（app/auth/set-password/page.tsx:36-38）＝**申し込んだブラウザの code_verifier が要る**＝別のブラウザ・端末では必ず失敗する。

## 4 つのメールの今の形

| メール | 誰が出すか | PKCE か | 今のリンク（ConfirmationURL）で別の端末 |
|---|---|---|---|
| 再設定（recovery） | 本人のブラウザ（/auth/forgot） | PKCE | **通らない**（Agoora の実機と一致） |
| 招待（invite） | サーバー（create-org.mjs:119＝admin.inviteUserByEmail） | PKCE ではない（admin＝code_verifier を作らない） | 通るはず（`#access_token=…` で戻る＝set-password の①）。**実機で未確認** |
| 確認（confirm signup） | NOX は今送っていない（signUp を使っていない） | — | 予備 |
| 変更（email change） | NOX は今送っていない（スタッフのメール変更は admin.updateUserById＋email_confirm:true＝メールなし・app/api/staff/update-email/route.ts:6） | — | 予備 |

- スタッフ・キャストの招待（/i/&lt;token&gt;）は NOX 独自のトークン＝Supabase のメールではない＝端末に依らない。

## 直す案（テンプレートのリンクだけ・コードは変えない）
`{{ .ConfirmationURL }}` をやめ、`token_hash` を NOX の画面に直接渡す形にする。set-password はすでに `?token_hash=…&type=…` を受けて `verifyOtp` する（page.tsx:40-43）＝**code_verifier が要らない＝どの端末でも通る**（Supabase が SSR／PKCE 向けに勧めている形）。

| テンプレート | 直した後のリンク（a の href と、下の「貼り付けて」の URL の 2 か所） |
|---|---|
| Reset password | `{{ .SiteURL }}/auth/set-password?token_hash={{ .TokenHash }}&type=recovery` |
| Invite user | `{{ .SiteURL }}/auth/set-password?token_hash={{ .TokenHash }}&type=invite` |
| Confirm signup（予備） | `{{ .SiteURL }}/auth/set-password?token_hash={{ .TokenHash }}&type=email` |
| Magic Link（予備） | `{{ .SiteURL }}/auth/set-password?token_hash={{ .TokenHash }}&type=magiclink`（※着いた先がパスワード設定になる＝使い始めるときに行き先を見直す） |
| Change Email Address（予備） | 今の set-password は type=email_change を受けない＝**このままでは通らない**。使い始めるときに受け口（verifyOtp type email_change→「変更しました」）を client で足す＝それまで貼らない（今どおり相談役の確認の後） |

- 前提＝Supabase › Authentication › URL Configuration の **Site URL が `https://noxapp.jp`**（貼る前に Agoora が目視）。`{{ .RedirectTo }}` は申し込んだ画面の origin に依るため使わない。
- 文面・件名・見た目は変えない（2026-11-10 確定のまま）。変えるのは URL の 2 か所だけ。
- 招待は今の形でも通るはずだが、招待も同じ形にそろえる（Supabase の設定や SDK の既定が変わっても端末に依らない）。

## 確かめ方（■J の 1・Agoora）
1. 再設定＝PC のブラウザ A で /auth/forgot → **スマホ（別の端末）**で受信したメールのボタンを押す → /auth/set-password でパスワードの入力欄が出る（「リンクが無効」にならない）。パスワードは変えずに閉じてよい。
2. 同じことを PC のブラウザ B（A と別のブラウザ）でも。
3. 招待＝次にオーナーを登録するとき（create-org.mjs の本流＝メールが出る）、送った PC と別の端末で開く。
4. 確認・変更は NOX が今送っていない＝送り始める便で確かめる（launch_gate 10 の期待値に含める）。

## 直した後に変わらないこと
- /auth/set-password のコードは変えない（①implicit・②code・③token_hash の 3 つを受けるまま＝古いメールのリンクも受ける）。
- verify の張り替えは要らない（テンプレートは Supabase の画面に貼るもので、repo の .html は文面の正本）。repo の 5 本の .html の URL は、相談役の OK の後に同じ形に直す。
