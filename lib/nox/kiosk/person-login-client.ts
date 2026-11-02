// ★便 M5 M-49（2026-10-30）: 「本人でログイン」のブラウザ側＝端末のセッションを localStorage に控えて local サインアウト→/login?kiosk=1、
//   戻るとき（無操作 N 分・ボタン・店長未満）＝local サインアウト→控えた端末のセッションを setSession で復元→/kiosk。
//   端末のセッション（refresh_token）は回転していない限り有効＝復元で端末のパスワードを打ち直さない。失敗したら /login（端末でログインし直す）。
//   判定は person-login.ts（純関数）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIOSK_DEVICE_SESSION, KIOSK_PERSON_MARK } from "./person-login";

type Saved = { access_token: string; refresh_token: string };
const read = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null): void => { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* noop */ } };

/** 本人ログイン中の印があるか（本体画面の guard） */
export const kioskPersonActive = (): boolean => !!read(KIOSK_PERSON_MARK);

/** キオスク（端末のセッション）→ /login?kiosk=1 */
export async function startKioskPersonLogin(supabase: SupabaseClient): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) write(KIOSK_DEVICE_SESSION, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token } satisfies Saved));
  write(KIOSK_PERSON_MARK, JSON.stringify({ at: new Date().toISOString() }));
  await supabase.auth.signOut({ scope: "local" });
  window.location.assign("/login?kiosk=1");
}

/** 本体画面（本人）→ 端末のセッションを復元して /kiosk。復元できなければ /login */
export async function leaveKioskPersonLogin(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  write(KIOSK_PERSON_MARK, null);
  const raw = read(KIOSK_DEVICE_SESSION);
  write(KIOSK_DEVICE_SESSION, null);
  let ok = false;
  if (raw) {
    try { const s = JSON.parse(raw) as Saved; const { error } = await supabase.auth.setSession(s); ok = !error; } catch { ok = false; }
  }
  window.location.assign(ok ? "/kiosk" : "/login");
}
