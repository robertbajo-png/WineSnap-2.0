# CODEX MASTER BRIEF — WineSnap Evolution: Personal AI Chef, Sommelier & KetoLens

## Mandatory development decision: Codex builds and owns the app — NO LOVABLE

**This explicitly overrides any earlier assumption that development, UI generation or release should continue in Lovable.**

- Codex must implement the entire new application **directly in this existing Git repository**, writing and maintaining the actual frontend, backend, database migrations, AI integrations, tests and build/deployment configuration. Do not delegate design or coding to Lovable or use its AI agent, editor, preview builder, code generation, hosting or paid credits.
- Reuse working React, TypeScript, TanStack, Supabase and other *portable* existing source code when appropriate; owning the code and deployment independently is the objective. Do not discard good source simply because Lovable originally produced it.
- **Audit all Lovable dependencies**: packages and build plugins (including `@lovable.dev/...`), generated configuration, preview URLs, deployment workflows, hosted database, storage, authentication, edge functions and AI gateway. Categorize each as replace, retain temporarily for migration, or no dependency.
- Propose an **independently controlled infrastructure**: for example GitHub + Codex for development, Cloudflare or other independently managed hosting, separately administered Supabase or equivalent database/auth/storage and direct provider AI APIs with server-side keys. Choose technologies based on existing code, cost and technical suitability, not on an assumed mandate to use these vendors.
- In particular, **do not presume that leaving the Lovable development tool instantly migrates or terminates Lovable-managed Cloud resources**. Existing production data, user identity, wine images and functions must remain intact until there is a documented, tested, approved migration to resources the owner controls.
- Codex should produce a concrete exit/migration plan, including data and storage export, authentication/user migration feasibility, secrets rotation, API compatibility, DNS/custom domain, CI/CD, staging, backup and restore rehearsal, rollback, operational costs and validation of parity.
- The working app should be buildable, testable and deployable using documented commands and standard tools **without requiring Lovable access**.
- **No migration, cutover, deletion or production deployment without explicit approval.** Keep the old app available until the replacement passes functional and security checks.
- Create a feature branch for actual code changes; do not merge to main without review. Documentation updates do not authorize touching live infrastructure.

## Mission and scope

Transform the existing WineSnap 2.0 application into a personal AI chef and culinary companion with long-term memory, integrated wine expertise, and an **optional advanced keto / low-carb capability derived from KetoLens**.

**Continue in the existing WineSnap repository. Do not create a separate app or rewrite the entire codebase.** Keep WineSnap as the working technical name until branding is decided. Preserve existing users, wine data, images, cellar management, AI conversations, wine scanning, recommendations, social capabilities, authentication, access controls, and documented release safeguards.

Core positioning: **A personal AI chef who remembers what you cook, eat and drink — and helps you cook better every time.**

The goal is an original, highly usable product, not a generic recipe generator plus chatbot. The differentiator is the combination of a living personal cookbook, an interactive kitchen workbench, context-aware Cook Mode, reliable long-term memory and food/wine intelligence. Dietary modes such as keto enhance the core product but must remain entirely optional.

## Product structure

1. **Personal AI Chef** — conversational help with meal discovery, recipe creation, adaptation and cooking problems.
2. **Living Cookbook / Food Memory** — recipes evolve based on user modifications, outcomes and preferences, with evidence and user control.
3. **Interactive Kitchen Workbench** — start from ingredients, a cuisine/dish, an occasion or a wine; combine relevant inputs intuitively.
4. **Cook Mode** — dedicated focused step-by-step cooking with reliable state, multi-timers, hands-free voice (where supported), and context-aware AI assistance.
5. **Wine / AI Sommelier** — preserve WineSnap scanning, cellar, Wine Memory, wine discovery and food-wine pairing in both directions.
6. **Family / Household** — simple distinct preference profiles, shared meal needs and sensible variations.
7. **KetoLens (optional Keto Mode)** — recipe-level carb constraints first; later meal-photo logging, detailed nutrition and manually entered real ketone measurements.

