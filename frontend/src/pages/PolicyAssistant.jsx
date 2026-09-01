import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthProvider';
import { apiClient } from '../services/api';

/**
 * Formats RAG text: bold, bullets, source citations.
 */
const formatBotMessage = (text) => {
  if (!text) return { __html: '' };
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?:\s|^)\*\s+(.*?)(?=(?:\s\*|$))/g, '<br/>• $1')
    .replace(/(Sources?:)/gi, '<br/><br/><strong style="color: #6c757d; font-size: 0.9em;">$1</strong>')
    .replace(/\n/g, '<br/>');
  return { __html: formatted };
};

function PolicyAssistant() {
  const navigate = useNavigate();
  const { langCode, t } = useLanguage();
  const { user, userDetails } = useAuth();

  // Chat state
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([
    { id: 1, text: null, isBot: true, isGreeting: true }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Voice state
  const [listening, setListening] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const shouldSendRef = useRef(true);
  const clearErrorRef = useRef(null);

  const isSpeechSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const suggestedPrompts = [
    "What is POSH policy?",
    "Can I report anonymously?",
    "What qualifies as harassment?",
    "How to file a complaint?",
    "What is the grievance resolution timeline?",
    "Who handles high-severity cases?"
  ];

  // ── Scroll to bottom ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Load sessions when user is logged in ───────────────────────────────
  useEffect(() => {
    if (user) {
      loadLatestSession();
      loadAllSessions();
    }
  }, [user]);

  // Warmup RAG on page load
  useEffect(() => {
    apiClient("/api/agents/warmup").catch(err => console.error("Warmup failed", err));
  }, []);

  // ── Session management ─────────────────────────────────────────────────
  const loadLatestSession = async () => {
    try {
      const res = await apiClient("/api/chat/session/latest");
      if (res.ok) {
        const session = await res.json();
        if (session) {
          setSessionId(session.id);
          loadSessionMessages(session.id);
        }
      }
    } catch (err) { console.error("Failed to load latest session", err); }
  };

  const loadAllSessions = async () => {
    try {
      const res = await apiClient("/api/chat/sessions");
      if (res.ok) setSessions(await res.json());
    } catch (err) { console.error("Failed to load sessions", err); }
  };

  const loadSessionMessages = async (id) => {
    try {
      const res = await apiClient(`/api/chat/session/${id}`);
      if (res.ok) {
        const msgs = await res.json();
        if (msgs.length > 0) {
          setMessages(msgs.map(m => ({ id: m.id, text: m.message, isBot: m.sender === 'assistant' })));
        } else {
          setMessages([{ id: 1, text: null, isBot: true, isGreeting: true }]);
        }
      }
    } catch (err) { console.error("Failed to load messages", err); }
  };

  const handleNewConversation = () => {
    setSessionId(null);
    setMessages([{ id: 1, text: null, isBot: true, isGreeting: true }]);
  };

  const switchSession = (id) => {
    setSessionId(id);
    loadSessionMessages(id);
  };

  const deleteSession = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm(t('confirmDeleteChat') || "Are you sure you want to delete this chat?")) return;
    try {
      const res = await apiClient(`/api/chat/session/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (id === sessionId) handleNewConversation();
        loadAllSessions();
      }
    } catch (err) { console.error("Failed to delete session", err); }
  };

  // ── Voice recording ────────────────────────────────────────────────────
  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null; setRecordSecs(0); };

  const showError = (msg) => {
    clearTimeout(clearErrorRef.current);
    setVoiceError(msg);
    clearErrorRef.current = setTimeout(() => setVoiceError(''), 4000);
  };

  const startListening = async () => {
    if (!isSpeechSupported || listening) return;
    audioChunksRef.current = [];
    shouldSendRef.current = true;
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstart = () => { setListening(true); setRecordSecs(0); timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000); };
      mediaRecorder.onstop = async () => {
        setListening(false); stopTimer();
        stream.getTracks().forEach(t => t.stop());
        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const fd = new FormData(); fd.append('file', blob, 'recording.webm');
          try {
            const r = await apiClient('/api/agents/transcribe', { method: 'POST', body: fd });
            if (!r.ok) throw new Error('Transcription failed');
            const d = await r.json();
            const transcript = typeof d.transcript === 'string' ? d.transcript : (d.transcript?.text || '');
            if (transcript.trim()) handleSendMessage(transcript.trim());
          } catch { showError("Couldn't transcribe audio. Try again."); }
          finally { setIsTranscribing(false); }
        }
      };
      mediaRecorder.start();
    } catch { showError("Microphone access denied. Please allow mic in browser settings."); }
  };

  const stopListening = () => { shouldSendRef.current = true; if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop(); };
  const cancelListening = () => { shouldSendRef.current = false; if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop(); setListening(false); stopTimer(); };

  // ── Send message (RAG) ─────────────────────────────────────────────────
  const handleSendMessage = async (text) => {
    if (!text.trim()) return;
    let currentSessionId = sessionId;

    if (!currentSessionId && user) {
      try {
        const sessRes = await apiClient("/api/chat/session", { method: "POST", body: JSON.stringify({}) });
        if (sessRes.ok) { const ns = await sessRes.json(); currentSessionId = ns.id; setSessionId(currentSessionId); loadAllSessions(); }
      } catch (err) { console.error("Failed to create session", err); }
    }

    const newUserMsg = { id: Date.now(), text, isBot: false };
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);

    if (currentSessionId) {
      apiClient("/api/chat/message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: currentSessionId, sender: "user", message: text })
      }).then(() => loadAllSessions());
    }

    try {
      const res = await apiClient("/api/agents/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lang: langCode, session_id: currentSessionId || undefined }),
      });
      if (!res.ok) throw new Error("Backend error");
      const data = await res.json();
      let responseText = data.response || "Sorry, I couldn't find an answer.";
      if (data.sources?.length > 0) {
        responseText += `\n\n📄 ${t("sources") || "Sources"}: ${data.sources.map(s => `${s.source} (p.${s.page})`).join(", ")}`;
      }
      const botMsg = {
        id: Date.now() + 1,
        text: responseText,
        isBot: true,
        severity: data.severity || '',
        department: data.department || '',
        routed: data.routed || false,
        grievance_id: data.grievance_id || '',
        assigned_to: data.assigned_to || '',
      };
      setMessages(prev => [...prev, botMsg]);
      if (currentSessionId) {
        apiClient("/api/chat/message", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: currentSessionId, sender: "assistant", message: responseText })
        });
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, text: "⚠️ Sorry, I'm having trouble connecting to the policy engine. Please try again in a moment.", isBot: true }]);
    } finally { setIsTyping(false); }
  };

  const handleKeyPress = (e) => { if (e.key === 'Enter') handleSendMessage(inputValue); };

  // ── Determine lodge route ──────────────────────────────────────────────
  const getLodgeRoute = () => {
    if (!userDetails?.user_type) return "/lodge-selection";
    switch (userDetails.user_type) {
      case "Internal": return "/lodge-internal";
      case "Contract": return "/lodge-contract";
      case "External": return "/lodge-external";
      default: return "/lodge-selection";
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="pa-container">

      {/* ── LEFT SIDEBAR: Chat History ─────────────────────────────────── */}
      <aside className={`pa-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="pa-sidebar-header">
          <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z"/></svg>
            History
          </h6>
          <button className="pa-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
          </button>
        </div>

        <button className="pa-new-chat-btn" onClick={handleNewConversation}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>
          New Conversation
        </button>

        <div className="pa-sessions-list">
          {!user ? (
            <div className="pa-sessions-empty">
              <p>Login to save chat history</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="pa-sessions-empty">
              <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" opacity="0.4"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p>No past conversations</p>
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`pa-session-item ${s.id === sessionId ? 'active' : ''} d-flex justify-content-between align-items-center`}
                onClick={() => switchSession(s.id)}
              >
                <div>
                  <div className="pa-session-title">{s.title || "New Conversation"}</div>
                  <div className="pa-session-date">{new Date(s.updated_at).toLocaleDateString()}</div>
                </div>
                <button
                  className="btn btn-sm btn-link text-danger p-0 delete-chat-btn"
                  style={{ opacity: 0.7 }}
                  title="Delete chat"
                  onClick={(e) => deleteSession(e, s.id)}
                >
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ─────────────────────────────────────────────── */}
      <main className="pa-main">

        {/* Top bar */}
        <div className="pa-topbar">
          <div className="d-flex align-items-center gap-2">
            {!sidebarOpen && (
              <button className="pa-icon-btn" onClick={() => setSidebarOpen(true)} title="Show history">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>
              </button>
            )}
            <div className="pa-topbar-avatar">
              <img src="/assistant_logo.png" alt="AI" />
            </div>
            <div>
              <h5 className="mb-0 fw-bold pa-topbar-title">{t('chatbotTitle') || 'Policy Assistant'}</h5>
              <small className="pa-topbar-subtitle">RAG-Powered Grievance Intelligence</small>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="pa-status-dot"></span>
            <small className="pa-topbar-status">Online</small>

          </div>
        </div>

        {/* Messages */}
        <div className="pa-messages">
          {/* Welcome / empty state */}
          {messages.length <= 1 && (
            <div className="pa-welcome">
              <div className="pa-welcome-icon">🤖</div>
              <h4 className="fw-bold mb-2">How can I help you today?</h4>
              <p className="text-muted mb-4">Ask me anything about company policies, grievance procedures, POSH compliance, or how to file a complaint.</p>
              <div className="pa-prompts-grid">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    className="pa-prompt-chip"
                    onClick={() => handleSendMessage(prompt)}
                  >
                    <span className="pa-prompt-icon">💬</span>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} className={`pa-msg-row ${msg.isBot ? 'bot' : 'user'}`}>
              {msg.isBot && (
                <div className="pa-msg-avatar">
                  <img src="/assistant_logo.png" alt="AI" />
                </div>
              )}
              <div className={`pa-msg-bubble ${msg.isBot ? 'bot' : 'user'}`}>
                {msg.isGreeting ? (
                  t('chatbotGreeting') || "Hi! I'm the AI Policy Assistant. How can I help you today?"
                ) : msg.isBot ? (
                  <>
                    <div dangerouslySetInnerHTML={formatBotMessage(msg.text)} />
                    {msg.routed && msg.department && (
                      <div className="pa-routing-badge high">
                        <span className="pa-routing-dot"></span>
                        <span>High Severity → Routed to <strong>{msg.department}</strong></span>
                        {msg.grievance_id && <span className="pa-routing-id">ID: {String(msg.grievance_id).slice(0, 8)}</span>}
                      </div>
                    )}
                    {msg.severity === 'low' && !msg.isGreeting && (
                      <div className="pa-routing-badge low">
                        <span className="pa-routing-dot"></span>
                        <span>Policy Assistant</span>
                      </div>
                    )}
                  </>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="pa-msg-row bot">
              <div className="pa-msg-avatar">
                <img src="/assistant_logo.png" alt="AI" />
              </div>
              <div className="pa-msg-bubble bot pa-typing">
                <span className="pa-dot"></span>
                <span className="pa-dot"></span>
                <span className="pa-dot"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="pa-input-area">
          {voiceError && (
            <div className="pa-voice-error">
              <span>⚠️ {voiceError}</span>
              <button onClick={() => setVoiceError('')}>×</button>
            </div>
          )}

          {listening ? (
            <div className="pa-recording-bar">
              <button className="pa-icon-btn text-muted" onClick={cancelListening} title="Discard">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
              </button>
              <div className="pa-recording-pulse"></div>
              <span className="pa-recording-time">{fmtTime(recordSecs)}</span>
              <div style={{flex: 1}}></div>
              <button className="pa-send-btn" onClick={stopListening} title="Stop and send">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>
              </button>
            </div>
          ) : (
            <div className="pa-input-row">
              <input
                type="text"
                className="pa-input"
                placeholder={isTranscribing ? "Transcribing audio..." : (t('chatbotPlaceholder') || "Type your question about policies...")}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isTyping || isTranscribing}
              />
              <button
                className="pa-icon-btn pa-mic-btn"
                onClick={startListening}
                disabled={!isSpeechSupported || isTyping || isTranscribing}
                title="Voice input"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/></svg>
              </button>
              <button
                className="pa-send-btn"
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping || isTranscribing}
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Mobile overlay when sidebar is open */}
      {sidebarOpen && (
        <div className="pa-mobile-overlay d-lg-none" onClick={() => setSidebarOpen(false)}></div>
      )}
    </div>
  );
}

export default PolicyAssistant;
