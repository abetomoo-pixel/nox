"use client";
import Link from "next/link"; // ★便 X13-H H-15

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

      {/* ① 店として採用する軸（settings_json・owner のみ切替＝panel 内で出し分け） */}
      {/* ★便 X13-G W-13 ②: 節が全部隠れる店（ノルマ・罰金とも OFF）は空にせず案内 */}
      {!isSectionOn(settings, "normConfigPanel") && !isSectionOn(settings, "compNormTab") && !isSectionOn(settings, "compPenaltyTab") && (
        <section className="nox-cardtop" style={card} data-systems-off-note="1"><p style={{ fontSize: 13.5, margin: "0 0 10px", lineHeight: 1.8 }}>この店ではノルマ・精算調整の制度を使っていません。利用機能で ON にできます。</p><a href="/master/store-profile?tab=features" className="nox-rowbtn" data-open-features="1">利用機能を開く</a></section>
      )}
      {isSectionOn(settings, "normConfigPanel") && (<NormConfigPanel
        storeId={storeId}
        isOwner={isOwner}
        initialAxes={normAxesOf(settings)}
        initialShimeiScope={flags.shimeiScope}
        legacy={{ salesEnabled: flags.salesEnabled, shimeiEnabled: flags.shimeiEnabled }}
      />)}{/* ★裁定269-4: normConfigPanel ・★GV-2（0171・便 P171）: 採用を 4 軸（set_store_norm_axes）に */}

      {/* ② キャスト別の目標（cast_norms・manager 以上） */}
      {isSectionOn(settings, "compNormTab") && (<section className="nox-cardtop" style={{ ...card, margin: "14px 0" }}>{/* ★裁定269-4: compNormTab */}
        <h2 style={secTitle}>キャスト別ノルマ目標</h2>
        <NormTab casts={data.casts} norms={data.norms} isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} plans={data.plans} castPlans={data.castPlans} settings={settings} />{/* ★裁定347（0171）: 継承値の薄濃・採用軸 */}
      </section>)}

      {/* ③ 未達成時のペナルティ（penalty_config・owner のみ編集） */}
      {isSectionOn(settings, "compPenaltyTab") && (<section className="nox-cardtop" style={card}>{/* ★裁定269-4: compPenaltyTab */}
        <h2 style={secTitle}>遅刻・当欠の検知（閾値）</h2>
        <div data-penalty-link="1" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 10px" }}>{/* ★便 X13-H H-15 ①（裁定410）: 金額欄はここに作らない＝ひな形へ */}
          <span style={{ fontSize: 12.5, color: "var(--sub)", flex: "1 1 240px" }}>遅刻・当欠の罰金（委託キャスト）の既定額は「報酬制度 → 精算調整のひな形（委託）」で設定します</span>
          <Link href="/master/cast-comp/systems#settlement-presets" style={{ ...t.btnSecondary48, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>ひな形を開く</Link>
        </div>{/* ★0154 D3（裁定293-3）: 罰金の自動計算は撤去＝閾値は検知として残す・減額は精算調整 */}
        <PenaltyTab settings={settings} penalty={data.penalty} setPenalty={data.setPenalty} exists={data.penaltyExists}
          isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={data.reload} part="detect" />
      </section>)}
      {/* ★便 X13-I I-5（裁定410 追補）: ノルマ未達の減額＝独立パネル（保存先・値は同じ penalty_config） */}
      {isSectionOn(settings, "compPenaltyTab") && (<section className="nox-cardtop" style={{ ...card, marginTop: 14 }} data-norm-penalty-panel="1">
        <h2 style={secTitle}>ノルマ未達の減額</h2>
        <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>給与の確定前に提案として出し、店が適用を選びます。委託キャストは精算調整、雇用キャストは懲戒減給（労基法 91 条の上限内・就業規則に定めがある店のみ）です。</p>
        <PenaltyTab settings={settings} penalty={data.penalty} setPenalty={data.setPenalty} exists={data.penaltyExists}
          isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={data.reload} part="norm" />
      </section>)}
    </div>
  );
}
