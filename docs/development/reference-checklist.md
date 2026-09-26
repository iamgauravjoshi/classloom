# UI reference checklist

The live PreSkool demo is the visual source of truth; the linked Figma kit is an older supporting reference. ClassLoom branding replaces the template mark and name.

| Reference area | Phase 0 use |
| --- | --- |
| Admin dashboard | Sidebar, top bar, breadcrumb, metric cards, overview panels |
| Teacher, student, and parent dashboards | Role-based layout patterns recorded for later phases |
| Student list, profile, and form | Table, detail, and form patterns reserved for student module |
| Attendance, fees, and marks | Workflow patterns reserved for later domain modules |
| Login | Visual reference only; no authentication in Phase 0 |
| UI components and dark layout | shadcn primitives and ClassLoom light/dark theme |

Only the dashboard is navigable in Phase 0. Other sidebar areas are visibly unavailable. Dashboard numbers and events are sample data.

For frontend implementation, follow `apps/web/AGENTS.md` and the repository shadcn skill at `.agents/skills/shadcn/SKILL.md`. Use the shadcn MCP to inspect registry components and examples; if unavailable, use the shadcn CLI. Keep the configured Base UI component base and ClassLoom design tokens consistent. Generate dashboard or other demo values with seeded Faker.js fixtures so examples remain plausible and repeatable.
