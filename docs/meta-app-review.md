# Hook AI: সবার জন্য Facebook কানেক্ট চালু করা (Meta App Review)

এখন Meta অ্যাপ Development mode-এ, তাই শুধু অ্যাপে যোগ করা Tester-রাই Facebook কানেক্ট করতে পারে।
সবার জন্য খুলতে Meta-র কাছে **ads_read**-এর **Advanced Access** নিতে হবে। ধাপগুলো ক্রমানুসারে:

| ধাপ | কে করবে | অবস্থা |
|---|---|---|
| ১. Business Portfolio-র নাম বদল ও Business Verification | তুমি (ডকুমেন্ট লাগবে) | বাকি |
| ২. অ্যাপের Basic settings (আইকন, ক্যাটাগরি) | তুমি, ২ মিনিট | বাকি |
| ৩. রিভিউয়ারের জন্য Hook অ্যাকাউন্ট | তুমি + অ্যাডমিন পেজ | বাকি |
| ৪. স্ক্রিন রেকর্ডিং | তুমি | বাকি |
| ৫. ads_read-এর Advanced Access চাওয়া | তুমি (লেখা নিচে তৈরি) | বাকি |
| ৬. Data handling প্রশ্ন ও Access Verification | তুমি (উত্তর নিচে তৈরি) | বাকি |
| ৭. অ্যাপ Live করা | তুমি, অনুমোদনের পর | বাকি |

Privacy Policy, Terms, Data deletion পেজ, ডোমেইন ও Redirect URI আগেই বসানো আছে।

---

## ১. Business Portfolio ও Business Verification

1. business.facebook.com → **Settings → Business info** → নাম **Hook Marketing Agency** করো (ট্রেড লাইসেন্সে যেভাবে লেখা, হুবহু)।
2. **Security Center → Start verification**।
3. আইনি নাম, ঠিকানা, ফোন, ওয়েবসাইট `https://www.hook.com.bd` দাও; ট্রেড লাইসেন্স আপলোড করো। সব তথ্য ট্রেড লাইসেন্সের সাথে মিলতে হবে।
4. যাচাইয়ের উপায় **Domain** বাছলে Meta একটা TXT রেকর্ড দেবে; সেটা আমাকে দিলে Cloudflare-এ বসিয়ে দেব।
   **Email** বাছলে contact@hook.com.bd-এ কোড যাবে (তোমার Gmail-এ আসে)।

সাধারণত ২ থেকে ১০ কর্মদিবস লাগে।

## ২. অ্যাপের Basic settings

developers.facebook.com → অ্যাপ → **App settings → Basic**:
- **App icon:** `brand/app-icon-1024.png` (এই প্রজেক্টে তৈরি করা আছে, 1024×1024)
- **Category:** Business and pages
- **Display name:** Hook AI (চাইলে "business" বদলে দাও)

## ৩. রিভিউয়ারের জন্য Hook অ্যাকাউন্ট

Meta-র রিভিউয়ার Hook-এ লগইন করে দেখবে। তাদের জন্য আলাদা একটা অ্যাকাউন্ট রাখো:
1. https://www.hook.com.bd/signup → যেমন `review@hook.com.bd` আর একটা শক্ত পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খোলো।
2. Hook-এ অ্যাডমিন হিসেবে **Users & plans** → এই অ্যাকাউন্টকে **Agency** প্ল্যান দাও, যাতে সব ফিচার দেখা যায়।
3. এই ইমেইল-পাসওয়ার্ড শুধু Meta-র রিভিউ ফর্মে দেবে, আর কোথাও না।

## ৪. স্ক্রিন রেকর্ডিং (২ থেকে ৩ মিনিট, ইংরেজি UI-তে)

Meta দেখতে চায় অনুমতিটা কোথায় আর কীভাবে ব্যবহার হয়। ক্রমানুসারে রেকর্ড করো:
1. https://www.hook.com.bd খোলা, উপরে ভাষা **EN**।
2. লগইন → Dashboard-এ "No Meta account connected"।
3. **Settings → Connect Meta account** → Facebook-এর অনুমতির পর্দা দেখাও, যেখানে **ads_read** চাওয়া হচ্ছে → Continue।
4. Hook-এ ফিরে Ad Account-এর তালিকা → একটা বেছে **Save**।
5. Dashboard: খরচ, Result, Cost per Result, ক্যাম্পেইন টেবিল; Video, Website, Breakdowns ট্যাব।
6. একটা ক্যাম্পেইনে **Analyze** → বয়স, লিঙ্গ, ঘণ্টা অনুযায়ী ভাগ।
7. **Settings → Disconnect** দেখাও (ডাটা মুছে যায়)।

