/**
 * verify:nox-ext-menu — mig0098（R2-a 延長メニュー複数＋開卓時ルール手動選択）の runtime 実証（段55・R2-a）
 *   実行: npm run verify:nox-ext-menu（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0098 の肝は
 *   (a) ext_menu_snap が「開栓時の有効 extension 全件・priority 順」で凍結され、開栓後の
 *       マスタ変更に波及しないこと（R2-1/R2-2/R2-4）
 *   (b) check_extension_add(p_rule_id) が **snap からのみ**解決すること（live pricing_rules を読まない）
 *   (c) p_rule_id/p_set_rule_id とも null が現行完全互換であること（既存呼び出しの無改修互換）
 *   (d) check_open(p_set_rule_id) の override が凍結され、他店/他 fee_kind/inactive を弾くこと（R2-5）
 *   (e) kiosk 経路は既定固定（セレクタを持たない＝null 呼び）でも従来どおり動くこと
 *   いずれも実セッションで伝票を作って初めて言える。
 *
 * 段構成（12系）:
 *   (1) snap 凍結: open → ext_menu_snap が有効 extension 全件・priority 昇順・キー4種
 *   (2) snap の非波及: open 後に pricing_rules を追加/無効化/改額しても snap 不変（R2-4）
 *   (3) seat_kind 絞り: VIP 席の open では seat_kind='卓' 限定ルールが snap に載らない
 *   (4) is_active=false のルールは snap に載らない
 *   (5) p_rule_id null＝既定（checks スナップ ext_min/ext_fee で行が立つ＝現行完全互換）
 *   (6) p_rule_id 指定＝snap の当該メニューの額/分で行が立つ（60分¥5000 の複数メニュー実証）
 *   (7) ★snap 由来の凍結: 指定後に pricing_rules を改額しても、既に凍結した snap の額で立つ
 *   (8) snap に無い rule_id は 'bad rule'（他店ルール・extension 以外・存在しない id）
 *   (9) 旧伝票（ext_menu_snap null）への p_rule_id 指定は 'bad rule'
 *   (10) p_set_rule_id override: 指定ルールの額/分が checks へ凍結・audit に override_rule_id
 *   (11) p_set_rule_id 負系: 他店ルール/fee_kind='extension'/inactive/存在しない id は 'bad rule'
 *   (12) kiosk 腕: 既定固定（p_set_rule_id 省略）で開栓でき snap も凍結される
 *   ★adversarial 2本: (2) を「波及する」想定へ／(7) を「live 参照」想定へ一時改変→赤→復元
 *
 * fixture は段内動的生成→finally 全消し（段44 型）:
 *   seats/checks/check_lines/pricing_rules は prefix P55・id で全削除。stores の時間6値は
 *   開始時 snapshot → finally 復元。★時刻依存ゼロ＝ルールは全て終日・全曜日（帯なし）。
 *   ★A1 は time_mode='manual'（check_extension_add は manual 専用）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);

const P55 = "NOX-VERIFY-P55";
type Menu = { rule_id: string; duration_min: number; amount: number; label: string };

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };

  const { data: sA1row } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const sA1 = sA1row as { id: string; org_id: string };
  const { data: sA2row } = await admin.from("stores").select("id").eq("name", STORE_A2).single();
  const sA2 = (sA2row as { id: string }).id;
  const { data: origStore } = await admin.from("stores")
    .select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();

  const checkIds: string[] = [];
  const seatIds: string[] = [];
  const ruleIds: string[] = [];
  let kioskAuthId = "";
  const cleanup = async () => {
    if (checkIds.length) {
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      await admin.from("audit_logs").delete().in("target", checkIds.map((id) => `checks:${id}`));
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    if (ruleIds.length) await admin.from("pricing_rules").delete().in("id", ruleIds);
    if (origStore) await admin.from("stores").update(origStore).eq("id", sA1.id);
    if (kioskAuthId) {
      // ★sessions は device_id 経由（auth_user_id 列は無い）→devices→auth user の依存順
      const { data: myDev } = await admin.from("kiosk_devices").select("id").eq("auth_user_id", kioskAuthId);
      for (const d of (myDev ?? []) as { id: string }[]) {
        await admin.from("kiosk_sessions").delete().eq("device_id", d.id);
        await admin.from("kiosk_devices").delete().eq("id", d.id);
      }
      await admin.auth.admin.deleteUser(kioskAuthId).catch(() => undefined);
    }
  };

  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  check("段55（準備）ownerA/managerA1 セッション解決", true);

  try {
    // 時間設定: manual（extension_add の前提）・既定 30分¥2000
    const { error: eSt } = await admin.from("stores").update({
      set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2000, time_mode: "manual", time_per: "table",
    }).eq("id", sA1.id);
    check("段55（準備）A1 時間設定（60/5000/30/2000/manual/table）", !eSt, eSt?.message);

    const mkSeat = async (nm: string, kind: string) => {
      const id = (await admin.from("seats").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: nm, kind, sort_order: 975, is_active: true,
      }).select("id").single()).data?.id as string;
      seatIds.push(id);
      return id;
    };
    const mkRule = async (patch: Record<string, unknown>, storeId = sA1.id) => {
      const { data, error } = await admin.from("pricing_rules").insert({
        org_id: sA1.org_id, store_id: storeId, fee_kind: "extension",
        seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: null,
        amount: 3000, duration_min: 30, priority: 100, is_active: true, ...patch,
      }).select("id").single();
      if (error) { check(`段55（準備）rule insert ${JSON.stringify(patch)}`, false, error.message); return ""; }
      ruleIds.push(data!.id as string);
      return data!.id as string;
    };
    const snapOf = async (cid: string): Promise<Menu[] | null> =>
      ((await admin.from("checks").select("ext_menu_snap").eq("id", cid).single()).data?.ext_menu_snap ?? null) as Menu[] | null;
    const extLines = async (cid: string) =>
      ((await admin.from("check_lines").select("name_snapshot, unit_price_snapshot, qty, line_total, fee_kind, time_auto")
        .eq("check_id", cid).eq("fee_kind", "extension").order("sort_order")).data ?? []) as
        Array<{ name_snapshot: string; unit_price_snapshot: number; qty: number; line_total: number; time_auto: boolean }>;

    // メニュー3種（priority 昇順で 30分¥3000 → 60分¥5000 → 90分¥7000）
    const r30 = await mkRule({ amount: 3000, duration_min: 30, priority: 10 });
    const r60 = await mkRule({ amount: 5000, duration_min: 60, priority: 20 });
    const r90 = await mkRule({ amount: 7000, duration_min: 90, priority: 30 });
    const rVip = await mkRule({ amount: 9000, duration_min: 30, priority: 40, seat_kind: "VIP" });
    const rOff = await mkRule({ amount: 1, duration_min: 30, priority: 50, is_active: false });
    const rSet = await mkRule({ fee_kind: "set", amount: 8000, duration_min: 40, priority: 10 });
    const rSetOff = await mkRule({ fee_kind: "set", amount: 111, duration_min: 40, priority: 60, is_active: false });
    const rA2 = await mkRule({ amount: 4444, duration_min: 30, priority: 10 }, sA2);
    check("段55（準備）pricing_rules 8本（ext 3＋VIP＋無効＋set 2＋他店1）",
      !!r30 && !!r60 && !!r90 && !!rVip && !!rOff && !!rSet && !!rSetOff && !!rA2);

    const seatA = await mkSeat(`${P55}-卓A`, "卓");
    const seatV = await mkSeat(`${P55}-VIP`, "VIP");

    // ═══ (1) snap 凍結: 有効 extension 全件・priority 昇順・キー4種 ═══
    const { data: c1d, error: e1o } = await mgr.rpc("check_open", { p_seat_id: seatA, p_people: 2, p_nom_type: "free" });
    const c1 = c1d as string;
    check("段55(1) 準備: check_open（卓A・p_set_rule_id 省略＝現行互換呼び）", !e1o && !!c1, e1o?.message);
    if (c1) checkIds.push(c1);
    const m1 = await snapOf(c1);
    check("段55(1) ★ext_menu_snap = 有効 extension 3件（VIP 席限定・無効・他店・set は載らない）",
      Array.isArray(m1) && m1.length === 3, JSON.stringify(m1));
    check("段55(1) ★priority 昇順（30分¥3000 → 60分¥5000 → 90分¥7000）",
      m1?.[0]?.rule_id === r30 && m1?.[1]?.rule_id === r60 && m1?.[2]?.rule_id === r90,
      JSON.stringify(m1?.map((m) => [m.duration_min, m.amount])));
    check("段55(1) ★キー4種（rule_id/duration_min/amount/label）と値",
      m1?.[1]?.duration_min === 60 && m1?.[1]?.amount === 5000
      && typeof m1?.[1]?.label === "string" && m1![1].label.includes("60") && m1![1].label.includes("5000"),
      JSON.stringify(m1?.[1]));

    // ═══ (2) snap の非波及（★adversarial 対象）: 開栓後にマスタを変えても snap 不変 ═══
    const rLate = await mkRule({ amount: 8888, duration_min: 45, priority: 5 }); // priority 最上位で追加
    await admin.from("pricing_rules").update({ amount: 9999 }).eq("id", r60);    // 既存を改額
    await admin.from("pricing_rules").update({ is_active: false }).eq("id", r90); // 既存を無効化
    const m2 = await snapOf(c1);
    check("段55(2) ★snap は開栓後のマスタ変更に波及しない（3件・rule_id/額とも (1) と同一）",
      JSON.stringify(m2) === JSON.stringify(m1), JSON.stringify({ m1, m2 }));

    // ═══ (3) seat_kind 絞り: VIP 席の open では VIP ルールが載り 卓限定は載らない ═══
    //   （本 fixture の ext ルールは seat_kind null が3本＝全席種に載る。VIP 専用 rVip が VIP 席でのみ増える）
    const { data: c3d, error: e3o } = await mgr.rpc("check_open", { p_seat_id: seatV, p_people: 1, p_nom_type: "free" });
    const c3 = c3d as string;
    check("段55(3) 準備: check_open（VIP 席）", !e3o && !!c3, e3o?.message);
    if (c3) checkIds.push(c3);
    const m3 = await snapOf(c3);
    check("段55(3) ★seat_kind 絞り: VIP 席の snap に VIP 専用ルールが含まれる（全席種 3件＋VIP 1件＋(2) 追加分）",
      Array.isArray(m3) && m3.some((m) => m.rule_id === rVip), JSON.stringify(m3?.map((m) => m.rule_id)));
    check("段55(4) ★is_active=false は snap に載らない（無効ルール rOff・(2) で無効化した r90 とも不在）",
      !m3?.some((m) => m.rule_id === rOff) && !m3?.some((m) => m.rule_id === r90),
      JSON.stringify(m3?.map((m) => m.rule_id)));
    check("段55(4) ★他店ルール・fee_kind='set' は snap に載らない",
      !m3?.some((m) => m.rule_id === rA2) && !m3?.some((m) => m.rule_id === rSet),
      JSON.stringify(m3?.map((m) => m.rule_id)));

    // ═══ (5) p_rule_id null＝既定（現行完全互換）═══
    //   ★既定＝checks の ext_min/ext_fee スナップ。本 fixture は開栓時に extension ルールが在るため
    //     スナップは stores の 30分¥2000 ではなく **解決値 30分¥3000（priority 最上位 r30）**＝
    //     0084 の凍結どおり。「既定＝スナップ」であることの実測がここの主眼（stores 直値ではない）。
    const { data: ck5 } = await admin.from("checks").select("ext_min, ext_fee").eq("id", c1).single();
    check("段55(5) 前提: checks スナップ ext = 解決値 30分¥3000（stores 直値 2000 ではない＝0084 凍結）",
      ck5?.ext_min === 30 && ck5?.ext_fee === 3000, JSON.stringify(ck5));
    const { error: e5 } = await mgr.rpc("check_extension_add", { p_check_id: c1 });
    const l5 = await extLines(c1);
    check("段55(5) ★p_rule_id 省略＝checks スナップ既定で行が立つ（30分¥3000・qty=1・time_auto=false）",
      !e5 && l5.length === 1 && l5[0].unit_price_snapshot === 3000 && l5[0].qty === 1
      && l5[0].line_total === 3000 && l5[0].name_snapshot === "延長料金(30分)" && l5[0].time_auto === false,
      e5?.message ?? JSON.stringify(l5));

    // ═══ (6) p_rule_id 指定＝snap のメニューで行が立つ（複数メニューの実証）═══
    const { error: e6 } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: r60 });
    const l6 = await extLines(c1);
    check("段55(6) ★p_rule_id 指定＝60分¥5000 の行（既定 30分¥2000 と併存＝1押し1行）",
      !e6 && l6.length === 2
      && l6[1].unit_price_snapshot === 5000 && l6[1].line_total === 5000
      && l6[1].name_snapshot === "延長料金(60分)", e6?.message ?? JSON.stringify(l6));

    // ═══ (7) snap 由来の凍結（★adversarial 対象）: live を改額しても snap の額で立つ ═══
    //   (2) で r60 は live 上 9999 へ改額済み＝live 参照なら 9999 で立つはず。snap 参照なら 5000。
    const { error: e7 } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: r60 });
    const l7 = await extLines(c1);
    check("段55(7) ★live 改額（9999）に追随せず snap の 5000 で立つ＝凍結原則 R2-4",
      !e7 && l7.length === 3 && l7[2].unit_price_snapshot === 5000 && l7[2].line_total === 5000,
      e7?.message ?? JSON.stringify(l7.map((l) => l.unit_price_snapshot)));

    // ═══ (8) snap に無い rule_id は 'bad rule' ═══
    {
      const { error: eA } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: rA2 });
      check("段55(8) 他店ルールの id = 'bad rule'", has(eA, "bad rule"), eA?.message ?? "通ってしまった");
      const { error: eS } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: rSet });
      check("段55(8) fee_kind='set' の id = 'bad rule'", has(eS, "bad rule"), eS?.message ?? "通ってしまった");
      const { error: eN } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: "00000000-0000-0000-0000-000000000000" });
      check("段55(8) 存在しない id = 'bad rule'", has(eN, "bad rule"), eN?.message ?? "通ってしまった");
      const { error: eO } = await mgr.rpc("check_extension_add", { p_check_id: c1, p_rule_id: rOff });
      check("段55(8) 無効ルール（snap 非搭載）の id = 'bad rule'", has(eO, "bad rule"), eO?.message ?? "通ってしまった");
    }

    // ═══ (9) 旧伝票（ext_menu_snap null）への指定は 'bad rule' ═══
    {
      const seatOld = await mkSeat(`${P55}-卓OLD`, "卓");
      const { data: cOldD } = await mgr.rpc("check_open", { p_seat_id: seatOld, p_people: 1, p_nom_type: "free" });
      const cOld = cOldD as string;
      if (cOld) checkIds.push(cOld);
      await admin.from("checks").update({ ext_menu_snap: null }).eq("id", cOld); // 0098 前の伝票を再現
      const { error: e9 } = await mgr.rpc("check_extension_add", { p_check_id: cOld, p_rule_id: r30 });
      check("段55(9) ★旧伝票（snap null）への p_rule_id 指定 = 'bad rule'", has(e9, "bad rule"), e9?.message ?? "通ってしまった");
      const { data: ckOld } = await admin.from("checks").select("ext_fee").eq("id", cOld).single();
      const { error: e9b } = await mgr.rpc("check_extension_add", { p_check_id: cOld });
      const l9 = await extLines(cOld);
      check("段55(9) ★旧伝票（snap null）でも null 呼びは checks スナップ既定で通る（後方互換）",
        !e9b && l9.length === 1 && l9[0].unit_price_snapshot === (ckOld?.ext_fee as number),
        e9b?.message ?? JSON.stringify({ l9, ckOld }));
    }

    // ═══ (10) p_set_rule_id override（R2-5）: 指定ルールが checks へ凍結＋audit ═══
    {
      const seatO = await mkSeat(`${P55}-卓OV`, "卓");
      const { data: cOvD, error: eOv } = await mgr.rpc("check_open", {
        p_seat_id: seatO, p_people: 1, p_nom_type: "free", p_set_rule_id: rSet,
      });
      const cOv = cOvD as string;
      check("段55(10) 準備: p_set_rule_id 指定の check_open 成功", !eOv && !!cOv, eOv?.message);
      if (cOv) checkIds.push(cOv);
      const { data: ck } = await admin.from("checks").select("set_fee, set_min").eq("id", cOv).single();
      check("段55(10) ★override ルールの額/分が凍結（8000/40・自動一致の既定 5000/60 ではない）",
        ck?.set_fee === 8000 && ck?.set_min === 40, JSON.stringify(ck));
      const { data: au } = await admin.from("audit_logs").select("after_json")
        .eq("action", "check_open").eq("target", `checks:${cOv}`).single();
      check("段55(10) ★audit の after_json に override_rule_id が載る",
        (au?.after_json as Record<string, unknown> | null)?.override_rule_id === rSet,
        JSON.stringify(au?.after_json ?? null));
    }

    // ═══ (11) p_set_rule_id 負系 ═══
    {
      const seatB = await mkSeat(`${P55}-卓B`, "卓");
      const bad = async (rid: string, label: string) => {
        const { error } = await mgr.rpc("check_open", {
          p_seat_id: seatB, p_people: 1, p_nom_type: "free", p_set_rule_id: rid,
        });
        check(`段55(11) ${label} = 'bad rule'`, has(error, "bad rule"), error?.message ?? "通ってしまった");
      };
      await bad(r30, "fee_kind='extension' の id");
      await bad(rSetOff, "inactive な set ルール");
      await bad("00000000-0000-0000-0000-000000000000", "存在しない id");
      // 他店の set ルール（A2 に作って渡す）
      const rSetA2 = await mkRule({ fee_kind: "set", amount: 222, duration_min: 40, priority: 10 }, sA2);
      await bad(rSetA2, "他店の set ルール");
    }

    // ═══ (12) kiosk 腕: 既定固定（p_set_rule_id 省略）で開栓・snap も凍結 ═══
    {
      const kEmail = `k-verify-p55@o-${sA1.org_id.replace(/-/g, "").slice(0, 8)}.nox.local`;
      const { data: lu } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const leftover = lu?.users?.find((u) => u.email === kEmail);
      if (leftover) await admin.auth.admin.deleteUser(leftover.id).catch(() => undefined);
      // 前回失敗ランの device 残骸掃除（label prefix・sessions→devices の依存順）。
      //   ★kiosk_sessions に auth_user_id 列は無い＝device_id 経由が正（初回実行で空振りを実測）
      const { data: oldDev } = await admin.from("kiosk_devices").select("id").like("label", `${P55}%`);
      for (const d of (oldDev ?? []) as { id: string }[]) {
        await admin.from("kiosk_sessions").delete().eq("device_id", d.id);
        await admin.from("kiosk_devices").delete().eq("id", d.id);
      }
      const { data: cu } = await admin.auth.admin.createUser({ email: kEmail, password: env.SEED_PASSWORD, email_confirm: true });
      kioskAuthId = cu?.user?.id ?? "";
      const { data: ownerUserRow } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.ownerA.email).single();
      const { data: ownerMemRow } = await admin.from("memberships").select("id")
        .eq("user_id", ownerUserRow!.id).eq("store_id", sA1.id).single();
      const kiosk = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: eProv } = await owner.rpc("kiosk_provision", {
        p_auth_user_id: kioskAuthId, p_store_id: sA1.id, p_label: `${P55}-reg`, p_purpose: "register",
      });
      check("段55(12) 準備 kiosk_provision(register)", !eProv, eProv?.message);
      await kiosk.auth.signInWithPassword({ email: kEmail, password: env.SEED_PASSWORD });
      await owner.rpc("set_staff_pin", { p_membership_id: ownerMemRow!.id, p_pin: "4444" });
      const { data: rLogin } = await kiosk.rpc("kiosk_login", { p_membership_id: ownerMemRow!.id, p_pin: "4444" });
      check("段55(12) 準備 kiosk_login ok:true", (rLogin as { ok?: boolean } | null)?.ok === true, JSON.stringify(rLogin));

      const seatK = await mkSeat(`${P55}-卓K`, "卓");
      const { data: kcid, error: eKo } = await kiosk.rpc("check_open", { p_seat_id: seatK, p_people: 1, p_nom_type: "free" });
      check("段55(12) ★kiosk の既定固定呼び（p_set_rule_id 省略）で開栓成功", !eKo && typeof kcid === "string", eKo?.message);
      if (typeof kcid === "string") {
        checkIds.push(kcid);
        const mk = await snapOf(kcid);
        check("段55(12) ★kiosk 経路でも snap が凍結される（有効 extension が載る）",
          Array.isArray(mk) && mk.length > 0 && mk.some((m) => m.rule_id === r30), JSON.stringify(mk?.map((m) => m.rule_id)));
        const { data: kc } = await admin.from("checks").select("set_fee, set_min").eq("id", kcid).single();
        check("段55(12) ★kiosk は自動一致（override なし）＝set ルール 8000/40 が解決される",
          kc?.set_fee === 8000 && kc?.set_min === 40, JSON.stringify(kc));
      }
    }
  } finally {
    await cleanup();
    const { count: leftSeat } = await admin.from("seats")
      .select("id", { count: "exact", head: true }).like("name", `${P55}%`);
    const { count: leftRule } = await admin.from("pricing_rules")
      .select("id", { count: "exact", head: true }).in("id", ruleIds.length ? ruleIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: st } = await admin.from("stores")
      .select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();
    check("段55（掃除）seats/pricing_rules 残置ゼロ・stores 時間6値復元",
      (leftSeat ?? 0) === 0 && (leftRule ?? 0) === 0 && JSON.stringify(st) === JSON.stringify(origStore),
      JSON.stringify({ leftSeat, leftRule, st }));
  }

  if (fails.length) {
    console.error(`verify:nox-ext-menu FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-ext-menu ALL PASS (${pass} assertions)`);
  console.log("延長メニュー複数(0098): snap 凍結/priority順/seat_kind絞り/非波及・p_rule_id 既定と指定・bad rule 系・open override・kiosk 既定固定");
}

main().catch((e) => { console.error(e); process.exit(1); });
