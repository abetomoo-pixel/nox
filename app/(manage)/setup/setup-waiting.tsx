// ★便 SU（M-37 (3)）: setup_done=false の店に属する manager／staff が開いたときの案内（オーナーが初期設定を終えるまで他画面へ行けない）。殻だけ＝書込なし。
import * as t from "@/lib/nox/ui/theme";

export default function SetupWaiting({ storeName }: { storeName: string }) {
  return (
    <div className="nox-setup-wrap" data-setup-waiting="1">
      <header className="nox-setup-top">
        <div className="nox-setup-bar">
          <div className="nox-setup-mark" aria-hidden="true">N</div>
          <div><h1>NOX 初期設定</h1><div className="sub">オーナーが設定を終えると使えるようになります</div></div>
        </div>
      </header>
      <main className="nox-setup-main">
        <section className="nox-cardtop" style={{ ...t.card, textAlign: "center", padding: "32px 20px" }}>
          <p style={{ fontSize: 17, fontWeight: 800, margin: "0 0 8px" }}>{storeName} は初期設定の途中です</p>
          <p style={{ ...t.sub, margin: 0, lineHeight: 1.7 }}>オーナーが「この内容で始める」を押すと、レジ・シフト・日報が開きます。しばらくしてから画面を更新してください。</p>
        </section>
      </main>
    </div>
  );
}
