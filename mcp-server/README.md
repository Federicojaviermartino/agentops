# AgentOps MCP Server

EU AI Act compliance directly from your IDE. Connect Claude Code, Cursor, Windsurf, or any MCP-compatible client to AgentOps.

## 15 Tools Available

| Tool | Description |
|------|-------------|
| `agentops_classify` | Classify AI system risk level (Chain-of-Thought + 14 heuristics) |
| `agentops_search_regulation` | Search EU AI Act articles (113 articles, 13 annexes) |
| `agentops_get_article` | Get specific article details (Art. 9, Art. 50, etc.) |
| `agentops_calculate_penalty` | Calculate maximum fine by revenue and violation type |
| `agentops_country_penalties` | Get country-specific enforcement data (27 EU countries) |
| `agentops_detect_gpai` | Detect GPAI/foundation model usage in your systems |
| `agentops_list_templates` | Browse sector-specific Annex IV templates |
| `agentops_get_template` | Get full template with pre-filled sections |
| `agentops_ask` | Ask any EU AI Act question (knowledge base + LLM) |
| `agentops_us_compliance` | US AI frameworks with EU AI Act cross-mapping |
| `agentops_validation_dataset` | 50-system benchmark dataset (CC-BY-4.0) |
| `agentops_list_systems` | List your registered AI systems |
| `agentops_ci_check` | Run CI/CD compliance check (PASS/WARN/FAIL) |
| `agentops_sandboxes` | EU regulatory sandbox info and applications |
| `agentops_generate_ci_config` | Generate GitHub Actions / GitLab CI config |

## Quick Start

### Claude Code
```bash
claude mcp add agentops -- npx @agentops/mcp-server \
  --env AGENTOPS_API_KEY=your_api_key \
  --env AGENTOPS_URL=https://agentops-api.onrender.com
```

### Cursor
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "agentops": {
      "command": "npx",
      "args": ["@agentops/mcp-server"],
      "env": {
        "AGENTOPS_API_KEY": "your_api_key",
        "AGENTOPS_URL": "https://agentops-api.onrender.com"
      }
    }
  }
}
```

### Windsurf
Add to Windsurf MCP settings:
```json
{
  "mcpServers": {
    "agentops": {
      "command": "npx",
      "args": ["@agentops/mcp-server"],
      "env": {
        "AGENTOPS_API_KEY": "your_api_key",
        "AGENTOPS_URL": "https://agentops-api.onrender.com"
      }
    }
  }
}
```

## Usage Examples

Once connected, ask your AI assistant:

- "Classify my hiring AI system for EU AI Act compliance"
- "What are the penalties for non-compliance in Italy?"
- "Search the EU AI Act for human oversight requirements"
- "Calculate the fine for a 5M EUR revenue company violating high-risk rules"
- "Which regulatory sandboxes are operational?"
- "Generate a GitHub Actions compliance check"
- "Get the Annex IV template for fintech credit scoring"
- "What US state laws apply to my AI system?"

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTOPS_API_KEY` | Yes | API key from AgentOps dashboard |
| `AGENTOPS_URL` | No | API URL (default: https://agentops-api.onrender.com) |

## Get API Key

1. Sign up at https://app.agentops.eu
2. Go to Settings > API Keys
3. Create new key
4. Use in MCP config

## License

MIT
