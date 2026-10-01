# デモ用アカウント案（DEMO_USERS）

便 D0-5（裁定328・2026-10-01）。読取のみ・作成は便 D2（create-demo-orgs --apply）。

## 1. 構成

店ごと（6 店）に 4 役割＝**24 ユーザー**＋ kiosk 端末ユーザー 6（任意・§3）。

| 役割 | NOX の role | 入場後の初期画面 | 録画での対応 |
|---|---|---|---|
| owner | memberships.role 'owner' | /dashboard | users 1（残す 3 表）＋ memberships（録画・store 1） |
| manager（店長） | 'manager' | /dashboard | 同上 |
| staff（黒服） | 'staff'・can_register／can_crm／can_shift／can_close true | /register（レジ）＝入場 route の dest に 'staff' を追加 | 同上。people の黒服 1 名を**この auth ユーザーに結線**（NEST は裏方） |
| cast | 'cast'（casts.user_id＝users.id） | /mine | people の代表 cast 1 名（MUSE さおり／LUNA みさき／NOIR あべ／ACE ひなの／LILY みく／NEST ケン＝代表伝票の受領者）を結線 |

合成 email＝`demo-<store>-<role>@nox-demo.local`（既存 emailOf の業態→店コード置換・小文字: muse／luna／noir／ace／lily／nest）。users.name＝「デモ オーナー」等の既存 ROLES の名前（cast は people の display_name）。

## 2. env DEMO_USERS

既存 parseDemoUsers の形（JSON・"<key>:<role>" → auth user id）を**店コードキー**に: 

```
DEMO_USERS={"muse:owner":"<uuid>","muse:manager":"<uuid>","muse:staff":"<uuid>","muse:cast":"<uuid>", … "nest:cast":"<uuid>"}
```

24 本。入場 route の `DEMO_BIZ_TYPES` を店コード 6 に・`ROLES` に 'staff' を追加（dest 'staff' → /register）。buildPayload の userIdByRole も 4 役割へ。auth user id は資格情報ではない（Vercel env に置く・repo には置かない）。

## 3. 共通パスワード

- **置かない**（推奨）。入場は magiclink（generateLink→verifyOtp をサーバ内で完結・メールは送らない）＝パスワードを誰も知らない状態が 328「owner のメール／パスワード変更不可」に最も近い。create-demo-orgs は randomBytes(24) のパスワードを捨てている（既存）。
- 置く場合（相談役が「共通パスワードでログイン画面からも入れる」を望むとき）: 6 店 × 4 役割の全員に同じ値（env DEMO_PASSWORD・Vercel env・repo に置かない）。リセット時に `auth.admin.updateUserById(id, {password})` で戻す（273-7「リセット時に demo ユーザーの email/PW を admin で戻す」）＝afterResetHooks に 24 回の updateUserById（1 回 100〜200ms・4 秒）。**訪問者が変えられる経路（/auth の設定画面・auth.updateUser）を Auth 設定 4 点で塞がない限り、共通パスワードは他の訪問者を締め出す道具になる**＝置くなら Auth 設定 4 点の後。
- kiosk 端末ユーザー（店ごと 1・purpose punch）: kiosk_devices.auth_user_id に結線する auth ユーザー。パスワード不要（kiosk_login は membership の PIN）。328「kiosk トークン固定」＝録画に kiosk_devices を含めて ID 固定・auth ユーザーは残す 3 表の外だが auth.users は demo_org_reset の対象外＝不変。

## 4. Auth 設定 4 点との関係（Agoora・持越し AW-5）

| # | 設定 | デモとの関係 |
|---|---|---|
| ① | Secure email change／ユーザー自身の email 変更を止める | owner が自分のメールを変えると次の magiclink が届かない相手になる＝入場不能。route 層の staff/update-email は柵 A だが auth.updateUser 直叩きは Supabase 側の設定で止める。 |
| ② | サインアップ無効（Allow new users to sign up＝off） | デモ訪問者が別アカウントを作って本番 org を作る経路を閉じる（NOX は招待制）。 |
| ③ | magiclink／OTP の有効期限を短く（既定 1h → 5〜10 分） | 入場 route はサーバ内で即 verifyOtp するため長い期限は不要。 |
| ④ | パスワード変更（updateUser password）の扱い | 共通パスワードを置かないなら影響なし。置くなら「変更不可」を Supabase の設定で担保できないため（updateUser はユーザー自身に許される）、置かない選択の根拠。 |

## 5. 入場ログ（裁定293-7）

magiclink の生成は email を使うが送信しない＝保持するのは auth.users の email（合成）だけ。入場ログ（org／role／時刻／IP ハッシュ）を 30 日で消す器＝reset_design §4 ★6（0162 に同乗か別 mig）。

## 6. まとめ（相談役への確認点）

- ① 05:00 JST は cutoff 06:00 の前（営業日切替「後」なら 06:05 JST）＝reset_design §2。
- ② 共通パスワードは置かない（magiclink 入場のみ）を推奨。置くなら Auth 設定 4 点の後。
- ③ 役割は 4（owner／manager／staff／cast）＝入場 route に staff を追加。
- ④ cast は代表伝票の受領者 6 名に結線（/mine で自分の伝票別バックが見える）。
- ⑤ kiosk 端末ユーザー 6 を create-demo-orgs に追加（録画の kiosk_devices と結線）。
