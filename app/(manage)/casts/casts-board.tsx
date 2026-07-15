"use client";

// 女の子管理ボード（F3d 体入採用 UI・モック「体入・採用管理」＋「新規キャスト登録」準拠）。
// 操作は全て RPC 経由＝trial_register/trial_update/trial_hire/trial_reject／cast_create。
// 真の防御は trials RLS（owner/manager 限定）＋各 RPC ゲート（UI は操作面）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import type { Trial } from "./page";

type Store = { id: string; name: string };

// 書類4種の正本キー（mig0040 の documents jsonb と共有）。
const DOC_KEYS = [
  { key: "id_doc", label: "身分証（年齢確認・風営法）" },
  { key: "contract", label: "雇用契約書" },
  { key: "pledge", label: "誓約書" },
  { key: "bank", label: "振込口座" },
] as const;
const TIERS = ["エース", "人気", "レギュラー", "体入"] as const;

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };

function ageOf(birthday: string | null): string {
  if (!birthday) return "—";
  const b = new Date(birthday + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return `${a}歳`;
}

export default function CastsBoard({
  isOwner, stores, myStoreId, initialTrials,
}: {
  isOwner: boolean; stores: Store[]; myStoreId: string; initialTrials: Trial[];
}) {
  const supabase = createClient();
  const [trials, setTrials] = useState<Trial[]>(initialTrials);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("trials")
      .select("id, store_id, name, real_name, birthday, tier, rating, documents, memo, status, trial_date")
      .eq("status", "trial")
      .order("created_at", { ascending: false });
    setTrials((data ?? []) as Trial[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setTrials(initialTrials); }, [initialTrials]);

  async function rpc(label: string, fn: string, args: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(fn, args);
    setMsg(error ? `${label}に失敗: ${error.message}` : `${label}しました`);
    setBusy(false);
    await load();
    return !error;
  }

  const docs = (tr: Trial) => tr.documents ?? {};
  const allDocs = (tr: Trial) => DOC_KEYS.every((d) => docs(tr)[d.key] === true);

  async function toggleDoc(tr: Trial, key: string) {
    const next = { id_doc: false, contract: false, pledge: false, bank: false, ...docs(tr), [key]: !docs(tr)[key] };
    await rpc("書類を更新", "trial_update", { p_trial_id: tr.id, p_documents: next });
  }
  async function setRating(tr: Trial, r: number) {
    await rpc("評価を更新", "trial_update", { p_trial_id: tr.id, p_rating: r });
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={t.pheadH1}>女の子管理</h1>
      <p style={t.pheadP}>体入の評価・書類確認から本採用まで。本採用でキャストに登録されます（実績はゼロから）。</p>
      {msg && <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>}

      {/* 体入・採用管理 */}
      <section className="nox-cardtop" style={{ ...card, marginTop: 13 }}>
        <h2 style={secTitle}>体入・採用管理</h2>
        {trials.length === 0 && <p style={{ ...t.sub, margin: 0 }}>体入中のキャストはいません。</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {trials.map((tr) => (
            <div key={tr.id} style={{ ...t.card, marginBottom: 0, background: "var(--card2)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{tr.name}</strong>
                <span style={{ ...t.sub }}>体入中</span>
                <span style={{ ...t.sub, marginLeft: "auto" }}>
                  体入 {tr.trial_date ?? "—"}・{tr.tier ?? "—"}・{ageOf(tr.birthday)}
                </span>
              </div>

              {/* 評価（星） */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={lbl}>評価</span>
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r} disabled={busy} onClick={() => void setRating(tr, r)}
                    style={{ ...btnGhost, padding: "2px 8px", color: (tr.rating ?? 0) >= r ? "var(--champ)" : "var(--sub)" }}>
                    ★
                  </button>
                ))}
              </div>

              {/* 書類チェック */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                {DOC_KEYS.map((d) => (
                  <label key={d.key} style={{ ...lbl, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                    <input type="checkbox" checked={docs(tr)[d.key] === true} disabled={busy}
                      onChange={() => void toggleDoc(tr, d.key)} style={{ accentColor: "#C9A24A", cursor: "pointer" }} />
                    {d.label}
                  </label>
                ))}
              </div>

              {/* メモ */}
              <MemoField tr={tr} busy={busy} onSave={(m) => rpc("メモを更新", "trial_update", { p_trial_id: tr.id, p_memo: m })} />

              {/* 本採用 / 見送り */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <button style={btnGold} disabled={busy || !allDocs(tr)} onClick={async () => {
                  if (!confirm(`${tr.name} を本採用しますか？（キャストに登録され、実績ゼロから開始します）`)) return;
                  await rpc("本採用", "trial_hire", { p_trial_id: tr.id });
                }}>本採用</button>
                <button style={{ ...btnGhost, color: "var(--bad)", borderColor: "#5A2E2E" }} disabled={busy} onClick={async () => {
                  if (!confirm(`${tr.name} を見送りますか？`)) return;
                  await rpc("見送り", "trial_reject", { p_trial_id: tr.id });
                }}>見送り</button>
                {!allDocs(tr) && <span style={{ ...t.sub }}>本採用には全書類のチェックが必要です。</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 体入を追加 */}
        <div style={{ marginTop: 14 }}>
          <h3 style={h3}>体入を追加</h3>
          <RegisterForm
            stores={stores} isOwner={isOwner} myStoreId={myStoreId} busy={busy}
            withTrialFields
            onSubmit={(a) => rpc("体入を登録", "trial_register", a)}
          />
        </div>
      </section>

      {/* 新規キャスト登録（体入を経ず直接） */}
      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>新規キャスト登録</h2>
        <p style={{ ...t.sub, margin: "0 0 10px" }}>体入を経ずに直接登録します（実績はゼロから）。</p>
        <RegisterForm
          stores={stores} isOwner={isOwner} myStoreId={myStoreId} busy={busy}
          onSubmit={(a) => rpc("キャストを登録", "cast_create", a)}
        />
      </section>
    </div>
  );
}

function MemoField({ tr, busy, onSave }: { tr: Trial; busy: boolean; onSave: (m: string) => Promise<boolean> }) {
  const [memo, setMemo] = useState(tr.memo ?? "");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
      <span style={lbl}>メモ</span>
      <input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={busy}
        placeholder="評価・引き継ぎ等" style={{ ...input, width: 260 }} maxLength={500} />
      <button style={btnGhost} disabled={busy} onClick={() => void onSave(memo)}>保存</button>
    </div>
  );
}

// 体入登録（withTrialFields=true）と直接キャスト登録の共用フォーム。
function RegisterForm({
  stores, isOwner, myStoreId, busy, withTrialFields, onSubmit,
}: {
  stores: Store[]; isOwner: boolean; myStoreId: string; busy: boolean;
  withTrialFields?: boolean;
  onSubmit: (args: Record<string, unknown>) => Promise<boolean>;
}) {
  const [storeId, setStoreId] = useState(myStoreId || stores[0]?.id || "");
  const [name, setName] = useState("");
  const [realName, setRealName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [tier, setTier] = useState<string>("体入");
  const [trialDate, setTrialDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("源氏名を入力してください"); return; }
    if (!birthday) { setErr("生年月日を入力してください"); return; }
    setErr(null);
    const base: Record<string, unknown> = {
      p_store_id: isOwner ? storeId : myStoreId,
      p_name: name.trim(),
      p_birthday: birthday,
      p_real_name: realName.trim() || null,
    };
    const args = withTrialFields
      ? { ...base, p_tier: tier, p_trial_date: trialDate || null }
      : { ...base, p_kind: tier };
    const ok = await onSubmit(args);
    if (ok) { setName(""); setRealName(""); setBirthday(""); setTrialDate(""); setTier("体入"); }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      {isOwner && stores.length > 1 && (
        <label style={lbl}>配属店<br />
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={input}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label style={lbl}>源氏名（表に表示）<br />
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 130 }} maxLength={80} />
      </label>
      <label style={lbl}>本名（非表示）<br />
        <input value={realName} onChange={(e) => setRealName(e.target.value)} style={{ ...input, width: 130 }} maxLength={80} />
      </label>
      <label style={lbl}>生年月日<br />
        <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} style={input} />
      </label>
      <label style={lbl}>区分<br />
        <select value={tier} onChange={(e) => setTier(e.target.value)} style={input}>
          {TIERS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      {withTrialFields && (
        <label style={lbl}>体入日<br />
          <input type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} style={input} />
        </label>
      )}
      <button style={btnGold} disabled={busy} onClick={() => void submit()}>{withTrialFields ? "追加" : "登録する"}</button>
      {err && <span style={{ ...t.bad, fontSize: 12 }}>{err}</span>}
    </div>
  );
}
