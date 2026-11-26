// ★相談役 11/26 夜便 N の N1-f（2026-11-26）: 時刻の選択（components/ui/time-input.tsx）の下の直接入力の読み取り（純関数・DB を知らない）。
//   受ける形＝「26:10」「9:30」（今まで）に加えて 4 桁「2610」→26:10・「0930」→09:30、3 桁「930」→09:30、全角の数字とコロン（２６１０・２６：１０）。
//   受ける範囲は今の「26:10」の形と同じ＝時は 0〜maxHour（欄ごと・当日だけの欄は 23）・分は 00〜59（刻みは問わない）。広げない。
//   2 桁以下（「26」「9」）は今のまま＝その時の 00 分として受ける（読み替えの是非は報告で提案）。
//   受けられない値は理由の文を返す（黙って捨てない・丸めない）。空は「何も書かない」。
// ★N1-e: 空の欄の小窓の初めの位置（開始の欄＝営業開始・終了の欄＝営業終了）も同じ所に置く（timeAnchorOf）。値は書かない＝見せるだけ。
const toAscii = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[：︰]/g, ":").trim(); // 前後の空白（全角も）だけ落とす＝今の normalizeHHMM と同じ（間の空白は形の違い）

export type TypedTime = { kind: "empty" } | { kind: "ok"; value: string; h: number; m: number } | { kind: "bad"; err: string };

export const TYPED_TIME_FORMAT_ERR = "時刻の形が違います（例 2610・26:10・930）";

/** 直接入力の文字 → 'HH:MM'（または空・理由の文）。maxHour＝その欄の時の上限（今の部品と同じ） */
export function typedTimeOf(raw: string | null | undefined, maxHour = 47): TypedTime {
  const s = toAscii(raw ?? "");
  if (s === "") return { kind: "empty" };
  let mt: RegExpMatchArray | null;
  let h: number, m: number;
  if ((mt = s.match(/^(\d{1,2}):(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); }   // 26:10／9:30
  else if ((mt = s.match(/^(\d{2})(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); } // 2610／0930
  else if ((mt = s.match(/^(\d)(\d{2})$/))) { h = Number(mt[1]); m = Number(mt[2]); }    // 930
  else if ((mt = s.match(/^(\d{1,2}):?$/))) { h = Number(mt[1]); m = 0; }                // 26／9（今のまま＝00 分）
  else return { kind: "bad", err: TYPED_TIME_FORMAT_ERR };
  if (h > maxHour) {
    return { kind: "bad", err: maxHour <= 23 ? "この欄は 23:59 までです（24 時以降は入れられません）" : `時は ${String(maxHour).padStart(2, "0")} 時（翌${String(maxHour - 24).padStart(2, "0")}時台）までです` };
  }
  if (m > 59) return { kind: "bad", err: "分は 00〜59 で入れてください" };
  return { kind: "ok", value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, h, m };
}

/**
 * 空の欄の小窓で真ん中に置く時刻（見せるだけ・値は書かない）。
 *   呼び出し側が startAt を渡していればそれ（その欄の事情を知っている）・渡していなければ開始の欄＝店の営業開始・終了の欄＝店の営業終了（無ければ営業開始）。
 */
export function timeAnchorOf(o: { edge: "start" | "end"; startAtProp?: string | null; closeAtProp?: string | null; shopOpen?: string | null; shopClose?: string | null }): string | null {
  if (o.edge === "end") return o.closeAtProp ?? o.startAtProp ?? o.shopClose ?? o.shopOpen ?? null;
  return o.startAtProp ?? o.shopOpen ?? null;
}

/** 開始か終了か（edge を渡していなければ: after を渡している欄・名前に「終了」「閉店」がある欄＝終了） */
export function timeEdgeOf(o: { edge?: "start" | "end"; hasAfter: boolean; ariaLabel?: string | null }): "start" | "end" {
  if (o.edge) return o.edge;
  if (o.hasAfter) return "end";
  return /終了|閉店/.test(o.ariaLabel ?? "") ? "end" : "start";
}

/**
 * 小窓の置き場（画面に固定＝カードの overflow に切られない）。r＝欄の箱（画面の座標）・w／h＝小窓の大きさ・vw／vh＝画面の大きさ。
 *   up＝上に開く（下に入らず上の方が広いとき＝今の規則）。左は画面の中に収める（8px の余白）。
 */
export function timePopPlaceOf(r: { left: number; top: number; bottom: number }, w: number, vw: number, vh: number, up: boolean): { left: number; top?: number; bottom?: number } {
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  return up ? { left, bottom: Math.max(8, vh - r.top + 4) } : { left, top: r.bottom + 4 };
}
