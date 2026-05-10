# Setup: Notificaciones push reales (servidor)

Esta guía es para activar el recordatorio diario que **llega aunque la app esté cerrada**. Es ~15 min de setup en Supabase, una sola vez.

Sin estos pasos, el toggle de "Recordarme cargar gastos" igual funciona como recordatorio in-app (notif local cuando abrís la app a la hora elegida o después). Con estos pasos, lo recibís en el celular sin abrir nada.

---

## Pre-requisitos

- Cuenta gratis de Supabase (la que ya usás).
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) instalado: `npm i -g supabase` o `scoop install supabase` en Windows.

## Paso 1: SQL — tabla y cron

Andá a **Supabase Dashboard → SQL Editor → New query**, copiá el archivo [`supabase/migrations/20260510_push_setup.sql`](supabase/migrations/20260510_push_setup.sql) y antes de ejecutarlo reemplazá:

- `<PROJECT_REF>` → tu ref de Supabase (mirá tu URL: `https://XXXX.supabase.co` → `XXXX`)
- `<CRON_SECRET>` → un string aleatorio cualquiera (ej: `mf_abc123xyz`). Anotalo, lo vas a usar en el paso 3.

Ejecutá. Te crea:
- Tabla `push_subscriptions` con RLS por dueño.
- Job `daily-reminder-hourly` que corre cada hora en el minuto 0 y llama a la Edge Function.

## Paso 2: Deploy de la Edge Function

Desde la raíz del repo (en tu PC):

```bash
supabase login                           # una sola vez, abre el browser
supabase link --project-ref <PROJECT_REF>
supabase functions deploy daily-reminder
```

## Paso 3: Variables de entorno (secrets) de la function

```bash
supabase secrets set VAPID_PUBLIC_KEY="BDlOqQE2PhLVJs5KyHME397Bl78afM3cagfJGm0BZzQ0aFdT3rTksuE39e7J8aApV4ob_wgjZH66cbO3UUVkD14"
supabase secrets set VAPID_PRIVATE_KEY="siIHhvg0i6RhqIq257Zfmo_qfCkgZHAbloNlxKqZDGs"
supabase secrets set VAPID_SUBJECT="mailto:facundito28@gmail.com"
supabase secrets set CRON_SECRET="<el mismo string que pusiste en el paso 1>"
```

> ⚠️ La **VAPID_PRIVATE_KEY** es secreta. Si se filtra, regenerá ambas claves con:
> `openssl ecparam -name prime256v1 -genkey -noout -out vapid.pem` y exportalas en formato base64url.
> Después actualizá la `VAPID_PUBLIC` en `index.html` (línea con `var VAPID_PUBLIC=`).

## Paso 4: Probar

1. Abrí la app en el celular (instalada como PWA en iOS, navegador normal en Android).
2. Ajustes → Cuenta → activá **"Recordarme cargar gastos"**.
3. El toast debería decir: *"Recordatorio activado ✓ (llega cerrada)"*. Si dice sólo *"Recordatorio activado ✓"*, el subscribe falló (revisá la consola).
4. Para probar sin esperar a la próxima hora exacta, llamá la function manualmente:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/daily-reminder" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

Si tu hora actual coincide con la elegida (default 21:00) y no cargaste movimientos hoy, te llega el push.

## Cómo funciona

```
[pg_cron cada hora]
       │
       ▼
[pg_net.http_post → Edge Function]
       │
       ├─→ Lee push_subscriptions + user_settings (prefs.notif.hour, enabled)
       ├─→ Filtra: hora AR actual = pref.hour, last_pushed != hoy, sin txns hoy
       ├─→ webpush.sendNotification(...) usando VAPID
       ├─→ Marca last_pushed_date = hoy en cada sub enviada
       └─→ Borra endpoints muertos (404/410)
```

**Timezone**: hardcodeado a Argentina UTC-3. Si querés otra zona, cambiá `arNow()` en [`supabase/functions/daily-reminder/index.ts`](supabase/functions/daily-reminder/index.ts).

## Troubleshooting

- **"no_subs"** en el response: nadie tiene suscripción guardada todavía. Activá el toggle desde un device.
- **"no_eligible"**: hay subs pero ningún user con `prefs.notif.hour == hora actual AR`.
- **No llega push pero la function devuelve `sent: 1`**: probá en otro browser (Firefox/Edge no comparten subs con Chrome). En iOS necesita PWA instalada y iOS 16.4+.
- **`statusCode: 410` en logs**: ese endpoint expiró (el user borró la app o desinstaló). El job lo limpia solo.

## Costos

- **Supabase free tier**: 500K invocaciones de Edge Function/mes. 24 invocaciones/día = 720/mes. Sobra muchísimo.
- **pg_cron + pg_net**: gratis en plan free.
- **Web Push**: gratis siempre (es un protocolo W3C que usa la infra de Apple/Google/Mozilla).
