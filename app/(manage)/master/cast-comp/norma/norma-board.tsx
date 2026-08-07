"use client";

// ノルマ設定（D2-2・モック norma.html 準拠の実ページ化＝3実体の統合）。
//   ① 店の採用フラグ（stores.settings_json・owner 限定）＝NormConfigPanel 移設
//   ② キャスト別目標（cast_norms・manager 以上）＝旧 CompMaster「ノルマ」タブ
//   ③ 未達ペナルティ（penalty_config・owner 限定）＝旧 CompMaster「罰金・閾値」タブ
// ★権限ゲートはセクション別に現行踏襲（①③=owner・②=manager 以上＝各部品内の出し分けのまま）。
// ★モックの「達成率別の処理」「達成ボーナス」は実装しない（DB 新設＝post-launch 送り・裁定）。
//   「準備中」表示も出さない＝無いものは画面に出さない。送り理由は docs/NOX_D2残差リスト.md。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import NormConfigPanel from "../../norm-config-panel";
import { NormTab, PenaltyTab, useCompData, secTitle } from "../comp-sections";

const card: React.CSSProperties = t.card;

export default function NormaBoard({ storeId, isManagerUp, isOwner, flags }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean;
  flags: { salesEnabled: boolean; shimeiEnabled: boolean; shimeiScope: "hon" | "hon_jonai" };
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);

  return (
    <div>
      <Toast msg={msg} />

      {/* ① 店として採用する軸（settings_json・owner のみ切替＝panel 内で出し分け） */}
      <NormConfigPanel
        storeId={storeId}
        isOwner={isOwner}
        initialSalesEnabled={flags.salesEnabled}
        initialShimeiEnabled={flags.shimeiEnabled}
        initialShimeiScope={flags.shimeiScope}
      />

      {/* ② キャスト別の目標（cast_norms・manager 以上） */}
      <section className="nox-cardtop" style={{ ...card, margin: "14px 0" }}>
        <h2 style={secTitle}>キャスト別ノルマ目標</h2>
        <NormTab casts={data.casts} norms={data.norms} isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} />
      </section>

      {/* ③ 未達成時のペナルティ（penalty_config・owner のみ編集） */}
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>未達成時のペナルティ（罰金・閾値）</h2>
        <PenaltyTab penalty={data.penalty} setPenalty={data.setPenalty} exists={data.penaltyExists}
          isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={data.reload} />
      </section>
    </div>
  );
}
