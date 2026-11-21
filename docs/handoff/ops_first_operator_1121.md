# 最初の運営者を入れる手順（2026-11-21 昼・0202a 適用と版 1 の main 入りの後）

元＝docs/tmp/handpaste_0202a_1120.md §5（git の外）の写し。秘密（パスワード・認証アプリのキー）はここに書かない。

## 最初の運営者（info@agoora.co.jp）を入れる（本番・Agoora が行う・1 歩ずつ）〔2026-11-21 昼 書き直し＝0202a 適用済み・版 1 の画面は main〕

前提：0202a は本番に適用済み（2026-11-21 12:06:44）。版 1 の画面（/ops）は main に入り、本番で開いている。運営者を足す画面は版 1 に無い＝2 人目以降も同じ手順。

### A. Supabase の管理画面（3 か所）
1. Supabase の管理画面を開き、**URL に hiqbfagmkrdpmlqhkmsu が入っていること**を目で見る（違うプロジェクトなら閉じる）。
2. 左の Authentication › Sign In / Providers を開き、Multi-Factor の TOTP が有効になっていることを見る（既定で有効。11/21 の確かめの運営者は TOTP を登録できた）。
3. 左の Authentication › Users › 右上の「Add user」›「Create new user」：
   - Email：info@agoora.co.jp
   - Password：Agoora が決める（どこにも書かない・docs にも書かない）
   - 「Auto Confirm User」を ON
   - 「Create user」を押す → 一覧に info@agoora.co.jp が出る。

### B. SQL Editor（3 回に分けて Run・毎回 URL の ref を目で見てから）
4. 1 回目（読むだけ）：
   ```sql
   select 'nox-project-proof', count(*) from public.orgs;
   ```
   → 1 行（会社の数）が出る。続けて：
   ```sql
   select count(*) from public.users where lower(email) = 'info@agoora.co.jp';
   ```
   → **0** であること（0 でなければ止める＝店のユーザーと同じメール。DB の柵も「store user cannot be an operator」で止める）。
5. 2 回目（書く・1 回だけ）：
   ```sql
   begin;
   insert into public.ops_operators (auth_user_id, email, name, role)
   select id, email, 'Agoora', 'ops_admin' from auth.users where lower(email) = 'info@agoora.co.jp';
   insert into public.ops_audit_logs (ops_user_id, action, target, after_json)
   select auth_user_id, 'ops.operator.seed', 'ops_operators:' || auth_user_id::text, jsonb_build_object('email', email, 'by', 'sql-editor')
     from public.ops_operators where lower(email) = 'info@agoora.co.jp';
   commit;
   ```
   → 「Success. No rows returned」。
6. 3 回目（読むだけ）：
   ```sql
   select email, name, role, is_active from public.ops_operators;
   ```
   → info@agoora.co.jp・Agoora・ops_admin・true の 1 行（確かめの運営者 ops-check@noxapp.jp は 11/21 に消した＝出ない）。

### C. 運営の画面で認証アプリを登録（スマホに認証アプリを入れておく：Google Authenticator など）
7. ブラウザで https://noxapp.jp/ops/login を開く（店のログイン /login とは別）。見出しは「NOX 運営」。
8. 「メール」に info@agoora.co.jp・「パスワード」に 3 で決めたもの →「ログイン」。
   - 違うと「メールかパスワードが違います」（運営者でない人にも同じ文）。
9. 「認証アプリを登録します」の画面になる：
   - スマホの認証アプリで QR を読む（読めないときは、QR の下の「手入力のキー」をアプリに入れる）。
   - アプリに出る 6 桁を「6 桁のコード」に入れて「登録する」。
   - 「コードが違います」と出たら、アプリの次の数字（30 秒ごとに変わる）で入れ直す。
10. 「NOX 運営」のテナント一覧が出れば終わり。
11. 2 回目からのログイン：7〜8 の後に「6 桁のコードを入れてください」→ アプリの 6 桁 →「確かめる」。
12. 終わるときは、右上の「ログアウト」。

### D. 困ったとき
- 認証アプリを失くした（運営者が 1 人の間）：SQL Editor（ref を目で見る）で
  ```sql
  delete from auth.mfa_factors where user_id = (select id from auth.users where lower(email) = 'info@agoora.co.jp');
  ```
  → 次のログインで 9 からやり直し。
- 運営者のメールで店の画面（/dashboard など）には入れない（運営者は店のユーザーではない）。店の確かめはデモの入口か、店のアカウントで。
- 運営者をやめる：Authentication › Users でその人を消す（運営者の表の行も一緒に消える・運営の記録は残る）。
