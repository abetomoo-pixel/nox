import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_UNTIL_COOKIE, demoSessionExpired, isDemoAuthUserId, isDemoSessionExemptPath } from "@/lib/nox/demo/session";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// リクエストごとに Supabase セッションを更新し、Cookie を載せ直す。
// 認証が必要なパスは未ログインなら /login へ。
export async function updateSession(request: NextRequest) {
  // 現在パスを server component（(manage) layout の cast ゲート）へ渡す（Next は layout に pathname を渡さない）。
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() でセッションを検証・更新（getClaims 等の前に必須）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // ★D2-b（裁定328 追補4・2026-10-08）: デモユーザー（env DEMO_USERS の auth user id）は入場 route が置いた cookie nox_demo_until（入場＋24h）が
  //   期限切れ／欠落なら signOut して /demo?expired=1 へ（Free は refresh token が無期限＝Auth 設定だけでは 24h で切れない）。
  //   本番ユーザーは DEMO_USERS に無い＝isDemoAuthUserId が false でここを通らない（env が無い環境でも同じ）。入口 /demo と /api/demo/* は除外（入場の直後に自分を追い出さない）。
  if (user && !isDemoSessionExemptPath(path) && isDemoAuthUserId(process.env.DEMO_USERS, user.id) && demoSessionExpired(request.cookies.get(DEMO_UNTIL_COOKIE)?.value, Date.now())) {
    await supabase.auth.signOut(); // sb-* cookie の破棄は setAll 経由で response に載る
    const url = request.nextUrl.clone();
    url.pathname = "/demo";
    url.search = "?expired=1";
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.cookies.set(DEMO_UNTIL_COOKIE, "", { path: "/", maxAge: 0 });
    return redirect;
  }

  // 保護パス: ログイン必須（/login と公開トップは除外）。
  // middleware は「認証のみ」判定（ロール判定は各エリアの layout ＋ DB 物理保証の2層＝F1f plan §2）。
  const PROTECTED = ["/mine", "/register", "/shift", "/report", "/master", "/dashboard"];
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
