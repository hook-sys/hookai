// অ্যাডের লেখার ধরন ও সীমা। ব্রাউজারের কম্পোনেন্টও এটি ব্যবহার করে, তাই এখানে সার্ভারের কিছু import নেই।

export const OBJECTIVES = ["sales", "messages", "leads", "traffic"] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const COPY_LANGUAGES = ["en", "bn", "banglish"] as const;
export type CopyLanguage = (typeof COPY_LANGUAGES)[number];

export const TONES = ["friendly", "urgent", "premium", "playful"] as const;
export type Tone = (typeof TONES)[number];

// Meta-র CTA বাটনের নাম (API-তে যেভাবে লেখা হয়)
export const CTA_TYPES = [
  "SHOP_NOW",
  "ORDER_NOW",
  "SEND_MESSAGE",
  "LEARN_MORE",
  "GET_OFFER",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

// Feed-এ "See more" ছাড়াই যতটুকু দেখা যায়, তার কাছাকাছি সীমা
export const LIMITS = { primary: 125, headline: 40, description: 30 } as const;

export type AdCopyInput = {
  product: string;
  audience: string;
  objective: Objective;
  language: CopyLanguage;
  tone: Tone;
};

export type AdCopy = {
  primary_texts: string[];
  headlines: string[];
  descriptions: string[];
  ctas: CtaType[];
};

export type StoredAdCopy = {
  id: string;
  input: AdCopyInput;
  content: AdCopy;
  model: string;
  created_at: string;
};
