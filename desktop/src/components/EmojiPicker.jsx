import React, { useState } from 'react';

const CATEGORIES = {
  Smileys: ['😀', '😂', '😍', '😅', '😊', '😉', '😢', '😭', '😡', '😱', '🥳', '😴', '🤔', '🙄', '😎', '🥰'],
  Gestures: ['👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🤞', '👋', '🙌', '👌', '✋'],
  Hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💯'],
  Objects: ['🔥', '✨', '🎉', '🎂', '📷', '🎥', '🎵', '☕', '🍕', '⚽', '🚀', '💰'],
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [category, setCategory] = useState('Smileys');

  return (
    <div
      style={{
        position: 'absolute', bottom: 62, left: 24, width: 280, background: 'var(--surface-raised)',
        border: '1px solid var(--border)', borderRadius: 14, padding: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        zIndex: 40, animation: 'modalIn 0.15s ease both',
      }}
      onMouseLeave={onClose}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {Object.keys(CATEGORIES).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 11, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: category === cat ? 'var(--signal)' : 'transparent',
              color: category === cat ? 'var(--bg)' : 'var(--text-muted)',
              fontWeight: category === cat ? 700 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
        {CATEGORIES[category].map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            style={{
              background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', borderRadius: 6,
              padding: 4, lineHeight: 1, transition: 'transform 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
