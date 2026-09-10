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
  const isSendingRef = useRef(false);

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
          setMessages(msgs.map(m => {
            const meta = m.metadata || {};
            return {
              id: m.id,
              text: m.message,
              isBot: m.sender === 'assistant',
              severity: meta.severity || '',
              department: meta.department || '',
              routed: meta.routed || false,
              grievance_id: meta.grievance_id || '',
              assigned_to: meta.assigned_to || '',
              trigger_form: meta.trigger_form || false,
              form_reason: meta.form_reason || '',
              chatbot_resolved: meta.chatbot_resolved !== false,
              can_escalate: meta.can_escalate || false,
              source_type: meta.source_type || 'GENERAL_KNOWLEDGE',
              policy_name: meta.policy_name || '',
              intent: meta.intent || '',
              original_query: meta.original_query || ''
            };
          }));
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
    const trimmed = (text || '').trim();
    if (!trimmed || isSendingRef.current || isTyping) return;

    // Immediately acquire lock and update UI synchronously to prevent duplicate dispatches
    isSendingRef.current = true;
    setInputValue('');
    setIsTyping(true);

    let currentSessionId = sessionId;

    if (!currentSessionId && user) {
      try {
        const sessRes = await apiClient("/api/chat/session", { method: "POST", body: JSON.stringify({}) });
        if (sessRes.ok) { const ns = await sessRes.json(); currentSessionId = ns.id; setSessionId(currentSessionId); loadAllSessions(); }
      } catch (err) { console.error("Failed to create session", err); }
    }

    const newUserMsg = { id: Date.now(), text: trimmed, isBot: false };
    setMessages(prev => [...prev, newUserMsg]);

    if (currentSessionId) {
      apiClient("/api/chat/message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: currentSessionId, sender: "user", message: trimmed })
      }).then(() => loadAllSessions());
    }

    try {
      const res = await apiClient("/api/agents/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, lang: langCode, session_id: currentSessionId || undefined }),
      });
      if (!res.ok) throw new Error("Backend error");
      const data = await res.json();
      let responseText = data.response || "Sorry, I couldn't find an answer.";
      if (data.sources?.length > 0) {
        responseText += `\n\n${t("sources") || "Sources"}: ${data.sources.map(s => `${s.source} (p.${s.page})`).join(", ")}`;
      }
      const botMsg = {
        id: Date.now() + 1,
        text: responseText,
        isBot: true,
        severity: data.severity ? data.severity.toLowerCase() : '',
        department: data.department || '',
        routed: data.routed || false,
        grievance_id: data.grievance_id || '',
        assigned_to: data.assigned_to || '',
        trigger_form: data.trigger_form || false,
        form_reason: data.form_reason || '',
        chatbot_resolved: data.chatbot_resolved !== false,
        can_escalate: data.can_escalate || false,
        source_type: data.source_type || 'GENERAL_KNOWLEDGE',
        policy_name: data.policy_name || '',
        intent: data.intent || 'QUERY',
        original_query: trimmed
      };
      setMessages(prev => [...prev, botMsg]);
      if (currentSessionId) {
        apiClient("/api/chat/message", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: currentSessionId,
            sender: "assistant",
            message: responseText,
            metadata: {
              severity: botMsg.severity,
              department: botMsg.department,
              routed: botMsg.routed,
              grievance_id: botMsg.grievance_id,
              assigned_to: botMsg.assigned_to,
              trigger_form: botMsg.trigger_form,
              form_reason: botMsg.form_reason,
              chatbot_resolved: botMsg.chatbot_resolved,
              can_escalate: botMsg.can_escalate,
              source_type: botMsg.source_type,
              policy_name: botMsg.policy_name,
              intent: botMsg.intent,
              original_query: botMsg.original_query
            }
          })
        });
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, text: "Sorry, I'm having trouble connecting to the policy engine. Please try again in a moment.", isBot: true }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isTyping && !isSendingRef.current) {
        handleSendMessage(inputValue);
      }
    }
  };

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

  const stripEmojis = (str) => str ? str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').replace(/\s+/g, ' ').trim() : '';

  const getQueryDescription = (msgItem) => {
    if (msgItem?.original_query) return stripEmojis(msgItem.original_query);
    const idx = messages.findIndex(m => m.id === msgItem?.id);
    if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        if (!messages[i].isBot && messages[i].text) {
          return stripEmojis(messages[i].text);
        }
      }
    }
    return '';
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
            <div className="purva-avatar-topbar">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="purva-avatar-svg">
                {/* Glowing ring */}
                <circle cx="32" cy="32" r="30" stroke="url(#purvaGlow)" strokeWidth="2" fill="none" opacity="0.7"/>
                {/* Background circle */}
                <circle cx="32" cy="32" r="28" fill="url(#purvaGradBg)"/>
                {/* Neck */}
                <rect x="26" y="40" width="12" height="8" rx="4" fill="#f4c2a1"/>
                {/* Body / shoulders */}
                <ellipse cx="32" cy="56" rx="18" ry="12" fill="url(#purvaShirt)"/>
                {/* Head */}
                <circle cx="32" cy="28" r="13" fill="#f4c2a1"/>
                {/* Hair */}
                <path d="M19 26 Q19 14 32 13 Q45 14 45 26 Q44 18 32 17 Q20 18 19 26Z" fill="#5c3d2e"/>
                <path d="M19 27 Q17 36 20 40 Q19 32 21 28Z" fill="#5c3d2e"/>
                <path d="M45 27 Q47 36 44 40 Q45 32 43 28Z" fill="#5c3d2e"/>
                {/* Eyes */}
                <ellipse cx="27" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                <ellipse cx="37" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                {/* Eye shine */}
                <circle cx="28" cy="27" r="0.7" fill="#fff"/>
                <circle cx="38" cy="27" r="0.7" fill="#fff"/>
                {/* Smile */}
                <path d="M27 33 Q32 37 37 33" stroke="#c87941" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                {/* Cheeks */}
                <ellipse cx="22" cy="31" rx="3" ry="2" fill="#f9a8a8" opacity="0.5"/>
                <ellipse cx="42" cy="31" rx="3" ry="2" fill="#f9a8a8" opacity="0.5"/>
                <defs>
                  <radialGradient id="purvaGradBg" cx="50%" cy="35%" r="50%">
                    <stop offset="0%" stopColor="#1e1e30"/>
                    <stop offset="100%" stopColor="#12121e"/>
                  </radialGradient>
                  <linearGradient id="purvaShirt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1"/>
                    <stop offset="100%" stopColor="#4f46e5"/>
                  </linearGradient>
                  <linearGradient id="purvaGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#a78bfa"/>
                    <stop offset="50%" stopColor="#f472b6"/>
                    <stop offset="100%" stopColor="#a78bfa"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h5 className="mb-0 fw-bold pa-topbar-title">Purva</h5>
              <small className="pa-topbar-subtitle">Your AI Grievance Companion</small>
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
              <div className="purva-welcome-avatar">
                <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="purva-welcome-svg">
                  <circle cx="50" cy="50" r="47" stroke="url(#purvaWelcomeGlow)" strokeWidth="2.5" fill="none"/>
                  <circle cx="50" cy="50" r="44" fill="url(#purvaWelcomeBg)"/>
                  <rect x="39" y="62" width="22" height="14" rx="7" fill="#f4c2a1"/>
                  <ellipse cx="50" cy="86" rx="28" ry="18" fill="url(#purvaWelcomeShirt)"/>
                  <circle cx="50" cy="44" r="22" fill="#f4c2a1"/>
                  <path d="M28 42 Q28 22 50 20 Q72 22 72 42 Q70 28 50 27 Q30 28 28 42Z" fill="#5c3d2e"/>
                  <path d="M28 43 Q25 56 30 63 Q28 52 31 46Z" fill="#5c3d2e"/>
                  <path d="M72 43 Q75 56 70 63 Q72 52 69 46Z" fill="#5c3d2e"/>
                  <ellipse cx="42" cy="44" rx="3.5" ry="4" fill="#3d2b1f"/>
                  <ellipse cx="58" cy="44" rx="3.5" ry="4" fill="#3d2b1f"/>
                  <circle cx="44" cy="42" r="1.2" fill="#fff"/>
                  <circle cx="60" cy="42" r="1.2" fill="#fff"/>
                  <path d="M42 52 Q50 58 58 52" stroke="#c87941" strokeWidth="2" fill="none" strokeLinecap="round"/>
                  <ellipse cx="35" cy="48" rx="5" ry="3.5" fill="#f9a8a8" opacity="0.45"/>
                  <ellipse cx="65" cy="48" rx="5" ry="3.5" fill="#f9a8a8" opacity="0.45"/>
                  <defs>
                    <radialGradient id="purvaWelcomeBg" cx="50%" cy="35%" r="55%">
                      <stop offset="0%" stopColor="#2d2d4a"/>
                      <stop offset="100%" stopColor="#18181c"/>
                    </radialGradient>
                    <linearGradient id="purvaWelcomeShirt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6"/>
                      <stop offset="100%" stopColor="#6d28d9"/>
                    </linearGradient>
                    <linearGradient id="purvaWelcomeGlow" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#a78bfa"/>
                      <stop offset="50%" stopColor="#f472b6"/>
                      <stop offset="100%" stopColor="#a78bfa"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h4 className="fw-bold mb-2">Hi, I'm <span style={{ background: 'linear-gradient(135deg, #a78bfa, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Purva</span></h4>
              <p className="text-muted mb-4">Your AI companion for company policies, grievance procedures, POSH compliance, and filing complaints — I'm here to help!</p>
              <div className="pa-prompts-grid">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    className="pa-prompt-chip"
                    onClick={() => handleSendMessage(prompt)}
                  >
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
                <div className="pa-msg-avatar purva-msg-avatar">
                  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                    <circle cx="32" cy="32" r="30" fill="url(#pMsgBg)" />
                    <rect x="26" y="40" width="12" height="7" rx="3.5" fill="#f4c2a1"/>
                    <ellipse cx="32" cy="54" rx="16" ry="10" fill="url(#pMsgShirt)"/>
                    <circle cx="32" cy="28" r="13" fill="#f4c2a1"/>
                    <path d="M19 26 Q19 14 32 13 Q45 14 45 26 Q44 18 32 17 Q20 18 19 26Z" fill="#5c3d2e"/>
                    <ellipse cx="27" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                    <ellipse cx="37" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                    <circle cx="28" cy="27" r="0.7" fill="#fff"/>
                    <circle cx="38" cy="27" r="0.7" fill="#fff"/>
                    <path d="M27 33 Q32 37 37 33" stroke="#c87941" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                    <ellipse cx="22" cy="31" rx="3" ry="2" fill="#f9a8a8" opacity="0.5"/>
                    <ellipse cx="42" cy="31" rx="3" ry="2" fill="#f9a8a8" opacity="0.5"/>
                    <defs>
                      <radialGradient id="pMsgBg" cx="50%" cy="35%" r="55%">
                        <stop offset="0%" stopColor="#2d2d4a"/>
                        <stop offset="100%" stopColor="#18181c"/>
                      </radialGradient>
                      <linearGradient id="pMsgShirt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6"/>
                        <stop offset="100%" stopColor="#6d28d9"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              )}
              <div className={`pa-msg-bubble ${msg.isBot ? 'bot' : 'user'}`}>
                {msg.isGreeting ? (
                  t('chatbotGreeting') || "Hi! I'm Purva, your AI Grievance Companion. How can I help you today?"
                ) : msg.isBot ? (
                  <>
                    <div dangerouslySetInnerHTML={formatBotMessage(msg.text)} />
                    {msg.routed && msg.department && (
                      <div className={`pa-routing-badge ${(msg.severity || 'high').toLowerCase() === 'medium' ? 'medium' : 'high'}`}>
                        <span className="pa-routing-dot"></span>
                        <span>{((msg.severity || 'High').charAt(0).toUpperCase() + (msg.severity || 'high').slice(1).toLowerCase())} Severity → Routed to <strong>{msg.department}</strong></span>
                        {msg.grievance_id && <span className="pa-routing-id">ID: {String(msg.grievance_id).slice(0, 5)}</span>}
                      </div>
                    )}
                    {msg.severity === 'low' && !msg.isGreeting && (
                      <div className="pa-routing-badge low d-flex align-items-center gap-1" style={{
                        background: msg.source_type === 'POLICY' ? '#eff6ff' : '#f8fafc',
                        color: msg.source_type === 'POLICY' ? '#1d4ed8' : '#334155',
                        border: msg.source_type === 'POLICY' ? '1px solid #bfdbfe' : '1px solid #e2e8f0'
                      }}>
                        <span className="pa-routing-dot" style={{ backgroundColor: msg.source_type === 'POLICY' ? '#2563eb' : '#10b981' }}></span>
                        <span>{msg.source_type === 'POLICY' ? `Policy: ${msg.policy_name || 'Official Policy'}` : (msg.intent === 'GRIEVANCE' ? 'Purva Resolution' : 'General Guidance')}</span>
                      </div>
                    )}

                    {/* TRIGGER GRIEVANCE FORM CARD FOR HIGH / MEDIUM COMPLAINTS */}
                    {msg.trigger_form && (msg.severity === 'high' || msg.severity === 'medium' || msg.form_reason === 'high_severity' || msg.form_reason === 'medium_severity') && (
                      <div 
                        className="mt-3 p-3 rounded-3 border text-start shadow-sm"
                        style={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          borderLeft: '4px solid #001a4d'
                        }}
                      >
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span 
                            className="badge rounded-pill px-2 py-1 text-uppercase fw-bold"
                            style={{ 
                              backgroundColor: msg.severity === 'high' ? '#c4122f' : '#d97706',
                              color: '#ffffff',
                              fontSize: '10px'
                            }}
                          >
                            {msg.severity ? `${msg.severity} Severity Complaint` : 'Formal Complaint'}
                          </span>
                          {msg.department && (
                            <span className="small text-muted fw-semibold">
                              Dept: {msg.department}
                            </span>
                          )}
                        </div>
                        <p className="small mb-3 fw-semibold text-dark">
                          Formal grievance lodging is required for prioritized administrative investigation and SLA tracking.
                        </p>
                        <button
                          type="button"
                          className="btn btn-sm w-100 fw-bold shadow-sm rounded-pill d-flex align-items-center justify-content-center gap-2"
                          style={{
                            background: 'linear-gradient(135deg, #001a4d 0%, #003366 100%)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '7px 14px',
                            fontSize: '13px'
                          }}
                          onClick={() => {
                            navigate(getLodgeRoute(), {
                              state: {
                                description: getQueryDescription(msg),
                                department: msg.department || ''
                              }
                            });
                          }}
                        >
                          <span>Open Grievance Form</span>
                          <span>→</span>
                        </button>
                      </div>
                    )}

                    {/* SATISFACTION / ESCALATION CARD FOR LOW SEVERITY GRIEVANCES */}
                    {msg.can_escalate && (
                      <div 
                        className="mt-3 p-3 rounded-3 border text-start shadow-sm"
                        style={{
                          backgroundColor: '#ffffff',
                          borderColor: '#fed7aa',
                          borderLeft: '4px solid #f97316'
                        }}
                      >
                        <div className="d-flex align-items-center gap-1 mb-1">
                          <span className="badge rounded-pill px-2 py-1" style={{ fontSize: '10.5px', fontWeight: '700', backgroundColor: '#ffedd5', color: '#c2410c' }}>
                            Resolution Guidance
                          </span>
                        </div>
                        <p className="small mb-3 text-muted" style={{ fontSize: '12.5px' }}>
                          Did this address your concern? If this explanation does not resolve the issue, you may lodge an official grievance ticket for formal department handling.
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm w-100 fw-semibold rounded-pill d-flex align-items-center justify-content-center gap-2"
                          style={{ padding: '6px 14px', fontSize: '12.5px' }}
                          onClick={() => {
                            navigate(getLodgeRoute(), {
                              state: {
                                description: getQueryDescription(msg),
                                department: msg.department || ''
                              }
                            });
                          }}
                        >
                          <span>Not satisfied? Lodge Formal Grievance</span>
                          <span>→</span>
                        </button>
                      </div>
                    )}

                    {/* REDIRECT TO FORM FOR UNRESOLVED LOW COMPLAINTS */}
                    {!msg.can_escalate && msg.trigger_form && (msg.form_reason === 'unresolved_low_query' || (!msg.chatbot_resolved && msg.severity === 'low')) && (
                      <div 
                        className="mt-3 p-3 rounded-3 border text-start shadow-sm"
                        style={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          borderLeft: '4px solid #475569'
                        }}
                      >
                        <div className="d-flex align-items-center gap-1 mb-2">
                          <span className="badge bg-secondary-subtle text-dark rounded-pill px-2 py-1" style={{ fontSize: '10px', fontWeight: '600' }}>
                            Policy Unresolved
                          </span>
                        </div>
                        <p className="small mb-3 text-muted">
                          The automated assistant could not resolve this from official policy documents. Would you like to submit an official ticket?
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm w-100 fw-semibold rounded-pill d-flex align-items-center justify-content-center gap-2"
                          style={{ padding: '6px 14px', fontSize: '12.5px' }}
                          onClick={() => {
                            navigate(getLodgeRoute(), {
                              state: {
                                description: getQueryDescription(msg),
                                department: msg.department || ''
                              }
                            });
                          }}
                        >
                          <span>Lodge as Formal Grievance</span>
                          <span>→</span>
                        </button>
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
              <div className="pa-msg-avatar purva-msg-avatar">
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                  <circle cx="32" cy="32" r="30" fill="url(#pTypBg)" />
                  <rect x="26" y="40" width="12" height="7" rx="3.5" fill="#f4c2a1"/>
                  <ellipse cx="32" cy="54" rx="16" ry="10" fill="url(#pTypShirt)"/>
                  <circle cx="32" cy="28" r="13" fill="#f4c2a1"/>
                  <path d="M19 26 Q19 14 32 13 Q45 14 45 26 Q44 18 32 17 Q20 18 19 26Z" fill="#5c3d2e"/>
                  <ellipse cx="27" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                  <ellipse cx="37" cy="28" rx="2" ry="2.5" fill="#3d2b1f"/>
                  <circle cx="28" cy="27" r="0.7" fill="#fff"/>
                  <circle cx="38" cy="27" r="0.7" fill="#fff"/>
                  <path d="M27 33 Q32 37 37 33" stroke="#c87941" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
                  <defs>
                    <radialGradient id="pTypBg" cx="50%" cy="35%" r="55%">
                      <stop offset="0%" stopColor="#2d2d4a"/>
                      <stop offset="100%" stopColor="#18181c"/>
                    </radialGradient>
                    <linearGradient id="pTypShirt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6"/>
                      <stop offset="100%" stopColor="#6d28d9"/>
                    </linearGradient>
                  </defs>
                </svg>
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
              <span>{voiceError}</span>
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
                onKeyDown={handleKeyDown}
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
