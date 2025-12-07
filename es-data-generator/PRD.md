# Elasticsearch Data Generator — Product Requirements Document (PRD)

## Overview
- Goal: A browser-based tool to generate, preview, and insert synthetic documents into Elasticsearch indices; query via Elasticsearch SQL; compare index schemas; and delete by query — with robust UX for tables and connections.
- Audience: Developers and data engineers working with Elasticsearch on local or remote clusters.
- Platform: React + TypeScript + Vite (Rolldown), strict TypeScript, ESLint.

## Objectives
- Create and manage Elasticsearch connections with saved entries unified under a single tab.
- Generate sample data and perform bulk insert with progress and error reporting.
- Provide an SQL-based editor for querying indices/data streams/patterns; allow CSV download.
- Compare schemas between two indices.
- Support delete-by-query with preview and task progress.
- Ensure tables have proper alignment, sticky headers, horizontal/vertical scroll, and pagination.
- Deliver a clear, pill-style tab UI with icons.

## Non-Goals
- Server-side pagination; use client-side pagination for current scope.
- External icon libraries; use emoji icons to avoid new deps.
- Advanced auth flows (e.g., OAuth); support Basic and API Key.

## Personas
- Developer: Needs quick local iteration and verification.
- Data Engineer: Validates mappings, generates realistic data, runs ad-hoc queries.

## Key Features & Acceptance Criteria

### 1) Connections (includes Saved)
- Create a connection with name, URL, auth type (Basic, API Key) and credentials.
- Saved connections appear below the form in the same tab; can select, update, test, and delete.
- Acceptance:
  - Saved connections render in `Connections` tab; select updates `selected` state.
  - Test reports health status via `pingHealth`.
  - Delete removes from storage and updates selection.
- Code refs:
  - `es-data-generator/src/App.tsx:344–425` (UI and saved section)
  - `es-data-generator/src/storage.ts` (persistence)
  - `es-data-generator/src/esClient.ts` (client ops)

### 2) Schema Generator
- Select index; set doc count and chunk size; configure time range; set per-field generation rules; preview sample docs (JSON or table); insert in bulk with progress.
- Acceptance:
  - Preview generates `N` docs respecting rules and date ranges.
  - Toggle JSON/tree/table views; clear preview resets state.
  - Bulk insert shows progress and final status.
- Code refs:
  - Preview/table: `es-data-generator/src/App.tsx:872–916`
  - Bulk insert: `es-data-generator/src/App.tsx:919–951` and `es-data-generator/src/esClient.ts`
  - Rules utilities: `es-data-generator/src/generator.ts`

### 3) Elasticsearch Editor (Using SQL Query)
- Rename tab and section to "Elasticsearch Editor (Using SQL Query)".
- Choose source type (index/data stream/pattern), compose SQL, fetch results, toggle JSON/tree/table views, and download CSV.
- Acceptance:
  - Results table paginates; CSV download contains the current result set.
  - JSON view includes tree mode with filter and expand/collapse.
- Code refs:
  - Tab/button: `es-data-generator/src/App.tsx:336–342`
  - Results table + pagination: `es-data-generator/src/App.tsx:1296–1328`
  - CSV export: `es-data-generator/src/App.tsx:1386–1412`

### 4) Compare Schemas
- Appears after the SQL tab; lets user pick two indices and shows added/removed/type changes.
- Acceptance:
  - Correct ordering in tab bar.
  - Type changes render in a table with stable scroll.
- Code refs:
  - Tab order: `es-data-generator/src/App.tsx:336–342`
  - Compare UI: `es-data-generator/src/App.tsx:1083–1151`

### 5) Delete By Query
- Enter JSON query, select index, preview affected docs (JSON/tree/table), run delete task and show progress.
- Acceptance:
  - Preview paginated; table scroll works; progress bar updates during delete.
