# OpenClaw Public Site Snapshot

Date: 2026-03-11
Source: https://openclaw.ai
Capture method: fetched public homepage HTML and reduced it to visible headings, navigation labels, calls to action, and repeated capability themes.

## Why this exists

This snapshot is a dated reference for the Cognitive AI public-site redesign. It is not intended for copy reuse. It captures structure, messaging patterns, and information architecture that informed the homepage and docs work.

## Top-level positioning observed

- OpenClaw presents itself as a personal AI assistant that can take actions, not just answer questions.
- The homepage leads with outcome-oriented messaging rather than technical architecture.
- The product is framed as chat-native, always-on, and connected to the user’s actual environment.

## Information architecture observed

## 1. Hero

- Strong one-line positioning focused on action and delegation.
- Immediate examples of high-value tasks such as inbox, email, calendar, and travel operations.
- Emphasis that the interface works through familiar chat surfaces.

## 2. Social proof near the top

- Large volume of public testimonials is surfaced very early.
- Testimonials reinforce a few repeated themes:
  - persistent memory
  - integration breadth
  - on-device or user-controlled context
  - proactive background work
  - extensibility through skills/plugins

## 3. Capability framing

- The site repeatedly returns to a small set of product pillars:
  - it can remember
  - it can use tools
  - it can operate continuously
  - it can connect to communication channels
  - it can be extended by users

## 4. Control and ownership narrative

- Strong emphasis on open source, hackability, and user ownership.
- The product is positioned against closed or walled-garden assistants.
- Messaging suggests the assistant runs in the user’s environment and can be adapted deeply.

## 5. Ecosystem / community cues

- Repeated references to skills, plugins, contributors, and community momentum.
- The site uses examples and testimonials to imply a growing ecosystem rather than relying only on a product-spec explanation.

## 6. Conversion surfaces

- The page pushes toward getting started, exploring docs/community, or seeing examples of what the assistant can do.
- The narrative is experiential first and technical second.

## Practical takeaways for Cognitive AI

- Lead with operator and enterprise outcomes before implementation details.
- Keep the public homepage distinct from the operator console.
- Treat docs as a first-class public surface, not an afterthought hidden behind the product.
- Show platform pillars clearly: personas, policy, memory, audit, budgets, and service controls.
- Use product trust signals without overloading the page with testimonial volume.
- Preserve an opinionated, technical visual identity while keeping the first screen readable by non-engineers.

## What we changed in response

- Moved the authenticated operator interface off the root route and onto `/control-plane`.
- Turned `/` into a public marketing homepage.
- Turned `/docs` into a public documentation hub generated from the repo docs.
- Added sitemap and robots output so the public surface behaves like a real product site.
