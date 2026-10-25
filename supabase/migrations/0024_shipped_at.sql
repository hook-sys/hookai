-- অর্ডার কবে কুরিয়ারে গেল (প্রতিদিন কয়টা বুকিং হলো দেখার জন্য)। অবস্থা প্রথমবার "কুরিয়ারে" হলে
-- সময়টা বসে; পরে ডেলিভারি বা রিটার্ন হলেও বদলায় না। হাতে, CSV, দোকান বা কুরিয়ার, সব পথেই কাজ করে।
alter table public.orders add column if not exists shipped_at timestamptz;

create or replace function public.orders_set_shipped_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'shipped' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_shipped_at on public.orders;
create trigger orders_shipped_at
  before insert or update of status on public.orders
  for each row execute function public.orders_set_shipped_at();

create index if not exists orders_shipped_at_idx on public.orders (user_id, shipped_at) where shipped_at is not null;
