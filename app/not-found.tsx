// ★C-1（2026-11-13 通しの確かめ）: 見つからないページ（404）を日本語に（既定の英語の画面を置き換える）。
import Link from "next/link";

const NOT_FOUND_TITLE = "ページが見つかりません";
const NOT_FOUND_BODY = "アドレスが違うか、ページが移動または削除された可能性があります。";

export default function NotFound() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "48px 16px" }} data-not-found="1">
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <p className="num" style={{ margin: 0, fontSize: 13, color: "var(--sub)", letterSpacing: 2 }}>404</p>
        <h1 style={{ margin: "8px 0 10px", fontSize: 20 }}>{NOT_FOUND_TITLE}</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--sub)", lineHeight: 1.7 }}>{NOT_FOUND_BODY}</p>
        <Link href="/" className="nox-link" style={{ fontSize: 14 }}>トップへ戻る</Link>
      </div>
    </main>
  );
}
