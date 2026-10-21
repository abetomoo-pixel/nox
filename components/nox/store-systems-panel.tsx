"use client";

// ★裁定269／270-2: 店舗の「使う制度」9 行のトグル＝マスタ「報酬制度」と初期設定 STEP 3 が同じ器で使う純部品。
//   props は settings（現値）・onChange（切替の依頼）・usage（制度ごとの使用中 cast 数）の 3 つだけ＝データ取得を中に持たない。
//   269-3: 使用中 n>0 の制度は OFF 不可（OFF ボタン disabled＋理由 1 行）。ON への切替は常に可。
//   切替 UI は store-flag-toggle（.nox-seg OFF／ON）の写経＝裁定244 の例外（中央化しない）。新トークン 0。
import { SYSTEM_DESCS, SYSTEM_KEYS, SYSTEM_LABELS, isSystemOn, REWARD_AXIS_KEYS, REWARD_AXIS_LABEL, rewardAxisOf, axisSlideKeyOf, rewardAxisPatchOf, axisSwitchLockOf, backsUsageOf, type RewardAxis, type StoreSettings, type SystemKey } from "@/lib/nox/store-systems";
import OnOffSeg from "@/components/ui/on-off"; // ★便 GV-C C-9（GV-52）

export default function StoreSystemsPanel({
  settings, onChange, onPatch, usage, readOnly = false, busyKey = null,
}: {
  /** ★便 X13-H H-7: 複数キーの保存（報酬の軸の切替）。無ければ onChange を順に呼ぶ */
  onPatch?: (patch: Partial<Record<SystemKey, boolean>>, label: string) => void | Promise<void>;
  settings: StoreSettings;
  /** 切替の依頼（保存は呼び出し側＝set_store_profile の 1 キー patch）。readOnly のときは呼ばれない */
  onChange: (key: SystemKey, next: boolean) => void | Promise<void>;
  /** 269-3: 制度ごとの使用中 cast 数（systemUsageOf の結果） */
  usage: Record<SystemKey, number>;
  /** owner 以外＝現在値のみ表示 */
  readOnly?: boolean;
  /** 保存中のキー（そのキーのボタンだけ disabled） */
  busyKey?: SystemKey | null;
}) {
  const axis = rewardAxisOf(settings);
  const slideKey = axisSlideKeyOf(axis);
  const slideOn = isSystemOn(settings, slideKey);
  const patch = async (pt: Partial<Record<SystemKey, boolean>>, label: string) => {
    if (onPatch) { await onPatch(pt, label); return; }
    for (const [k, v] of Object.entries(pt)) if (isSystemOn(settings, k) !== v) await onChange(k as SystemKey, v as boolean);
  };
  const busyAxis = busyKey !== null && REWARD_AXIS_KEYS.includes(busyKey);
  const rowStyle = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const, padding: "8px 0", borderBottom: "1px solid var(--line, rgba(0,0,0,.08))" };
  // ★便 X13-H H-7（裁定412）: 報酬の軸（ラジオ 1 つ）＋各種バック／スライドの 2 行。pt 軸のときは説明文だけ pt 版（行は増やさない）
  const axisBlock = (
    <div key="reward-axis" data-reward-axis={axis} style={{ display: "grid", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--line, rgba(0,0,0,.08))" }}>
      <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>報酬の軸</div>
      <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 4px", lineHeight: 1.6 }}>バックとスライドを売上（円）で決めるか、ポイント（pt）で決めるかを店で 1 つ選びます。</p>
      <div role="radiogroup" aria-label="報酬の軸" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {(["sales", "pts"] as RewardAxis[]).map((a) => {
          const lock = a !== axis ? axisSwitchLockOf(a, usage) : 0;
          return (
            <label key={a} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, fontSize: 13.5, fontWeight: a === axis ? 800 : 500, opacity: lock > 0 ? 0.55 : 1 }}>
              <input type="radio" name="reward-axis" value={a} checked={a === axis} disabled={readOnly || busyAxis || lock > 0} data-reward-axis-opt={a}
                onChange={() => void patch(rewardAxisPatchOf(a, slideOn), `報酬の軸を「${REWARD_AXIS_LABEL[a]}」`)} />
              {REWARD_AXIS_LABEL[a]}
            </label>
          );
        })}
      </div>
      {axisSwitchLockOf(axis === "sales" ? "pts" : "sales", usage) > 0 && (
        <p className="nox-onoff-body" style={{ fontSize: 11.5, margin: 0, color: "var(--champ)" }}>（キャスト個別の設定があるため {REWARD_AXIS_LABEL[axis === "sales" ? "pts" : "sales"]} に切り替えられません）</p>
      )}
      {([
        { key: "sys_backs" as SystemKey, label: "バック（本指名／場内／同伴／商品）", desc: axis === "pts" ? "pt を基準にしたバック（商品の本指名 pt・pt 基準のバック・指名実績バックの「割合 %」を含む）" : "本指名／場内／同伴／商品のバック（指名実績バックの「固定額 円/本｜割合 %」を含む）", n: backsUsageOf(usage), on: isSystemOn(settings, "sys_backs") },
        { key: slideKey, label: "スライド（帯で時給を変える）", desc: axis === "pts" ? "pt の帯で時給を変える（待遇プラン スライド・ポイント）" : "売上の帯で時給を変える（待遇プラン スライド・ポイント）", n: usage[slideKey] ?? 0, on: slideOn },
      ]).map((r) => (
        <div key={r.label} data-onoff-row="1" data-axis-row={r.key} data-off={r.on ? "0" : "1"} style={{ ...rowStyle, borderBottom: "none", paddingLeft: 12 }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
            <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{r.desc}</p>
            <p className="nox-onoff-body" style={{ fontSize: 11.5, margin: "4px 0 0", color: r.n > 0 ? "var(--champ)" : "var(--sub)" }}>
              使用中 <b className="num">{r.n}</b> 名{r.n > 0 && <span style={{ marginLeft: 6 }}>（キャスト個別の設定があるため OFF にできません）</span>}
            </p>
          </div>
          {!readOnly ? (
            <OnOffSeg value={r.on} ariaLabel={r.label} disabled={busyAxis} disabledOff={r.n > 0} offTitle="使用中のキャストがいるため OFF にできません"
              onChange={(v) => void patch({ [r.key]: v === true }, `${r.label}を「${v === true ? "ON" : "OFF"}」`)} />
          ) : (
            <b style={{ color: r.on ? "var(--ok)" : "var(--sub)" }}>{r.on ? "ON" : "OFF"}</b>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {SYSTEM_KEYS.flatMap((k): (SystemKey | React.ReactElement)[] => (k === "sys_backs" ? [axisBlock] : REWARD_AXIS_KEYS.includes(k) ? [] : [k])).map((k) => {
        if (typeof k !== "string") return k;
        const on = isSystemOn(settings, k);
        const n = usage[k] ?? 0;
        const lockOff = n > 0; // 269-3
        const busy = busyKey === k;
        return (
          <div key={k} data-onoff-row="1" data-off={on ? "0" : "1"} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0, flex: "1 1 260px" }}>
              <div className="nox-onoff-head" style={{ fontSize: 13, fontWeight: 800 }}>{SYSTEM_LABELS[k]}</div>
              <p className="nox-onoff-body" style={{ fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 }}>{SYSTEM_DESCS[k]}</p>
              <p className="nox-onoff-body" style={{ fontSize: 11.5, margin: "4px 0 0", color: lockOff ? "var(--champ)" : "var(--sub)" }}>
                使用中 <b className="num">{n}</b> 名
                {lockOff && <span style={{ marginLeft: 6 }}>（キャスト個別の設定があるため OFF にできません）</span>}
              </p>
            </div>
            {!readOnly ? (
              <OnOffSeg value={on} ariaLabel={SYSTEM_LABELS[k]} disabled={busy} disabledOff={lockOff} offTitle="使用中のキャストがいるため OFF にできません"
                onChange={(v) => void onChange(k, v === true)} /* ★便 GV-C C-9（GV-52）: 共通の OFF／ON（選択側を塗る・状態文字） */ />
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <b style={{ color: on ? "var(--ok)" : "var(--sub)" }}>{on ? "ON" : "OFF"}</b>
                <span className="nox-stpill">オーナーのみ変更できます</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
