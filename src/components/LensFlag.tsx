"use client";

import { useEffect } from "react";

// কাচের লেন্স (backdrop-filter-এ SVG ফিল্টার) শুধু Chromium ভিত্তিক ব্রাউজার ঠিকমতো আঁকে।
// সেখানেই <html data-lens> বসানো হয়; অন্য ব্রাউজারে সাধারণ ঘোলা কাচ থাকে।
export default function LensFlag() {
  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
    if (brands.some((b) => b.brand === "Chromium")) document.documentElement.setAttribute("data-lens", "");
  }, []);
  return null;
}
