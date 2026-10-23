import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM দিয়ে টোকেন এনক্রিপ্ট/ডিক্রিপ্ট করে।
// META_TOKEN_ENCRYPTION_KEY হলো 64 অক্ষরের hex (32 বাইট)। এটি শুধু সার্ভারে থাকে।
function getKey(): Buffer {
  const hex = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is not set correctly");
  }
  return Buffer.from(hex, "hex");
}

// ফরম্যাট: iv:authTag:ciphertext (সবই base64)
export function encrypt(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
