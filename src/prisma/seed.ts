import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AgentOps database...');

  // ============================================================
  // ORGANIZATION 1: TechStart (startup with multiple AI systems)
  // ============================================================
  const org1 = await prisma.organization.create({
    data: {
      name: 'TechStart Solutions S.L.',
      plan: 'PROFESSIONAL',
      settings: {
        locale: 'es',
        timezone: 'Europe/Madrid',
        notifyOnCritical: true,
        notifyOnAssessmentComplete: true,
      },
    },
  });

  const passwordHash = await bcrypt.hash('AgentOps2026!', 12);

  // Users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@techstart.es',
      name: 'Federico Martinez',
      passwordHash,
      role: 'OWNER',
      organizationId: org1.id,
      locale: 'es',
      
    },
  });

  await prisma.user.create({
    data: {
      email: 'compliance@techstart.es',
      name: 'Maria Lopez',
      passwordHash,
      role: 'COMPLIANCE_OFFICER',
      organizationId: org1.id,
      locale: 'es',
      
    },
  });

  await prisma.user.create({
    data: {
      email: 'dev@techstart.es',
      name: 'Carlos Ruiz',
      passwordHash,
      role: 'DEVELOPER',
      organizationId: org1.id,
      locale: 'es',
      
    },
  });

  // AI System 1: CV Screening (HIGH risk - Annex III domain 4)
  const system1 = await prisma.aiSystem.create({
    data: {
      name: 'TalentMatch AI',
      version: '2.1.0',
      description: 'AI-powered CV screening and candidate ranking system for recruitment processes. Uses NLP to analyze resumes and match against job requirements.',
      purpose: 'Automated screening and ranking of job applicants based on CV analysis, skills matching, and experience evaluation.',
      sector: 'EMPLOYMENT',
      dataTypes: ['PERSONAL', 'BIOMETRIC', 'PROFESSIONAL'],
      deploymentContext: 'PRODUCTION',
      affectedPopulation: 'Job applicants in Spain and Portugal, approximately 50,000 candidates per year.',
      riskLevel: 'HIGH',
      complianceStatus: 'NON_COMPLIANT',
      organizationId: org1.id,
    },
  });

  // Assessment for System 1
  const assessment1 = await prisma.assessment.create({
    data: {
      type: 'FULL',
      status: 'COMPLETED',
      triggerType: 'MANUAL',
      triggeredBy: admin.id,
      overallScore: 35,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(),
      aiSystemId: system1.id,
      organizationId: org1.id,
    },
  });

  // Classification result
  await prisma.assessmentResult.create({
    data: {
      agentType: 'CLASSIFICATION',
      status: 'COMPLETED',
      score: 95,
      output: {
        riskLevel: 'HIGH',
        confidence: 0.97,
        reasoning: 'This AI system is used for recruitment and candidate screening, which falls under Annex III, domain 4 (Employment, workers management and access to self-employment). The system makes decisions that substantially affect access to employment opportunities.',
        articleReferences: ['Art. 6(2)', 'Annex III'],
        annexReferences: ['Annex III, domain 4: Employment, workers management'],
        obligations: [
          'Risk management system (Art. 9)',
          'Data governance (Art. 10)',
          'Technical documentation (Art. 11)',
          'Record-keeping (Art. 12)',
          'Transparency (Art. 13)',
          'Human oversight (Art. 14)',
          'Accuracy and robustness (Art. 15)',
        ],
      },
      tokensUsed: 1245,
      durationMs: 3200,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3500000),
      assessmentId: assessment1.id,
    },
  });

  // Technical audit result
  await prisma.assessmentResult.create({
    data: {
      agentType: 'TECHNICAL_AUDIT',
      status: 'COMPLETED',
      score: 35,
      output: {
        overallScore: 35,
        overallStatus: 'NON_COMPLIANT',
        areas: [
          { article: 'Art. 9', name: 'Risk Management System', score: 20, status: 'NON_COMPLIANT' },
          { article: 'Art. 10', name: 'Data Governance', score: 30, status: 'NON_COMPLIANT' },
          { article: 'Art. 11', name: 'Technical Documentation', score: 15, status: 'NON_COMPLIANT' },
          { article: 'Art. 12', name: 'Record-Keeping & Logging', score: 55, status: 'PARTIAL' },
          { article: 'Art. 13', name: 'Transparency', score: 25, status: 'NON_COMPLIANT' },
          { article: 'Art. 14', name: 'Human Oversight', score: 40, status: 'NON_COMPLIANT' },
          { article: 'Art. 15', name: 'Accuracy, Robustness & Cybersecurity', score: 60, status: 'PARTIAL' },
        ],
        summary: 'System shows significant compliance gaps across most EU AI Act requirements. Immediate action needed before August 2, 2026 deadline.',
      },
      tokensUsed: 2100,
      durationMs: 8500,
      startedAt: new Date(Date.now() - 3500000),
      completedAt: new Date(Date.now() - 3000000),
      assessmentId: assessment1.id,
    },
  });

  // Findings for System 1
  const findingsData = [
    { articleRef: 'Art. 9', severity: 'CRITICAL' as const, category: 'RISK_MANAGEMENT' as const, title: 'No documented risk management system', description: 'No risk management process found for the AI-powered recruitment system. Article 9 requires a continuous risk management system throughout the lifecycle.', remediation: 'Implement and document a risk management framework: identify risks, assess their likelihood and severity, define mitigation measures, and establish continuous monitoring.', estimatedEffort: 'WEEKS' as const },
    { articleRef: 'Art. 10', severity: 'HIGH' as const, category: 'DATA_GOVERNANCE' as const, title: 'Training data not documented', description: 'No documentation found for training, validation, or testing datasets. Article 10 requires data governance practices including bias examination.', remediation: 'Document all datasets used for training: sources, collection methods, annotation processes, known limitations, and bias examination results.', estimatedEffort: 'WEEKS' as const },
    { articleRef: 'Art. 10', severity: 'HIGH' as const, category: 'BIAS' as const, title: 'Bias examination not performed', description: 'No bias examination procedures found for training data. Article 10(2)(f) specifically requires examination of possible biases.', remediation: 'Run bias detection analysis across gender, age, nationality, and disability attributes. Use the AgentOps Bias Detection Agent with representative test data.', estimatedEffort: 'WEEKS' as const },
    { articleRef: 'Art. 11', severity: 'HIGH' as const, category: 'DOCUMENTATION' as const, title: 'Annex IV technical documentation missing', description: 'No technical documentation per Annex IV requirements. This is mandatory before market placement.', remediation: 'Generate Annex IV documentation using the Documentation Generator. Include all 9 required sections.', estimatedEffort: 'WEEKS' as const },
    { articleRef: 'Art. 12', severity: 'MEDIUM' as const, category: 'LOGGING' as const, title: 'Logging incomplete for decision traceability', description: 'Current logs capture basic request/response but do not include model version, input features used, confidence scores, or decision rationale.', remediation: 'Enhance logging to capture: input data hash, model version, feature importance, confidence score, decision outcome, and timestamp for each screening decision.', estimatedEffort: 'DAYS' as const },
    { articleRef: 'Art. 13', severity: 'HIGH' as const, category: 'TRANSPARENCY' as const, title: 'No transparency notice for candidates', description: 'Job applicants are not informed that their CVs are being analyzed by an AI system.', remediation: 'Add clear disclosure in the application process that AI is used for CV screening. Explain what data is analyzed and how decisions are influenced.', estimatedEffort: 'DAYS' as const },
    { articleRef: 'Art. 14', severity: 'HIGH' as const, category: 'HUMAN_OVERSIGHT' as const, title: 'No human override mechanism', description: 'No mechanism exists for recruiters to override or intervene in AI screening decisions.', remediation: 'Implement a human-in-the-loop review step where recruiters can review, override, or flag AI recommendations before final decisions.', estimatedEffort: 'WEEKS' as const },
    { articleRef: 'Art. 50', severity: 'MEDIUM' as const, category: 'TRANSPARENCY' as const, title: 'AI-generated content not labeled', description: 'Candidate assessment summaries generated by AI are not marked as AI-generated.', remediation: 'Add clear labeling on all AI-generated assessment reports indicating they were produced by an AI system.', estimatedEffort: 'HOURS' as const },
  ];

  for (const f of findingsData) {
    await prisma.complianceFinding.create({
      data: {
        ...f,
        status: 'OPEN',
        aiSystemId: system1.id,
        assessmentId: assessment1.id,
        organizationId: org1.id,
      },
    });
  }

  // AI System 2: Customer Chatbot (LIMITED risk)
  const system2 = await prisma.aiSystem.create({
    data: {
      name: 'SupportBot Pro',
      version: '3.0.0',
      description: 'GPT-4 powered customer support chatbot that handles product inquiries, returns, and FAQs.',
      purpose: 'Automated customer support with natural language understanding. Handles 70% of customer queries without human intervention.',
      sector: 'RETAIL',
      dataTypes: ['PERSONAL', 'BEHAVIORAL'],
      deploymentContext: 'PRODUCTION',
      affectedPopulation: 'E-commerce customers, approximately 200,000 interactions per month.',
      riskLevel: 'LIMITED',
      complianceStatus: 'PARTIAL',
      organizationId: org1.id,
    },
  });

  const assessment2 = await prisma.assessment.create({
    data: {
      type: 'FULL',
      status: 'COMPLETED',
      triggerType: 'MANUAL',
      triggeredBy: admin.id,
      overallScore: 72,
      startedAt: new Date(Date.now() - 7200000),
      completedAt: new Date(Date.now() - 3600000),
      aiSystemId: system2.id,
      organizationId: org1.id,
    },
  });

  await prisma.assessmentResult.create({
    data: {
      agentType: 'CLASSIFICATION',
      status: 'COMPLETED',
      score: 90,
      output: {
        riskLevel: 'LIMITED',
        confidence: 0.92,
        reasoning: 'Customer-facing chatbot falls under Article 50 transparency obligations. Users must be informed they are interacting with an AI system.',
        articleReferences: ['Art. 50'],
        obligations: ['Inform users of AI interaction (Art. 50)', 'Label AI-generated content'],
      },
      tokensUsed: 890,
      durationMs: 2100,
      assessmentId: assessment2.id,
    },
  });

  await prisma.complianceFinding.create({
    data: {
      articleRef: 'Art. 50',
      severity: 'MEDIUM',
      category: 'TRANSPARENCY',
      title: 'Users not consistently informed of AI interaction',
      description: 'The chatbot widget does not always display a clear notice that the user is interacting with an AI system.',
      remediation: 'Add a persistent banner or notice in the chat interface: "You are chatting with an AI assistant. A human agent is available upon request."',
      estimatedEffort: 'HOURS',
      status: 'IN_PROGRESS',
      aiSystemId: system2.id,
      assessmentId: assessment2.id,
      organizationId: org1.id,
    },
  });

  // AI System 3: Product Recommender (MINIMAL risk)
  await prisma.aiSystem.create({
    data: {
      name: 'RecoEngine',
      version: '1.5.0',
      description: 'Collaborative filtering recommendation engine for product suggestions.',
      purpose: 'Suggest products based on browsing history and purchase patterns.',
      sector: 'RETAIL',
      dataTypes: ['BEHAVIORAL'],
      deploymentContext: 'PRODUCTION',
      riskLevel: 'MINIMAL',
      complianceStatus: 'COMPLIANT',
      organizationId: org1.id,
    },
  });

  // ============================================================
  // ORGANIZATION 2: FinServ (financial services)
  // ============================================================
  const org2 = await prisma.organization.create({
    data: {
      name: 'FinServ Capital GmbH',
      plan: 'STARTER',
      settings: { locale: 'de', timezone: 'Europe/Berlin' },
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@finserv.de',
      name: 'Hans Muller',
      passwordHash,
      role: 'OWNER',
      organizationId: org2.id,
      locale: 'de',
      
    },
  });

  // Credit scoring system (HIGH risk - Annex III domain 5)
  await prisma.aiSystem.create({
    data: {
      name: 'CreditScore AI',
      version: '4.2.0',
      description: 'Machine learning model for automated credit scoring and loan approval decisions.',
      purpose: 'Evaluate creditworthiness of loan applicants using historical financial data, payment history, and behavioral indicators.',
      sector: 'FINANCE',
      dataTypes: ['PERSONAL', 'FINANCIAL', 'BEHAVIORAL'],
      deploymentContext: 'PRODUCTION',
      affectedPopulation: 'Loan applicants in Germany and Austria, approximately 30,000 applications per year.',
      riskLevel: 'HIGH',
      complianceStatus: 'NOT_ASSESSED',
      organizationId: org2.id,
    },
  });

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  await prisma.auditLog.createMany({
    data: [
      { action: 'USER_LOGIN', resource: 'auth', userId: admin.id, userName: 'Federico Martinez', ipAddress: '83.45.12.100', organizationId: org1.id },
      { action: 'SYSTEM_CREATED', resource: 'ai-system', resourceId: system1.id, userId: admin.id, userName: 'Federico Martinez', organizationId: org1.id },
      { action: 'ASSESSMENT_TRIGGERED', resource: 'assessment', resourceId: assessment1.id, userId: admin.id, userName: 'Federico Martinez', organizationId: org1.id },
      { action: 'SYSTEM_CREATED', resource: 'ai-system', resourceId: system2.id, userId: admin.id, userName: 'Federico Martinez', organizationId: org1.id },
    ],
  });

  // ============================================================
  // MONITORING EVENTS
  // ============================================================
  const deadline = new Date('2026-08-02T00:00:00Z');
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

  await prisma.monitoringEvent.create({
    data: {
      eventType: 'DEADLINE_APPROACHING',
      severity: 'HIGH',
      title: `${daysLeft} days until EU AI Act enforcement deadline`,
      description: `The August 2, 2026 deadline for high-risk AI system compliance is approaching. TalentMatch AI has 8 open findings including 1 critical.`,
      acknowledged: false,
      aiSystemId: system1.id,
      organizationId: org1.id,
    },
  });

  await prisma.monitoringEvent.create({
    data: {
      eventType: 'DOCUMENT_EXPIRING',
      severity: 'HIGH',
      title: 'Technical documentation missing for TalentMatch AI',
      description: 'High-risk system has no Annex IV technical documentation. Required before market placement per Art. 11.',
      acknowledged: false,
      aiSystemId: system1.id,
      organizationId: org1.id,
    },
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n=== Seed Complete ===');
  console.log(`Organizations: 2`);
  console.log(`Users: 4`);
  console.log(`AI Systems: 4`);
  console.log(`Assessments: 2`);
  console.log(`Assessment Results: 3`);
  console.log(`Compliance Findings: 9`);
  console.log(`Monitoring Events: 2`);
  console.log(`Audit Logs: 4`);
  console.log('\nDemo login:');
  console.log('  Email: admin@techstart.es');
  console.log('  Password: AgentOps2026!');
  console.log('  Org: TechStart Solutions S.L. (Professional plan)');
  console.log('\n  Email: admin@finserv.de');
  console.log('  Password: AgentOps2026!');
  console.log('  Org: FinServ Capital GmbH (Starter plan)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
