import fs from "node:fs";
for (const f of ["step3.html", "step4.html"]) {
  const h = fs.readFileSync(`mock/onboarding-2026-08/${f}`, "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const t = h.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").split("\n").map((s) => s.trim()).filter(Boolean);
  console.log(`=== ${f} (${t.length} lines)`); console.log(t.join(" | ").slice(0, 3500));
}
