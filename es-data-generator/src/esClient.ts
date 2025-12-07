export type AuthType = 'basic' | 'apiKey';

export type Connection = {
  id: string;
  name: string;
  url: string;
  authType: AuthType;
  username?: string;
  password?: string;
  apiKey?: string;
};

function buildHeaders(conn: Connection): HeadersInit {
  const headers: Record<string, string> = {
    'Accept': 'text/plain,application/json',
  };
  if (conn.authType === 'basic' && conn.username && conn.password) {
    const token = btoa(`${conn.username}:${conn.password}`);
    headers['Authorization'] = `Basic ${token}`;
  } else if (conn.authType === 'apiKey' && conn.apiKey) {
    headers['Authorization'] = `ApiKey ${conn.apiKey}`;
  }
  return headers;
}

export async function pingHealth(conn: Connection): Promise<{ ok: boolean; status: number; body?: string; error?: string }> {
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_cat/health`, {
      method: 'GET',
      headers: buildHeaders(conn),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function fetchMapping(conn: Connection, index: string): Promise<{ ok: boolean; status: number; json?: unknown; error?: string }> {
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/${encodeURIComponent(index)}/_mapping`, {
      method: 'GET',
      headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function listIndices(conn: Connection): Promise<{ ok: boolean; status: number; names?: string[]; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_cat/indices?format=json&h=index`, {
      method: 'GET',
      headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json: unknown = await res.json();
    const names: string[] = Array.isArray(json)
      ? (json as Array<unknown>)
          .map((x: unknown) => (typeof x === 'object' && x && 'index' in x ? String((x as { index: unknown }).index) : ''))
          .filter((n: string) => n.length > 0)
      : [];
    return { ok: true, status: res.status, names };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function listDataStreams(conn: Connection): Promise<{ ok: boolean; status: number; names?: string[]; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_data_stream`, {
      method: 'GET',
      headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json: unknown = await res.json();
    let names: string[] = [];
    if (Array.isArray(json)) {
      names = (json as Array<unknown>)
        .map((x: unknown) => (typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : ''))
        .filter((n: string) => n.length > 0);
    } else if (json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).data_streams)) {
      names = ((json as Record<string, unknown>).data_streams as Array<unknown>)
        .map((x: unknown) => (typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : ''))
        .filter((n: string) => n.length > 0);
    }
    return { ok: true, status: res.status, names };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function bulkInsert(
  conn: Connection,
  index: string,
  docs: unknown[],
  chunkSize = 1000,
  options?: { onProgress?: (info: { processed: number; total: number; chunkIndex: number; chunkCount: number; succeeded: number; failed: number }) => void; signal?: AbortSignal; maxRetries?: number; initialDelayMs?: number }
): Promise<{ ok: boolean; status: number; errors?: boolean; items?: number; succeeded?: number; failed?: number; error?: string }>{
  const base = conn.url.replace(/\/$/, '');
  const total = docs.length;
  const maxBulk = 10000;
  const cs = Math.min(Math.max(1, chunkSize), maxBulk);
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  const maxRetries = options?.maxRetries ?? 5;
  const initialDelayMs = options?.initialDelayMs ?? 500;
  let processed = 0;
  let succeededTotal = 0;
  let failedTotal = 0;
  try {
    const chunkCount = Math.ceil(total / cs);
    for (let off = 0, chunkIndex = 0; off < total; off += cs, chunkIndex++) {
      if (signal?.aborted) {
        return { ok: false, status: 0, errors: true, items: processed, succeeded: succeededTotal, failed: failedTotal, error: 'Cancelled' };
      }
      let chunk = docs.slice(off, off + cs);
      let attempt = 0;
      let delay = initialDelayMs;
      while (true) {
        const lines: string[] = [];
        for (const d of chunk) {
          lines.push(JSON.stringify({ index: { _index: index } }));
          lines.push(JSON.stringify(d));
        }
        const body = lines.join('\n') + '\n';
        const res = await fetch(`${base}/_bulk`, {
          method: 'POST',
          headers: { ...buildHeaders(conn), 'Content-Type': 'application/x-ndjson' },
          body,
          signal,
        });
        if (!res.ok) {
          const text = await res.text();
          const transient = res.status === 429 || res.status === 503;
          if (transient && attempt < maxRetries) {
            attempt++;
            await sleep(delay);
            delay = Math.min(delay * 2, 8000);
            continue;
          }
          return { ok: false, status: res.status, errors: true, items: processed, succeeded: succeededTotal, failed: failedTotal, error: text };
        }
        // Parse bulk response
        type BulkError = { type?: string; reason?: string; caused_by?: { type?: string; reason?: string } };
        type BulkItemStatus = { status?: number; error?: BulkError };
        type BulkItem = { index?: BulkItemStatus; create?: BulkItemStatus; update?: BulkItemStatus; delete?: BulkItemStatus };
        type BulkResponse = { items: BulkItem[] };
        let json: BulkResponse | null;
        try { json = await res.json() as BulkResponse; } catch { json = null; }
        if (!json || !Array.isArray(json.items)) {
          // Treat as all succeeded
          succeededTotal += chunk.length;
          processed += chunk.length;
          if (onProgress) onProgress({ processed, total, chunkIndex, chunkCount, succeeded: succeededTotal, failed: failedTotal });
          break;
        }
        const items = json.items as BulkItem[];
        const retryDocs: unknown[] = [];
        let succ = 0; let fail = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const act = it.index || it.create || it.update || it.delete;
          const status = act?.status ?? 500;
          const err = act?.error;
          const ok = status >= 200 && status < 300;
          if (ok) { succ++; }
          else {
            fail++;
            const type = err?.type || err?.caused_by?.type;
            const reason = err?.reason || '';
            const transient = status === 429 || status === 503 || String(type).includes('rejected') || /EsRejectedExecutionException/i.test(reason);
            if (transient) {
              retryDocs.push(chunk[i]);
            }
          }
        }
        succeededTotal += succ;
        failedTotal += fail;
        processed += chunk.length;
        if (onProgress) onProgress({ processed, total, chunkIndex, chunkCount, succeeded: succeededTotal, failed: failedTotal });
        if (retryDocs.length > 0 && attempt < maxRetries) {
          // Retry only transient failed docs
          chunk = retryDocs;
          attempt++;
          await sleep(delay);
          delay = Math.min(delay * 2, 8000);
          // Continue while-loop to retry
          continue;
        }
        break;
      }
    }
    return { ok: true, status: 200, errors: failedTotal > 0, items: total, succeeded: succeededTotal, failed: failedTotal };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, errors: true, items: processed, succeeded: succeededTotal, failed: failedTotal, error: msg };
  }
}

