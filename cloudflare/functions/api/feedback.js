// Feedback box for hotscrap.com (Cloudflare Pages Function, D1 binding DB, secret ADMIN_KEY).
//   POST   /api/feedback          {kind, message, contact?, page?, website?}  -> stores one entry
//   GET    /api/feedback          header X-Admin-Key                          -> newest entries (?before=<id>)
//   DELETE /api/feedback?id=<id>  header X-Admin-Key                          -> removes one
// Spam: "website" is a field people never see (bots fill it: answered as sent, not stored), and each sender (a
// salted hash of the IP, nothing else kept about them) may send 3 a minute and 20 a day.
const KINDS = ["bug", "idea", "etc"];
const LIMITS = { message: 2000, contact: 100, page: 300, ua: 300, perMinute: 3, perDay: 20 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isAdmin(request, env) {
  const given = request.headers.get("x-admin-key") || "";
  const want = env.ADMIN_KEY || "";
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청" }, 400);
  }
  if (body.website) return json({ ok: true });   // the hidden field: a bot
  const kind = KINDS.includes(body.kind) ? body.kind : "etc";
  const message = String(body.message || "").trim();
  if (message.length < 5) return json({ ok: false, error: "내용을 5자 이상 적어 주세요" }, 400);
  if (message.length > LIMITS.message) return json({ ok: false, error: `내용은 ${LIMITS.message}자까지예요` }, 400);
  const clip = (v, n) => String(v || "").trim().slice(0, n) || null;

  const ip = request.headers.get("cf-connecting-ip") || "";
  const ipHash = (await sha256(`hotscrap-feedback:${ip}`)).slice(0, 32);
  const now = new Date();
  const ago = (ms) => new Date(now - ms).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT SUM(created_at > ?2) AS minute, COUNT(*) AS day FROM feedback WHERE ip_hash = ?1 AND created_at > ?3",
  ).bind(ipHash, ago(60e3), ago(864e5)).all();
  const sent = results[0] || {};
  if ((sent.minute || 0) >= LIMITS.perMinute || (sent.day || 0) >= LIMITS.perDay)
    return json({ ok: false, error: "잠시 뒤에 다시 보내 주세요" }, 429);

  await env.DB.prepare(
    "INSERT INTO feedback (created_at, kind, message, contact, page, ua, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  ).bind(now.toISOString(), kind, message, clip(body.contact, LIMITS.contact), clip(body.page, LIMITS.page),
    clip(request.headers.get("user-agent"), LIMITS.ua), ipHash).run();
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "비밀번호가 틀렸어요" }, 401);
  const before = Number(new URL(request.url).searchParams.get("before")) || 2 ** 31;
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, kind, message, contact, page, ua FROM feedback WHERE id < ?1 ORDER BY id DESC LIMIT 100",
  ).bind(before).all();
  const { results: total } = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback").all();
  return json({ ok: true, total: total[0].n, items: results });
}

export async function onRequestDelete({ request, env }) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "비밀번호가 틀렸어요" }, 401);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return json({ ok: false, error: "id 가 없어요" }, 400);
  await env.DB.prepare("DELETE FROM feedback WHERE id = ?1").bind(id).run();
  return json({ ok: true });
}
