// supabase/functions/daily-reminder/index.ts
// Edge Function que dispara el recordatorio diario a los usuarios suscritos.
//
// Disparada cada hora por pg_cron (ver supabase/migrations/20260510_push_setup.sql).
// Lee push_subscriptions + user_settings, filtra por hora local AR (-3) y por
// usuarios que NO cargaron movimientos hoy, y manda Web Push usando VAPID.
//
// Variables de entorno requeridas (configurar en Supabase Dashboard → Functions → Secrets):
//   SUPABASE_URL              → URL del proyecto (ya viene preconfigurada)
//   SUPABASE_SERVICE_ROLE_KEY → service role key (ya viene preconfigurada)
//   VAPID_PUBLIC_KEY          → clave pública VAPID (la del cliente)
//   VAPID_PRIVATE_KEY         → clave privada VAPID
//   VAPID_SUBJECT             → mailto:tu-email@ejemplo.com (contacto para push providers)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Hora local AR (UTC-3, sin DST desde 2009)
function arNow(): { hour: number; date: string } {
  const now = new Date();
  const arHour = (now.getUTCHours() - 3 + 24) % 24;
  const arDate = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  return { hour: arHour, date: arDate };
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_pushed_date: string | null;
}

interface SettingRow {
  user_id: string;
  budgets: string | null;
}

Deno.serve(async (req) => {
  try {
    // Permitir GET (cron) y POST (test manual). El secreto va en header opcional.
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const got = req.headers.get("x-cron-secret");
      if (got !== cronSecret) return new Response("forbidden", { status: 403 });
    }

    const { hour, date } = arNow();

    // 1) Traer todas las subs cuyos dueños tengan notif activado y hour = hour actual
    const { data: subs, error: subsErr } = await sb
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, last_pushed_date");
    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) {
      return Response.json({ ok: true, sent: 0, reason: "no_subs" });
    }

    const userIds = [...new Set(subs.map((s: SubRow) => s.user_id))];
    const { data: settings, error: setErr } = await sb
      .from("user_settings")
      .select("user_id, budgets")
      .in("user_id", userIds);
    if (setErr) throw setErr;

    const settingsByUser: Record<string, any> = {};
    (settings || []).forEach((s: SettingRow) => {
      try { settingsByUser[s.user_id] = s.budgets ? JSON.parse(s.budgets) : {}; }
      catch { settingsByUser[s.user_id] = {}; }
    });

    // 2) Filtrar usuarios elegibles
    const eligible: SubRow[] = subs.filter((s: SubRow) => {
      const b = settingsByUser[s.user_id] || {};
      const p = b.__prefs?.notif;
      if (!p?.enabled) return false;
      if (parseInt(p.hour, 10) !== hour) return false;
      if (s.last_pushed_date === date) return false;
      return true;
    });

    if (eligible.length === 0) {
      return Response.json({ ok: true, sent: 0, hour, date, reason: "no_eligible" });
    }

    // 3) Verificar que NO hayan cargado movimientos hoy (AR)
    const { data: txnsToday } = await sb
      .from("transactions")
      .select("user_id")
      .in("user_id", eligible.map((e) => e.user_id))
      .eq("date", date);
    const usersWithTxnToday = new Set((txnsToday || []).map((t: any) => t.user_id));
    const finalSet = eligible.filter((e) => !usersWithTxnToday.has(e.user_id));

    // 4) Mandar push a cada uno
    const payload = JSON.stringify({
      title: "¿Cargaste lo de hoy? 💰",
      body: "Apuntá tus gastos antes de que se te olviden.",
      url: "/",
    });

    let sent = 0;
    const deadEndpoints: string[] = [];
    await Promise.all(finalSet.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600, urgency: "normal" }
        );
        sent++;
      } catch (e: any) {
        console.warn("push fail:", s.endpoint.slice(-20), e?.statusCode, e?.message);
        // 404 / 410 → endpoint muerto, borrar
        if (e?.statusCode === 404 || e?.statusCode === 410) deadEndpoints.push(s.endpoint);
      }
    }));

    // 5) Marcar last_pushed_date para los enviados
    if (finalSet.length > 0) {
      const successIds = finalSet.filter((s) => !deadEndpoints.includes(s.endpoint)).map((s) => s.id);
      if (successIds.length > 0) {
        await sb.from("push_subscriptions").update({ last_pushed_date: date }).in("id", successIds);
      }
    }
    // 6) Limpiar endpoints muertos
    if (deadEndpoints.length > 0) {
      await sb.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return Response.json({ ok: true, hour, date, sent, eligible: finalSet.length, dead: deadEndpoints.length });
  } catch (e: any) {
    console.error("daily-reminder error:", e);
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
});
