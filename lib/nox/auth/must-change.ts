// ★0211 の便（相談役 11/25 D1）: 初期パスワードで入った人に、最初のログインでパスワードの変更を求める（純関数・DB を知らない）。
//   印＝Auth の app_metadata.must_change_password（本人は書き換えられない・付け外しはパスワードを設定する admin の呼び出しと同じ 1 回）。
//   付ける所＝初期パスワードを作る・出し直す時だけ（スタッフの登録・キャストの登録とパスワードの再発行・店がメール無しのスタッフの初期パスワードを出し直す時）。
//   今いる人には付けない（印の無い人は何も変わらない）。止める所＝middleware（画面の道だけ・API と認証の道と公開面は止めない）。
export const MUST_CHANGE_PATH = "/auth/change-password";
export const MUST_CHANGE_META = { must_change_password: true } as const;
export const MUST_CHANGE_CLEAR = { must_change_password: false } as const;

/** 印が付いているか（app_metadata の true だけ・無い／false／他の型は付いていない） */
export const mustChangePasswordOf = (user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean => user?.app_metadata?.must_change_password === true;

/** 止めない道（API・認証・ログイン・デモの入口・公開面・端末・運営） */
const EXEMPT = ["/api", "/auth", "/login", "/logout", "/demo", "/i/", "/r/", "/liff", "/legal", "/privacy", "/terms", "/lp", "/kiosk", "/ops", "/_next", "/favicon", "/icons", "/brand", "/manifest", "/sw", "/robots", "/sitemap"];
export const mustChangeExemptPathOf = (path: string): boolean => EXEMPT.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/") || path.startsWith(p + ".")));

/** middleware の行き先（null＝止めない）。next は同じサイトのパスだけ */
export function mustChangeRedirectOf(user: { app_metadata?: Record<string, unknown> | null } | null | undefined, path: string, search: string): string | null {
  if (!mustChangePasswordOf(user) || mustChangeExemptPathOf(path) || path === "/") return null;
  const next = `${path}${search ?? ""}`;
  return `${MUST_CHANGE_PATH}?next=${encodeURIComponent(next)}`;
}

/** 変えた後に戻る先（同じサイトの画面のパスだけ・それ以外は /dashboard） */
export function mustChangeNextOf(next: string | null | undefined): string {
  const v = String(next ?? "");
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /^\/(api|auth)(\/|$)/.test(v)) return "/dashboard";
  return v;
}

/** 新しいパスワードの確かめ（8〜72 字・2 回同じ・今のパスワードと違う） */
export function newPasswordErrOf(current: string, next: string, next2: string): string | null {
  if (!current) return "今のパスワードを入れてください";
  if (next.length < 8) return "新しいパスワードは 8 文字以上にしてください";
  if (next.length > 72) return "新しいパスワードは 72 文字までです";
  if (next !== next2) return "新しいパスワードが 2 回で違います";
  if (next === current) return "今のパスワードと違うものにしてください";
  return null;
}
