import { graphRequest } from "./graph";

// বিজ্ঞাপনের পোস্ট পেজে প্রকাশ: Hook-এ বানানো বিজ্ঞাপনের পোস্ট প্রথমে শুধু বিজ্ঞাপন হিসেবে থাকে
// (পেজের টাইমলাইনে দেখা যায় না)। টেস্টে ভালো চললে মালিক এক ক্লিকে পেজে প্রকাশ করে।
// পেজের নিজের টোকেন লাগে, আর Facebook সংযোগে pages_manage_posts অনুমতি।

export class PublishError extends Error {}

async function pageToken(token: string, pageId: string, cache: Map<string, string>) {
  const hit = cache.get(pageId);
  if (hit) return hit;
  const res = await graphRequest<{ access_token?: string }>(`/${pageId}`, { params: { fields: "access_token" }, token });
  if (!res.access_token) throw new PublishError("No access to this page.");
  cache.set(pageId, res.access_token);
  return res.access_token;
}

export type PostState = { published: boolean; url: string | null };

// অনেকগুলো পোস্টের অবস্থা: পেজ ধরে একসাথে (প্রতি পেজে একটা অনুরোধ)
export async function postStates(token: string, postIds: string[]): Promise<Map<string, PostState>> {
  const out = new Map<string, PostState>();
  const cache = new Map<string, string>();
  const byPage = new Map<string, string[]>();
  for (const id of new Set(postIds)) {
    const page = id.split("_")[0];
    if (!/^\d+_\d+$/.test(id)) continue;
    byPage.set(page, [...(byPage.get(page) ?? []), id]);
  }
  await Promise.all(
    [...byPage].map(async ([page, ids]) => {
      try {
        const ptok = await pageToken(token, page, cache);
        for (let i = 0; i < ids.length; i += 50) {
          const res = await graphRequest<Record<string, { is_published?: boolean; permalink_url?: string }>>("/", {
            params: { ids: ids.slice(i, i + 50).join(","), fields: "is_published,permalink_url" },
            token: ptok,
          });
          for (const [id, p] of Object.entries(res)) out.set(id, { published: Boolean(p.is_published), url: p.permalink_url ?? null });
        }
      } catch {
        // এই পেজের অবস্থা জানা গেল না; বোতাম তবুও দেখায়
      }
    }),
  );
  return out;
}

// বিজ্ঞাপনের পোস্ট বের করে পেজে প্রকাশ
export async function publishAdPost(token: string, adId: string, accountId: string) {
  const ad = await graphRequest<{ account_id?: string; creative?: { effective_object_story_id?: string } }>(`/${adId}`, {
    params: { fields: "account_id,creative{effective_object_story_id}" },
    token,
  });
  if (ad.account_id && `act_${ad.account_id}` !== accountId) throw new PublishError("This ad belongs to another ad account.");
  const postId = ad.creative?.effective_object_story_id;
  if (!postId) throw new PublishError("This ad has no page post.");
  const ptok = await pageToken(token, postId.split("_")[0], new Map());
  const before = await graphRequest<{ is_published?: boolean; permalink_url?: string }>(`/${postId}`, {
    params: { fields: "is_published,permalink_url" },
    token: ptok,
  });
  if (before.is_published) return { postId, url: before.permalink_url ?? null, already: true };
  try {
    await graphRequest(`/${postId}`, { method: "POST", params: { is_published: "true" }, token: ptok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/pages_manage_posts|permission/i.test(msg)) {
      throw new PublishError("Facebook hasn't allowed Hook to publish posts yet. Reconnect Facebook in Settings and allow managing the page's posts.");
    }
    throw err;
  }
  return { postId, url: before.permalink_url ?? null, already: false };
}
