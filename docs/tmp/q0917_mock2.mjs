import fs from "node:fs";
for (const f of ["step1.html", "step1-cabaret.html", "step2-cabaret.html", "step5.html", "done.html"]) {
  const h = fs.readFileSync(`mock/onboarding-2026-08/${f}`, "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const t = h.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").split("\n").map((s) => s.trim()).filter(Boolean);
  const i = t.findIndex((s) => /通常のHTMLページ遷移/.test(s));
  console.log(`=== ${f}`); console.log(t.slice(i + 1).join(" | ").slice(0, 1400));
}
