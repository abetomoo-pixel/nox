// ■2（相談役 21:40）: 運営の「店を追加」・店の切り替え・2 店目の /setup の写しの枠を、本物の部品を静かに描いて写す（DB もセッションも使わない）。
//   使い方: npx tsx scripts/shots-multi-store-static.tsx（出力 docs の shots_1122/multi_store）
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { chromium } from "playwright-core";
import AddStorePanel from "../app/ops/orgs/[id]/add-store-panel";
import StoreSwitcher from "../components/nox/store-switcher";
import { docOf } from "./contrast-probe";
import { STORE_COPY_LABEL, STORE_COPY_NEVER, STORE_COPY_PARTS } from "../lib/nox/ops/store-add";

(globalThis as unknown as { React: typeof React }).React = React; // 部品のファイルは React を読まない（自動の JSX）
const OUT = "C:/Users/abet/Dropbox/cloude/nox/docs/tmp/shots_1122/multi_store"; fs.mkdirSync(OUT, { recursive: true });
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const wrap = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
const stores = [{ id: "00000000-0000-4000-8000-0000000000a1", name: "CLUB TEST 本店", setupDone: true }];
const copyBox = `<main class="nox-dark nox-setup-page" style="padding:16px"><div class="nox-inset" style="padding:10px 12px;display:grid;gap:6px" data-setup-copy="1"><b style="font-size:13.5px">CLUB TEST 本店 から写すもの</b>${STORE_COPY_PARTS.map((p) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="checkbox" checked style="margin-top:3px"><span><b>${STORE_COPY_LABEL[p].name}</b><span style="display:block;color:var(--sub);font-size:11.5px">${STORE_COPY_LABEL[p].what}</span></span></label>`).join("")}<p style="font-size:11.5px;color:var(--sub);margin:0">「この内容で始める」のときに写します。写すものの STEP の入力は使いません（確定の後にマスタで直せます）。${STORE_COPY_NEVER}</p></div></main>`;
const scenes = [
  { key: "s1_ops_add_store", html: `<main class="nox-dark" style="padding:16px">${wrap(React.createElement(AddStorePanel, { orgId: "00000000-0000-4000-8000-000000000001", stores }))}</main>` },
  { key: "s2_store_switch", html: `<main class="nox-dark" style="padding:16px">${wrap(React.createElement(StoreSwitcher, { stores: [...stores, { id: "b", name: "CLUB TEST 2 号店", setupDone: false }], currentId: stores[0].id }))}</main>` },
  { key: "s3_setup_copy", html: copyBox },
];
void (async () => {
const b = await chromium.launch({ channel: "msedge", headless: true });
for (const w of [375, 1024]) {
  const page = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const sc of scenes) { await page.setContent(docOf(sc.html), { waitUntil: "load" }); await page.screenshot({ path: `${OUT}/${sc.key}_${w}.png`, fullPage: true }); }
  await page.close();
}
await b.close();
console.log(`写し ${scenes.length * 2} 枚 → ${OUT}`);
})();
