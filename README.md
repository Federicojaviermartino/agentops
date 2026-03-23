# AgentOps - EU AI Act Compliance Platform

Automated compliance platform for the EU AI Act (Regulation EU 2024/1689). 5 AI agents classify, audit, detect bias, generate documentation, and monitor AI systems.

**Live demo:** [agentops-api.onrender.com](https://agentops-api.onrender.com)
**API docs:** [/docs](https://agentops-api.onrender.com/docs)
**Demo access:** `GET /demo` (no authentication required)

## Tech Stack

- **Backend:** NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 16
- **AI:** Claude API (Anthropic) + OpenAI fallback
- **Bias Service:** FastAPI + Fairlearn (Python)
- **Billing:** Stripe (checkout, portal, webhooks)
- **Email:** Resend transactional emails
- **Storage:** AWS S3 / MinIO
- **Deploy:** Render (render.yaml blueprint)
- **CI/CD:** GitHub Actions (lint, test, build, security, docker, deploy)

## Quick Start

```bash
git clone <repo> && cd agentops-integrated
npm install
cp .env.example .env  # Edit with your API keys
docker compose -f docker/docker-compose.yml up -d
npx prisma generate --schema=src/prisma/schema.prisma
npx prisma migrate dev --schema=src/prisma/schema.prisma --name init
npx prisma db seed
npm test     # 351 tests
npm run start:dev
```

Open: `http://localhost:3000/` (landing) | `/docs` (Swagger) | `/demo` (demo access)

Login: `admin@techstart.es` / `AgentOps2026!`

## Deploy to Render

See [DEPLOY.md](DEPLOY.md) for step-by-step instructions.

Quick: push to GitHub, go to Render > New Blueprint > select repo. Done.

## Architecture

```
29 NestJS modules | 96 API endpoints | 351 tests | 54 compiled files | 21 languages

Core:           Auth, AI Systems, Assessments, Findings, Documents, Billing, Health
Agents:         Classification, Technical Audit, Bias Detection, Documentation, Monitoring
Intelligence:   Assistant (chatbot), Roadmap, Compliance Score (A-F), Checklist (25 items)
Differentiators: Comparator (4 regulations), Timeline, Benchmark, Incidents (Art. 73)
Platform:       Analytics, Settings, Search, Notifications, Webhooks, Export, i18n, API Keys, Demo
Security:       Helmet, CORS, CSP, Rate Limiting, JWT+Refresh, RBAC (5 roles), Audit Log, RFC 7807
```

## 5 AI Agents

| Agent | What it does | Article |
|-------|-------------|---------|
| Classification | Risk level (Unacceptable/High/Limited/Minimal) with 8 heuristic overrides | Art. 5-6 |
| Technical Audit | GitHub/GitLab repo analysis against 7 compliance areas | Art. 9-15 |
| Bias Detection | Fairlearn: 5 fairness metrics per protected attribute | Art. 10 |
| Documentation | Annex IV (9 sections), FRIA, Conformity, Transparency | Art. 11 |
| Monitoring | Drift detection, regulatory scanning, doc freshness, deadline alerts | Art. 72 |

## 10 Unique Differentiators

1. **Compliance Assistant** - 14-topic EU AI Act chatbot
2. **Personalized Roadmap** - Step-by-step per system with dependencies
3. **Compliance Score A-F** - 9-area weighted breakdown
4. **Interactive Checklist** - 25 items from Art. 5-73
5. **Multi-regulation Comparator** - EU AI Act + GDPR + ISO 42001 + NIST AI RMF
6. **Compliance Timeline** - Chronological event history
7. **Industry Benchmark** - Anonymous peer comparison
8. **Incident Reporting** - Art. 73 workflow (72h/15d)
9. **Evidence Package** - One-click export for regulators
10. **Self-service API Keys** - Programmatic access

## Pricing

| Plan | Price | Systems | Features |
|------|-------|---------|----------|
| Starter | 199 EUR/mo | 3 | Classification, Basic Findings |
| Professional | 499 EUR/mo | 15 | All 5 Agents, API Access |
| Enterprise | Custom | Unlimited | SSO, SLA, On-premise |

## License

Proprietary. All rights reserved.
