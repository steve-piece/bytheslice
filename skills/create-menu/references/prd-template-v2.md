# [Project Name]: PRD

Version: x.x
Date: YYYY-MM-DD
Owner: [Name]
Status: Draft | Active

---

## 0. Project Metadata

| Field | Value |
| --- | --- |
| Project name | [Full display name] |
| Slug | [url-safe-slug] |
| Owner | [Name or team] |
| Target launch | [Quarter / date] |
| Architecture | [Single Next.js app \| Turborepo monorepo]: see Section 4 |

> Unless explicitly overridden in this document, use the **Phased Default Project Setup** for all tech stack, architecture, testing, CI/CD, and coding standards. See `references/project-defaults.md`.

If this project intentionally diverges from any default, include an override table:

### 0.1 Overrides from Default Setup

| Default | Override | Reason |
| --- | --- | --- |
| (none if project follows all defaults) | | |

---

## 1. Problem & Users

### 1.1 The Problem

One paragraph. State the core problem, who experiences it, and the cost of not solving it. No marketing language. No solution language in this section.

### 1.2 The Users

One paragraph. Describe who will use this product: their role, context, and primary job to be done. Include secondary users if meaningfully different.

> If the brief implies multiple distinct user types with different access levels (e.g. end users + admins), describe each in a short paragraph and note the implication for architecture.

---

## 2. Functional Requirements

### 2.1 Capabilities

List features grouped by theme or module. For each capability, include:
- A one-line description of the user value
- Key behaviors (what must happen)
- At least one edge case per capability

Example format:

**[Capability Name]**
- User value: [one sentence]
- Behaviors: [bullet list]
- Edge cases: [bullet list]

### 2.2 Implied Integrations

List external services or APIs implied by the capabilities above. For each:
- Purpose and where it is used
- Default provider (from `project-defaults.md`) unless overridden
- Known constraints (rate limits, failure modes)

---

## 3. Non-Functional Requirements

State concrete, testable targets. Avoid vague language like "fast" or "secure": every item should be measurable.

### 3.1 Performance

- Page load: [e.g., LCP ≤ 2.5 s on 4G, measured via Lighthouse]
- API response: [e.g., p95 ≤ 200 ms for core reads]
- Availability: [e.g., 99.9% monthly uptime]
- Any other throughput or latency targets

### 3.2 Accessibility

- Target: [e.g., WCAG 2.1 AA minimum]
- Screen reader support: [required / not required / partial]
- Keyboard navigation: [full / partial]
- Color contrast: [AA / AAA]

### 3.3 Security Posture

- Auth model: [e.g., email magic link, passkeys, or email/password, through the provider the operator authorized]
- Authorization: [e.g., row-level security on all user data tables]
- Data at rest: [encrypted / not required]
- Data in transit: [TLS 1.2+ / other]
- Compliance: [GDPR / SOC2 / HIPAA / none]
- Rate limiting: [required on which endpoints]

### 3.4 Other Constraints

- Browser support: [e.g., last 2 versions of modern browsers]
- Mobile: [responsive web / native app / not required]
- Localization: [English only / multi-language: which?]
- Data retention: [e.g., user data deleted within 30 days of account deletion]

---

## 4. Technical Architecture

> **Architecture rule:** Marketing-only single site (no auth, no dashboard, no admin, no client portal) → single Next.js app, NOT a monorepo. Any combination of marketing + authenticated experience → Turborepo monorepo. This was determined in the plan-mode gate.

### 4.1 Architecture Decision

**Decision:** [Single Next.js app | Turborepo monorepo]

**Rationale:** [Why this was chosen based on scope]

### 4.2 Frontend

- Framework: [Next.js App Router | other: with rationale if not default]
- Language: TypeScript strict mode
- Styling: Tailwind CSS (tokens defined in design-system gate)
- Component system: shadcn/ui
- Additional libraries: [list any from brief or plan-mode]

### 4.3 Backend & Data

- Database: [the provider the operator authorized, or a local option such as SQLite; name it]
- Auth: [the provider or approach the operator authorized, or a local option; name it]
- Server actions vs API routes: [server actions for mutations; API routes only for external clients]
- Core entities: [list top-level data objects]
- Data model notes: [relationships, retention, migration, auditing needs]

### 4.4 Infrastructure & Environments

- Hosting: [the host the operator authorized, or localhost; name it]
- Environments: local, preview, staging, production
- Environment-specific constraints: [any]
- Required environment variables: [list: must align with Section 6 open questions for any unknowns]

### 4.5 Monorepo Structure (if applicable)

Only include if architecture decision is Turborepo monorepo.

```
apps/
  web/          ← marketing site
  app/          ← authenticated product
  admin/        ← admin panel (if in scope)
packages/
  ui/           ← shared component library
  db/           ← database client and types
  config/       ← shared configuration
  utils/        ← shared utilities
```

---

## 5. UX & Content Fundamentals

### 5.1 Voice & Tone

Describe the brand's communication personality in 2 to 4 adjectives with brief definitions. Example: "Direct (no filler words), Warm (not corporate), Expert (not condescending)."

### 5.2 Brand Stance

One paragraph describing the brand's position in the market, what it is not, and any explicit prohibitions on messaging or visual style.

### 5.3 Content Requirements

- Key terminology: [any domain-specific terms that must be used consistently]
- Prohibited language: [any terms to avoid]
- Legal or compliance copy: [any required disclaimers or notices]
- Important system messages: [e.g., error state copy guidelines, empty state copy tone]

### 5.4 Key Screens & States

List the core screens and required states for each:

| Screen | Empty | Loading | Populated | Error |
| --- | --- | --- | --- | --- |
| [Screen name] | [description] | [skeleton / spinner] | [description] | [description] |

---

## 6. Open Questions & Explicit Assumptions

Populated from plan-mode gate answers and remaining ambiguities. Every `[TBD-BLOCKER]` in the document must have a corresponding entry here.

### 6.1 Open Questions

Items requiring a decision before work begins:

| # | Question | Owner | Priority |
| --- | --- | --- | --- |
| 1 | [Question text] | [Who decides] | Blocker / High / Low |

### 6.2 Explicit Assumptions

Working assumptions made during PRD generation. Validate during design or Stage 1:

- `[TBD-ASSUMPTION]` [description of assumption and its impact if wrong]
- `[TBD-DEFER]` [decision that can be made later: note when]

---

## 7. Out of Scope

Anti-drift section. Explicit list of use cases, features, and segments that are intentionally excluded from this release. Every item should have a brief rationale.

| Item | Rationale |
| --- | --- |
| [Feature or use case] | [Why excluded: deferred / not the right user / complexity tradeoff] |

> **Minimum:** at least 2 explicit exclusions. "We didn't think of it" is not a rationale: every exclusion should be a deliberate decision.

---

*PRD produced by `/create-menu` v2. Reviewed by `prd-reviewer`. Feed this document to `/cook-pizzas` after human sign-off.*
