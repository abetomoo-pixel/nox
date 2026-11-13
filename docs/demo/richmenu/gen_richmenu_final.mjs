// gen_richmenu_final.mjs — キャストの LINE のリッチメニュー（横 3）の確定版（2026-11-13 夜・相談役■10＝店が OA Manager で手で登録する画像・赤い印なし）
//   使い方: node docs/demo/richmenu/gen_richmenu_final.mjs
//   出力: docs/demo/richmenu/nox_cast_richmenu_2500x843.png・…_1200x405.png・areas_2500x843.json（押せる範囲＝画像と同じスクリプトで書くので、ずれない）
//   決まり（LINE の公式文書・docs/tmp/report_line_richmenu_1113.md §d）: PNG・幅 800〜2500・高さ 250 以上・縦横比 1.45 以上・1 MB まで・areas 20 個まで。
//   素材: public/brand/nox_wordmark_white.svg の形を金で塗る（ロゴの金 #D4AF6A＝public/brand/README.md）・地 #070707（app/globals.css --bg）。
//   文字: Windows の BIZ UDゴシック（C:\Windows\Fonts\BIZ-UDGothicB.ttc）を pango で描く（文言が決まったら PNG を 1 枚に固定して置く）。
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = "docs/demo/richmenu";
const W = 2500, H = 843, BAND = 143, AREA_H = H - BAND;
const GOLD = "#D4AF6A", GOLD_SOFT = "#8a7346", BG = "#070707", INK = "#f4f1e9", SUB = "#b8b2a8";
const FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc", FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc";
const ITEMS = [
  { key: "shift", title: "シフト", sub: "予定・希望", icon: "calendar" },
  { key: "notices", title: "お知らせ", sub: "店舗からの連絡", icon: "bell" },
  { key: "home", title: "ホーム", sub: "マイページ", icon: "home" },
];
const xs = [0, 833, 1667], ws = [833, 834, 833];

// 線画のアイコン（120×120 の枠・金の線）
const ICON = {
  calendar: `<rect x="10" y="22" width="100" height="88" rx="12" fill="none" stroke="${GOLD}" stroke-width="7"/><line x1="10" y1="48" x2="110" y2="48" stroke="${GOLD}" stroke-width="7"/><line x1="36" y1="8" x2="36" y2="34" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/><line x1="84" y1="8" x2="84" y2="34" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/><circle cx="38" cy="70" r="6" fill="${GOLD}"/><circle cx="60" cy="70" r="6" fill="${GOLD}"/><circle cx="82" cy="70" r="6" fill="${GOLD}"/><circle cx="38" cy="90" r="6" fill="${GOLD}"/><circle cx="60" cy="90" r="6" fill="${GOLD}"/>`,
  bell: `<path d="M60 12 C38 12 26 30 26 52 L26 78 L14 94 L106 94 L94 78 L94 52 C94 30 82 12 60 12 Z" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linejoin="round"/><path d="M46 102 C48 112 72 112 74 102" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/>`,
  home: `<path d="M12 58 L60 16 L108 58" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 50 L26 108 L94 108 L94 50" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linejoin="round"/><rect x="48" y="72" width="24" height="36" rx="3" fill="none" stroke="${GOLD}" stroke-width="7"/>`,
};

// ロゴ（public/brand/nox_wordmark_white.svg の形を金に）
const wordmark = fs.readFileSync("public/brand/nox_wordmark_white.svg", "utf8").replace(/#FFFFFF/g, GOLD);
const wmInner = wordmark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${ITEMS.map((it, i) => `
  <rect x="${xs[i] + 28}" y="28" width="${ws[i] - 56}" height="${AREA_H - 44}" rx="36" fill="#0d0c0a" stroke="${GOLD}" stroke-width="6"/>
  <g transform="translate(${xs[i] + ws[i] / 2 - 90} 92) scale(1.5)">${ICON[it.icon]}</g>`).join("")}
  <line x1="60" y1="${AREA_H}" x2="${W - 60}" y2="${AREA_H}" stroke="${GOLD_SOFT}" stroke-width="2"/>
  <g transform="translate(${W / 2 - 137} ${AREA_H + 26}) scale(0.3)">${wmInner}</g>
</svg>`;

const text = async (t, font, size, color) => {
  const img = sharp({ text: { text: `<span foreground="${color}">${t}</span>`, fontfile: font, font: "BIZ UDGothic " + size, rgba: true, dpi: 72 } });
  const buf = await img.png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height };
};

const layers = [];
for (const [i, it] of ITEMS.entries()) {
  const t1 = await text(it.title, FONT_B, 104, INK);
  const t2 = await text(it.sub, FONT_R, 60, SUB);
  layers.push({ input: t1.buf, left: Math.round(xs[i] + ws[i] / 2 - t1.w / 2), top: 330 });
  layers.push({ input: t2.buf, left: Math.round(xs[i] + ws[i] / 2 - t2.w / 2), top: 480 });
}

const big = await sharp(Buffer.from(svg)).composite(layers).png({ palette: true, compressionLevel: 9, colours: 128 }).toBuffer();
const pBig = path.join(OUT, "nox_cast_richmenu_2500x843.png");
fs.writeFileSync(pBig, big);
const small = await sharp(big).resize(1200, 405).png({ palette: true, compressionLevel: 9, colours: 128 }).toBuffer();
const pSmall = path.join(OUT, "nox_cast_richmenu_1200x405.png");
fs.writeFileSync(pSmall, small);

// 押せる範囲（帯は押せない＝height は帯の上まで）
const areas = ITEMS.map((it, i) => ({ bounds: { x: xs[i], y: 0, width: ws[i], height: AREA_H }, action: { type: "uri", label: it.title, uri: `https://liff.line.me/<店の liffId>?to=${it.key}` } }));
const json = { size: { width: W, height: H }, selected: true, name: "nox-cast-3", chatBarText: "メニュー", areas };
fs.writeFileSync(path.join(OUT, "areas_2500x843.json"), JSON.stringify(json, null, 2) + "\n");

// 決まりの assert
for (const [p, w, h] of [[pBig, 2500, 843], [pSmall, 1200, 405]]) {
  const m = await sharp(p).metadata(); const kb = fs.statSync(p).size / 1024;
  if (m.width !== w || m.height !== h || m.format !== "png" || w < 800 || w > 2500 || h < 250 || w / h < 1.45 || kb >= 1024) throw new Error(`決まりに合わない ${p} ${m.width}x${m.height} ${kb.toFixed(0)}KB`);
  console.log(path.basename(p), `${m.width}x${m.height}`, `比 ${(w / h).toFixed(2)}`, `${kb.toFixed(0)} KB`);
}
if (areas.reduce((s, a) => s + a.bounds.width, 0) !== W || areas.length > 20 || json.chatBarText.length > 14) throw new Error("areas の決まり");
console.log("areas", areas.map((a) => `${a.action.label} x=${a.bounds.x} w=${a.bounds.width} h=${a.bounds.height}`).join(" ／ "));
