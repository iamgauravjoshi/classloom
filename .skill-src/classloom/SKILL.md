---
name: classloom
description: Project-specific instructions and development conventions for the Classloom application.
---

# Classloom

> A capability and execution guide for designers, developers, and AI agents building polished SaaS products, AI interfaces, dashboards, and modern marketing websites.
>
> This file is intended to be used alongside `DESIGN.md`.
>
> - `DESIGN.md` defines **the design standard**.
> - `SKILLS.md` defines **the capabilities required to reach that standard**.
>
> The philosophy combines two complementary strengths:
>
> 1. **Strong visual direction and presentation** — memorable compositions, confident typography, strong hierarchy, attractive product framing, and polished marketing presentation.
> 2. **Production product thinking** — real data, real states, component systems, responsive behavior, information density, implementation discipline, and interaction quality.
>
> The objective is not to copy a designer's visual style.
>
> The objective is to build the judgment needed to repeatedly produce excellent work.

---

# 0. Operating Principle

A high-quality digital designer must be able to think simultaneously as:

- a user;
- a product manager;
- an information architect;
- a visual designer;
- an interaction designer;
- a frontend engineer;
- an accessibility reviewer;
- a conversion strategist;
- a systems designer;
- a quality-assurance engineer.

Great interfaces happen when these skills reinforce each other.

Do not optimize for screenshots alone.

Optimize for:

```txt
Clarity
+ usefulness
+ visual identity
+ interaction quality
+ production realism
+ implementation quality
= excellent digital product
```

---

# 1. Skill Priority Model

Use this hierarchy when developing design capability.

```txt
LEVEL 1 — Product understanding
LEVEL 2 — Information architecture
LEVEL 3 — Interaction design
LEVEL 4 — Visual hierarchy
LEVEL 5 — Design systems
LEVEL 6 — Responsive behavior
LEVEL 7 — Implementation
LEVEL 8 — Motion and polish
LEVEL 9 — Presentation and storytelling
```

Do not compensate for weak Level 1–4 skills with Level 8 polish.

A beautiful interface with poor information architecture is still poor design.

---

# 2. Product Thinking

## Required Capability

Before designing, understand:

- who the user is;
- what they are trying to accomplish;
- how frequently they perform the task;
- what information they need;
- what decisions they need to make;
- what can go wrong;
- what business outcome the interface supports;
- what technical constraints exist.

## Designer Questions

Before opening Figma or writing frontend code, answer:

```txt
Who is this for?
What job are they trying to complete?
What is the primary action?
What information is required before acting?
What is urgent?
What can be deferred?
What mistakes are expensive?
What states can exist?
What happens after success?
```

## Required Outputs

For non-trivial products, produce at least:

- primary user goal;
- key jobs-to-be-done;
- critical flows;
- information hierarchy;
- state inventory;
- primary and secondary actions.

---

# 3. Research Skill

Research is not collecting screenshots.

Research should identify:

- user expectations;
- domain vocabulary;
- common workflows;
- competitor conventions;
- trust requirements;
- data structures;
- industry constraints;
- opportunities for differentiation.

## Competitive Review Framework

For each relevant product, inspect:

```txt
Navigation
Information architecture
Primary workflow
Data density
Search/filter behavior
Onboarding
Empty states
Error handling
Mobile behavior
Visual language
Conversion flow
Pricing presentation
Trust signals
```

Then classify findings as:

```txt
Convention — users expect this.
Strength — competitor does this well.
Weakness — opportunity to improve.
Noise — visual trend with little user value.
Opportunity — useful differentiation.
```

Do not copy competitor layouts without understanding why they exist.

---

# 4. Information Architecture

High-end interfaces feel simple because complexity was organized before styling.

Required skills:

- grouping;
- labeling;
- prioritization;
- hierarchy;
- progressive disclosure;
- navigation architecture;
- workflow sequencing.

## Rules

A user should understand:

1. where they are;
2. what they can do;
3. what matters most;
4. where related information lives.

## Navigation Skill

Be able to choose between:

- sidebar;
- top navigation;
- tabs;
- segmented control;
- breadcrumbs;
- command menu;
- bottom navigation;
- nested navigation;
- master-detail layout.

Choose based on information structure, not fashion.

---

# 5. Wireframing

Wireframes should solve hierarchy before aesthetics.

A good wireframe validates:

- reading order;
- task priority;
- action placement;
- data density;
- navigation;
- screen relationships;
- content quantity.

Do not add polish before the layout survives realistic content.

## Wireframe Checklist