## UX and distinctive design

Use **an editorial living cookbook + interactive kitchen workbench**, not a generic colorful recipe-card dashboard or a traditional black/gold/burgundy wine app. Explore warm ivory, deep forest green, olive and restrained terracotta; distinctive typography combining editorial serif headings with very readable sans-serif controls; excellent culinary photography; tasteful motion; and generous negative space. These are directions, not mandatory tokens.

- **Home**: AI Chef welcomes user with only evidence-backed personalization; immediate prompt “What should we cook tonight?”, real recent cooking memory, relevant suggestions and quick actions.
- **Living Cookbook**: a recipe is an evolving object containing original ingredients/steps, personal variants, actual cooking sessions, feedback, preferred changes, wines served and household reception.
- **Kitchen Workbench**: visually combine ingredient chips/objects, preferences, time, equipment and wine to generate options; accessible non-drag alternatives required.
- **Cook Mode**: contrasting high-legibility distraction-free execution environment; large controls, clear current step, ingredient amounts, elapsed/remaining timers and AI help.
- **Wine**: remains a carefully integrated area with existing scanners, cellar and recommendations, not the default center of the whole app.
- **Keto**: appears only if user explicitly enables it; a contextual overlay across Recipes, Cook and Food Memory, plus a dedicated progress view. Avoid permanently cluttering navigation or forcing keto data entry on standard users.
- **Family**: per-person preferences, with no assumption the household shares one dietary regime.
- **Chat**: one unified context-aware AI Chef experience rather than disconnected chatbots; knows whether invoked from a recipe, cooking step, ingredient workbench, wine detail or keto meal log.

Propose simple mobile navigation, e.g. Home | Kitchen | Cook | Wine | You, with Keto available inside preferences/food tracking when enabled. Mobile-first PWA; ensure a useful tablet Cook Mode. Maintain functional voice-free alternative.

## The memory model

Reuse and extend the current evidence-backed Wine Memory design.

Separate:
- raw user statement / original rating or event;
- validated extracted signals with source, timestamp, confidence and associated wine/recipe/meal/session;
- deterministic derived preferences with evidence count and recency weighting;
- context of the current conversation;
- user-confirmed corrections, overrides and deletions.

**Food Memory** captures recipes liked/disliked, ingredients, cuisines, textures, cooking methods, cooking skill, equipment, dietary restrictions, successful adjustments, cooking occasions and price/time constraints.

**Wine Memory** continues to capture wine facts, user ratings and taste preferences as already developed.

**Combined meal memory** records when a dish and wine were consumed together and how each was rated. Do not infer broad tastes from a single meal. “WineSnap remembers this exact meal” must be grounded in persisted history, never made up.

Users need a transparent view to inspect, correct and delete stored preferences, and personal data must be properly isolated.

## Recipes and Cook Mode

Recipe entities require validated, structured data: ingredients with quantities/units, servings, steps, equipment, estimated time, verified safety-critical temperatures, nutrition provenance when available, original version vs session modifications, and links to cooking sessions.

Deterministic application logic should own portion scaling, conversions, step progression, timed events and session persistence. The LLM may suggest modifications but cannot silently overwrite verified state or safety-critical instructions.

Cook Mode MVP:
- resumable cooking session and step-by-step UI;
- active-step-aware assistant able to answer recipe-specific questions;
- working named multi-timers and pause/restart handling;
- substitutions, scalable servings and session-specific recipe adaptations;
- warnings and fallback behavior for uncertain food-safety questions;
- brief post-cooking feedback that updates the personal recipe/history via validated signals.

Later add speech-to-text, text-to-speech and hands-free voice commands (next, repeat, time, help, ingredient amount), checking actual browser/device support and background limitations. Never pretend a mock timer or voice control works. Do not store audio unnecessarily.

## Interactive Kitchen and Pantry

