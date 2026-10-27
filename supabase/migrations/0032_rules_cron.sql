-- প্রতি ঘণ্টার ৭ মিনিটে Hook-এর নিয়ম যাচাই। গোপন key Vault-এ থাকে (নাম: hook_cron_secret),
-- এখানে লেখা নেই; তার hash public.cron_secrets-এ।
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'hook-rules-hourly',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://www.hook.com.bd/api/cron/rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hook_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $job$
);
