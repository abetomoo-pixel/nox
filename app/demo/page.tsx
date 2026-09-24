import type { Metadata } from "next";
import * as t from "@/lib/nox/ui/theme";
import DemoEntry, { type DemoBiz, type DemoRole } from "@/components/ui/demo-terms"; // ★夜間便 N5（裁定293-7）: 入場前の規約＋同意チェック（未同意は入場不可）

// ★夜間便 N7-3（裁定273／277・2026-09-18）: 公開デモの入口＝業態 4 × 役割 3 のボタン（noindex）。
//   押すと POST /api/demo/enter（業態・役割）→ サーバが magiclink を生成して検証し cookie を載せ、役割の初期画面へ redirect。
//   ここには資格情報もリンクも置かない（env DEMO_USERS の対応表はサーバだけが読む）。env が無ければ route が 503「デモは準備中です」。
export const metadata: Metadata = {
  title: "NOX デモ",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-static";

const BIZ: DemoBiz[] = [
  { key: "cabaret", label: "キャバクラ", desc: "指名・同伴・セット料金・時間延長" },
  { key: "girlsbar", label: "ガールズバー", desc: "カウンター・チャージ・ドリンクバック" },
  { key: "snack", label: "スナック", desc: "ボトルキープ・つまみ・売掛" },
  { key: "lounge", label: "ラウンジ", desc: "VIP・サービス料・会員" },
];
const ROLES: DemoRole[] = [
  { key: "owner", label: "オーナー", desc: "すべての画面・設定・給与" },
  { key: "manager", label: "店長", desc: "レジ・シフト・日報・キャスト" },
  { key: "cast", label: "キャスト", desc: "マイページ・希望シフト・ランキング" },
];

export default function DemoPage() {
  return (
    <div className="nox-dark" style={t.appBg}>
      <div style={{ ...t.wrap, maxWidth: 760, margin: "0 auto", padding: "28px 16px" }}>
        <header style={{ marginBottom: 18 }}>
          <span style={t.brand}>NOX</span>
          <h1 style={{ ...t.pheadH1, marginTop: 8 }}>デモを試す</h1>
          <p style={t.pheadP}>業態と役割を選ぶと、そのままログインした状態で画面が開きます。デモの入力内容は他の閲覧者にも見え、毎朝 5 時に初期化されます。個人情報は入力しないでください。</p>
        </header>
        {/* ★N5（裁定293-7）: 規約 5 項＋「同意する」→ 入場ボタン（form POST /api/demo/enter は不変・未同意は disabled） */}
        <DemoEntry biz={BIZ} roles={ROLES} />
        <p style={{ fontSize: 11, color: "var(--v2-muted)", marginTop: 10, lineHeight: 1.7 }}>
          デモ環境では、ご契約（お支払い）・招待・スタッフ作成・メール変更・写真のアップロード・キオスク発行・印刷はできません。
        </p>
      </div>
    </div>
  );
}
