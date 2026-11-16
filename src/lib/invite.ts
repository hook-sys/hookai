import { createHash } from "node:crypto";

// এককালীন আমন্ত্রণ কোড (সাইনআপ বন্ধ থাকলেও একটা নির্দিষ্ট অ্যাকাউন্ট খোলার জন্য)।
// ডাটাবেসে শুধু sha256 থাকে; কোড ২৪ ঘণ্টা আর একবারই চলে।
export const INVITE_CODE = /^hki_[A-Za-z0-9_-]{32,64}$/;
export const inviteHash = (code: string) => createHash("sha256").update(code).digest("hex");
