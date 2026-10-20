# Implementation contract — shared ownership

Parent owns package/config/lockfiles, src/styles, src/app/globals.css and layout.tsx, src/components/ui, src/lib/types.ts, src/lib/format.ts, src/lib/validation.ts, src/lib/seed-event.ts, root routes and docs. Do not edit outside your assigned directories. Use plain CSS modules for agent-specific styles; global semantic UI classes supplied by parent. Tailwind is not installed: centralized tokens plus CSS modules avoid ad-hoc shared utility changes.

## Shared UI
Import {Button, ButtonLink, Field, Notice, SectionHeading} from '@/components/ui'. Button accepts native button props and variant='primary'|'secondary'|'quiet'. ButtonLink accepts native anchor props and same variant. Field accepts label, name, error?: string, hint?: string, children; it renders label htmlFor=name and hint/error IDs `${name}-hint/error`; control must set id and aria-describedby. Notice accepts children and tone='info'|'error'|'success', role optional. SectionHeading accepts eyebrow?, title, children?. Generic classes: container, input, textarea, select, stack, row, panel, eyebrow, muted, sr-only. CSS custom properties in src/styles/tokens.css; use those, not hardcoded brand colors. Icons lucide-react.

## Types and validation
Types in src/lib/types.ts are authoritative. Dates are ISO timestamptz; timezone Asia/Jakarta. Validation exports eventSchema, rsvpSchema, feedbackSchema from src/lib/validation.ts. Event save accepts complete EventRecord-shaped payload, server ignores client created/updated/id when appropriate and uses route ID. No arbitrary raw HTML. Blank HTTPS URL allowed only for optional links, main venue link required on publish. Seed event factory in src/lib/seed-event.ts: createSeedEvent() returns draft EventRecord (deterministic initial event ID, blank question list, provided source content). Do not publish automatically.

## Backend-owned contract
Implement src/lib/server/events.ts:
- getPublicEvent(slug: string): Promise<EventRecord|null> (only published, no cached drafts)
- getAdminEvent(id: string): Promise<EventRecord|null> (requires admin)
- listAdminEvents(): Promise<EventRecord[]> (requires admin)
Implement src/lib/server/admin-session.ts (shared-password session; replaced the old Supabase-account auth.ts):
- hasAdminSession(): Promise<boolean>; requireAdminPage() redirects to /admin/login; requireApiAdmin() throws a 401/503 ServiceError
- src/proxy.ts gates /admin/:path* and /api/admin/:path* first; pages and routes still check (defence in depth)
Implement src/lib/server/config.ts: isSupabaseConfigured(): boolean (URL+publishable key only); privileged mutations additionally require secret and RATE_LIMIT_SECRET where needed.
Implement API handlers:
POST /api/auth/login {password} (rate limited, logged to admin_access_log); POST /api/auth/logout
GET /api/admin/events -> ApiResult<EventRecord[]>
POST /api/admin/events -> ApiResult<EventRecord> create a draft using server seed then slug unique; no cloning answers. Optional body {duplicateId:string} clones content to draft/new IDs, never answers.
GET /api/admin/events/[id] -> ApiResult<EventRecord>
PUT /api/admin/events/[id] complete EventRecord -> ApiResult<EventRecord>, validated; publication checks server-side.
GET /api/admin/events/[id]/responses?page=1&attendance=yes|no&q= -> ApiResult<PageResult<RsvpRecord>>
GET /api/admin/events/[id]/responses/export -> safe CSV download, auth required.
GET /api/admin/events/[id]/feedback?page=1 -> ApiResult<PageResult<FeedbackRecord>>
POST /api/events/[slug]/rsvp RsvpInput -> ApiResult<{id:string}>
POST /api/events/[slug]/feedback FeedbackInput -> ApiResult<{id:string}>
All JSON errors use ApiResult. Unconfigured service gives actionable 503, never fake success. Public errors do not expose raw DB exceptions. Protect mutating cookie-auth APIs against cross-origin submissions. No browser storage of PII. Public writes validated, rate limited atomically, idempotent and event scoped.

## Guest-owned contract
Export EventExperience({event,preview=false}:{event:EventRecord;preview?:boolean}) from src/components/guest/EventExperience.tsx. Preview shows explicit notice and disables submission. /e/[slug] page calls getPublicEvent, handles unconfigured setup gracefully (not a seed fallback), notFound for unknown/unpublished; use dynamic rendering to avoid draft/cache leakage. May import backend contract before files exist, but do not implement stubs in backend territory. Include server metadata noindex by default for invitation privacy; route still publicly accessible via URL. Guest form respects event controls/deadlines, server remains authoritative.

## Admin-owned contract
Admin pages and components only. Login page renders setup guidance if unavailable; protected pages call requireAdminPage. No global protected admin layout that redirects login to itself. Preview path /admin/events/[id]/preview requires admin and imports SAME EventExperience. Admin editor edits supported content, topics, agenda, section ordering/enabled state, survey questions, location image URL/credit, RSVP/feedback dates, status. Editing draft should not demand complete publish fields. On publish validation strict; explain omitted sections. File upload is deferred if backend secure Storage upload cannot be completed; don't present a fake functioning upload control. UI can use validated approved HTTPS image URL initially and clearly document limitation.

## Agent reporting and safety
Report changed files, tests run, missing interfaces and limitations honestly. No remote migrations, deployment, commits, dependency install or secret access. Two failed attempts on same approach => stop and ask parent, no third variant. No sub-delegation. Parent integrates after all ownership handoffs. Use test fixtures only in tests; no mock-success production paths.
