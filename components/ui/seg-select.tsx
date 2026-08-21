"use client";

// セグメント選択（B3・2026-08-21 裁定40）。**プルダウンの置換専用**の小部品。
//
// ★教訓27（R2 恒久規約）: 選択肢7以下の入力はボタン群（seg／チップ）にする。
//   プルダウンは選択肢が多く一覧できないもの（キャスト・店舗・顧客・商品・席など件数可変）だけ許可。
//
// ★置換は**表示だけ**＝持つ値も onChange の呼び先も送る RPC も1文字も変えない。
//   `<select value={v} onChange={e => setV(e.target.value)}>` を
//   `<SegSelect value={v} onChange={setV} options={[[v,l],…]} />` に差し替えるだけ。
// ★見た目は既存の .nox-seg（master-subnav・casts・report と同じ文法＝選択中は金枠）。新クラスは作らない。
// ★confirm を渡すと押下前に確認を挟む（裁定40＝権限付与のように取り違えが重いものだけ）。
//   確認は「いま押した選択肢」の文言を含められるよう関数で受ける。
import type { CSSProperties } from "react";

export default function SegSelect({
  value, onChange, options, disabled, style, confirm, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  /** [値, ラベル] の並び。7以下であること（規約） */
  options: ReadonlyArray<readonly [string, string]>;
  disabled?: boolean;
  style?: CSSProperties;
  /** 押下前の確認文。undefined を返すと確認しない。 */
  confirm?: (nextValue: string, nextLabel: string) => string | undefined;
  ariaLabel?: string;
}) {
  return (
    <div className="nox-seg" style={{ flex: "0 0 auto", ...style }} role="group" aria-label={ariaLabel}>
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <button
            key={v} type="button" disabled={disabled}
            className={on ? "on" : ""} aria-pressed={on}
            onClick={() => {
              if (on) return;
              const msg = confirm?.(v, l);
              if (msg && !window.confirm(msg)) return;
              onChange(v);
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
