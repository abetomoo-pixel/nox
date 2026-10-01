/*
 * verify:nox-staff-photo — 便 M5-1／M5-2（裁定329＋追補1・326 追補7-6・0162・2026-10-01）: スタッフ写真と cast の契約確認の client 配線（純関数＋逐語 grep・DB 不触・env 不要）。
 *   npm run verify:nox-staff-photo。runtime（storage の users 腕・delete policy・RPC 4 象限）は verify:nox-cast-photo (n)〜(r)／verify:nox-contract-ack が係留。
 *
 *  sp(1) lib/nox/staff-photo.ts: u_ パス・upload→set_user_photo_updated_at の順・削除＝storage.remove → clear_*（329 追補1）・canEditUserPhoto は cast を含まない・photoActionLabelOf・photoVersionOf
 *  sp(2) 本人（UserChip）: props meId／mePhotoAt／canPhoto／isDemo・showPhoto＝canPhoto ∧ !isDemo ∧ meId・CastAvatar＋登録／変更＋削除・variant="top" は 2 のまま（ms(2-25)）／layout: users 読取に id・photo_updated_at・canPhoto＝cast 以外・isDemo
 *  sp(3) 店側: staff-board＝photo_updated_at を読み signUserPhotos・一覧の avatar に url・編集 Modal に登録／差替え／削除（!isDemo）／casts-board＝「写真を削除」（写真があるときだけ・removeCastPhoto）
 *  sp(4) 表示: StaffLike.photoUrl・staff-shift-manage が signUserPhotos → staffList.photoUrl・staff-place-day の CastAvatar url・staff-place-by-staff の Picker avatar url
 *  sp(5) 契約確認: contractAckGateOf（店 ON ∧ needed=true だけ）・文面＝料金マスタの既存文面を逐語・gate 部品＝cast_contract_ack_self → router.refresh・Message／mine page＝店 ON のときだけ cast_contract_ack_needed・PhotoCard より前
 *  sp(6) rpc-err: 'bad user'／'not required' の和文
 *  逆テスト 1 本（手動・1 回）: lib/nox/staff-photo.ts の removeUserPhoto で remove と rpc の順を入れ替える→sp(1-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { canEditUserPhoto, photoActionLabelOf, photoVersionOf, userPhotoPath } from "../lib/nox/staff-photo";
import { CONTRACT_ACK_BUTTON, CONTRACT_ACK_LINES, CONTRACT_ACK_STORE_TEXT, contractAckGateOf } from "../lib/nox/mine/contract-ack";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
/** コメント行を落とした本文（否定 pin がコメントに当たらないように） */
const codeOf = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

// (1) lib
const lib = src("lib/nox/staff-photo.ts");
check("sp(1-1) userPhotoPath＝{org}/u_{user}.jpg・canEditUserPhoto＝owner／manager／staff（cast・null は false）・photoActionLabelOf＝写真を登録／写真を変更／保存中…",
  userPhotoPath("o", "u") === "o/u_u.jpg" && canEditUserPhoto("owner") && canEditUserPhoto("manager") && canEditUserPhoto("staff") && !canEditUserPhoto("cast") && !canEditUserPhoto(null)
  && photoActionLabelOf(false, false) === "写真を登録" && photoActionLabelOf(true, false) === "写真を変更" && photoActionLabelOf(true, true) === "保存中…");
const fnBody = (name: string) => { const i = lib.indexOf(`export async function ${name}(`); const j = lib.indexOf("\n}\n", i); return lib.slice(i, j); };
const up = fnBody("uploadUserPhoto"), rmU = fnBody("removeUserPhoto"), rmC = fnBody("removeCastPhoto");
check("sp(1-2) 順序: upload＝storage.upload → set_user_photo_updated_at／削除＝storage.remove → clear_user_photo・clear_cast_photo（329 追補1）・同じ bucket（CAST_PHOTO_BUCKET）・downscaleToJpeg を共用",
  up.indexOf(".upload(") < up.indexOf('rpc("set_user_photo_updated_at"') && rmU.indexOf(".remove([") < rmU.indexOf('rpc("clear_user_photo"') && rmC.indexOf(".remove([") < rmC.indexOf('rpc("clear_cast_photo"')
  && /import \{ CAST_PHOTO_BUCKET, downscaleToJpeg \} from "\.\/cast-photo"/.test(lib) && !/from\("cast-photos"\)/.test(codeOf(lib)) && up.includes("downscaleToJpeg(file)"));
