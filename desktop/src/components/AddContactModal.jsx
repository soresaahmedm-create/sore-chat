import React, { useState } from 'react';
import { findOrCreateChatWithEmail, createGroupChat } from '../firebase.js';

export default function AddContactModal({ currentUser, onClose, onChatReady }) {
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [email, setEmail] = useState('');
  const [groupName, setGroupName] = useState('');
  const [emailList, setEmailList] = useState([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function addEmailToList(e) {
    e.preventDefault();
    const val = emailDraft.trim();
    if (val && !emailList.includes(val)) setEmailList([...emailList, val]);
    setEmailDraft('');
  }

  function removeEmail(val) {
    setEmailList(emailList.filter((e) => e !== val));
  }

  async function handleDirect(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const chatId = await findOrCreateChatWithEmail(currentUser, email);
      onChatReady(chatId);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGroup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const chatId = await createGroupChat(currentUser, emailList, groupName);
      onChatReady(chatId);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: 380 }}>
        <button className="close-modal" onClick={onClose}>✕</button>
        <h2>New chat</h2>

        <div className="plan-toggle" style={{ marginTop: 6 }}>
          <button className={mode === 'direct' ? 'active' : ''} onClick={() => setMode('direct')} type="button">
            DIRECT MESSAGE
          </button>
          <button className={mode === 'group' ? 'active' : ''} onClick={() => setMode('group')} type="button">
            GROUP
          </button>
        </div>

        {mode === 'direct' ? (
          <form onSubmit={handleDirect}>
            <div className="sub">Enter the Sore Chat email of someone who's already signed up.</div>
            <input
              className="composer-input"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              placeholder="their@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
            {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button className="upgrade-cta" disabled={loading} style={{ background: 'var(--signal)', color: 'var(--bg)' }}>
              {loading ? 'Looking them up…' : 'Start chatting'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleGroup}>
            <div className="sub">Name your group and add at least 2 people by email.</div>
            <input
              className="composer-input"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                className="composer-input"
                style={{ flex: 1, boxSizing: 'border-box' }}
                placeholder="someone@email.com"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                type="email"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addEmailToList(e);
                }}
              />
              <button
                type="button"
                onClick={addEmailToList}
                style={{
                  width: 40, borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface-raised)', color: 'var(--signal)', cursor: 'pointer', fontWeight: 700,
                }}
              >
                +
              </button>
            </div>

            {emailList.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {emailList.map((e) => (
                  <span
                    key={e}
                    style={{
                      background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 20,
                      padding: '4px 10px', fontSize: 12, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center',
                    }}
                  >
                    {e}
                    <span style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => removeEmail(e)}>✕</span>
                  </span>
                ))}
              </div>
            )}

            {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button className="upgrade-cta" disabled={loading} style={{ background: 'var(--signal)', color: 'var(--bg)' }}>
              {loading ? 'Creating group…' : 'Create group'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
