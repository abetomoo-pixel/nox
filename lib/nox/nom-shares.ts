/* ★裁定110 A2: 指名の分配率（％）の UI 純関数群。register-board / kiosk-register が共用。
 *   名簿＝キーの存在（weight 0 も名簿の一員＝按分なし）。丸めは normalizeShares と同じ作法＝
 *   floor＋端数を先頭（配列順＝position/追加順）から +1（新しい丸め規則を作らない）。
 *   金額計算には非関与（権威は check_set_nominations→cast_sales_aggregate/check_close 側）。
 */

/** (1) 既定分配＝本指名がいれば本で 100% を等分（他 0）→ 本が無ければ場内 → それも無ければフリーで等分。 */
export function defaultWeights(memberIds: string[], kinds: Record<string, string>): Record<string, number> {
  const kindOf = (id: string) => kinds[id] ?? "free";
  const group = (["hon", "jonai", "free"] as const)
    .map((k) => memberIds.filter((id) => kindOf(id) === k))
    .find((g) => g.length > 0) ?? [];
  const out: Record<string, number> = {};
  memberIds.forEach((id) => { out[id] = 0; });
  const n = group.length;
  if (n > 0) {
    const base = Math.floor(100 / n), rem = 100 - base * n;
    group.forEach((id, i) => { out[id] = base + (i < rem ? 1 : 0); });
  }
  return out;
}

/** (2) 自動補完＝編集行の値（0〜100 clamp）を確定し、残り（100−v）を「0 でない他行」へ現在比で配る。
 *  他が全 0 なら編集行を 100 に固定＝常に Σ=100。 */
export function redistribute(prev: Record<string, number>, editedId: string, v: number): Record<string, number> {
  const val = Math.max(0, Math.min(100, Math.round(v || 0)));
  const others = Object.keys(prev).filter((id) => id !== editedId);
  const pool = others.filter((id) => (prev[id] ?? 0) > 0);
  const out: Record<string, number> = { ...prev, [editedId]: val };
  if (pool.length === 0) { out[editedId] = 100; return out; }
  others.forEach((id) => { if (!pool.includes(id)) out[id] = 0; });
  const target = 100 - val;
  const sumPool = pool.reduce((a, id) => a + prev[id], 0);
  let rem = target;
  const floors = pool.map((id) => { const f = Math.floor((prev[id] * target) / sumPool); rem -= f; return [id, f] as [string, number]; });
  for (const [id, f] of floors) { out[id] = f + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  return out;
}

/** 0 行を温存したまま >0 群だけを Σ=100 へ正規化（読込・除外後の整形）。>0 群が空なら呼び出し側で defaultWeights へ。 */
export function renormalizeKeepZeros(prev: Record<string, number>): Record<string, number> {
  const ids = Object.keys(prev);
  const pool = ids.filter((id) => (prev[id] ?? 0) > 0);
  if (pool.length === 0) return { ...prev };
  const sum = pool.reduce((a, id) => a + prev[id], 0);
  const out: Record<string, number> = {};
  ids.forEach((id) => { out[id] = 0; });
  let rem = 100;
  const floors = pool.map((id) => { const f = Math.floor((prev[id] * 100) / sum); rem -= f; return [id, f] as [string, number]; });
  for (const [id, f] of floors) { out[id] = f + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
  return out;
}

/* ★裁定462（M-121・2026-11-09）: 「指名の分配率」の ✕＝着卓中でも押せる（確認 1 回で離卓＋分配からの除外）。不可は締め済みの伝票だけ。
 *   外したあと合計が 100% でなければ残りで均等に分配（floor＋端数を先頭から +1＝丸め作法は不変）。 */
export const NOM_X_CLOSED_REASON = "締め済みの伝票は変更できません";
export const NOM_X_DAY_CLOSED_REASON = "締め済みの営業日は変更できません";
/** 均等分配（n 人で 100）＝floor＋端数を先頭から +1。空なら {} */
export function equalSplitOf(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const n = ids.length; if (n === 0) return out;
  const base = Math.floor(100 / n), rem = 100 - base * n;
  ids.forEach((id, i) => { out[id] = base + (i < rem ? 1 : 0); });
  return out;
}
/** 除外後の重み＝removedId を落とし、残り（remainingIds＝分配の対象）の合計が 100 でなければ均等に。100 なら現在値のまま。 */
export function weightsAfterRemovalOf(weights: Readonly<Record<string, number>>, removedId: string, remainingIds: readonly string[]): Record<string, number> {
  const rest = remainingIds.filter((id) => id !== removedId);
  const sum = rest.reduce((a, id) => a + (weights[id] ?? 0), 0);
  if (rest.length > 0 && sum === 100) { const out: Record<string, number> = {}; rest.forEach((id) => { out[id] = weights[id] ?? 0; }); return out; }
  return equalSplitOf(rest);
}
/** 確認文（1 回）＝離卓＋分配からの除外（誤着卓の訂正）。指名料／同伴料の行があれば取消も添える。他卓に着卓中ならその卓名も */
export function removeShareConfirmTextOf(name: string, hasFee: boolean, otherSeat: string | null | undefined): string {
  return `${name} を離卓し、分配から外します（誤着卓の訂正）。${hasFee ? "付いている指名料／同伴料の明細行も取り消します。" : ""}${otherSeat ? `${otherSeat} の着卓はそのままです。` : ""}よろしいですか？`;
}
