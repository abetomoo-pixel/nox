"use client";

// ★便 M5b M-51（2026-11-02）: 時刻入力の共通部品＝正本 docs/handoff/mock/setup_v5.html の time 欄（時計アイコン付き・ダーク配色・48px）。
//   押すと時と分を選ぶ小窓が開く。小窓の欄に 26:00／2600 と打っても受け付ける（0〜47 時）。
//   表示は「翌02:00」（24 時以上）。after（開始の時刻）を渡すと、選んだ時刻が開始より前なら翌日として +24 時で返す＝保存する値の形（26:00）は変えない（変換は部品の中）。
//   値と表示の純関数は lib/nox/time/hhmm.ts（hmLabelOf／hmPickOf）と lib/nox/time/picker.ts（timePickerHoursOf 等）。RPC・意味づけは呼び出し側。
// ★M-145（2026-11-10 夜便・Agoora 要望）: ①開いたら今の値の時・分へ自動スクロールして真ん中で強調（空なら営業開始＝startAt）②時の列は営業日の順（切替時刻 dayStart から・翌は「翌」）
//   ③上部に「営業開始」「営業終了」のボタン（startAt／closeAt を渡したときだけ・押すと即入る）④開く向きは画面の空きで自動（下に入らなければ上・375 で切れない）
//   ⑤直接入力（26:00）は残す・キーボードの上下で時・分・Enter で決定 ⑥分の列は 15 分刻み（00／15／30／45）＝全画面で同じ（step は互換のため受けるが使わない）
//   ⑦列に無い分の値（20:20 など）は分の列を強調せず、入力欄にその値を出す。
//   ★旧版の不具合も直す＝正規表現の \d が d に化けていた 2 か所（after より前に「翌」が付かない・空のとき営業開始の時を選べない）。
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { hmLabelOf, hmPickOf, normalizeHHMM } from "@/lib/nox/time/hhmm";
import { TIME_PICKER_MINUTES, timePickerHoursOf, timePickerValueOf } from "@/lib/nox/time/picker";
import { useStoreHours } from "./store-hours-context";

