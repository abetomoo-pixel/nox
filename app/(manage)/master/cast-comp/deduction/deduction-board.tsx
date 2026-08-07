"use client";

// 控除・送りの設定（D2-3・モック deduction.html 準拠の実ページ化）。
//   ① 控除ルール一覧（deductions・manager 以上）＝旧 CompMaster「控除」タブ
//   ② 送り・前借り・送り実費（okuri_mode/okuri_base・adv_*・transport_*）＝既存 DeductionPanel 移設
//   ③ 注意事項＝モックの静的文言のみ移植（★「変更履歴」セクションは実装しない＝裁定6。
//     履歴の実体は audit_logs（owner 限定）にあり、専用 UI は作らない）
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import DeductionPanel from "../../deduction-panel";
import { DeductionTab, useCompData, secTitle } from "../comp-sections";

const card: React.CSSProperties = t.card;

export default function DeductionBoard({ storeId, isManagerUp, isOwner, casts, okuriMode, okuriBase }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean;
  casts: { id: string; name: string }[];
  okuriMode: "flat" | "actual"; okuriBase: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);

  return (
    <div>
      <Toast msg={msg} />

      {/* ① 固定控除の種別（deductions・per=day/month/rate） */}
      <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>控除ルール一覧</h2>
        <DeductionTab deductions={data.deductions} isManagerUp={isManagerUp} storeId={storeId}
          setMsg={setMsg} reload={data.reload} />
      </section>

      {/* ② 送り設定・前借り・送り実費（既存パネル移設＝RPC/引数 不変） */}
      <DeductionPanel
        storeId={storeId}
        casts={casts}
        isOwner={isOwner}
        initialOkuriMode={okuriMode}
        initialOkuriBase={okuriBase}
      />

      {/* ③ 注意事項（モックの静的文言のみ・変更履歴セクションは作らない） */}
      <section className="nox-cardtop" style={{ ...card, marginTop: 14 }}>
        <h2 style={secTitle}>注意事項</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: 0, lineHeight: 1.8 }}>
          変更後は給与計算プレビューで内容を確認してください。控除・送りの変更は次回の給与計算から
          反映されます（確定済みの給与には遡及しません）。設定の変更操作は監査ログに記録されます。
        </p>
      </section>
    </div>
  );
}
