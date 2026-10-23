import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import LegalPage, { contactMarkdown } from "@/components/LegalPage";
import { SITE } from "@/lib/site";
import { getTr } from "@/lib/i18n-server";
import type { Tr } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Data deletion",
  description: "How to delete your Meta data and your Hook AI account.",
  alternates: { canonical: "/data-deletion" },
};

// Meta App Review-এর "Data Deletion Instructions URL" হিসেবে এই পেজ দেওয়া যাবে
const bodyEn = (tr: Tr) => `
## Option 1: Delete only your Meta data

1. Log in to ${SITE.name}.
2. Open **Settings**.
3. Under "Meta account", press **Disconnect**.

This happens straight away:
- ${SITE.name}'s permission is revoked on Meta
- The stored Meta access token is deleted
- All ad data fetched from Meta is deleted

Your ${SITE.name} account stays; you can reconnect later if you want.

## Option 2: Delete your whole account

1. Log in to ${SITE.name}.
2. Go to **Settings** → "Your account" → **Delete account**.
3. Type your email to confirm, then press **Delete permanently**.

Deleted immediately: your account and email, Meta connection and token, all ad data, AI summaries, campaign reports and alerts. The permission on Meta is revoked too. This can't be undone. Copies in our providers' routine backups expire on their own schedule.

## Option 3: Remove the app from Facebook

1. On Facebook, open **Settings & privacy → Settings**.
2. Go to **Apps and Websites**.
3. Choose ${SITE.name} and press **Remove**.

After this ${SITE.name} can no longer read new ad data. To delete data already fetched, use option 1 or 2.

## If you can't log in

${contactMarkdown(tr)} Include your account email address in the deletion request.
`;

const bodyBn = (tr: Tr) => `
## উপায় ১: শুধু Meta ডাটা মুছে ফেলা

1. ${SITE.name}-এ লগইন করো।
2. **সেটিংস**-এ যাও।
3. "Meta অ্যাকাউন্ট" অংশে **সংযোগ বিচ্ছিন্ন করো** চাপো।

সাথে সাথে যা হয়:
- Meta-তে ${SITE.name}-এর অনুমতি বাতিল হয়
- সংরক্ষিত Meta access token মুছে যায়
- Meta থেকে আনা সব বিজ্ঞাপনের ডাটা মুছে যায়

তোমার ${SITE.name} অ্যাকাউন্ট থেকে যায়; চাইলে পরে আবার কানেক্ট করতে পারো।

## উপায় ২: পুরো অ্যাকাউন্ট মুছে ফেলা

1. ${SITE.name}-এ লগইন করো।
2. **সেটিংস** → "তোমার অ্যাকাউন্ট" → **অ্যাকাউন্ট মুছে ফেলো** চাপো।
3. নিশ্চিত করতে নিজের ইমেইল লেখো, তারপর **স্থায়ীভাবে মুছে ফেলো** চাপো।

সাথে সাথে যা মুছে যায়: তোমার অ্যাকাউন্ট ও ইমেইল, Meta সংযোগ ও token, সব বিজ্ঞাপনের ডাটা, AI সারসংক্ষেপ, ক্যাম্পেইন রিপোর্ট ও অ্যালার্ট। Meta-তে অনুমতিও বাতিল হয়। এটি আর ফেরত আনা যায় না। সেবাদাতার নিয়মিত ব্যাকআপে থাকা কপি তাদের নিয়ম অনুযায়ী কিছুদিন পর নিজে থেকে মুছে যায়।

## উপায় ৩: Facebook থেকে অনুমতি সরানো

1. Facebook-এ **Settings & privacy → Settings** খোলো।
2. **Apps and Websites**-এ যাও।
3. ${SITE.name} বেছে নিয়ে **Remove** চাপো।

এতে ${SITE.name} আর তোমার বিজ্ঞাপনের নতুন ডাটা পড়তে পারবে না। আগে আনা ডাটাও মুছতে চাইলে উপায় ১ বা ২ ব্যবহার করো।

## লগইন করতে না পারলে

${contactMarkdown(tr)} মুছে ফেলার অনুরোধে তোমার অ্যাকাউন্টের ইমেইল ঠিকানা উল্লেখ করো।
`;

type Props = { searchParams: Promise<{ done?: string }> };

export default async function DataDeletionPage({ searchParams }: Props) {
  const { done } = await searchParams;
  const tr = await getTr();
  return (
    <LegalPage
      path="/data-deletion"
      title={tr("Data deletion", "ডাটা মুছে ফেলা")}
      intro={tr(
        `You can delete your Meta data or your whole ${SITE.name} account yourself, at any time, in a few clicks.`,
        `${SITE.name}-এ থাকা তোমার Meta ডাটা বা পুরো অ্যাকাউন্ট তুমি নিজেই, যেকোনো সময়, কয়েক ক্লিকে মুছে ফেলতে পারো।`,
      )}
      body={tr(bodyEn(tr), bodyBn(tr))}
      tr={tr}
      before={
        done === "1" ? (
          <p
            role="status"
            className="mb-8 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {tr("Your account and all its data have been deleted.", "তোমার অ্যাকাউন্ট ও সব ডাটা মুছে ফেলা হয়েছে।")}
          </p>
        ) : null
      }
    />
  );
}
