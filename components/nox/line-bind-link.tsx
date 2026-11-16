"use client";
// ★2026-11-16 夜（相談役 N6・Agoora 18:21）: LINE 連携の招待リンク（1 回だけ表示・7 日）に QR を添える＝BANZEN の招待リンクの画面と同じ並び（左に QR・右にリンクとコピー）。
//   QR は画面の中で作る（uqr の renderSVG＝依存ゼロ・領収書と端末の QR と同じ部品・新しい部品は入れない）。リンクの文字を外のサービスへ送らない。
//   QR は state に持たず url から毎回作る＝閉じたら（url が null になったら）消える・画面や端末に残さない。リンクの作り方・期限・保存する値は変えない（呼び出し側のまま）。
import { useMemo } from "react";
import { renderSVG } from "uqr";
import { LINE_BIND_NOTE } from "@/lib/nox/line/liff-endpoint";

export const LINE_BIND_HAND_NOTE = "本人に直接お渡しください（QR を読み取ってもらえます）";
/** QR の一辺（px）＝375 の幅でスマホのカメラで読める大きさ（白地の余白込み） */
export const LINE_BIND_QR_PX = 132;

export default function LineBindLink({ url, copied, onCopy, buttonStyle, dataAttr }: {
  url: string; copied: boolean; onCopy: () => void; buttonStyle: React.CSSProperties; dataAttr: string;
}) {
  const svg = useMemo(() => renderSVG(url, { border: 1 }), [url]);
  return (
    <div className="nox-linebind" {...{ [dataAttr]: "1" }} data-line-bind-qr="1">
      <div className="qr" aria-label="LINE 連携のリンクの QR" role="img" style={{ width: LINE_BIND_QR_PX, height: LINE_BIND_QR_PX }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="tx">
        <span style={{ fontSize: 12, wordBreak: "break-all" }}>{url}</span>
        <span><button type="button" style={buttonStyle} onClick={onCopy}>{copied ? "コピーしました ✓" : "リンクをコピー"}</button></span>
        <span style={{ fontSize: 11.5, color: "var(--ink)", fontWeight: 700 }} data-line-bind-hand="1">{LINE_BIND_HAND_NOTE}</span>
        <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{LINE_BIND_NOTE}</span>
      </div>
    </div>
  );
}
