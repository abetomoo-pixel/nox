// castログイン招待/PW再発行（staff/create route を正本に同型・mig0041 cast_invite と対）。
// invite（未結線 cast へアカウント発行）:
//   ① guardCastInvite（認証 401→入力 400→権限 403・org サーバ導出・対象 cast org/store 照合）
//   ② 既存 email 先引き（二重 auth 作成防止）: 実 email が同 org に既存→auth 生成せず
//      既存 auth_user_id で cast_invite（結線のみ・RPC の既存 user 分岐・パスワード発行なし）
//   ③ ログイン ID 決定: 実 email あればそれ / なければ合成 email 自動生成
//      ★合成の8桁は idemKey 先頭から導出＝同一 idemKey の再送で同一 email になり、先引き（初回成功後）
//        が 409 で止める＝二重 POST で二重作成させない（staff/create と同じ route 層担保）。
//   ④ 初期パスワード: サーバ自動生成 16文字（リクエストに平文を乗せない）・レスポンスで一度だけ返す
//   ⑤ admin.createUser（email_confirm:true・seed と同一プリミティブ）
//      合成 email 重複は新ランダムで最大3回リトライ・実 email 重複は 409
//   ⑥ cast_invite RPC を呼び出しユーザーのセッションで実行（権限検証が RPC 内で完結・二重防御）
//   ⑦ ★補償: RPC 失敗時は deleteUser で auth user を巻き戻す。補償失敗は孤児残存をログに残して握り潰さない。
// reset（結線済み cast の PW 再発行）:
//   同一ガード（owner/manager 自店）。updateUserById で新 PW を設定し一度だけ返す。
//   auth 層のみの操作（DB 書込なし＝audit_log_write は内部専用で route から呼べない・Supabase auth ログに残る）。
import { NextResponse } from "next/server";
import { randomInt, randomUUID } from "node:crypto";
import { guardCastInvite } from "@/lib/nox/cast/route-guard";

// 紛らわしい文字（0/O・1/l/I）を除いた英数＋記号・randomInt は CSPRNG（staff/create と同一）
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
function genPassword(len = 16): string {
  let out = "";
  for (let i = 0; i < len; i++) out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  return out;
}

// 合成 email: c-<8桁>@o-<org先頭8桁>.nox.local（cast 用 c- プレフィクス・送信不能予約ドメイン）。
// 8桁は既定で idemKey 先頭（再送で同一 email＝リプレイ検知）。リトライ時は salt に新 uuid を渡す。
function syntheticEmail(orgId: string, seed: string): string {
  return `c-${seed.replace(/-/g, "").slice(0, 8).toLowerCase()}@o-${orgId.replace(/-/g, "").slice(0, 8)}.nox.local`;
}

