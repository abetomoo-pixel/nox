"use client";

// ★M-154（2026-11-11・Agoora 確定）: キオスクの PIN 入力を 1 つの部品に＝出退勤の名前選択後の PIN と「スタッフでログイン（PIN）」が同じ部品。
//   キーは横幅いっぱいの 3 列・枠は金のトークン・数字は大きく押した反応つき（CSS .nox-pinpad）・表示「PIN（4〜6 桁）」・丸は入力した数だけ（薄い丸なし）。
//   決定のボタン（出勤・退勤・解除）は呼び手が下に置く（同じ形の横幅いっぱいの塗り＝.nox-pinpad-go）。値はマスク（●）＝入力値そのものは画面に出さない。
export const PIN_MIN = 4, PIN_MAX = 6;
export const pinReady = (p: string): boolean => p.length >= PIN_MIN && p.length <= PIN_MAX;
/** ★M-179（2026-11-11）: 桁数の案内は全画面でこの 1 か所から（キャストもスタッフも 4〜6 桁） */
export const PIN_DIGITS_LABEL = `${PIN_MIN}〜${PIN_MAX} 桁`;
export const PIN_SHAPE_RE = new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`);

export default function PinPad({ value, onChange, max = PIN_MAX, label = `PIN（${PIN_MIN}〜${PIN_MAX} 桁）`, disabled = false }: {
  value: string; onChange: (v: string) => void; max?: number; label?: string; disabled?: boolean;
}) {
  const add = (d: string) => onChange(value.length >= max ? value : value + d);
  return (
    <div className="nox-pinpad" data-pinpad={String(max)}>
      <p className="nox-pinpad-label">{label}</p>
      <div className="nox-pinpad-dots" aria-label={`${value.length} 桁入力済み`} data-pin-dots={String(value.length)}>
        {Array.from({ length: value.length }, (_, i) => <span key={i} className="dot" />)}
      </div>
      <div className="nox-pinpad-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button type="button" key={d} className="k" disabled={disabled} onClick={() => add(d)}>{d}</button>)}
        <button type="button" className="k sub" disabled={disabled} onClick={() => onChange("")}>クリア</button>
        <button type="button" className="k" disabled={disabled} onClick={() => add("0")}>0</button>
        <button type="button" className="k sub" disabled={disabled} onClick={() => onChange(value.slice(0, -1))} aria-label="1 文字消す">⌫</button>
      </div>
    </div>
  );
}
