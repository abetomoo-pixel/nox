// ★裁定515-3（2026-11-27 09:50 Agoora）: 料金適用ルールの赤い警告に「狭い条件の行を上へ動かす」ボタン（DB を知らない純関数）。
//   延長の行の選び方（上から最初の一致）は今のまま・並べ替えは今ある pricing_rule_reorder（0216 の柵ごと・関数は変えない）。
//   帯（席種・曜日・時間帯・区分が同じ行の束）の表示の並びで、上の帯 a の条件が下の帯 b の条件をすべて覆い、
//   同じ種類（セット・延長・同伴・VIP チャージ）の有効な行を a が持つなら、b のその種類の行はどの場面でも当たらない（a が先に当たる）。
//   ボタンは b を「b を覆う一番上の帯」のすぐ上へ動かす（その上の帯は b を覆わない＝動かした後は b が当たる）。
//   狭い帯が上・広い帯が下の重なりは「狭い条件ほど上に」のとおり＝警告に出さない。どちらも覆わない一部の重なりは今の警告のまま。
//   時間帯の比べ方は pricing-board の重複の検出と同じ（0083 の非対称の +1440・to=0 は 24:00）。
//   ★既定の延長の印（コーディネーター 11/27 の直し）：pricing_resolve_core（0173:158-162）の並びは
//     「(fee_kind='extension' and is_default_ext) desc → priority → 区分一致 → created_at → id」＝延長は既定の印が並びより先に効く。
//     有効な既定の延長の行を持つ帯 d が下の帯 b の条件をすべて覆う（b の延長の行は既定でない）なら、b の延長は並びを変えても使われない。
//     このときは延長を「並べ替えで直る種類」から外す（ボタンを出さない＝警告だけ消えて開卓の額が変わらない食い違いを隠さない）・赤い警告は defaultBlocks で残す。

export type BandCond = {
  key: string;
  seat_kind: string | null;
  dow_mask: number | null;
  from: number | null;
  to: number | null;
  category_id: string | null;
  /** 帯が持つ種類（cells のキー） */
  kinds: readonly string[];
  /** 帯が持つ有効な行の種類（覆う側はこの種類でだけ先に当たる） */
  activeKinds: readonly string[];
  /** 帯の延長の行が有効で既定の印（is_default_ext）付き */
  defaultExt?: boolean;
};

/** 営業日の中の [始め, 終わり)（終日＝切替〜切替+1440） */
export function bandRangeOf(b: Pick<BandCond, "from" | "to">, cutMin: number): [number, number] {
  if (b.from === null || b.to === null) return [cutMin, cutMin + 1440];
  const f = b.from < cutMin ? b.from + 1440 : b.from;
  const tRaw = b.to === 0 ? 1440 : b.to;
  const t = tRaw <= cutMin ? tRaw + 1440 : tRaw;
  return [f, t];
}

const maskOf = (b: BandCond) => b.dow_mask ?? 127;

/** 重なり（今の重複の検出と同じ条件：席種・曜日・区分・時間帯が重なり、共通の種類がある） */
export function bandsOverlapOf(a: BandCond, b: BandCond, cutMin: number): boolean {
  if (a.seat_kind !== null && b.seat_kind !== null && a.seat_kind !== b.seat_kind) return false;
  if ((maskOf(a) & maskOf(b)) === 0) return false;
  if (a.category_id !== null && b.category_id !== null && a.category_id !== b.category_id) return false;
  const [af, at] = bandRangeOf(a, cutMin);
  const [bf, bt] = bandRangeOf(b, cutMin);
  if (!(af < bt && bf < at)) return false;
  return a.kinds.some((k) => b.kinds.includes(k));
}

/** a の条件が b の条件をすべて覆うか（席種・曜日・時間帯・区分）＝b が当たる場面ではいつも a も当たる */
export function bandCoversOf(a: BandCond, b: BandCond, cutMin: number): boolean {
  if (a.seat_kind !== null && a.seat_kind !== b.seat_kind) return false;
  if ((maskOf(b) & ~maskOf(a)) !== 0) return false;
  if (a.category_id !== null && a.category_id !== b.category_id) return false;
  const [af, at] = bandRangeOf(a, cutMin);
  const [bf, bt] = bandRangeOf(b, cutMin);
  return af <= bf && bt <= at;
}

/** 上の a が下の b を隠す（b の種類のうち、a が有効な行で持つものがある＋a が b を覆う） */
export function bandHidesOf(a: BandCond, b: BandCond, cutMin: number): boolean {
  if (!b.kinds.some((k) => a.activeKinds.includes(k))) return false;
  return bandCoversOf(a, b, cutMin);
}

export type BandShadow = { lower: number; upper: number; lowerKey: string; upperKey: string };
/** 既定の延長の印で使われない下の帯の延長（by＝印の付いた帯・並びに依らない） */
export type BandDefaultBlock = { lower: number; by: number; lowerKey: string; byKey: string };