check("sp(1-3) photoVersionOf＝v=epoch（null はそのまま・? と & を選ぶ・不正日付はそのまま）",
  photoVersionOf("https://x/a", null) === "https://x/a" && photoVersionOf("https://x/a", "2026-10-01T00:00:00.000Z") === `https://x/a?v=${Date.parse("2026-10-01T00:00:00.000Z")}`
  && photoVersionOf("https://x/a?t=1", "2026-10-01T00:00:00.000Z").includes("&v=") && photoVersionOf("https://x/a", "bogus") === "https://x/a");

// (2) 本人
const chips = src("components/ui/header-chips.tsx"), lay = src("app/(manage)/layout.tsx");
check("sp(2-1) UserChip: props meId／mePhotoAt／canPhoto／isDemo・showPhoto＝canPhoto && !isDemo && !!meId・uploadUserPhoto／removeUserPhoto／signUserPhoto・CastAvatar・写真を削除・variant=\"top\" は 2（ms(2-25) 不変）",
  /meId\?: string \| null; mePhotoAt\?: string \| null; canPhoto\?: boolean; isDemo\?: boolean;/.test(chips) && chips.includes("const showPhoto = canPhoto && !isDemo && !!meId;")
  && chips.includes("await uploadUserPhoto(supabase, orgId, meId, f)") && chips.includes("await removeUserPhoto(supabase, orgId, meId)") && chips.includes("signUserPhoto(supabase, org, meId, photoAt)")
  && chips.includes('<CastAvatar name={(name ?? "").trim() || "?"} url={photoUrl} size={56} />') && chips.includes(">写真を削除</button>") && chips.includes("photoActionLabelOf(!!photoAt, busy)")
  && (chips.match(/variant="top"/g) ?? []).length === 2 && chips.includes('<Message kind="error"') && chips.includes("rpcErrJa("));
check("sp(2-2) layout: users 行の読取に id・photo_updated_at・UserChip に meId／mePhotoAt／canPhoto={role !== \"cast\"}／isDemo（nv(4-3) の name／email 形は不変）",
  lay.includes('.select("id, name, email, photo_updated_at").eq("auth_user_id"') && lay.includes("<UserChip name={meName} email={meEmail}") && lay.includes("meId={(meRow?.id as string | null) ?? null}")
  && lay.includes("mePhotoAt={(meRow?.photo_updated_at as string | null) ?? null}") && lay.includes('canPhoto={role !== "cast"}') && lay.includes("isDemo={isDemo} />"));

