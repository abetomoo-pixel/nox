"use client";

// ノルマ設定（D2-2・モック norma.html 準拠の実ページ化＝3実体の統合）。
//   ① 店の採用フラグ（stores.settings_json・owner 限定）＝NormConfigPanel 移設
//   ② キャスト別目標（cast_norms・manager 以上）＝旧 CompMaster「ノルマ」タブ
//   ③ 遅刻・当欠の検知（penalty_config・owner 限定）＝★便 NR-1 で控除・送りタブへ移設（罰金ひな形の案内の隣）
// ★権限ゲートはセクション別に現行踏襲（①③=owner・②=manager 以上＝各部品内の出し分けのまま）。
// ★モックの「達成率別の処理」「達成ボーナス」は実装しない（DB 新設＝post-launch 送り・裁定）。
//   「準備中」表示も出さない＝無いものは画面に出さない。送り理由は docs/NOX_D2残差リスト.md。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import NormAxesPenaltyPanel from "./norm-axes-penalty-panel"; // ★便 NR-1
import { InfoNote } from "@/components/ui/responsive-kit";
import { NormTab, useCompData, secTitle } from "../comp-sections";
import { isSectionOn, type StoreSettings } from "@/lib/nox/store-systems"; // ★裁定269: 使う制度の出し分け
import { normAxesOf } from "@/lib/nox/store/norm-axes"; // ★GV-2（0171）: ノルマの採用軸

const card: React.CSSProperties = t.card;

export default function NormaBoard({ storeId, isManagerUp, isOwner, flags, settings }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean;
  settings?: StoreSettings; // ★裁定269
  flags: { salesEnabled: boolean; shimeiEnabled: boolean; shimeiScope: "hon" | "hon_jonai" };
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId, setMsg); // ★裁定339: 一覧読取の error は赤帯（直前値は保持）

  return (
    <div>
      <Toast msg={msg} />

      {/* ★便 NR-1（裁定428 候補・2026-10-26）: パネル 1「軸と減額」＝採用する軸と同じ行に未達の減額（定額／不足 1 単位ごと）・保存 1 つ。
          遅刻・当欠の検知（閾値）は控除・送りタブへ移設（PenaltyTab part="detect"）。
          ★便 X13-G W-13 ②: 節が全部隠れる店（ノルマ・罰金とも OFF）は空にせず案内 */}
      {!isSectionOn(settings, "normConfigPanel") && !isSectionOn(settings, "compNormTab") && !isSectionOn(settings, "compPenaltyTab") && (
        <section className="nox-cardtop" style={card} data-systems-off-note="1"><p style={{ fontSize: 13.5, margin: "0 0 10px", lineHeight: 1.8 }}>この店ではノルマ・精算調整の制度を使っていません。利用機能で ON にできます。</p><a href="/master/store-profile?tab=features" className="nox-rowbtn" data-open-features="1">利用機能を開く</a></section>
      )}
      {(isSectionOn(settings, "normConfigPanel") || isSectionOn(settings, "compPenaltyTab")) && (<NormAxesPenaltyPanel
        storeId={storeId} isOwner={isOwner}
        initialAxes={normAxesOf(settings)} initialShimeiScope={flags.shimeiScope}
        penalty={data.penalty} setPenalty={data.setPenalty} exists={data.penaltyExists} setMsg={setMsg} reload={data.reload}
      />)}{/* ★裁定269-4: normConfigPanel／compPenaltyTab ・★GV-2（0171）: 採用 4 軸（set_store_norm_axes）・★裁定394／410 追補: 減額 4 軸（set_penalty_config） */}

      {/* パネル 2: キャスト別の目標（cast_norms・manager 以上）＝列は採用した軸だけ・まとめて入力も同じ列 */}
      {isSectionOn(settings, "compNormTab") && (<section className="nox-cardtop" style={{ ...card, margin: "14px 0" }} data-norm-panel="targets">{/* ★裁定269-4: compNormTab */}
        <h2 style={secTitle}>キャスト別の目標</h2>
        <InfoNote text="採用した軸の目標を 1 人ずつ、または選んだ人にまとめて入れます。空欄はプランの既定（薄い字）を使い、入れた値（濃い字）が優先されます。未達の減額は上の「軸と減額」で、給与では確定前の提案として出ます。" style={{ margin: "0 0 10px" }} />
        <NormTab casts={data.casts} norms={data.norms} isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} plans={data.plans} castPlans={data.castPlans} settings={settings} />{/* ★裁定347（0171）: 継承値＝プラン既定 */}
      </section>)}
    </div>
  );
}
