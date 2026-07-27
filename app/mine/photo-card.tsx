"use client";

// 段P: マイページのプロフィール写真カード（cast 本人の自分の写真のみ）。
// 取得も更新も本人スコープ＝auth_cast_id() で自分の cast 行を引き（casts_select の id=auth_cast_id() 腕）、
// アップロードは Storage ポリシー（filename = auth_cast_id().jpg 腕）＋ set_cast_photo_updated_at の本人腕。
// ★新情報は出さない（既存 name と自分の写真だけ・金額/評価系ゼロ）＝cast プライバシー不変。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { resolveOrgId, signCastPhoto, uploadCastPhoto } from "@/lib/nox/cast-photo";

type Me = { id: string; name: string; photo_updated_at: string | null };

export default function PhotoCard() {
  const [supabase] = useState(() => createClient());
  const [me, setMe] = useState<Me | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [org, { data: castId }] = await Promise.all([
        resolveOrgId(supabase),
        supabase.rpc("auth_cast_id"),
      ]);
      if (!alive || !org || !castId) return;
      setOrgId(org);
      const { data } = await supabase
        .from("casts")
        .select("id, name, photo_updated_at")
        .eq("id", castId as string)
        .maybeSingle();
      if (!alive || !data) return;
      const row = data as Me;
      setMe(row);
      const u = await signCastPhoto(supabase, org, row.id, row.photo_updated_at);
      if (alive) setUrl(u);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPick(f: File | null) {
    if (!f || !me || !orgId) return;
    setBusy(true); setErr(null); setDone(false);
    try {
      const stamped = await uploadCastPhoto(supabase, orgId, me.id, f);
      const u = await signCastPhoto(supabase, orgId, me.id, stamped);
      setMe({ ...me, photo_updated_at: stamped });
      setUrl(u);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // 取得前・cast 結線なし（想定外）は何も出さない＝マイページの他カードに影響しない
  if (!me) return null;

  return (
    <section className="nox-cardtop" style={t.card}>
      <h2 style={t.cardTitle}>プロフィール写真</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
        <CastAvatar name={me.name} url={url} size={64} />
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={t.fieldLabel}>{me.photo_updated_at ? "写真を変更（JPEG/PNG）" : "写真を登録（JPEG/PNG）"}</span>
            <input type="file" accept="image/*" disabled={busy}
              onChange={(e) => { void onPick(e.target.files?.[0] ?? null); e.target.value = ""; }}
              style={{ fontSize: 13 }} />
          </label>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>
            自動で縮小されます。シフトなど店内の画面に表示されます。
          </p>
          {busy && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>保存中…</p>}
          {done && !busy && <p style={{ fontSize: 12.5, color: "var(--ok)", margin: 0 }}>保存しました</p>}
          {err && <p style={{ ...t.bad, fontSize: 12.5, margin: 0 }}>{err}</p>}
        </div>
      </div>
    </section>
  );
}
