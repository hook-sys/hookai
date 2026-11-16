-- এককালীন আমন্ত্রণ: সাইনআপ বন্ধ থাকলেও একটা নির্দিষ্ট অ্যাকাউন্ট খোলা যায় (যেমন Meta App Review-এর রিভিউয়ারের জন্য)।
-- কোড কখনো সরাসরি রাখা হয় না, শুধু sha256। একবারই চলে, মেয়াদ থাকে।
create table if not exists public.signup_invites (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  note text,
  expires_at timestamptz not null,
  email text,
  claimed_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.signup_invites enable row level security;

-- সাইনআপ ফর্ম জমা দেওয়ার মুহূর্তে কোডটা ওই ইমেইলের নামে ধরে রাখা
create or replace function public.claim_signup_invite(p_code_hash text, p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  update public.signup_invites
     set email = lower(trim(p_email)), claimed_at = now()
   where code_hash = p_code_hash and used_at is null and expires_at > now()
     and (email is null or email = lower(trim(p_email)))
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke all on function public.claim_signup_invite(text, text) from public, anon, authenticated;
grant execute on function public.claim_signup_invite(text, text) to anon, authenticated;

-- সাইনআপ বন্ধ, শুধু সদ্য ধরে রাখা আমন্ত্রণের ইমেইল ছাড়া (একবারই)
create or replace function public.block_new_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.signup_invites
     set used_at = now()
   where email = lower(new.email) and used_at is null and expires_at > now()
     and claimed_at > now() - interval '15 minutes';
  if found then
    return new;
  end if;
  raise exception 'New sign-ups are closed' using errcode = '42501';
end;
$$;
revoke all on function public.block_new_signups() from public, anon, authenticated;
