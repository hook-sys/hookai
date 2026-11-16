# Meta App Review: প্রস্তুতি (Hook AI)

অ্যাপ: **"business"** (App ID 1407660114860211), মালিক Business: **Hook Marketing Agency**
সাইট: https://www.hook.com.bd · লক্ষ্য: বাইরের গ্রাহকরা নিজের Facebook দিয়ে Hook-এ যুক্ত হয়ে অ্যাড দেখতে ও চালাতে পারবে।

---

## ১. আগে যা লাগবে (চেকলিস্ট)

| # | কাজ | অবস্থা |
|---|---|---|
| 1 | Business Verification (Hook Marketing Agency) | ⏳ রিভিউতে (১৬ নভেম্বর ২০২৬ আবার জমা) |
| 2 | Privacy Policy URL: https://www.hook.com.bd/privacy | ✅ লাইভ, আইনি নাম আর contact@hook.com.bd আছে |
| 3 | Terms URL: https://www.hook.com.bd/terms | ✅ লাইভ |
| 4 | User data deletion URL: https://www.hook.com.bd/data-deletion | ✅ লাইভ |
| 5 | App icon 1024×1024, App category (Business) | ⏳ নতুন লোগো চূড়ান্ত হলে বসাতে হবে |
| 6 | App Settings → Basic: App domains = hook.com.bd, Contact email | ☐ মিলিয়ে দেখতে হবে |
| 7 | Facebook Login → Valid OAuth Redirect URI: https://www.hook.com.bd/api/meta/callback | ☐ মিলিয়ে দেখতে হবে |
| 8 | রিভিউয়ারের জন্য Hook-এ একটা টেস্ট অ্যাকাউন্ট (নতুন সাইনআপ এখন বন্ধ) | ☐ আপনার অনুমতি নিয়ে বানাতে হবে |
| 9 | প্রতিটা অনুমতির জন্য স্ক্রিন রেকর্ডিং (নিচে স্ক্রিপ্ট) | ☐ |
| 10 | কোডে দুটো ছোট ঠিক করা (নিচে ৫ নম্বর অংশ) | ☐ |
| 11 | রিভিউ পাস হলে অ্যাপ **Live** মোডে নেওয়া | ☐ |

> বাইরের Business-এর হয়ে ডেটা ব্যবহার করে এমন অ্যাপের জন্য Meta কখনো আলাদা "Access Verification"-ও চায়। App Dashboard-এ এমন কিছু এলে সেটাও করতে হবে।

---

## ২. কোন অনুমতি চাইব, কেন

Hook এখন এই অনুমতিগুলো চায় (`src/lib/meta/graph.ts` → `META_SCOPES`):

| অনুমতি | Hook-এ কোথায় লাগে | চাইব? |
|---|---|---|
| `ads_read` | ড্যাশবোর্ড, রিপোর্ট, অ্যালার্ট, রুল যাচাই, Claude কানেক্টরের রিপোর্ট | ✅ Advanced Access |
| `ads_management` | নতুন ক্যাম্পেইন/অ্যাডসেট/অ্যাড (PAUSED), চালু/বন্ধ, বাজেট বদল, অডিয়েন্স, রুলের স্বয়ংক্রিয় কাজ | ✅ Advanced Access |
| `pages_show_list` | গ্রাহকের Facebook পেজের তালিকা, কোন পেজ থেকে অ্যাড চলবে বাছাই | ✅ Advanced Access |
| `pages_read_engagement` | পেজের পুরোনো পোস্টকে অ্যাড বানানো, পোস্ট প্রকাশ হয়েছে কিনা দেখা | ✅ Advanced Access |
| `pages_manage_posts` | অ্যাডের পোস্টটা পেজে প্রকাশ করা (লাইক-কমেন্ট পেজে দেখানোর জন্য) | ✅ Advanced Access |
| `business_management` | Pixel খুঁজে অ্যাড অ্যাকাউন্টে শেয়ার করা (`/me/businesses`) | ⚠️ কোড এটা ব্যবহার করে, কিন্তু চাওয়া হয় না। হয় চাইতে হবে, নয় ফিচারটা বাদ দিতে হবে (৫ নম্বর দেখুন) |

