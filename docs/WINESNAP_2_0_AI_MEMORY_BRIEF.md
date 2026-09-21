# WineSnap 2.0 — Codex Product & Development Brief

## Objective

Evolve WineSnap from a wine scanner into a **personal AI sommelier with long-term memory, personalized recommendations, and social discovery**.

Core positioning:

> **Your personal AI sommelier that remembers your taste.**

The scanner remains an important acquisition and entry feature, but the differentiated value is that WineSnap learns the user's taste over time and can use that knowledge in conversation and recommendations.

## Core product loop

**Scan → Understand → Rate → Remember → Recommend → Ask → Discover**

Every meaningful interaction should either:
1. help WineSnap understand the user's taste better, or
2. help the user make a better wine decision.

Avoid generic social features or generic chatbot functionality that does not strengthen this loop.

---

## 1. Wine Memory

Wine Memory is the central product capability.

WineSnap must not merely store scan history. It should build a structured, inspectable, user-specific taste model.

### A. Explicit memory
Direct user statements, e.g.:
- “I like Amarone.”
- “This was too sweet.”
- “I prefer dry whites.”
- “I like noticeable oak.”
- “I dislike very acidic reds.”

### B. Observed memory
Behavioral signals:
- ratings
- favorites
- saved wines
- repeated producers/styles
- accepted recommendations
- dismissed recommendations
- purchases or re-selections if tracked

### C. Derived Taste Profile
Aggregate multiple signals into structured preferences such as:
- body
- acidity
- tannin
- sweetness
- oak
- fruit profile
- alcohol
- grape
- region
- style
- producer
- price range

Derived preferences must carry confidence/evidence and must not overfit to one interaction.

### D. Contextual memory
Taste can vary by situation:
- everyday wine
- restaurant
- steak/grill
- fish
- summer/winter
- gift
- price ceiling
- special occasion

Architecture should allow context-specific preferences.

### Memory provenance
Keep structured evidence where possible:
- source
- timestamp
- wine_id
- rating
- user statement
- extracted taste signal
- confidence

LLM output should not become permanent memory without structured extraction/aggregation.

Recommended pipeline:

User action/statement  
→ Extract preference signals  
→ Store evidence  
→ Assign confidence  
→ Aggregate with previous observations  
→ Update derived Taste Profile

---

## 2. My Wine Memory UX

Create a visible user-facing surface, e.g. **My Wine Memory**.

It should show what WineSnap currently believes, for example:
- You usually prefer full-bodied reds.
- You tend to like softer tannins.
- Rioja and Primitivo are among your highest-rated styles.
- You often rate highly acidic reds lower.
- Your usual everyday price range is €12–25.

Users should be able to:
- Confirm
- Correct
- Remove/Forget
- Tell WineSnap more

The goal is transparency and trust. Wine Memory must not feel like an opaque black box.

---

## 3. Feedback after drinking

Improve post-consumption feedback beyond a numeric rating.

Allow natural language such as:

> “I loved the fruitiness but it was a little too sweet.”

Extract structured signals, for example:
- overall_signal: positive
- fruitiness: liked
- sweetness: too_high
- confidence: medium

Store both the original feedback and structured signals.

---

## 4. Ask WineSnap — AI Chat

Add a central general-purpose wine AI chat.

It should answer both general wine questions and personalized questions.

General examples:
- What is the difference between Barolo and Brunello?
- What wine works with lamb?
- What does malolactic fermentation mean?

Personalized examples:
- Which Rioja would I probably like?
- Which Italian wines have I rated highest?
- Have I had something similar to this before?
- I want something new but close to my usual taste.
- What should I buy for steak under €25?
- Did I like Chianti last time?
- Which of these three bottles fits me best?

The AI should be able to use:
- wine knowledge
- current wine object
- Wine Memory
- Taste Profile
- ratings/history
- favorites
- social context where relevant

### Context-aware chat

Chat should know where the user opened it.

Examples:
- From a wine detail page: “Will I like this?”
- From compare: “Which one fits me best?”
- From history: “Which of these did I like most?”
- From social feed: “Would I like what Anna posted?”

Implement a generic structured context object rather than hard-coding each screen.

UX direction: assistant-style full-screen surface similar to Storytel Genie/Google-style assistants, with a personalized opening message and contextual quick actions.

Example opening:

> Welcome back. You’ve been rating fuller Italian reds highly recently, especially wines with softer tannins. Want something similar or something new?

Quick actions:
- Recommend a wine
- What fits me?
- For dinner tonight
- Surprise me

When opened from a wine:

> This looks fairly close to your usual taste: full-bodied, dark fruit, moderate tannin. What would you like to know?

Quick actions:
- Is it for me?
- Food pairing
- Compare
- Similar wines

---

## 5. Personalized recommendations

Recommendations should use:
- Taste Profile
- wine attributes
- previous ratings
- contextual intent
- price
- similar wines
- social signals

Always explain *why*.

Prefer confidence bands such as:
- Strong match
- Good match
- Outside your usual profile
- Not enough data yet

Avoid fake precision such as 93.7% unless the underlying model genuinely justifies it.

Start with deterministic/weighted matching for MVP. Design so it can later evolve into:
- embeddings
- collaborative filtering
- user similarity
- hybrid recommendation models

---

## 6. Compare wines

Allow 2+ wines to be compared against the user's Taste Profile.

Use cases:
- shelf decision in a store
- restaurant list
- saved wines

Question:
> Which one fits my taste best?

