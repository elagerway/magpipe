/**
 * Landing Page Data — 8 Industry + 4 Use Case pages
 * Each entry contains hero, benefits, howItWorks, features, faq, and finalCta content.
 */

// ========== Shared SVG Icons (reused from home.js) ==========

const icons = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  contacts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  analytics: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M20 12a8 8 0 0 0-8-8v8h8z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  integrations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/></svg>`,
  warmTransfer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  dollarSign: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  shoppingBag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  headphones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  mapPin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
};

// ========== Feature definitions (reusable across pages) ==========

const features = {
  smartCallHandling: {
    icon: icons.phone,
    title: 'Smart Call Handling',
    description: 'AI answers calls, screens unknown callers, takes messages, and transfers important calls to your team.',
  },
  intelligentSMS: {
    icon: icons.sms,
    title: 'Intelligent SMS',
    description: 'Context-aware text responses that understand conversation history and respond appropriately.',
  },
  emailAI: {
    icon: icons.email,
    title: 'Email AI',
    description: 'Automatically respond to emails with context-aware AI replies, drafts for review, or fully autonomous mode.',
  },
  availability24x7: {
    icon: icons.clock,
    title: '24/7 Availability',
    description: 'Your AI assistant never sleeps. Handle calls and messages around the clock, every day of the year.',
  },
  contactManagement: {
    icon: icons.contacts,
    title: 'Contact Management',
    description: 'Whitelist VIPs, block spam, and set custom rules for different callers and contacts.',
  },
  knowledgeBase: {
    icon: icons.book,
    title: 'Knowledge Base',
    description: 'Train your assistant with custom information to answer questions accurately about your business.',
  },
  privacyFirst: {
    icon: icons.shield,
    title: 'Privacy First',
    description: 'Your data is encrypted and secure. Full control over what information is shared with callers.',
  },
  analyticsInsights: {
    icon: icons.analytics,
    title: 'Analytics & Insights',
    description: 'Real-time dashboards with call volume, sentiment analysis, and conversation trends at a glance.',
  },
  realTimeTranslation: {
    icon: icons.globe,
    title: 'Real-Time Translation',
    description: 'Speak to callers in their language. Automatic translation across 30+ languages during live calls.',
  },
  conversationMemory: {
    icon: icons.memory,
    title: 'Conversation Memory',
    description: 'Your agent remembers past interactions, caller preferences, and context across every conversation.',
  },
  integrationsApps: {
    icon: icons.integrations,
    title: '40+ Integrations',
    description: 'Connect HubSpot, Salesforce, Shopify, Slack, Google Calendar, Zendesk, and 40+ more tools. Your AI reads and writes data, triggers workflows, and takes actions in your systems — during live calls.',
  },
  warmTransfer: {
    icon: icons.warmTransfer,
    title: 'Warm Transfer',
    description: 'Seamlessly hand off live calls to you or your team when the AI detects a conversation needs a human touch.',
  },
};

// ========== Page Data ==========

export const landingPages = {
  // ==========================================
  // INDUSTRY PAGES
  // ==========================================

  healthcare: {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Healthcare | Magpipe',
      description: 'HIPAA-aware AI phone agent for healthcare practices. Handle patient calls, appointment scheduling, and after-hours triage 24/7.',
    },
    hero: {
      badge: 'Healthcare AI',
      title: 'Never Miss a<br>Patient Call Again',
      subtitle: 'AI-powered phone handling built for healthcare practices. Answer patient inquiries, schedule appointments, and manage after-hours calls — all while keeping sensitive information secure.',
    },
    benefits: [
      {
        icon: icons.clock,
        title: 'After-Hours Patient Support',
        description: 'Your AI agent handles calls around the clock, triaging urgent requests and scheduling callbacks so your staff can focus on in-office care.',
      },
      {
        icon: icons.clipboard,
        title: 'Appointment Management',
        description: 'Patients schedule, reschedule, or confirm appointments by phone or text. Your AI books directly to Google Calendar or Cal.com in real time.',
      },
      {
        icon: icons.eyeOff,
        title: 'PII Redaction',
        description: 'Automatically detect and redact sensitive patient data — dates of birth, insurance IDs, medical details — from transcripts and logs.',
      },
      {
        icon: icons.integrations,
        title: 'CRM & Calendar Integration',
        description: 'Native HubSpot and Salesforce integrations. Your AI logs calls, updates patient records, and creates follow-up tasks — during the conversation.',
      },
      {
        icon: icons.shield,
        title: 'Secure & Encrypted',
        description: 'All calls encrypted in transit and at rest. Full control over data retention and access policies for your compliance needs.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Smart Escalation',
        description: 'Urgent calls are immediately warm-transferred to on-call staff with full context, while routine inquiries are handled by your AI agent.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Number', description: 'Port your existing practice number or get a new dedicated line in minutes.' },
      { title: 'Train Your Agent', description: 'Upload your FAQ, office hours, and protocols so the AI answers accurately.' },
      { title: 'Go Live', description: 'Start handling patient calls 24/7 with intelligent routing and triage.' },
    ],
    features: ['smartCallHandling', 'knowledgeBase', 'availability24x7', 'privacyFirst', 'warmTransfer', 'integrationsApps'],
    faq: [
      {
        question: 'Is Magpipe HIPAA compliant?',
        answer: 'Magpipe uses encrypted communications and secure data handling practices. All call data is encrypted in transit and at rest. We recommend consulting your compliance team for your specific requirements.',
      },
      {
        question: 'Can the AI schedule appointments?',
        answer: 'Yes. Magpipe integrates with Google Calendar, Cal.com, and other scheduling tools so your AI can check availability and book appointments during the call. Patients get automatic confirmation via text or email.',
      },
      {
        question: 'Does it connect with our CRM or EHR?',
        answer: 'Magpipe offers native HubSpot integration and connects with 40+ tools including Salesforce, Notion, and more via MCP. Your AI can log calls, update patient records, and create follow-up tasks in your systems — during the conversation.',
      },
      {
        question: 'What happens with urgent after-hours calls?',
        answer: 'You define your triage rules. Urgent calls can be warm-transferred to on-call staff immediately, while routine calls get a callback scheduled for the next business day.',
      },
      {
        question: 'Can I keep my existing phone number?',
        answer: 'Absolutely. You can port your existing number to Magpipe or set up call forwarding so your current number rings your AI agent.',
      },
    ],
    finalCta: {
      title: 'Give your patients 24/7 access',
      subtitle: 'Start with $20 in free credits. No long-term contract required.',
    },
  },

  'financial-services': {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Financial Services | Magpipe',
      description: 'Secure AI phone agent for financial services firms. Handle client inquiries, route calls, and maintain compliance around the clock.',
    },
    hero: {
      badge: 'Financial Services AI',
      title: 'Secure AI Phone<br>Handling for Finance',
      subtitle: 'Handle client inquiries, route calls to the right advisor, and maintain compliance-ready communication records — all with enterprise-grade security.',
    },
    benefits: [
      {
        icon: icons.eyeOff,
        title: 'PII Redaction',
        description: 'Automatically detect and redact sensitive data — SSNs, account numbers, credit card details — from transcripts and logs before they\'re stored.',
      },
      {
        icon: icons.phone,
        title: 'Intelligent Call Routing',
        description: 'AI identifies client needs and routes them to the right department or advisor — no phone trees, no frustration.',
      },
      {
        icon: icons.globe,
        title: 'Multilingual Client Support',
        description: 'Serve international clients in 30+ languages with real-time translation. No need to staff multilingual teams.',
      },
      {
        icon: icons.fileText,
        title: 'Compliance-Ready Records',
        description: 'Every call is recorded, transcribed, and timestamped. Full audit trails for regulatory reviews, accessible from your dashboard.',
      },
      {
        icon: icons.integrations,
        title: 'CRM & Slack Integration',
        description: 'Native HubSpot and Salesforce integrations. Your AI logs calls, updates client records, and posts alerts to Slack — during the conversation.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Warm Transfer to Advisors',
        description: 'High-value clients and complex inquiries are seamlessly handed off to the right advisor with full conversation context.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Lines', description: 'Integrate with your existing phone system or get dedicated numbers for each department.' },
      { title: 'Configure Routing', description: 'Set up rules for client identification, department routing, and escalation procedures.' },
      { title: 'Go Live', description: 'Your AI agent starts handling calls with full transcription and analytics from day one.' },
    ],
    features: ['privacyFirst', 'smartCallHandling', 'analyticsInsights', 'realTimeTranslation', 'integrationsApps', 'intelligentSMS'],
    faq: [
      {
        question: 'How does Magpipe handle sensitive financial data?',
        answer: 'All communications are encrypted in transit and at rest. Call recordings and transcripts are stored securely, and you have full control over data retention policies.',
      },
      {
        question: 'Does it integrate with our CRM?',
        answer: 'Yes. Magpipe includes native HubSpot integration and connects with Salesforce and 40+ other tools. Your AI can look up client records, log call notes, create follow-up tasks, and update deals — all during a live call.',
      },
      {
        question: 'Does Magpipe provide call recordings for compliance?',
        answer: 'Every call is recorded and transcribed automatically. Recordings are stored securely and accessible through your dashboard for compliance and audit purposes.',
      },
      {
        question: 'Can calls be transferred to specific advisors?',
        answer: 'Absolutely. Warm transfer lets the AI hand off calls to the right person with full context, so the advisor knows exactly why the client is calling.',
      },
      {
        question: 'Can the AI notify my team on Slack?',
        answer: 'Yes. With native Slack integration, the AI can post call summaries, urgent alerts, and new lead notifications to specific channels in real time.',
      },
    ],
    finalCta: {
      title: 'Elevate your client experience',
      subtitle: 'Start with $20 in free credits. Enterprise plans available for larger firms.',
    },
  },

  insurance: {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Insurance | Magpipe',
      description: 'AI phone agent for insurance agencies. Handle claims inquiries, policy questions, and new quote requests 24/7.',
    },
    hero: {
      badge: 'Insurance AI',
      title: 'AI-Powered Phone<br>Handling for Insurance',
      subtitle: 'Handle claims inquiries, answer policy questions, and capture new leads around the clock — freeing your agents to focus on complex cases and closing deals.',
    },
    benefits: [
      {
        icon: icons.phone,
        title: 'Claims Call Triage',
        description: 'AI gathers initial claim details, prioritizes urgency, and routes to the right adjuster — reducing intake time dramatically.',
      },
      {
        icon: icons.book,
        title: 'Policy Q&A On Demand',
        description: 'Train your AI with your policy documents so it can answer common coverage questions instantly without agent involvement.',
      },
      {
        icon: icons.sms,
        title: 'Lead Capture via SMS',
        description: 'Missed call? Your AI sends a follow-up text, gathers quote details, and schedules a callback with your team.',
      },
      {
        icon: icons.integrations,
        title: 'CRM & AMS Integration',
        description: 'Native HubSpot and Salesforce integrations, plus 40+ more tools via MCP. Log claims, create contacts, and update deals — during the call.',
      },
      {
        icon: icons.analytics,
        title: 'Performance Insights',
        description: 'Track call volumes, resolution rates, and lead conversion with real-time analytics dashboards.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Warm Transfer to Adjusters',
        description: 'Complex claims and high-value prospects are seamlessly transferred to the right person with full conversation context.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Number', description: 'Port your agency number or set up forwarding to your new AI-powered line.' },
      { title: 'Upload Your Policies', description: 'Feed the AI your policy docs, FAQ, and claims procedures for accurate responses.' },
      { title: 'Go Live', description: 'Start handling policyholder calls and new quote requests 24/7.' },
    ],
    features: ['smartCallHandling', 'knowledgeBase', 'intelligentSMS', 'integrationsApps', 'analyticsInsights', 'warmTransfer'],
    faq: [
      {
        question: 'Can the AI handle first notice of loss (FNOL)?',
        answer: 'Yes. Your AI agent can collect initial claim details — date, type of loss, policy number — and route the call to the appropriate adjuster with all information attached.',
      },
      {
        question: 'How does it handle different lines of insurance?',
        answer: 'The knowledge base supports multiple document sets. You can configure different scripts and routing rules for auto, home, life, and commercial lines.',
      },
      {
        question: 'Does it integrate with our CRM and agency management system?',
        answer: 'Yes. Magpipe includes native HubSpot and Salesforce integrations, plus 40+ additional tools via MCP. Your AI can log claims, create contacts, update deals, and post notifications to Slack — all during a live call.',
      },
      {
        question: 'Can it capture leads from website and phone?',
        answer: 'Absolutely. Phone inquiries for quotes are captured with full details and synced to your CRM automatically. The AI follows up via SMS to schedule a full consultation.',
      },
    ],
    finalCta: {
      title: 'Stop missing leads and claims calls',
      subtitle: 'Start with $20 in free credits. Set up in under an hour.',
    },
  },

  logistics: {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Logistics | Magpipe',
      description: 'AI phone agent for logistics and transportation companies. Handle dispatch, tracking inquiries, and driver coordination 24/7.',
    },
    hero: {
      badge: 'Logistics AI',
      title: 'AI Phone Handling<br>for Logistics',
      subtitle: 'Handle tracking inquiries, coordinate with drivers in any language, and keep dispatchers focused on what matters — moving freight, not answering routine calls.',
    },
    benefits: [
      {
        icon: icons.globe,
        title: 'Multilingual Support',
        description: 'Communicate with drivers and partners in 30+ languages with real-time translation on every call.',
      },
      {
        icon: icons.clock,
        title: '24/7 Operations Support',
        description: 'Logistics never sleeps and neither does your AI agent. Handle after-hours tracking calls and driver check-ins around the clock.',
      },
      {
        icon: icons.sms,
        title: 'Automated Status Updates',
        description: 'Send delivery confirmations, ETA updates, and scheduling notifications via SMS automatically.',
      },
      {
        icon: icons.integrations,
        title: 'Connect Your Entire Stack',
        description: 'Connect your TMS, CRM, and team tools. Your AI pulls shipment status, logs calls to HubSpot or Salesforce, and posts alerts to Slack — during live calls.',
      },
      {
        icon: icons.analytics,
        title: 'Operations Analytics',
        description: 'Track call volumes by route, driver check-in rates, customer inquiry trends, and resolution times from one dashboard.',
      },
      {
        icon: icons.fileText,
        title: 'Full Call Records',
        description: 'Every call is recorded and transcribed with timestamps. Search conversations, review disputes, and audit driver interactions.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Lines', description: 'Set up dedicated numbers for dispatch, customer service, and driver support.' },
      { title: 'Configure Workflows', description: 'Define routing rules, status update templates, and escalation procedures.' },
      { title: 'Go Live', description: 'Start handling tracking calls, driver check-ins, and customer inquiries 24/7.' },
    ],
    features: ['realTimeTranslation', 'availability24x7', 'intelligentSMS', 'integrationsApps', 'analyticsInsights', 'smartCallHandling'],
    faq: [
      {
        question: 'Can the AI provide shipment tracking information?',
        answer: 'Yes. Connect your TMS via MCP and your AI can look up shipment status, provide ETA updates, and send tracking links via SMS — all without dispatcher involvement.',
      },
      {
        question: 'How does multilingual support work?',
        answer: 'Real-time translation supports 30+ languages during live calls. Your AI agent detects the caller\'s language and responds naturally, breaking down communication barriers.',
      },
      {
        question: 'Can it handle driver dispatch coordination?',
        answer: 'The AI can handle routine dispatch tasks — confirming loads, updating ETAs, collecting proof of delivery — and escalate complex situations to your dispatch team.',
      },
      {
        question: 'What tools does it connect with?',
        answer: 'Magpipe connects with 40+ tools out of the box — HubSpot, Salesforce, Slack, Google Calendar, and more. Connect your TMS or custom tools via MCP servers. Your AI reads and writes data across all connected systems during live calls.',
      },
    ],
    finalCta: {
      title: 'Keep your fleet moving',
      subtitle: 'Start with $20 in free credits. Scale as your operation grows.',
    },
  },

  'home-services': {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Home Services | Magpipe',
      description: 'AI phone agent for home service businesses. Never miss a lead — handle booking, dispatch, and customer follow-up 24/7.',
    },
    hero: {
      badge: 'Home Services AI',
      title: 'Never Miss a<br>Service Call Again',
      subtitle: 'Your AI receptionist answers every call, books appointments, and follows up with leads via text — so your crew stays in the field and your phone keeps ringing.',
    },
    benefits: [
      {
        icon: icons.phone,
        title: 'Capture Every Lead',
        description: 'Missed calls mean lost revenue. Your AI answers every call — even while you\'re on a job — and books the appointment.',
      },
      {
        icon: icons.sms,
        title: 'Automatic Follow-Up',
        description: 'Missed call gets an instant text: "Thanks for calling! When would you like us to come out?" Convert more leads on autopilot.',
      },
      {
        icon: icons.clock,
        title: 'After-Hours Booking',
        description: 'Homeowners call when it\'s convenient for them. Your AI books jobs at midnight just as easily as at noon.',
      },
      {
        icon: icons.integrations,
        title: 'Calendar & CRM Sync',
        description: 'Books jobs directly to Google Calendar or Cal.com. Logs new leads to HubSpot or Salesforce. Posts alerts to Slack — all during the call.',
      },
      {
        icon: icons.memory,
        title: 'Customer History',
        description: 'When a repeat customer calls, your AI remembers their address, past services, and preferences — personal service without the paperwork.',
      },
      {
        icon: icons.book,
        title: 'Service Knowledge Base',
        description: 'Train the AI on your services, pricing, service area, and FAQ. It answers questions accurately so you don\'t have to.',
      },
    ],
    howItWorks: [
      { title: 'Get Your Number', description: 'Use your existing business number or get a new dedicated line in minutes.' },
      { title: 'Set Your Services', description: 'Tell the AI what services you offer, your service area, pricing ranges, and availability.' },
      { title: 'Go Live', description: 'Start capturing leads and booking appointments while you focus on doing great work.' },
    ],
    features: ['smartCallHandling', 'availability24x7', 'intelligentSMS', 'integrationsApps', 'warmTransfer', 'knowledgeBase'],
    faq: [
      {
        question: 'I\'m a one-person operation. Can I afford this?',
        answer: 'At $0.07/minute, a typical 2-minute call costs $0.14. One captured lead from a call you would have missed pays for months of service. Start with $20 in free credits.',
      },
      {
        question: 'Can the AI give quotes?',
        answer: 'You set the pricing rules. The AI can provide estimates for standard services (e.g., "Our drain cleaning starts at $150") and schedule on-site quotes for complex jobs.',
      },
      {
        question: 'Does it connect with my calendar and CRM?',
        answer: 'Yes. Magpipe integrates with Google Calendar, Cal.com, HubSpot, Salesforce, and 40+ more tools. Your AI books jobs on your calendar, logs new leads in your CRM, and posts alerts to Slack — all during the call.',
      },
      {
        question: 'What if I need to take a call myself?',
        answer: 'Warm transfer lets the AI hand off the call to you live. Or set VIP rules so certain numbers always ring through to your cell directly.',
      },
    ],
    finalCta: {
      title: 'Stop losing jobs to missed calls',
      subtitle: 'Start with $20 in free credits. Pay only for what you use.',
    },
  },

  retail: {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Retail | Magpipe',
      description: 'AI phone and SMS agent for retail businesses. Handle product inquiries, order status, and customer engagement across every channel.',
    },
    hero: {
      badge: 'Retail AI',
      title: 'AI-Powered Customer<br>Engagement for Retail',
      subtitle: 'Handle product inquiries, order status updates, and promotional campaigns across phone, SMS, and email — all from one intelligent platform.',
    },
    benefits: [
      {
        icon: icons.sms,
        title: 'SMS Marketing & Support',
        description: 'Send promotions, order confirmations, and delivery updates. Respond to customer texts with context-aware AI replies.',
      },
      {
        icon: icons.email,
        title: 'Email Automation',
        description: 'Handle return requests, product questions, and order inquiries by email with intelligent AI responses.',
      },
      {
        icon: icons.integrations,
        title: 'Shopify, Stripe & CRM',
        description: 'Native integrations with Shopify, Stripe, HubSpot, Zendesk, and 40+ more. Your AI looks up orders, checks payments, and updates your CRM — during the call.',
      },
      {
        icon: icons.globe,
        title: 'Multilingual Support',
        description: 'Serve customers in 30+ languages with real-time translation. Expand your market without multilingual staff.',
      },
      {
        icon: icons.clock,
        title: 'Always-On Support',
        description: 'Shoppers browse 24/7. Your AI handles product questions and order status checks at any hour.',
      },
      {
        icon: icons.analytics,
        title: 'Customer Insights',
        description: 'Understand what customers ask about most, track sentiment trends, and identify opportunities to improve.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Channels', description: 'Set up your phone, SMS, and email channels in one unified dashboard.' },
      { title: 'Train on Your Catalog', description: 'Upload product info, policies, and FAQs so the AI answers accurately.' },
      { title: 'Go Live', description: 'Start engaging customers across all channels with consistent, intelligent responses.' },
    ],
    features: ['intelligentSMS', 'emailAI', 'availability24x7', 'integrationsApps', 'analyticsInsights', 'conversationMemory'],
    faq: [
      {
        question: 'Does it integrate with Shopify, Stripe, and our CRM?',
        answer: 'Yes. Magpipe connects with Shopify, Stripe, HubSpot, Salesforce, Zendesk, and 40+ more tools. Your AI can look up orders, check payment status, update CRM records, and create support tickets — all during a live conversation.',
      },
      {
        question: 'Can I send promotional SMS campaigns?',
        answer: 'Absolutely. Use intelligent SMS to send targeted promotions, flash sale alerts, and loyalty rewards to your customer base.',
      },
      {
        question: 'How does it handle returns and exchanges?',
        answer: 'The AI walks customers through your return policy, initiates return requests in Shopify, logs the case in your CRM, and escalates complex cases to your team with full conversation context.',
      },
      {
        question: 'Can the AI handle order status inquiries?',
        answer: 'Yes. Connected to Shopify or your e-commerce platform, the AI looks up orders by number or email and provides real-time shipping status, tracking links, and delivery estimates — during the call.',
      },
    ],
    finalCta: {
      title: 'Engage customers on every channel',
      subtitle: 'Start with $20 in free credits. Scale as your business grows.',
    },
  },

  'travel-hospitality': {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Travel & Hospitality | Magpipe',
      description: 'AI phone agent for hotels, resorts, and travel companies. Handle reservations, guest inquiries, and concierge requests in 30+ languages.',
    },
    hero: {
      badge: 'Travel & Hospitality AI',
      title: 'World-Class Guest<br>Service, 24/7',
      subtitle: 'Handle reservations, concierge requests, and guest inquiries in 30+ languages — delivering five-star phone service without expanding your front desk team.',
    },
    benefits: [
      {
        icon: icons.globe,
        title: 'Speak Every Guest\'s Language',
        description: 'Real-time translation in 30+ languages means international guests feel welcome from the first call.',
      },
      {
        icon: icons.clock,
        title: '24/7 Concierge Service',
        description: 'Late-night restaurant recommendations, early morning airport shuttle requests — your AI handles it all.',
      },
      {
        icon: icons.phone,
        title: 'Reservation Management',
        description: 'Book, modify, and confirm reservations by phone. AI handles the routine so your team focuses on the guest experience.',
      },
      {
        icon: icons.integrations,
        title: 'PMS & CRM Integration',
        description: 'Connect your PMS via MCP, plus native HubSpot, Google Calendar, and Slack integrations. Your AI reads and writes across all systems during calls.',
      },
      {
        icon: icons.memory,
        title: 'Guest Memory',
        description: 'Returning guests are recognized and greeted by name. Past preferences and requests are remembered for personalized service.',
      },
      {
        icon: icons.email,
        title: 'Email & SMS Follow-Up',
        description: 'Automatic confirmation emails after bookings, pre-arrival texts with check-in details, and post-stay feedback requests.',
      },
    ],
    howItWorks: [
      { title: 'Connect Your Lines', description: 'Set up your reservation line, front desk, and concierge numbers.' },
      { title: 'Configure Services', description: 'Upload your property info, amenities, local recommendations, and booking rules.' },
      { title: 'Go Live', description: 'Deliver world-class phone service to every guest in their preferred language.' },
    ],
    features: ['realTimeTranslation', 'availability24x7', 'smartCallHandling', 'conversationMemory', 'emailAI', 'integrationsApps'],
    faq: [
      {
        question: 'How does real-time translation work?',
        answer: 'The AI detects the caller\'s language automatically and responds fluently in that language. It supports 30+ languages including Mandarin, Spanish, French, Arabic, Japanese, and more.',
      },
      {
        question: 'Can it handle room reservations?',
        answer: 'Yes. Connect your PMS via MCP and the AI can check room availability, provide rates, and book reservations in real time — reading and writing directly to your property management system during the call.',
      },
      {
        question: 'What tools does it integrate with?',
        answer: 'Magpipe connects with 40+ tools — Google Calendar, HubSpot, Salesforce, Slack, Notion, and more. Connect your PMS or booking engine via MCP servers. Your AI takes actions across all connected systems during live calls.',
      },
      {
        question: 'Can different departments have different agents?',
        answer: 'Absolutely. Set up separate agents for reservations, front desk, and concierge — each with their own knowledge base, integrations, and personality.',
      },
    ],
    finalCta: {
      title: 'Deliver five-star service on every call',
      subtitle: 'Start with $20 in free credits. Perfect for boutique hotels to large resorts.',
    },
  },

  'debt-collection': {
    type: 'industry',
    meta: {
      title: 'AI Phone Agent for Debt Collection | Magpipe',
      description: 'AI phone agent for debt collection agencies. Automate outreach, manage payment conversations, and maintain compliance at scale.',
    },
    hero: {
      badge: 'Debt Collection AI',
      title: 'Smarter Collections<br>with AI',
      subtitle: 'Automate routine collection outreach, handle payment conversations professionally, and maintain detailed records for compliance — at a fraction of the cost of manual calling.',
    },
    benefits: [
      {
        icon: icons.phone,
        title: 'Automated Outreach',
        description: 'AI handles initial contact calls and follow-ups, freeing your collectors to focus on complex negotiations.',
      },
      {
        icon: icons.sms,
        title: 'SMS Payment Reminders',
        description: 'Send compliant payment reminders and follow-up texts. Debtors can respond and set up payment plans via text.',
      },
      {
        icon: icons.integrations,
        title: 'CRM & Collections Sync',
        description: 'Native HubSpot and Salesforce integrations. Connect your collection platform via MCP. Every contact attempt logged and synced in real time.',
      },
      {
        icon: icons.analytics,
        title: 'Performance Tracking',
        description: 'Track contact rates, promise-to-pay conversion, and collector efficiency with real-time analytics.',
      },
      {
        icon: icons.shield,
        title: 'Compliance Built In',
        description: 'Every call is recorded and transcribed. The AI follows your scripts exactly and never deviates from compliant language.',
      },
      {
        icon: icons.memory,
        title: 'Contact History',
        description: 'Your AI remembers every past interaction — previous calls, promises made, disputes filed. Full context on every follow-up.',
      },
    ],
    howItWorks: [
      { title: 'Upload Your Accounts', description: 'Import your accounts receivable list and configure contact sequences.' },
      { title: 'Set Your Scripts', description: 'Define compliant call scripts, payment plan options, and escalation rules.' },
      { title: 'Go Live', description: 'AI begins outreach, tracks responses, and escalates payment-ready debtors to your team.' },
    ],
    features: ['smartCallHandling', 'intelligentSMS', 'analyticsInsights', 'privacyFirst', 'integrationsApps', 'conversationMemory'],
    faq: [
      {
        question: 'Does the AI follow FDCPA guidelines?',
        answer: 'The AI follows your configured scripts exactly and can be programmed with required disclosures, time-of-day calling restrictions, and other compliance requirements.',
      },
      {
        question: 'Can debtors set up payment plans?',
        answer: 'Yes. The AI can present payment plan options, collect agreement details, and route to your payment system. Complex negotiations are escalated to human collectors.',
      },
      {
        question: 'How does it handle disputes?',
        answer: 'Disputed accounts are flagged and escalated to your team immediately. The AI documents the dispute details and ceases collection activity per your configured rules.',
      },
      {
        question: 'Does it integrate with our CRM and collection software?',
        answer: 'Yes. Magpipe includes native HubSpot and Salesforce integrations, plus 40+ more tools. Connect your collection platform via MCP servers. Your AI logs every contact attempt, updates payment statuses, and syncs account data in real time.',
      },
    ],
    finalCta: {
      title: 'Collect more, spend less',
      subtitle: 'Start with $20 in free credits. Scale your outreach without scaling headcount.',
    },
  },

  // ==========================================
  // USE CASE PAGES
  // ==========================================

  'lead-qualification': {
    type: 'use-case',
    meta: {
      title: 'AI Lead Qualification Agent | Magpipe',
      description: 'AI phone agent that qualifies leads 24/7. Capture, score, and route leads to your sales team automatically.',
    },
    hero: {
      badge: 'Lead Qualification',
      title: 'Qualify Leads 24/7<br>with AI',
      subtitle: 'Every inbound call is a potential deal. Your AI agent captures contact info, asks qualifying questions, scores the lead, and routes hot prospects to your sales team — instantly.',
    },
    benefits: [
      {
        icon: icons.target,
        title: 'Never Miss a Lead',
        description: 'Every call is answered. Every voicemail gets a text follow-up. Your pipeline stays full even after hours.',
      },
      {
        icon: icons.zap,
        title: 'Instant Qualification',
        description: 'AI asks your custom qualifying questions — budget, timeline, needs — and scores leads in real time.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Hot Lead Transfer',
        description: 'High-score leads are immediately warm-transferred to available reps with full context. No lag, no lost momentum.',
      },
      {
        icon: icons.integrations,
        title: 'CRM Auto-Sync',
        description: 'Leads, scores, and call notes written directly to HubSpot or Salesforce during the call. New lead alerts posted to Slack in real time.',
      },
      {
        icon: icons.memory,
        title: 'Follow-Up Memory',
        description: 'Your AI remembers every previous conversation. Follow-up calls pick up right where the last one left off — with full CRM context.',
      },
      {
        icon: icons.analytics,
        title: 'Pipeline Analytics',
        description: 'Track lead volume, qualification rates, conversion by source, and rep performance from one dashboard.',
      },
    ],
    howItWorks: [
      { title: 'Define Your Criteria', description: 'Set qualifying questions, scoring rules, and routing logic for your sales process.' },
      { title: 'Connect Channels', description: 'Route your marketing phone numbers and web forms to your AI qualification agent.' },
      { title: 'Close More Deals', description: 'Qualified leads, scores, and call context flow into your CRM automatically. Your reps focus only on ready-to-buy prospects.' },
    ],
    features: ['smartCallHandling', 'analyticsInsights', 'integrationsApps', 'intelligentSMS', 'conversationMemory', 'contactManagement'],
    faq: [
      {
        question: 'What qualifying questions can the AI ask?',
        answer: 'Anything you configure — budget range, timeline, company size, specific needs, decision-maker status. The AI follows your exact qualification script naturally.',
      },
      {
        question: 'How does lead scoring work?',
        answer: 'You define scoring criteria based on answers to qualifying questions. The AI calculates a score in real time and routes leads accordingly — hot leads to reps, warm leads to nurture sequences.',
      },
      {
        question: 'Does it integrate with our CRM?',
        answer: 'Yes. Magpipe includes native HubSpot integration and connects with Salesforce, plus 40+ more tools. During a live call, your AI creates contacts, logs notes, updates deals, and scores leads — all written directly to your CRM. It also posts new lead alerts to Slack in real time.',
      },
      {
        question: 'Can the AI handle follow-up calls?',
        answer: 'Absolutely. Set up automated follow-up sequences via phone and SMS. The AI remembers previous conversations, pulls up the lead\'s CRM record, and picks up where it left off.',
      },
    ],
    finalCta: {
      title: 'Turn every call into a qualified lead',
      subtitle: 'Start with $20 in free credits. See ROI from day one.',
    },
  },

  'customer-support': {
    type: 'use-case',
    meta: {
      title: 'AI Customer Support Agent | Magpipe',
      description: 'AI phone agent for customer support. Resolve common issues instantly, escalate complex cases, and provide 24/7 service across phone, SMS, and email.',
    },
    hero: {
      badge: 'Customer Support',
      title: 'AI-Powered<br>Customer Support',
      subtitle: 'Resolve common support issues instantly by phone, text, and email. Your AI agent handles Tier 1 inquiries 24/7, escalating complex cases to your team with full context.',
    },
    benefits: [
      {
        icon: icons.book,
        title: 'Instant Answers',
        description: 'Train the AI with your help docs and knowledge base. Customers get accurate answers without waiting for a human agent.',
      },
      {
        icon: icons.clock,
        title: 'Zero Hold Times',
        description: 'Every call is answered immediately. Every text gets a reply in seconds. No queues, no frustrated customers.',
      },
      {
        icon: icons.email,
        title: 'Omnichannel Support',
        description: 'Phone, SMS, and email all handled by one intelligent agent with unified conversation history.',
      },
      {
        icon: icons.integrations,
        title: 'CRM & Helpdesk Integration',
        description: 'Native HubSpot and Salesforce plus Zendesk, Intercom, and 40+ more. Your AI creates tickets, logs notes, and looks up customer records — during the call.',
      },
      {
        icon: icons.globe,
        title: 'Multilingual Support',
        description: 'Support customers in 30+ languages with real-time translation. No need to staff multilingual teams.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Smart Escalation',
        description: 'Complex issues are warm-transferred to the right team member with full conversation context — no repeating the problem.',
      },
    ],
    howItWorks: [
      { title: 'Upload Your Knowledge', description: 'Feed the AI your help articles, FAQ, product docs, and troubleshooting guides.' },
      { title: 'Set Escalation Rules', description: 'Define when the AI should handle issues vs. escalate, and to which team or person.' },
      { title: 'Go Live', description: 'Start resolving support requests 24/7 across all channels with consistent, accurate responses.' },
    ],
    features: ['knowledgeBase', 'availability24x7', 'integrationsApps', 'conversationMemory', 'warmTransfer', 'realTimeTranslation'],
    faq: [
      {
        question: 'What percentage of calls can the AI resolve?',
        answer: 'It depends on your business, but most companies see 60-80% of routine inquiries fully resolved by AI — password resets, order status, how-to questions, return policies, etc.',
      },
      {
        question: 'Does it integrate with our CRM and helpdesk?',
        answer: 'Yes. Magpipe connects with HubSpot, Salesforce, Zendesk, Intercom, Slack, and 40+ more tools. Your AI can look up customer records, create support tickets, log call notes, and escalate to Slack — all during the conversation.',
      },
      {
        question: 'How does escalation work?',
        answer: 'You define escalation triggers — topic, sentiment, customer VIP status, or explicit request. When triggered, the AI warm-transfers the call with a full summary so your agent picks up seamlessly.',
      },
      {
        question: 'Can the AI handle multiple languages?',
        answer: 'Yes. Real-time translation supports 30+ languages, so international customers get support in their preferred language without staffing multilingual teams.',
      },
      {
        question: 'How do I train the AI on our products?',
        answer: 'Upload documents, paste articles, or connect your help center via Notion or Confluence. The knowledge base indexes everything and the AI uses it to answer questions accurately.',
      },
    ],
    finalCta: {
      title: 'Deliver better support at lower cost',
      subtitle: 'Start with $20 in free credits. Scale support without scaling headcount.',
    },
  },

  receptionists: {
    type: 'use-case',
    meta: {
      title: 'AI Virtual Receptionist | Magpipe',
      description: 'AI virtual receptionist that answers calls, transfers to the right person, takes messages, and manages your schedule 24/7.',
    },
    hero: {
      badge: 'Virtual Receptionist',
      title: 'Your AI<br>Receptionist',
      subtitle: 'A professional virtual receptionist that answers every call, greets callers by name, transfers to the right person, and takes detailed messages — all without putting anyone on hold.',
    },
    benefits: [
      {
        icon: icons.phone,
        title: 'Professional Call Handling',
        description: 'Every call answered promptly with a professional greeting. Callers are routed or helped instantly — no voicemail, no hold music.',
      },
      {
        icon: icons.warmTransfer,
        title: 'Intelligent Transfers',
        description: 'AI identifies who the caller needs and warm-transfers with context: "I have John from Acme Corp calling about the proposal."',
      },
      {
        icon: icons.integrations,
        title: 'Calendar & CRM Sync',
        description: 'Books meetings on Google Calendar or Cal.com, logs callers to HubSpot or Salesforce, and posts summaries to Slack — all during the call.',
      },
      {
        icon: icons.clock,
        title: 'Available 24/7',
        description: 'Before office hours, during lunch, after hours, weekends — your receptionist is always ready to answer.',
      },
      {
        icon: icons.contacts,
        title: 'Caller Recognition',
        description: 'Returning callers are greeted by name. VIPs are routed immediately. Blocked numbers are handled silently.',
      },
      {
        icon: icons.sms,
        title: 'SMS Follow-Up',
        description: 'Missed calls get an instant text. Meeting confirmations, directions, and follow-up info sent automatically after every call.',
      },
    ],
    howItWorks: [
      { title: 'Set Up Your Agent', description: 'Configure your greeting, team directory, transfer rules, and message-taking preferences.' },
      { title: 'Connect Your Number', description: 'Forward your business line or get a new number. Works with any phone system.' },
      { title: 'Go Live', description: 'Every call is answered professionally. Messages, transfers, and scheduling handled automatically.' },
    ],
    features: ['smartCallHandling', 'warmTransfer', 'availability24x7', 'integrationsApps', 'knowledgeBase', 'intelligentSMS'],
    faq: [
      {
        question: 'How does it compare to a human receptionist?',
        answer: 'Your AI receptionist answers instantly (no hold times), works 24/7, costs a fraction of a salary, and never calls in sick. For complex situations, it seamlessly transfers to your team.',
      },
      {
        question: 'Can it manage my calendar and CRM?',
        answer: 'Yes. Magpipe integrates with Google Calendar, Cal.com, HubSpot, Salesforce, and 40+ more tools. Your AI checks availability, books meetings, logs new contacts in your CRM, and posts call summaries to Slack — all during the call.',
      },
      {
        question: 'What happens to messages?',
        answer: 'Messages are delivered instantly via SMS, email, Slack, or your preferred channel. Each message includes caller name, number, reason for calling, and urgency level.',
      },
      {
        question: 'Can different team members have different rules?',
        answer: 'Absolutely. Set up transfer schedules, do-not-disturb hours, and custom greetings for each team member.',
      },
    ],
    finalCta: {
      title: 'Never miss another call',
      subtitle: 'Start with $20 in free credits. Professional reception from day one.',
    },
  },

  dispatch: {
    type: 'use-case',
    meta: {
      title: 'AI Dispatch Agent | Magpipe',
      description: 'AI dispatch agent for field service, delivery, and emergency response. Coordinate teams, update ETAs, and handle incoming requests 24/7.',
    },
    hero: {
      badge: 'AI Dispatch',
      title: 'AI-Powered<br>Dispatch',
      subtitle: 'Handle incoming service requests, coordinate field teams, and update customers on ETAs — your AI dispatch agent keeps operations running smoothly around the clock.',
    },
    benefits: [
      {
        icon: icons.phone,
        title: 'Incoming Request Handling',
        description: 'AI receives service requests, gathers job details, and assigns priority — no bottleneck at the dispatch desk.',
      },
      {
        icon: icons.globe,
        title: 'Multilingual Coordination',
        description: 'Coordinate with field teams in any language. Real-time translation removes communication barriers.',
      },
      {
        icon: icons.clock,
        title: '24/7 Dispatch Coverage',
        description: 'Emergency and after-hours requests are handled immediately, with smart escalation for urgent situations.',
      },
      {
        icon: icons.integrations,
        title: 'FSM & CRM Integration',
        description: 'Connect your FSM software via MCP, plus native HubSpot, Slack, and Google Calendar integrations. Jobs assigned and logged across all systems during the call.',
      },
      {
        icon: icons.sms,
        title: 'Automated ETA Updates',
        description: 'Keep customers informed with automated SMS updates on technician arrival times and job status.',
      },
      {
        icon: icons.analytics,
        title: 'Dispatch Analytics',
        description: 'Track request volumes, response times, job completion rates, and team utilization from one real-time dashboard.',
      },
    ],
    howItWorks: [
      { title: 'Define Your Workflows', description: 'Set up service areas, job types, priority levels, and team assignments.' },
      { title: 'Connect Your Systems', description: 'Native integrations with your scheduling, routing, and field service management tools — no middleware needed.' },
      { title: 'Go Live', description: 'AI starts handling inbound requests, coordinating teams, and updating customers automatically.' },
    ],
    features: ['smartCallHandling', 'realTimeTranslation', 'availability24x7', 'integrationsApps', 'intelligentSMS', 'analyticsInsights'],
    faq: [
      {
        question: 'Can the AI assign jobs to field teams?',
        answer: 'Yes. Based on your configured rules — service area, technician availability, skill requirements — the AI can assign and communicate jobs to the right team member.',
      },
      {
        question: 'How does it handle emergency requests?',
        answer: 'You define emergency criteria. When triggered, the AI immediately escalates — calling the on-duty manager, dispatching the nearest technician, and notifying relevant stakeholders.',
      },
      {
        question: 'Can customers get real-time updates?',
        answer: 'Absolutely. The AI sends automated SMS updates with technician name, ETA, and job status. Customers can reply to reschedule or ask questions.',
      },
      {
        question: 'What tools does it integrate with?',
        answer: 'Magpipe connects with 40+ tools — Slack, HubSpot, Salesforce, Google Calendar, and more. Connect your FSM or dispatch software via MCP servers. Your AI assigns jobs, updates schedules, and posts alerts across all connected systems during live calls.',
      },
    ],
    finalCta: {
      title: 'Streamline your dispatch operations',
      subtitle: 'Start with $20 in free credits. Handle more requests with less overhead.',
    },
  },
};

// Helper to get feature objects for a page
export function getPageFeatures(slug) {
  const page = landingPages[slug];
  if (!page) return [];
  return page.features.map(key => features[key]).filter(Boolean);
}