export async function POST(req: Request) {
  const g = await guardCastInvite(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  const { cast, input } = g;

  try {
    // ── reset 分岐: 結線済み cast の PW 再発行（auth 層のみ・一度返し） ──
    if (input.action === "reset") {
      if (!cast.userId) return NextResponse.json({ error: "not linked" }, { status: 409 });
      const { data: u, error: eU } = await g.admin
        .from("users")
        .select("auth_user_id, email, is_active")
        .eq("id", cast.userId)
        .single();
      if (eU || !u) return NextResponse.json({ error: `lookup failed: ${eU?.message ?? "no user"}` }, { status: 500 });
      if (!u.is_active) return NextResponse.json({ error: "inactive user" }, { status: 409 });
      const password = genPassword();
      const { error: eUpd } = await g.admin.auth.admin.updateUserById(u.auth_user_id as string, { password });
      if (eUpd) return NextResponse.json({ error: `password reset failed: ${eUpd.message}` }, { status: 500 });
      // initial_password はこのレスポンス一度だけ（DB に平文は残らない）
      return NextResponse.json({ login_email: u.email, initial_password: password });
    }

    // ── invite 分岐（未結線 cast のみ・RPC でも 'already linked' で二重に守る） ──
    if (cast.userId) return NextResponse.json({ error: "already linked" }, { status: 409 });

    // ② 既存 email 先引き（実 email）／リプレイ検知（合成 email＝idemKey 由来）
    let loginEmail = input.email ?? syntheticEmail(g.orgId, input.idemKey!);
    const { data: existRows, error: eLook } = await g.admin
      .from("users")
      .select("id, auth_user_id")
      .eq("org_id", g.orgId)
      .eq("email", loginEmail) // route 側は lower 正規化済み・RPC 側は lower 比較で二重に守る
      .limit(1);
    if (eLook) return NextResponse.json({ error: `lookup failed: ${eLook.message}` }, { status: 500 });
    const existing = existRows?.[0] as { id: string; auth_user_id: string } | undefined;

    let authUserId: string;
    let initialPassword: string | null = null;
    let createdAuth = false;

    if (existing) {
      if (!input.email) {
        // 合成 email が既存＝同一 idemKey の再送（初回成功後のリプレイ）。二重作成させない。
        return NextResponse.json({ error: "already processed (idemKey replay)" }, { status: 409 });
      }
      // 既存 user への結線（元 cast の出戻り等）: auth 生成しない・パスワード発行なし（既存の認証情報のまま）
      authUserId = existing.auth_user_id;
    } else {
      // ⑤ 新規 auth 生成（email_confirm:true＝SMTP 不要）
      const password = genPassword();
      let created: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: cu, error: eCu } = await g.admin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
        });
        if (!eCu && cu?.user) {
          created = cu.user.id;
          break;
        }
        const dup = /already|registered|exists/i.test(eCu?.message ?? "");
        if (!dup) return NextResponse.json({ error: `auth create failed: ${eCu?.message}` }, { status: 500 });
        if (input.email) {
          // 実 email の auth 重複（他 org で使用中等）＝リトライ不能・明示 409
          return NextResponse.json({ error: "email already registered (auth)" }, { status: 409 });
        }
        // 合成 email の重複＝過去の補償失敗孤児 or 稀な衝突 → 新ランダムで再導出
        loginEmail = syntheticEmail(g.orgId, randomUUID());
      }
      if (!created) return NextResponse.json({ error: "auth create failed after retries" }, { status: 500 });
      authUserId = created;
      initialPassword = password;
      createdAuth = true;
    }

    // ⑥ cast_invite RPC（呼び出しユーザーのセッション＝権限検証は RPC 内で完結・二重防御）
    const { data: membershipId, error: eRpc } = await g.supabase.rpc("cast_invite", {
      p_auth_user_id: authUserId,
      p_email: loginEmail,
      p_cast_id: cast.id,
    });
    if (eRpc) {
      // ⑦ 補償: 今回作った auth user を巻き戻す（既存 user 結線のときは触らない）
      if (createdAuth) {
        const { error: eDel } = await g.admin.auth.admin.deleteUser(authUserId);
        if (eDel) {
          // 孤児 auth user が残存＝運用で手動掃除が要る。握り潰さない（staff/create と同じ）。
          console.error(
            `[cast/invite] 補償失敗: auth user 孤児が残存 auth_user_id=${authUserId} email=${loginEmail} 削除エラー=${eDel.message}`,
          );
        }
      }
      const m = eRpc.message;
      const status = m.includes("forbidden")
        ? 403
        : m.includes("already linked") || m.includes("already a cast") || m.includes("already active elsewhere") || m.includes("inactive user")
          ? 409
          : m.includes("not found") || m.includes("bad") || m.includes("inactive cast")
            ? 400
            : 500;
      return NextResponse.json({ error: m }, { status });
    }

    // initial_password はこのレスポンス一度だけ（DB に平文は残らない・auth 側でハッシュ管理）
    return NextResponse.json({
      membership_id: membershipId,
      login_email: loginEmail,
      initial_password: initialPassword,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
