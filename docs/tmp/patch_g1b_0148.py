# G-1 pin 行: 変遷チェーン末尾＋f0 新基準 pin 行（引数: run1秒 run2秒 件数 HEAD run1開始 run2開始 段別内訳）
import sys
r1s, r2s, total, head, t1, t2, detail = sys.argv[1:8]
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)
L = 'docs/NOX_裁定台帳.md'
edit(L, [
 ('''→ **53 本 4,200**（4,175＋late 新設 25（裁定268）・2026-09-17 2 連緑 467s／531s・同一 HEAD 2f3377e）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。''',
  f'''→ **53 本 4,200**（4,175＋late 新設 25（裁定268）・2026-09-17 2 連緑 467s／531s・同一 HEAD 2f3377e）。→ **58 本 {total}**（4,200＋478303d の client 前倒し分（product-bulk 35→39・setup 56→61・payroll-adjust 101→102）＋0148＝carryover 新設 30・referral 新設 25・cast-norm-self 新設 16・product-types 新設 20・receivable-policy 新設 13＋既存追随（anon-guard 988→992・receipt 64→67・pricing 150→151・payroll-adjust 102→110）・2026-09-18 2 連緑 {r1s}s／{r2s}s・同一 HEAD {head}）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。'''),
 ('''内訳＝4,175＋verify:nox-late 新設 25（裁定268・53 段目）。他 52 段は同日 16 時台の pin と同一。push＝`e3b73a0..2f3377e`（2f3377e＝裁定268 遅刻分数の表示）。''',
  f'''内訳＝4,175＋verify:nox-late 新設 25（裁定268・53 段目）。他 52 段は同日 16 時台の pin と同一。push＝`e3b73a0..2f3377e`（2f3377e＝裁定268 遅刻分数の表示）。
- **f0 新基準 pin（2026-09-18・58 段 {total}・mig0148／裁定272）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 11:51:52＝backends 20・postmaster 2026-09-15 16:46・orgs 3／run2 前 12:02:44 同値・他プロジェクトの verify なし）→ run1 {r1s}s（{t1} 起動）／run2 {r2s}s（{t2} 起動）＝いずれも **58 段 ALL PASS・{total}・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `{head}`**。段別内訳（run2 実測）＝{detail}。★本 pin の前に run（11:43〜11:50・39 段まで緑）が 40 段目 reopen ro(3b-4)／(3b-6) で赤＝check_add_referral の assert_day_open 行で呼出関数 15→16／16→17（張り替え `d7a2084`）。その run は無効・run2 は起動直後（sleep 中）に停止し DB 不触。push＝`580718a..{head}`（478303d＝client 前倒し／fe0e19c＝v37 収蔵／8af0be5＝0148 SQL＋名簿・pin＋suite 5 本＋三面鏡／d7a2084＝reopen pin）。'''),
])
print("G-1 pin rows done")
