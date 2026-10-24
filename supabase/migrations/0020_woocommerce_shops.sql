-- WooCommerce দোকান। ঠিকানা হয় সাধারণ ডোমেইন (সাব-ফোল্ডারসহ হতে পারে), myshopify নয়।
alter table public.shop_connections drop constraint if exists shop_connections_platform_check;
alter table public.shop_connections drop constraint if exists shop_connections_shop_domain_check;
alter table public.shop_connections
  add constraint shop_connections_platform_check check (platform in ('shopify', 'woocommerce')),
  add constraint shop_connections_shop_domain_check check (
    (platform = 'shopify' and shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$')
    or (platform = 'woocommerce' and shop_domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+(/[A-Za-z0-9._~-]+)*$' and char_length(shop_domain) <= 253)
  );
