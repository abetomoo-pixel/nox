"use client";

// ★LP v4（2026-11-04 夜の自走便 4・docs/handoff/lp/NOX-LP.html の反映）: /lp の動く部分だけ＝操作画面の拡大（dialog）と問い合わせフォームのプレビュー（送信・保存しない＝HTML どおり）。
//   page.tsx は force-static のまま（"use client" はこのファイルだけ）。
import { useRef, useState } from "react";

/** 操作画面の図＝押すと拡大（HTML の .screen-zoom＋.image-dialog と同じ） */
export function ScreenZoom({ src, alt, caption = "NOX 操作画面", crop = false }: { src: string; alt: string; caption?: string; crop?: boolean }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  return (
    <figure className={`actual-screen${crop ? " actual-2" : ""}`}>
      <button className="screen-zoom" type="button" aria-label={`${alt}を拡大`} onClick={() => ref.current?.showModal()} data-lp-zoom="1">
        {/* eslint-disable-next-line @next/next/no-img-element -- 静的な見せ場の画面（public/lp/v4） */}
        <img src={src} alt={alt} loading="lazy" />
      </button>
      <figcaption>{caption} <span>クリックして拡大 ↗</span></figcaption>
      <dialog ref={ref} className="image-dialog" aria-label="NOXの操作画面を拡大" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <button className="image-close" type="button" onClick={() => ref.current?.close()}>閉じる ×</button>
        <p>{alt}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </dialog>
    </figure>
  );
}

const TOPICS = ["導入について", "料金・年払い割引について", "店舗の運用・機能について", "その他"] as const;
const LABELS: [string, string][] = [["name", "お名前"], ["email", "メールアドレス"], ["store", "店舗名"], ["topic", "ご相談内容"], ["message", "お問い合わせ内容"]];

/** 問い合わせフォーム＝プレビュー（HTML の mock どおり＝送信・保存しない・確認→完了の 2 画面） */
export function InquiryForm() {
  const [stage, setStage] = useState<"form" | "confirm" | "done">("form");
  const [f, setF] = useState<Record<string, string>>({ name: "", email: "", store: "", topic: TOPICS[0], message: "" });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  if (stage === "confirm") return (
    <section id="form-confirm" aria-labelledby="confirm-title" data-lp-form="confirm">
      <h3 id="confirm-title" tabIndex={-1}>お問い合わせ内容の確認</h3>
      <dl id="confirm-fields">{LABELS.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{f[k] || "—"}</dd></div>)}</dl>
      <p className="mock-notice">モックのため、送信は行われません。</p>
      <div className="actions">
        <button className="btn ghost btn-white" type="button" onClick={() => setStage("form")}>入力に戻る</button>
        <button className="btn" type="button" onClick={() => setStage("done")}>送信完了画面を見る（デモ） →</button>
      </div>
    </section>
  );
  if (stage === "done") return (
    <section id="form-done" data-lp-form="done">
      <h3 tabIndex={-1}>送信完了画面のプレビュー</h3>
      <p>本番では、ここにお問い合わせの受付完了を表示します。<br />今回は送信・保存されていません。</p>
      <button className="btn" type="button" onClick={() => setStage("form")}>フォームに戻る</button>
    </section>
  );
  return (
    <form id="contact-form" data-lp-form="form" onSubmit={(e) => { e.preventDefault(); setStage("confirm"); }}>
      <div className="form-grid">
        <label>お名前 <span>必須</span><input name="name" autoComplete="name" required maxLength={100} placeholder="山田 太郎" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>メールアドレス <span>必須</span><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="example@company.jp" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label>店舗名<input name="store" autoComplete="organization" maxLength={120} placeholder="店舗名（開業前の方は未入力で構いません）" value={f.store} onChange={(e) => set("store", e.target.value)} /></label>
        <label>ご相談内容<select name="topic" value={f.topic} onChange={(e) => set("topic", e.target.value)}>{TOPICS.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>
      <label className="message-label">お問い合わせ内容 <span>必須</span><textarea name="message" rows={6} required maxLength={3000} placeholder="現在の運用や、確認したい機能などをご記入ください。" value={f.message} onChange={(e) => set("message", e.target.value)} /></label>
      <div className="form-bottom"><button className="btn" type="submit">入力内容を確認する <span>→</span></button></div>
    </form>
  );
}
