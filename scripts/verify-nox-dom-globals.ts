/*
 * verify:nox-dom-globals — ★相談役 11/26 の夜便 N の N6 a（#17）: 囲みの外で、ブラウザに元からある名前（status・name・length・event・parent・top・origin・closed など）を
 *   素で読んでいる所を 0 にする。給与 › 明細の「この期間を確定する」が 2026-09-10（5d775032）から出なかった（status が window.status＝空の文字を指した）＝型の検査は通ってしまう。
 *   TypeScript の型の情報で、識別子がブラウザの宣言（lib.dom.d.ts）に結び付いている所を数える（window.status のように書いた所・プロパティの名前は数えない）。DB に触れない。
 *   使い方: npm run verify:nox-dom-globals
 */
import ts from "typescript";
import path from "node:path";

const NAMES = new Set(["status", "name", "length", "event", "parent", "top", "origin", "closed", "self", "frames", "opener", "external", "screen", "history", "length", "close", "stop", "open", "print", "find", "focus", "blur", "scroll", "menubar", "toolbar", "statusbar", "personalbar", "locationbar", "scrollbars", "frameElement", "defaultStatus", "orientation"]);
const cfgPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")!;
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));
const IN_SCOPE = /(^|[\\/])(app|components|lib)[\\/]/; // 道は「app/…」（頭に区切りが無い）と絶対の道の両方
const program = ts.createProgram(cfg.fileNames.filter((f) => IN_SCOPE.test(f) && /\.tsx?$/.test(f)), cfg.options);
const checker = program.getTypeChecker();
const hits: string[] = [];
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !IN_SCOPE.test(path.relative(".", sf.fileName))) continue;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && NAMES.has(node.text)) {
      const p = node.parent;
      const isPropName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node) || (ts.isPropertySignature(p) && p.name === node)
        || (ts.isJsxAttribute(p)) || (ts.isMethodDeclaration(p) && p.name === node) || (ts.isPropertyDeclaration(p) && p.name === node) || (ts.isBindingElement(p) && p.propertyName === node)
        || (ts.isShorthandPropertyAssignment(p) && false) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || (ts.isQualifiedName(p) && p.right === node) || (ts.isEnumMember(p));
      if (!isPropName) {
        const sym = checker.getSymbolAtLocation(node);
        const decl = sym?.declarations?.[0];
        const from = decl?.getSourceFile().fileName ?? "";
        if (/lib\.dom(\.[a-z]+)?\.d\.ts$/.test(from)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          hits.push(`${path.relative(".", sf.fileName)}:${line + 1} ${node.text}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const ok = hits.length === 0;
if (!ok) { console.error(hits.map((h) => `  FAIL: ブラウザの名前を素で読んでいる ${h}`).join("\n")); console.error(`verify:nox-dom-globals FAIL ${hits.length}`); process.exit(1); }
console.log(`verify:nox-dom-globals ALL PASS (1 assertions・走査 ${program.getSourceFiles().filter((s) => !s.isDeclarationFile && IN_SCOPE.test(path.relative(".", s.fileName))).length} ファイル)`);
