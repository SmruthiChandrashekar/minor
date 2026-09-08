import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { apiClient } from "../services/api";
import { useAuth } from "../context/AuthProvider";

/**
 * Formats RAG text to convert asterisks to bullet points, 
 * handles bolding, and nicely formats the "Sources:" section.
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

const Chatbot = () => {
  const navigate = useNavigate();
  const { langCode, t } = useLanguage();
  const { user, userDetails } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getLodgeRoute = () => {
    if (!userDetails?.user_type) return "/lodge-selection";
    switch (userDetails.user_type) {
      case "Internal": return "/lodge-internal";
      case "Contract": return "/lodge-contract";
      case "External": return "/lodge-external";
      default: return "/lodge-selection";
    }
  };
  
  // Chat History States
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([
    { id: 1, text: null, isBot: true, isGreeting: true }
  ]);
  
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const messagesEndRef = useRef(null);
  
  // MediaRecorder refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const shouldSendRef = useRef(true);
  const clearErrorRef = useRef(null);

  const isSpeechSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setRecordSecs(0);
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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstart = () => {
        setListening(true);
        setRecordSecs(0);
        timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
      };

      mediaRecorder.onstop = async () => {
        setListening(false);
        stopTimer();
        stream.getTracks().forEach(track => track.stop());

        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');
          
          try {
            const response = await apiClient('/api/agents/transcribe', {
              method: 'POST',
              body: formData,
            });
            if (!response.ok) throw new Error('Transcription failed');
            const data = await response.json();
            const transcript = typeof data.transcript === 'string' 
              ? data.transcript 
              : (data.transcript?.text || '');
              
            if (transcript.trim()) {
              handleSendMessage(transcript.trim());
            }
          } catch (error) {
            console.error('Whisper transcription error:', error);
            showError("Couldn't transcribe audio. Try again.");
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error('Microphone access error:', err);
      showError("Microphone access denied. Please allow mic in browser settings.");
    }
  };

  const showError = (msg) => {
    clearTimeout(clearErrorRef.current);
    setVoiceError(msg);
    clearErrorRef.current = setTimeout(() => setVoiceError(''), 4000);
  };

  const stopListening = () => {
    shouldSendRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelListening = () => {
    shouldSendRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
    stopTimer();
  };

  const [showHint, setShowHint] = useState(true);
  const [hintText, setHintText] = useState(null);

  const suggestedPrompts = [
    "What is POSH policy?",
    "Can I report anonymously?",
    "What qualifies as harassment?",
    "How to file a complaint?"
  ];

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const hideHint = () => setShowHint(false);
    document.addEventListener('click', hideHint);
    return () => document.removeEventListener('click', hideHint);
  }, []);

  useEffect(() => {
    const handleContextTrigger = (e) => {
      setHintText(e.detail || "Not sure about policy? Ask the assistant first. 👇");
      setShowHint(true);
      if (isOpen) setIsOpen(false);
      setTimeout(() => setShowHint(false), 5000);
    };
    window.addEventListener('chatbot-hint', handleContextTrigger);
    return () => window.removeEventListener('chatbot-hint', handleContextTrigger);
  }, [isOpen]);

  useEffect(() => {
    const handleChatbotOpen = (e) => {
      setIsOpen(true);
      setShowHint(false);
      apiClient("/api/agents/warmup").catch(err => console.error("Warmup failed", err));
      if (e.detail) {
        setTimeout(() => handleSendMessage(e.detail), 300);
      }
    };
    window.addEventListener('chatbot-open', handleChatbotOpen);
    return () => window.removeEventListener('chatbot-open', handleChatbotOpen);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);


  // ── CHAT HISTORY LOGIC ───────────────────────────────────────────────────
  
  // Load initial state when user is logged in
  useEffect(() => {
    if (user) {
      loadLatestSession();
      loadAllSessions();
    }
  }, [user]);

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
    } catch (err) {
      console.error("Failed to load latest session", err);
    }
  };

  const loadAllSessions = async () => {
    try {
      const res = await apiClient("/api/chat/sessions");
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch (err) {
      console.error("Failed to load sessions", err);
    }
  };

  const loadSessionMessages = async (id) => {
    try {
      const res = await apiClient(`/api/chat/session/${id}`);
      if (res.ok) {
        const msgs = await res.json();
        if (msgs.length > 0) {
          // Convert backend format to frontend format
          const formatted = msgs.map(m => ({
            id: m.id,
            text: m.message,
            isBot: m.sender === 'assistant'
          }));
          setMessages(formatted);
        } else {
          setMessages([{ id: 1, text: null, isBot: true, isGreeting: true }]);
        }
      }
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  const handleNewConversation = () => {
    setSessionId(null);
    setMessages([{ id: 1, text: null, isBot: true, isGreeting: true }]);
    setIsSidebarOpen(false);
  };

  const switchSession = (id) => {
    setSessionId(id);
    loadSessionMessages(id);
    setIsSidebarOpen(false);
  };


  // ── RAG-POWERED RESPONSE ──────────────────────────────────────────────────
  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    let currentSessionId = sessionId;

    // Create session if it doesn't exist
    if (!currentSessionId) {
      try {
        const sessRes = await apiClient("/api/chat/session", { 
          method: "POST", 
          body: JSON.stringify({}) 
        });
        if (sessRes.ok) {
          const newSession = await sessRes.json();
          currentSessionId = newSession.id;
          setSessionId(currentSessionId);
          // Refresh sessions list in background
          loadAllSessions();
        }
      } catch (err) {
        console.error("Failed to create session", err);
      }
    }

    const newUserMsg = { id: Date.now(), text, isBot: false };
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue("");
    setIsTyping(true);

    // Save user message to backend
    if (currentSessionId) {
      apiClient("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: currentSessionId, sender: "user", message: text })
      }).then(() => loadAllSessions()); // Update title in sidebar
    }

    // Call backend RAG endpoint
    try {
      const res = await apiClient("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, lang: langCode }),
      });

      if (!res.ok) throw new Error("Backend error");

      const data = await res.json();
      let responseText = data.response || "Sorry, I couldn't find an answer.";

      // Append source citations if available
      if (data.sources && data.sources.length > 0) {
        const sourceList = data.sources
          .map(s => `${s.source} (p.${s.page})`)
          .join(", ");
        responseText += `\n\n${t("sources") || "Sources"}: ${sourceList}`;
      }

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: responseText,
        isBot: true,
        severity: data.severity ? data.severity.toLowerCase() : '',
        department: data.department || '',
        routed: data.routed || false,
        grievance_id: data.grievance_id || '',
        trigger_form: data.trigger_form || false,
        form_reason: data.form_reason || '',
        chatbot_resolved: data.chatbot_resolved !== false,
        original_query: text
      }]);

      // Save bot message to backend
      if (currentSessionId) {
        apiClient("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: currentSessionId, sender: "assistant", message: responseText })
        });
      }

    } catch (err) {
      console.error("RAG chat error:", err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "Sorry, I'm having trouble connecting to the policy engine. Please try again in a moment.",
        isBot: true
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── CHATBOT → HUMAN HANDOFF ──────────────────────────────────────────────
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffResult, setHandoffResult] = useState(null);

  const handleHandoff = async () => {
    if (handoffLoading) return;
    setHandoffLoading(true);

    // Collect last few messages as context
    const recentMessages = messages
      .filter(m => !m.isGreeting && m.text)
      .slice(-5)
      .map(m => m.text)
      .join(' | ');
    const description = recentMessages || 'User requested human assistance from chatbot';

    try {
      const res = await apiClient('/api/grievances/chatbot-handoff', {
        method: 'POST',
        body: JSON.stringify({
          description: description.substring(0, 1000),
          department: 'CRM',
          session_id: sessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHandoffResult(data);
        const confirmMsg = {
          id: Date.now(),
          text: `✅ **Your request has been forwarded to the support team.**\n\n📋 **Tracking ID**: ${data.grievance_id}\n👤 **Assigned to**: ${data.assigned_to || 'Available representative'}\n📊 **Tier**: ${data.assigned_tier}\n⏱️ **Response SLA**: ${data.sla_hours} hours\n\nYou'll receive a notification when a representative responds.`,
          isBot: true,
        };
        setMessages(prev => [...prev, confirmMsg]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: '⚠️ Sorry, I was unable to connect you to a human representative right now. Please try again or submit a formal grievance.',
          isBot: true,
        }]);
      }
    } catch (err) {
      console.error('Handoff error:', err);
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: '⚠️ Connection error. Please try again.',
        isBot: true,
      }]);
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSendMessage(inputValue);
  };

  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };

  return (
    <>
      <style>{`
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(0, 26, 77, 0.5); }
          70% { box-shadow: 0 0 0 15px rgba(0, 26, 77, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 26, 77, 0); }
        }
        .chatbot-btn {
          animation: pulseGlow 2.5s infinite;
          background: linear-gradient(135deg, #001a4d 0%, #003366 100%) !important;
          border: none !important;
          color: #fff !important;
        }
        .chatbot-btn:hover {
          transform: scale(1.04);
          animation: none;
          background: linear-gradient(135deg, #00143a 0%, #00264d 100%) !important;
        }
        .chatbot-btn.btn-open {
          width: 60px !important;
          border-radius: 50% !important;
          padding: 0 !important;
          justify-content: center !important;
          animation: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        }
        @media (max-width: 576px) {
          .chatbot-text { display: none !important; }
          .chatbot-icon { margin-right: 0 !important; }
          .chatbot-btn { 
            width: 60px !important; 
            height: 60px !important; 
            border-radius: 50% !important; 
            padding: 0 !important; 
            justify-content: center !important;
          }
        }
        /* ── Mic recording animations ───────────────────────── */
        @keyframes micCorePulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.18); opacity: 0.85; }
        }
        @keyframes ripple {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1);   }
        }
        @keyframes recBarSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .rec-bar { animation: recBarSlideIn 0.22s ease; }
        .mic-core { animation: micCorePulse 1.1s ease-in-out infinite; }
        .mic-ripple {
          position: absolute; inset: 0; border-radius: 50%;
          border: 2px solid #dc3545; animation: ripple 1.4s ease-out infinite;
        }
        .mic-ripple-2 { animation-delay: 0.7s; }
        .sound-bar {
          width: 3px; border-radius: 3px; background: #dc3545;
          animation: wave 0.7s ease-in-out infinite;
        }
        
        /* Sidebar Animations */
        .chat-sidebar {
          position: absolute;
          top: 0; left: 0; bottom: 0; width: 250px;
          background: var(--card-bg);
          border-right: 1px solid rgba(0,0,0,0.1);
          z-index: 10;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
        }
        .chat-sidebar.open {
          transform: translateX(0);
        }
        .chat-main {
          transition: transform 0.3s ease;
        }
        .chat-main.shifted {
          transform: translateX(250px);
        }
        .session-item {
          padding: 10px 15px;
          cursor: pointer;
          border-bottom: 1px solid rgba(0,0,0,0.05);
          transition: background 0.2s;
        }
        .session-item:hover {
          background: rgba(0, 26, 77, 0.05);
        }
        .session-item.active {
          background: rgba(0, 26, 77, 0.1);
          border-left: 4px solid #001a4d;
        }
      `}</style>

      {/* TOOLTIP HINT */}
      <div 
        className="bg-dark text-white shadow p-2 rounded-3 text-center"
        style={{
          position: 'fixed', bottom: '85px', right: '24px', zIndex: 9999,
          maxWidth: '220px', fontSize: '13px', pointerEvents: 'none',
          opacity: showHint && !isOpen ? 1 : 0,
          transform: showHint && !isOpen ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {hintText || t('chatbotHint')}
        <div style={{
          position: 'absolute', bottom: '-6px', right: '24px', width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderTop: '6px solid #212529'
        }} />
      </div>

      {/* FLOATING BUTTON (PILL) */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          const nextState = !isOpen;
          setIsOpen(nextState);
          setShowHint(false);
          if (nextState) apiClient("/api/agents/warmup").catch(err => console.error("Warmup failed", err));
        }}
        className={`btn shadow-lg d-flex align-items-center chatbot-btn ${isOpen ? 'btn-open' : ''}`}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', height: '54px',
          borderRadius: '27px', padding: '0 24px', zIndex: 9999,
          transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {isOpen ? (
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 16 16" className="me-0">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
          </svg>
        ) : (
          <>
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 16 16" className="chatbot-icon me-2">
              <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z"/>
            </svg>
            <span className="chatbot-text fw-bold" style={{ fontSize: '15px' }}>{t('chatbotBtn') || "Chat"}</span>
          </>
        )}
      </button>

      {/* CHAT PANEL */}
      <div 
        className="card shadow-lg border-0"
        style={{
          position: 'fixed', bottom: '100px', right: '24px',
          width: '380px', height: '80vh', maxHeight: '600px',
          zIndex: 9998,
          transform: isOpen ? 'translateX(0)' : 'translateX(120%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
          borderRadius: '16px', overflow: 'hidden'
        }}
      >
        {/* SIDEBAR (History) */}
        <div className={`chat-sidebar d-flex flex-column ${isSidebarOpen ? 'open' : ''}`}>
          <div className="p-3 border-bottom d-flex justify-content-between align-items-center bg-light">
            <h6 className="mb-0 fw-bold">Chat History</h6>
            <button className="btn btn-sm text-muted p-0" onClick={() => setIsSidebarOpen(false)}>
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
            </button>
          </div>
          <div className="p-2 border-bottom">
            <button 
              className="btn w-100 fw-bold rounded-pill shadow-sm text-white" 
              onClick={handleNewConversation}
              style={{ background: 'linear-gradient(135deg, #001a4d 0%, #003366 100%)', border: 'none' }}
            >
              + New Conversation
            </button>
          </div>
          <div className="flex-grow-1 overflow-auto bg-white">
            {sessions.length === 0 ? (
              <div className="text-center p-4 text-muted small">No past conversations</div>
            ) : (
              sessions.map(s => (
                <div 
                  key={s.id} 
                  className={`session-item ${s.id === sessionId ? 'active' : ''}`}
                  onClick={() => switchSession(s.id)}
                >
                  <div className="text-truncate fw-bold mb-1" style={{ fontSize: '14px', color: 'var(--text-color)' }}>
                    {s.title || "New Conversation"}
                  </div>
                  <div className="text-muted" style={{ fontSize: '11px' }}>
                    {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className={`chat-main d-flex flex-column w-100 h-100 ${isSidebarOpen ? 'shifted' : ''}`} style={{ backgroundColor: 'var(--bg-color)' }}>
          {/* HEADER */}
          <div className="text-white p-3 d-flex justify-content-between align-items-center" style={{ flexShrink: 0, background: 'linear-gradient(135deg, #001a4d 0%, #003366 100%)' }}>
            <div className="d-flex align-items-center gap-2">
              <button 
                className="btn btn-sm text-white p-0 border-0 shadow-none d-flex align-items-center justify-content-center me-1"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                style={{ width: '28px', height: '28px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/></svg>
              </button>
              <div>
                <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
                  <img src="/assistant_logo.png" alt="AI" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.2)" }} />
                  {t('chatbotTitle') || "Policy Assistant"}
                </h6>
                <small style={{ opacity: 0.8 }}>{t('chatbotSubtitle') || "Ask me anything"}</small>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="btn btn-sm text-white" style={{ fontSize: '24px', padding: 0, lineHeight: 1 }}>×</button>
          </div>

          {/* OVERLAY FOR SIDEBAR (closes sidebar on click) */}
          {isSidebarOpen && (
            <div 
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 9 }}
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* MESSAGES BODY */}
          <div className="flex-grow-1 p-3" style={{ overflowY: 'auto' }}>
            
            {messages.length === 1 && (
              <div className="mb-4">
                <p className="small mb-2 text-center" style={{ color: 'var(--text-color)', opacity: 0.7 }}>{t('chatbotSuggestedTopics') || "Suggested Topics:"}</p>
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  {suggestedPrompts.map((prompt, idx) => (
                    <button 
                      key={idx} onClick={() => handlePromptClick(prompt)}
                      className="btn btn-sm rounded-pill"
                      style={{ 
                        fontSize: '13px', 
                        backgroundColor: 'var(--card-bg)', 
                        color: 'var(--text-color)',
                        border: '1px solid #002b66',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0, 43, 102, 0.08)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`d-flex mb-3 ${msg.isBot ? 'justify-content-start' : 'justify-content-end'}`}>
                <div 
                  className="p-3 shadow-sm"
                  style={{
                    maxWidth: '85%',
                    backgroundColor: msg.isBot ? 'var(--chat-bubble-bot)' : undefined,
                    background: msg.isBot ? undefined : 'linear-gradient(135deg, #001a4d 0%, #003366 100%)',
                    color: msg.isBot ? 'var(--text-color)' : '#ffffff',
                    borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
                    borderBottomLeftRadius: msg.isBot ? '4px' : '16px',
                    borderBottomRightRadius: msg.isBot ? '16px' : '4px',
                    fontSize: '14.5px', lineHeight: '1.5',
                    wordBreak: 'break-word'
                  }}
                >
                  {msg.isGreeting ? (
                    t('chatbotGreeting') || "Hi! I'm the AI Policy Assistant. How can I help you today?"
                  ) : msg.isBot ? (
                    <>
                      <div dangerouslySetInnerHTML={formatBotMessage(msg.text)} />

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
                              const stripEmojis = (str) => str ? str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').replace(/\s+/g, ' ').trim() : '';
                              setIsOpen(false);
                              navigate(getLodgeRoute(), {
                                state: {
                                  description: stripEmojis(msg.original_query || ""),
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

                      {/* REDIRECT TO FORM FOR UNRESOLVED LOW COMPLAINTS */}
                      {msg.trigger_form && (msg.form_reason === 'unresolved_low_query' || (!msg.chatbot_resolved && msg.severity === 'low')) && (
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
                              const stripEmojis = (str) => str ? str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').replace(/\s+/g, ' ').trim() : '';
                              setIsOpen(false);
                              navigate(getLodgeRoute(), {
                                state: {
                                  description: stripEmojis(msg.original_query || ""),
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

            {isTyping && (
              <div className="d-flex mb-3 justify-content-start">
                <div className="p-3 shadow-sm d-flex align-items-center gap-1" style={{ 
                  backgroundColor: 'var(--chat-bubble-bot)',
                  borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomLeftRadius: '4px', borderBottomRightRadius: '16px' 
                }}>
                  <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem' }}></div>
                  <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem', animationDelay: '0.2s' }}></div>
                  <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem', animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* HANDOFF BUTTON */}
          {messages.length > 2 && !handoffResult && (
            <div className="text-center py-2 border-top" style={{ backgroundColor: 'var(--chat-bg)' }}>
              <button
                onClick={handleHandoff}
                disabled={handoffLoading}
                className="btn btn-sm btn-outline-warning rounded-pill px-3 fw-semibold"
                style={{ fontSize: '12px', transition: 'all 0.2s' }}
              >
                {handoffLoading ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" /> Connecting...</>
                ) : (
                  <>Speak to a Human</>
                )}
              </button>
            </div>
          )}

          {/* INPUT BOX */}
          <div className="border-top" style={{ flexShrink: 0, backgroundColor: 'var(--chat-bg)' }}>

            {listening && (
              <div className="rec-bar d-flex align-items-center gap-2 px-3" style={{ height: '68px', backgroundColor: '#fff8f8' }}>
                <button onClick={cancelListening} title="Discard recording" style={{ background: 'none', border: 'none', padding: '6px', color: '#adb5bd', cursor: 'pointer', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                  </svg>
                </button>
                <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0 }}>
                  <div className="mic-ripple" /><div className="mic-ripple mic-ripple-2" />
                  <div className="mic-core d-flex align-items-center justify-content-center rounded-circle" style={{ width: '38px', height: '38px', backgroundColor: '#dc3545', position: 'relative', zIndex: 1 }}>
                    <svg width="15" height="15" fill="white" viewBox="0 0 16 16"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/></svg>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-1" style={{ flex: 1, overflow: 'hidden' }}>
                  {[0.3, 0.6, 1, 0.7, 0.45, 0.8, 0.5, 1, 0.65, 0.35].map((delay, i) => (
                    <div key={i} className="sound-bar" style={{ height: `${14 + i % 3 * 8}px`, animationDelay: `${delay * 0.4}s` }} />
                  ))}
                  <span style={{ marginLeft: '8px', color: '#dc3545', fontWeight: 600, fontSize: '13px', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {fmtTime(recordSecs)}
                  </span>
                </div>
                <button onClick={stopListening} title="Stop and send" className="btn rounded-circle d-flex align-items-center justify-content-center" style={{ width: '42px', height: '42px', flexShrink: 0, border: 'none', background: 'linear-gradient(135deg, #001a4d 0%, #003366 100%)', color: '#fff' }}>
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>
                </button>
              </div>
            )}

            {!listening && (
              <div className="p-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control rounded-pill me-2 border-0 shadow-none px-4"
                    style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                    placeholder={isTranscribing ? "Transcribing audio..." : (t('chatbotPlaceholder') || "Type a message...")}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isTyping || isTranscribing}
                  />
                  <button type="button" className="btn btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center me-2" onClick={startListening} disabled={!isSpeechSupported || isTyping || isTranscribing} style={{ width: '45px', height: '45px', flexShrink: 0 }}>
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/></svg>
                  </button>
                  <button 
                    className="btn rounded-circle d-flex align-items-center justify-content-center" 
                    onClick={() => handleSendMessage(inputValue)} 
                    disabled={!inputValue.trim() || isTyping || isTranscribing} 
                    style={{ 
                      width: '45px', 
                      height: '45px', 
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, #001a4d 0%, #003366 100%)',
                      color: '#fff',
                      border: 'none',
                      opacity: (!inputValue.trim() || isTyping || isTranscribing) ? 0.5 : 1
                    }}
                  >
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/></svg>
                  </button>
                </div>
              </div>
            )}
            
            {voiceError && (
              <div style={{ padding: '8px 16px', backgroundColor: '#fff3cd', borderTop: '1px solid #ffc107', color: '#856404', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px', animation: 'recBarSlideIn 0.2s ease' }}>
                <span style={{ fontSize: '15px' }}>⚠️</span>
                {voiceError}
                <button onClick={() => setVoiceError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#856404', cursor: 'pointer', fontSize: '15px', padding: 0 }}>×</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Chatbot;