**পরামর্শ:** প্রথম রিভিউতে `business_management` বাদ রাখুন, Pixel শেয়ারের ফিচারটা লুকিয়ে রাখুন। অনুমতি যত কম, পাস হওয়া তত সহজ।

---

## ৩. প্রতিটা অনুমতির ব্যাখ্যা (Meta ফর্মে কপি করে বসানোর জন্য, ইংরেজিতে)

### ads_read
> Hook AI is a reporting and management tool for small online shops and agencies in Bangladesh. After a business owner connects their Facebook account and chooses their ad accounts, we use ads_read to show their own campaign results in Hook: spend, reach, clicks, CTR, CPC, purchases and cost per purchase, by date and by campaign, ad set and ad. We also use it to send alerts (for example "spent money today with no sales") and to check the user's own automation rules. Data is only shown to the person who connected the account. We never sell it or use it for advertising.

### ads_management
> Hook AI lets business owners create and control ads in their own ad accounts without opening Ads Manager. With ads_management the user can: create a campaign, ad set and ad (everything is always created PAUSED), pause or turn on a campaign, ad set or ad, change a daily budget, duplicate an ad, and create custom audiences (for example people who watched their videos). Turning something on or raising a budget always shows a summary first and needs the user to confirm. Every change is logged and shown to the user. Hook only acts on ad accounts the user selected.

### pages_show_list
> When a user creates an ad in Hook AI, they need to choose which of their Facebook Pages the ad runs from. We use pages_show_list to list the Pages the user manages so they can pick one. We store only the Page ID and name.

### pages_read_engagement
> Users can turn an existing Page post into an ad, so it keeps its likes and comments. We use pages_read_engagement to read the user's own Page posts (text, image, link) to show them in the ad creation screen, and to check whether a post has been published.

### pages_manage_posts
> Ads created in Hook AI use a Page post. When the user asks, we publish that ad's post on their Page so that likes and comments from the ad also appear on the Page. This only happens on the Page the user chose, and only when they click "Publish to Page".

---

## ৪. স্ক্রিন রেকর্ডিংয়ের স্ক্রিপ্ট

**সাধারণ নিয়ম:**
- Hook-এর ইন্টারফেস **ইংরেজিতে** রাখুন (ভাষা বাটন EN)।
- রেকর্ডিং শুরু থেকে দেখাবে: লগইন → "Connect Facebook" → Facebook-এর অনুমতির পাতা → কোন অনুমতি কোথায় ব্যবহার হচ্ছে।
- একটা ভিডিওতে সব অনুমতি দেখানো যায়, প্রতিটা অংশের শুরুতে স্ক্রিনে ছোট লেখা দিন ("ads_read: reports")।
- ১–৩ মিনিট, ১০৮০p, শব্দ লাগবে না।
- টেস্ট অ্যাকাউন্টে **টাকা খরচ হবে না**: সব কিছু PAUSED-এ বানান, চালু করার অংশে শুধু preview দেখিয়ে বাতিল করুন।

**ক্রম:**
1. **Login & Connect (সব অনুমতি):** hook.com.bd → Log in → Settings → "Connect Facebook" → Facebook-এর পাতায় অনুমতিগুলো দেখা যাচ্ছে → Continue → Hook-এ ফিরে ad account বাছাই।
2. **ads_read:** Dashboard খুলুন → তারিখ বদলান (Last 7 days) → একটা ক্যাম্পেইনে ক্লিক করে রিপোর্ট দেখান → Alerts পাতা।
3. **pages_show_list:** Launch → নতুন অ্যাড → "Page" বাছাইয়ের ড্রপডাউন খুলে পেজের তালিকা দেখান।
4. **pages_read_engagement:** একই স্ক্রিনে "Use an existing post" → পেজের পোস্টের তালিকা দেখান → একটা বাছুন।
5. **ads_management:**
   - অ্যাড তৈরি করুন → "Created as PAUSED" বার্তা দেখান।
   - Manage পাতায় সেটা Pause/Activate টগল দেখান (Activate চাপলে preview আসে, সেখানে Cancel)।
   - বাজেট কমানো দেখান।
   - Audiences → "Video viewers 30 days" অডিয়েন্স তৈরি।
