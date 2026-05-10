-- ============================================================
-- Push notifications setup (Web Push + pg_cron)
-- ============================================================
-- 1) Tabla de suscripciones del navegador (una por usuario × dispositivo)
-- 2) RLS: cada usuario maneja sólo las suyas
-- 3) Schedule: pg_cron + pg_net invocan la Edge Function cada hora
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabla: push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  last_pushed_date date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_self_select" ON public.push_subscriptions;
CREATE POLICY "push_subs_self_select" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_self_insert" ON public.push_subscriptions;
CREATE POLICY "push_subs_self_insert" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_self_delete" ON public.push_subscriptions;
CREATE POLICY "push_subs_self_delete" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- pg_cron job: cada hora, en el minuto 0, llama a la Edge Function
-- ============================================================
-- IMPORTANTE: reemplazá <PROJECT_REF> y <CRON_SECRET> antes de ejecutar.
-- <PROJECT_REF>: tu ref de Supabase (algo como abcdefghijkl)
-- <CRON_SECRET>: un string aleatorio que también vas a setear como secret en la Edge Function
-- ============================================================

-- Si hay un job previo con ese nombre, borrarlo
SELECT cron.unschedule('daily-reminder-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-reminder-hourly'
);

SELECT cron.schedule(
  'daily-reminder-hourly',
  '0 * * * *',  -- cada hora en el minuto 0
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
