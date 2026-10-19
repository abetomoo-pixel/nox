"use client";

// ★便 GV-C C-9（GV-52）: OFF／ON セグメントの共通部品。選択側を塗る（ON＝青・OFF＝グレー・既定に従う＝薄い塗り）・非選択は枠のみ・
//   右（スマホは下）に状態文字「ON・この店で使う」／「OFF・この店では使わない」（3 値は「既定に従う（いまは ON）」）。OFF の行の減光は行側（OnOffRow）。
//   送る値は呼び出し側の onChange のまま（boolean または "inherit"）＝RPC・保存の経路は不変。
export type OnOffValue = boolean | "inherit";

export function onOffStateTextOf(v: OnOffValue, inherited?: boolean): string {
  if (v === "inherit") return `既定に従う（いまは ${inherited ? "ON" : "OFF"}）`;
  return v ? "ON・この店で使う" : "OFF・この店では使わない";
}

export default function OnOffSeg({ value, onChange, disabled = false, ariaLabel, threeWay = false, inherited, disabledOff = false, offTitle }: {
  value: OnOffValue;
  onChange: (v: OnOffValue) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** 「既定に従う／ON／OFF」の 3 値 */
  threeWay?: boolean;
  /** 3 値のときの既定の値（状態文字に出す） */
  inherited?: boolean;
  /** OFF だけ押せない（使用中のキャストがいる等） */
  disabledOff?: boolean;
  offTitle?: string;
}) {
  const opts: [OnOffValue, string][] = threeWay ? [["inherit", "既定に従う"], [true, "ON"], [false, "OFF"]] : [[false, "OFF"], [true, "ON"]];
  const key = (v: OnOffValue) => (v === "inherit" ? "inherit" : v ? "on" : "off");
  return (
    <span className="nox-onoffwrap" data-onoff-state={key(value)}>
      <span className="nox-onoff" role="group" aria-label={ariaLabel}>
        {opts.map(([v, label]) => (
          <button key={key(v)} type="button" data-v={key(v)} className={value === v ? "on" : ""} aria-pressed={value === v}
            disabled={disabled || value === v || (v === false && disabledOff)} title={v === false && disabledOff ? offTitle : undefined}
            onClick={() => onChange(v)}>{label}</button>
        ))}
      </span>
      <span className="nox-onoff-state">{onOffStateTextOf(value, inherited)}</span>
    </span>
  );
}