export type SqlTranslateResult = {
  size?: number;
  query?: unknown;
  aggregations?: unknown;
  sort?: unknown;
};

export type SqlExecResponse = {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  cursor?: string;
};

export async function translateSql(conn: Connection, sql: string): Promise<{ ok: boolean; status: number; json?: SqlTranslateResult; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_sql/translate`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function executeSql(conn: Connection, sql: string, fetchSize = 50): Promise<{ ok: boolean; status: number; json?: SqlExecResponse; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_sql`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: sql, fetch_size: fetchSize }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function nextSqlPage(conn: Connection, cursor: string): Promise<{ ok: boolean; status: number; json?: SqlExecResponse; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_sql`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ cursor }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function closeSqlCursor(conn: Connection, cursor: string): Promise<{ ok: boolean; status: number; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_sql/close`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ cursor }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    return { ok: true, status: res.status };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function searchPreview(
  conn: Connection,
  index: string,
  body: unknown
): Promise<{ ok: boolean; status: number; json?: unknown; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/${encodeURIComponent(index)}/_search`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function deleteByQuery(
  conn: Connection,
  index: string,
  body: unknown
): Promise<{ ok: boolean; status: number; json?: unknown; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/${encodeURIComponent(index)}/_delete_by_query`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export type DeleteTaskStatus = {
  completed?: boolean;
  task?: { id?: string };
  response?: unknown;
  status?: {
    total?: number;
    deleted?: number;
    batches?: number;
    version_conflicts?: number;
    noops?: number;
    retries?: { bulk?: number; search?: number };
  };
};

export async function cancelTask(conn: Connection, taskId: string): Promise<{ ok: boolean; status: number; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_tasks/${encodeURIComponent(taskId)}/_cancel`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    return { ok: true, status: res.status };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function getTask(conn: Connection, taskId: string): Promise<{ ok: boolean; status: number; json?: DeleteTaskStatus; error?: string }>{
  try {
    const res = await fetch(`${conn.url.replace(/\/$/, '')}/_tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}

export async function deleteByQueryAsync(
  conn: Connection,
  index: string,
  body: unknown,
  options?: { onProgress?: (s: DeleteTaskStatus) => void; signal?: AbortSignal; initialDelayMs?: number; maxRetries?: number }
): Promise<{ ok: boolean; status: number; taskId?: string; json?: unknown; error?: string }>{
  const base = conn.url.replace(/\/$/, '');
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  const maxRetries = options?.maxRetries ?? 5;
  const initialDelayMs = options?.initialDelayMs ?? 500;
  let delay = initialDelayMs;
  try {
    const startRes = await fetch(`${base}/${encodeURIComponent(index)}/_delete_by_query`, {
      method: 'POST',
      headers: { ...buildHeaders(conn), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ wait_for_completion: false, ...(body as Record<string, unknown> ?? {}) }),
      signal,
    });
    if (!startRes.ok) return { ok: false, status: startRes.status, error: await startRes.text() };
    const startJson: Record<string, unknown> = await startRes.json();
    const taskId = String(startJson.task || '');
    if (!taskId) {
      const resp = startJson.response ?? startJson;
      return { ok: true, status: startRes.status, json: resp };
    }
    let retries = 0;
    while (true) {
      if (signal?.aborted) return { ok: false, status: 0, taskId, error: 'Cancelled' };
      const poll = await fetch(`${base}/_tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET',
        headers: { ...buildHeaders(conn), 'Accept': 'application/json' },
        signal,
      });
      if (!poll.ok) {
        const text = await poll.text();
        const transient = poll.status === 429 || poll.status === 503 || /EsRejectedExecutionException/i.test(text);
        if (transient && retries < maxRetries) {
          retries++;
          await sleep(delay);
          delay = Math.min(delay * 2, 8000);
          continue;
        }
        return { ok: false, status: poll.status, taskId, error: text };
      }
      const j: Record<string, unknown> = await poll.json();
      const completed = Boolean(j.completed);
      const status = (j.task && typeof (j.task as Record<string, unknown>).status === 'object') ? ((j.task as Record<string, unknown>).status as DeleteTaskStatus['status']) : undefined;
      const progress: DeleteTaskStatus = { completed, status };
      if (onProgress) onProgress(progress);
      if (completed) {
        const response = j.response ?? j;
        return { ok: true, status: 200, taskId, json: response };
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 8000);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: msg };
  }
}
