"use client";

// E8-1 ⑤（E8 裁定・レジ改善設計 v1 §⑤）: キャスト選択の共通部品 CastPicker。
// 検索（源氏名部分一致）＋写真グリッド（CastAvatar 大判）＋並び＝名前順で固定（裁定107）。
// ★表示と選択の UI だけを持つ純部品＝金額・RPC・選択の意味づけ（単選/複選/重み）は呼び出し側の責務。
//   置換4箇所（指名料 select／按分チップ manage・kiosk／claimPick）＋タップ時モーダル（#8）で共用。
//   「本日出勤」は punches 由来の近似（呼び出し側が Set で渡す・表示順とバッジのみ＝金額に一切関与しない）。
// ★裁定322（2026-09-29・便 X-11-5）: grouped を渡したレジの面は、並びと表示を共通化＝
//   ①接客中／場内／着卓中 → ②出勤中（in 打刻あり・out なし） → ③未出勤（シフトあり） → ④未出勤。各群は名前順（並びは lib の castPickerOrder 1 本）。
//   ①②は状態バッジ・③④はグレー＋「未出勤」ラベルで既定は折りたたみ「未出勤を表示（n 人）」。チップ（モーダル）の既定は「出勤中」。
//   検索中は未出勤も一緒に出す（探している人が折りたたみの中で見つからないのを防ぐ）。grouped を渡さない面（シフト追加・予約・kiosk）は従来どおり名前順。
import { useMemo, useState } from "react";
import CastAvatar from "@/components/ui/cast-avatar";
import * as t from "@/lib/nox/ui/theme";
import { castPickerOrder, offDutyToggleLabelOf, type CastPickGroup } from "@/lib/nox/register/cast-picker-order";

export type PickerCast = { id: string; name: string };

// E8-1d: 種別付きバッジ（本指名=gold／場内=gold2／同伴・フリー=muted）。呼び出し側が判定して渡す＝
//   本部品は表示のみ（判定ロジックを持たない）。エントリがある id は「着卓中」の代わりにこれを出す。
export type PickerBadge = { label: string; tone: "gold" | "gold2" | "muted" };
const BADGE_STYLE: Record<PickerBadge["tone"], { color: string; borderColor: string }> = {
  gold: { color: "var(--gold)", borderColor: "rgba(212, 175, 55, .5)" },
  gold2: { color: "var(--gold2)", borderColor: "rgba(201, 162, 74, .45)" },
  muted: { color: "var(--sub)", borderColor: "var(--line2)" },
};

