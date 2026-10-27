// রিটার্গেটিং সেটের তৈরি অডিয়েন্স (ব্রাউজারেও ব্যবহার হয়, তাই Meta API কোড ছাড়া আলাদা ফাইলে)

export const HOOK_PREFIX = "Hook · ";

// ---------- রিটার্গেটিং সেটের অডিয়েন্স ----------

export const PRESET_IDS = [
  "visitors_30",
  "viewcontent_14",
  "atc_no_purchase_14",
  "checkout_no_purchase_7",
  "buyers_180",
  "page_engaged_90",
  "page_messaged_180",
  "video_50_30",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type Preset = {
  id: PresetId;
  needs: "pixel" | "page" | "videos";
  name: [string, string];
  hint: [string, string];
  // ফানেলে কোথায় কাজে লাগে
  use: "retarget" | "exclude" | "seed";
};

export const PRESETS: Preset[] = [
  { id: "atc_no_purchase_14", needs: "pixel", name: ["Added to cart, didn't buy (14 days)", "কার্টে রেখেছে, কেনেনি (১৪ দিন)"], hint: ["Hottest audience: remind them to finish.", "সবচেয়ে গরম অডিয়েন্স: কেনা শেষ করতে মনে করিয়ে দাও।"], use: "retarget" },
  { id: "checkout_no_purchase_7", needs: "pixel", name: ["Started checkout, didn't buy (7 days)", "চেকআউট শুরু করেছে, কেনেনি (৭ দিন)"], hint: ["Almost bought; an offer often closes it.", "প্রায় কিনেছিল; একটা অফারে অনেকে কিনে ফেলে।"], use: "retarget" },
  { id: "viewcontent_14", needs: "pixel", name: ["Viewed a product (14 days)", "প্রোডাক্ট দেখেছে (১৪ দিন)"], hint: ["Interested but not decided.", "আগ্রহী, কিন্তু সিদ্ধান্ত নেয়নি।"], use: "retarget" },
  { id: "visitors_30", needs: "pixel", name: ["Website visitors (30 days)", "ওয়েবসাইট ভিজিটর (৩০ দিন)"], hint: ["Everyone who came to the site.", "যারাই সাইটে এসেছে।"], use: "retarget" },
  { id: "buyers_180", needs: "pixel", name: ["Buyers (180 days)", "ক্রেতা (১৮০ দিন)"], hint: ["Exclude them from new-customer ads; seed for lookalikes.", "নতুন ক্রেতার বিজ্ঞাপন থেকে বাদ দাও; Lookalike-এর উৎস।"], use: "exclude" },
  { id: "page_messaged_180", needs: "page", name: ["Messaged the page (180 days)", "পেজে মেসেজ দিয়েছে (১৮০ দিন)"], hint: ["Asked about price or order before.", "আগে দাম বা অর্ডার নিয়ে জিজ্ঞেস করেছে।"], use: "retarget" },
  { id: "page_engaged_90", needs: "page", name: ["Engaged with the page (90 days)", "পেজে এনগেজ করেছে (৯০ দিন)"], hint: ["Liked, commented, shared or clicked.", "লাইক, কমেন্ট, শেয়ার বা ক্লিক করেছে।"], use: "retarget" },
  { id: "video_50_30", needs: "videos", name: ["Watched 50% of an ad video (30 days)", "বিজ্ঞাপনের ভিডিও ৫০% দেখেছে (৩০ দিন)"], hint: ["From the videos in your active ads.", "চালু বিজ্ঞাপনের ভিডিওগুলো থেকে।"], use: "retarget" },
];
