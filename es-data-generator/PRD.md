# Elasticsearch Data Generator — Product Requirements Document (PRD)

## Overview
A browser-based tool to connect to an Elasticsearch cluster, inspect index mappings, generate synthetic documents that respect field types and rules, and run SQL queries with translation, execution, pagination (cursor), and result export.

## Goals
- Allow non-expert users to quickly generate valid data for indices.
- Provide SQL editor with translation to DSL, execution, and cursor-based pagination.
- Offer flexible field rules for date, geo, IP, string, and numeric types.
- Enable viewing results as table or JSON and exporting to CSV.

## Non-Goals
- Managing index lifecycle (creation, ILM, templates).
- Custom auth providers beyond Basic and API Key.
- Server-side middleware or proxy; all requests are direct from the browser.

## Architecture Summary
- Frontend: Vite + React + TypeScript.
- No backend; uses `fetch` to call Elasticsearch REST APIs.
- Data generation is deterministic per session using runtime RNG functions.

## Key Features
### Connections
- Create and save connections with `basic` or `apiKey` auth.
- Test connection via `/_cat/health`.
  - Code reference: `es-data-generator/src/esClient.ts:26-38` and `es-data-generator/src/App.tsx:118-130`.

### Mapping & Field Rules
- Fetch mapping for an index and extract `properties`.
  - Code reference: `es-data-generator/src/esClient.ts:40-52`, `es-data-generator/src/generator.ts:174-184`.
- Add rules per field; rule options auto-filter by field type:
  - Date: `format` (`iso` or `epoch_millis`), optional range (`start`, `end`), optional frequency inputs (granularity, distribution, rate).
  - Geo Point: `latMin`, `latMax`, `lonMin`, `lonMax`.
  - Geohash: `precision`.
  - Geo City: select from local city dataset.
  - IP: `v4` or `v6`.
  - String (keyword/text): `prefix`, `phone`.
  - Numeric (integer/float): `geo_number` with `axis` and `min/max` bounds.
  - Manual: fixed value override.
  - Code references: `es-data-generator/src/App.tsx:239-259`, `es-data-generator/src/App.tsx:260-300`, `es-data-generator/src/generator.ts:37-47`, `es-data-generator/src/generator.ts:79-88`, `es-data-generator/src/generator.ts:131-146`, `es-data-generator/src/generator.ts:104-118`.

### Data Generation & Bulk Insert
- Generate `count` documents that respect mapping types and rules; optional global date range.
- Bulk insert in chunks using `/_bulk` NDJSON.
  - Code references: `es-data-generator/src/generator.ts:166-172` (generate), `es-data-generator/src/esClient.ts:54-80` (bulk), UI at `es-data-generator/src/App.tsx:429-445`.
- Note: The previous “Time-Based Generation” section was removed per request. Date rule frequency inputs remain in the rule UI but do not trigger time-based insertion.

### SQL Editor
- Translation: `POST /_sql/translate` to preview DSL.
- Execution: `POST /_sql` with `fetch_size`.
- Pagination: `POST /_sql` with `cursor` to retrieve next pages.
- Cursor close: `POST /_sql/close`.
- Views: Table and JSON view toggle.
- Export: Download CSV with proper escaping of quotes, commas, and newlines.
- Examples: Predefined SQL snippets selectable from dropdown.
  - Code references: `es-data-generator/src/esClient.ts:95-156`, `es-data-generator/src/App.tsx:557-616`.

## APIs Used
- `GET /_cat/health`
- `GET /{index}/_mapping`
- `POST /_bulk`
- `POST /_sql/translate`
- `POST /_sql`
- `POST /_sql/close`

## UI Details
- Sections: Connections, Schema Generator, Field Rules, SQL.
- CSV export uses `Blob` + `URL.createObjectURL` with escaping.
- Auth headers: `Basic` or `ApiKey` depending on connection.

## Data Types & Rule Mapping
- Date: ISO or epoch millis; range respected in generation.
- Geo Point: object `{ lat, lon }` inside specified bounds or from city dataset; geohash string supported.
- IP: IPv4 or IPv6.
- String (keyword/text): random strings, prefix, phone.
- Numeric: bounded values via `geo_number` rule.
- Object: recursively generated based on nested `properties`.

## Pagination Behavior
- Initial execution returns `rows`, `columns`, optional `cursor`.
- “Next Page” appends rows until no cursor is returned.
- “Close Cursor” clears server-side cursor and UI state.

## Error Handling
- Network/HTTP errors surfaced in UI status areas.
- Mapping extraction guards against missing `properties`.
- CSV export avoids malformed fields via quote escaping.

## Security Considerations
- No secrets persisted beyond local connection storage.
- TLS is enforced by the browser; self-signed certs must be trusted at OS level.
- No proxy; CORS must be configured on Elasticsearch.

## Acceptance Criteria
- User can connect, fetch mapping, set field rules filtered by type.
- User can generate and bulk insert documents without errors.
- User can translate and execute SQL, paginate with cursors, close cursor.
- User can toggle table/JSON view and export valid CSV.
- Lint/typecheck/build succeed.

## Testing
- Manual tests: connection health, mapping fetch, rule application for each type, bulk insert success, SQL translation/execution/pagination, CSV export.
- Build verification via `npm run lint` and `npm run build`.

## Future Enhancements
- Preset date ranges (e.g., “Past 1 day”).
- Larger city dataset or CSV import for custom cities.
- Saved rule profiles per index.
- Optional server-side proxy for secured clusters.