- [ ] Main goal is visible.
- [ ] Primary CTA is identifiable.
- [ ] Important content appears early.
- [ ] Secondary content is clearly secondary.
- [ ] Navigation is understandable.
- [ ] Realistic content is represented.
- [ ] Empty/error/loading states have a place.
- [ ] Mobile behavior is plausible.

---

# 6. Visual Hierarchy

Visual hierarchy is one of the highest-value skills in modern digital design.

Control hierarchy through:

```txt
Position
Scale
Spacing
Typography
Contrast
Color
Depth
Motion
```

Use these deliberately.

## Focal Point Skill

Every major section needs a visual priority.

Examples:

- hero headline;
- product preview;
- KPI;
- chart;
- workflow;
- CTA;
- testimonial;
- pricing plan.

Avoid three equally dominant elements fighting for attention.

---

# 7. Typography

Excellent contemporary interfaces are heavily typography-driven.

A designer should understand:

- type scale;
- line height;
- tracking;
- font weight;
- text measure;
- optical hierarchy;
- numeric typography;
- responsive type;
- display vs utility typography.

## Product UI Skill

Product interfaces require:

- highly readable body text;
- compact labels;
- clear numeric hierarchy;
- predictable font weights;
- strong small-size rendering.

## Marketing Skill

Marketing interfaces may use:

- editorial display typography;
- very large headlines;
- tighter line heights;
- controlled line breaks;
- expressive type pairings.

Do not sacrifice reading speed for style.

## Advanced Skill

Learn to use:

- variable font axes;
- tabular numerals;
- contextual alternates;
- optical sizing;
- responsive `clamp()` typography.

---

# 8. Color Design

Required understanding:

- neutral palette construction;
- brand accents;
- semantic colors;
- contrast;
- light/dark surfaces;
- chart palettes;
- state colors.

## Strong Contemporary Pattern

A reliable default:

```txt
Neutral foundation
+ one strong brand accent
+ semantic colors
+ occasional expressive highlight
```

This produces greater sophistication than using many saturated colors.

## Avoid

- rainbow dashboards;
- arbitrary gradients;
- weak gray text;
- color-only state communication;
- excessive neon;
- unnecessary background tinting.

---

# 9. Spacing & Composition

Spacing is part of hierarchy.

Required skills:

- rhythm;
- proximity;
- grouping;
- negative space;
- density control;
- consistent page margins;
- internal component spacing.

Use a spacing system rather than visual guessing.

## Key Concept

Use whitespace to separate concepts.

Use density to connect related information.

Good product design needs both.

---

# 10. Grid Systems

A designer should understand:

- 4px/8px spacing systems;
- 12-column marketing grids;
- app-shell layouts;
- nested grids;
- responsive columns;
- content max-widths;
- full-width data layouts.

## Advanced Skill

Be able to break the grid intentionally.

Asymmetric layouts can create excellent marketing compositions, but only after basic alignment is strong.

---

# 11. Component Design

High-end products require reusable components.

Required skills:

- anatomy;
- states;
- variants;
- sizing;
- composition;
- content constraints;
- responsive behavior.

## Every Component Should Define

```txt
Purpose
Anatomy
Variants
Sizes
States
Spacing
Content rules
Interaction behavior
Responsive behavior
Accessibility
```

## Important Components to Master

- buttons;
- inputs;
- selects;
- comboboxes;
- date pickers;
- dropdowns;
- tabs;
- tables;
- cards;
- navigation;
- breadcrumbs;
- dialogs;
- sheets;
- popovers;
- tooltips;
- toast notifications;
- pagination;
- search;
- filter controls;
- command palettes.

---

# 12. Design Systems

A strong designer should be able to construct a small design system before building dozens of screens.

Required layers:

```txt
Primitives
→ semantic tokens
→ components
→ patterns
→ page templates
```

## Token Skills

Understand:

- color tokens;
- spacing tokens;
- type tokens;
- radius tokens;
- border tokens;
- elevation tokens;
- breakpoint tokens;
- animation tokens.

Avoid arbitrary values.

---

# 13. State Design

This is one of the biggest differences between portfolio design and production design.

Every meaningful feature should consider:

```txt
Default
Hover
Focus
Pressed
Selected
Disabled
Loading
Empty
Error
Success
Partial data
No permission
Offline
Stale data
```

A mature designer asks about states while creating the primary screen, not after it.

---

# 14. Dashboard Design

High-quality dashboard design requires more than arranging KPI cards.

Required skills:

- metric prioritization;
- trend analysis;
- filters;
- tables;
- alerts;
- date ranges;
- data hierarchy;
- drill-down;
- comparison;
- exception handling.