export default function CastPicker({
  casts, photoUrls, seatedIds, todayIds, attendIds, servingIds, shiftIds, rankNames, chips = false, grouped = false,
  selectedIds, badges, onPick, size = 44, dense = false,
}: {
  casts: PickerCast[];
  /** 署名 URL の Map（無い環境＝kiosk は頭文字アバターへ自動フォールバック） */
  photoUrls?: Map<string, string>;
  /** 着卓中（この伝票の指名・按分重み>0）＝最優先で先頭＋「着卓中」バッジ */
  seatedIds?: Set<string>;
  /** 打刻（最終打刻が 'in' の近似）＝「打刻」バッジ（★B3 裁定209: attendance が正・打刻のみはこの語）。★裁定322: grouped では ②出勤中 の判定 */
  todayIds?: Set<string>;
  /** ★B3 裁定209（#64）: 営業日の attendance（shukkin/dohan/late）にある＝「出勤中」バッジ */
  attendIds?: Set<string>;
  /** ★B3 裁定211（#64）: 他卓の open 伝票の名簿に載る＝「接客中」バッジ（自伝票は seatedIds＝着卓中が優先） */
  servingIds?: Set<string>;
  /** ★裁定322: 当日の確定シフトがある id（③未出勤（シフトあり）の判定） */
  shiftIds?: Set<string>;
  /** ★B3 裁定210（#64）: ランク名（cast_ranks が読めた id だけ・無い id／ロールでは要素を出さない） */
  rankNames?: Map<string, string>;
  /** ★B3 裁定212（R34）: チップ＝絞込。★裁定322: grouped では［出勤中］（既定）［担当中］［すべて］ */
  chips?: boolean;
  /** ★裁定322: レジの共通の並び（①〜④の群＋未出勤の折りたたみ） */
  grouped?: boolean;
  /** 選択中（単選でも Set で渡す） */
  selectedIds?: Set<string>;
  /** E8-1d: 種別付きバッジ（あれば「着卓中」より優先表示・並びは着卓中と同じ最優先群） */
  badges?: Map<string, PickerBadge>;
  onPick: (id: string) => void;
  size?: number;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  // ★B3 裁定212: チップの絞込。★裁定322: grouped かつ chips の既定は「出勤中」（working）
  const [chip, setChip] = useState<"" | "attend" | "seated" | "working">(grouped && chips ? "working" : "");
  const [offOpen, setOffOpen] = useState(false);
  const needle = q.trim();
  const sorted = useMemo(() => {
    const base = [...casts].filter((c) => needle === "" || c.name.includes(needle));
    if (grouped) {
      // ★裁定322: ①〜④の群 → 名前順（種別バッジのある id は名簿＝①に含める）
      const seated = new Set<string>([...(seatedIds ?? []), ...(badges ? [...badges.keys()] : [])]);
      return castPickerOrder(base, { seatedIds: seated, servingIds, punchedInIds: todayIds, shiftIds })
        .filter((c) => chip === "" || chip === "working" ? true : chip === "seated" ? (seatedIds?.has(c.id) ?? false) : c.working);
    }
    // ★0121（裁定107 段1-(1)）: grouped でない面は名前順で固定（選択・着卓・出勤は枠色とバッジのみ）
    return base
      .filter((c) => chip === "" || (chip === "attend" ? (attendIds?.has(c.id) ?? false) : (seatedIds?.has(c.id) ?? false)))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      .map((c) => ({ ...c, group: 1 as CastPickGroup, working: true }));
  }, [casts, needle, chip, grouped, attendIds, seatedIds, servingIds, todayIds, shiftIds, badges]);
  const working = grouped ? sorted.filter((c) => c.working) : sorted;
  const offDuty = grouped ? sorted.filter((c) => !c.working) : [];
  // 「出勤中」チップでは未出勤を出さない（検索中は探せるように出す）。それ以外は折りたたみ（検索中は開く）
  const showOffSection = grouped && offDuty.length > 0 && (chip !== "working" || needle !== "");
  const offVisible = showOffSection && (offOpen || needle !== "");

  const card = (c: { id: string; name: string; group: CastPickGroup; working: boolean }) => {
    const sel = selectedIds?.has(c.id) ?? false;
    const seated = seatedIds?.has(c.id) ?? false;
    const today = todayIds?.has(c.id) ?? false;
    const attend = attendIds?.has(c.id) ?? false;
    const serving = servingIds?.has(c.id) ?? false;
    const rank = rankNames?.get(c.id) ?? null;
    const off = grouped && !c.working;
    // ★B3 裁定209/211: 状態語の優先＝着卓中（自伝票）＞接客中（他卓）＞出勤中＞打刻。★裁定322: grouped では in 打刻あり＝「出勤中」・③④＝「未出勤」
    const stateLabel = seated ? "着卓中" : serving ? "接客中" : grouped ? (today ? "出勤中" : off ? "未出勤" : attend ? "出勤中" : null) : attend ? "出勤中" : today ? "打刻" : null;
    const badge = badges?.get(c.id) ?? null;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => onPick(c.id)}
        aria-pressed={sel}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          padding: "9px 4px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
          // 選択状態は .nox-chip.on と同言語（--goldface2 地＋gold 枠＋champ 文字）
          // ★DP2 T2: 生 hex #1B1710 → var(--goldface2)（値は同一＝見た目不変）。
          background: sel ? "var(--goldface2)" : "var(--card2)",
          border: sel ? "1px solid var(--gold)" : "1px solid var(--line)",
          color: sel ? "var(--champ)" : off ? "var(--sub)" : "var(--ink)",
          opacity: off && !sel ? 0.7 : 1, // ★裁定322: 未出勤はグレー
        }}
      >
        <CastAvatar name={c.name} url={photoUrls?.get(c.id)} size={size} />
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{c.name}</span>
        {/* ★B3 裁定210: ランク名＝読めた id だけ（要素ごと非表示・空チップは出さない） */}
        {rank && <span style={{ fontSize: 10, color: "var(--sub)", lineHeight: 1.1 }}>{rank}</span>}
        {badge ? (
          // E8-1d: 種別付きバッジ（呼び出し側判定・「着卓中」より優先）
          <span style={{ ...t.tag, fontSize: 9.5, padding: "1px 7px", ...BADGE_STYLE[badge.tone] }}>
            {badge.label}
          </span>
        ) : stateLabel && (
          <span style={{
            ...t.tag, fontSize: 9.5, padding: "1px 7px",
            // 着卓中／接客中＝gold2 系・出勤中／打刻＝ok 系・未出勤＝muted（既存の色の範囲内・新色なし）
            color: (seated || serving) ? "var(--gold2)" : off ? "var(--sub)" : "var(--ok)",
            borderColor: (seated || serving) ? "rgba(201, 162, 74, .45)" : off ? "var(--line2)" : "rgba(119, 186, 131, .45)",
          }}>
            {stateLabel}
          </span>
        )}
      </button>
    );
  };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 78 : 94}px, 1fr))`, gap: 8 };
  const chipOptions = grouped
    ? ([["working", "出勤中"], ["seated", "担当中"], ["", "すべて"]] as const)
    : ([["", "すべて"], ["attend", "出勤中"], ["seated", "担当中"]] as const);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="キャストを検索"
        aria-label="キャストを検索"
        style={{ ...t.input, width: "100%", maxWidth: 260, marginBottom: 8 }}
      />
      {chips && (
        <div className="nox-seg" style={{ display: "inline-flex", marginBottom: 8 }}>
          {chipOptions.map(([k, label]) => (
            <button key={k} type="button" className={chip === k ? "on" : ""} onClick={() => setChip(k)}>{label}</button>
          ))}
        </div>
      )}
      <div style={grid}>
        {working.map(card)}
        {working.length === 0 && !offVisible && (
          <p style={{ fontSize: 12, color: "var(--sub)", gridColumn: "1 / -1", margin: 0 }}>
            {grouped && offDuty.length > 0 && chip === "working" ? "出勤中のキャストがいません（「すべて」で未出勤も選べます）" : "該当するキャストがいません"}
          </p>
        )}
      </div>
      {/* ★裁定322: 未出勤（③シフトあり → ④）＝既定は折りたたみ */}
      {showOffSection && (
        <div style={{ marginTop: 8 }}>
          {needle === "" && (
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} aria-expanded={offOpen} onClick={() => setOffOpen((v) => !v)}>
              {offDutyToggleLabelOf(offDuty.length, offOpen)}
            </button>
          )}
          {offVisible && <div style={{ ...grid, marginTop: 8 }}>{offDuty.map(card)}</div>}
        </div>
      )}
    </div>
  );
}
