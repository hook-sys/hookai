// অ্যাপের পটভূমি: নরম ঢেউ আর কয়েকটা চকচকে বুদবুদ, সাথে কাচের লেন্সের SVG ফিল্টার।
// সবই স্থির ছবি; শুধু বুদবুদ ধীরে ভাসে (যারা কম নড়াচড়া চায় তাদের জন্য বন্ধ থাকে)।

// লেন্সের নকশা: কিনারার কাছে পেছনের ছবি ভেতরের দিকে টানে, মাঝখানে কিছু বদলায় না।
// লাল রং = ডান-বাম সরানো, সবুজ = উপর-নিচ; 128 মানে একদম না সরানো।
const mapX = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none"><defs><linearGradient id="g"><stop offset="0" stop-color="rgb(255,128,128)"/><stop offset=".14" stop-color="rgb(128,128,128)"/><stop offset=".86" stop-color="rgb(128,128,128)"/><stop offset="1" stop-color="rgb(0,128,128)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`,
);
const mapY = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="rgb(128,255,128)"/><stop offset=".22" stop-color="rgb(128,128,128)"/><stop offset=".78" stop-color="rgb(128,128,128)"/><stop offset="1" stop-color="rgb(128,0,128)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`,
);

const BUBBLES = [
  { size: 38, top: "18%", left: "62%" },
  { size: 22, top: "34%", left: "71%" },
  { size: 56, top: "64%", left: "88%" },
  { size: 18, top: "78%", left: "40%" },
  { size: 30, top: "12%", left: "26%" },
];

export default function LiquidBackdrop() {
  return (
    <div className="lg-backdrop print:hidden" aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="lg-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <linearGradient id="lg-wave-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.10" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="lg-wave-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g filter="url(#lg-soft)">
          <path d="M-80 520C160 400 340 610 600 520S1020 300 1240 380s260 160 300 120V980H-80Z" fill="url(#lg-wave-a)" />
          <path d="M-60 260C220 120 420 300 700 220S1160 40 1520 160V-60H-60Z" fill="url(#lg-wave-b)" />
          <path d="M300 900C520 760 760 820 960 720s380-40 520 40V980H300Z" fill="url(#lg-wave-b)" />
        </g>
        <path d="M-80 520C160 400 340 610 600 520S1020 300 1240 380s260 160 300 120" fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth="1.5" />
      </svg>
      {BUBBLES.map((b, i) => (
        <span key={i} className="lg-bubble" style={{ width: b.size, height: b.size, top: b.top, left: b.left }} />
      ))}

      {/* কাচের লেন্স ফিল্টার (.lg-lens এটা ব্যবহার করে) */}
      <svg width="0" height="0" className="absolute">
        <filter id="lg-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={`data:image/svg+xml,${mapX}`} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="mx" />
          <feImage href={`data:image/svg+xml,${mapY}`} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="my" />
          <feDisplacementMap in="SourceGraphic" in2="mx" scale="22" xChannelSelector="R" yChannelSelector="G" result="dx" />
          <feDisplacementMap in="dx" in2="my" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}
