import type { Metadata } from "next";
import LegalPage, { contactMarkdown } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Hook AI.",
  alternates: { canonical: "/terms" },
};

const bodyEn = (tr: Tr) => `
## 1. Accepting these terms

By creating an account or using ${SITE.name} you agree to these terms and our [Privacy Policy](/privacy). If you don't agree, please don't use the service.

## 2. What the service does

${SITE.name} reads your Meta (Facebook and Instagram) ad data and shows numbers, alerts and AI-written analysis. We never change your ads; deciding and acting on anything is up to you.

## 3. Who can use it

- You must be at least 18 years old.
- You must have the right to view any ad account you connect (your own, or with the owner's permission).
- You must follow Meta's own terms and advertising policies.

## 4. Your account

- Give a real email address and keep your password secret.
- You're responsible for what happens under your account. If something looks wrong, change your password straight away and let us know.

## 5. What you must not do

- Try to break the service, access other people's data or get around security
- Overload the service with automated requests
- Connect someone else's ad account without permission
- Use the service for anything illegal

If you do, we may suspend or close your account.

## 6. AI-written analysis

AI analysis and advice are there to help, not to guarantee anything. AI can be wrong, and Meta's data can be wrong too (for example when a Pixel isn't tracking properly). Check the numbers yourself before big budget or campaign decisions. This is not financial or legal advice.

## 7. Third-party services

The service depends on Meta, database, hosting and AI providers. Their outages, changes or shutdowns can interrupt our service and are outside our control.

## 8. Price

The service is free for now. If paid plans arrive, prices and terms will be made clear in advance, and nothing will be charged unless you agree.

## 9. No warranty

The service is provided "as is". We don't promise it will always be available, error-free, or deliver any particular business result.

## 10. Limit of liability

To the extent the law allows, we are not liable for indirect losses, lost sales or profit, or advertising spend resulting from use of the service.

## 11. Closing your account

You can delete your account from Settings at any time. We may also close accounts that break these terms.

## 12. Changes to these terms

If these terms change, we'll update this page with a new date. Continuing to use the service after a change means you accept the new terms.

## 13. Governing law

These terms are governed by the laws of Bangladesh.

## 14. Contact

${contactMarkdown(tr)}
`;

