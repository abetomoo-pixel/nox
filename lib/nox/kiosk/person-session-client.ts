// ★便 E（2026-11-05・0196 用＝裁定448 B 方式）: 「スタッフでログイン（PIN）」のブラウザ側。
//   入る＝端末のセッション（access／refresh）を localStorage に控える（M-49 と同じ鍵）→ POST /api/kiosk/person-session（route が本人の auth セッションを cookie に載せ替える）→ 印を置いて dest へ。
//   戻る＝POST /api/kiosk/person-end（本人の終了＝server のサインアウト＋cookie 破棄）→ 控えた端末のセッションを復元して /kiosk（M-49 の leaveKioskPersonLogin をそのまま使う）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIOSK_DEVICE_SESSION, KIOSK_PERSON_MARK } from "./person-login";
import { leaveKioskPersonLogin } from "./person-login-client";
import { browserDeviceFp } from "./device-fp";
import { kioskPersonErrJa } from "./person-session";

const write = (k: string, v: string | null): void => { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* noop */ } };

export type PersonSessionResult = { ok: true; dest: string; role: string; name: string | null; idleMinutes: number } | { ok: false; error: string };

/** PIN の解除（kiosk_unlock）の後に呼ぶ＝本人の auth セッションへ切り替えて dest を返す（遷移は呼び出し側） */
export async function startKioskPersonSession(supabase: SupabaseClient): Promise<PersonSessionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) write(KIOSK_DEVICE_SESSION, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
  const res = await fetch("/api/kiosk/person-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_fp: browserDeviceFp() }) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; dest?: string; role?: string; name?: string | null; idle_minutes?: number; error?: string };
  if (!res.ok || !j.ok) { write(KIOSK_DEVICE_SESSION, null); return { ok: false, error: kioskPersonErrJa(j.error ?? String(res.status)) }; }
  write(KIOSK_PERSON_MARK, JSON.stringify({ at: new Date().toISOString(), pin: true }));
  return { ok: true, dest: j.dest ?? "/register", role: j.role ?? "staff", name: j.name ?? null, idleMinutes: j.idle_minutes ?? 10 };
}

/** 本体画面（本人）→ 本人の終了（route）→ 端末のセッションを復元して /kiosk */
export async function endKioskPersonSession(supabase: SupabaseClient, reason: "idle" | "manual" | "lock" = "manual"): Promise<void> {
  await fetch("/api/kiosk/person-end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => undefined);
  await leaveKioskPersonLogin(supabase);
}
