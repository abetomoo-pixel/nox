// スタッフ追加（F3a 束3-2 Q-2・案B 即時作成）: 仕様書 §2/§4 の順序を厳守。
//   ① guardStaffCreate（認証 401→入力 400→権限 403・org サーバ導出・store org 照合）
//   ② 既存 email 先引き（§4-B・二重 auth 作成防止）: 実 email が同 org に既存→auth 生成せず
//      既存 auth_user_id で staff_create（membership 追加のみ・RPC の既存 user 分岐）
//   ③ ログイン ID 決定: 実 email あればそれ / なければ合成 email 自動生成
//      ★合成の8桁は idemKey 先頭から導出＝同一 idemKey の再送で同一 email になり、先引き（初回成功後）
//        が 409 で止める＝二重 POST で二重作成させない（staff_create に p_idem_key は無いため route 層で担保）。
//        orgs に slug 列は無い（live 確認）ため org 識別子は org_id 先頭 8 hex（o-xxxxxxxx）。
//   ④ 初期パスワード: サーバ自動生成 16文字（論点2(あ)・リクエストに平文を乗せない）・レスポンスで一度だけ返す
//   ⑤ admin.createUser（email_confirm:true・seed と同一プリミティブ）
//      合成 email 重複（過去の補償失敗孤児 or 稀な衝突）は新ランダムで最大3回リトライ（§4-C）・実 email 重複は 409
//   ⑥ staff_create RPC を呼び出しユーザーのセッションで実行（auth_org_id/role が効き権限検証が RPC 内で完結）
//   ⑦ ★補償（§4-A）: RPC 失敗時は deleteUser で auth user を巻き戻す。補償自体の失敗は孤児残存を
//      ログに残して握り潰さない（audit_log_write は内部専用＝route から呼べないため console.error）。
import { NextResponse } from "next/server";
import { randomInt, randomUUID } from "node:crypto";
import { guardStaffCreate } from "@/lib/nox/staff/route-guard";

// 紛らわしい文字（0/O・1/l/I）を除いた英数＋記号・randomInt は CSPRNG
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+";
function genPassword(len = 16): string {
  let out = "";
  for (let i = 0; i < len; i++) out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  return out;
}

// 合成 email: s-<8桁>@o-<org先頭8桁>.nox.local（送信不能予約ドメイン・論点1）。
// 8桁は既定で idemKey 先頭（再送で同一 email＝リプレイ検知）。リトライ時は salt に新 uuid を渡す。
function syntheticEmail(orgId: string, seed: string): string {
  return `s-${seed.replace(/-/g, "").slice(0, 8).toLowerCase()}@o-${orgId.replace(/-/g, "").slice(0, 8)}.nox.local`;
}

export async function POST(req: Request) {
  const g = await guardStaffCreate(req);
  if (!g.ok) return NextResponse.json(g.body, { status: g.status });
  const { name, email, storeId, role, idemKey } = g.input;

  try {
    // ── ② 既存 email 先引き（実 email）／リプレイ検知（合成 email＝idemKey 由来） ──
    let loginEmail = email ?? syntheticEmail(g.orgId, idemKey);
    const { data: existRows, error: eLook } = await g.admin
      .from("users")
      .select("id, auth_user_id")
      .eq("org_id", g.orgId)
      .eq("email", loginEmail) // route 側は lower 正規化済み・保存済み行は全小文字（live 実測0件のゆれ）。RPC 側は lower 比較で二重に守る
      .limit(1);
    if (eLook) return NextResponse.json({ error: `lookup failed: ${eLook.message}` }, { status: 500 });
    const existing = existRows?.[0] as { id: string; auth_user_id: string } | undefined;

    let authUserId: string;
    let initialPassword: string | null = null;
    let createdAuth = false;

    if (existing) {
      if (!email) {
        // 合成 email が既存＝同一 idemKey の再送（初回成功後のリプレイ）。二重作成させない。
        return NextResponse.json({ error: "already processed (idemKey replay)" }, { status: 409 });
      }
      // 既存スタッフの再配属/追加（§3-C）: auth 生成しない・パスワード発行なし（既存の認証情報のまま）
      authUserId = existing.auth_user_id;
    } else {
      // ── ⑤ 新規 auth 生成（案B・email_confirm:true＝SMTP 不要） ──
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
        if (email) {
          // 実 email の auth 重複（他 org で使用中等）＝リトライ不能・明示 409
          return NextResponse.json({ error: "email already registered (auth)" }, { status: 409 });
        }
        // 合成 email の重複＝過去の補償失敗孤児 or 稀な衝突 → 新ランダムで再導出（§4-C）
        loginEmail = syntheticEmail(g.orgId, randomUUID());
      }
      if (!created) return NextResponse.json({ error: "auth create failed after retries" }, { status: 500 });
      authUserId = created;
      initialPassword = password;
      createdAuth = true;
    }

    // ── ⑥ staff_create RPC（呼び出しユーザーのセッション＝権限検証は RPC 内で完結・二重防御） ──
    const { data: membershipId, error: eRpc } = await g.supabase.rpc("staff_create", {
      p_auth_user_id: authUserId,
      p_email: loginEmail,
      p_name: name,
      p_store_id: storeId,
      p_role: role,
    });
    if (eRpc) {
      // ── ⑦ 補償: 今回作った auth user を巻き戻す（既存 user 追加のときは触らない） ──
      if (createdAuth) {
        const { error: eDel } = await g.admin.auth.admin.deleteUser(authUserId);
        if (eDel) {
          // 孤児 auth user が残存＝運用で手動掃除が要る。握り潰さない（§4-A）。
          console.error(
            `[staff/create] 補償失敗: auth user 孤児が残存 auth_user_id=${authUserId} email=${loginEmail} 削除エラー=${eDel.message}`,
          );
        }
      }
      const m = eRpc.message;
      const status = m.includes("forbidden")
        ? 403
        : m.includes("already member") || m.includes("already active elsewhere") || m.includes("inactive user")
          ? 409
          : m.includes("not found") || m.includes("bad") || m.includes("invalid")
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
