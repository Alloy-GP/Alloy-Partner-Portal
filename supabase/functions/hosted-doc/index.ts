import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// hosted-doc — the password gate + open log for standalone HTML documents
// served shell-less at growth.alloygp.co/p/<slug> (src/components/hosted-doc.jsx).
//
// A reader has NO portal session, so RLS can't serve them — this fn does. The
// only credential is the document's shared review password (hosted_docs.password),
// compared here before anything is returned. A match appends one `open` row to
// hosted_doc_events (service role; the table has no client write policy) and
// returns the document HTML. A miss appends a `denied` row and returns 403 with
// no document content. Expired documents (expires_at in the past) return 410.
//
// verify_jwt: true — the page sends the public anon key (already in the bundle)
// to clear the gateway, exactly like proposal-board; the password is the real gate.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

// Length-independent-ish comparison so timing doesn't leak the password prefix.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const slug = str(body?.slug, 64).trim().toLowerCase();
    const password = str(body?.password, 256);
    if (!SLUG_RE.test(slug)) return json({ error: "bad_slug" }, 400);
    if (!password) return json({ error: "password_required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: doc, error: e1 } = await admin
      .from("hosted_docs")
      .select("id, title, password, html, expires_at")
      .eq("slug", slug)
      .maybeSingle();
    if (e1) return json({ error: "lookup_failed" }, 500);
    if (!doc) return json({ error: "not_found" }, 404);

    // Who opened it (anonymous): per-device key from the page + request metadata.
    const event = {
      doc_id: doc.id,
      viewer_key: str(body?.viewerKey ?? body?.viewer_key, 64),
      user_agent: str(req.headers.get("user-agent"), 300),
      referrer: str(req.headers.get("referer"), 300),
      ip: str((req.headers.get("x-forwarded-for") || "").split(",")[0].trim(), 64),
    };

    if (!safeEqual(password, String(doc.password || ""))) {
      await admin.from("hosted_doc_events").insert({ ...event, event_type: "denied" });
      return json({ error: "wrong_password" }, 403);
    }

    if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) {
      return json({ error: "expired" }, 410);
    }

    const { error: e2 } = await admin.from("hosted_doc_events").insert({ ...event, event_type: "open" });
    if (e2) console.error("hosted-doc: open event insert failed", e2.message); // still serve the doc

    return json({ ok: true, title: doc.title || "", html: doc.html || "" });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