const bodyBn = (tr: Tr) => `
## ১. শর্ত মেনে নেওয়া

${SITE.name}-এ অ্যাকাউন্ট খুললে বা সেবা ব্যবহার করলে তুমি এই শর্তাবলি ও আমাদের [Privacy Policy](/privacy) মেনে নিচ্ছ। রাজি না হলে সেবা ব্যবহার কোরো না।

## ২. সেবা কী

${SITE.name} তোমার Meta (Facebook ও Instagram) বিজ্ঞাপনের ডাটা পড়ে হিসাব, অ্যালার্ট ও AI দিয়ে তৈরি বিশ্লেষণ দেখায়। আমরা তোমার বিজ্ঞাপনে কোনো পরিবর্তন করি না; কোনো সিদ্ধান্ত নেওয়া ও বাস্তবায়ন করা তোমার নিজের দায়িত্ব।

## ৩. কে ব্যবহার করতে পারবে

- তোমার বয়স অন্তত ১৮ বছর হতে হবে।
- যে Ad Account কানেক্ট করবে, সেটি দেখার বৈধ অধিকার তোমার থাকতে হবে (নিজের, অথবা মালিকের অনুমতিসহ)।
- Meta-র নিজস্ব শর্তাবলি ও বিজ্ঞাপন নীতি মেনে চলতে হবে।

## ৪. তোমার অ্যাকাউন্ট

- সঠিক ইমেইল দিতে হবে এবং পাসওয়ার্ড গোপন রাখতে হবে।
- তোমার অ্যাকাউন্ট দিয়ে যা হয় তার দায়িত্ব তোমার। সন্দেহজনক কিছু দেখলে সাথে সাথে পাসওয়ার্ড বদলাও ও আমাদের জানাও।

## ৫. যা করা যাবে না

- সেবা ভাঙার, অন্যের ডাটায় ঢোকার বা নিরাপত্তা এড়ানোর চেষ্টা
- স্বয়ংক্রিয় উপায়ে অতিরিক্ত অনুরোধ পাঠিয়ে সেবায় চাপ দেওয়া
- অন্যের Ad Account অনুমতি ছাড়া কানেক্ট করা
- কোনো আইনবিরোধী কাজে সেবা ব্যবহার করা

এগুলো করলে আমরা অ্যাকাউন্ট সাময়িক বা স্থায়ীভাবে বন্ধ করতে পারি।

## ৬. AI-এর তৈরি বিশ্লেষণ

AI-এর বিশ্লেষণ ও পরামর্শ সহায়তার জন্য, নিশ্চয়তা নয়। AI ভুল করতে পারে, আর Meta-র ডাটাতেও ভুল থাকতে পারে (যেমন Pixel ঠিকমতো ট্র্যাক না করলে)। বাজেট বা ক্যাম্পেইন নিয়ে বড় সিদ্ধান্তের আগে সংখ্যাগুলো নিজে মিলিয়ে নাও। এটি আর্থিক বা আইনি পরামর্শ নয়।

## ৭. তৃতীয় পক্ষের সেবা

সেবাটি Meta, ডাটাবেস, হোস্টিং ও AI সেবার উপর নির্ভর করে। তাদের সমস্যা, পরিবর্তন বা বন্ধ হওয়ার কারণে আমাদের সেবায় বিঘ্ন হতে পারে, যা আমাদের নিয়ন্ত্রণে নেই।

## ৮. দাম

এখন সেবাটি ফ্রি। ভবিষ্যতে পেইড প্ল্যান এলে দাম ও শর্ত আগে থেকে স্পষ্টভাবে জানানো হবে; তুমি রাজি না হলে কোনো টাকা কাটা হবে না।

## ৯. সেবার নিশ্চয়তা নেই

সেবাটি "যেমন আছে" ভিত্তিতে দেওয়া হয়। আমরা সবসময় চালু থাকা, ত্রুটিমুক্ত হওয়া বা কোনো নির্দিষ্ট ব্যবসায়িক ফলাফলের নিশ্চয়তা দিই না।

## ১০. দায়ের সীমা

আইন যতটা অনুমতি দেয়, ততটা পর্যন্ত, সেবা ব্যবহারের কারণে পরোক্ষ ক্ষতি, বিক্রি বা লাভ কমে যাওয়া, বা বিজ্ঞাপনের খরচের জন্য আমরা দায়ী থাকব না।

## ১১. অ্যাকাউন্ট বন্ধ করা

তুমি যেকোনো সময় সেটিংস থেকে অ্যাকাউন্ট মুছে ফেলতে পারো। শর্ত ভাঙলে আমরাও অ্যাকাউন্ট বন্ধ করতে পারি।

## ১২. শর্ত পরিবর্তন

শর্ত বদলালে এই পেজে নতুন তারিখসহ হালনাগাদ করা হবে। পরিবর্তনের পর সেবা ব্যবহার চালিয়ে গেলে নতুন শর্ত মেনে নিয়েছ বলে ধরা হবে।

## ১৩. প্রযোজ্য আইন

এই শর্তাবলি ${SITE.country}-এর আইন অনুযায়ী পরিচালিত হবে।

## ১৪. যোগাযোগ

${contactMarkdown(tr)}
`;

export default async function TermsPage() {
  const tr = await getTr();
  return (
    <LegalPage
      path="/terms"
      title="Terms of Service"
      intro={tr(
        `The rules for using ${SITE.name}. In short: connect only ad accounts you're allowed to, don't misuse the service, and check AI advice before acting on it.`,
        `${SITE.name} ব্যবহারের নিয়ম। সংক্ষেপে: তোমার নিজের বা অনুমতি থাকা Ad Account কানেক্ট করো, সেবার অপব্যবহার কোরো না, আর AI-এর পরামর্শ যাচাই করে সিদ্ধান্ত নাও।`,
      )}
      body={tr(bodyEn(tr), bodyBn(tr))}
      tr={tr}
    />
  );
}
