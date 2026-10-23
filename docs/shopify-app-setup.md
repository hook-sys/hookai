# Hook-এর Shopify অ্যাপ চালু করা (একবারের কাজ)

Shopify থেকে অর্ডার সরাসরি আনতে Hook-এর নিজের একটা Shopify অ্যাপ লাগে। এটা একবারই বানাতে হয়।
তারপর যেকোনো দোকানদার Hook-এর Orders পেজে দোকানের ঠিকানা দিয়ে "Connect Shopify" চাপলেই হয়।

## ১. অ্যাপ বানাও

1. https://dev.shopify.com-এ যাও (Shopify Dev Dashboard)। অ্যাকাউন্ট না থাকলে নিজে খুলে নাও।
2. **Apps → Create app → Start from Dev Dashboard**। নাম দাও: `Hook AI`।
3. নতুন **Version** বানাও, সেখানে এগুলো বসাও:
   - **App URL**: `https://www.hook.com.bd/orders`
   - **Embed app in Shopify admin**: বন্ধ
   - **Scopes**: `read_orders`
   - **Redirect URLs**: `https://www.hook.com.bd/api/shopify/callback`
   - **Compliance webhooks** (customer data request, customer redact, shop redact) তিনটাতেই:
     `https://www.hook.com.bd/api/webhooks/shopify/compliance`
4. Version **Release** করো।

## ২. অর্ডার পড়ার অনুমতি (Protected customer data)

অর্ডারে ক্রেতার তথ্য থাকে, তাই Shopify আলাদা অনুমতি চায়। অ্যাপের **API access requests → Protected customer data**-তে যাও।
"Protected customer data" অংশটা চালু করো। কারণ লেখো: *"Show merchants how many orders from each ad campaign were
confirmed, delivered or cancelled. Hook stores only order number, date, total and status — no names, phones,
emails or addresses."* নাম, ইমেইল, ফোন, ঠিকানা: কোনোটাই বেছে নেওয়ার দরকার নেই।

## ৩. Hook-এ চাবি বসাও (চ্যাটে দিও না)

অ্যাপের **Settings** থেকে **Client ID** আর **Client secret** কপি করো, তারপর:

1. Vercel → hookai প্রজেক্ট → **Settings → Environment Variables**।
2. যোগ করো: `SHOPIFY_API_KEY` = Client ID, `SHOPIFY_API_SECRET` = Client secret (Production)।
3. সেভ করে Claude-কে বলো "Shopify key বসিয়েছি", আমি নতুন করে ডিপ্লয় করব।

## ৪. দোকানদাররা কীভাবে ইনস্টল করবে

- **Custom distribution** (শুরুতে সহজ): Dev Dashboard → Distribution → Custom → দোকানের ঠিকানা দিয়ে
  install link বানাও। প্রতিটা দোকানের জন্য আলাদা লিংক লাগে।
- **Public distribution** (অনেক দোকান হলে): Shopify-র রিভিউ পাস করতে হয়, তারপর যেকোনো দোকান
  সরাসরি Hook থেকে কানেক্ট করতে পারে।

## ক্যাম্পেইন মেলানো

দোকানে বিজ্ঞাপন থেকে ক্রেতা এলে Shopify তার ল্যান্ডিং পেজের লিংক রাখে। বিজ্ঞাপনের URL parameters-এ
`utm_id={{campaign.id}}` থাকলে Hook অর্ডারটা ঠিক ক্যাম্পেইনের সাথে মেলায় (Orders পেজে লেখাটা কপি করার বোতাম আছে)।
