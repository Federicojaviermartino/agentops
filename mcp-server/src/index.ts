#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================
// AgentOps MCP Server
// EU AI Act Compliance from your IDE
// ============================================================

const API_BASE_URL = process.env.AGENTOPS_URL || "https://agentops-api.onrender.com";
const API_KEY = process.env.AGENTOPS_API_KEY || "";
const CHARACTER_LIMIT = 25000;

async function apiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${API_BASE_URL}/api/v1${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "agentops-mcp/1.0",
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`AgentOps API ${res.status}: ${errorText}`);
  }

  return res.json() as Promise<T>;
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.substring(0, CHARACTER_LIMIT) + "\n\n[Response truncated. Use more specific parameters to get detailed results.]";
}

// ============================================================
// SERVER INITIALIZATION
// ============================================================

const server = new McpServer({
  name: "agentops-mcp-server",
  version: "1.0.0",
});

// ============================================================
// TOOL 1: Classify AI System Risk Level
// ============================================================
server.registerTool(
  "agentops_classify",
  {
    title: "Classify AI System Risk Level",
    description: "Classify an AI system into EU AI Act risk levels (UNACCEPTABLE/HIGH/LIMITED/MINIMAL) using Chain-of-Thought reasoning with 14 heuristics + LLM fallback. Returns risk level, confidence score, reasoning chain, article references, and obligations.",
    inputSchema: {
      description: z.string().describe("What the AI system does"),
      purpose: z.string().describe("Primary purpose (e.g., 'CV screening for hiring')"),
      sector: z.string().describe("Industry sector (HR, FINANCE, HEALTHCARE, EDUCATION, LEGAL, GOVERNMENT, TECH, RETAIL, ENERGY, OTHER)"),
      dataTypes: z.string().optional().describe("Comma-separated data types: PERSONAL, BIOMETRIC, HEALTH, FINANCIAL, BEHAVIORAL, PUBLIC"),
      deploymentContext: z.string().optional().describe("Where deployed: PRODUCTION, STAGING, INTERNAL, RESEARCH"),
      affectedPopulation: z.string().optional().describe("Who is affected: employees, customers, citizens, patients, students"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ description, purpose, sector, dataTypes, deploymentContext, affectedPopulation }) => {
    const result = await apiRequest("/wizard/start", "POST", {
      systemName: `MCP-${Date.now()}`,
      description,
      purpose,
      sector,
      dataTypes: dataTypes?.split(",").map((d: string) => d.trim()) || [],
      deploymentContext: deploymentContext || "PRODUCTION",
      affectedPopulation: affectedPopulation || "Not specified",
    });

    const text = truncate(JSON.stringify(result, null, 2));
    return { content: [{ type: "text" as const, text }] };
  }
);

// ============================================================
// TOOL 2: Search EU AI Act Knowledge Base
// ============================================================
server.registerTool(
  "agentops_search_regulation",
  {
    title: "Search EU AI Act",
    description: "Search the EU AI Act (Regulation EU 2024/1689) knowledge base. Returns matching articles with summaries, keywords, and obligations. Covers 113 articles and 13 annexes.",
    inputSchema: {
      query: z.string().describe("Search query (e.g., 'risk management', 'Art. 50', 'penalties', 'human oversight')"),
      limit: z.number().optional().default(5).describe("Max results (1-10)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ query, limit }) => {
    const result = await apiRequest("/knowledge/search", "GET", undefined, { q: query, limit: String(limit || 5) });
    const text = truncate(JSON.stringify(result, null, 2));
    return { content: [{ type: "text" as const, text }] };
  }
);

// ============================================================
// TOOL 3: Get Specific Article
// ============================================================
server.registerTool(
  "agentops_get_article",
  {
    title: "Get EU AI Act Article",
    description: "Get a specific EU AI Act article with full details including summary, keywords, and obligations. Use 'Art. 9', 'Art. 50', etc.",
    inputSchema: {
      article: z.string().describe("Article reference (e.g., 'Art. 9', 'Art. 50', 'Art. 73')"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ article }) => {
    const result = await apiRequest(`/knowledge/article/${encodeURIComponent(article)}`);
    if (!result) return { content: [{ type: "text" as const, text: `Article '${article}' not found. Try: Art. 5, Art. 9, Art. 50, Art. 73, Art. 99` }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 4: Calculate Penalty
// ============================================================
server.registerTool(
  "agentops_calculate_penalty",
  {
    title: "Calculate EU AI Act Penalty",
    description: "Calculate maximum fine for a specific violation type based on annual revenue and SME status. Art. 99: up to 35M EUR or 7% for prohibited, 15M/3% for high-risk, 7.5M/1% for info.",
    inputSchema: {
      annualRevenue: z.number().describe("Annual revenue in EUR"),
      violationType: z.enum(["PROHIBITED", "HIGH_RISK", "INFO"]).describe("PROHIBITED=35M/7%, HIGH_RISK=15M/3%, INFO=7.5M/1%"),
      isSme: z.boolean().describe("Is the company an SME? (lower of % or absolute applies)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ annualRevenue, violationType, isSme }) => {
    const result = await apiRequest("/penalties/calculate", "GET", undefined, {
      revenue: String(annualRevenue),
      type: violationType,
      sme: String(isSme),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 5: Get Country Penalty Data
// ============================================================
server.registerTool(
  "agentops_country_penalties",
  {
    title: "Get Country Penalty Data",
    description: "Get EU AI Act enforcement data for a specific EU country: national law status, criminal liability, supervisory authority, sandbox status, days until enforcement.",
    inputSchema: {
      countryCode: z.string().length(2).describe("ISO 2-letter country code (IT, DE, FR, ES, NL, etc.)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ countryCode }) => {
    const result = await apiRequest(`/penalties/country/${countryCode.toUpperCase()}`);
    if (!result) return { content: [{ type: "text" as const, text: `Country '${countryCode}' not found. Use 2-letter ISO code: IT, DE, FR, ES, NL, AT, BE, etc.` }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 6: Detect GPAI/Foundation Model Usage
// ============================================================
server.registerTool(
  "agentops_detect_gpai",
  {
    title: "Detect GPAI Usage",
    description: "Scan your organization's AI systems for GPAI/foundation model usage (OpenAI GPT, Anthropic Claude, Google Gemini, Meta Llama, Mistral, Cohere, Stability AI). Returns deployer/provider obligations under Art. 26, 50, 53, 55.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const result = await apiRequest("/gpai/detect");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 7: List Sector Templates
// ============================================================
server.registerTool(
  "agentops_list_templates",
  {
    title: "List Annex IV Templates",
    description: "List available sector-specific Annex IV documentation templates: Fintech (credit scoring), HRtech (recruitment), Healthtech (diagnosis), Edtech (assessment), Legaltech (analysis), Insurtech (pricing).",
    inputSchema: {
      sector: z.string().optional().describe("Filter by sector: Fintech, HRtech, Healthtech, Edtech, Legaltech, Insurtech"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ sector }) => {
    const endpoint = sector ? `/templates/sector/${sector}` : "/templates";
    const result = await apiRequest(endpoint);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 8: Get Template Details
// ============================================================
server.registerTool(
  "agentops_get_template",
  {
    title: "Get Annex IV Template",
    description: "Get a full sector-specific Annex IV template with pre-filled sections, typical findings, and risk level. Use template IDs: fintech-credit, hrtech-recruit, healthtech-diag, edtech-assess, legaltech-analysis, insurtech-risk.",
    inputSchema: {
      templateId: z.string().describe("Template ID (e.g., 'fintech-credit', 'hrtech-recruit')"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ templateId }) => {
    const result = await apiRequest(`/templates/${templateId}`);
    if (!result) return { content: [{ type: "text" as const, text: `Template '${templateId}' not found. Available: fintech-credit, hrtech-recruit, healthtech-diag, edtech-assess, legaltech-analysis, insurtech-risk` }] };
    return { content: [{ type: "text" as const, text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);

// ============================================================
// TOOL 9: Ask Compliance Question
// ============================================================
server.registerTool(
  "agentops_ask",
  {
    title: "Ask EU AI Act Question",
    description: "Ask any question about the EU AI Act. Uses 14-topic knowledge base with LLM fallback for advanced questions. Returns answer with article references and obligations.",
    inputSchema: {
      question: z.string().describe("Your question about the EU AI Act (e.g., 'What are the fines for non-compliance?')"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ question }) => {
    const result = await apiRequest("/assistant/ask", "POST", { question, locale: "en" });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 10: US Compliance Cross-Map
// ============================================================
server.registerTool(
  "agentops_us_compliance",
  {
    title: "US AI Compliance Frameworks",
    description: "Get US AI compliance frameworks (NIST AI RMF, Colorado AI Act, NYC LL144, Illinois BIPA, California AI) with EU AI Act cross-mapping showing overlap areas.",
    inputSchema: {
      frameworkId: z.string().optional().describe("Specific framework ID: nist-ai-rmf, colorado-ai-act, nyc-ll144, illinois-bipa, california-ai, iso-42001. Omit for all."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ frameworkId }) => {
    const result = frameworkId
      ? await apiRequest(`/us-compliance/framework/${frameworkId}`)
      : await apiRequest("/us-compliance/cross-map");
    return { content: [{ type: "text" as const, text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);

// ============================================================
// TOOL 11: Validation Dataset
// ============================================================
server.registerTool(
  "agentops_validation_dataset",
  {
    title: "Get Validation Dataset",
    description: "Get the public 50-system validation dataset with expert-verified EU AI Act risk classifications. Licensed CC-BY-4.0. Use for benchmarking classification accuracy.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const result = await apiRequest("/validation/dataset");
    return { content: [{ type: "text" as const, text: truncate(JSON.stringify(result, null, 2)) }] };
  }
);

// ============================================================
// TOOL 12: List AI Systems
// ============================================================
server.registerTool(
  "agentops_list_systems",
  {
    title: "List AI Systems",
    description: "List all registered AI systems in your organization with risk levels, compliance status, and scores.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const result = await apiRequest("/ai-systems");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 13: CI/CD Compliance Check
// ============================================================
server.registerTool(
  "agentops_ci_check",
  {
    title: "Run CI/CD Compliance Check",
    description: "Run a compliance check suitable for CI/CD pipelines. Returns PASS/WARN/FAIL status, compliance score, critical findings count, and per-system checks.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const result = await apiRequest("/integrations/ci/check");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 14: Regulatory Sandboxes
// ============================================================
server.registerTool(
  "agentops_sandboxes",
  {
    title: "List Regulatory Sandboxes",
    description: "Get information about EU AI regulatory sandboxes (Art. 57). Shows which countries have operational sandboxes, SME priority access benefits, and how to apply.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const result = await apiRequest("/sandbox");
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// TOOL 15: Generate CI/CD Config
// ============================================================
server.registerTool(
  "agentops_generate_ci_config",
  {
    title: "Generate CI/CD Config",
    description: "Generate GitHub Actions or GitLab CI configuration that runs AgentOps compliance checks on every PR and weekly schedule.",
    inputSchema: {
      platform: z.enum(["github", "gitlab"]).describe("CI/CD platform: github or gitlab"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ platform }) => {
    const result = await apiRequest(`/integrations/ci/config/${platform}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// START SERVER (stdio transport for local use)
// ============================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AgentOps MCP server running on stdio");
  console.error(`API: ${API_BASE_URL}`);
  console.error(`Tools: 15 registered`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
