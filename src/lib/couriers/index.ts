import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { isAuthError, isNotFound, type CourierId, type CourierStatus } from "./common";
import { steadfastStatus, type SteadfastCredentials } from "./steadfast";
import { freshPathao, pathaoStatus, type PathaoCredentials } from "./pathao";
import { carrybeeStatus, type CarrybeeCredentials } from "./carrybee";

export type CourierConnection = {
  id: string;
  courier: CourierId;
  client_id: string | null;
  credentials_encrypted: string;
  webhook_token_encrypted: string | null;
  webhook_setup_until: string | null;
  last_synced_at: string | null;
  last_webhook_at: string | null;
};

export const CONNECTION_COLUMNS =
  "id, courier, client_id, credentials_encrypted, webhook_token_encrypted, webhook_setup_until, last_synced_at, last_webhook_at";

export const COURIER_LABELS: Record<CourierId, string> = { steadfast: "Steadfast", pathao: "Pathao", carrybee: "CarryBee" };

export function readCredentials<T>(row: { credentials_encrypted: string }): T {
  return JSON.parse(decrypt(row.credentials_encrypted)) as T;
}

export function sealCredentials(credentials: object) {
  return encrypt(JSON.stringify(credentials));
}

export async function listConnections(supabase: SupabaseClient, userId: string, clientId?: string | null) {
  let query = supabase.from("courier_connections").select(CONNECTION_COLUMNS).eq("user_id", userId);
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query;
  return (data ?? []) as CourierConnection[];
}

// এক বারে প্রতিটি কুরিয়ারে কতগুলো অর্ডার দেখা হবে (পেজ ধীর না করতে ও API সীমার মধ্যে থাকতে)
const SYNC_BATCH = 150;
const CONCURRENCY = 5;
// কুরিয়ার লেখা নেই এমন অর্ডার অর্ডার নম্বর দিয়ে খোঁজা যায় শুধু এদের কাছে
const FINDS_BY_ORDER_NUMBER: CourierId[] = ["steadfast", "carrybee"];
// যে কুরিয়ারের সাথে আগে মেলানো হবে (ক্রম গুরুত্বপূর্ণ: প্রথমে যে খুঁজে পায়, অর্ডারটি তার)
const SYNC_ORDER: CourierId[] = ["steadfast", "carrybee", "pathao"];

type OpenOrder = { id: string; external_id: string; tracking_code: string | null; status: string; courier: string | null };

export type SyncResult = { checked: number; updated: number; failed: number; rejected: CourierId[] };

async function lookupFor(supabase: SupabaseClient, userId: string, conn: CourierConnection) {
  if (conn.courier === "steadfast") {
    const c = readCredentials<SteadfastCredentials>(conn);
    return (o: OpenOrder) => steadfastStatus(c, o);
  }
  if (conn.courier === "carrybee") {
    const c = readCredentials<CarrybeeCredentials>(conn);
    return (o: OpenOrder) => carrybeeStatus(c, o);
  }
  let c = readCredentials<PathaoCredentials>(conn);
  const renewed = await freshPathao(c);
  if (renewed) {
    c = renewed;
    await supabase
      .from("courier_connections")
      .update({ credentials_encrypted: sealCredentials(c) })
      .eq("id", conn.id)
      .eq("user_id", userId);
  }
  return (o: OpenOrder) => pathaoStatus(c, o);
}

// কনফার্ম বা কুরিয়ারে থাকা অর্ডারগুলোর অবস্থা প্রতিটি সংযুক্ত কুরিয়ার থেকে এনে আপডেট করে
export async function syncCouriers(supabase: SupabaseClient, userId: string, connections: CourierConnection[]) {
  const result: SyncResult = { checked: 0, updated: 0, failed: 0, rejected: [] };
  const byId = new Map(connections.map((c) => [c.courier, c]));

  for (const courier of SYNC_ORDER) {
    const conn = byId.get(courier);
    if (!conn) continue;

    let lookup: (o: OpenOrder) => Promise<CourierStatus | null>;
    try {
      lookup = await lookupFor(supabase, userId, conn);
    } catch (err) {
      if (isAuthError(err)) result.rejected.push(courier);
      else result.failed += 1;
      continue;
    }

    let query = supabase
      .from("orders")
      .select("id, external_id, tracking_code, status, courier")
      .eq("user_id", userId)
      .in("status", ["confirmed", "shipped"]);
    // কুরিয়ার শুধু নিজের ক্লায়েন্টের অর্ডার দেখে
    if (conn.client_id) query = query.eq("client_id", conn.client_id);
    query = FINDS_BY_ORDER_NUMBER.includes(courier)
      ? query.or(`courier.eq.${courier},courier.is.null`)
      : query.eq("courier", courier);
    const { data } = await query.order("status_updated_at", { ascending: true }).limit(SYNC_BATCH);
    const list = (data ?? []) as OpenOrder[];
    result.checked += list.length;

    let next = 0;
    let rejected = false;
    const worker = async () => {
      while (next < list.length && !rejected) {
        const o = list[next++];
        try {
          const status = await lookup(o);
          if (!status || (status === o.status && o.courier === courier)) continue;
          await supabase
            .from("orders")
            .update({ status, courier, status_updated_at: new Date().toISOString() })
            .eq("id", o.id)
            .eq("user_id", userId);
          result.updated += 1;
        } catch (err) {
          // ভুল key হলে বাকিগুলো চেষ্টা করে লাভ নেই; "পাওয়া যায়নি" মানে অর্ডারটি এই কুরিয়ারের নয়
          if (isAuthError(err)) rejected = true;
          else if (!isNotFound(err)) result.failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (rejected) result.rejected.push(courier);

    await supabase
      .from("courier_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id)
      .eq("user_id", userId);
  }
  return result;
}
