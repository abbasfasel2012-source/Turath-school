// Supabase Edge Function: push
// action "subscribe": يحفظ اشتراك جهاز المستخدم في جدول push_subscriptions
// action "notify":    يرسل Web Push بعد إضافة تبليغ/درس/إنذار/ملاحظة/طلب إجازة
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEY = "sb_publishable_E_QKhnQWZEXbRYcCkmL5uw_9Rceu07S";
const SITE_URL = "https://taha602.github.io/turath-school/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const TABLES = ["announcements", "lessons", "warnings", "student_notes", "leave_requests"];
const trim = (s: unknown, n = 160) => String(s ?? "").slice(0, n);

// طلبات بصلاحيات المستخدم نفسه (نفس سياسات RLS)
async function asUser(path: string, token: string) {
  const r = await fetch(SB_URL + path, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  return r.ok ? await r.json() : null;
}

async function verify(token: string) {
  const user = await asUser("/auth/v1/user", token);
  if (!user?.id) return null;
  const rows = await asUser(
    `/rest/v1/profiles?id=eq.${user.id}&select=id,role,full_name`,
    token,
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.token !== "string" || body.token.length < 10) {
      return json({ error: "bad request" }, 400);
    }

    const me = await verify(body.token);
    if (!me) return json({ error: "unauthorized" }, 401);

    // ---------- حفظ الاشتراك ----------
    if (body.action === "subscribe") {
      const sub = body.subscription;
      if (
        !sub?.endpoint?.startsWith("https://") || !sub?.keys?.p256dh || !sub?.keys?.auth
      ) {
        return json({ error: "bad subscription" }, 400);
      }
      const { error } = await admin.from("push_subscriptions").upsert(
        {
          user_id: me.id,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
        { onConflict: "endpoint" },
      );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ---------- إرسال إشعار ----------
    if (body.action !== "notify" || !TABLES.includes(body.table)) {
      return json({ error: "bad request" }, 400);
    }
    const t: string = body.table;
    const op: string = body.op;

    const q = body.id
      ? `/rest/v1/${t}?id=eq.${encodeURIComponent(body.id)}&select=*`
      : `/rest/v1/${t}?select=*&order=created_at.desc&limit=1`;
    const rows = await asUser(q, body.token);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json({ error: "not found" }, 404);

    if (op === "insert" && Date.now() - new Date(row.created_at).getTime() > 5 * 60_000) {
      return json({ ok: true, skipped: "old" });
    }

    const staff = me.role === "admin" || me.role === "teacher";
    let title = "";
    let text = "";
    let audience: { all?: true; users?: string[]; roles?: string[] } = {};

    if (t === "announcements" && op === "insert" && staff) {
      title = "📢 إعلان جديد: " + trim(row.title, 80);
      text = trim(row.content);
      audience = { all: true };
    } else if (t === "lessons" && op === "insert" && staff) {
      title = "📚 درس جديد: " + trim(row.title, 80);
      text = trim(row.content);
      audience = { all: true };
    } else if (t === "warnings" && op === "insert" && staff) {
      title = "⚠️ تم تسجيل إنذار عليك";
      text = trim(row.reason);
      audience = { users: [row.student_id] };
    } else if (t === "student_notes" && op === "insert" && staff) {
      title = "📝 ملاحظة جديدة من الأستاذ";
      text = trim(row.content);
      audience = { users: [row.student_id] };
    } else if (t === "leave_requests" && op === "insert") {
      title = "🗓️ طلب إجازة جديد" + (me.full_name ? " — " + trim(me.full_name, 60) : "");
      text = trim(row.reason) +
        (row.start_date ? `\nمن ${row.start_date} إلى ${row.end_date || row.start_date}` : "");
      audience = { roles: ["admin", "teacher"] };
    } else if (
      t === "leave_requests" && op === "update" && staff &&
      ["approved", "rejected"].includes(row.status)
    ) {
      title = row.status === "approved"
        ? "✅ تمت الموافقة على طلب إجازتك"
        : "❌ تم رفض طلب إجازتك";
      text = row.start_date ? `من ${row.start_date} إلى ${row.end_date || row.start_date}` : "";
      audience = { users: [row.student_id] };
    } else {
      return json({ ok: true, skipped: "no audience" });
    }

    let dq = admin.from("push_subscriptions")
      .select("endpoint,p256dh,auth,user_id")
      .neq("user_id", me.id);

    if (audience.users) dq = dq.in("user_id", audience.users.filter(Boolean));
    if (audience.roles) {
      const { data: ps } = await admin.from("profiles").select("id").in("role", audience.roles);
      dq = dq.in("user_id", (ps ?? []).map((p) => p.id));
    }
    const { data: devices } = await dq.limit(2000);

    const payload = JSON.stringify({
      title,
      body: text,
      url: SITE_URL,
      tag: `${t}:${row.id}`,
    });

    const dead: string[] = [];
    let sent = 0;
    await Promise.all(
      (devices ?? []).map(async (d) => {
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            { TTL: 86400, urgency: "high" },
          );
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(d.endpoint);
          else console.error("push error", e.statusCode, e.body);
        }
      }),
    );
    if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);

    return json({ ok: true, sent, removed: dead.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