রেকর্ডিংয়ে কোনো পাসওয়ার্ড বা access token যেন না দেখা যায়।

## ৫. ads_read-এর Advanced Access চাওয়া

developers.facebook.com → অ্যাপ → **App Review → Permissions and features** → **ads_read** → **Request advanced access**।
নিচের লেখাগুলো কপি করে বসাও।

**How will your app use ads_read?**

```
Hook AI (https://www.hook.com.bd) is a reporting and analytics tool for small businesses and marketers in Bangladesh who run their own Facebook and Instagram ads.

After a user logs in to Hook AI and connects their Facebook account, we use ads_read only to read performance insights for the ad accounts that user chooses: campaign names, spend, impressions, reach, frequency, clicks, results (purchases, leads, messages), video views, active budgets, and aggregated breakdowns by age, gender, region, placement, device and hour.

We use this data to show the user a dashboard that matches Ads Manager, to raise alerts when cost per result rises or spend has no results, and to write a plain-language summary and recommendations (in English or Bangla) for that user's own campaigns.

We never create, edit, pause or delete ads, campaigns or budgets. We do not access data about the people who saw the ads. Data is shown only to the user who connected it, is never sold or shared for advertising, and is deleted immediately when the user disconnects or deletes their account (https://www.hook.com.bd/data-deletion).
```

**Step-by-step instructions for the reviewer**

```
1. Go to https://www.hook.com.bd/login and sign in with the test account below.
   Email: <reviewer email>
   Password: <reviewer password>
2. Open Settings in the left menu and click "Connect Meta account".
3. Log in with your Facebook account and approve the ads_read permission.
4. Back in Hook AI, choose any ad account you have access to and click Save.
   If your Facebook account has no ad accounts, Hook AI shows "No ad accounts found" and nothing else is read.
5. Open Dashboard to see the performance data read with ads_read. Use the date picker (e.g. Last 30 days) and the Overview / Video / Website / Breakdowns tabs.
6. Click "Analyze" on any campaign to see the audience breakdown for that campaign.
7. To remove access, open Settings and click "Disconnect". This revokes the permission and deletes stored data.
```

## ৬. Data handling প্রশ্ন ও Access Verification

**App Review → Data handling questions** (বা Data Use Checkup)-এ যা আসতে পারে, তার উত্তর:

- **Do you share data with third parties / data processors?** হ্যাঁ, শুধু সেবা চালানোর জন্য:
  - Supabase: ডাটাবেস ও লগইন
  - Vercel: হোস্টিং
  - AI প্রোভাইডার (fal.ai / OpenRouter, Google, OpenAI বা Anthropic): ব্যবহারকারী রিপোর্ট চাইলে শুধু সমষ্টিগত বিজ্ঞাপনের সংখ্যা যায়
  - কোনো ডাটা বিক্রি হয় না, বিজ্ঞাপনের কাজে কাউকে দেওয়া হয় না।
- **Data controller country:** Bangladesh
- **Requests from public authorities:** শুধু আইনগতভাবে বাধ্য হলে; নীতি Privacy Policy-তে আছে।
- **Data deletion:** ব্যবহারকারী নিজেই Settings থেকে Disconnect বা Delete account করলে সাথে সাথে মুছে যায়।

**Access Verification** (অন্য ব্যবসার বিজ্ঞাপনের ডাটা পড়ার অ্যাপের জন্য Meta এটা চায়): Business Verification শেষ হলে
App Dashboard-এ "Access verification" দেখাবে। সেখানে বলবে: আমরা একটা SaaS টুল, যেটা অন্য ব্যবসাকে তাদের নিজের Meta বিজ্ঞাপনের হিসাব ও পরামর্শ দেয়।

## ৭. অনুমোদনের পর

1. অ্যাপের উপরে **Publish** (বা App Mode **Live**) চালু করো।
2. এরপর যে কেউ hook.com.bd-এ অ্যাকাউন্ট খুলে Facebook কানেক্ট করতে পারবে, Tester বানাতে হবে না।
3. কোডে কিছু বদলাতে হবে না।

### রিজেক্ট হলে
Meta সাধারণত কারণ লিখে দেয় (যেমন রেকর্ডিং স্পষ্ট না, বা রিভিউয়ার লগইন করতে পারেনি)। কারণটা আমাকে দিলে ঠিক করে আবার জমা দেওয়ার মতো করে দেব।
