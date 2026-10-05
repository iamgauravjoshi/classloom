# ClassLoom Design Standard

Use this guide for ClassLoom’s school management web app. Design for school staff, students, and guardians who need to understand school information and complete real tasks quickly. Product scope and behavior come from `docs/product/` and `docs/architecture/`. Use the PreSkool reference for useful admin patterns, such as tables and forms, while adapting them to ClassLoom’s workflow and design system instead of copying its surface style.

## Product Principles

- Make the user’s school context, academic year or term, page purpose, and primary action clear.
- Prioritize tasks, exceptions, and next steps over decorative summaries. Keep related information together and use progressive disclosure for less common actions.
- Use calm, precise, respectful language. Design for the different responsibilities of staff, students, and guardians.
- Treat comprehension, task completion, accessibility, and information hierarchy as more important than visual effects.

## Visual System and Layout

- Follow the existing theme in `apps/web/src/app/globals.css`: Inter, neutral slate surfaces, navy text, and ClassLoom blue. Use existing semantic CSS variables and shared components; add tokens centrally when the system needs to grow.
- Use a 4px spacing rhythm, restrained radii, subtle borders, and limited elevation. Prefer alignment and spacing over wrapping every section in a card. Keep one clear focal point per page region.
- Reuse the configured shadcn/Base UI components and Lucide icon family. Keep control sizes, focus styles, and variants consistent. Use color for meaning, but never as the sole signal for status or selection.
- Keep the app shell and operational pages suited to wide data views. Align headings, forms, tables, and actions. Use readable type; use tabular numerals for attendance counts, fees, marks, and other comparable values.

## School Workflows and Data

- Group navigation by school workflows: academics, students and guardians, admissions, attendance, fees, exams, communication, and reports, as applicable to the user’s role.
- Use tables for comparing and managing records. Include meaningful filters, active filter state, loading and empty states, pagination for large lists, and clear row actions. Use charts only to answer a specific school decision question; state units, periods, and comparison context.
- Display dates and times in the school’s configured timezone. Make academic year, term, class, and date range explicit whenever they affect the results.
- Respect authorization in every view and action. Never reveal student or school data outside the signed-in user’s access. Confirm consequential actions such as changing enrollment, recording marks, or removing records.

## Responsive Design, Accessibility, and States

- Design mobile as a focused workflow: preserve essential context and actions, simplify navigation, and choose a deliberate table treatment such as priority columns, horizontal scrolling, or record details.
- Use semantic HTML, persistent labels, visible keyboard focus, accessible contrast, keyboard interaction, and touch targets suitable for mobile. Respect reduced-motion preferences.
- Account for loading, empty, no results, partial data, errors, disabled controls, restricted access, and success. Error messages should explain recovery; never show success for a failed operation.
- Test realistic content lengths, missing values, large and zero counts, narrow and intermediate widths, and long-running requests.

## Implementation and Review

Follow `apps/web/AGENTS.md` for frontend workflow and performance practices. Use the project’s shadcn guidance for UI components, Faker.js for plausible development/test fixtures, and date-fns for date operations. Before shipping, verify that users can tell where they are, what needs attention, what action is available, and what happens next. Check responsive behavior, keyboard use, contrast, and relevant data states.
