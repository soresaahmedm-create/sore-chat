import React, { useState } from 'react';

const FEATURES = [
  'No ads, ever',
  'Send files & videos up to 2GB (vs 25MB free)',
  'HD video quality on uploads',
  'Custom chat themes',
  'Priority message delivery',
];

export default function UpgradeModal({ onClose, onUpgrade }) {
  const [plan, setPlan] = useState('monthly');
  const price = plan === 'monthly' ? '$4.99/mo' : '$39.99/yr';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <button className="close-modal" onClick={onClose}>✕</button>
        <h2>Sore Chat Pro</h2>
        <div className="sub">Faster, cleaner, unlimited.</div>

        <div className="plan-toggle">
          <button className={plan === 'monthly' ? 'active' : ''} onClick={() => setPlan('monthly')}>
            MONTHLY
          </button>
          <button className={plan === 'yearly' ? 'active' : ''} onClick={() => setPlan('yearly')}>
            YEARLY · SAVE 33%
          </button>
        </div>

        {FEATURES.map((f) => (
          <div className="feature-row" key={f}>
            <span className="check">✓</span>
            <span>{f}</span>
          </div>
        ))}

        <button className="upgrade-cta" onClick={() => onUpgrade(plan)}>
          Upgrade — {price}
        </button>
      </div>
    </div>
  );
}
