"use client";

// キャスト管理ボード（F3d 体入採用 UI・モック「体入・採用管理」＋「新規キャスト登録」準拠）。
// 操作は全て RPC 経由＝trial_register/trial_update/trial_hire/trial_reject／cast_create。
// 真の防御は trials RLS（owner/manager 限定）＋各 RPC ゲート（UI は操作面）。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhotos, uploadCastPhoto } from "@/lib/nox/cast-photo";
import type { Trial, CastLogin } from "./page";

type Store = { id: string; name: string };

type InviteResult = { login_email: string; initial_password: string | null };

// 書類4種の正本キー（mig0040 の documents jsonb と共有）。
const DOC_KEYS = [
  { key: "id_doc", label: "身分証（年齢確認・風営法）" },
  { key: "contract", label: "雇用契約書" },
  { key: "pledge", label: "誓約書" },
  { key: "bank", label: "振込口座" },
] as const;
const TIERS = ["エース", "人気", "レギュラー", "体入"] as const;
// 段C2: 「出勤した日」の集合＝出勤板（shift-board）/ホームと同一定義（新しい判定を作らない）。
const PRESENT = new Set(["shukkin", "dohan", "late"]);

const card: React.CSSProperties = t.card;
const h2: React.CSSProperties = { ...t.pheadH1, fontSize: 16 };
const h3: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", marginTop: 0, marginBottom: 8 };
const secTitle: React.CSSProperties = t.cardTitle;
const btnGold: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnGhost: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sub)" };
// 招待モーダル（staff-board の追加モーダル雛形）

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
  isOwner, stores, myStoreId, initialTrials, initialLoginCasts,
}: {
  isOwner: boolean; stores: Store[]; myStoreId: string; initialTrials: Trial[]; initialLoginCasts: CastLogin[];
}) {
  const supabase = createClient();
  const [trials, setTrials] = useState<Trial[]>(initialTrials);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // F3g' castログイン招待（mig0041）: 招待/PW再発行モーダル
  const [loginCasts, setLoginCasts] = useState<CastLogin[]>(initialLoginCasts);
  const [invTarget, setInvTarget] = useState<CastLogin | null>(null);
  const [invMode, setInvMode] = useState<"invite" | "reset">("invite");
  const [invEmail, setInvEmail] = useState("");
  const [invIdemKey, setInvIdemKey] = useState("");
  const [invErr, setInvErr] = useState<string | null>(null);
  const [invResult, setInvResult] = useState<InviteResult | null>(null);
  const [invCopied, setInvCopied] = useState(false);

  // F4a キオスク打刻 PIN（mig0043 set_cast_pin・owner/manager 自店・4桁）
  const [pinTarget, setPinTarget] = useState<CastLogin | null>(null);
  const [pinVal, setPinVal] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinDone, setPinDone] = useState(false);

  // ── 段P キャスト写真（mig0064/0065＋Storage ポリシー3本）──
  //   実体は private バケット cast-photos の {org_id}/{cast_id}.jpg 固定（1キャスト1ファイル・上書き運用）。
  //   ここは操作面。真の防御は Storage ポリシー（owner ∨ manager∧自店 ∨ 本人）と
  //   set_cast_photo_updated_at の同一 authz＝UI を通さない直叩きでも他店の子は差し替えられない。
  const [orgId, setOrgId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [phTarget, setPhTarget] = useState<CastLogin | null>(null);
  const [phFile, setPhFile] = useState<File | null>(null);
  const [phPreview, setPhPreview] = useState<string | null>(null);
  const [phErr, setPhErr] = useState<string | null>(null);

  // ── 段C2（キャスト刷新・正本 nox-casts-redesign-mock-v1.html）──
  //   テーブル→カードグリッド＋詳細3タブ。フィルタ/検索/月次2数値はすべて既存データの client 再形。
  //   ★機微情報（本名・生年月日・マイナンバー等）はこの画面に持ち込まない＝現行の分離設計を維持。
  const [filter, setFilter] = useState<"active" | "trial" | "left">("active");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ kind: "cast" | "trial"; id: string } | null>(null);
  const [dtab, setDtab] = useState<"basic" | "comp" | "account">("basic");
  const [showAdd, setShowAdd] = useState(false);
  // 月次2数値（相談役メモ②）＝現物確認の結果★どちらも新規 RPC なしで取れる:
  //   今月指名＝既存 get_cast_ranking（cast_id 付きで hon/jonai/dohan を返す・dashboard と同じ呼び方）
  //   今月出勤＝attendance を月範囲で引いて cast_id 別に数える（(cast_id,date) UNIQUE ゆえ行数＝日数）
  const [rankOf, setRankOf] = useState<Record<string, { hon: number; jonai: number; dohan: number }>>({});
  const [attDaysOf, setAttDaysOf] = useState<Record<string, number>>({});
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => { void resolveOrgId(supabase).then(setOrgId); }, [supabase]);

  const loadStats = useCallback(async () => {
    const storeId = myStoreId || stores[0]?.id || "";
    if (storeId) {
      const { data: rk } = await supabase.rpc("get_cast_ranking", { p_store_id: storeId, p_period: month });
      const m: Record<string, { hon: number; jonai: number; dohan: number }> = {};
      for (const r of (rk ?? []) as Record<string, unknown>[]) {
        m[r.cast_id as string] = { hon: (r.hon_count as number) ?? 0, jonai: (r.jonai_count as number) ?? 0, dohan: (r.dohan_count as number) ?? 0 };
      }
      setRankOf(m);
    }
    // 出勤日数＝出勤/同伴/遅刻を「出勤した日」とみなす（出勤板 shift-board / home と同じ PRESENT 集合）
    const { data: at } = await supabase
      .from("attendance").select("cast_id, status").gte("date", `${month}-01`).lte("date", `${month}-31`);
    const d: Record<string, number> = {};
    for (const r of (at ?? []) as Record<string, unknown>[]) {
      if (PRESENT.has(r.status as string)) d[r.cast_id as string] = (d[r.cast_id as string] ?? 0) + 1;
    }
    setAttDaysOf(d);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, myStoreId, stores]);
  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    void signCastPhotos(supabase, orgId, loginCasts).then((m) => { if (alive) setPhotoUrls(m); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, loginCasts]);

  function openPhoto(c: CastLogin) {
    setPhTarget(c); setPhFile(null); setPhErr(null);
    setPhPreview(null);
  }
  function closePhoto() {
    if (phPreview) URL.revokeObjectURL(phPreview);
    setPhTarget(null); setPhFile(null); setPhPreview(null); setPhErr(null);
  }
  function pickPhoto(f: File | null) {
    if (phPreview) URL.revokeObjectURL(phPreview);
    setPhFile(f);
    setPhPreview(f ? URL.createObjectURL(f) : null);
    setPhErr(null);
  }
  async function submitPhoto() {
    if (!phTarget || !phFile || !orgId) return;
    setBusy(true); setPhErr(null);
    try {
      await uploadCastPhoto(supabase, orgId, phTarget.id, phFile);
      await reloadLoginCasts(); // photo_updated_at を取り直す＝署名 URL も新しい v= で張り直る
      setMsg("写真を保存しました");
      closePhoto();
    } catch (e) {
      setPhErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin() {
    if (!pinTarget) return;
    if (!/^[0-9]{4}$/.test(pinVal)) { setPinErr("PIN は数字4桁で入力してください"); return; }
    setBusy(true); setPinErr(null);
    const { error } = await supabase.rpc("set_cast_pin", { p_cast_id: pinTarget.id, p_pin: pinVal });
    setBusy(false);
    if (error) setPinErr(error.message);
    else setPinDone(true); // PIN 自体は再表示しない（DB は bcrypt のみ・audit にも非搭載）
  }

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

  // ── mig0074 入退店（cast_leave / cast_rejoin・owner∨manager自店＝RPC 側が最終防御）──
  //   本ページは page.tsx が owner/manager 以外を redirect 済み＝ボタンの出し分けは role ではなく状態で行う。
  const LEAVE_MSG: Record<string, string> = {
    "already inactive": "このキャストはすでに退店済みです。",
    "already active": "このキャストはすでに在籍中です。",
    "already active elsewhere": "同じユーザーの在籍キャストが既に存在します。",
    "not found": "対象のキャストが見つかりません。",
    forbidden: "この操作を行う権限がありません。",
  };
  async function castLeaveRejoin(c: CastLogin, kind: "leave" | "rejoin") {
    const label = kind === "leave" ? "退店" : "復活";
    if (!confirm(kind === "leave"
      ? `${c.name} を退店にします。よろしいですか？（本人のログインとキオスク打刻ができなくなります）`
      : `${c.name} を復活（在籍に戻す）します。よろしいですか？`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc(kind === "leave" ? "cast_leave" : "cast_rejoin",
      kind === "leave" ? { p_cast_id: c.id, p_left_on: null } : { p_cast_id: c.id });
    const key = Object.keys(LEAVE_MSG).find((k) => (error?.message ?? "").includes(k));
    setMsg(error ? (key ? LEAVE_MSG[key] : `${label}に失敗: ${error.message}`) : `${label}しました`);
    setBusy(false);
    await reloadLoginCasts();
  }

  const docs = (tr: Trial) => tr.documents ?? {};
  const allDocs = (tr: Trial) => DOC_KEYS.every((d) => docs(tr)[d.key] === true);

  // ── F3g' castログイン招待（招待=未結線 / PW再発行=結線済み・POST /api/cast/invite） ──
  const reloadLoginCasts = useCallback(async () => {
    // mig0074: left_on を含め、page.tsx と同一の取得にする（.eq(is_active,true) を外す＝段C2 の在籍/退店タブ前提）。
    const { data } = await supabase.from("casts").select("id, name, user_id, photo_updated_at, is_active, store_id, left_on").order("name");
    setLoginCasts((data ?? []) as CastLogin[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openInvite(c: CastLogin, mode: "invite" | "reset") {
    setInvTarget(c); setInvMode(mode); setInvEmail(""); setInvErr(null); setInvResult(null); setInvCopied(false);
    setInvIdemKey(crypto.randomUUID()); // 送信意図ごとに1つ＝リトライは同キー（route が二重作成を止める）
  }

  async function submitInvite() {
    if (!invTarget) return;
    setBusy(true); setInvErr(null);
    try {
      const res = await fetch("/api/cast/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          castId: invTarget.id,
          action: invMode,
          email: invMode === "invite" && invEmail.trim() ? invEmail.trim() : undefined, // 空なら送らない＝合成 email を route が自動発行
          idemKey: invMode === "invite" ? invIdemKey : undefined,
        }),
      });
      const body = (await res.json()) as InviteResult & { error?: string };
      if (!res.ok) setInvErr(body.error ?? `失敗しました（${res.status}）`);
      else { setInvResult(body); await reloadLoginCasts(); }
    } catch (e) {
      setInvErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!invResult?.initial_password) return;
    await navigator.clipboard.writeText(`${invResult.login_email}\n${invResult.initial_password}`);
    setInvCopied(true);
  }

  async function toggleDoc(tr: Trial, key: string) {
    const next = { id_doc: false, contract: false, pledge: false, bank: false, ...docs(tr), [key]: !docs(tr)[key] };
    await rpc("書類を更新", "trial_update", { p_trial_id: tr.id, p_documents: next });
  }
  async function setRating(tr: Trial, r: number) {
    await rpc("評価を更新", "trial_update", { p_trial_id: tr.id, p_rating: r });
  }

  // ── 段C2 派生値（すべて既存データの client 再形＝新規取得なし）──
  const hit = (name: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
  const shownCasts = loginCasts.filter((c) => c.is_active === (filter === "active") && hit(c.name));
  const shownTrials = trials.filter((tr) => hit(tr.name));
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "—";
  const nomTotal = (id: string) => { const r = rankOf[id]; return r ? r.hon + r.jonai + r.dohan : 0; };
  const selCast = sel?.kind === "cast" ? loginCasts.find((c) => c.id === sel.id) ?? null : null;
  const selTrial = sel?.kind === "trial" ? trials.find((tr) => tr.id === sel.id) ?? null : null;

  return (
    <div>
      {/* 段0R 第1陣: モック .head を新シェルの nox-hero へ（/master・/home と同基準） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>キャスト</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            在籍キャストと体入の管理。カードを選ぶと詳細（基本／待遇・バック／アカウント）が開きます。
          </p>
        </div>
      </div>
      <Toast msg={msg} />

      {/* ツールバー＝検索＋在籍/体入/退店済み（既存 is_active と trials の再形・新規取得なし） */}
      <div className="nox-ctoolbar">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索"
          style={{ ...input, width: 200 }} aria-label="名前で検索"
        />
        <div className="nox-seg">
          {([["active", "在籍"], ["trial", "体入"], ["left", "退店済み"]] as const).map(([k, label]) => (
            <button key={k} className={filter === k ? "on" : ""}
              onClick={() => { setFilter(k); setSel(null); }}>{label}</button>
          ))}
        </div>
        <button style={{ ...btnGold, marginLeft: "auto" }} onClick={() => setShowAdd((v) => !v)}>
          ＋ {filter === "trial" ? "体入を追加" : "キャスト登録"}
        </button>
      </div>

      {/* 登録フォーム（トグル）＝送る RPC も引数も現行のまま（体入=trial_register／本登録=cast_create） */}
      {showAdd && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>{filter === "trial" ? "体入を追加" : "新規キャスト登録"}</h2>
          <p style={{ ...t.sub, margin: "0 0 10px" }}>
            {filter === "trial"
              ? "体入として登録します（本採用でキャストに登録されます）。"
              : "体入を経ずに直接登録します（実績はゼロから）。"}
          </p>
          <RegisterForm
            key={filter} stores={stores} isOwner={isOwner} myStoreId={myStoreId} busy={busy}
            withTrialFields={filter === "trial"}
            onSubmit={(a) => filter === "trial"
              ? rpc("体入を登録", "trial_register", a)
              : rpc("キャストを登録", "cast_create", a)}
          />
        </section>
      )}

      {/* カードグリッド（モック .cards）＝写真・名前・状態・月次2数値だけ。機微情報は出さない。 */}
      {filter === "trial" ? (
        <div className="nox-cardgrid">
          {shownTrials.length === 0 && <p style={{ ...t.sub, margin: 0 }}>体入中のキャストはいません。</p>}
          {shownTrials.map((tr) => (
            <button key={tr.id} className={`nox-ccard ${sel?.kind === "trial" && sel.id === tr.id ? "sel" : ""}`}
              onClick={() => { setSel({ kind: "trial", id: tr.id }); setDtab("basic"); }}>
              <span className="nox-ctag">体入</span>
              <div className="chead">
                {/* ★体入は写真なし固定＝trials に casts 行がまだ無い（写真パスは cast_id 由来）。 */}
                <CastAvatar name={tr.name} size={44} />
                <div>
                  <div className="cname">{tr.name}</div>
                  <div className="csub">体入 {tr.trial_date ?? "—"}</div>
                </div>
              </div>
              <div className="cstats">
                <div className="cstat"><div className="l">書類</div><div className="v">{allDocs(tr) ? "完了" : "未完了"}</div></div>
                <div className="cstat"><div className="l">評価</div><div className="v num">{tr.rating ? `★${tr.rating}` : "—"}</div></div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="nox-cardgrid">
          {shownCasts.length === 0 && (
            <p style={{ ...t.sub, margin: 0 }}>
              {filter === "active" ? "在籍キャストがいません。" : "退店済みのキャストはいません。"}
            </p>
          )}
          {shownCasts.map((c) => (
            <button key={c.id} className={`nox-ccard ${sel?.kind === "cast" && sel.id === c.id ? "sel" : ""}`}
              onClick={() => { setSel({ kind: "cast", id: c.id }); setDtab("basic"); }}>
              {!c.is_active && <span className="nox-ctag off">{c.left_on ? `退店 ${c.left_on}` : "退店"}</span>}
              <div className="chead">
                <CastAvatar name={c.name} url={photoUrls.get(c.id)} size={44} />
                <div>
                  <div className="cname">{c.name}</div>
                  <div className="csub">{c.is_active ? "在籍" : "退店"} / {c.user_id ? "ログイン済み" : "未招待"}</div>
                </div>
              </div>
              <div className="cstats">
                <div className="cstat"><div className="l">今月指名</div><div className="v num">{nomTotal(c.id)}件</div></div>
                <div className="cstat"><div className="l">今月出勤</div><div className="v num">{attDaysOf[c.id] ?? 0}日</div></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── 詳細（カード選択で開く）＝現行の編集・招待・PW再発行・体入採否を3タブへ再配置 ── */}
      {selCast && (
        <section className="nox-cardtop" style={card}>
          <div className="nox-cdrawer">
            <div style={{ textAlign: "center" }}>
              <CastAvatar name={selCast.name} url={photoUrls.get(selCast.id)} size={64} />
              {/* 段P 実装済みの写真変更を流用（送る RPC も同じ） */}
              {/* モック .photoedit＝点線チップ（送る RPC は段P の openPhoto のまま） */}
              <button className="nox-photoedit" disabled={busy || !orgId} onClick={() => openPhoto(selCast)}>
                写真を変更
              </button>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--v2-text)" }}>{selCast.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
                {selCast.is_active ? "在籍" : "退店"} / {selCast.user_id ? "ログイン済み" : "未招待"}
              </div>
            </div>
            <button style={{ ...btnGhost, marginLeft: "auto" }} onClick={() => setSel(null)}>閉じる</button>
          </div>

          <div className="nox-dtabs">
            {([["basic", "基本"], ["comp", "待遇・バック"], ["account", "アカウント"]] as const).map(([k, label]) => (
              <button key={k} className={dtab === k ? "on" : ""} onClick={() => setDtab(k)}>{label}</button>
            ))}
          </div>

          {dtab === "basic" && (
            <>
              <div className="nox-frow"><span className="k">源氏名</span><span className="v">{selCast.name}</span></div>
              <div className="nox-frow"><span className="k">所属店</span><span className="v">{storeName(selCast.store_id)}</span></div>
              <div className="nox-frow">
                <span className="k">状態</span>
                <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{selCast.is_active ? "在籍" : selCast.left_on ? `退店（${selCast.left_on}）` : "退店"}</span>
                  {selCast.is_active
                    ? <button style={btnGhost} disabled={busy} onClick={() => void castLeaveRejoin(selCast, "leave")}>退店</button>
                    : <button style={btnGhost} disabled={busy} onClick={() => void castLeaveRejoin(selCast, "rejoin")}>復活</button>}
                </span>
              </div>
              <div className="nox-frow">
                <span className="k">今月指名</span>
                <span className="v num">
                  {nomTotal(selCast.id)}件
                  <span style={{ fontSize: 11, color: "var(--v2-muted)", marginLeft: 6 }}>
                    本{rankOf[selCast.id]?.hon ?? 0}・場内{rankOf[selCast.id]?.jonai ?? 0}・同伴{rankOf[selCast.id]?.dohan ?? 0}
                  </span>
                </span>
              </div>
              <div className="nox-frow"><span className="k">今月出勤</span><span className="v num">{attDaysOf[selCast.id] ?? 0}日</span></div>
              {/* ★機微情報の分離を明示（モックの .lockrow 逐語）＝この画面には出さない */}
              <div className="nox-lockrow">
                本名・生年月日・マイナンバー等の機微情報は「機密・税務情報」（owner/manager 限定・閲覧ログ記録）でのみ扱います。この画面には表示しません。
              </div>
            </>
          )}

          {dtab === "comp" && (
            <>
              {/* ★待遇プランの編集経路は現行この画面に存在しない（マスタ側）。
                  新規 RPC も新規フォームも作らず、管理場所への案内だけを置く＝機能不変。 */}
              <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: "0 0 10px", lineHeight: 1.8 }}>
                待遇プラン（保証時給・スライド・指名バック単価）とキャストへの割当は<strong style={{ color: "var(--v2-text)" }}>マスタ</strong>で管理します。
                この画面からは変更できません（現行どおり）。
              </p>
              <Link href="/master" style={{ ...btnGhost, display: "inline-block", textDecoration: "none" }}>マスタへ</Link>
            </>
          )}

          {dtab === "account" && (
            <>
              <div className="nox-frow">
                <span className="k">ログイン（マイページ）</span>
                <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: selCast.user_id ? "var(--ok)" : "var(--v2-muted)" }}>
                    {selCast.user_id ? "招待済み" : "未招待"}
                  </span>
                  {selCast.user_id
                    ? <button style={btnGhost} disabled={busy} onClick={() => openInvite(selCast, "reset")}>PW再発行</button>
                    : <button style={btnGold} disabled={busy} onClick={() => openInvite(selCast, "invite")}>招待</button>}
                </span>
              </div>
              <div className="nox-frow">
                <span className="k">キオスク打刻 PIN</span>
                <span className="v">
                  {/* F4a: 打刻 PIN（ログイン結線と独立＝招待していない子も打刻できる） */}
                  <button style={btnGhost} disabled={busy}
                    onClick={() => { setPinTarget(selCast); setPinVal(""); setPinErr(null); setPinDone(false); }}>
                    打刻PIN を設定
                  </button>
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
                招待するとマイページ（出勤・報酬の確認）が使えます。PIN はキオスク端末での打刻に使い、画面にも記録にも残りません。
              </p>
            </>
          )}
        </section>
      )}

      {/* 体入の詳細＝評価・書類・メモ・採否（現行 UI をそのまま移設＝送る RPC も引数も不変） */}
      {selTrial && (
        <section className="nox-cardtop" style={card}>
          <div className="nox-cdrawer">
            <CastAvatar name={selTrial.name} size={64} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--v2-text)" }}>{selTrial.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--v2-muted)" }}>
                体入 {selTrial.trial_date ?? "—"}・{selTrial.tier ?? "—"}・{ageOf(selTrial.birthday)}
              </div>
            </div>
            <button style={{ ...btnGhost, marginLeft: "auto" }} onClick={() => setSel(null)}>閉じる</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>評価</span>
            {[1, 2, 3, 4, 5].map((r) => (
              <button key={r} disabled={busy} onClick={() => void setRating(selTrial, r)}
                style={{ ...btnGhost, padding: "2px 8px", color: (selTrial.rating ?? 0) >= r ? "var(--gold)" : "var(--v2-muted)" }}>
                ★
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            {DOC_KEYS.map((d) => (
              <label key={d.key} style={{ ...lbl, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={docs(selTrial)[d.key] === true} disabled={busy}
                  onChange={() => void toggleDoc(selTrial, d.key)} style={{ accentColor: "#C9A24A", cursor: "pointer" }} />
                {d.label}
              </label>
            ))}
          </div>

          <MemoField tr={selTrial} busy={busy} onSave={(m) => rpc("メモを更新", "trial_update", { p_trial_id: selTrial.id, p_memo: m })} />

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button style={btnGold} disabled={busy || !allDocs(selTrial)} onClick={async () => {
              if (!confirm(`${selTrial.name} を本採用しますか？（キャストに登録され、実績ゼロから開始します）`)) return;
              if (await rpc("本採用", "trial_hire", { p_trial_id: selTrial.id })) { setSel(null); await reloadLoginCasts(); }
            }}>本採用</button>
            <button style={{ ...btnGhost, color: "var(--bad)", borderColor: "#5A2E2E" }} disabled={busy} onClick={async () => {
              if (!confirm(`${selTrial.name} を見送りますか？`)) return;
              if (await rpc("見送り", "trial_reject", { p_trial_id: selTrial.id })) setSel(null);
            }}>見送り</button>
            {!allDocs(selTrial) && <span style={{ ...t.sub }}>本採用には全書類のチェックが必要です。</span>}
          </div>
        </section>
      )}

      {/* 招待/PW再発行モーダル（staff-board の追加モーダル雛形・PW は一度だけ表示） */}
      {invTarget && (
        <Modal onClose={() => !busy && !invResult && setInvTarget(null)}>
            {!invResult ? (
              <>
                <h2 style={secTitle}>{invMode === "invite" ? `${invTarget.name} を招待` : `${invTarget.name} のパスワード再発行`}</h2>
                {invMode === "invite" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={t.fieldLabel}>メールアドレス（任意）</span>
                      <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} style={t.input}
                        placeholder="未入力なら自動でログインIDを発行" type="email" />
                    </label>
                    <p style={{ ...t.sub, margin: 0 }}>発行した初期パスワードは次の画面で一度だけ表示されます。</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                    新しいパスワードを発行します（現在のパスワードは使えなくなります）。新パスワードは次の画面で一度だけ表示されます。
                  </p>
                )}
                {invErr && <p style={{ ...t.bad, fontSize: 12.5, margin: "8px 0 0" }}>{invErr}</p>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                  <button style={btnGhost} disabled={busy} onClick={() => setInvTarget(null)}>キャンセル</button>
                  <button style={btnGold} disabled={busy} onClick={() => void submitInvite()}>
                    {busy ? "処理中…" : invMode === "invite" ? "招待する" : "再発行する"}
                  </button>
                </div>
              </>
            ) : invResult.initial_password ? (
              <>
                <h2 style={secTitle}>{invMode === "invite" ? "招待しました" : "パスワードを再発行しました"}</h2>
                <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                  <div style={t.bdRow}><span style={t.bdKey}>ログインID</span><span style={{ ...t.bdVal, wordBreak: "break-all" }}>{invResult.login_email}</span></div>
                  <div style={t.bdRow}><span style={t.bdKey}>{invMode === "invite" ? "初期パスワード" : "新パスワード"}</span><span style={{ ...t.bdVal, color: "var(--champ)", letterSpacing: 1 }}>{invResult.initial_password}</span></div>
                </div>
                <p style={{ ...t.alert, marginBottom: 10 }}>このパスワードは再表示できません。キャストに安全に渡してください。</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnGhost} onClick={() => void copyInvite()}>{invCopied ? "コピーしました ✓" : "ID とパスワードをコピー"}</button>
                  <button style={btnGold} onClick={() => setInvTarget(null)}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>既存アカウントに結線しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {invResult.login_email} は登録済みのため、既存のログイン情報のまま結線しました（パスワードの再発行はありません）。
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnGold} onClick={() => setInvTarget(null)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* F4a 打刻PIN 設定モーダル（set_cast_pin＝owner/manager 自店・4桁・上書きでロック解除） */}
      {pinTarget && (
        <Modal onClose={() => !busy && setPinTarget(null)}>
            {!pinDone ? (
              <>
                <h2 style={secTitle}>{pinTarget.name} の打刻PIN</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  キオスク端末（タブレット）で打刻するときの4桁の数字です。
                  設定し直すと失敗カウント・ロックもリセットされます。
                </p>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={t.fieldLabel}>PIN（数字4桁）</span>
                  <input value={pinVal} onChange={(e) => setPinVal(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                    inputMode="numeric" autoComplete="off" placeholder="0000"
                    style={{ ...t.input, width: 120, letterSpacing: 6, fontSize: 18, textAlign: "center" }} />
                </label>
                {pinErr && <p style={{ ...t.bad, fontSize: 12.5, margin: "8px 0 0" }}>{pinErr}</p>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                  <button style={btnGhost} disabled={busy} onClick={() => setPinTarget(null)}>キャンセル</button>
                  <button style={btnGold} disabled={busy || pinVal.length !== 4} onClick={() => void submitPin()}>
                    {busy ? "処理中…" : "設定する"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={secTitle}>PIN を設定しました</h2>
                <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
                  {pinTarget.name} さんに PIN を口頭で伝えてください（画面・記録には残りません）。
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnGold} onClick={() => setPinTarget(null)}>閉じる</button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* 段P: 写真アップロードモーダル（現在の写真→ファイル選択→プレビュー→保存。削除経路は持たない＝差し替えは上書き） */}
      {phTarget && (
        <Modal onClose={() => !busy && closePhoto()}>
          <h2 style={secTitle}>{phTarget.name} の写真</h2>
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 10px" }}>
            一覧やシフトのアバターに表示されます。自動で縮小・JPEG 化されます（元画像はそのままです）。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* 左＝現在（写真 or 頭文字）・右＝選択中プレビュー。選択前は現在のみ */}
            <CastAvatar name={phTarget.name} url={photoUrls.get(phTarget.id)} size={64} />
            {phPreview && (
              <>
                <span style={{ color: "var(--sub)", fontSize: 13 }} aria-hidden="true">→</span>
                <span className="nox-ava" style={{ width: 64, height: 64, overflow: "hidden", padding: 0, background: "var(--v2-ava)" }} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ローカル blob プレビュー */}
                  <img src={phPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </span>
              </>
            )}
          </div>
          <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
            <span style={t.fieldLabel}>画像を選択（JPEG/PNG）</span>
            <input type="file" accept="image/*" disabled={busy}
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
          </label>
          {phErr && <p style={{ ...t.bad, fontSize: 12.5, margin: "8px 0 0" }}>{phErr}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button style={btnGhost} disabled={busy} onClick={closePhoto}>キャンセル</button>
            <button style={btnGold} disabled={busy || !phFile} onClick={() => void submitPhoto()}>
              {busy ? "処理中…" : "保存する"}
            </button>
          </div>
        </Modal>
      )}
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
