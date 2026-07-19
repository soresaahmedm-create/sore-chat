import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdBanner from './AdBanner.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { avatarGradient, initials } from '../avatar.js';
import { toggleReaction, editMessage, deleteMessage, setTypingStatus, clearTypingStatus, listenToTyping } from '../firebase.js';
import { getEnterToSend } from '../settings.js';
import { sendFileDirect, getLocalTransferBlob } from '../directTransfer.js';

function mediaLabel(mediaType) {
  if (mediaType === 'video') return '📹 Video';
  if (mediaType === 'image') return '📷 Photo';
  if (mediaType === 'audio') return '🎤 Voice message';
  return 'Attachment';
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢'];

function formatLastSeen(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `today at ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

const AudioPlayer = memo(function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  function fmt(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play();
  }

  function seek(e) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
  }

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button className="audio-play-btn" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
      <div className="audio-track" onClick={seek}>
        <div className="audio-track-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="audio-time">{fmt(playing || current ? current : duration)}</span>
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({
  m, isMine, senderName, currentUserId, onReact, onStartEdit, onDelete,
  isEditing, editText, setEditText, onSaveEdit, onCancelEdit, seen, delivered,
  onReply, onJumpTo, highlight, onCopy, onStar, onPin, onForward, onDeleteForMe, onDeleteForEveryone,
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reactions = m.reactions || {};
  const reactionEntries = Object.entries(reactions).filter(([, uids]) => uids?.length > 0);
  const isStarred = m.starredBy?.includes(currentUserId);

  if (m.deletedForEveryone) {
    return (
      <div className={`msg-row ${isMine ? 'mine' : 'theirs'}`} data-message-id={m.id}>
        <div style={{ maxWidth: '62%' }}>
          <div className="bubble" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
            🚫 This message was deleted
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`msg-row ${isMine ? 'mine' : 'theirs'}`}
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-message-id={m.id}
    >
      {!isMine && senderName && (
        <div
          className="avatar"
          style={{ width: 28, height: 28, fontSize: 11, marginRight: 8, alignSelf: 'flex-end', background: avatarGradient(senderName) }}
        >
          {initials(senderName)}
        </div>
      )}

      <div style={{ maxWidth: '62%' }}>
        {hovered && !isEditing && !m.pending && (
          <div
            style={{
              display: 'flex', gap: 4, marginBottom: 4, justifyContent: isMine ? 'flex-end' : 'flex-start',
              background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 20,
              padding: '3px 6px', width: 'fit-content', marginLeft: isMine ? 'auto' : 0,
            }}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <span
                key={emoji}
                onClick={() => onReact(m.id, emoji)}
                style={{ cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
              >
                {emoji}
              </span>
            ))}
            <span onClick={() => onReply(m)} style={{ cursor: 'pointer', fontSize: 12, padding: '0 4px', color: 'var(--text-muted)' }} title="Reply">
              ↩️
            </span>
            {isMine && m.text && (
              <span onClick={() => onStartEdit(m.id, m.text)} style={{ cursor: 'pointer', fontSize: 12, padding: '0 4px', color: 'var(--text-muted)' }} title="Edit">
                ✏️
              </span>
            )}
            <span style={{ position: 'relative' }}>
              <span onClick={() => setMenuOpen((o) => !o)} style={{ cursor: 'pointer', fontSize: 13, padding: '0 4px', color: 'var(--text-muted)' }} title="More">
                ⋯
              </span>
              {menuOpen && (
                <div className="msg-more-menu" onMouseLeave={() => setMenuOpen(false)}>
                  {m.text && <div className="msg-more-item" onClick={() => { onCopy(m.text); setMenuOpen(false); }}>📋 Copy</div>}
                  <div className="msg-more-item" onClick={() => { onStar(m.id); setMenuOpen(false); }}>{isStarred ? '★ Unstar' : '☆ Star'}</div>
                  <div className="msg-more-item" onClick={() => { onPin(m.id, !m.pinned); setMenuOpen(false); }}>{m.pinned ? '📌 Unpin' : '📌 Pin'}</div>
                  <div className="msg-more-item" onClick={() => { onForward(m); setMenuOpen(false); }}>↪️ Forward</div>
                  <div className="msg-more-item danger" onClick={() => { onDeleteForMe(m.id); setMenuOpen(false); }}>🗑️ Delete for me</div>
                  {isMine && (
                    <div className="msg-more-item danger" onClick={() => { onDeleteForEveryone(m.id, m.createdAt); setMenuOpen(false); }}>🗑️ Delete for everyone</div>
                  )}
                </div>
              )}
            </span>
          </div>
        )}

        <div className="bubble" style={{ maxWidth: '100%', outline: highlight ? '2px solid var(--signal)' : 'none' }}>
          {(m.pinned || isStarred) && (
            <div style={{ display: 'flex', gap: 6, fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>
              {m.pinned && <span>📌 Pinned</span>}
              {isStarred && <span>★ Starred</span>}
            </div>
          )}
          {m.forwardedFrom && (
            <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: 3 }}>
              ↪️ Forwarded{typeof m.forwardedFrom === 'string' && m.forwardedFrom !== 'forwarded message' ? ` from ${m.forwardedFrom}` : ''}
            </div>
          )}
          {m.replyToId && (
            <div className="msg-quote" onClick={() => onJumpTo(m.replyToId)} title="Jump to message">
              {m.replyToSender ? `${m.replyToSender}: ` : ''}{m.replyToText || 'Attachment'}
            </div>
          )}
          {m.mediaUrl && m.mediaType === 'image' && (
            <img src={m.mediaUrl} className="bubble-media" alt="attachment" loading="lazy" />
          )}
          {m.mediaUrl && m.mediaType === 'video' && (
            <video src={m.mediaUrl} className="bubble-media" controls preload="metadata" />
          )}
          {m.mediaUrl && m.mediaType === 'audio' && <AudioPlayer src={m.mediaUrl} />}
          {m.direct && (() => {
            const localUrl = getLocalTransferBlob(m.transferId);
            if (!localUrl) {
              return (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  ⚡ {m.fileName || 'File'} — sent directly, only visible on the two original devices
                </div>
              );
            }
            return m.mediaType === 'video' ? (
              <video src={localUrl} className="bubble-media" controls preload="metadata" />
            ) : (
              <img src={localUrl} className="bubble-media" alt={m.fileName || 'attachment'} />
            );
          })()}

          {isEditing ? (
            <div>
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(m.id); }
                  if (e.key === 'Escape') onCancelEdit();
                }}
                style={{
                  width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--signal)',
                  borderRadius: 8, padding: 6, fontSize: 14, fontFamily: 'var(--font-body)', resize: 'none',
                }}
                rows={2}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11 }}>
                <span onClick={() => onSaveEdit(m.id)} style={{ cursor: 'pointer', color: 'var(--signal)' }}>Save</span>
                <span onClick={onCancelEdit} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Cancel</span>
              </div>
            </div>
          ) : (
            m.text && <div>{m.text}</div>
          )}

          <div className="bubble-time">
            {m.edited && <span style={{ fontStyle: 'italic' }}>edited</span>}
            {m.time || 'now'}
            {isMine && (
              <span
                className="status-tick"
                style={{ color: m.pending ? 'var(--text-muted)' : seen ? 'var(--signal)' : 'var(--text-muted)' }}
                title={m.pending ? 'Sending' : seen ? 'Read' : delivered ? 'Delivered' : 'Sent'}
              >
                {m.pending ? '🕐' : seen || delivered ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>

        {reactionEntries.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
            {reactionEntries.map(([emoji, uids]) => (
              <span
                key={emoji}
                onClick={() => onReact(m.id, emoji)}
                style={{
                  fontSize: 11.5, padding: '1px 7px', borderRadius: 20, cursor: 'pointer',
                  background: uids.includes(currentUserId) ? 'var(--signal-dim)' : 'var(--surface-raised)',
                  border: `1px solid ${uids.includes(currentUserId) ? 'var(--signal)' : 'var(--border)'}`,
                  color: 'var(--text)',
                }}
              >
                {emoji} {uids.length}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default function ChatWindow({
  chat, messages, onSend, isPro, onUpgradeClick, currentUser, currentUserId, currentUserName, onStartCall,
  onLoadOlder, hasMoreOlder, loadingOlder, isOnline, otherPresence, allChats,
  onDeleteForMe, onDeleteForEveryone, onPin, onStar, onForward,
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [directProgress, setDirectProgress] = useState(null); // 0-1 while sending, null when idle
  const [directError, setDirectError] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [highlightId, setHighlightId] = useState(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newSinceScroll, setNewSinceScroll] = useState(0);
  const fileInputRef = useRef(null);
  const directInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const prevChatIdRef = useRef(null);
  const prevMsgCountRef = useRef(0);

  // Search matches within the currently loaded messages (client-side —
  // messages are already in memory, no extra reads needed).
  // Hide anything this user deleted "for me" without affecting anyone else's view.
  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.deletedFor?.includes(currentUserId)),
    [messages, currentUserId]
  );

  const pinnedMessages = useMemo(() => visibleMessages.filter((m) => m.pinned), [visibleMessages]);

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return visibleMessages.filter((m) => m.text && m.text.toLowerCase().includes(q));
  }, [visibleMessages, searchQuery]);

  useEffect(() => {
    setSearchIndex(0);
  }, [searchQuery]);

  const jumpToMessage = useCallback((id) => {
    if (!id) return;
    const el = listRef.current?.querySelector(`[data-message-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(id);
      setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1500);
    }
  }, []);

  useEffect(() => {
    if (searchMatches.length > 0) jumpToMessage(searchMatches[searchIndex]?.id);
  }, [searchIndex, searchMatches, jumpToMessage]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewSinceScroll(0);
  }, []);

  // Jump to bottom instantly on chat switch; auto-scroll on new messages
  // only if the user is already near the bottom (don't yank them away
  // from history they're reading).
  useEffect(() => {
    const chatChanged = prevChatIdRef.current !== chat?.id;
    prevChatIdRef.current = chat?.id;
    if (chatChanged) {
      prevMsgCountRef.current = visibleMessages.length;
      requestAnimationFrame(() => scrollToBottom(false));
      setNewSinceScroll(0);
      return;
    }
    const grew = visibleMessages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = visibleMessages.length;
    if (grew) {
      const last = visibleMessages[visibleMessages.length - 1];
      if (isNearBottom || last?.senderId === currentUserId) {
        requestAnimationFrame(() => scrollToBottom(true));
      } else {
        setNewSinceScroll((n) => n + 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMessages.length, chat?.id]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setIsNearBottom(nearBottom);
    if (nearBottom) setNewSinceScroll(0);
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      const prevHeight = el.scrollHeight;
      onLoadOlder?.().then(() => {
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight;
        });
      });
    }
  }, [hasMoreOlder, loadingOlder, onLoadOlder]);

  // Auto-grow the composer textarea up to a capped height (CSS max-height
  // then takes over with an internal scrollbar for anything longer).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Typing indicator listener
  useEffect(() => {
    if (!chat?.id) return;
    let unsub;
    listenToTyping(chat.id, (docs) => {
      const now = Date.now();
      const others = docs.filter((d) => d.id !== currentUserId && d.updatedAt?.toMillis && now - d.updatedAt.toMillis() < 5000);
      setTypingUsers(others.map((d) => d.name));
    }).then((fn) => (unsub = fn));
    return () => unsub && unsub();
  }, [chat?.id, currentUserId]);

  // Clear our own typing status when leaving the chat
  useEffect(() => {
    return () => {
      if (chat?.id) clearTypingStatus(chat.id, currentUserId);
    };
  }, [chat?.id, currentUserId]);

  const handleTextChange = useCallback(
    (val) => {
      setText(val);
      if (!chat?.id) return;
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1500) {
        lastTypingSentRef.current = now;
        setTypingStatus(chat.id, currentUserId, currentUserName);
      }
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => clearTypingStatus(chat.id, currentUserId), 2500);
    },
    [chat?.id, currentUserId, currentUserName]
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStreamRef = useRef(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      window.alert('Could not access your microphone. Check your browser/OS permissions.');
    }
  }

  function stopRecording(send) {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    clearInterval(recordTimerRef.current);
    recorder.onstop = () => {
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (send && recordChunksRef.current.length > 0) {
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        onSend({ mediaFile: file, mediaType: 'audio' });
      }
      setIsRecording(false);
      setRecordSeconds(0);
      mediaRecorderRef.current = null;
    };
    recorder.stop();
  }

  useEffect(() => () => clearInterval(recordTimerRef.current), []);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    onSend({
      text: text.trim(),
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || (replyTo?.mediaType ? mediaLabel(replyTo.mediaType) : null),
      replyToSender: replyTo ? (replyTo.senderId === currentUserId ? 'You' : (chat?.isGroup ? chat.participantNames?.[replyTo.senderId] : chat?.name)) : null,
    });
    setText('');
    setShowEmoji(false);
    setReplyTo(null);
    if (chat?.id) clearTypingStatus(chat.id, currentUserId);
  }, [text, onSend, chat, currentUserId, replyTo]);

  const handleReply = useCallback((message) => {
    setReplyTo(message);
    textareaRef.current?.focus();
  }, []);

  const handleReact = useCallback(
    (messageId, emoji) => {
      if (!chat?.id) return;
      toggleReaction(chat.id, messageId, currentUserId, emoji);
    },
    [chat?.id, currentUserId]
  );

  const handleStartEdit = useCallback((messageId, currentText) => {
    setEditingId(messageId);
    setEditText(currentText || '');
  }, []);

  const handleSaveEdit = useCallback(
    (messageId) => {
      if (!chat?.id || !editText.trim()) return;
      editMessage(chat.id, messageId, editText.trim());
      setEditingId(null);
    },
    [chat?.id, editText]
  );

  const handleDelete = useCallback(
    (messageId) => {
      if (!chat?.id) return;
      if (confirm('Delete this message?')) deleteMessage(chat.id, messageId);
    },
    [chat?.id]
  );

  if (!chat) {
    return (
      <div className="chat-window" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
          Select a chat to start messaging
        </div>
      </div>
    );
  }

  const maxSizeMb = isPro ? 2048 : 25;

  function handleFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size / (1024 * 1024) > maxSizeMb) {
      alert(`Free plan limit is ${maxSizeMb}MB per file. Upgrade to Pro for up to 2GB.`);
      onUpgradeClick();
      return;
    }
    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    onSend({ mediaFile: file, mediaType });
    e.target.value = '';
  }

  async function handleDirectFilePick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !chat || chat.isGroup) return;
    const toId = (chat.participantIds || []).find((id) => id !== currentUserId);
    if (!toId) return;
    const mediaType = file.type.startsWith('video') ? 'video' : 'image';
    setDirectError('');
    setDirectProgress(0);
    try {
      await sendFileDirect({
        chatId: chat.id,
        currentUser,
        toId,
        file,
        mediaType,
        onProgress: (p) => setDirectProgress(p),
      });
    } catch (err) {
      setDirectError(err.message);
    } finally {
      setDirectProgress(null);
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <div style={{ flex: 1 }}>
          <div className="chat-window-title">{chat.name}</div>
          <div className="chat-window-status">
            {typingUsers.length > 0
              ? `${typingUsers.join(', ')} typing…`
              : chat.isGroup
                ? `${chat.memberCount || ''} members`
                : otherPresence?.online
                  ? '● online'
                  : otherPresence?.lastSeen
                    ? `last seen ${formatLastSeen(otherPresence.lastSeen)}`
                    : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" title="Search in chat" onClick={() => setShowSearch((s) => !s)}>🔍</button>
          {!chat.isGroup && (
            <>
              <button className="icon-btn" title="Audio call" onClick={() => onStartCall('audio')}>📞</button>
              <button className="icon-btn" title="Video call" onClick={() => onStartCall('video')}>🎥</button>
            </>
          )}
        </div>
      </div>

      {pinnedMessages.length > 0 && (
        <div className="pinned-bar">
          <span style={{ marginRight: 6 }}>📌</span>
          <span className="pinned-bar-text" onClick={() => jumpToMessage(pinnedMessages[pinnedMessages.length - 1].id)}>
            {pinnedMessages[pinnedMessages.length - 1].text || 'Pinned attachment'}
          </span>
          {pinnedMessages.length > 1 && <span className="pinned-bar-count">+{pinnedMessages.length - 1} more</span>}
        </div>
      )}

      {showSearch && (
        <div className="chat-search-bar">
          <input
            autoFocus
            placeholder="Search in this conversation…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchMatches.length > 0) {
                setSearchIndex((i) => (i + 1) % searchMatches.length);
              }
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); }
            }}
          />
          <span className="search-count">
            {searchQuery.trim() ? (searchMatches.length > 0 ? `${searchIndex + 1} / ${searchMatches.length}` : 'No matches') : ''}
          </span>
          <button
            className="search-nav-btn"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
          >
            ‹
          </button>
          <button
            className="search-nav-btn"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchIndex((i) => (i + 1) % searchMatches.length)}
          >
            ›
          </button>
          <span className="search-close" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>✕</span>
        </div>
      )}

      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {hasMoreOlder && visibleMessages.length > 0 && (
          <div className="load-more-row">
            <button className="load-more-btn" onClick={onLoadOlder} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {visibleMessages.map((m) => {
          const otherIds = (chat.participantIds || []).filter((id) => id !== currentUserId);
          const msgTime = m.createdAt?.toMillis?.() || 0;
          const seen = msgTime > 0 && otherIds.some((id) => {
            const readAt = chat.readBy?.[id]?.toMillis?.();
            return readAt && readAt >= msgTime;
          });
          // "Delivered" is approximated from presence (no per-message ack
          // channel yet): treat it as delivered once the recipient's client
          // has been online since this message was sent.
          const delivered = msgTime > 0 && (otherPresence?.online || (otherPresence?.lastSeen?.toMillis?.() || 0) >= msgTime);
          return (
            <MessageBubble
              key={m.id}
              m={m}
              isMine={m.senderId === currentUserId}
              senderName={chat.isGroup ? chat.participantNames?.[m.senderId] : null}
              currentUserId={currentUserId}
              onReact={handleReact}
              onStartEdit={handleStartEdit}
              onDelete={handleDelete}
              isEditing={editingId === m.id}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
              seen={seen}
              delivered={delivered}
              onReply={handleReply}
              onJumpTo={jumpToMessage}
              highlight={highlightId === m.id}
              onCopy={(text) => navigator.clipboard?.writeText(text)}
              onStar={onStar}
              onPin={onPin}
              onForward={setForwardMsg}
              onDeleteForMe={onDeleteForMe}
              onDeleteForEveryone={onDeleteForEveryone}
            />
          );
        })}
      </div>

      {!isNearBottom && (
        <button className="scroll-to-bottom-btn" onClick={() => scrollToBottom(true)} title="Scroll to latest">
          ↓
          {newSinceScroll > 0 && <span className="unread-badge-mini">{newSinceScroll}</span>}
        </button>
      )}

      {!isPro && <AdBanner onUpgradeClick={onUpgradeClick} />}

      {directError && (
        <div style={{ margin: '0 24px 8px', fontSize: 12, color: 'var(--danger)' }}>
          ⚡ {directError}
        </div>
      )}
      {directProgress !== null && (
        <div style={{ margin: '0 24px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
          ⚡ Sending directly… {Math.round(directProgress * 100)}%
        </div>
      )}

      {replyTo && (
        <div className="reply-preview">
          <span className="reply-preview-text">
            Replying to {replyTo.senderId === currentUserId ? 'yourself' : (chat.isGroup ? chat.participantNames?.[replyTo.senderId] : chat.name)}: {replyTo.text || mediaLabel(replyTo.mediaType)}
          </span>
          <span className="reply-preview-close" onClick={() => setReplyTo(null)}>✕</span>
        </div>
      )}

      <div className="composer" style={{ position: 'relative' }}>
        {showEmoji && (
          <EmojiPicker
            onSelect={(emoji) => setText((t) => t + emoji)}
            onClose={() => setShowEmoji(false)}
          />
        )}
        <input
          type="file"
          accept="image/*,video/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFilePick}
        />
        <input
          type="file"
          accept="image/*,video/*"
          ref={directInputRef}
          style={{ display: 'none' }}
          onChange={handleDirectFilePick}
        />
        <button className="icon-btn" onClick={() => setShowEmoji((s) => !s)} title="Emoji">
          😊
        </button>
        <button className="icon-btn" onClick={() => fileInputRef.current.click()} title="Attach photo or video (via cloud)">
          📎
        </button>
        {!chat.isGroup && (
          <button
            className="icon-btn"
            onClick={() => directInputRef.current.click()}
            title="Send directly, peer-to-peer (both people must be online now, not stored in the cloud)"
            disabled={directProgress !== null}
          >
            ⚡
          </button>
        )}
        {isRecording ? (
          <div className="recording-bar">
            <span className="recording-dot" />
            <span className="recording-time">{Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}</span>
            <span className="recording-hint">Recording voice message…</span>
            <button className="icon-btn" title="Cancel" onClick={() => stopRecording(false)}>🗑️</button>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="composer-input"
            rows={1}
            placeholder={isOnline === false ? 'Message (will send when back online)' : 'Message'}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && getEnterToSend()) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        )}
        {isRecording ? (
          <button className="send-btn" onClick={() => stopRecording(true)} title="Send voice message">
            ➤
          </button>
        ) : text.trim() ? (
          <button className="send-btn" onClick={handleSend}>
            ➤
          </button>
        ) : (
          <button className="icon-btn" onClick={startRecording} title="Record a voice message">
            🎤
          </button>
        )}
      </div>

      {forwardMsg && (
        <div className="modal-backdrop" onClick={() => setForwardMsg(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Forward message</div>
            <div className="modal-sub">
              {forwardMsg.text || mediaLabel(forwardMsg.mediaType)}
            </div>
            <div className="forward-chat-list">
              {(allChats || []).filter((c) => c.id !== chat.id).map((c) => (
                <div
                  key={c.id}
                  className="forward-chat-row"
                  onClick={() => {
                    const senderName = forwardMsg.senderId === currentUserId
                      ? 'You'
                      : (chat.isGroup ? chat.participantNames?.[forwardMsg.senderId] : chat.name);
                    onForward(c.id, { ...forwardMsg, forwardedFrom: senderName });
                    setForwardMsg(null);
                  }}
                >
                  {c.name}
                </div>
              ))}
              {(!allChats || allChats.filter((c) => c.id !== chat.id).length === 0) && (
                <div className="modal-sub">No other chats to forward to yet.</div>
              )}
            </div>
            <button className="load-more-btn" style={{ marginTop: 10 }} onClick={() => setForwardMsg(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
