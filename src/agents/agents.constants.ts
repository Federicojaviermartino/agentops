// ============================================================
// AI PROVIDER SERVICE (A01: retry logic, A02: response cache)
// ============================================================

// ============================================================
// CLASSIFICATION AGENT
// ============================================================
export const HEURISTICS = [
  { pattern: /social\s*scor(e|ing)/i, field: 'purpose', level: 'UNACCEPTABLE', reason: 'Social scoring prohibited under Art. 5(1)(c)' },
  { pattern: /subliminal|manipulat(e|ion|ive)/i, field: 'purpose', level: 'UNACCEPTABLE', reason: 'Subliminal manipulation prohibited under Art. 5(1)(a)' },
  { pattern: /(hir(e|ing)|recruit|cv\s*screen|resume\s*screen)/i, field: 'purpose', level: 'HIGH', reason: 'Employment AI high-risk under Annex III, domain 4' },
  { pattern: /(credit\s*scor|loan\s*(approv|decision)|creditworth)/i, field: 'purpose', level: 'HIGH', reason: 'Credit assessment high-risk under Annex III, domain 5(b)' },
  { pattern: /(grad(e|ing)|exam\s*(scor|assess)|student\s*(evaluat|rank))/i, field: 'purpose', level: 'HIGH', reason: 'Education assessment high-risk under Annex III, domain 3' },
  { pattern: /(biometric\s*(identif|recogn)|facial\s*recogn)/i, field: 'purpose', level: 'HIGH', reason: 'Biometric identification high-risk under Annex III, domain 1' },
  { pattern: /(chatbot|virtual\s*assist|customer\s*support\s*bot)/i, field: 'purpose', level: 'LIMITED', reason: 'AI interacting with persons has Art. 50 obligations' },
  { pattern: /(generat(e|ive|ing)\s*(text|image|video|content)|generative\s*ai|deepfake)/i, field: 'purpose', level: 'LIMITED', reason: 'AI-generated content has Art. 50 obligations' },
  { pattern: /(critical\s*infra|energy\s*grid|water\s*supply|traffic\s*control)/i, field: 'purpose', level: 'HIGH', reason: 'Critical infrastructure high-risk under Annex III, domain 2' },
  { pattern: /(law\s*enforce|police|crime\s*predict|recidiv)/i, field: 'purpose', level: 'HIGH', reason: 'Law enforcement AI high-risk under Annex III, domain 6' },
  { pattern: /(migrat|asylum|border\s*control|visa\s*process)/i, field: 'purpose', level: 'HIGH', reason: 'Migration/border AI high-risk under Annex III, domain 7' },
  { pattern: /(emotion\s*(detect|recogn)|sentiment\s*analysis.*employ)/i, field: 'purpose', level: 'LIMITED', reason: 'Emotion recognition has Art. 50 obligations' },
  { pattern: /(medical\s*device|diagnos|radiology|pathology)/i, field: 'purpose', level: 'HIGH', reason: 'Medical device AI high-risk under Annex I + Annex III' },
  { pattern: /(insurance\s*pric|insurance\s*risk|actuarial)/i, field: 'purpose', level: 'HIGH', reason: 'Insurance assessment high-risk under Annex III, domain 5' },
];


// ============================================================
// TECHNICAL AUDIT AGENT
// ============================================================

// ============================================================
// DOCUMENTATION GENERATOR AGENT
// ============================================================

// ============================================================
// BIAS DETECTION AGENT (bridge to FastAPI)
// ============================================================

// ============================================================
// AGENT QUALITY TRACKER (from LLM Course: evaluation metrics)
// ============================================================

// ============================================================
// AGENT ORCHESTRATOR (from GenAI_Agents: multi-agent coordination)
// ============================================================

// ============================================================
// AGENTS MODULE
// ============================================================
