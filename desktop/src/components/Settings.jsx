import React, { useEffect, useState } from 'react';
import {
  getSoundsEnabled, setSoundsEnabled,
  getTheme, applyTheme,
  getNotificationsEnabled, setNotificationsEnabled,
  getEnterToSend, setEnterToSend,
  getAccent, applyAccent,
} from '../settings.js';

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--signal)' : 'var(--border)', position: 'relative', transition: 'background 0.15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
          background: checked ? 'var(--bg)' : 'var(--text-muted)', transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings({ onClose, isPro }) {
  const [sounds, setSounds] = useState(getSoundsEnabled());
  const [theme, setThemeState] = useState(getTheme());
  const [notifications, setNotifications] = useState(getNotificationsEnabled());
  const [enterToSend, setEnterToSendState] = useState(getEnterToSend());
  const [proxyInput, setProxyInput] = useState('');
  const [proxyStatus, setProxyStatus] = useState('');
  const [accent, setAccentState] = useState(getAccent());

  useEffect(() => {
    window.soreChatNative?.getProxy?.().then((saved) => setProxyInput(saved || ''));
  }, []);

  async function handleSaveProxy() {
    if (!window.soreChatNative?.setProxy) {
      setProxyStatus('Not available in this build');
      return;
    }
    await window.soreChatNative.setProxy(proxyInput.trim());
    setProxyStatus(proxyInput.trim() ? 'Proxy applied — restart Sore Chat to fully reconnect' : 'Proxy cleared — using direct connection');
  }

  async function handleNotificationsToggle(next) {
    if (next && 'Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') next = false;
    }
    setNotifications(next);
    setNotificationsEnabled(next);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: 380 }}>
        <button className="close-modal" onClick={onClose}>✕</button>
        <h2>Settings</h2>
        <div className="sub">Control how Sore Chat looks and sounds.</div>

        <Row label="Sound effects" sub="Message sends, receives, and call tones">
          <Toggle checked={sounds} onChange={(v) => { setSounds(v); setSoundsEnabled(v); }} />
        </Row>

        <Row label="Desktop notifications" sub="Alert when a message arrives and the app isn't focused">
          <Toggle checked={notifications} onChange={handleNotificationsToggle} />
        </Row>

        <Row label="Enter to send" sub="Off = Enter makes a new line instead">
          <Toggle checked={enterToSend} onChange={(v) => { setEnterToSendState(v); setEnterToSend(v); }} />
        </Row>

        <Row label="Appearance" sub={theme === 'dark' ? 'Dark mode' : 'Light mode'}>
          <div className="plan-toggle" style={{ width: 140, margin: 0 }}>
            <button
              type="button"
              className={theme === 'dark' ? 'active' : ''}
              onClick={() => { setThemeState('dark'); applyTheme('dark'); }}
            >
              🌙
            </button>
            <button
              type="button"
              className={theme === 'light' ? 'active' : ''}
              onClick={() => { setThemeState('light'); applyTheme('light'); }}
            >
              ☀️
            </button>
          </div>
        </Row>

        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
            Accent color {!isPro && <span style={{ color: 'var(--pro)', fontSize: 11 }}>PRO</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {isPro ? 'Pick your chat accent color.' : 'Upgrade to Pro to unlock more accent colors.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'signal', color: '#5eead4', label: 'Teal' },
              { id: 'sunset', color: '#ff8a5b', label: 'Sunset' },
              { id: 'violet', color: '#a78bfa', label: 'Violet' },
              { id: 'rose', color: '#fb7185', label: 'Rose' },
            ].map((opt) => (
              <button
                key={opt.id}
                disabled={!isPro && opt.id !== 'signal'}
                onClick={() => { setAccentState(opt.id); applyAccent(opt.id); }}
                title={opt.label}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: opt.color, cursor: isPro || opt.id === 'signal' ? 'pointer' : 'not-allowed',
                  border: accent === opt.id ? '3px solid var(--text)' : '2px solid var(--border)',
                  opacity: !isPro && opt.id !== 'signal' ? 0.35 : 1,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18, paddingTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Network</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Route Sore Chat's traffic through your own VPN or proxy server. This isn't a built-in VPN —
            it connects to a proxy you already run (e.g. socks5://127.0.0.1:1080 or http://host:8080).
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
              placeholder="socks5://127.0.0.1:1080"
              style={{
                flex: 1, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 10px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font-mono)',
              }}
            />
            <button
              onClick={handleSaveProxy}
              style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--signal)', color: 'var(--bg)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}
            >
              Apply
            </button>
          </div>
          {proxyStatus && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>{proxyStatus}</div>}
        </div>
      </div>
    </div>
  );
}
