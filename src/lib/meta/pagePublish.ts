import { graphGetAll, graphRequest } from "./graph";
import { getPageToken, PublishError } from "./pagePosts";
import { driveDownloadUrl } from "./launchSources";

// রেগুলার Page পোস্ট তৈরি: লেখা /{page}/feed, ছবি /{page}/photos, ভিডিও /{page}/videos — সবই Page token দিয়ে।
// মিডিয়া Meta নিজে লিংক থেকে টানে (launchRun-এর মতোই): storage হলে signed URL, Drive হলে সরাসরি ডাউনলোড লিংক।

export type PagePostKind = "text" | "photo" | "video";

// path: storage পাথ ("userId/posts/...") নয়তো "drive:FILE_ID" (launch-এর মিডিয়া ফরম্যাটের মতোই)।
// url/url_expires_at: approve-এর সময় বানিয়ে রাখা signed লিংক, যাতে cron লগইন-ছাড়া পাবলিশ করতে পারে।
export type PagePostMedia = {
  path: string;
  kind: "image" | "video";
  name: string;
  url?: string;
  url_expires_at?: string;
};

export type PagePostContent = {
  page_id: string;
  kind: PagePostKind;
  caption: string;
  media: PagePostMedia[];
};

export type CreatedPagePost = { fbPostId: string; permalink: string | null };

// ফলাফল জানা যায়নি (যেমন timeout): পোস্টটা হয়তো পেজে চলেই গেছে, তাই আবার চেষ্টার আগে যাচাই জরুরি
export class UnknownOutcomeError extends Error {}

const PERMISSION_MESSAGE =
  "Facebook hasn't allowed Hook to publish posts yet. Reconnect Facebook in Settings and allow managing the page's posts.";

// Drive মিডিয়ার সরাসরি লিংক, অথবা আগেই বানিয়ে রাখা signed লিংক তাজা থাকলে সেটা; নাহলে null
export function readyMediaUrl(item: PagePostMedia): string | null {
  if (item.path.startsWith("drive:")) return driveDownloadUrl(item.path.slice("drive:".length));
  if (item.url && item.url_expires_at && new Date(item.url_expires_at).getTime() > Date.now() + 5 * 60_000) return item.url;
  return null;
}

function describePublishError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : "";
  if (/pages_manage_posts|permission|\(#200\)|\(#10\)/i.test(msg)) return new PublishError(PERMISSION_MESSAGE);
  if (/didn't answer in time/i.test(msg)) {
    return new UnknownOutcomeError("Meta didn't answer in time, so this post may already be on the page. Check the page before retrying.");
  }
  return err instanceof Error ? err : new Error("Meta API error");
}

// সংযুক্ত প্রোফাইলের Page-এর তালিকা (পোস্ট কোন পেজে যাবে বাছতে)
export async function listUserPages(token: string) {
  const rows = await graphGetAll<{ id: string; name: string }>("/me/accounts", { fields: "id,name", limit: "100" }, token, 5);
  return rows.filter((p) => /^\d+$/.test(p.id)).map((p) => ({ id: p.id, name: p.name ?? p.id }));
}

export async function createPagePost(
  token: string,
  post: PagePostContent,
  resolveUrl: (item: PagePostMedia) => Promise<string>,
): Promise<CreatedPagePost> {
  const ptok = await getPageToken(token, post.page_id, new Map());
  let created: { id?: string; post_id?: string };
  try {
    if (post.kind === "photo") {
      const item = post.media[0];
      if (!item) throw new PublishError("This post has no image.");
      const url = await resolveUrl(item);
      created = await graphRequest(`/${post.page_id}/photos`, {
        method: "POST",
        params: { url, caption: post.caption },
        token: ptok,
        timeoutMs: 60_000,
      });
    } else if (post.kind === "video") {
      const item = post.media[0];
      if (!item) throw new PublishError("This post has no video.");
      const url = await resolveUrl(item);
      created = await graphRequest(`/${post.page_id}/videos`, {
        method: "POST",
        params: { file_url: url, description: post.caption },
        token: ptok,
        timeoutMs: 120_000,
      });
    } else {
      created = await graphRequest(`/${post.page_id}/feed`, {
        method: "POST",
        params: { message: post.caption },
        token: ptok,
      });
    }
  } catch (err) {
    throw describePublishError(err);
  }

  const fbPostId = created.post_id ?? created.id;
  if (!fbPostId) throw new UnknownOutcomeError("Meta didn't confirm the post. Check the page before retrying.");
  // permalink থাকলে পড়া হয়; না পেলেও পোস্ট সফল ধরা হয়
  let permalink: string | null = null;
  try {
    const r = await graphRequest<{ permalink_url?: string }>(`/${fbPostId}`, { params: { fields: "permalink_url" }, token: ptok });
    permalink = r.permalink_url ?? null;
  } catch {
    permalink = null;
  }
  return { fbPostId, permalink };
}