- Code refs:
  - Preview table + pagination: `es-data-generator/src/App.tsx:1519–1560`
  - Task progress: `es-data-generator/src/App.tsx:1533–1535`

### 6) Table UX
- Sticky headers, nowrap headers, horizontal/vertical scroll, compact mode, and client-side pagination controls (Prev/Next, page size).
- Acceptance:
  - Tables stay within page with scrollbars.
  - Pagination defaults sensible and adjustable.
- Code refs:
  - CSS scroll/sticky: `es-data-generator/src/App.css:90–118`
  - Pagination controls: Preview `es-data-generator/src/App.tsx:898–914`, SQL `es-data-generator/src/App.tsx:1316–1328`, Delete `es-data-generator/src/App.tsx:1542–1560`

### 7) Tab UI Styling
- Pill-style tab container with icons and active state; dark theme consistent.
- Acceptance:
  - Tabs show icons; active tab styled as white pill; hover/focus states.
- Code refs:
  - Styles: `es-data-generator/src/App.css:171–206`
  - Buttons: `es-data-generator/src/App.tsx:336–342`

## Functional Requirements
- Connection management with persistence.
- Data generation supports date/geo/ip/number/string rules per field.
- Real-time mode to simulate sequential inserts with state updates.
- SQL editor supports source selection and default LIMIT based on fetch size.
- Delete-by-query preview before execution.

## Non-Functional Requirements
- Performance: Client-side pagination; sticky header rendering must remain responsive on 1k rows.
- Accessibility: Keyboard focus outlines; sticky headers with clear contrast.
- Security: Do not log secrets; rely on browser TLS; basic/apiKey only.

## Technical Constraints
- React `^19.2.0`, TypeScript `~5.9.3`, Vite `rolldown-vite@7.2.5`.
- Strict TypeScript via `tsconfig.app.json`.
- ESLint `^9` configured; run lint/typecheck on changes.
- No new UI libraries for icons.

## Development Setup (Cursor)
- Commands:
  - `npm run dev` — start local dev server.
  - `npm run lint` — lint check.
  - `npm run typecheck` — TypeScript diagnostics.
  - `npm run build` — production build.
- Working directory: `es-data-generator`.
- Structure awareness:
  - Main app component: `src/App.tsx`.
  - Styles: `src/App.css`.
  - ES client helpers: `src/esClient.ts`.
  - Data generation: `src/generator.ts`.
  - Storage utilities: `src/storage.ts`.

## User Stories
- As a developer, I can save an ES connection and quickly test it before use.
- As a data engineer, I can preview synthetic docs and insert them in bulk with progress.
- As a user, I can query with Elasticsearch SQL and view results in paginated tables or JSON.
- As a user, I can compare two index schemas and see changes.
- As a user, I can preview delete-by-query results and track deletion progress.

## Acceptance Tests (High-Level)
- Connections:
  - Save and select a connection; test returns health.
  - Update persisted auth type and URL; delete updates selection.
- Schema Generator:
  - Preview shows `N` docs; toggle views; clear resets.
  - Bulk insert reports progress and final counts.
- SQL Editor:
  - Default SQL uses LIMIT from fetch size; results paginate; CSV downloads.
- Compare Schemas:
  - Tab order correct; added/removed/type changes display in lists/table.
- Delete:
  - Preview paginates; progress bar shows during deletion; final status reported.
- Table UX:
  - Headers sticky; horizontal/vertical scroll; compact spacing toggles.

## Future Enhancements (Optional)
- Server-side pagination for very large result sets.
- Persist user-preferred page sizes.
- Row filtering/search on tables.

## Risks & Mitigations
- Large datasets in the browser: mitigate with client-side pagination and LIMITs.
- TLS constraints in browser: document that self-signed certs must be trusted at OS level.

## Definition of Done
- Features implemented as specified.
- `npm run lint` and `npm run typecheck` pass.
- Manual checks across tabs verify pagination, scroll behavior, and tab UI.
