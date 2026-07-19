import React from 'react';
import { avatarGradient, initials } from '../avatar.js';

export default function IncomingCallBanner({ call, onAccept, onDecline }) {
  return (
    <div className="modal-overlay">
      <div style={{ width: 320, background: 'var(--surface)', border: '1px solid var(--signal)', borderRadius: 20, padding: 24, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 16px' }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid var(--signal)', animation: 'ringPulse 1.6s ease-out infinite',
            }}
          />
          <div
            className="avatar"
            style={{ width: 72, height: 72, fontSize: 22, background: avatarGradient(call.callerName) }}
          >
            {initials(call.callerName)}
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 4 }}>
          Incoming {call.type === 'video' ? 'video' : 'audio'} call
        </div>
        <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
          {call.callerName || 'Someone'}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onDecline}
            style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
          <button
            onClick={onAccept}
            style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--signal)', color: 'var(--bg)', fontSize: 20, cursor: 'pointer' }}
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}
