import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAd,
  createAdSet,
  createCampaign,
  createCreative,
  createPostCreative,
  pageInstagram,
  startVideoUpload,
  uploadImage,
  videoState,
  type LaunchSpec,
} from "./launch";
import { driveDownloadUrl, driveImageBytes } from "./launchSources";
import { ruleTemplates } from "@/lib/rules/types";

// Meta-তে তৈরি হওয়া জিনিসের ID। প্রতিটি ধাপের পর সংরক্ষণ হয়, তাই মাঝপথে থামলে আবার চালালে
// আগে তৈরি হওয়াগুলো আবার তৈরি হয় না (একই ক্যাম্পেইন দুবার হয় না)।
export type LaunchMeta = {
  campaign_id?: string;
  adset_id?: string;
  media?: Record<string, { image_hash?: string; video_id?: string }>;
  ads?: Record<string, { creative_id?: string; ad_id?: string }>;
  rules_created?: boolean;
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
      const [source, ref] = m.path.includes(":") ? [m.path.slice(0, m.path.indexOf(":")), m.path.slice(m.path.indexOf(":") + 1)] : ["storage", m.path];
      const base = spec.ad_name || spec.name;
      const label = (spec.media.length > 1 ? `${base} · ${m.name}` : base).slice(0, 200);

      // আগের পোস্ট: নতুন creative বানাতে কিছু আপলোড লাগে না
      if (source === "post") {
        const ad = (meta.ads![m.path] ??= {});
        ad.creative_id ??= await createPostCreative(token, accountId, label, ref, instagramId);
        await save("creating");
        ad.ad_id = await createAd(token, accountId, meta.adset_id, ad.creative_id, label);
        await save("creating");
        continue;
      }
      if (source === "image") media.image_hash ??= ref;
      if (source === "video") media.video_id ??= ref;

      if (m.kind === "image") {
        if (!media.image_hash) {
          let bytes: Buffer;
          if (source === "drive") bytes = await driveImageBytes(ref);
          else {
            const { data, error } = await supabase.storage.from("ad-media").download(m.path);
            if (error || !data) throw new Error(`Couldn't read ${m.name} from storage`);
            bytes = Buffer.from(await data.arrayBuffer());
          }
          media.image_hash = await uploadImage(token, accountId, bytes, m.name);
          await save("creating");
        }
      } else {
        if (!media.video_id) {
          // Meta নিজে লিংক থেকে ভিডিও নামায়: Drive-এর সরাসরি লিংক, নয়তো আমাদের সাময়িক লিংক
          let url: string;
          if (source === "drive") url = driveDownloadUrl(ref);
          else {
            const { data, error } = await supabase.storage.from("ad-media").createSignedUrl(m.path, 60 * 60);
            if (error || !data) throw new Error(`Couldn't share ${m.name} with Meta`);
            url = data.signedUrl;
          }
          media.video_id = await startVideoUpload(token, accountId, url, m.name);
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
      ad.ad_id = await createAd(token, accountId, meta.adset_id, ad.creative_id, label);
      await save("creating");
    }

    if (waiting) {
      await save("waiting_video");
      return { status: "waiting_video" };
    }
    // খসড়ায় বাছা নিয়মগুলো এই Ad Set/ক্যাম্পেইনের জন্য বসানো (একবারই)
    if (!meta.rules_created && spec.rule_templates?.length && spec.rule_target && spec.rule_target > 0) {
      const chosen = ruleTemplates(spec.rule_target).filter((t) => spec.rule_templates!.includes(t.id));
      if (chosen.length) {
        const { data: launch } = await supabase.from("ad_launches").select("client_id").eq("id", row.id).maybeSingle();
        const { error } = await supabase.from("ad_rules").insert(
          chosen.map((t) => ({
            ...t.rule,
            user_id: row.user_id,
            client_id: launch?.client_id ?? null,
            ad_account_id: accountId,
            name: `${spec.name.slice(0, 70)} · ${t.title[0]}`.slice(0, 120),
            enabled: true,
            object_ids: [t.rule.level === "campaign" ? meta.campaign_id : meta.adset_id],
          })),
        );
        if (!error) meta.rules_created = true;
      }
    }
    await save("paused");
    return { status: "paused" };
  } catch (err) {
    const error = describeError(err);
    await save("failed", error.slice(0, 1000));
    return { status: "failed", error };
  }
}
