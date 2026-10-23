import type { Metadata } from "next";
import LegalPage, { contactMarkdown } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Hook AI collects, how it's used and protected, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

// লেখাটি অ্যাপের আসল কাজের সাথে মিলিয়ে লেখা। অ্যাপ নতুন ডাটা সংগ্রহ বা নতুন সেবা ব্যবহার শুরু করলে
// এখানেও হালনাগাদ করতে হবে এবং SITE.legalUpdated বদলাতে হবে।
const bodyEn = (tr: Tr) => `
## 1. Who we are

${SITE.name} is an online service that reads your Facebook and Instagram advertising (Meta Ads) data and turns it into reports, alerts and AI advice. In this policy "we" means ${SITE.name} and "you" means the person using the service.

## 2. What we collect

**Your account**
- Your email address and password. We can't see your password; it is stored hashed.

**From Meta, only if you connect with Facebook**
- Your Facebook name and Facebook user ID
- The name, ID, currency and time zone of the ad accounts you can access
- Ad performance data: campaign names, spend, impressions, reach, clicks, results such as purchases and leads, video views, budgets, and totals split by age, gender, region, placement, device and time
- The access token Meta issues so we can read the data above

All of this is aggregated reporting data. We don't receive, and don't want, the names, phone numbers or any personal details of the people who saw or bought from your ads.

**Things we create**
- AI summaries, campaign reports and alerts generated from your data

**Technical data**
- Cookies that keep you logged in
- Ordinary server logs (such as IP address, time and errors) kept by our hosting provider for security and troubleshooting

## 3. Meta permissions and your ads

- We only ask for **read access (ads_read)**. We never change your campaigns, ads, budgets or settings.
- Data from Meta is used only to provide this service to you. We don't sell it, don't use it to advertise to anyone else, and follow the Meta Platform Terms.
- You can disconnect at any time from Settings, or remove ${SITE.name} under Facebook Settings → Apps and Websites.

## 4. How we use information

- To show your dashboard, numbers, alerts and reports
- To write analysis and advice with AI
- To keep logins secure and prevent abuse
- To find and fix problems with the service

We don't build advertising profiles from your data and don't sell it to third parties.

## 5. AI analysis

When you ask for an AI summary or campaign report, the aggregated figures for that period (for example campaign names, spend, results and totals by age or region) are sent to an AI provider. We choose which one; it may be fal.ai, OpenAI, Google (Gemini) or Anthropic (Claude). Your email, password and Meta token are never sent to the AI. Each provider processes the request under its own policies.

## 6. Where data is stored and how it's protected

- **Database:** Supabase (your account, ad data, reports)
- **Hosting:** Vercel (runs the website)
- **Reading data from Meta:** Meta Marketing API

To keep it safe:
- Meta access tokens are encrypted with AES-256-GCM; the key lives only on our server and never reaches the browser
- In the database, each user can only see their own data (Row Level Security)
- All traffic is encrypted over HTTPS

These providers' servers may be outside Bangladesh.

## 7. How long we keep it

- We keep your information while your account is active.
- Disconnecting Meta immediately deletes the Meta token and the stored ad data.
- Deleting your account immediately deletes all your information. Copies in our providers' routine backups expire on their own schedule.
- Meta tokens normally expire by themselves after about 60 days.

## 8. Your rights

- See your data: in the dashboard and Settings
- Disconnect Meta: one click in Settings
- Delete everything: "Delete account" in Settings, or see [how to delete your data](/data-deletion)

## 9. Cookies

We only use cookies needed to keep you logged in and remember your language. No advertising or tracking cookies.

## 10. Children

This service is not for anyone under 18, and we don't knowingly collect their information.

## 11. Changes to this policy

If this policy changes, we'll update this page with a new date. For significant changes we'll also tell you inside the app.

## 12. Contact

${contactMarkdown(tr)}
`;

