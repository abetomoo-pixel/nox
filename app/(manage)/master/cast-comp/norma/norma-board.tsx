"use client";

// ノルマ設定（D2-2・モック norma.html 準拠の実ページ化＝3実体の統合）。
//   ① 店の採用フラグ（stores.settings_json・owner 限定）＝NormConfigPanel 移設
//   ② キャスト別目標（cast_norms・manager 以上）＝旧 CompMaster「ノルマ」タブ
//   ③ 遅刻・当欠の検知（penalty_config・owner 限定）＝旧 CompMaster「罰金・閾値」タブ
// ★権限ゲートはセクション別に現行踏襲（①③=owner・②=manager 以上＝各部品内の出し分けのまま）。
// ★モックの「達成率別の処理」「達成ボーナス」は実装しない（DB 新設＝post-launch 送り・裁定）。
//   「準備中」表示も出さない＝無いものは画面に出さない。送り理由は docs/NOX_D2残差リスト.md。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import NormConfigPanel from "../../norm-config-panel";
import { NormTab, PenaltyTab, useCompData, secTitle } from "../comp-sections";
import { isSectionOn, type StoreSettings } from "@/lib/nox/store-systems"; // ★裁定269: 使う制度の出し分け

const card: React.CSSProperties = t.card;

export default function NormaBoard({ storeId, isManagerUp, isOwner, flags, settings }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean;
  settings?: StoreSettings; // ★裁定269
  flags: { salesEnabled: boolean; shimeiEnabled: boolean; shimeiScope: "hon" | "hon_jonai" };
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);

  return (
    <div>
      <Toast msg={msg} />

      {/* ① 店として採用する軸（settings_json・owner のみ切替＝panel 内で出し分け） */}
      {isSectionOn(settings, "normConfigPanel") && (<NormConfigPanel
        storeId={storeId}
        isOwner={isOwner}
        initialSalesEnabled={flags.salesEnabled}
        initialShimeiEnabled={flags.shimeiEnabled}
        initialShimeiScope={flags.shimeiScope}
      />)}{/* ★裁定269-4: normConfigPanel */}

      {/* ② キャスト別の目標（cast_norms・manager 以上） */}
      {isSectionOn(settings, "compNormTab") && (<section className="nox-cardtop" style={{ ...card, margin: "14px 0" }}>{/* ★裁定269-4: compNormTab */}
        <h2 style={secTitle}>キャスト別ノルマ目標</h2>
        <NormTab casts={data.casts} norms={data.norms} isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} />
      </section>)}

      {/* ③ 未達成時のペナルティ（penalty_config・owner のみ編集） */}
      {isSectionOn(settings, "compPenaltyTab") && (<section className="nox-cardtop" style={card}>{/* ★裁定269-4: compPenaltyTab */}
        <h2 style={secTitle}>遅刻・当欠の検知（閾値）</h2>{/* ★0154 D3（裁定293-3）: 罰金の自動計算は撤去＝閾値は検知として残す・減額は精算調整 */}
        <PenaltyTab penalty={data.penalty} setPenalty={data.setPenalty} exists={data.penaltyExists}
          isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={data.reload} />
      </section>)}
    </div>
  );
}
