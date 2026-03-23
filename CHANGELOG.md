# Changelog

## [1.2.0] - 2026-03-14

### Added
- **Penalties Module**: 27 EU countries penalty data, fine calculator, sandbox tracker
- **GPAI Module**: Foundation model detection (OpenAI, Anthropic, Google, Meta, Mistral, Cohere, Stability, HF)
- **Wizard Module**: "Compliance in 1 hour" guided flow (register + classify + map + checklist + docs + score)
- **Sandbox Module**: Regulatory sandbox application generator (Art. 57-63)
- **Integrations Module**: GitHub Actions, GitLab CI, Jira, Slack, Teams webhook configs
- **RAG Knowledge Base**: EU AI Act article index with keyword search (25+ articles)
- **Templates Marketplace**: Sector-specific Annex IV templates (Fintech, HRtech, Healthtech, Edtech, Legaltech, Insurtech)
- **Badge Module**: Compliance certification badge with embeddable SVG/HTML/Markdown
- **US Compliance Module**: NIST AI RMF, Colorado AI Act, NYC LL144, Illinois BIPA, California AI laws
- **Validation Dataset**: 50 expert-verified AI systems for classification benchmarking (CC-BY-4.0)
- **Partners Module**: Partner program (4 tiers), certification readiness tracker
- **Plan Guard**: Feature gating by subscription plan (FREE/STARTER/PROFESSIONAL/ENTERPRISE)
- **FREE tier**: 1 AI system, classification, checklist, penalty tracker
- **Sentry integration**: Error monitoring in production
- **HSTS header**: Strict-Transport-Security enabled
- **Body size limits**: 2MB request body limit
- **Chain-of-Thought prompts**: 5-step classification with few-shot examples
- **ReAct pattern**: Technical audit with THOUGHT/OBSERVATION/ACTION
- **Agent orchestrator**: Intelligent routing (halt on UNACCEPTABLE, skip bias without personal data)
- **Agent quality metrics**: Per-agent tracking (validRate, avgConfidence, avgTokens)
- **14 heuristics**: Coverage of 7/8 Annex III domains
- **LLM fallback in Assistant**: Real AI answers for questions outside knowledge base

### Fixed
- dist/src/main.js start path (was dist/main.js, would fail on deploy)
- 21 npm vulnerabilities resolved (8 high -> 0 high, 0 critical)
- ENCRYPTION_KEY added to render.yaml

### Changed
- Render plan: Starter -> Standard ($25/mo, no cold starts)
- Backup cron: Now runs actual pg_dump -> S3
- Prompt version: 1.0.0 -> 2.0.0

## [1.1.0] - 2026-03-13

### Added
- 67-issue audit: all 23 critical, 18 important, 26 minor fixes
- 10 unique differentiators vs competition
- 350 tests, 82% coverage

## [1.0.0] - 2026-03-12

### Added
- Initial release: 29 modules, 97 endpoints, 5 AI agents
- EU AI Act compliance automation
- 21 language support
