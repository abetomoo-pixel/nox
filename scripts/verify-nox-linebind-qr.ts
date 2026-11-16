/*
 * verify:nox-linebind-qr — LINE 連携の招待リンクに QR（2026-11-16 夜・相談役 N6・Agoora 18:21・見せ方だけ）。DB 不触・env 不要・逐語 pin。
 *   npm run verify:nox-linebind-qr。
 *  q(1) 招待リンクを出す所の全部（キャストの詳細・スタッフの編集）が共通の部品 LineBindLink を使う（左に QR・右にリンクとコピー）。
 *  q(2) QR は画面の中で作る（uqr の renderSVG・既存の部品）＝外のサービスへ送らない・state に持たない（url から毎回作る＝閉じたら消える）。
 *  q(3) リンクの文字と「リンクをコピー」は残る・添える文「本人に直接お渡しください（QR を読み取ってもらえます）」・7 日／1 回だけの注記は今のまま。
 *  q(4) リンクの作り方（line_bind_token_create → liffBindUrlOf）は不変。
 */
import fs from "node:fs";
import { renderSVG } from "uqr";
import { LINE_BIND_HAND_NOTE, LINE_BIND_QR_PX } from "../components/nox/line-bind-link";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const comp = fs.readFileSync("components/nox/line-bind-link.tsx", "utf8");
const cb = fs.readFileSync("app/(manage)/casts/casts-board.tsx", "utf8");
const sb = fs.readFileSync("app/(manage)/staff/staff-board.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

check("q(1-1) キャストの詳細＝LineBindLink（data-cast-line-bind-url）", cb.includes('<LineBindLink url={bindUrl} copied={bindCopied} buttonStyle={btnGhost} dataAttr="data-cast-line-bind-url"') && cb.includes('import LineBindLink from "@/components/nox/line-bind-link";'));
check("q(1-2) スタッフの編集＝LineBindLink（data-staff-line-bind-url）", sb.includes('<LineBindLink url={bindUrl} copied={bindCopied} buttonStyle={btnGhost} dataAttr="data-staff-line-bind-url"') && sb.includes('import LineBindLink from "@/components/nox/line-bind-link";'));
const sites = ["app", "components"].flatMap((d) => (fs.readdirSync(d, { recursive: true }) as string[]).filter((f) => /\.tsx$/.test(f)).map((f) => `${d}/${f}`)).filter((f) => fs.readFileSync(f, "utf8").includes("liffBindUrlOf("));
check("q(1-3) 招待リンクを作る所（liffBindUrlOf を呼ぶ画面）は全部 LineBindLink を使う", sites.length >= 2 && sites.every((f) => fs.readFileSync(f, "utf8").includes("<LineBindLink ")), sites);
check("q(1-4) 並び＝左に QR・右にリンクとコピー（grid 2 列）", css.includes(".nox-linebind { display: grid; grid-template-columns: auto minmax(0, 1fr);") && comp.indexOf('className="qr"') < comp.indexOf('className="tx"'));
check("q(2-1) QR は画面の中で作る（uqr の renderSVG）・外へ送らない（fetch・img の外部 URL なし）", comp.includes('import { renderSVG } from "uqr";') && comp.includes("const svg = useMemo(() => renderSVG(url, { border: 1 }), [url]);") && !/fetch\(|https?:\/\/|<img/.test(comp));
check("q(2-2) QR を残さない（useState・localStorage なし＝url が消えたら消える）", !comp.includes("useState") && !/localStorage|sessionStorage|indexedDB/.test(comp));
check("q(2-3) 375 で読める大きさ（132px・白地）", LINE_BIND_QR_PX === 132 && css.includes(".nox-linebind .qr { background: #fff;"));
const svg = renderSVG("https://noxapp.jp/liff/00000000-0000-0000-0000-000000000000?t=abcdefghijklmnopqrstuvwxyz012345&m=bind", { border: 1 });
check("q(2-4) 長さのある招待リンクでも QR の SVG ができる", svg.startsWith("<svg") && svg.length > 500);
check("q(3-1) リンクの文字と「リンクをコピー」は残る・添える文・注記（7 日・1 回だけ）", comp.includes('<span style={{ fontSize: 12, wordBreak: "break-all" }}>{url}</span>') && comp.includes('{copied ? "コピーしました ✓" : "リンクをコピー"}') && LINE_BIND_HAND_NOTE === "本人に直接お渡しください（QR を読み取ってもらえます）" && comp.includes("{LINE_BIND_NOTE}"));
check("q(4-1) リンクの作り方は不変（line_bind_token_create → liffBindUrlOf）", cb.includes("line_bind_token_create") && sb.includes("line_bind_token_create") && cb.includes("liffBindUrlOf(") && sb.includes("liffBindUrlOf("));

if (fails.length) { console.error(`✗ verify:nox-linebind-qr 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-linebind-qr OK (${pass} checks)`);
