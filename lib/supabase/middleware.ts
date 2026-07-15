import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // 保護パス: ログイン必須（/login と公開トップは除外）。
  // middleware は「認証のみ」判定（ロール判定は各エリアの layout ＋ DB 物理保証の2層＝F1f plan §2）。
  const path = request.nextUrl.pathname;
  const PROTECTED = ["/mine", "/register", "/shift", "/report", "/master"];
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
