// ★0190（裁定436 ①b・便 K-5 client・2026-10-30）: 端末のフィンガープリント＝端末アカウントを「初回ログインした端末」に固定するための識別子。
//   ブラウザの指紋採取はしない（可変・偽装可・プライバシー）。localStorage に 1 回だけ作る乱数 ID（32 桁 hex）を端末の印とし、
//   端末ログインの直後に kiosk_device_bind(fp, ua) へ送る＝未束縛なら束縛・同じ fp なら last_seen・別の fp は 'device bound'（RPC が拒否）。
//   localStorage を消すと別端末扱い＝オーナーがマスタ › システムで「固定を解除」してから再ログイン（運用注記）。
//   RPC の受理範囲＝8〜128 文字（kiosk_device_bind の 'bad device_fp'）。
export const DEVICE_FP_KEY = "nox_device_fp";
export const DEVICE_FP_LEN = 32;

/** 端末の印を返す（無ければ作って保存）。localStorage が使えない環境（プライベートモード等）は毎回新しい値＝束縛は効かず 'device bound' になり得る→ null を返して呼び手が注記を出す */
export function deviceFpOf(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined, rand: () => string = randomHex32): string | null {
  if (!storage) return null;
  try {
    const cur = storage.getItem(DEVICE_FP_KEY);
    if (cur && isValidDeviceFp(cur)) return cur;
    const v = rand();
    storage.setItem(DEVICE_FP_KEY, v);
    return v;
  } catch {
    return null;
  }
}

/** RPC が受け付ける形か（8〜128 文字・空白なし） */
export function isValidDeviceFp(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length >= 8 && v.length <= 128 && !/\s/.test(v);
}

function randomHex32(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) {
    const a = new Uint8Array(DEVICE_FP_LEN / 2);
    g.crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let s = "";
  while (s.length < DEVICE_FP_LEN) s += Math.floor(Math.random() * 16).toString(16);
  return s.slice(0, DEVICE_FP_LEN);
}

/** ブラウザで使う既定（localStorage） */
export function browserDeviceFp(): string | null {
  if (typeof window === "undefined") return null;
  return deviceFpOf(window.localStorage);
}

/** kiosk_device_bind の結果→画面の分岐 */
export type BindResult = { ok: true; bound: boolean; device_id: string };
export function bindErrJa(msg: string | undefined): string {
  const m = msg ?? "";
  if (m.includes("device bound")) return "この端末アカウントは別の端末に固定されています。オーナーがマスタ › システム › 端末の「固定を解除」をしてから、もう一度ログインしてください";
  if (m.includes("bad device_fp")) return "端末の識別子を作れませんでした（ブラウザの保存領域が使えません）";
  if (m.includes("forbidden")) return "このアカウントは端末アカウントではないか、無効化されています";
  return `端末の確認に失敗しました（${m || "不明"}）`;
}

/** 打刻ゲートの拒否（assert_on_duty の 'off duty'）の文言＝レジ端末・本店・/mine で同じ */
export const OFF_DUTY_MSG = "出勤してからレジを開けます（店の端末で出勤の打刻をしてください）";
export const isOffDuty = (msg: string | null | undefined): boolean => !!msg && msg.includes("off duty");
