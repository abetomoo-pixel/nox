# R 段（裁定275）: nav.tsx に歯車の口・layout.tsx の groups 並び替え・topbar ロゴ／ログアウト集約・CSS
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)

# ── components/ui/nav.tsx
edit('components/ui/nav.tsx', [
 ('''export type NavItem = { href: string; label: string };
/** 群（label=null は見出しを出さない＝ホームや /mine のようなフラット表示） */
export type NavGroup = { label: string | null; items: NavItem[] };''',
  '''export type NavItem = { href: string; label: string };
/** 群（label=null は見出しを出さない＝ホームや /mine のようなフラット表示）。
 *  ★裁定275（M12/M13・2026-09-18）: gear=true の群は ≤899 で「その他」ではなく「歯車」Modal に出す（900+ のサイドバーでは従来どおり下部の群）。 */
export type NavGroup = { label: string | null; items: NavItem[]; gear?: boolean };'''),
 ('''export function TabBar({ groups, spPriority, hideSide = false }: { groups: NavGroup[]; spPriority?: string[]; hideSide?: boolean }) {
  const path = usePathname() ?? "";
  const [sheet, setSheet] = useState(false);
  // ★裁定251（M2）: Esc で閉じる（シートが開いている間だけ keydown を購読）
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);
  const flat = groups.flatMap((g) => g.items);''',
  '''export function TabBar({ groups, spPriority, hideSide = false, gear = false }: { groups: NavGroup[]; spPriority?: string[]; hideSide?: boolean; gear?: boolean }) {
  const path = usePathname() ?? "";
  const [sheet, setSheet] = useState(false);
  // ★裁定275: 歯車 Modal（gear=true の群＋ログアウト）。「その他」Modal と同形・同じ閉じ方。
  const [gearOpen, setGearOpen] = useState(false);
  // ★裁定251（M2）: Esc で閉じる（シートが開いている間だけ keydown を購読）
  useEffect(() => {
    if (!sheet && !gearOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSheet(false); setGearOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, gearOpen]);
  const flat = groups.flatMap((g) => g.items);
  // ★裁定275: ≤899 の振り分け＝gear 群は歯車へ・それ以外は従来どおり（spPriority 4 本＋残りは「その他」）
  const gearGroups = groups.filter((g) => g.gear);
  const gearItems = gearGroups.flatMap((g) => g.items);
  const nonGear = groups.filter((g) => !g.gear).flatMap((g) => g.items);'''),
 ('''  const primary = spPriority
    ? spPriority.map((href) => flat.find((it) => it.href === href)).filter((x): x is NavItem => !!x).slice(0, 4)
    : flat;
  const rest = flat.filter((it) => !primary.some((p) => p.href === it.href));
  const restActive = rest.some((it) => it.href === active);''',
  '''  const primary = spPriority
    ? spPriority.map((href) => nonGear.find((it) => it.href === href)).filter((x): x is NavItem => !!x).slice(0, 4)
    : nonGear;
  const rest = nonGear.filter((it) => !primary.some((p) => p.href === it.href));
  const restActive = rest.some((it) => it.href === active);
  const gearActive = gearItems.some((it) => it.href === active);'''),
 ('''        {rest.length > 0 && (
          <button type="button" className={restActive ? "nox-tab on" : "nox-tab"} onClick={() => setSheet(true)}>
            その他
          </button>
        )}
      </nav>''',
  '''        {rest.length > 0 && (
          <button type="button" className={restActive ? "nox-tab on" : "nox-tab"} onClick={() => setSheet(true)}>
            その他
          </button>
        )}
        {/* ★裁定275: 歯車＝設定系の群（マスタ／お知らせ／監査／ご契約）＋ログアウト。gear=false（/mine）では描かない */}
        {gear && (
          <button type="button" className={gearActive ? "nox-tab on" : "nox-tab"} aria-label="設定" onClick={() => setGearOpen(true)}>
            <span aria-hidden="true">⚙</span>
          </button>
        )}
      </nav>'''),
 ('''            })}
          </div>
        </Modal>
      )}
    </>
  );
}''',
  '''            })}
          </div>
        </Modal>
      )}

      {/* ★裁定275: 歯車 Modal＝「その他」Modal の写経（同じ部品・同じ閉じ方）。項目は gear=true の群のみ。
          脚にログアウト（form POST /auth/signout＝(manage)/layout の topbar と同じ経路・POST 不変）。 */}
      {gear && gearOpen && (
        <Modal onClose={() => setGearOpen(false)} maxWidth={520} scroll>
          <div className="nox-navsheet">
            <div className="nox-formmodal-head" style={{ marginBottom: 10 }}>
              <h2 className="nox-navsheet-h" style={{ margin: 0 }}>設定</h2>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setGearOpen(false)}>×</button>
            </div>
            {gearGroups.map((g, gi) => (
              <div key={g.label ?? `gear${gi}`} className="nox-navsheet-g">
                {g.label && <div className="nox-navgroup-h">{g.label}</div>}
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href}
                    className={it.href === active ? "nox-navsheet-i on" : "nox-navsheet-i"}
                    onClick={() => setGearOpen(false)}>
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="nox-navsheet-g nox-actions" style={{ marginTop: 14 }}>
              <form action="/auth/signout" method="post" style={{ display: "flex" }}>
                <button type="submit" className="nox-btn ghost">ログアウト</button>{/* ★裁定242-(6): ログアウト＝補助（青枠） */}
              </form>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}'''),
])

