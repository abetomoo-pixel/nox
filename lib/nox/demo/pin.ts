// ★夜便レーン 1（2026-11-11・相談役）: デモの人ごとの PIN（全員 1234 をやめる＝0201g の重複の拒否・推測されやすい PIN の拒否と衝突させない）。
//   PIN＝表示名（キャストの源氏名・スタッフの登録名＝本番はデモの id を org ごとに付け替えるため名前で揃える）から決まる 4 桁（FNV-1a）。推測されやすい番号（同じ数字・連番・1234 など）は避けて次の番号へ。
//   店の中の重複は生成器（scripts/demo/gen-demo.mjs）が検査して止める。デモのキオスクは名前の下にこの PIN を出す（デモ org だけ＝本番の店には出ない）。
//   ハッシュは scripts/demo/demo-pin-hashes.json（本番 DB の crypt を固定の salt で読み取りだけで呼んで作る＝scripts/demo/gen-demo-pin-hashes.mjs）。

const fnv1a = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

/** 推測されやすい 4 桁（同じ数字・上り下りの連番・よく使われる並び） */
export function guessablePinOf(pin: string): boolean {
  if (!/^[0-9]{4,6}$/.test(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10), down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (up || down) return true;
  if (["1212", "2121", "1122", "6969", "1004", "2000", "2001", "2020", "1010", "0101", "1313", "4545", "7777"].includes(pin)) return true;
  if (/^(\d\d)\1$/.test(pin)) return true; // 2 桁の繰り返し（1212・4545 など）
  return false;
}

/** 表示名 → デモの PIN（4 桁・推測されやすい番号は避ける） */
export function demoPinOf(id: string): string {
  let n = fnv1a(id) % 10000;
  for (let i = 0; i < 10000; i++) { const p = String(n).padStart(4, "0"); if (!guessablePinOf(p)) return p; n = (n + 1) % 10000; }
  return "5937";
}
