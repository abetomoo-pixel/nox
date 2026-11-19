// ★0201e（裁定481・2026-11-12）: キャストの締めの許可（memberships.cast_can_close・既定 OFF）＝スタッフ管理のスイッチの行。純関数（DB を知らない）。
//   書く RPC＝set_cast_close(p_membership_id, p_on)（オーナーと自店の店長・キャストの行だけ・監査）。p_on は常に明示の boolean（規約 7）。
export const CAST_CLOSE_RPC = "set_cast_close";
export const CAST_CLOSE_TITLE = "キャストの締めの許可";
export const CAST_CLOSE_DESC = "許可したキャストは、レジを使える状態で出勤しているあいだ、その日の日報を締められます。許可しないキャストは締められません（はじめはどのキャストも許可していません）。";

export type CastCloseCast = { id: string; name: string; user_id: string | null; store_id: string };
export type CastCloseMem = { id: string; user_id: string; store_id: string; can_register: boolean | null; cast_can_close: boolean | null };
export type CastCloseRow = { castId: string; name: string; storeId: string; membershipId: string | null; canRegister: boolean; canClose: boolean };

/** 在籍キャスト×キャストの membership（同じ店・同じ user）を行に。membership の無い人（未招待）は membershipId null */
export function castCloseRowsOf(casts: readonly CastCloseCast[], mems: readonly CastCloseMem[]): CastCloseRow[] {
  const key = (u: string, s: string) => `${u}|${s}`;
  const byUser = new Map(mems.map((m) => [key(m.user_id, m.store_id), m]));
  return casts.map((c) => {
    const m = c.user_id ? byUser.get(key(c.user_id, c.store_id)) ?? null : null;
    return { castId: c.id, name: c.name, storeId: c.store_id, membershipId: m?.id ?? null, canRegister: m?.can_register === true, canClose: m?.cast_can_close === true };
  });
}

/** set_cast_close の引数（明示の boolean） */
export function castCloseArgsOf(membershipId: string, on: boolean): { p_membership_id: string; p_on: boolean } {
  return { p_membership_id: membershipId, p_on: on === true };
}

// ★2026-11-19 夕（相談役 ③・画面だけ）: 締めの許可は「レジの許可」がある人にだけ付けられる。権限の判定（auth_register_access・castRegisterEntryOf・RLS・RPC）は変えない。
//   すでに締めの許可だけを持つ人は、外す向き（ON → OFF）だけ押せる。
export const CAST_CLOSE_NEEDS_REGISTER = "レジの許可がある人だけ付けられます（キャスト会計の許可で設定）";
/** キャスト会計の許可の画面で、レジの許可を外す前に出す 1 行 */
export const CAST_REGISTER_OFF_CLEARS_CLOSE = "レジの許可を外すと、締めの許可も外れます。";

/** 締めのスイッチを押せるか（付けるのはレジの許可がある人だけ・外すのはいつでも） */
export function castCloseTogglableOf(r: { canRegister: boolean; canClose: boolean }): boolean {
  return r.canClose || r.canRegister;
}

/** レジの許可を外すとき、先に締めの許可を外すか（外す向き∧締めの許可がある） */
export function castRegisterOffClearsCloseOf(r: { canClose?: boolean }, nextCanRegister: boolean): boolean {
  return nextCanRegister === false && r.canClose === true;
}