Support entering ingredients and usual pantry items first. Later photo-based refrigerator / food recognition must present suggestions for user confirmation, not assert exact quantity, freshness or safety from images. Recipes should be able to use pantry state, time, equipment and household preference constraints. Clarify which stock data is confirmed current versus habitual or stale.

## Wine integration

Retain existing identification, label scanning, saved wine photos, cellar, wine detail metadata, profiles, recommendations and chats without regression.

Support Dish → Wine and Wine → Dish, optionally choosing wines already in the user's cellar. Ground suggestions in known wine attributes and honest uncertainty. Wine is optional in the wider app; recipes and Cook Mode must work fully without wine.

## KetoLens as an integrated **optional** domain

KetoLens is no longer envisioned as a separately launched app in this project. Incorporate its valuable technology and workflows into a wider AI Chef app without making standard users feel they are using a diet app.

### Keto Mode onboarding and preferences
- User explicitly activates Keto Mode / Low Carb, can disable it, and can set a voluntary personal net-carbohydrate target.
- Keep Standard, Keto, Low Carb and other dietary preferences clearly separated; allow appropriate combinations and avoid conflicting settings.
- Never apply an adult's keto restriction automatically to other household members, particularly children.
- Do not present carbohydrate goals as individualized clinical advice.

### Keto recipes and Cook Mode — early phase
- Keto preferences influence recipe suggestions, filters and ingredient substitutions.
- Show estimated **net carbs per serving** when backed by available ingredient quantities and suitable nutrition reference data.
- Adjust serving size, recipe substitutions and cooking steps coherently, recomputing estimates.
- Offer comparisons such as standard recipe vs keto modification, explain substitutions and their effect on taste/texture.
- If an estimate cannot be supported, mark it unknown; do not manufacture precise values.

### Food photo analysis — later phase
- User photographs a plated meal to propose food items, portions and approximate total/net carbohydrate values.
- Always show uncertainties and allow correction of the identified ingredients, quantities and portion sizes before logging.
- Do not infer exact macros from a picture; distinguish user-entered, calculated-from-structured-recipe and image-estimated values.
- Maintain a meal history and optional daily net-carb budget/progress with clear caveats.

### Reliable nutrition model
- Define a structured ingredient/nutrition data pipeline with sources, portions, units, reference version and uncertainty.
- Respect regional label conventions: EU “carbohydrate” already excludes fibre, whereas some other jurisdictions display total carbohydrate including fibre; avoid blindly subtracting fibre twice.
- Sugar alcohol/polyol handling is context-dependent; do not fabricate a universal precise net-carb value when data is insufficient.
- Use properly licensed, reputable nutrition datasets/APIs where feasible; cache calculated recipes; flag unknown ingredients.

### Manual ketone measurements — later phase
- Support user-entered measured ketone values with **measurement type** (e.g. blood beta-hydroxybutyrate, breath or urine), unit, timestamp and optional notes.
- Different measurement types are not interchangeable. Validate values and units, preserve source/method and show historical trends.
- Never derive actual blood ketone measurements or “confirmed ketosis” from a meal photo, macros or intake history.
- Distinguish actual measured health values from AI-estimated dietary values in every view.
- Avoid diagnosis, treatment or medical instruction; provide appropriate safety messaging if requests implicate illness, pregnancy, diabetes, medication or children.

### Privacy for health-related information
- Keto settings, dietary restrictions and ketone readings may reveal sensitive health data.
- Design purpose limitation, opt-in collection, explicit user controls, export/delete, limited retention and restrictive access controls.
- Assess GDPR Article 9 obligations and lawful bases before collecting measurements in production.
- Do not feed sensitive measurements into social discovery or public taste profiles by default; no public sharing without separate explicit user action.
- Do not put sensitive health data into analytics events or logs.

### Packaging
Keto functionality should feel like a natural part of Your Kitchen / Food Memory, not an unrelated standalone interface. Explore limited free dietary preferences with advanced logging/analytics as a possible paid feature, but do not implement paywalls or subscriptions before commercial approval.

## AI/system architecture

