import React, { useState, useEffect, useRef } from 'react';

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: "Hi! I'm your Policy Assistant. How can I help you today?", isBot: true }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const [showHint, setShowHint] = useState(true);
  const [hintText, setHintText] = useState("Need help understanding policies? Ask me 👇");

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

  // ── RULE-BASED RESPONSE ENGINE ──────────────────────────────────────────────
  const getRuleBasedResponse = (input) => {
    const q = input.toLowerCase().trim();

    if (/^(hi|hello|hey|good morning|good evening|good afternoon|namaste)/.test(q))
      return "Hello! 👋 I'm your Puravankara Policy Assistant. You can ask me about policies, how to file a complaint, track status, POSH, or anything related to the GRM process.";

    if (/posh|sexual harass|prevention of sexual|workplace sexual/.test(q))
      return "📋 POSH Policy:\n\n• Puravankara has zero-tolerance for sexual harassment.\n• Complaints are handled by the Internal Complaints Committee (ICC).\n• File within 90 days of the incident via Lodge Complaint.\n• Complainant identity is strictly confidential.";

    if (/anonym|without name|identity|secret|confidential report/.test(q))
      return "🔒 Anonymous Reporting:\n\n• Yes, you can report anonymously on the GRM portal.\n• Your identity will never be disclosed to the respondent.\n• Even anonymous complaints are fully investigated.";

    if (/harass|bully|discriminat|intimidat|misconduct|hostile/.test(q))
      return "⚠️ Harassment includes:\n\n• Verbal abuse, insults, or threats\n• Unwelcome sexual advances\n• Bullying or persistent unreasonable behaviour\n• Discrimination based on gender, religion, caste, or disability\n• Retaliation for raising a grievance\n\nIf you are experiencing any of these, please file a complaint immediately.";

    if (/file|submit|lodge|raise|report|how to complain/.test(q))
      return "📝 How to File a Complaint:\n\n1. Click 'Lodge Complaint' on the Home page.\n2. Select your type: Internal, Contract, or External.\n3. Fill in category, department, and description.\n4. Submit — you'll receive a unique Grievance ID.\n5. Use the ID to track progress anytime.";

    if (/track|status|grievance id|complaint id|complaint number|update|progress/.test(q))
      return "🔍 Tracking Your Complaint:\n\n• Click 'Track Status' from the Home page or Navbar.\n• Enter your Grievance ID for the latest update.\n• Statuses: Submitted → Under Review → In Progress → Resolved.";

    if (/escalat|not resolved|no action|delay|overdue|ignore/.test(q))
      return "🚨 Escalation Process:\n\n• Level 1: Department Admin (7 days)\n• Level 2: HR / Compliance Team (14 days)\n• Level 3: Senior Management / POSH Committee\n\nContact support@puravankara.com to escalate.";

    if (/how long|sla|time limit|deadline|days|timeline|resolution time/.test(q))
      return "⏱️ Resolution Timelines (SLA):\n\n• General Grievance: 7 business days\n• HR / Policy Issue: 10 business days\n• POSH Complaint: 90 days (per Act)\n• Safety / Urgent: 24–48 hours";

    if (/department|hr|it|finance|legal|compliance|facility/.test(q))
      return "🏢 Department Contacts:\n\n• HR: hr@puravankara.com\n• Legal / Compliance: legal@puravankara.com\n• IT: it@puravankara.com\n• Finance: finance@puravankara.com\n• Facility / Admin: admin@puravankara.com";

    if (/categor|type of complaint|what can i report/.test(q))
      return "📂 Complaint Categories:\n\n• Sexual Harassment (POSH)\n• Workplace Bullying / Misconduct\n• Discrimination\n• Fraud or Financial Misconduct\n• Data Privacy Violation\n• Safety & Infrastructure Issues\n• Contract Workforce Grievances";

    if (/contract|vendor|third party|external worker/.test(q))
      return "👷 Contract & External Workforce:\n\n• Contract workers are fully covered by GRM.\n• Select 'Contract Workforce' when filing.\n• Your employer will NOT be notified without due process.";

    if (/privacy|data protection|who sees|share|disclose/.test(q))
      return "🔐 Confidentiality:\n\n• Only the assigned admin can view your complaint.\n• Personal information is never shared without consent.\n• All data is encrypted and securely stored.\n• Retaliation against complainants is strictly prohibited.";

    if (/whistle|fraud|corrupt|wrongdoing/.test(q))
      return "📣 Whistleblower Protection:\n\n• Whistleblowers are fully protected from retaliation.\n• Anonymous reporting available.\n• Governed by the Vigil Mechanism under Companies Act 2013.";

    if (/contact|phone|email|support|helpline|reach/.test(q))
      return "📞 Contact & Support:\n\n• Email: support@puravankara.com\n• Helpline: 1800-555-0199 (24/7)\n• Location: Puravankara Limited, Bengaluru, India";

    if (/thank|thanks|bye|goodbye|ok|okay|got it|understood/.test(q))
      return "You're welcome! 😊 Feel free to ask anything anytime. You can lodge or track a complaint from the portal.";

    return "🤔 I'm not sure about that. I can help with:\n\n• POSH Policy\n• Anonymous Reporting\n• How to File a Complaint\n• Track Complaint Status\n• SLA & Timelines\n• Escalation Process\n• Department Contacts\n• Whistleblower Protection\n\nJust type your topic!";
  };

  const handleSendMessage = (text) => {
    if (!text.trim()) return;

    const newUserMsg = { id: Date.now(), text, isBot: false };
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      const responseText = getRuleBasedResponse(text);
      setMessages(prev => [...prev, { id: Date.now() + 1, text: responseText, isBot: true }]);
      setIsTyping(false);
    }, 700);
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
        {hintText}
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
          setIsOpen(!isOpen);
          setShowHint(false);
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
            <span className="chatbot-text fw-bold" style={{ fontSize: '15px' }}>Ask Policy Assistant</span>
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
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.889a28.02 28.02 0 0 1 3.972.505 1 1 0 0 0 .997-.282l.859-1.063c.247-.305.776-.328 1.054-.055.27.265.236.721-.06 1.055L11.5 6.945c-.322.384-.366.864-.176 1.25.132.269.467.447.781.564a27.973 27.973 0 0 1 3.486 1.636c.219.136.438.271.657.411A.5.5 0 0 1 16 11.233V14a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.766a.5.5 0 0 1 .234-.411 36.31 36.31 0 0 1 2.766-1.761ZM5.5 7h5a.5.5 0 0 0 0-1h-5a.5.5 0 0 0 0 1Z"/>
              </svg>
              Policy Assistant
            </h6>
            <small style={{ opacity: 0.8 }}>Ask about policies or issues</small>
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
        <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', backgroundColor: '#f8f9fa' }}>
          
          {/* SUGGESTED PROMPTS */}
          {messages.length === 1 && (
            <div className="mb-4">
              <p className="text-muted small mb-2 text-center">Suggested topics</p>
              <div className="d-flex flex-wrap gap-2 justify-content-center">
                {suggestedPrompts.map((prompt, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handlePromptClick(prompt)}
                    className="btn btn-sm btn-outline-primary rounded-pill bg-white"
                    style={{ fontSize: '13px' }}
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
                className={`p-3 shadow-sm ${msg.isBot ? 'bg-white text-dark' : 'bg-primary text-white'}`}
                style={{
                  maxWidth: '85%',
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: msg.isBot ? '4px' : '16px',
                  borderBottomRightRadius: msg.isBot ? '16px' : '4px',
                  fontSize: '14.5px'
                }}
              >
                {msg.text}
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
        <div className="p-3 bg-white border-top">
          <div className="input-group">
            <input 
              type="text" 
              className="form-control rounded-pill me-2 bg-light border-0 shadow-none px-4" 
              placeholder="Type your message..." 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isTyping}
            />
            <button 
              className="btn btn-primary rounded-circle d-flex align-items-center justify-content-center"
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || isTyping}
              style={{ width: '45px', height: '45px', flexShrink: 0 }}
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Chatbot;
