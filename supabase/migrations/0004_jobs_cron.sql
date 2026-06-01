-- ============================================================
-- Marco 1 / Fatia 3 — Agendamento do worker (D-F3.5).
-- Produção: pg_cron dispara, a cada minuto, um POST (pg_net) na Edge Function
-- jobs-worker. Bloco guardado: se pg_cron/pg_net não estiverem disponíveis
-- (ex.: imagem local sem as extensões), apenas emite NOTICE e segue — o reset
-- local NÃO falha (os testes disparam o worker pelo gatilho server-side).
-- ============================================================
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  perform cron.schedule(
    'jobs-worker-tick',
    '* * * * *',
    $cron$
    select net.http_post(
      url := current_setting('app.functions_url', true) || '/functions/v1/jobs-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
exception when others then
  raise notice 'pg_cron/pg_net indisponível — worker será disparado pelo gatilho server-side (D-F3.5). Detalhe: %', sqlerrm;
end $$;