# ── app/(manage)/layout.tsx
edit('app/(manage)/layout.tsx', [
 ('''        { label: "分析", items: [
          ...(isManagerUp ? [{ href: "/analytics", label: "分析" }] : []),
          // R2-c（mig0099）: 領収書の発行台帳（RLS select も owner/manager 自店＝表示ナビと二重）
          ...(isManagerUp ? [{ href: "/receipts", label: "領収書" }] : []),
        ] },
        { label: "店舗", items: [''',
  '''        { label: "分析", items: [
          ...(isManagerUp ? [{ href: "/analytics", label: "分析" }] : []),
          // R2-c（mig0099）: 領収書の発行台帳（RLS select も owner/manager 自店＝表示ナビと二重）
          ...(isManagerUp ? [{ href: "/receipts", label: "領収書" }] : []),
          // ★裁定275（M13）: 「その他」に在庫のリンク 1 本（既存画面 /master/stock＝MASTER_NAV の商品・料金群にもある・URL 不変）
          ...(isManagerUp ? [{ href: "/master/stock", label: "在庫" }] : []),
        ] },
        // ★裁定275（M12/M13）: 店舗群＝歯車の口（≤899 は歯車 Modal・900+ はサイドバー下部＝並びは従来どおり最後）。項目集合・role 条件は不変。
        { label: "店舗", gear: true, items: ['''),
 ('''            <div className="crumb" aria-hidden="true" />
            <div className="acts">
              <span style={t.rolePill}>{t.roleLabelJa(role as string)}</span>
              <form action="/auth/signout" method="post" style={{ display: "flex" }}>
                <button type="submit" className="nox-btn ghost">ログアウト</button>{/* ★裁定242-(6): ログアウト＝補助（青枠） */}
              </form>
            </div>''',
  '''            {/* ★裁定275（M12）: ≤899 はヘッダ左にロゴ（SideNav の .brand 写経・900+ はサイドバーに同じ brand があるため CSS で隠す＝同じ情報を 2 箇所に出さない） */}
            <div className="crumb nox-tb-brand" aria-hidden="true"><span className="brandmark">N</span><b>NOX</b></div>
            <div className="acts">
              <span style={t.rolePill}>{t.roleLabelJa(role as string)}</span>
              {/* ★裁定275（M12）: ≤899 のログアウトは下タブの歯車 Modal に集約（CSS で隠す）。900+ は従来どおりここ。POST /auth/signout は不変 */}
              <form action="/auth/signout" method="post" className="nox-tb-logout" style={{ display: "flex" }}>
                <button type="submit" className="nox-btn ghost">ログアウト</button>{/* ★裁定242-(6): ログアウト＝補助（青枠） */}
              </form>
            </div>'''),
 ('''      <TabBar groups={groups} spPriority={["/dashboard", "/register", "/shift", "/casts"]} hideSide />''',
  '''      {/* ★裁定275（M13）: 下タブ＝ホーム／レジ／日報／シフト（旧: ホーム／レジ／シフト／キャスト）・その他＝残り（キャスト／スタッフ／顧客／給与／分析／領収書／在庫）・歯車＝店舗群＋ログアウト */}
      <TabBar groups={groups} spPriority={["/dashboard", "/register", "/report", "/shift"]} hideSide gear />'''),
])

# ── app/globals.css
edit('app/globals.css', [
 ('''.nox-tb .acts { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }''',
  '''.nox-tb .acts { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
/* ★裁定275（M12・2026-09-18）: ≤899 のヘッダ左ロゴ（.nox-side .brand の縮小写経）と、ログアウトの歯車集約。900+ は従来の見た目（ロゴ非表示・ログアウトは topbar） */
.nox-tb .nox-tb-brand { display: flex; align-items: center; gap: 8px; color: var(--ink); }
.nox-tb .nox-tb-brand .brandmark { width: 26px; height: 26px; border: 1px solid var(--gold); border-radius: 6px; display: grid; place-items: center; color: var(--gold2); font: 12px var(--font-serif); flex-shrink: 0; }
.nox-tb .nox-tb-brand b { font-size: 13px; }
@media (min-width: 900px) {
  .nox-tb .nox-tb-brand { display: none; }
}
@media (max-width: 899px) {
  .nox-tb .nox-tb-logout { display: none !important; }
}'''),
])
print("R patch done")