## Core Dashboard Question

Ask:

> What decision should this information help the user make?

If a widget does not support a decision, task, or understanding, remove it.

---

# 15. Data Visualization

Learn when to use:

```txt
Line chart       → trends over time
Bar chart        → category comparison
Stacked bar      → composition across categories
Area chart       → magnitude over time
Scatter plot     → relationship/correlation
Heatmap          → patterns across dimensions
Table            → exact values / operational data
KPI              → one critical number
```

## Required Chart Skills

- scale choice;
- axis treatment;
- labeling;
- units;
- date ranges;
- comparison periods;
- accessibility;
- tooltip design;
- responsive simplification.

Do not use charts as decoration.

---

# 16. Table Design

Master tables if you want to design serious SaaS products.

Skills include:

- column prioritization;
- numeric alignment;
- status presentation;
- row selection;
- bulk actions;
- sorting;
- filtering;
- sticky headers;
- pagination;
- virtualization;
- inline editing;
- responsive handling.

Tables are frequently more useful than dashboards full of cards.

---

# 17. Forms

Required form-design skills:

- labeling;
- grouping;
- validation;
- error recovery;
- defaults;
- autofill;
- progressive disclosure;
- conditional fields;
- confirmation;
- destructive-action handling.

## Great Form Principle

Reduce decisions that do not need to be decisions.

Use:

- sensible defaults;
- remembered preferences;
- inferred values;
- inline validation;
- clear examples.

---

# 18. Search & Filters

Modern applications often live or die by retrieval UX.

Master:

- global search;
- local search;
- autocomplete;
- fuzzy matching;
- filters;
- faceted filters;
- saved views;
- query state;
- recent searches;
- command palettes.

Advanced products should preserve search/filter state where useful.

---

# 19. SaaS Product Design

A strong SaaS designer should be comfortable designing:

- dashboard;
- onboarding;
- billing;
- team management;
- authentication;
- permissions;
- integrations;
- settings;
- notifications;
- usage;
- plans;
- audit history;
- API keys;
- upgrade paths.

Do not design only the glamorous dashboard.

---

# 20. AI Product Design

AI interfaces require specific judgment.

Required understanding:

- model uncertainty;
- latency;
- context;
- streaming output;
- human review;
- citations;
- undo;
- regeneration;
- editing;
- cost/usage;
- privacy;
- permissions.

## Interaction Skill

Do not assume every AI feature needs chat.

Choose:

```txt
Chat
Composer
Command bar
Inline suggestion
Structured generator
Agent builder
Review queue
Diff viewer
Autofill
Background workflow
Research interface
```

based on the task.

## AI Trust Design

Clearly communicate:

- what the system is doing;
- what information was used;
- whether output is final;
- whether an action has been executed;
- how to review or undo;
- where uncertainty exists.

---

# 21. Marketing Website Design

High-end marketing design requires a different mindset from application UI.

Required skills:

- positioning;
- conversion;
- storytelling;
- art direction;
- content sequencing;
- typography;
- product framing;
- social proof;
- CTA strategy.

## Website Story Skill

A page should answer questions in approximately this order:

```txt
What is this?
Is it for me?
Why should I care?
How does it work?
Can I trust it?
What proof exists?
How is it different?
What should I do next?
```

Do not build a page by stacking random trendy sections.

---

# 22. Hero Design

Master hero sections.

A strong hero usually combines:

```txt
Strong positioning
+ short supporting copy
+ obvious CTA
+ visual evidence
+ credibility
```

Possible hero styles:

- product screenshot;
- interactive product preview;
- editorial type composition;
- abstract branded visual;
- customer result;
- diagram;
- demo video.

Choose the format that proves the claim.

---

# 23. Art Direction

This is where good websites become memorable.

Art direction requires intentional decisions about:

- typography;
- scale;
- imagery;
- cropping;
- color;
- composition;
- texture;
- illustration;
- motion;
- pacing.

## Rule

One strong visual idea beats ten weak visual tricks.

Examples of a strong idea:

- oversized editorial typography;
- a distinctive data visualization language;
- a monochrome product world with one vivid accent;
- unusual but controlled image cropping;
- a recognizable illustration system;
- precise motion behavior.

---

# 24. Product Presentation

Visual presentation is a separate skill from product design.

Master:

- browser framing;
- device framing;
- screenshot hierarchy;
- cropping;
- shadows;
- background treatment;
- contextual mockups;
- before/after comparison.

## Rule

The product UI must remain readable.

Never let the presentation become louder than the product.

