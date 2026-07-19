import React, { memo, useMemo, useState } from 'react';
import { avatarGradient, initials } from '../avatar.js';
import Settings from './Settings.jsx';

const ChatRow = memo(function ChatRow({ chat, active, onSelect }) {
  return (
    <div className={`chat-item ${active ? 'active' : ''}`} onClick={() => onSelect(chat.id)}>
      <div className="avatar" style={{ background: avatarGradient(chat.name) }}>
        {initials(chat.name)}
      </div>
      <div className="chat-item-body">
        <div className="chat-item-top">
          <span className="chat-item-name" style={{ fontWeight: chat.unread > 0 ? 700 : 600 }}>{chat.name}</span>
          <span className="chat-item-time">{chat.time}</span>
        </div>
        <div className="chat-item-preview" style={{ color: chat.unread > 0 ? 'var(--text)' : undefined, fontWeight: chat.unread > 0 ? 600 : 400 }}>
          {chat.preview}
        </div>
      </div>
      {chat.unread > 0 && <span className="unread-dot" aria-label="Unread messages">●</span>}
    </div>
  );
});

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-block" style={{ width: 42, height: 42, borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-block" style={{ width: '60%', height: 12, marginBottom: 8 }} />
            <div className="skeleton-block" style={{ width: '85%', height: 10 }} />
          </div>
        </div>
      ))}
    </>
  );
}

export default function Sidebar({ chats, loading, activeId, onSelect, onUpgradeClick, onAddContact, onSignOut, isPro, currentUser }) {
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.trim().toLowerCase();
    return chats.filter((c) => c.name.toLowerCase().includes(q));
  }, [chats, search]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <span className="brand-pulse" />
          Sore Chat
        </div>
        {!isPro && (
          <div className="upgrade-pill" onClick={onUpgradeClick}>
            ↑ Pro
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '0 18px 14px' }}>
        <input
          className="search-box"
          style={{ flex: 1, margin: 0, border: '1px solid var(--border)' }}
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={onAddContact}
          title="New chat or group"
          style={{
            width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-raised)', color: 'var(--signal)', fontWeight: 700,
            fontSize: 16, cursor: 'pointer', flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      <div className="chat-list">
        {loading && <SkeletonRows />}
        {!loading && filteredChats.length === 0 && (
          <div style={{ padding: '0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
            {search ? 'No chats match your search.' : 'No chats yet — click + to add a contact by email.'}
          </div>
        )}
        {!loading &&
          filteredChats.map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} onSelect={onSelect} />
          ))}
      </div>

      {currentUser && (
        <div
          style={{
            padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--text-muted)', gap: 8,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-raised)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
              }}
            >
              ⚙️
            </button>
            <span style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={onSignOut}>Sign out</span>
          </div>
        </div>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} isPro={isPro} />}
    </div>
  );
}
