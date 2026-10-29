import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAd,
  createAdSet,
  createCampaign,
  createCreative,
  pageInstagram,
  startVideoUpload,
  uploadImage,
  videoState,
  type LaunchSpec,
} from "./launch";

// Meta-তে তৈরি হওয়া জিনিসের ID। প্রতিটি ধাপের পর সংরক্ষণ হয়, তাই মাঝপথে থামলে আবার চালালে
// আগে তৈরি হওয়াগুলো আবার তৈরি হয় না (একই ক্যাম্পেইন দুবার হয় না)।
export type LaunchMeta = {
  campaign_id?: string;
  adset_id?: string;
  media?: Record<string, { image_hash?: string; video_id?: string }>;
  ads?: Record<string, { creative_id?: string; ad_id?: string }>;
};

export type LaunchRow = {
  id: string;
  user_id: string;
  ad_account_id: string;
  spec: LaunchSpec;
  status: string;
  meta: LaunchMeta;
};

export type RunResult = { status: "paused" } | { status: "waiting_video" } | { status: "failed"; error: string };

export async function runLaunch(
  supabase: SupabaseClient,
  row: LaunchRow,
  token: string,
  currency: string | null,
  describeError: (err: unknown) => string,
): Promise<RunResult> {
  const { spec, ad_account_id: accountId } = row;
  const meta: LaunchMeta = { media: {}, ads: {}, ...row.meta };
  const save = (status: string, error: string | null = null) =>
    supabase.from("ad_launches").update({ meta, status, error, updated_at: new Date().toISOString() }).eq("id", row.id);

  try {
    meta.campaign_id ??= await createCampaign(token, accountId, spec, currency);
    await save("creating");
    meta.adset_id ??= await createAdSet(token, accountId, meta.campaign_id, spec, currency);
    await save("creating");

    let waiting = false;
    const instagramId = spec.use_instagram === false ? null : await pageInstagram(token, spec.page_id);
    for (const m of spec.media) {
      const done = meta.ads![m.path];
      if (done?.ad_id) continue;
      const media = (meta.media![m.path] ??= {});
      let thumbnail: string | null = null;

      if (m.kind === "image") {
        if (!media.image_hash) {
          const { data, error } = await supabase.storage.from("ad-media").download(m.path);
          if (error || !data) throw new Error(`Couldn't read ${m.name} from storage`);
          media.image_hash = await uploadImage(token, accountId, Buffer.from(await data.arrayBuffer()), m.name);
          await save("creating");
        }
      } else {
        if (!media.video_id) {
          // Meta নিজে এই সাময়িক লিংক থেকে ভিডিও নামায়
          const { data, error } = await supabase.storage.from("ad-media").createSignedUrl(m.path, 60 * 60);
          if (error || !data) throw new Error(`Couldn't share ${m.name} with Meta`);
          media.video_id = await startVideoUpload(token, accountId, data.signedUrl, m.name);
          await save("creating");
        }
        const state = await videoState(token, media.video_id);
        if (state.status === "error") throw new Error(`Meta couldn't process the video ${m.name}`);
        if (state.status !== "ready" || !state.thumbnail) {
          waiting = true;
          continue;
        }
        thumbnail = state.thumbnail;
      }

      const ad = (meta.ads![m.path] ??= {});
      ad.creative_id ??= await createCreative(
        token,
        accountId,
        spec,
        { imageHash: media.image_hash, videoId: media.video_id, thumbnail },
        instagramId,
      );
      await save("creating");
      const base = spec.ad_name || spec.name;
      const label = spec.media.length > 1 ? `${base} · ${m.name}` : base;
      ad.ad_id = await createAd(token, accountId, meta.adset_id, ad.creative_id, label.slice(0, 200));
      await save("creating");
    }

    if (waiting) {
      await save("waiting_video");
      return { status: "waiting_video" };
    }
    await save("paused");
    return { status: "paused" };
  } catch (err) {
    const error = describeError(err);
    await save("failed", error.slice(0, 1000));
    return { status: "failed", error };
  }
}