---

# 25. Case Study Storytelling

A strong case study explains decisions, not only deliverables.

Recommended structure:

```txt
Problem
Users
Constraints
Evidence
Information architecture
Design decisions
System
Key screens
States
Responsive behavior
Outcome
What changed / what was learned
```

Avoid:

```txt
Research
Wireframes
UI
Thanks for scrolling
```

without meaningful insight.

---

# 26. Responsive Design

Required skills:

- reflow;
- prioritization;
- content reduction;
- navigation transformation;
- touch targets;
- responsive type;
- container queries;
- adaptive data visualization.

Mobile should be redesigned, not merely stacked.

## Responsive Question

For every region ask:

> What becomes more important when the screen becomes smaller?

Use the answer to determine what survives.

---

# 27. Mobile Product Design

Master:

- bottom navigation;
- thumb reach;
- sheets;
- mobile search;
- mobile filters;
- virtual keyboards;
- safe areas;
- gesture conflicts;
- compact charts;
- table adaptation;
- sticky CTAs.

Design with real device dimensions and content.

---

# 28. Interaction Design

Interaction design skills include:

- feedback;
- causality;
- affordance;
- selection;
- focus;
- hierarchy changes;
- drag/drop;
- undo;
- optimistic UI;
- progressive disclosure.

## Feedback Rule

Every action should clearly result in one of:

```txt
Success
Failure
Progress
Changed state
Navigation
```

Never leave users wondering whether a click worked.

---

# 29. Motion Design

Motion is useful when it communicates.

Learn:

- easing;
- duration;
- stagger;
- shared-element transitions;
- transform;
- opacity;
- layout animation;
- spring behavior.

Use motion for:

- opening/closing;
- focus;
- state change;
- navigation;
- hierarchy;
- feedback.

Avoid constant decorative motion.

---

# 30. Accessibility

A professional designer needs practical accessibility knowledge.

Required skills:

- contrast;
- focus states;
- semantic hierarchy;
- keyboard navigation;
- screen-reader labels;
- target sizes;
- motion reduction;
- error messaging;
- form accessibility.

Understand WCAG AA basics.

Do not treat accessibility as an optional QA phase.

---

# 31. Content Design

Interfaces are partly language systems.

Learn:

- labels;
- button copy;
- helper text;
- empty-state copy;
- error messages;
- confirmation copy;
- onboarding instructions;
- headings.

Good copy reduces UI complexity.

Prefer:

```txt
Create invoice
```

over:

```txt
Continue
```

when the resulting action is known.

---

# 32. Frontend Engineering Literacy

Modern designers should understand implementation.

At minimum understand:

- HTML semantics;
- CSS layout;
- Flexbox;
- Grid;
- responsive CSS;
- tokens;
- component architecture;
- state;
- data loading;
- frontend performance.

A designer does not need to be a senior engineer, but should know what is cheap, expensive, brittle, and reusable.

---

# 33. Ideal Frontend Stack Skills

For contemporary web products, become comfortable with:

```txt
HTML
CSS
JavaScript / TypeScript
React
Next.js
Tailwind CSS or equivalent tokenized CSS
Component libraries
Storybook
Git
```

Useful additional skills:

```txt
Framer Motion / Motion
GSAP where justified
D3 / Recharts / ECharts
Radix primitives
shadcn/ui
React Aria
CSS variables
Figma variables
```

Tools are secondary to fundamentals.

Do not let a component library determine your product's identity.

---

# 34. Semantic HTML

Understand and use:

```txt
header
nav
main
section
article
aside
footer
button
form
label
table
dialog
```

Do not build interactive interfaces from nested generic `<div>` elements.

Semantic structure improves:

- accessibility;
- keyboard behavior;
- maintainability;
- SEO;
- developer understanding.

---

# 35. CSS Layout Skill

Be excellent at:

- Flexbox;
- Grid;
- intrinsic sizing;
- `minmax`;
- `clamp`;
- `aspect-ratio`;
- sticky positioning;
- overflow;
- logical properties;
- fluid spacing.

Do not hardcode pixel positions to recreate a screenshot.

---

# 36. Component Engineering

High-quality visual design requires high-quality component architecture.

Components should avoid:

- dozens of boolean props;
- embedded one-off styling;
- hidden layout assumptions;
- uncontrolled spacing;
- arbitrary variants.

Prefer composable APIs.

Example conceptual pattern:

```txt
Card
  CardHeader
  CardTitle
  CardDescription
  CardContent
  CardFooter
```

rather than a giant card component controlling everything.

---

# 37. Design-to-Code Fidelity