Keep wine facts, food facts, structured user/household memory, health-related records and current session context in distinct domains with minimal authorized retrieval. Server-side validated tool actions only; rate limits, token budgets, error handling and privacy checks. Prefer deterministic calculations and schema-validated extraction to free-form LLM writes. Track cost per meaningful action. Preserve existing WineSnap security and entitlement structures.

## Development and release sequence

**Phase 0 — Audit and plan (no production changes):** Inspect actual current repo, schema, auth, functions, release docs, outstanding security/deployment tasks and existing components. Confirm backups/migration paths. Map reusable functionality and technical debt. Produce documented architecture, table/endpoint proposals, UX wireframes, effort/risk estimates and acceptance criteria.

**Phase 1 — Distinctive interactive design prototype:** New Home, Living Cookbook, Kitchen Workbench, recipe detail, Cook Mode, contextual AI Chef, integrated Wine area. Include a clear optional Keto Mode toggle and illustrative recipe-level carb display, but label mocks and do not create fake clinical functionality. Keep existing WineSnap production experience intact.

**Phase 2 — Cooking core:** Structured recipe engine, personal recipe versions, ingredient quantities, real cooking sessions, timers, safe scalable recipes and core Cook Mode.

**Phase 3 — AI Chef + Food Memory:** Validated recipe generation/adaptation, grounded contextual chat, feedback and evidence-based food preferences. Integrate with Wine Memory using explicit links.

**Phase 4 — Food/wine pairing and family:** Cellar-aware pairings, wine-led meal discovery, household profiles with privacy boundaries and simple family-aware recommendations.

**Phase 5 — Basic Keto Mode:** Explicit optional setting, nutrition sourcing, recipe adaptation and net-carb per portion where reliably calculated; tests for EU/US fibre rules, scaling, unknown ingredients and family boundaries. May begin alongside Phases 2–4 but not delay the core release.

**Phase 6 — Advanced keto tracking:** Confirmable meal-photo analysis, logged meals, voluntary net-carb budget, manual measured ketones, history and privacy requirements. Only after appropriate safety/data-protection review.

**Phase 7 — Advanced hands-free voice and pantry:** Voice improvements, refrigerator recognition and richer meal planning, once core workflows are robust; prioritize by real user feedback.

Phases may be reprioritized based on dependencies and measurable user value; do not expand the first release with every feature.

## Required testing

- Existing wine and cellar regression suite, auth, storage and private-data isolation.
- Recipe scaling, units, substitutions, session recovery, multi-timers and voice fallback.
- Memory provenance, correction/removal, cold-start honesty and conflicting preferences.
- Household isolation, child-vs-adult dietary preferences, permissions and opt-in state.
- Nutrition formula correctness for EU/US labels, ingredient quantity scaling, missing data, image confidence/confirmation and uncertain macro estimates.
- Separation of measured ketones from inferred/estimated nutrition; type/unit validation and sensitive-data privacy.
- Food safety guardrails and allergen risk handling.
- Cost/latency limits and AI extraction validation.
- Existing npm typecheck, lint, tests and production build; add end-to-end checks where feasible.

## Codex execution instructions

1. **Begin with a repository audit, a Lovable dependency/exit audit, and a revised detailed implementation plan that Codex can implement and deploy independently.**
2. Produce a distinct coherent visual prototype that we can review before major backend changes.
3. Use a feature branch; do not automatically merge to main or publish production.
4. Do not deploy production migrations or AI functions without explicit approval. Do not use Lovable for design, coding, preview generation or deployment. Do not touch or reveal secrets or real user data.
5. Keep all existing WineSnap functionality and data intact during migration.
6. Clearly label what has been implemented, what is simulated and what is planned.
7. Estimate AI and storage costs, and propose staged feature flags and rollback points.
8. Include KetoLens in the **architecture now**, but keep the **first usable AI Chef + Cook Mode release** the priority.

**Guiding rule:** Every meaningful interaction should help the assistant understand the user's food/wine preferences or help them make a better cooking decision — without forcing nutrition tracking, wine use or a specific diet.