/** b の延長が、ほかの帯の既定の延長の行に先に当たられて並びに依らず使われない＝その帯の番号（無ければ -1） */
export function defaultExtBlockerOf(bands: readonly BandCond[], j: number, cutMin: number): number {
  const b = bands[j];
  if (!b.kinds.includes("extension") || b.defaultExt) return -1;
  return bands.findIndex((d, i) => i !== j && d.defaultExt === true && bandCoversOf(d, b, cutMin));
}
export type BandWarnings = {
  /** 当たらない下の帯（帯ごとに 1 件・upper＝覆う一番上の帯）＝並べ替えで直る（ボタン） */
  shadows: BandShadow[];
  /** 既定の延長の印で延長が使われない下の帯（並べ替えでは直らない＝ボタンなし・警告は残す） */
  defaultBlocks: BandDefaultBlock[];
  /** 今の重複の警告に残す組（上 i・下 j）＝覆う／覆われるのどちらでもない一部の重なり */
  overlaps: [number, number][];
};

/** 表示の並び（上から）の帯で、当たらない帯と一部の重なりを分ける */
export function bandWarningsOf(bands: readonly BandCond[], cutMin: number): BandWarnings {
  const shadows: BandShadow[] = [];
  const defaultBlocks: BandDefaultBlock[] = [];
  const overlaps: [number, number][] = [];
  const hidden = new Set<number>();
  for (let j = 0; j < bands.length; j++) {
    const by = defaultExtBlockerOf(bands, j, cutMin);
    if (by >= 0) defaultBlocks.push({ lower: j, by, lowerKey: bands[j].key, byKey: bands[by].key });
    // 既定の印で使われない延長は「並べ替えで直る種類」から外す（並べ替えても当たり方が変わらない）
    const lowerFixable: BandCond = by >= 0 ? { ...bands[j], kinds: bands[j].kinds.filter((k) => k !== "extension") } : bands[j];
    for (let i = 0; i < j; i++) {
      if (bandsOverlapOf(bands[i], bands[j], cutMin) && bandHidesOf(bands[i], lowerFixable, cutMin)) {
        shadows.push({ lower: j, upper: i, lowerKey: bands[j].key, upperKey: bands[i].key });
        hidden.add(j);
        break; // 一番上の覆う帯だけ
      }
    }
  }
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i], b = bands[j];
      if (!bandsOverlapOf(a, b, cutMin)) continue;
      if (hidden.has(j) && bandCoversOf(a, b, cutMin)) continue; // 当たらない帯の組（上の shadows で出す）
      if (defaultBlocks.some((x) => x.lower === j && x.by === i)) continue; // 既定の印の組（defaultBlocks で出す）
      if (bandCoversOf(b, a, cutMin)) continue; // 狭い帯が上＝「狭い条件ほど上に」のとおり
      if (bandCoversOf(a, b, cutMin)) continue; // 覆うが無効の行だけ（当たらない帯ではない）＝警告しない
      overlaps.push([i, j]);
    }
  }
  return { shadows, defaultBlocks, overlaps };
}

/** keys[from] を keys[to] のすぐ上（to の位置）へ動かした全件の並び。to が from より上でない・範囲外は null */
export function moveAboveOf(keys: readonly string[], from: number, to: number): string[] | null {
  if (from < 0 || from >= keys.length || to < 0 || to >= from) return null;
  const next = [...keys];
  const [k] = next.splice(from, 1);
  next.splice(to, 0, k);
  return next;
}

/** 当たらない帯を直す並び（帯の key の全件） */
export function bandShadowFixOrderOf(keys: readonly string[], s: BandShadow): string[] | null {
  if (keys[s.lower] !== s.lowerKey || keys[s.upper] !== s.upperKey) return null; // 並びが古い
  return moveAboveOf(keys, s.lower, s.upper);
}

export const BAND_SHADOW_HEAD_JA = (n: number) => `下の行が当たらない時間帯があります（${n}行・上の広い条件の行が先に当たります）`;
export const BAND_SHADOW_BTN_JA = "この行を上へ動かす";
/** 既定の延長の印で使われない行の文（印の切替の場所＝同じタブの「延長パターン」） */
export const BAND_DEFAULT_EXT_JA = (byName: string) => `『${byName}』に既定の延長の印が付いているため、並びを変えてもこの行は使われません。`;
export const BAND_DEFAULT_EXT_WHERE_JA = "既定の延長は「延長パターン」で切り替えられます。";
export const BAND_DEFAULT_EXT_HEAD_JA = (n: number) => `既定の延長の印のため使われない延長の行があります（${n}行）`;
export const BAND_SHADOW_DONE_JA = "並びを直しました（狭い条件の行を上へ動かしました）";