Fidelity does not mean copying pixels blindly.

Preserve:

- visual hierarchy;
- rhythm;
- alignment;
- typography;
- responsive intent;
- interaction behavior;
- states.

Implementation MAY adapt exact spacing when required for performance or content, provided the design intent survives.

---

# 38. Performance

Premium websites must also be fast.

Required understanding:

- Core Web Vitals;
- image optimization;
- font loading;
- JS bundle size;
- hydration;
- lazy loading;
- video cost;
- animation cost.

## Rule

Do not spend performance budget on decoration before core content.

---

# 39. Image Direction

Learn how to choose and use imagery.

Skills:

- photography selection;
- crop selection;
- focal-point placement;
- contrast management;
- art direction;
- responsive image variants;
- overlays.

Avoid meaningless stock imagery.

For product businesses, product evidence is often stronger than decorative photography.

---

# 40. Icons

Use iconography systematically.

Understand:

- optical alignment;
- stroke weight;
- fill vs stroke;
- sizing;
- metaphor clarity;
- visual consistency.

Do not mix multiple icon languages.

---

# 41. Illustration

Illustration should strengthen brand character or explain concepts.

A system should define:

- geometry;
- line weight;
- palette;
- perspective;
- shadows;
- complexity;
- subject matter.

Avoid random one-off illustrations from unrelated libraries.

---

# 42. Brand Integration

Product UI should feel like the brand without becoming a marketing poster.

Good places for brand personality:

- accent color;
- typography;
- illustration;
- motion;
- empty states;
- onboarding;
- special moments.

Routine operational controls should remain predictable.

---

# 43. Conversion Design

For marketing and SaaS acquisition flows, understand:

- CTA hierarchy;
- friction;
- proof;
- risk reduction;
- pricing psychology;
- trust;
- onboarding path.

Do not optimize conversion by manipulating users.

Clear value + low friction + trust is the preferred approach.

---

# 44. Pricing UX

Good pricing design explains:

- what changes by tier;
- billing frequency;
- limits;
- overages;
- cancellation;
- trial;
- recommended customer type.

Do not obscure meaningful differences.

---

# 45. Trust Design

Trust is particularly important in:

- finance;
- healthcare;
- enterprise software;
- AI;
- security products.

Trust comes from:

- clear language;
- consistency;
- accurate data;
- explicit states;
- auditability;
- provenance;
- predictable controls.

Visual polish alone does not create trust.

---

# 46. Enterprise UX

Enterprise design requires comfort with complexity.

Skills include:

- permissions;
- role management;
- bulk actions;
- tables;
- audit logs;
- filters;
- saved views;
- multi-step workflows;
- high information density.

Do not blindly simplify away information expert users need.

---

# 47. Empty States

A good empty state helps users progress.

Required elements:

```txt
State explanation
Context
Recommended action
Optional educational help
```

Do not fill empty states with giant decorative illustrations unless they support understanding.

---

# 48. Error Handling

Design errors for recovery.

Consider:

- field error;
- request error;
- offline;
- permission;
- server error;
- partial failure;
- destructive-operation failure.

Users should know:

```txt
What happened?
Did anything save?
What can I do?
```

---

# 49. Loading Design

Choose loading behavior based on duration and layout.

Options:

- immediate optimistic update;
- spinner;
- skeleton;
- progressive content;
- background state;
- inline status.

Avoid skeletons that look nothing like the final content.

---

# 50. Onboarding

Great onboarding minimizes time-to-value.

Master:

- first-run states;
- setup checklists;
- sample data;
- guided actions;
- contextual hints;
- invitations/imports.

Avoid forcing users through educational tours before they can use the product.

---

# 51. Detail Orientation

High-end visual quality depends on many small decisions.

Review:

- alignment;
- icon baseline;
- number formatting;
- corner radii;
- divider strength;
- line heights;
- button heights;
- label spacing;
- chart padding;
- truncation;
- hover behavior;
- focus rings.

The difference between “good” and “excellent” is often 50 small corrections.

---

# 52. Visual Restraint

One of the most important advanced skills is knowing what not to add.

Before adding:

- gradient;
- shadow;
- blur;
- animation;
- icon;
- illustration;
- badge;
- border;
- card;

ask:

> What problem does this solve?

If the answer is only “it looks cooler,” use it sparingly.

---

# 53. Avoiding Generic AI Design

AI-generated web UI often overuses:

- purple/blue gradients;
- giant rounded cards;
- glowing borders;
- glassmorphism;
- repeated feature-card grids;
- meaningless metrics;
- giant hero mockups;
- overlong copy;
- random pills.

