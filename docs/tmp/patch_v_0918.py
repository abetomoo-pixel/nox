# V 段: 裁定276 の逐語収載＋f0 pin 節の 1 行
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
NEW = '''## 裁定276（本便で確定・Agoora「推奨で」・2026-09-18）デモの種と 0149 の形（276-1〜5）

出典＝相談役ブロック 2026-09-18 午後（0149 事前読取 docs/tmp/0149_pre.md u1〜u8 を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定276 デモの種と 0149 の形]
 276-1 種は録画再生。TS に pricing_resolve_core・按分・時間課金の鏡像を新設しない。実 RPC で作って閉じた伝票の行を JSON に録り、
   日付は営業日からの相対で保存→リセット時に今日へずらして投入。延長は open 後に started_at を過去へ UPDATE してから close。
   録画は 1 トランザクション内で SELECT→ROLLBACK。給与 run・日報は録画に含めず再生後に正規経路で作る。
 276-2 demo_org_reset は表非依存の汎用形(固定の表順で削除→逆順に payload->'表名' を jsonb_populate_recordset)。
   orgs・org_billing・users・memberships は残す。check_lines の後に stock_logs を再削除。payload に stock_logs の sale 行を入れない・drink_claims は最後。
 276-3 mig 0149＝orgs.is_demo boolean・orgs.demo_reset_at timestamptz・RPC demo_org_reset 1 本。名簿 B(a)・INTERNAL_PROBES。
   org／org_billing の作成は mig 外の一度きりスクリプト。
 276-4 柵＝route 冒頭 assertNotDemo × 12 系＋34 route 全数の許可列挙 suite(裁定260 型)。middleware/JWT claim は不採用。
   cast-photo は導線を隠す＋storage policy(パスから org を引ければ 0149 同乗)。
 276-5 cron は Vercel Pro 後に 3 本目。それまでは手動リセット。
 未決★ auth.updateUser のメール変更は Auth 設定で対処(mig と独立・公開のブロッカー)。」

適用＝未着手（事前読取の追補＝docs/tmp/0149_pre.md w1〜w6・録画再生の PoC＝scripts/demo/poc-record.mjs＋docs/tmp/0149_poc.md＝本便 X・コミットしない）。

'''
edit(L, [
 ('''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先''',
  NEW + '''## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先'''),
 ('''push＝`bc56be6..9e6cf85`（91e53f7＝M5 文言＋payment-tax-panel／10f15a1＝裁定273〜275／ee2a3fc＝M15・M18／2c379bf＝M12・M13／9e6cf85＝R15）。''',
  '''push＝`bc56be6..9e6cf85`（91e53f7＝M5 文言＋payment-tax-panel／10f15a1＝裁定273〜275／ee2a3fc＝M15・M18／2c379bf＝M12・M13／9e6cf85＝R15）。
- **所要の観察（2026-09-18・相談役）**: 9/18 日中の f0＝939s／1013s（夜間 9/17 の 467s／531s 比で約 2 倍・段数は 53→59・BANZEN 並走なし・backends 16〜20）＝**Compute 引き上げ（裁定262）は「f0 が 20 分超」を先行実施の目安**とする（公開デモの前提＝裁定273 未決★と同じ Pro／Compute の束）。'''),
])
print("V patch done")