const bodyBn = (tr: Tr) => `
## ১. আমরা কে

${SITE.name} একটি অনলাইন সেবা, যা Facebook ও Instagram বিজ্ঞাপনের (Meta Ads) ডাটা বিশ্লেষণ করে বাংলায় হিসাব, অ্যালার্ট ও AI পরামর্শ দেয়। এই নীতিতে "আমরা" মানে ${SITE.name}, আর "তুমি" মানে যে এই সেবা ব্যবহার করে।

## ২. আমরা কী তথ্য সংগ্রহ করি

**তোমার অ্যাকাউন্ট**
- ইমেইল ঠিকানা ও পাসওয়ার্ড। পাসওয়ার্ড আমরা দেখতে পাই না; এটি এনক্রিপ্ট (hash) করে রাখা হয়।

**Meta থেকে, শুধু তুমি Facebook দিয়ে কানেক্ট করলে**
- তোমার Facebook নাম ও Facebook user ID
- তুমি যেসব Ad Account দেখতে পারো তাদের নাম, ID, মুদ্রা ও টাইমজোন
- বিজ্ঞাপনের পারফরম্যান্স ডাটা: ক্যাম্পেইনের নাম, খরচ, impression, reach, click, Purchase/Lead-এর মতো ফলাফল, ভিডিও দেখার হিসাব, বাজেট, এবং বয়স, লিঙ্গ, এলাকা, প্লেসমেন্ট, ডিভাইস ও সময় অনুযায়ী মোট সংখ্যা
- Meta-র দেওয়া access token, যা দিয়ে উপরের ডাটা পড়া হয়

এই ডাটা পুরোটাই সমষ্টিগত (aggregated) হিসাব। তোমার বিজ্ঞাপন যারা দেখেছে বা কিনেছে, তাদের কারও নাম, ফোন নম্বর বা ব্যক্তিগত তথ্য আমরা পাই না এবং চাই না।

**আমাদের তৈরি করা তথ্য**
- AI সারসংক্ষেপ, ক্যাম্পেইন রিপোর্ট ও অ্যালার্ট, যা তোমার ডাটা থেকে তৈরি হয়

**প্রযুক্তিগত তথ্য**
- লগইন ঠিক রাখার জন্য প্রয়োজনীয় cookie
- সার্ভারের সাধারণ লগ (যেমন IP ঠিকানা, সময়, ত্রুটি), যা নিরাপত্তা ও সমস্যা খোঁজার জন্য আমাদের হোস্টিং সেবা রাখে

## ৩. Meta-র অনুমতি ও তোমার বিজ্ঞাপন

- আমরা শুধু **পড়ার অনুমতি (ads_read)** চাই। তোমার ক্যাম্পেইন, বিজ্ঞাপন, বাজেট বা কোনো সেটিং আমরা বদলাই না।
- Meta থেকে পাওয়া ডাটা শুধু তোমাকে এই সেবা দেওয়ার জন্য ব্যবহার হয়। আমরা এটি বিক্রি করি না, অন্য কাউকে বিজ্ঞাপন দেখানোর কাজে ব্যবহার করি না, এবং Meta Platform Terms মেনে চলি।
- যেকোনো সময় সেটিংস থেকে "সংযোগ বিচ্ছিন্ন" করতে পারো, অথবা Facebook-এর Settings → Apps and Websites থেকে ${SITE.name}-এর অনুমতি সরিয়ে দিতে পারো।

## ৪. তথ্য কীভাবে ব্যবহার করি

- তোমার ড্যাশবোর্ড, হিসাব, অ্যালার্ট ও রিপোর্ট দেখানো
- AI দিয়ে বাংলায় বিশ্লেষণ ও পরামর্শ তৈরি করা
- লগইন, নিরাপত্তা ও অপব্যবহার ঠেকানো
- সেবার সমস্যা খুঁজে ঠিক করা

আমরা তোমার তথ্য দিয়ে বিজ্ঞাপনের প্রোফাইল তৈরি করি না এবং তৃতীয় পক্ষের কাছে বিক্রি করি না।

## ৫. AI দিয়ে বিশ্লেষণ

তুমি AI সারসংক্ষেপ বা ক্যাম্পেইন রিপোর্ট চাইলে, সেই সময়ের বিজ্ঞাপনের সমষ্টিগত হিসাব (যেমন ক্যাম্পেইনের নাম, খরচ, ফলাফল, বয়স-এলাকা অনুযায়ী মোট সংখ্যা) একটি AI সেবায় পাঠানো হয়। কোন AI সেবা ব্যবহার হবে তা আমরা ঠিক করি; এটি হতে পারে fal.ai, OpenAI, Google (Gemini) বা Anthropic (Claude)। তোমার ইমেইল, পাসওয়ার্ড বা Meta token AI-তে পাঠানো হয় না। AI সেবাগুলো নিজ নিজ নীতি অনুযায়ী এই অনুরোধ প্রসেস করে।

## ৬. তথ্য কোথায় থাকে ও কীভাবে সুরক্ষিত থাকে

- **ডাটাবেস:** Supabase (তোমার অ্যাকাউন্ট, বিজ্ঞাপনের ডাটা, রিপোর্ট)
- **হোস্টিং:** Vercel (ওয়েবসাইট চালানো)
- **Meta থেকে ডাটা আনা:** Meta Marketing API

নিরাপত্তার জন্য:
- Meta-র access token AES-256-GCM দিয়ে এনক্রিপ্ট করে রাখা হয়; খোলার চাবি শুধু আমাদের সার্ভারে থাকে, ব্রাউজারে কখনো যায় না
- ডাটাবেসে প্রতিটি ব্যবহারকারী শুধু নিজের ডাটা দেখতে পারে (Row Level Security)
- সব যোগাযোগ HTTPS দিয়ে এনক্রিপ্টেড

এই সেবাগুলোর সার্ভার বাংলাদেশের বাইরে থাকতে পারে।

## ৭. কতদিন রাখি

- অ্যাকাউন্ট চালু থাকা পর্যন্ত তোমার তথ্য রাখি।
- Meta সংযোগ বিচ্ছিন্ন করলে Meta token ও সংরক্ষিত বিজ্ঞাপনের ডাটা সাথে সাথে মুছে যায়।
- অ্যাকাউন্ট মুছলে তোমার সব তথ্য সাথে সাথে মুছে যায়। সেবাদাতার নিয়মিত ব্যাকআপে থাকা কপি তাদের নিয়ম অনুযায়ী কিছুদিন পর নিজে থেকে মুছে যায়।
- Meta-র দেওয়া token সাধারণত প্রায় ৬০ দিন পর নিজে থেকেই মেয়াদোত্তীর্ণ হয়।

## ৮. তোমার অধিকার

- তোমার তথ্য দেখা: ড্যাশবোর্ড ও সেটিংসে
- Meta সংযোগ বিচ্ছিন্ন করা: সেটিংস থেকে, এক ক্লিকে
- সব তথ্য মুছে ফেলা: সেটিংস থেকে "অ্যাকাউন্ট মুছে ফেলো", অথবা [ডাটা মুছে ফেলার নিয়ম](/data-deletion) দেখো

## ৯. Cookie

আমরা শুধু লগইন ও ভাষার পছন্দ মনে রাখার জন্য প্রয়োজনীয় cookie ব্যবহার করি। বিজ্ঞাপন বা ট্র্যাকিং cookie ব্যবহার করি না।

## ১০. শিশুদের তথ্য

এই সেবা ১৮ বছরের কম বয়সীদের জন্য নয়, এবং আমরা জেনেশুনে তাদের তথ্য সংগ্রহ করি না।

## ১১. এই নীতির পরিবর্তন

নীতি বদলালে এই পেজে নতুন তারিখসহ হালনাগাদ করা হবে। বড় পরিবর্তন হলে অ্যাপের ভেতরেও জানানো হবে।

## ১২. যোগাযোগ

${contactMarkdown(tr)}
`;

export default async function PrivacyPage() {
  const tr = await getTr();
  return (
    <LegalPage
      path="/privacy"
      title="Privacy Policy"
      intro={tr(
        `What ${SITE.name} collects, why, how it's kept safe, and how you can delete it, in plain words.`,
        `${SITE.name} তোমার কী তথ্য নেয়, কেন নেয়, কীভাবে সুরক্ষিত রাখে, আর তুমি কীভাবে তা মুছে ফেলতে পারো, সহজ ভাষায়।`,
      )}
      body={tr(bodyEn(tr), bodyBn(tr))}
      tr={tr}
    />
  );
}