// (3) 店側
const sb = src("app/(manage)/staff/staff-board.tsx"), cb = src("app/(manage)/casts/casts-board.tsx");
check("sp(3-1) staff-board: UserRow.photo_updated_at・select に photo_updated_at・signUserPhotos → 一覧 avatar url={photoUrls.get(m.user_id)}・編集 Modal＝uploadUserPhoto／removeUserPhoto（!isDemo）・写真を削除は写真があるときだけ・和文は rpcErrJa",
  sb.includes("photo_updated_at: string | null }") && sb.includes('select("id, name, email, auth_user_id, photo_updated_at")') && sb.includes("signUserPhotos(supabase, orgId, Object.values(users))")
  && sb.includes('<CastAvatar name={u?.name ?? ""} url={photoUrls.get(m.user_id)} size={34} />') && sb.includes("await uploadUserPhoto(supabase, orgId, userId, f)") && sb.includes("await removeUserPhoto(supabase, orgId, userId)")
  && sb.includes("{!isDemo && (\n            // ★0162") && sb.includes("{users[sel.user_id]?.photo_updated_at && (") && sb.includes(">写真を削除</button>") && (sb.match(/rpcErrJa\(/g) ?? []).length >= 2);
check("sp(3-2) casts-board: removeCastPhoto を import・deletePhoto＝confirm → removeCastPhoto → reloadLoginCasts・「写真を削除」は !isDemo && photoUrls.has(selCast.id) のときだけ・登録／差替え（openPhoto／uploadCastPhoto）は不変",
  cb.includes('import { removeCastPhoto } from "@/lib/nox/staff-photo"') && cb.includes("async function deletePhoto(c: CastLogin)") && cb.includes("await removeCastPhoto(supabase, orgId, c.id);\n      await reloadLoginCasts();")
  && cb.includes("{!isDemo && photoUrls.has(selCast.id) && (") && cb.includes("onClick={() => void deletePhoto(selCast)}") && cb.includes("await uploadCastPhoto(supabase, orgId, phTarget.id, phFile);") && cb.includes("onClick={() => openPhoto(selCast)}"));

// (4) 表示（スタッフ枠）
const sp = src("lib/nox/shift/staff-place.ts"), sm = src("app/(manage)/shift/staff-shift-manage.tsx"), sd = src("app/(manage)/shift/staff-place-day.tsx"), sbs = src("app/(manage)/shift/staff-place-by-staff.tsx");
check("sp(4-1) StaffLike.photoUrl・staff-shift-manage＝users に photo_updated_at → signUserPhotos → staffList.photoUrl・staff-place-day の CastAvatar url・staff-place-by-staff の Picker avatar={ url } ∨ true",
  sp.includes("photoUrl?: string | null") && sm.includes('select("id, name, photo_updated_at")') && sm.includes("signUserPhotos(supabase, org, rows)") && sm.includes("photoUrl: photoByMember.get(m.id) ?? null")
  && sd.includes("<CastAvatar name={r.staff.name} url={r.staff.photoUrl ?? undefined} variant=\"flat\" />") && sbs.includes("avatar: s.photoUrl ? { url: s.photoUrl } : true"));

// (5) 契約確認
const pricing = src("app/(manage)/master/pricing/pricing-board.tsx"), gate = src("app/mine/contract-ack-gate.tsx"), mine = src("app/mine/page.tsx");
check("sp(5-1) contractAckGateOf＝店 ON ∧ needed=true だけ（OFF／false／null は出さない）・文面の 1 行目＝料金マスタ（pricing-board）の既存文面を逐語・ボタン「確認しました」",
  contractAckGateOf(true, true) === true && contractAckGateOf(true, false) === false && contractAckGateOf(false, true) === false && contractAckGateOf(true, null) === false && contractAckGateOf(true, undefined) === false
  && CONTRACT_ACK_LINES[0] === CONTRACT_ACK_STORE_TEXT && pricing.includes(CONTRACT_ACK_STORE_TEXT) && CONTRACT_ACK_BUTTON === "確認しました");
check("sp(5-2) contract-ack-gate: cast_contract_ack_self → router.refresh()・失敗は Message（rpcErrJa）・文面は lib から（素の契約語を部品に書かない）",
  gate.includes('supabase.rpc("cast_contract_ack_self")') && gate.includes("router.refresh();") && gate.includes('<Message kind="error"') && gate.includes("rpcErrJa(error.message)")
  && gate.includes("CONTRACT_ACK_LINES.map(") && !codeOf(gate).includes("加盟店契約"));
check("sp(5-3) mine page: 店が ON のときだけ cast_contract_ack_needed（OFF は fetch 0）・contractAckGateOf・{showContractAck && <ContractAckGate />} は PhotoCard より前",
  mine.includes('ms.contract_ack ? await supabase.rpc("cast_contract_ack_needed") : { data: null }') && mine.includes("contractAckGateOf(ms.contract_ack,")
  && mine.indexOf("{showContractAck && <ContractAckGate />}") > 0 && mine.indexOf("{showContractAck && <ContractAckGate />}") < mine.indexOf("<PhotoCard storeName="));

// (6) rpc-err
check("sp(6-1) rpc-err: 'bad user'／'not required' の和文（'no cast for caller' は既存）", rpcErrJa("bad user") === "スタッフの指定が正しくありません" && rpcErrJa("not required") === "この店では契約確認は不要です" && !rpcErrJa("no cast for caller").startsWith("処理できませんでした（コード"));

if (fails.length) {
  console.error(`verify:nox-staff-photo FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-staff-photo OK (${pass} checks)`);
console.log("スタッフ写真＋契約確認の client（便 M5・裁定329／326 追補7-6）: lib の順序と u_ パス / UserChip 本人・layout / staff-board・casts-board の登録・差替え・削除 / スタッフ枠の avatar / 契約確認 gate と文面・mine page / rpc-err");
