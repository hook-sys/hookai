import { graphGetAll, graphRequest } from "./graph";

// নতুন বিজ্ঞাপনের কনটেন্ট কোথা থেকে: Google Drive-এর লিংক, বা আগের ক্যাম্পেইনের বিজ্ঞাপন
// (তার ভিডিও/ছবি নতুন লেখার সাথে, অথবা পুরো পোস্টটাই, যাতে লাইক-কমেন্ট থেকে যায়)।

// ---------- Google Drive ----------

export type DriveFile = { id: string; name: string; kind: "image" | "video"; size: number | null; thumb: string };

// drive.google.com/file/d/ID/..., ?id=ID, /open?id=ID; ফোল্ডারের লিংক আলাদা চেনা হয়
export function parseDriveLink(raw: string): { id: string; folder: boolean } | null {
  const v = raw.trim();
  if (!/^https?:\/\/(drive|docs)\.google\.com\//i.test(v)) return null;
  const folder = v.match(/\/folders\/([\w-]{10,})/);
  if (folder) return { id: folder[1], folder: true };
  const m = v.match(/\/d\/([\w-]{10,})/) ?? v.match(/[?&]id=([\w-]{10,})/);
  return m ? { id: m[1], folder: false } : null;
}

export const driveDownloadUrl = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
export const driveThumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w640`;

export class DriveError extends Error {}

// ফাইলের ধরন আর নাম: শুধু প্রথম কয়েক বাইট চেয়ে দেখা হয়। শেয়ার না থাকলে Google লগইন পাতায় পাঠায়।
export async function driveFileInfo(id: string): Promise<DriveFile> {
  let res: Response;
  try {
    res = await fetch(driveDownloadUrl(id), { headers: { Range: "bytes=0-0" }, redirect: "follow", signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new DriveError("Google Drive didn't answer.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (/accounts\.google\.com/.test(res.url) || type.startsWith("text/html")) {
    throw new DriveError("This file isn't shared. In Drive set it to 'Anyone with the link'.");
  }
  const kind = type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : null;
  if (!kind) throw new DriveError(`Not an image or video (${type || "unknown type"}).`);
  const disp = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(disp.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? disp.match(/filename="?([^";]+)"?/i)?.[1] ?? `drive-${id}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  await res.body?.cancel().catch(() => undefined);
  return { id, name: name.slice(0, 100), kind, size: Number.isFinite(total) ? total : null, thumb: driveThumb(id) };
}

// ছবি Meta-তে বাইট হিসেবে পাঠাতে হয় (৩০ MB পর্যন্ত)
export async function driveImageBytes(id: string) {
  const res = await fetch(driveDownloadUrl(id), { redirect: "follow", signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!res.ok || (res.headers.get("content-type") ?? "").startsWith("text/html")) throw new DriveError("Couldn't download the image from Drive.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 30 * 1024 * 1024) throw new DriveError("The image is larger than 30 MB.");
  return buf;
}

// ---------- আগের ক্যাম্পেইন ----------

export type SourceAd = {
  id: string;
  name: string;
  status: string;
  post_id: string | null; // পুরো পোস্টটা আবার ব্যবহার করা যায়
  video_id: string | null;
  image_hash: string | null;
  thumb: string | null;
  body: string | null;
  title: string | null;
  description: string | null;
  link: string | null;
  cta: string | null;
};

export async function listCampaigns(token: string, accountId: string) {
  const rows = await graphGetAll<{ id: string; name: string; effective_status: string; objective?: string }>(
    `/${accountId}/campaigns`,
    { fields: "id,name,effective_status,objective", effective_status: JSON.stringify(["ACTIVE", "PAUSED"]), limit: "100" },
    token,
    2,
  );
  return rows.sort((a, b) => Number(b.effective_status === "ACTIVE") - Number(a.effective_status === "ACTIVE"));
}

type RawCreative = {
  effective_object_story_id?: string;
  video_id?: string;
  image_hash?: string;
  thumbnail_url?: string;
  image_url?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    link_data?: { link?: string; message?: string; name?: string; description?: string; image_hash?: string; call_to_action?: { type?: string } };
    video_data?: { video_id?: string; message?: string; title?: string; link_description?: string; call_to_action?: { type?: string; value?: { link?: string } } };
  };
  asset_feed_spec?: { videos?: { video_id?: string }[]; images?: { hash?: string }[]; bodies?: { text?: string }[]; titles?: { text?: string }[]; link_urls?: { website_url?: string }[] };
};

export async function campaignAds(token: string, accountId: string, campaignId: string): Promise<SourceAd[]> {
  const camp = await graphRequest<{ account_id?: string }>(`/${campaignId}`, { params: { fields: "account_id" }, token });
  if (camp.account_id && `act_${camp.account_id}` !== accountId) throw new Error("This campaign belongs to another ad account.");
  // থাম্বনেইল সাধারণত ৬৪px আসে; প্রিভিউর জন্য ৬০০px চাওয়া
  const rows = await graphGetAll<{ id: string; name: string; effective_status: string; creative?: RawCreative }>(
    `/${campaignId}/ads`,
    {
      fields:
        "id,name,effective_status,creative.thumbnail_width(600).thumbnail_height(600){effective_object_story_id,video_id,image_hash,thumbnail_url,image_url,body,title,call_to_action_type,object_story_spec,asset_feed_spec{videos,images,bodies,titles,link_urls}}",
      limit: "50",
    },
    token,
    2,
  );
  return rows.map((a) => {
    const c = a.creative ?? {};
    const ld = c.object_story_spec?.link_data;
    const vd = c.object_story_spec?.video_data;
    const af = c.asset_feed_spec;
    return {
      id: a.id,
      name: a.name,
      status: a.effective_status,
      post_id: c.effective_object_story_id ?? null,
      video_id: vd?.video_id ?? c.video_id ?? af?.videos?.[0]?.video_id ?? null,
      image_hash: ld?.image_hash ?? c.image_hash ?? af?.images?.[0]?.hash ?? null,
      thumb: c.thumbnail_url ?? c.image_url ?? null,
      body: vd?.message ?? ld?.message ?? c.body ?? af?.bodies?.[0]?.text ?? null,
      title: vd?.title ?? ld?.name ?? c.title ?? af?.titles?.[0]?.text ?? null,
      description: vd?.link_description ?? ld?.description ?? null,
      link: vd?.call_to_action?.value?.link ?? ld?.link ?? af?.link_urls?.[0]?.website_url ?? null,
      cta: vd?.call_to_action?.type ?? ld?.call_to_action?.type ?? c.call_to_action_type ?? null,
    };
  });
}