## Cleanup Skill

When handed generic output:

1. remove 30–50% of decoration;
2. improve typography;
3. fix hierarchy;
4. reduce card count;
5. normalize spacing;
6. use real content;
7. add real states;
8. improve responsive logic;
9. add one distinctive visual idea.

---

# 54. Signature Style Development

Do not copy another designer's signature.

Develop your own combination of:

```txt
Typography
Color
Spacing
Layout
Illustration
Charts
Motion
Iconography
Image treatment
```

Choose 1–3 areas where your work becomes recognizable.

Keep usability conventional where convention benefits users.

---

# 55. Trend Awareness

Know trends, but do not automatically adopt them.

Examples:

- bento grids;
- glassmorphism;
- kinetic typography;
- oversized type;
- 3D;
- grain;
- dark mode;
- neo-brutalism;
- spatial interfaces.

Evaluate trends using:

```txt
Does it serve the brand?
Does it improve hierarchy?
Will it age well?
Can it be implemented efficiently?
Does it hurt accessibility?
```

---

# 56. Figma Skills

A high-level Figma workflow should include:

- auto layout;
- components;
- component properties;
- variants;
- variables;
- modes;
- styles;
- grids;
- prototyping;
- interactive components;
- Dev Mode;
- libraries.

## File Hygiene

Use:

- meaningful page names;
- meaningful component names;
- consistent sections;
- clean layers;
- reusable variables;
- documented components.

Do not hand developers a 2,000-layer artboard with `Frame 286`.

---

# 57. Prototyping

Prototype when behavior is easier to understand by experiencing it.

Useful for:

- navigation;
- complex form flows;
- drag/drop;
- transitions;
- AI interactions;
- responsive behavior;
- onboarding;
- modal/sheet logic.

Do not prototype static content merely to create presentation theater.

---

# 58. Developer Handoff

A designer should communicate:

- state behavior;
- responsive behavior;
- token usage;
- component variants;
- validation;
- transitions;
- content constraints.

Do not make developers reverse-engineer intent from screenshots.

---

# 59. QA Skill

Designers should review the actual build.

Inspect:

- typography;
- spacing;
- colors;
- breakpoints;
- truncation;
- states;
- keyboard;
- accessibility;
- motion;
- content overflow.

Do not consider the work complete at handoff.

---

# 60. Browser Testing

At minimum test:

```txt
Chrome
Safari
Firefox
```

Test common viewport widths and intermediate widths.

Check:

- sticky positioning;
- viewport units;
- forms;
- overflow;
- font rendering;
- motion;
- touch behavior.

---

# 61. Content Stress Testing

Before shipping, test content such as:

```txt
A
Alexandria Catherine Montgomery-Smith
$0
$9,948,234,992.17
-38.72%
100%
0 results
12,485 results
Extremely long table values
Missing image
Missing avatar
Unknown value
Multiline titles
Long localization strings
```

Production UI must survive inconvenient reality.

---

# 62. Design Critique

Learn to critique objectively.

Use:

```txt
Goal
Evidence
Problem
Impact
Recommendation
```

Example:

Bad critique:

> This card looks weird.

Better critique:

> The primary metric competes with the chart title because both use the same weight and contrast. Reduce the title weight and increase metric prominence.

Critique behavior, hierarchy, and consequence.

---

# 63. Self-Review Framework

Before presenting work, review at three distances.

## 3-Second Review

Can I identify:

- purpose;
- focal point;
- primary action?

## 30-Second Review

Can I understand:

- hierarchy;
- structure;
- main workflow?

## 5-Minute Review

Does it survive:

- real data;
- states;
- responsive behavior;
- interaction;
- accessibility?

---

# 64. Portfolio Presentation Skill

For each project, present:

```txt
1. Strong cover
2. Problem
3. Design direction
4. Core flow
5. Key screens
6. Responsive/mobile
7. System/components
8. Edge states
9. Outcome
```

Keep screenshots large.

Do not bury design behind decorative mockups.

---

# 65. Website Implementation Workflow

Recommended workflow for a premium website:

```txt
Research
↓
Content strategy
↓
Page architecture
↓
Wireframe
↓
Visual direction
↓
Design system
↓
Desktop design
↓
Responsive design
↓
Prototype
↓
Frontend implementation
↓
Motion
↓
Accessibility
↓
Performance
↓
QA
```

Do not jump directly from prompt to code.

---

# 66. Product Implementation Workflow

Recommended workflow for software:

