import React, { useState, useEffect, useRef, useContext } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { apiClient } from "../services/api";

/**
 * Formats RAG text to convert asterisks to bullet points, 
 * handles bolding, and nicely formats the "Sources:" section.
 */
const formatBotMessage = (text) => {
  if (!text) return { __html: '' };
  
  let formatted = text
    // Convert **bold** to <strong>bold</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert `* ` to a clean bullet point with line break
    .replace(/(?:\s|^)\*\s+(.*?)(?=(?:\s\*|$))/g, '<br/>• $1')
    // Highlight "Sources:" separately
    .replace(/(Sources?:)/gi, '<br/><br/><strong style="color: #6c757d; font-size: 0.9em;">$1</strong>')
    // Preserve normal line breaks
    .replace(/\n/g, '<br/>');

  return { __html: formatted };
};

const Chatbot = () => {
  const { langCode, t } = useLanguage();  // langCode for API, t() for UI labels
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: null, isBot: true, isGreeting: true }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false); // Show loading while backend processes
  const messagesEndRef     = useRef(null);
  
  // MediaRecorder refs
  const mediaRecorderRef   = useRef(null);
  const audioChunksRef     = useRef([]);
  const timerRef           = useRef(null);
  const shouldSendRef      = useRef(true);
  const clearErrorRef      = useRef(null);

  // ── VOICE INPUT (WHISPER/MEDIARECORDER) ──────────────────────────────────
  const isSpeechSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /** BCP-47 locale codes for each app language */
  const LANG_MAP = { en: "en-US", hi: "hi-IN", kn: "kn-IN" };

  /** Format seconds as m:ss */
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
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setListening(true);
        setRecordSecs(0);
        timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
      };

      mediaRecorder.onstop = async () => {
        setListening(false);
        stopTimer();
        
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          setIsTranscribing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          const formData = new FormData();
          // The backend expects 'file'
          formData.append('file', audioBlob, 'recording.webm');
          
          try {
            const response = await apiClient('/api/agents/transcribe', {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) throw new Error('Transcription failed');
            
            const data = await response.json();
            
            // The backend returns { "transcript": "the text..." }
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

  /** Stop recording → sends to backend */
  const stopListening = () => {
    shouldSendRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  /** Discard recording */
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

  // Auto hide hint after 5 seconds on initial load
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  // Hide hint on any click anywhere
  useEffect(() => {
    const hideHint = () => setShowHint(false);
    document.addEventListener('click', hideHint);
    return () => document.removeEventListener('click', hideHint);
  }, []);

  // Listen for custom trigger from anywhere in the app
  useEffect(() => {
    const handleContextTrigger = (e) => {
      setHintText(e.detail || "Not sure about policy? Ask the assistant first. 👇");
      setShowHint(true);
      if (isOpen) setIsOpen(false); // Close panel to show hint clearly
      
      // Auto hide the context hint after 5s as well
      setTimeout(() => setShowHint(false), 5000);
    };
    window.addEventListener('chatbot-hint', handleContextTrigger);
    return () => window.removeEventListener('chatbot-hint', handleContextTrigger);
  }, [isOpen]);

  // Listen for query redirect from Lodge pages → open chatbot and auto-send message
  useEffect(() => {
    const handleChatbotOpen = (e) => {
      setIsOpen(true);
      setShowHint(false);
      
      // Background warmup call to eliminate first-query latency
      apiClient("/api/agents/warmup").catch(err => console.error("Warmup failed", err));

      if (e.detail) {
        // Small delay so panel renders before the message is added
        setTimeout(() => handleSendMessage(e.detail), 300);
      }
    };
    window.addEventListener('chatbot-open', handleChatbotOpen);
    return () => window.removeEventListener('chatbot-open', handleChatbotOpen);
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── RAG-POWERED RESPONSE (via backend) ───────────────────────────────────────
  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    const newUserMsg = { id: Date.now(), text, isBot: false };
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue("");
    setIsTyping(true);

    // Quick greeting — no need to hit the backend
    const q = text.toLowerCase().trim();
    if (/^(hi|hello|hey|good morning|good evening|good afternoon|namaste|नमस्ते|नमस्कार)/.test(q)) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: t('chatbotHelloReply'),
          isBot: true
        }]);
        setIsTyping(false);
      }, 400);
      return;
    }

    if (/^(thank|thanks|bye|goodbye|ok|okay|got it|understood|धन्यवाद|शुक्रिया)/.test(q)) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: t('chatbotByeReply'),
          isBot: true
        }]);
        setIsTyping(false);
      }, 400);
      return;
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
        responseText += `\n\n📄 ${t("sources")}: ${sourceList}`;
      }

      setMessages(prev => [...prev, { id: Date.now() + 1, text: responseText, isBot: true }]);
    } catch (err) {
      console.error("RAG chat error:", err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: "⚠️ Sorry, I'm having trouble connecting to the policy engine. Please try again in a moment.",
        isBot: true
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage(inputValue);
    }
  };

  const handlePromptClick = (prompt) => {
    handleSendMessage(prompt);
  };

  return (
    <>
      <style>{`
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(13, 110, 253, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(13, 110, 253, 0); }
          100% { box-shadow: 0 0 0 0 rgba(13, 110, 253, 0); }
        }
        .chatbot-btn {
          animation: pulseGlow 2.5s infinite;
        }
        .chatbot-btn:hover {
          transform: scale(1.04);
          animation: none;
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
        .rec-bar {
          animation: recBarSlideIn 0.22s ease;
        }
        .mic-core {
          animation: micCorePulse 1.1s ease-in-out infinite;
        }
        .mic-ripple {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid #dc3545;
          animation: ripple 1.4s ease-out infinite;
        }
        .mic-ripple-2 {
          animation-delay: 0.7s;
        }
        .sound-bar {
          width: 3px;
          border-radius: 3px;
          background: #dc3545;
          animation: wave 0.7s ease-in-out infinite;
        }
      `}</style>

      {/* TOOLTIP HINT */}
      <div 
        className="bg-dark text-white shadow p-2 rounded-3 text-center"
        style={{
          position: 'fixed',
          bottom: '85px',
          right: '24px',
          zIndex: 9999,
          maxWidth: '220px',
          fontSize: '13px',
          pointerEvents: 'none',
          opacity: showHint && !isOpen ? 1 : 0,
          transform: showHint && !isOpen ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {hintText || t('chatbotHint')}
        {/* Little triangle arrow pointing down */}
        <div style={{
          position: 'absolute',
          bottom: '-6px',
          right: '24px',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
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
          
          if (nextState) {
            apiClient("/api/agents/warmup").catch(err => console.error("Warmup failed", err));
          }
        }}
        className={`btn btn-primary shadow-lg d-flex align-items-center chatbot-btn ${isOpen ? 'btn-open' : ''}`}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          height: '54px',
          borderRadius: '27px',
          padding: '0 24px',
          zIndex: 9999,
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
            <span className="chatbot-text fw-bold" style={{ fontSize: '15px' }}>{t('chatbotBtn')}</span>
          </>
        )}
      </button>

      {/* CHAT PANEL */}
      <div 
        className="card shadow-lg border-0"
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '24px',
          width: '380px',
          height: '80vh',
          maxHeight: '600px',
          zIndex: 9998,
          transform: isOpen ? 'translateX(0)' : 'translateX(120%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div className="bg-primary text-white p-3 d-flex justify-content-between align-items-center">
          <div>
            <h6 className="mb-0 fw-bold d-flex align-items-center gap-2">
              <img 
                src="/assistant_logo.png" 
                alt="AI" 
                style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.2)" }} 
              />
              {t('chatbotTitle')}
            </h6>
            <small style={{ opacity: 0.8 }}>{t('chatbotSubtitle')}</small>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="btn btn-sm text-white"
            style={{ fontSize: '24px', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* MESSAGES BODY */}
        <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', backgroundColor: 'var(--bg-color)' }}>
          
          {/* SUGGESTED PROMPTS */}
          {messages.length === 1 && (
            <div className="mb-4">
              <p className="small mb-2 text-center" style={{ color: 'var(--text-color)', opacity: 0.7 }}>{t('chatbotSuggestedTopics')}</p>
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {suggestedPrompts.map((prompt, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handlePromptClick(prompt)}
                    className="btn btn-sm btn-outline-primary rounded-pill"
                    style={{ fontSize: '13px', backgroundColor: 'var(--card-bg)', color: 'var(--text-color)' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CHAT BUBBLES */}
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`d-flex mb-3 ${msg.isBot ? 'justify-content-start' : 'justify-content-end'}`}
            >
              <div 
                className={`p-3 shadow-sm ${msg.isBot ? '' : 'bg-primary text-white'}`}
                style={{
                  maxWidth: '85%',
                  backgroundColor: msg.isBot ? 'var(--chat-bubble-bot)' : undefined,
                  color: msg.isBot ? 'var(--text-color)' : undefined,
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: msg.isBot ? '4px' : '16px',
                  borderBottomRightRadius: msg.isBot ? '16px' : '4px',
                  fontSize: '14.5px',
                  lineHeight: '1.5'
                }}
              >
                {msg.isGreeting ? (
                  t('chatbotGreeting')
                ) : msg.isBot ? (
                  <div dangerouslySetInnerHTML={formatBotMessage(msg.text)} />
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}

          {/* TYPING INDICATOR */}
          {isTyping && (
            <div className="d-flex mb-3 justify-content-start">
              <div className="p-3 bg-white shadow-sm d-flex align-items-center gap-1" style={{ 
                borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomLeftRadius: '4px', borderBottomRightRadius: '16px' 
              }}>
                <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem' }} role="status"></div>
                <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem', animationDelay: '0.2s' }} role="status"></div>
                <div className="spinner-grow spinner-grow-sm text-muted" style={{ width: '0.35rem', height: '0.35rem', animationDelay: '0.4s' }} role="status"></div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT BOX */}
        <div className="bg-white border-top" style={{ flexShrink: 0 }}>

          {/* ── WHATSAPP-STYLE RECORDING BAR ───────────────────────────── */}
          {listening && (
            <div
              className="rec-bar d-flex align-items-center gap-2 px-3"
              style={{ height: '68px', backgroundColor: '#fff8f8' }}
            >
              {/* 🗑 DISCARD — left side */}
              <button
                onClick={cancelListening}
                title="Discard recording"
                style={{
                  background: 'none', border: 'none', padding: '6px',
                  color: '#adb5bd', cursor: 'pointer', flexShrink: 0,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                {/* Trash icon */}
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                  <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
              </button>

              {/* Pulsing red mic */}
              <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0 }}>
                <div className="mic-ripple" />
                <div className="mic-ripple mic-ripple-2" />
                <div
                  className="mic-core d-flex align-items-center justify-content-center rounded-circle"
                  style={{ width: '38px', height: '38px', backgroundColor: '#dc3545', position: 'relative', zIndex: 1 }}
                >
                  <svg width="15" height="15" fill="white" viewBox="0 0 16 16">
                    <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
                    <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/>
                  </svg>
                </div>
              </div>

              {/* Waveform + timer — centre */}
              <div className="d-flex align-items-center gap-1" style={{ flex: 1, overflow: 'hidden' }}>
                {[0.3, 0.6, 1, 0.7, 0.45, 0.8, 0.5, 1, 0.65, 0.35].map((delay, i) => (
                  <div
                    key={i}
                    className="sound-bar"
                    style={{ height: `${14 + i % 3 * 8}px`, animationDelay: `${delay * 0.4}s` }}
                  />
                ))}
                <span style={{
                  marginLeft: '8px', color: '#dc3545',
                  fontWeight: 600, fontSize: '13px',
                  fontVariantNumeric: 'tabular-nums', flexShrink: 0
                }}>
                  {fmtTime(recordSecs)}
                </span>
              </div>

              {/* ➤ SEND — right side */}
              <button
                onClick={stopListening}
                title="Stop and send"
                className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '42px', height: '42px', flexShrink: 0, border: 'none' }}
              >
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── NORMAL INPUT BAR ───────────────────────────────────────── */}
          {!listening && (
            <div className="p-3" style={{ backgroundColor: 'var(--chat-bg)', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control rounded-pill me-2 border-0 shadow-none px-4"
                  style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-color)' }}
                  placeholder={isTranscribing ? "Transcribing audio..." : t('chatbotPlaceholder')}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isTyping || isTranscribing}
                />

                {/* Mic button */}
                <button
                  type="button"
                  className="btn btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center me-2"
                  onClick={startListening}
                  disabled={!isSpeechSupported || isTyping || isTranscribing}
                  title={!isSpeechSupported ? "Voice input not supported in this browser" : "Click to speak"}
                  style={{ width: '45px', height: '45px', flexShrink: 0 }}
                >
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
                    <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/>
                  </svg>
                </button>

                {/* Send button */}
                <button
                  className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center"
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={!inputValue.trim() || isTyping || isTranscribing}
                  style={{ width: '45px', height: '45px', flexShrink: 0 }}
                >
                  <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── VOICE ERROR BANNER ──────────────────────────────────────────── */}
          {voiceError && (
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: '#fff3cd',
                borderTop: '1px solid #ffc107',
                color: '#856404',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'recBarSlideIn 0.2s ease',
              }}
            >
              <span style={{ fontSize: '15px' }}>⚠️</span>
              {voiceError}
              <button
                onClick={() => setVoiceError('')}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: '#856404', cursor: 'pointer', fontSize: '15px', padding: 0
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Chatbot;
