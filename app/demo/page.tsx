import type { Metadata } from "next";
import * as t from "@/lib/nox/ui/theme";
import DemoEntry, { type DemoBiz, type DemoRole } from "@/components/ui/demo-terms"; // ★夜間便 N5（裁定293-7）: 入場前の規約＋同意チェック（未同意は入場不可）
import { DEMO_KIOSK_KEY, DEMO_RESET_TIME_JA, DEMO_ROLES, DEMO_ROLE_LABEL, DEMO_STORES, DEMO_STORE_LABEL } from "@/lib/nox/demo/seed";

// ★夜間便 N7-3（裁定273／277・2026-09-18）→ ★裁定328 追補1 ②③⑤（便 D1・2026-10-02）: 公開デモの入口＝店 6 × 役割 4 のボタン＋店ごとの端末（kiosk）（noindex）。
//   押すと POST /api/demo/enter（店・役割）→ サーバが magiclink を生成して検証し cookie を載せ、役割の初期画面へ redirect。
//   パスワード／メールの入力なし。ここには資格情報もリンクも置かない（env DEMO_USERS の対応表はサーバだけが読む）。env が無ければ route が 503「デモは準備中です」。
export const metadata: Metadata = {
  title: "NOX デモ",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-static";

const STORES: DemoBiz[] = DEMO_STORES.map((s) => ({ key: s, label: DEMO_STORE_LABEL[s].name, sub: DEMO_STORE_LABEL[s].biz, desc: DEMO_STORE_LABEL[s].desc }));
const ROLES: DemoRole[] = DEMO_ROLES.map((r) => ({ key: r, label: DEMO_ROLE_LABEL[r].label, desc: DEMO_ROLE_LABEL[r].desc }));
const KIOSK: DemoRole = { key: DEMO_KIOSK_KEY, label: "端末（キオスク）", desc: "店に置く打刻端末の画面（固定の端末ユーザー）" };

export default function DemoPage() {
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={{ ...t.wrap, maxWidth: 760, margin: "0 auto", padding: "28px 16px" }}>
        <header style={{ marginBottom: 18 }}>
          <span style={t.brand}>NOX</span>
          <h1 style={{ ...t.pheadH1, marginTop: 8 }}>デモを試す</h1>
          <p style={t.pheadP}>店と役割を選ぶと、そのままログインした状態で画面が開きます（パスワードやメールの入力はありません）。デモの入力内容は他の閲覧者にも見え、{DEMO_RESET_TIME_JA}に初期状態へ戻ります。</p>
        </header>
        {/* ★N5（裁定293-7）: 規約 5 項＋「同意する」→ 入場ボタン（form POST /api/demo/enter は不変・未同意は disabled） */}
        <DemoEntry biz={STORES} roles={ROLES} kiosk={KIOSK} />
        <p style={{ fontSize: 11, color: "var(--v2-muted)", marginTop: 10, lineHeight: 1.7 }}>
          デモ環境では、ご契約（お支払い）・招待・スタッフ作成・メール／パスワードの変更・組織の削除・写真のアップロード・キオスク発行・印刷・外部への送信（LINE／メール）はできません。
        </p>
      </div>
    </div>
  );
}