6. **pages_manage_posts:** Manage পাতায় অ্যাডের "Publish to Page" → পেজে পোস্টটা দেখা যাচ্ছে (Facebook-এ খুলে দেখান)।
7. **Data deletion:** Settings → "Disconnect" দেখান, আর /data-deletion পাতা।

---

## ৫. রিভিউয়ের আগে কোডে যা ঠিক করতে হবে

1. **`business_management` ছাড়া `/me/businesses` ডাকা হয়** (`src/lib/meta/assets.ts`, `reachablePixels`)। অন্য ব্যবহারকারীর ক্ষেত্রে এটা ব্যর্থ হবে। প্রথম রিভিউতে এই ফিচারটা লুকিয়ে রাখা ভালো।
2. **`?ids=` দিয়ে একসাথে অনেক পোস্ট দেখা** (`src/lib/meta/pagePosts.ts`, `postStates`)। Graph v26 থেকে এটা বন্ধ। এখন v23-এ চলছে, তবে পরে ভাঙবে। আলাদা আলাদা অনুরোধে বদলাতে হবে।
3. **রিভিউয়ারের টেস্ট অ্যাকাউন্ট:** Hook-এ নতুন সাইনআপ বন্ধ। রিভিউয়ারের জন্য একটা Hook লগইন বানাতে হবে (ইমেইল + পাসওয়ার্ড, শুধু Meta-র ফর্মে দেওয়ার জন্য), আর সেটা Admin হবে না।
4. **Privacy পাতায় Claude কানেক্টরের কথা:** ব্যবহারকারী Claude কানেক্টর ব্যবহার করলে তার অ্যাডের তথ্য Claude-এ যায়। এক লাইনে এটা যোগ করা ভালো।

---

## ৬. রিভিউয়ারের জন্য নির্দেশনা (ফর্মের "Instructions" ঘরে)

> 1. Go to https://www.hook.com.bd/login and sign in with the test account below.
> 2. Open Settings and click "Connect Facebook". Log in with your Facebook test user and allow the permissions.
> 3. Choose an ad account. Dashboard and Reports show results (ads_read).
> 4. Open Launch to create an ad: pick a Page (pages_show_list), optionally pick an existing post (pages_read_engagement), and create it. Everything is created PAUSED (ads_management).
> 5. Open Manage to pause/turn on, change a budget, or publish the ad's post to the Page (pages_manage_posts). Turning on shows a confirmation first.
> 6. Settings → Disconnect removes the Meta connection and data.
>
> Test login: (email and password are given in the reviewer credentials field)

---

## ৭. কাজের ক্রম

1. ⏳ Business Verification পাস হওয়ার অপেক্ষা
2. কোডে ৫ নম্বরের ১, ৩, ৪ ঠিক করা (আমি)
3. লোগো চূড়ান্ত → App icon বসানো
4. App Dashboard-এর Basic settings মিলিয়ে দেখা (আমি Chrome-এ দেখাব, পরিবর্তনের আগে জিজ্ঞেস করব)
5. স্ক্রিন রেকর্ডিং (আপনি রেকর্ড করবেন, আমি স্ক্রিপ্ট ধরে পাশে থাকব)
6. App Review জমা (আপনার অনুমতি নিয়ে)
7. পাস হলে অ্যাপ Live, Hook-এ সাইনআপ চালু