```txt
User goal
↓
Data model
↓
Critical flows
↓
Information architecture
↓
Low-fidelity screens
↓
State matrix
↓
Component system
↓
High-fidelity UI
↓
Responsive rules
↓
Frontend architecture
↓
API/state integration
↓
Accessibility
↓
Testing
↓
QA
```

---

# 67. AI Agent Workflow

When an AI agent is asked to design or build a website, it SHOULD:

1. read `DESIGN.md`;
2. read `SKILLS.md`;
3. identify product type;
4. identify primary audience;
5. identify primary outcome;
6. define page/screen architecture;
7. define design direction;
8. define tokens;
9. build reusable primitives;
10. build the page;
11. add responsive behavior;
12. add states;
13. test content;
14. audit accessibility;
15. audit performance;
16. run a visual cleanup pass.

The AI MUST NOT immediately generate a giant page before determining hierarchy.

---

# 68. AI Agent Design Brief Template

Before implementation, internally establish:

```txt
Product:
Audience:
Primary job:
Primary CTA:
Secondary CTA:
Visual personality:
Brand accent:
Typography direction:
Content density:
Primary proof:
Main sections:
Responsive risks:
Accessibility risks:
Performance risks:
```

This prevents generic output.

---

# 69. Skill Matrix

Use this to evaluate capability.

Score each skill from 1–5.

```txt
1 = Beginner
2 = Basic
3 = Competent
4 = Strong
5 = Expert
```

| Skill                    | Target |
| ------------------------ | -----: |
| Product thinking         |      5 |
| Information architecture |      5 |
| Wireframing              |      4 |
| Visual hierarchy         |      5 |
| Typography               |      5 |
| Color                    |      4 |
| Spacing/composition      |      5 |
| Design systems           |      5 |
| Components               |      5 |
| State design             |      5 |
| Dashboard UX             |      4 |
| Data visualization       |      4 |
| Table design             |      4 |
| Forms                    |      4 |
| SaaS UX                  |      5 |
| AI UX                    |      4 |
| Marketing design         |      5 |
| Art direction            |      5 |
| Responsive design        |      5 |
| Mobile UX                |      4 |
| Interaction design       |      5 |
| Motion                   |    3–4 |
| Accessibility            |      4 |
| Content design           |      4 |
| HTML/CSS                 |      5 |
| JavaScript/TypeScript    |    3–4 |
| React                    |      4 |
| Performance              |      4 |
| Developer handoff        |      5 |
| QA                       |      5 |
| Presentation             |      5 |

The strongest designers are T-shaped:

- deep visual/product expertise;
- enough engineering knowledge to make designs real.

---

# 70. Ideal Learning Sequence

If developing these skills from scratch, learn in this order.

## Phase 1 — Fundamentals

Learn:

- hierarchy;
- typography;
- spacing;
- color;
- grids;
- layout.

Practice by reproducing excellent interfaces.

Do not publish copies as original work.

## Phase 2 — Product UX

Learn:

- flows;
- IA;
- forms;
- tables;
- dashboards;
- navigation;
- states.

## Phase 3 — Systems

Learn:

- tokens;
- components;
- variants;
- design systems;
- Figma variables.

## Phase 4 — Frontend

Learn:

- HTML;
- CSS;
- responsive design;
- JavaScript;
- React;
- component architecture.

## Phase 5 — Art Direction

Learn:

- editorial typography;
- composition;
- image direction;
- motion;
- branding.

## Phase 6 — Production

Learn:

- accessibility;
- performance;
- QA;
- analytics;
- experimentation.

---

# 71. Daily Practice Exercises

Useful exercises:

```txt
Redesign one ugly SaaS screen.
Reduce a screen's visual noise by 30%.
Create three typography directions for one hero.
Design one table with 20 realistic columns.
Create empty/loading/error states for one flow.
Rebuild one beautiful screen in HTML/CSS.
Create desktop + mobile versions of the same page.
Explain every chart in one dashboard.
Build one component with all states.
Critique one interface using objective reasoning.
```

Practice decisions, not only screenshots.

---

# 72. Weekly Design Challenge

Once per week, choose one product category:

```txt
AI
Fintech
CRM
IoT
Healthcare
E-commerce
Analytics
Developer tool
Project management
Cybersecurity
```

Create:

```txt
1 marketing hero
1 application screen
1 data-heavy screen
1 mobile screen
1 state variation
1 component specification
```

This prevents becoming good only at one type of screen.

---

# 73. Reference Collection Skill

Build a reference library categorized by:

- typography;
- navigation;
- dashboard;
- table;
- filters;
- forms;
- hero;
- pricing;
- case study;
- charts;
- mobile;
- motion;
- empty states.

