import React, { useEffect, useState } from 'react';

// In production, swap this rotating slot for a real ad network's SDK/iframe
// (e.g. Google AdSense for the desktop web view, or a native ad unit) —
// that requires your own publisher account and API keys, which can't be
// generated here. Keeping it isolated means removing ads for Pro users is
// just: {!isPro && <AdBanner />}
const SLOTS = [
  { text: 'Sponsored · Upgrade to remove ads', cta: 'Go Pro →' },
  { text: 'Send files up to 2GB with Sore Chat Pro', cta: 'Upgrade →' },
  { text: 'Custom accent colors are a Pro feature', cta: 'Try Pro →' },
];

export default function AdBanner({ onUpgradeClick }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLOTS.length), 6000);
    return () => clearInterval(id);
  }, []);

  const slot = SLOTS[index];

  return (
    <div className="ad-banner">
      <span>{slot.text}</span>
      <span className="ad-banner-cta" onClick={onUpgradeClick}>
        {slot.cta}
      </span>
    </div>
  );
}