export default function TimeInput({ value, onChange, after, maxHour = 47, disabled, ariaLabel, placeholder = "--:--", width, nextDayMark = true, style, startAt: startAtProp, closeAt: closeAtProp, dayStart: dayStartProp }: {
  /** "HH:MM"（0〜47 時）・空＝未入力 */
  value: string; onChange: (v: string) => void;
  /** 互換のため受ける（分の列は 15 分刻みで固定＝M-145） */
  step?: number;
  /** 開始の時刻。渡すと「開始より前に選んだ時刻」は翌日（+24 時）として返す */
  after?: string | null;
  /** 時の上限（当日だけの欄は 23） */
  maxHour?: number;
  disabled?: boolean; ariaLabel?: string; placeholder?: string; width?: number | string;
  /** 翌日の時刻に「翌」を付ける（既定 true） */
  nextDayMark?: boolean;
  /** 旧 HmInput／type=time からの置き換え用＝幅（width）と flex だけ使う */
  style?: CSSProperties; required?: boolean; autoFocus?: boolean; className?: string;
  /** 空のとき小窓で真ん中に置く時（店の営業開始）＝「営業開始」のボタンにもなる */
  startAt?: string | null;
  /** 「営業終了」のボタン（渡したときだけ） */
  closeAt?: string | null;
  /** 営業日の切替時刻（時の列はここから並べる・既定 06:00） */
  dayStart?: string | null;
}) {
  const sh = useStoreHours(); // ★M-145: 渡されていない営業開始・営業終了・切替時刻はシェルの店の値で補う
  const startAt = startAtProp ?? sh.open, closeAt = closeAtProp ?? sh.close, dayStart = dayStartProp ?? sh.cutoff;
  const w = width ?? style?.width ?? style?.maxWidth;
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [typed, setTyped] = useState("");
  const [hour, setHour] = useState<number | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const hourCol = useRef<HTMLSpanElement>(null);
  const minCol = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = /^(\d{2}):(\d{2})$/.exec(value);
  const curH = cur ? Number(cur[1]) % 24 : null, curM = cur ? Number(cur[2]) : null;
  const startH = startAt && /^\d{1,2}:/.test(startAt) ? Number(startAt.split(":")[0]) % 24 : null;
  const selH = hour ?? curH;
  const hours = timePickerHoursOf(dayStart ?? "06:00", maxHour);
  const minutes = TIME_PICKER_MINUTES;
  const curMOnList = curM !== null && (minutes as readonly number[]).includes(curM);
  // ①開いたら選んでいる時・分（空なら営業開始）を列の真ん中へ
  useEffect(() => {
    if (!open) return;
    const center = (col: HTMLSpanElement | null) => { const el = col?.querySelector<HTMLElement>("button.on, button[data-center]"); if (col && el) col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2; };
    center(hourCol.current); center(minCol.current);
  }, [open, selH]);
  const pick = (h: number, m: number) => { onChange(timePickerValueOf(h, m, after ?? null, maxHour, dayStart ?? "06:00")); setOpen(false); setHour(null); };
  // 打った値: 24 時以上（26:00）はそのまま・24 時未満は選んだときと同じ規則（開始より前なら翌日）
  const commitTyped = () => { const n = normalizeHHMM(typed, maxHour); if (!n) return; const [h, m] = n.split(":").map(Number); if (h >= 24) { onChange(n); setOpen(false); } else { onChange(hmPickOf(h, m, after ?? null, maxHour)); setOpen(false); setHour(null); } };
  const am = after ? /^(\d{1,2}):(\d{2})/.exec(after) : null;
  const beforeAfter = !!cur && !!am && Number(cur[1]) < 24 && Number(cur[1]) * 60 + Number(cur[2]) < (Number(am[1]) % 24) * 60 + Number(am[2]);
  const label = value ? (nextDayMark ? (beforeAfter ? `翌${value}` : hmLabelOf(value)) : value) : (startAt ? hmLabelOf(startAt) : placeholder);
  const openPop = () => {
    // ④開く向き＝下に 330px 入らず上の方が広ければ上
    const r = box.current?.getBoundingClientRect(); const below = r ? window.innerHeight - r.bottom : 999; const above = r ? r.top : 0;
    setUp(below < 330 && above > below);
    setOpen((o) => !o); setTyped(value && !curMOnList ? value : ""); setHour(curH ?? startH);
  };
  const onKey = (e: React.KeyboardEvent) => {
    // ⑤キーボード＝上下で時（Shift で分）・Enter で決定
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    const h0 = selH ?? startH ?? hours[0].h;
    if (e.key === "Enter") { pick(h0, curMOnList && curM !== null ? curM : 0); return; }
    const i = hours.findIndex((x) => x.h === h0); const ni = Math.max(0, Math.min(hours.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    setHour(hours[ni].h);
  };
  return (
    <span ref={box} className="nox-time" style={{ width: w, flex: style?.flex }} data-time-input="1">
      <button type="button" className="nox-time-btn num" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} data-empty={value ? undefined : "1"} onClick={openPop}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>{label}</span>
      </button>
      {open && (
        <span className={`nox-time-pop${up ? " up" : ""}`} role="dialog" aria-label={`${ariaLabel ?? "時刻"}を選ぶ`} data-time-pop="1" tabIndex={-1} onKeyDown={onKey}>
          {(startAt || closeAt) && (
            <span className="nox-time-quick" data-time-quick="1">
              {startAt && Number(startAt.slice(0, 2)) <= maxHour && <button type="button" onClick={() => { onChange(startAt); setOpen(false); }}>営業開始</button>}
              {closeAt && Number(closeAt.slice(0, 2)) <= maxHour && <button type="button" onClick={() => { onChange(closeAt); setOpen(false); }}>営業終了</button>}
            </span>
          )}
          <span className="nox-time-cols">
            <span ref={hourCol} className="nox-time-col" aria-label="時" data-time-hours={hours.length}>{hours.map(({ h, next }) => (
              <button key={`${next ? "n" : "d"}${h}`} type="button" className={`num${selH === h ? " on" : ""}`} data-center={selH === null && startH === h ? "1" : undefined} onClick={() => setHour(h)}>{next ? "翌" : ""}{String(h).padStart(2, "0")}</button>
            ))}</span>
            <span ref={minCol} className="nox-time-col" aria-label="分" data-time-minutes={minutes.length}>{minutes.map((m) => (
              <button key={m} type="button" className={`num${curMOnList && curM === m && selH === curH ? " on" : ""}`} disabled={selH === null} onClick={() => { if (selH !== null) pick(selH, m); }}>{String(m).padStart(2, "0")}</button>
            ))}</span>
          </span>
          <span className="nox-time-type">
            <input value={typed} inputMode="numeric" placeholder="例 26:00" aria-label="時刻を入力" className="num"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }} />
            <button type="button" onClick={commitTyped}>決定</button>
          </span>
        </span>
      )}
    </span>
  );
}