Do not save references merely because they are pretty.

Annotate:

```txt
Why does this work?
What principle can I reuse?
What is contextual?
What should I not copy?
```

---

# 74. Inspiration-to-Originality Process

Use inspiration safely:

```txt
Observe
↓
Extract principle
↓
Remove surface styling
↓
Apply principle to a different problem
↓
Add brand constraints
↓
Add user constraints
↓
Create new composition
```

Example:

Do not copy:

> dark background + green card + giant rounded UI

Extract:

> limited palette + high-contrast focal card + strong photographic support

Then reinterpret it.

---

# 75. High-End Website Recipe

For a website in the visual quality range of strong contemporary SaaS/product designers:

```txt
Clear positioning
+ confident editorial typography
+ restrained palette
+ excellent whitespace
+ real product visual
+ strong conversion path
+ carefully art-directed sections
+ responsive composition
+ subtle high-quality motion
+ fast implementation
```

Do not substitute effects for positioning.

---

# 76. High-End Product UI Recipe

For polished SaaS/product software:

```txt
Strong IA
+ calm information density
+ excellent typography
+ neutral surfaces
+ controlled accent color
+ useful tables
+ meaningful charts
+ robust state design
+ accessible interactions
+ reusable system
+ implementation realism
```

---

# 77. Quality Bar: Good vs Excellent

## Good

- clean;
- consistent;
- modern;
- understandable.

## Excellent

- intentional;
- distinctive;
- robust;
- content-aware;
- responsive;
- accessible;
- technically sound;
- memorable without being distracting.

Aim for excellent.

---

# 78. Anti-Skills / Habits to Eliminate

Remove these habits:

- designing only desktop;
- designing only happy path;
- using fake data;
- adding gradients automatically;
- wrapping everything in cards;
- choosing icons randomly;
- relying on Dribbble shots as UX evidence;
- ignoring long content;
- skipping focus states;
- treating mobile as smaller desktop;
- using animation everywhere;
- creating dozens of arbitrary spacing values;
- handing off without reviewing implementation;
- copying a visual trend without understanding it.

---

# 79. Final Website Audit

Before declaring a website finished:

### Strategy

- [ ] Audience is clear.
- [ ] Value proposition is clear.
- [ ] CTA hierarchy is clear.
- [ ] Page tells a coherent story.

### Visual

- [ ] Typography is confident.
- [ ] Layout has a clear focal point.
- [ ] Palette is restrained.
- [ ] Spacing is consistent.
- [ ] Imagery has purpose.
- [ ] Effects are controlled.

### UX

- [ ] Navigation is clear.
- [ ] Interaction feedback exists.
- [ ] Forms are usable.
- [ ] Mobile is intentionally designed.
- [ ] Content hierarchy survives small screens.

### Technical

- [ ] Semantic HTML.
- [ ] Accessible focus.
- [ ] Good contrast.
- [ ] Images optimized.
- [ ] Fonts optimized.
- [ ] Motion respects reduced motion.
- [ ] Page loads quickly.
- [ ] No obvious layout shift.

---

# 80. Final Product Audit

Before declaring a product interface finished:

- [ ] User goal is obvious.
- [ ] Primary workflow is efficient.
- [ ] Navigation architecture is understandable.
- [ ] Real data is used.
- [ ] Empty states exist.
- [ ] Loading states exist.
- [ ] Error states exist.
- [ ] Permission states exist.
- [ ] Tables are usable.
- [ ] Charts have purpose.
- [ ] Filters are logical.
- [ ] Responsive behavior works.
- [ ] Keyboard behavior works.
- [ ] Focus states are visible.
- [ ] Components are reusable.
- [ ] Tokens are consistent.
- [ ] Implementation has been visually reviewed.

---

# 81. Final AI Design Agent Instruction

When generating any product or website:

> Do not chase aesthetic novelty before understanding the user and information hierarchy.

> Use strong visual hierarchy, confident typography, restrained color, realistic product content, systematic components, robust states, deliberate responsive behavior, and production-quality implementation.

> Prefer one memorable design decision over many fashionable effects.

> Build something that would still be good if all gradients, mockup shadows, and animations were removed.

> Then add polish carefully.

---

# 82. The Standard

The intended quality bar is:

```txt
Visually compelling enough to attract attention.
Structured enough to feel effortless.
Detailed enough to survive production.
Distinctive enough to be remembered.
Systematic enough to scale.
Technical enough to ship.
```

That is the skill set behind consistently excellent modern product design.