Return a transparent comparison and explain tradeoffs.

---

## 7. Social discovery

Social is for **inspiration and discovery**, not for building a generic social network.

Users should be able to:
- follow people
- see wines they drink
- see ratings / short notes
- save wines from others
- discover users with similar taste

Personalize social signals:
- “Three people you follow liked this.”
- “Anna rated this highly, and your taste profiles are similar.”
- “Popular among users with taste preferences similar to yours.”

Taste similarity should require adequate evidence and degrade gracefully when data is sparse.

---

## 8. Discover

Build personalized discovery modules such as:
- Because you liked X
- Similar to your recent favorites
- Popular with people who have similar taste
- New wines slightly outside your usual profile
- Trending among people you follow
- Recommended for you this week

Discover should become materially better as Wine Memory grows.

---

## 9. Restaurant / Menu Mode

Later phase:

Photo/ingest a wine list, extract candidate wines and combine with user taste and constraints.

Examples:
- Which one fits me best?
- Best with steak?
- Best option under €30?
- Give me three options close to my taste.

---

## 10. Monetization

Freemium.

### Free
- scanning
- basic wine information
- ratings
- favorites
- history
- basic Wine Memory
- basic Taste Profile
- limited AI questions

The free tier must let users experience WineSnap learning them.

### Pro
Monetize the intelligence layered on top of memory:
- full Ask WineSnap chat
- deep Wine Memory
- advanced Taste Profile
- personalized recommendations
- Compare
- menu analysis
- advanced social discovery
- richer explanations
- higher/unlimited AI usage

Pricing can be tested later; initial hypothesis:
- €3.99–4.99/month
- €29.99–39.99/year

Do not position Pro merely as “AI chat”. Position it as a personal sommelier that knows the user.

---

## 11. Technical boundaries

Keep these concerns separate:

### Wine knowledge
Facts about wine:
- producer
- vintage
- region
- grape
- appellation
- tasting/style attributes

### User memory
Raw/structured facts and signals about the user.

### Derived preferences
Aggregated conclusions backed by evidence.

### Conversational context
What the user is asking about right now.

Do not merge these into one free-text prompt store.

### Memory quality
The LLM must not freely hallucinate permanent preferences.

Prefer structured extraction, confidence, evidence counts, recency weighting and provenance.

Taste changes over time; architecture should allow recent signals to have higher weight without erasing older history.

---

## 12. MVP phases

### Phase 1 — Memory foundation
- structured Taste Profile
- taste/preference signals
- ratings + natural-language feedback
- derived preferences
- confidence/evidence
- My Wine Memory UI
- correction/removal controls

### Phase 2 — Ask WineSnap
- AI chat
- wine knowledge grounding
- user memory retrieval
- current-screen context injection
- conversation storage
- usage limits/entitlements

### Phase 3 — Personalized recommendations
- weighted match engine
- rationale/explanations
- similar wines
- Compare wines

### Phase 4 — Social discovery
- following/feed improvements
- user taste similarity
- social recommendation signals
- personalized Discover

### Phase 5 — Restaurant/menu mode
- image/menu ingestion
- wine extraction/matching
- price + food + personal taste constraints

---

## 13. Codex task

**Do not start implementation immediately.**

First inspect the existing WineSnap repository and produce a concrete implementation plan based on the current architecture.

The plan should include:

1. Current architecture assessment
   - frontend
   - backend
   - database
   - auth
   - scan pipeline
   - wine data model
   - current AI integrations
   - social functionality
   - subscriptions/paywall
   - deployment/analytics

2. Reusable existing functionality vs missing infrastructure.

3. Proposed architecture for:
   - Wine Memory
   - Taste Profile
   - preference extraction
   - AI chat
   - context injection
   - recommendation engine
   - social taste similarity
   - entitlements/paywall

4. Concrete database/schema changes.

Potential concepts (adapt names to existing architecture):
- wine_interactions
- wine_ratings
- taste_signals
- taste_profiles
- explicit_memories
- derived_preferences
- user_similarity
- ai_conversations
- recommendation_events

5. AI architecture:
   - prompt inputs
   - retrieval strategy
   - structured vs free-text data
   - deterministic logic vs LLM calls
   - caching
   - latency
   - token/cost controls
   - evaluation strategy

6. API changes:
   - endpoints
   - request/response shapes
   - auth/privacy

7. Frontend changes:
   - navigation
   - Ask WineSnap
   - My Wine Memory
   - feedback flow
   - Discover
   - contextual quick actions

8. Migration strategy that preserves existing users/data.

9. A phased implementation sequence with dependencies, backend/frontend/database/AI/testing work per phase.

10. Risks and mitigations:
   - hallucinated preferences
   - weak memory quality
   - insufficient wine metadata
   - cold start
   - AI cost/latency
   - privacy/access control
   - social sparsity
   - recommendation quality

11. Testing:
   - unit
   - integration
   - AI evals
   - memory correctness
   - recommendation quality
   - regression
   - access-control/privacy

12. Metrics:
   - scans/user
   - ratings/user
   - memory depth
   - AI questions
   - recommendation clicks/saves
   - recommendation acceptance
   - retention
   - Pro conversion

## Long-term experience target

After 10 wines, WineSnap has started learning the user.

After 30 wines, recommendations are meaningfully personalized.

After 100 wines, WineSnap should feel like a personal sommelier that remembers years of wine experiences.

Target user reaction:

> **“WineSnap knows my wine taste better than I can describe it myself.”**
