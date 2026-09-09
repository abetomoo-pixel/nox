"use client";

// E8-1 ⑤（E8 裁定・レジ改善設計 v1 §⑤）: キャスト選択の共通部品 CastPicker。
// 検索（源氏名部分一致）＋写真グリッド（CastAvatar 大判）＋並び＝名前順で固定（裁定107）。
// ★表示と選択の UI だけを持つ純部品＝金額・RPC・選択の意味づけ（単選/複選/重み）は呼び出し側の責務。
//   置換4箇所（指名料 select／按分チップ manage・kiosk／claimPick）＋タップ時モーダル（#8）で共用。
//   「本日出勤」は punches 由来の近似（呼び出し側が Set で渡す・表示順とバッジのみ＝金額に一切関与しない）。
import { useMemo, useState } from "react";
import CastAvatar from "@/components/ui/cast-avatar";
import * as t from "@/lib/nox/ui/theme";

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
  casts, photoUrls, seatedIds, todayIds, attendIds, servingIds, rankNames,
  selectedIds, badges, onPick, size = 44, dense = false,
}: {
  casts: PickerCast[];
  /** 署名 URL の Map（無い環境＝kiosk は頭文字アバターへ自動フォールバック） */
  photoUrls?: Map<string, string>;
  /** 着卓中（この伝票の指名・按分重み>0）＝最優先で先頭＋「着卓中」バッジ */
  seatedIds?: Set<string>;
  /** 打刻（最終打刻が 'in' の近似）＝「打刻」バッジ（★B3 裁定209: attendance が正・打刻のみはこの語） */
  todayIds?: Set<string>;
  /** ★B3 裁定209（#64）: 営業日の attendance（shukkin/dohan/late）にある＝「出勤中」バッジ */
  attendIds?: Set<string>;
  /** ★B3 裁定211（#64）: 他卓の open 伝票の名簿に載る＝「接客中」バッジ（自伝票は seatedIds＝着卓中が優先） */
  servingIds?: Set<string>;
  /** ★B3 裁定210（#64）: ランク名（cast_ranks が読めた id だけ・無い id／ロールでは要素を出さない） */
  rankNames?: Map<string, string>;
  /** 選択中（単選でも Set で渡す） */
  selectedIds?: Set<string>;
  /** E8-1d: 種別付きバッジ（あれば「着卓中」より優先表示・並びは着卓中と同じ最優先群） */
  badges?: Map<string, PickerBadge>;
  onPick: (id: string) => void;
  size?: number;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => {
    // ★0121（裁定107 段1-(1)）: 「着卓中/選択→先頭・出勤→2番手」の rank 並べ替えを撤去＝名前順で固定。
    //   選択・着卓・出勤は枠色とバッジのみで表現（タップのたびにカードが移動する迷子を止める）。
    const needle = q.trim();
    return [...casts]
      .filter((c) => needle === "" || c.name.includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [casts, q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="キャストを検索"
        aria-label="キャストを検索"
        style={{ ...t.input, width: "100%", maxWidth: 260, marginBottom: 8 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 78 : 94}px, 1fr))`, gap: 8 }}>
        {sorted.map((c) => {
          const sel = selectedIds?.has(c.id) ?? false;
          const seated = seatedIds?.has(c.id) ?? false;
          const today = todayIds?.has(c.id) ?? false;
          const attend = attendIds?.has(c.id) ?? false;
          const serving = servingIds?.has(c.id) ?? false;
          const rank = rankNames?.get(c.id) ?? null;
          // ★B3 裁定209/211: 状態語の優先＝着卓中（自伝票）＞接客中（他卓）＞出勤中（attendance）＞打刻（punches）
          const stateLabel = seated ? "着卓中" : serving ? "接客中" : attend ? "出勤中" : today ? "打刻" : null;
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
                color: sel ? "var(--champ)" : "var(--ink)",
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
                  // 着卓中／接客中＝gold2 系・出勤中／打刻＝ok 系（既存 2 色の範囲内・新色なし）
                  color: (seated || serving) ? "var(--gold2)" : "var(--ok)",
                  borderColor: (seated || serving) ? "rgba(201, 162, 74, .45)" : "rgba(119, 186, 131, .45)",
                }}>
                  {stateLabel}
                </span>
              )}
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--sub)", gridColumn: "1 / -1", margin: 0 }}>該当するキャストがいません</p>
        )}
      </div>
    </div>
  );
}
