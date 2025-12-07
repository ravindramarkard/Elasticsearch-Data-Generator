import { useMemo, useState, useEffect } from 'react';
import './App.css';
import type { Connection, AuthType } from './esClient';
import { pingHealth, fetchMapping, bulkInsert, translateSql, executeSql, nextSqlPage, closeSqlCursor, listIndices, listDataStreams, searchPreview, deleteByQueryAsync, cancelTask } from './esClient';
import { loadConnections, saveConnections } from './storage';
import { extractMappingFromResponse, extractAnyMapping, generateDocs, diffMappings, listFieldsByType, flattenMappingFields } from './generator';
import type { Mapping, FieldRules, FieldRule, Granularity, Distribution, DateRule, TypeChange } from './generator';

const DEFAULT_START_ISO = new Date(Date.now() - 86400000).toISOString();
const DEFAULT_END_ISO = new Date().toISOString();
const SQL_EXAMPLES: { id: string; label: string; query: string }[] = [
  { id: 'basic', label: 'Basic SELECT', query: 'SELECT * FROM flights LIMIT 10' },
  { id: 'where-alt', label: 'WHERE alt >= 35000 sorted', query: 'SELECT fr24_id, alt FROM flights WHERE alt >= 35000 ORDER BY alt DESC LIMIT 20' },
  { id: 'time-range', label: 'Time range BETWEEN', query: "SELECT * FROM flights WHERE timestamp BETWEEN '2023-11-08T00:00:00Z' AND '2023-11-09T00:00:00Z'" },
  { id: 'agg-dest', label: 'Aggregation COUNT by dest_iata', query: 'SELECT dest_iata, COUNT(*) FROM flights GROUP BY dest_iata ORDER BY COUNT(*) DESC LIMIT 10' },
  { id: 'sort-speed', label: 'Sort by gspeed', query: 'SELECT flight, gspeed FROM flights ORDER BY gspeed DESC LIMIT 50' },
  { id: 'contains-like', label: 'Contains using LIKE', query: "SELECT flight, type FROM flights WHERE flight LIKE 'AF%' OR type LIKE '%A321%' LIMIT 20" },
  { id: 'multi-group', label: 'Multiple grouping', query: 'SELECT dest_iata, orig_iata, COUNT(*) FROM flights GROUP BY dest_iata, orig_iata ORDER BY COUNT(*) DESC LIMIT 20' },
  { id: 'group-with-where', label: 'Grouping with WHERE', query: 'SELECT dest_iata, COUNT(*) FROM flights WHERE alt >= 30000 GROUP BY dest_iata ORDER BY COUNT(*) DESC LIMIT 20' },
  { id: 'agg-avg', label: 'AVG and ORDER BY', query: 'SELECT type, AVG(gspeed) avg_speed FROM flights GROUP BY type ORDER BY avg_speed DESC LIMIT 10' },
  { id: 'filter-source', label: 'Filter by source/type', query: "SELECT flight, alt, gspeed FROM flights WHERE source = 'ADSB' AND type = 'A321' ORDER BY alt DESC LIMIT 20" },
];

const DEL_QUERY_EXAMPLES: { id: string; label: string; body: string }[] = [
  { id: 'all', label: 'Delete all (conflicts proceed)', body: '{"conflicts":"proceed","query":{"match_all":{}}}' },
  { id: 'older-30d', label: 'Older than 30d', body: '{"conflicts":"proceed","query":{"range":{"@timestamp":{"lt":"now-30d"}}}}' },
  { id: 'status-inactive', label: 'Term status=inactive', body: '{"conflicts":"proceed","query":{"term":{"status":"inactive"}}}' },
  { id: 'error-last-7d', label: 'Error last 7d', body: '{"conflicts":"proceed","query":{"bool":{"must":[{"range":{"@timestamp":{"lt":"now-7d"}}},{"term":{"status":"error"}}]}}}}' },
  { id: 'query-string', label: 'Query string', body: '{"conflicts":"proceed","query":{"query_string":{"query":"type:A321 AND source:ADSB"}}}' },
  { id: 'ids', label: 'IDs list', body: '{"conflicts":"proceed","query":{"terms":{"_id":["id1","id2","id3"]}}}' },
  { id: 'cap-max-docs', label: 'Cap at max_docs=100000', body: '{"conflicts":"proceed","max_docs":100000,"query":{"range":{"@timestamp":{"lt":"now-30d"}}}}' },
];

function App() {
  const [connections, setConnections] = useState<Connection[]>(() => loadConnections());
  const [selectedId, setSelectedId] = useState<string>(() => connections[0]?.id || '');
  const selected = useMemo(() => connections.find(c => c.id === selectedId), [connections, selectedId]);

  const [form, setForm] = useState<Connection>(() => ({
    id: crypto.randomUUID(),
    name: 'My Cluster',
    url: 'http://localhost:9200',
    authType: 'basic',
    username: '',
    password: '',
    apiKey: '',
  }));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>('');
  const [indexName, setIndexName] = useState('flights');
  const [mappingJson, setMappingJson] = useState('');
  const [mappingLoaded, setMappingLoaded] = useState<Mapping | null>(null);
  const [genCount, setGenCount] = useState(1000);
  const [chunkSize, setChunkSize] = useState<number>(1000);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [rangePreset, setRangePreset] = useState<string>('last-7d');
  const [countUnit, setCountUnit] = useState<'second' | 'minute' | 'hour' | 'day'>('day');
  const calcCount = useMemo(() => {
    const s = rangeStart ? new Date(rangeStart) : new Date(DEFAULT_START_ISO);
    const e = rangeEnd ? new Date(rangeEnd) : new Date(DEFAULT_END_ISO);
    const ms = Math.max(0, e.getTime() - s.getTime());
    const unitMs = countUnit === 'second' ? 1000 : countUnit === 'minute' ? 60_000 : countUnit === 'hour' ? 3_600_000 : 86_400_000;
    const c = Math.floor(ms / unitMs);
    if (c === 0 && countUnit === 'day') return 1;
    return c;
  }, [rangeStart, rangeEnd, countUnit]);
  const [genStatus, setGenStatus] = useState<string>('');
  const [rules, setRules] = useState<FieldRules>({});
  const [ruleField, setRuleField] = useState('');
  const [ruleType, setRuleType] = useState('');
  const [ruleInputs, setRuleInputs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<boolean>(false);
  const [processed, setProcessed] = useState<number>(0);
  const [totalDocs, setTotalDocs] = useState<number>(0);
  const [succCount, setSuccCount] = useState<number>(0);
  const [failCount, setFailCount] = useState<number>(0);
  const [bulkCtrl, setBulkCtrl] = useState<AbortController | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(5);
  const [previewDocs, setPreviewDocs] = useState<Record<string, unknown>[]>([]);
  const [previewView, setPreviewView] = useState<'json' | 'table'>('json');
  const [previewJsonMode, setPreviewJsonMode] = useState<'text' | 'tree'>('text');
  const [previewTreeExpanded, setPreviewTreeExpanded] = useState<boolean>(true);
  const [previewFilter, setPreviewFilter] = useState<string>('');
  const [previewStatus, setPreviewStatus] = useState<string>('');
  const [previewReady, setPreviewReady] = useState<boolean>(false);
  const [previewConfig, setPreviewConfig] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewPageSize, setPreviewPageSize] = useState<number>(10);
  const currentPreviewConfig = useMemo(() => JSON.stringify({
    indexName,
    rangeStart,
    rangeEnd,
    rules,
    props: mappingLoaded ? Object.keys(mappingLoaded.properties) : [],
  }), [indexName, rangeStart, rangeEnd, rules, mappingLoaded]);
  const [rtEnabled, setRtEnabled] = useState<boolean>(false);
  const [rtRunning, setRtRunning] = useState<boolean>(false);
  const [rtStatus, setRtStatus] = useState<string>('');
  const [rtInserted, setRtInserted] = useState<number>(0);
  const [rtLastDoc, setRtLastDoc] = useState<Record<string, unknown> | null>(null);
  const [rtTimerId, setRtTimerId] = useState<number | null>(null);
  const [rtState, setRtState] = useState<{ lat: number; lon: number; heading: number; speed: number; altitude: number } | null>(null);
  function computeNext(lat: number, lon: number, speed: number, heading: number): { lat: number; lon: number; heading: number } {
    const hd = ((heading + (Math.random() * 4 - 2)) + 360) % 360;
    const distNm = speed / 60;
    const rad = hd * Math.PI / 180;
    const dn = distNm * Math.cos(rad);
    const de = distNm * Math.sin(rad);
    const dLat = dn / 60;
    const cosLat = Math.cos(lat * Math.PI / 180) || 0.000001;
    const dLon = de / (60 * cosLat);
    let nextLat = lat + dLat;
    let nextLon = lon + dLon;
    if (nextLat > 90) nextLat = 90; if (nextLat < -90) nextLat = -90;
    if (nextLon > 180) nextLon = 180; if (nextLon < -180) nextLon = -180;
    return { lat: nextLat, lon: nextLon, heading: hd };
  }
  const ruleLabel: Record<string, string> = {
    date: 'Date format',
    geo_point: 'Geo bounds',
    geohash: 'Geohash',
    geo_city: 'Geo city',
    geo_number: 'Geo bounds (number)',
    num_range: 'Number range',
    num_max: 'Number max (0..N)',
    string_list: 'String list',
    image_path: 'Image path',
    ip: 'IP version',
    prefix: 'Prefix',
    phone: 'Phone',
    manual: 'Manual value',
  };
  function allowedRulesForField(field: string): string[] {
    const t: string | undefined = (field && mappingLoaded) ? flattenMappingFields(mappingLoaded)[field] : undefined;
    const opts: string[] = [];
    if (t === 'date') opts.push('date');
    else if (t === 'geo_point') opts.push('geo_point', 'geohash', 'geo_city');
    else if (t === 'ip') opts.push('ip');
    else if (t === 'keyword' || t === 'text') opts.push('prefix', 'phone', 'string_list', 'image_path');
    else if (t === 'integer' || t === 'short' || t === 'long' || t === 'float' || t === 'double') opts.push('geo_number', 'num_range', 'num_max');
    opts.push('manual');
    return opts;
  }
  const [sqlText, setSqlText] = useState('SELECT * FROM flights LIMIT 5');
  const [sqlFetchSize, setSqlFetchSize] = useState(50);
  const [sqlTranslateJson, setSqlTranslateJson] = useState('');
  const [sqlColumns, setSqlColumns] = useState<{ name: string; type: string }[]>([]);
  const [sqlRows, setSqlRows] = useState<unknown[][]>([]);
  const [sqlCursor, setSqlCursor] = useState<string>('');
  const [sqlStatus, setSqlStatus] = useState<string>('');
  const [sqlView, setSqlView] = useState<'table' | 'json'>('table');
  const [sqlJsonMode, setSqlJsonMode] = useState<'text' | 'tree'>('text');
  const [sqlFilter, setSqlFilter] = useState<string>('');
  const [sqlTreeExpanded, setSqlTreeExpanded] = useState<boolean>(true);
  const [sqlSourceType, setSqlSourceType] = useState<'index' | 'data_stream' | 'pattern'>('index');
  const [sqlSourceValue, setSqlSourceValue] = useState<string>('');
  const [sqlTouched, setSqlTouched] = useState<boolean>(false);
  const [sqlPage, setSqlPage] = useState<number>(1);
  const [sqlPageSize, setSqlPageSize] = useState<number>(50);

  function quoteIdent(name: string): string {
    return `"${name}"`;
  }
  function applyDefaultSqlFrom(value: string) {
    if (!value) return;
    const def = `SELECT * FROM ${quoteIdent(value)} LIMIT ${sqlFetchSize}`;
    if (!sqlTouched) setSqlText(def);
  }

  function parseWKTPoint(s: unknown): { lat: number; lon: number } | null {
    if (typeof s !== 'string') return null;
    const m = s.match(/^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i);
    if (!m) return null;
    const lon = Number(m[1]);
    const lat = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }
  function normalizeSqlCell(type: string | undefined, cell: unknown): unknown {
    const t = (type || '').toLowerCase();
    if (t === 'geo_point') {
      const p = parseWKTPoint(cell);
      if (p) return p;
    }
    return cell;
  }
  function normalizeSqlRows(cols: { name: string; type: string }[], rows: unknown[][]): unknown[][] {
    const out: unknown[][] = [];
    for (const r of rows) {
      const next: unknown[] = [];
      for (let i = 0; i < r.length; i++) {
        next.push(normalizeSqlCell(cols[i]?.type, r[i]));
      }
      out.push(next);
    }
    return out;
  }
  function cellToString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function isSqlReadableQuery(sql: string): boolean {
    const s = (sql || '').trim().toLowerCase();
    if (!s) return false;
    if (s.startsWith('(')) return true;
    return (
      s.startsWith('select') ||
      s.startsWith('with') ||
      s.startsWith('show') ||
      s.startsWith('desc') ||
      s.startsWith('describe') ||
      s.startsWith('explain') ||
      s.startsWith('sys') ||
      s.startsWith('debug')
    );
  }
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [exampleId, setExampleId] = useState<string>('');
  const [granularity, setGranularity] = useState<Granularity>('hour');
  const [distribution, setDistribution] = useState<Distribution>('uniform');
  const [rate, setRate] = useState<number>(10);
  const [indices, setIndices] = useState<string[]>([]);
  const [indicesStatus, setIndicesStatus] = useState<string>('');
  const [dataStreams, setDataStreams] = useState<string[]>([]);
  const [dataStreamsStatus, setDataStreamsStatus] = useState<string>('');
  const [cmpA, setCmpA] = useState<string>('');
  const [cmpB, setCmpB] = useState<string>('');
  const [cmpStatus, setCmpStatus] = useState<string>('');
  const [cmpAdded, setCmpAdded] = useState<string[]>([]);
  const [cmpRemoved, setCmpRemoved] = useState<string[]>([]);
  const [cmpChanged, setCmpChanged] = useState<TypeChange[]>([]);
  const [activeTab, setActiveTab] = useState<'connections' | 'schema' | 'compare' | 'sql' | 'delete'>('connections');
  const [delIndex, setDelIndex] = useState<string>('');
  const [delQueryText, setDelQueryText] = useState<string>('');
  const [delExampleId, setDelExampleId] = useState<string>('');
  const [delPreviewSize, setDelPreviewSize] = useState<number>(10);
  const [delPreviewDocs, setDelPreviewDocs] = useState<Record<string, unknown>[]>([]);
  const [delPreviewStatus, setDelPreviewStatus] = useState<string>('');
  const [delView, setDelView] = useState<'json' | 'table'>('json');
  const [delJsonMode, setDelJsonMode] = useState<'text' | 'tree'>('text');
  const [delTreeExpanded, setDelTreeExpanded] = useState<boolean>(true);
  const [delFilter, setDelFilter] = useState<string>('');
  const [delStatus, setDelStatus] = useState<string>('');
  const [delTaskId, setDelTaskId] = useState<string>('');
  const [delInProgress, setDelInProgress] = useState<boolean>(false);
  const [delCtrl, setDelCtrl] = useState<AbortController | null>(null);
  const [delPercent, setDelPercent] = useState<number>(0);
  const [delPage, setDelPage] = useState<number>(1);
  const [delPageSize, setDelPageSize] = useState<number>(10);

  useEffect(() => {
    (async () => {
      if (!selected) { setIndices([]); setIndicesStatus(''); return; }
      setIndicesStatus('Loading indices…');
      const res = await listIndices(selected);
      if (!res.ok || !res.names) {
        setIndices([]);
        setIndicesStatus(res?.error || `HTTP ${res?.status}`);
        return;
      }
      const names = res.names.filter(n => !n.startsWith('.'));
      setIndices(names);
      setIndicesStatus(`Loaded ${names.length} indices`);

      setDataStreamsStatus('Loading data streams…');
      const ds = await listDataStreams(selected);
      if (!ds.ok || !ds.names) {
        setDataStreams([]);
        setDataStreamsStatus(ds?.error || `HTTP ${ds?.status}`);
      } else {
        const dsNames = ds.names.filter(n => !n.startsWith('.'));
        setDataStreams(dsNames);
        setDataStreamsStatus(`Loaded ${dsNames.length} data streams`);
      }
    })();
  }, [selected]);


  function update<K extends keyof Connection>(key: K, value: Connection[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function addConnection() {
    const next = [...connections, { ...form, id: crypto.randomUUID() }];
    setConnections(next);
    saveConnections(next);
    setSelectedId(next[next.length - 1].id);
  }

  function addLocalConnection() {
    const local: Connection = {
      id: crypto.randomUUID(),
      name: 'Local ES',
      url: 'http://localhost:9200',
      authType: 'basic',
    };
    const next = [...connections, local];
    setConnections(next);
    saveConnections(next);
    setSelectedId(local.id);
  }

  function removeSelected() {
    if (!selected) return;
    const next = connections.filter(c => c.id !== selected.id);
    setConnections(next);
    saveConnections(next);
    setSelectedId(next[0]?.id || '');
  }

  async function testSelected() {
    if (!selected) return;
    setTesting(true);
    setResult('');
    const res = await pingHealth(selected);
    setTesting(false);
    if (res.ok) {
      setResult(res.body || `HTTP ${res.status}`);
    } else {
      setResult(res.error || `HTTP ${res.status}`);
    }
  }

  function updateSelected<K extends keyof Connection>(key: K, value: Connection[K]) {
    if (!selected) return;
    const next = connections.map(c => c.id === selected.id ? { ...c, [key]: value } : c);
    setConnections(next);
    saveConnections(next);
  }

  return (
    <div className="container">
      <h1>Elasticsearch Data Generator</h1>
      <div className="tabs">
        <button className={activeTab === 'connections' ? 'tab active' : 'tab'} onClick={() => setActiveTab('connections')}><span className="tab-icon">🔗</span><span>Connections</span></button>
        <button className={activeTab === 'schema' ? 'tab active' : 'tab'} onClick={() => setActiveTab('schema')}><span className="tab-icon">📐</span><span>Schema Generator</span></button>
        <button className={activeTab === 'sql' ? 'tab active' : 'tab'} onClick={() => setActiveTab('sql')}><span className="tab-icon">🧾</span><span>Elasticsearch Editor (Using SQL Query)</span></button>
        <button className={activeTab === 'compare' ? 'tab active' : 'tab'} onClick={() => setActiveTab('compare')}><span className="tab-icon">🔍</span><span>Compare Schemas</span></button>
        <button className={activeTab === 'delete' ? 'tab active' : 'tab'} onClick={() => setActiveTab('delete')}><span className="tab-icon">🗑️</span><span>Delete By Query</span></button>
      </div>

      {activeTab === 'connections' && (
      <section>
        <div className="section-header">
          <h2>Connections</h2>
        </div>
        <div className="row">
          <div className="col">
            <label>Name</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} />
          </div>
          <div className="col">
            <label>URL</label>
            <input value={form.url} onChange={e => update('url', e.target.value)} placeholder="http://localhost:9200" />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Auth Type</label>
            <select value={form.authType} onChange={e => update('authType', e.target.value as AuthType)}>
              <option value="basic">Basic</option>
              <option value="apiKey">API Key</option>
            </select>
          </div>
          {form.authType === 'basic' ? (
            <>
              <div className="col">
                <label>Username</label>
                <input value={form.username} onChange={e => update('username', e.target.value)} />
              </div>
              <div className="col">
                <label>Password</label>
                <input type="password" value={form.password} onChange={e => update('password', e.target.value)} />
              </div>
            </>
          ) : (
            <div className="col">
              <label>API Key</label>
              <input value={form.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="base64Key" />
            </div>
          )}
        </div>
        <div className="row">
          <button onClick={addConnection}>Save Connection</button>
          <button onClick={addLocalConnection}>Add Local ES</button>
        </div>

        <div className="section-header">
          <h2>Saved</h2>
        </div>
        {connections.length === 0 ? (
          <p>No saved connections.</p>
        ) : (
          <div className="saved">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.url}</option>
              ))}
            </select>
            {selected && (
              <div className="row">
                <div className="col">
                  <label>URL</label>
                  <input value={selected.url} onChange={e => updateSelected('url', e.target.value)} />
                </div>
                <div className="col">
                  <label>Auth</label>
                  <select value={selected.authType} onChange={e => updateSelected('authType', e.target.value as AuthType)}>
                    <option value="basic">Basic</option>
                    <option value="apiKey">API Key</option>
                  </select>
                </div>
              </div>
            )}
            <div className="row">
              <button onClick={testSelected} disabled={!selected || testing}>Test Connection</button>
              <button onClick={removeSelected} disabled={!selected}>Delete</button>
            </div>
            <pre className="result">{testing ? 'Testing…' : result}</pre>
            <p className="note">Note: Browsers enforce TLS. Self-signed certificates must be trusted by the OS; uploading CA certs is not supported in browser fetch.</p>
          </div>
        )}
      </section>
      )}

      {activeTab === 'schema' && (
      <section>
        <div className="section-header">
          <h2>Schema Generator</h2>
        </div>
        <div className="row">
          <div className="col">
            <label>Index</label>
            <select value={indexName} onChange={e => setIndexName(e.target.value)}>
              <option value="">Select…</option>
              {indices.map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="col">
            <label>Count</label>
            <input type="number" value={genCount} onChange={e => setGenCount(Number(e.target.value))} />
          </div>
          <div className="col">
            <label>Chunk Size</label>
            <input type="number" value={chunkSize} onChange={e => setChunkSize(Number(e.target.value))} placeholder="1000" />
          </div>
        </div>
        <pre className="result">{indicesStatus}</pre>
        <div className="row">
          <div className="col">
            <label>Range Start (ISO)</label>
            <input value={rangeStart} onChange={e => setRangeStart(e.target.value)} placeholder={DEFAULT_START_ISO} />
          </div>
          <div className="col">
            <label>Range End (ISO)</label>
            <input value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} placeholder={DEFAULT_END_ISO} />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Range Preset</label>
            <select value={rangePreset} onChange={e => {
              const p = e.target.value;
              setRangePreset(p);
              const now = new Date();
              let start = new Date(now);
              if (p === 'last-24h') start = new Date(now.getTime() - 24 * 3600_000);
              else if (p === 'last-7d') start = new Date(now.getTime() - 7 * 24 * 3600_000);
              else if (p === 'last-30d') start = new Date(now.getTime() - 30 * 24 * 3600_000);
              else if (p === 'this-week') {
                const d = new Date(now);
                const day = d.getDay();
                const diff = (day + 6) % 7;
                d.setHours(0,0,0,0);
                start = new Date(d.getTime() - diff * 24 * 3600_000);
              } else if (p === 'this-month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
              } else if (p === 'this-year') {
                start = new Date(now.getFullYear(), 0, 1);
              }
              setRangeStart(start.toISOString());
              setRangeEnd(now.toISOString());
            }}>
              <option value="last-24h">Last 24 hours</option>
              <option value="last-7d">Last 7 days</option>
              <option value="last-30d">Last 30 days</option>
              <option value="this-week">This week</option>
              <option value="this-month">This month</option>
              <option value="this-year">This year</option>
            </select>
          </div>
          <div className="col">
            <label>Unit for Count</label>
            <select value={countUnit} onChange={e => setCountUnit(e.target.value as 'second' | 'minute' | 'hour' | 'day')}>
              <option value="second">second</option>
              <option value="minute">minute</option>
              <option value="hour">hour</option>
              <option value="day">day</option>
            </select>
          </div>
          <div className="col">
            <label>Calculated</label>
            <input readOnly value={calcCount} />
          </div>
          <div className="col">
            <button onClick={() => setGenCount(calcCount)}>Apply Count</button>
          </div>
        </div>
        <div className="row">
          <button disabled={!selected} onClick={async () => {
            if (!selected) return;
            setGenStatus('Loading mapping…');
            const res = await fetchMapping(selected, indexName);
            if (!res.ok || !res.json) {
              setGenStatus(res.error || `HTTP ${res.status}`);
              return;
            }
            const mapping = extractMappingFromResponse(res.json, indexName);
            if (!mapping) {
              setGenStatus('No properties found in mapping');
              return;
            }
            setMappingLoaded(mapping);
            setMappingJson(JSON.stringify(mapping, null, 2));
            setGenStatus('Mapping loaded');
          }}>Load Mapping</button>
          <button onClick={() => {
            try {
              const m = JSON.parse(mappingJson);
              setMappingLoaded(m);
              setGenStatus('Mapping set from JSON');
            } catch {
              setGenStatus('Invalid JSON');
            }
          }}>Use JSON</button>
        </div>
        <textarea rows={10} value={mappingJson} onChange={e => setMappingJson(e.target.value)} placeholder="Paste mapping JSON here or click Load Mapping"></textarea>
        {mappingLoaded && (
          <>
            <h3>Field Rules</h3>
            <div className="row">
              <div className="col">
                <label>Field (supports nested paths)</label>
                <select value={ruleField} onChange={e => setRuleField(e.target.value)}>
                  <option value="">Select field</option>
                  {Object.entries(flattenMappingFields(mappingLoaded)).map(([k, t]) => (
                    <option key={k} value={k}>{k} {t ? `(${t})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="col">
                <label>Rule</label>
                <select value={ruleType} onChange={e => { setRuleType(e.target.value); setRuleInputs({}); }}>
                  <option value="">Select rule</option>
                  {allowedRulesForField(ruleField).map(o => (
                    <option key={o} value={o}>{ruleLabel[o]}</option>
                  ))}
                </select>
              </div>
            </div>
            {ruleType === 'date' && (
              <div className="row">
                <div className="col">
                  <label>Format</label>
                  <select value={ruleInputs.format ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, format: e.target.value }))}>
                    <option value="iso">ISO</option>
                    <option value="epoch_millis">epoch_millis</option>
                    <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                    <option value="MM/dd/yy">MM/dd/yy</option>
                    <option value="yyyy/MM/dd">yyyy/MM/dd</option>
                    <option value="dd-MM-yyyy">dd-MM-yyyy</option>
                    <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                    <option value="yyyy-MM-dd HH:mm:ss">yyyy-MM-dd HH:mm:ss</option>
                  </select>
                </div>
                <div className="col">
                  <label>Range Start (ISO)</label>
                  <input value={ruleInputs.rangeStart ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, rangeStart: e.target.value }))} placeholder={DEFAULT_START_ISO} />
                </div>
                <div className="col">
                  <label>Range End (ISO)</label>
                  <input value={ruleInputs.rangeEnd ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, rangeEnd: e.target.value }))} placeholder={DEFAULT_END_ISO} />
                </div>
              </div>
            )}
            {ruleType === 'date' && (
              <div className="row">
                <div className="col">
                  <label>Granularity</label>
                  <select value={(ruleInputs.granularity ?? granularity) as string} onChange={e => setRuleInputs(prev => ({ ...prev, granularity: e.target.value }))}>
                    <option value="hour">hour</option>
                    <option value="minute">minute</option>
                    <option value="second">second</option>
                  </select>
                </div>
                <div className="col">
                  <label>Distribution</label>
                  <select value={(ruleInputs.distribution ?? distribution) as string} onChange={e => setRuleInputs(prev => ({ ...prev, distribution: e.target.value }))}>
                    <option value="uniform">uniform</option>
                    <option value="poisson">poisson</option>
                  </select>
                </div>
                <div className="col">
                  <label>Rate per unit</label>
                  <input type="number" value={Number(ruleInputs.rate ?? rate)} onChange={e => setRuleInputs(prev => ({ ...prev, rate: e.target.value }))} />
                </div>
              </div>
            )}
            {ruleType === 'geohash' && (
              <div className="row">
                <div className="col"><label>Precision</label><input type="number" value={ruleInputs.precision ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, precision: e.target.value }))} placeholder="7" /></div>
              </div>
            )}
            {ruleType === 'geo_city' && (
              <div className="row">
                <div className="col">
                  <label>City</label>
                  <select value={ruleInputs.city ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, city: e.target.value }))}>
                    <option value="">Select city</option>
                    <option value="New York">New York</option>
                    <option value="London">London</option>
                    <option value="Mumbai">Mumbai</option>
                    <option value="San Francisco">San Francisco</option>
                    <option value="Paris">Paris</option>
                    <option value="Tokyo">Tokyo</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Los Angeles">Los Angeles</option>
                  </select>
                </div>
              </div>
            )}
            {ruleType === 'geo_point' && (
              <div className="row">
                <div className="col"><label>latMin</label><input value={ruleInputs.latMin ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, latMin: e.target.value }))} /></div>
                <div className="col"><label>latMax</label><input value={ruleInputs.latMax ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, latMax: e.target.value }))} /></div>
                <div className="col"><label>lonMin</label><input value={ruleInputs.lonMin ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, lonMin: e.target.value }))} /></div>
                <div className="col"><label>lonMax</label><input value={ruleInputs.lonMax ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, lonMax: e.target.value }))} /></div>
              </div>
            )}
            {ruleType === 'geo_number' && (
              <div className="row">
                <div className="col">
                  <label>Axis</label>
                  <select value={ruleInputs.axis ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, axis: e.target.value }))}>
                    <option value="lat">lat</option>
                    <option value="lon">lon</option>
                  </select>
                </div>
                <div className="col"><label>min</label><input value={ruleInputs.min ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, min: e.target.value }))} placeholder="-90 or -180" /></div>
                <div className="col"><label>max</label><input value={ruleInputs.max ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, max: e.target.value }))} placeholder="90 or 180" /></div>
              </div>
            )}
            {ruleType === 'num_range' && (
              <div className="row">
                <div className="col"><label>min</label><input value={ruleInputs.min ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, min: e.target.value }))} /></div>
                <div className="col"><label>max</label><input value={ruleInputs.max ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, max: e.target.value }))} /></div>
              </div>
            )}
            {ruleType === 'num_max' && (
              <div className="row">
                <div className="col"><label>min (optional)</label><input value={ruleInputs.min ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, min: e.target.value }))} placeholder="0" /></div>
                <div className="col"><label>max</label><input value={ruleInputs.max ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, max: e.target.value }))} placeholder="100 / 1000" /></div>
              </div>
            )}
            {ruleType === 'ip' && (
              <div className="row">
                <div className="col">
                  <label>Version</label>
                  <select value={ruleInputs.version ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, version: e.target.value }))}>
                    <option value="v4">IPv4</option>
                    <option value="v6">IPv6</option>
                  </select>
                </div>
              </div>
            )}
            {ruleType === 'prefix' && (
              <div className="row">
                <div className="col"><label>Prefix</label><input value={ruleInputs.prefix ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, prefix: e.target.value }))} placeholder="user-" /></div>
              </div>
            )}
            {ruleType === 'phone' && (
              <div className="row">
                <div className="col">
                  <label>Country</label>
                  <select value={ruleInputs.country ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, country: e.target.value }))}>
                    <option value="US">US</option>
                    <option value="GB">GB</option>
                    <option value="IN">IN</option>
                  </select>
                </div>
              </div>
            )}
            {ruleType === 'image_path' && (
              <div className="row">
                <div className="col">
                  <label>Mode</label>
                  <select value={ruleInputs.imgMode ?? 'random'} onChange={e => setRuleInputs(prev => ({ ...prev, imgMode: e.target.value }))}>
                    <option value="static">static</option>
                    <option value="list">list</option>
                    <option value="random">random</option>
                  </select>
                </div>
                { (ruleInputs.imgMode ?? 'random') === 'static' && (
                  <div className="col"><label>Path</label><input value={ruleInputs.path ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, path: e.target.value }))} placeholder="/images/a.jpg" /></div>
                )}
                { (ruleInputs.imgMode ?? 'random') === 'list' && (
                  <div className="col"><label>Values</label><textarea rows={3} value={ruleInputs.values ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, values: e.target.value }))} placeholder="/images/a.jpg, /images/b.png" /></div>
                )}
                { (ruleInputs.imgMode ?? 'random') === 'random' && (
                  <>
                    <div className="col"><label>Base</label><input value={ruleInputs.base ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, base: e.target.value }))} placeholder="/images" /></div>
                    <div className="col"><label>Ext</label><input value={ruleInputs.ext ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, ext: e.target.value }))} placeholder="jpg" /></div>
                  </>
                )}
              </div>
            )}
            {ruleType === 'string_list' && (
              <div className="row">
                <div className="col"><label>Values (comma or newline)</label><textarea rows={3} value={ruleInputs.values ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, values: e.target.value }))} placeholder="A,B,C" /></div>
              </div>
            )}
            {ruleType === 'manual' && (
              <div className="row">
                <div className="col"><label>Value</label><input value={ruleInputs.value ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, value: e.target.value }))} /></div>
              </div>
            )}
            <div className="row">
              <button onClick={() => {
                if (!ruleField || !ruleType) return;
                let rule: FieldRule | null = null;
                if (ruleType === 'date') {
                  const format = (ruleInputs.format ?? 'iso') as DateRule['format'];
                  const rs = ruleInputs.rangeStart;
                  const re = ruleInputs.rangeEnd;
                  const hasRange = !!(rs && re);
                  const range = hasRange ? { start: new Date(rs as string), end: new Date(re as string) } : undefined;
                  rule = { kind: 'date', format, range } as FieldRule;
                  const g = (ruleInputs.granularity ?? granularity) as Granularity;
                  const d = (ruleInputs.distribution ?? distribution) as Distribution;
                  const r = Number(ruleInputs.rate ?? rate);
                  setGranularity(g);
                  setDistribution(d);
                  setRate(r);
                } else if (ruleType === 'geo_point') {
                  const latMin = Number(ruleInputs.latMin ?? -90);
                  const latMax = Number(ruleInputs.latMax ?? 90);
                  const lonMin = Number(ruleInputs.lonMin ?? -180);
                  const lonMax = Number(ruleInputs.lonMax ?? 180);
                  rule = { kind: 'geo_point', latMin, latMax, lonMin, lonMax };
                } else if (ruleType === 'ip') {
                  const version = (ruleInputs.version ?? 'v4') as 'v4' | 'v6';
                  rule = { kind: 'ip', version };
                } else if (ruleType === 'prefix') {
                  rule = { kind: 'prefix', prefix: ruleInputs.prefix ?? '' };
                } else if (ruleType === 'phone') {
                  const country = (ruleInputs.country ?? 'US') as 'US' | 'GB' | 'IN';
                  rule = { kind: 'phone', country };
                } else if (ruleType === 'manual') {
                  rule = { kind: 'manual', value: ruleInputs.value ?? '' };
                } else if (ruleType === 'geohash') {
                  const precision = Number(ruleInputs.precision ?? 7);
                  rule = { kind: 'geohash', precision };
                } else if (ruleType === 'geo_city') {
                  const city = ruleInputs.city ?? '';
                  rule = { kind: 'geo_city', city };
                } else if (ruleType === 'geo_number') {
                  const axis = (ruleInputs.axis ?? 'lat') as 'lat' | 'lon';
                  const min = Number(ruleInputs.min ?? (axis === 'lat' ? -90 : -180));
                  const max = Number(ruleInputs.max ?? (axis === 'lat' ? 90 : 180));
                  rule = { kind: 'geo_number', axis, min, max } as FieldRule;
                } else if (ruleType === 'num_range') {
                  const min = Number(ruleInputs.min ?? 0);
                  const max = Number(ruleInputs.max ?? 100);
                  rule = { kind: 'num_range', min, max } as FieldRule;
                } else if (ruleType === 'num_max') {
                  const min = Number(ruleInputs.min ?? 0);
                  const max = Number(ruleInputs.max ?? 100);
                  rule = { kind: 'num_max', min, max } as FieldRule;
                } else if (ruleType === 'string_list') {
                  const raw = String(ruleInputs.values ?? '');
                  const values = raw.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0);
                  rule = { kind: 'string_list', values } as FieldRule;
                } else if (ruleType === 'image_path') {
                  const mode = (ruleInputs.imgMode ?? 'random') as 'static' | 'list' | 'random';
                  if (mode === 'static') {
                    const path = ruleInputs.path ?? '';
                    rule = { kind: 'image_path', mode, path } as FieldRule;
                  } else if (mode === 'list') {
                    const raw = String(ruleInputs.values ?? '');
                    const values = raw.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0);
                    rule = { kind: 'image_path', mode, values } as FieldRule;
                  } else {
                    const base = ruleInputs.base ?? '/images';
                    const ext = ruleInputs.ext ?? 'jpg';
                    rule = { kind: 'image_path', mode, base, ext } as FieldRule;
                  }
                }
                if (rule) {
                  setRules(prev => ({ ...prev, [ruleField]: rule as FieldRule }));
                }
              }}>Add Rule</button>
            </div>
            {Object.keys(rules).length > 0 && (
              <div className="row">
                <div className="col">
                  <label>Rules</label>
                  <select size={4}>
                    {Object.entries(rules).map(([k, v]) => (
                      <option key={k} value={k}>{k}: {(v as FieldRule).kind}</option>
                    ))}
                  </select>
                </div>
                <div className="col">
                  <button onClick={() => setRules({})}>Clear Rules</button>
                </div>
              </div>
            )}
            <h3>Preview</h3>
            <div className="row">
              <div className="col">
                <label>Sample Count (5–10)</label>
                <input type="number" value={sampleCount} onChange={e => setSampleCount(Number(e.target.value))} />
              </div>
              <div className="col">
                <label>Compact mode</label>
                <input type="checkbox" checked={compactMode} onChange={e => setCompactMode(e.target.checked)} />
              </div>
            </div>
            <div className="row">
              <button disabled={!selected || !mappingLoaded} onClick={() => {
                if (!selected || !mappingLoaded) return;
                const start = rangeStart ? new Date(rangeStart) : new Date(Date.now()-86400000);
                const end = rangeEnd ? new Date(rangeEnd) : new Date();
                const count = Math.min(Math.max(5, Number(sampleCount) || 5), 10);
                const docs = generateDocs(mappingLoaded, count, { start, end }, rules);
                setPreviewDocs(docs as Record<string, unknown>[]);
                setPreviewStatus(`Previewing ${docs.length} sample documents`);
                setPreviewReady(true);
                setPreviewConfig(currentPreviewConfig);
                setPreviewJsonMode('text');
              }}>Preview</button>
              <button disabled={previewDocs.length === 0} onClick={() => { setPreviewDocs([]); setPreviewStatus('Cleared preview'); setPreviewReady(false); setPreviewConfig(''); }}>Clear Preview</button>
              <button disabled={previewDocs.length === 0} onClick={() => setPreviewView(previewView === 'json' ? 'table' : 'json')}>{previewView === 'json' ? 'View as Table' : 'View as JSON'}</button>
              {previewView === 'json' && (
                <>
                  <button disabled={previewDocs.length === 0} onClick={() => setPreviewJsonMode(previewJsonMode === 'text' ? 'tree' : 'text')}>{previewJsonMode === 'text' ? 'Tree View' : 'Text View'}</button>
                  {previewJsonMode === 'tree' && (
                    <>
                      <button disabled={previewDocs.length === 0} onClick={() => setPreviewTreeExpanded(true)}>Expand All</button>
                      <button disabled={previewDocs.length === 0} onClick={() => setPreviewTreeExpanded(false)}>Collapse All</button>
                      <input placeholder="Filter keys" value={previewFilter} onChange={e => setPreviewFilter(e.target.value)} />
                    </>
                  )}
                </>
              )}
            </div>
            {previewDocs.length > 0 && previewView === 'json' && (
              <div className="row">
                <div className="col">
                  <label>Preview JSON</label>
                  {previewJsonMode === 'text' ? (
                    <pre className="result result-pre">{JSON.stringify(previewDocs, null, 2)}</pre>
                  ) : (
                    <div className="json-tree result">
                      {renderJsonTree(previewDocs, { expanded: previewTreeExpanded, filter: previewFilter })}
                    </div>
                  )}
                </div>
              </div>
            )}
            {previewDocs.length > 0 && previewView === 'table' && (
              <div className="row">
                <div className="col">
                  <label>Preview Table</label>
                  <div className={`table-wrap ${compactMode ? 'compact' : ''}`}>
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(mappingLoaded.properties).map((k) => (<th key={k}>{k}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewDocs.slice((previewPage-1)*previewPageSize, (previewPage-1)*previewPageSize + previewPageSize).map((doc, i) => (
                          <tr key={i}>
                            {Object.keys(mappingLoaded.properties).map((k) => (
                              <td key={k}>{String((doc as Record<string, unknown>)[k])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {previewDocs.length > 0 && previewView === 'table' && (
              <div className="row table-pagination">
                <div className="col">
                  <button disabled={previewPage<=1} onClick={() => setPreviewPage(p => Math.max(1, p-1))}>Prev</button>
                </div>
                <div className="col">
                  <div>Page {previewPage} of {Math.max(1, Math.ceil(previewDocs.length / previewPageSize))}</div>
                </div>
                <div className="col">
                  <button disabled={previewPage>=Math.ceil(previewDocs.length/previewPageSize)} onClick={() => setPreviewPage(p => p+1)}>Next</button>
                </div>
                <div className="col">
                  <label>Page Size</label>
                  <input type="number" value={previewPageSize} onChange={e => { const s = Math.max(1, Number(e.target.value)||10); setPreviewPageSize(s); setPreviewPage(1); }} />
                </div>
              </div>
            )}
            <pre className="result">{previewStatus}</pre>
          </>
        )}
        <div className="row">
          <button disabled={!selected || !mappingLoaded || uploading || !previewReady || previewConfig !== currentPreviewConfig} onClick={async () => {
            if (!selected || !mappingLoaded) return;
            const start = rangeStart ? new Date(rangeStart) : new Date(Date.now()-86400000);
            const end = rangeEnd ? new Date(rangeEnd) : new Date();
            const docs = generateDocs(mappingLoaded, genCount, { start, end }, rules);
            setGenStatus(`Generated ${docs.length} docs. Uploading…`);
            setTotalDocs(docs.length);
            setProcessed(0);
            setSuccCount(0);
            setFailCount(0);
            const ctrl = new AbortController();
            setBulkCtrl(ctrl);
            setUploading(true);
            const cs = Math.min(Math.max(1, Number(chunkSize) || 1000), 10000);
            const res = await bulkInsert(selected, indexName, docs, cs, {
              signal: ctrl.signal,
              onProgress: (info) => {
                setProcessed(info.processed);
                setTotalDocs(info.total);
                setSuccCount(info.succeeded);
                setFailCount(info.failed);
                setGenStatus(`Uploading ${info.processed}/${info.total} (chunk ${info.chunkIndex + 1}/${info.chunkCount})…`);
              },
            });
            setUploading(false);
            setBulkCtrl(null);
            if (!res.ok) {
              const msg = res.error || `Bulk failed HTTP ${res.status}`;
              setGenStatus(`${msg} — processed ${processed}/${totalDocs}, succeeded ${succCount}, failed ${failCount}`);
            } else {
              const succeeded = res.succeeded ?? succCount;
              const failed = res.failed ?? failCount;
              setGenStatus(`Requested ${docs.length}, succeeded ${succeeded}, failed ${failed}`);
            }
          }}>Confirm & Generate + Insert</button>
          <button disabled={!uploading} onClick={() => { bulkCtrl?.abort(); }}>Cancel</button>
        </div>
        <h3>Real-Time Mode</h3>
        <div className="row">
          <div className="col">
            <label>Enable</label>
            <input type="checkbox" checked={rtEnabled} onChange={e => setRtEnabled(e.target.checked)} />
          </div>
        </div>
        {rtEnabled && (
          <div className="row">
            <button disabled={!selected || !mappingLoaded || rtRunning} onClick={async () => {
              if (!selected || !mappingLoaded) return;
              setRtInserted(0);
              setRtLastDoc(null);
              setRtStatus('Starting real-time inserts…');
              // Determine fields
              const dateFields = listFieldsByType(mappingLoaded, 'date');
              const geoFields = listFieldsByType(mappingLoaded, 'geo_point');
              const numFloatFields = listFieldsByType(mappingLoaded, 'float').concat(listFieldsByType(mappingLoaded, 'double'));
              const intFields = listFieldsByType(mappingLoaded, 'integer').concat(listFieldsByType(mappingLoaded, 'short')).concat(listFieldsByType(mappingLoaded, 'long'));
              const keywordFields = listFieldsByType(mappingLoaded, 'keyword');
              const tsField = (dateFields.find(f => f.toLowerCase().includes('timestamp')) ?? dateFields[0]) || 'timestamp';
              const posField = (geoFields.find(f => f.toLowerCase().includes('position')) ?? geoFields[0]) || 'position';
              const speedField = (numFloatFields.find(f => f.toLowerCase().includes('speed')) ?? numFloatFields[0]) || 'speed';
              const altField = (numFloatFields.find(f => f.toLowerCase().includes('alt')) ?? numFloatFields[0]) || 'altitude';
              const hdgField = (intFields.find(f => f.toLowerCase().includes('heading')) ?? intFields[0]) || 'heading';
              const idField = (keywordFields.find(f => f.toLowerCase().includes('flight')) ?? keywordFields[0]) || 'flight_id';
              // Initial state
              let startLat = 40 + Math.random() * 2;
              let startLon = -74 + Math.random() * 2;
              const gpRule = rules[posField];
              if (gpRule && gpRule.kind === 'geo_point') {
                startLat = Math.min(Math.max(gpRule.latMin, gpRule.latMax), Math.max(gpRule.latMin, gpRule.latMax));
                startLat = gpRule.latMin + Math.random() * (gpRule.latMax - gpRule.latMin);
                startLon = gpRule.lonMin + Math.random() * (gpRule.lonMax - gpRule.lonMin);
              }
              let speed = 500;
              const spRule = rules[speedField];
              if (spRule && spRule.kind === 'geo_number') {
                speed = spRule.min + Math.random() * (spRule.max - spRule.min);
              }
              let heading = Math.floor(Math.random() * 360);
              const hdRule = rules[hdgField];
              if (hdRule && hdRule.kind === 'geo_number') {
                heading = Math.floor(hdRule.min + Math.random() * (hdRule.max - hdRule.min));
              }
              let altitude = 35000;
              const alRule = rules[altField];
              if (alRule && alRule.kind === 'geo_number') {
                altitude = alRule.min + Math.random() * (alRule.max - alRule.min);
              }
              setRtState({ lat: startLat, lon: startLon, heading, speed, altitude });
              setRtRunning(true);
              setRtStatus('Real-time inserts running (1/min)');
              const id = window.setInterval(async () => {
                setRtState(prev => {
                  const p = prev ?? { lat: startLat, lon: startLon, heading, speed, altitude };
                  const next = computeNext(p.lat, p.lon, p.speed, p.heading);
                  const now = new Date();
                  const idRule = rules[idField];
                  const idVal = (idRule && idRule.kind === 'prefix') ? `${idRule.prefix}${Math.floor(Math.random()*100000)}` : `FLIGHT${Math.floor(Math.random()*100000)}`;
                  const doc: Record<string, unknown> = {};
                  doc[tsField] = now.toISOString();
                  doc[posField] = { lat: next.lat, lon: next.lon };
                  doc[speedField] = p.speed;
                  doc[altField] = p.altitude;
                  doc[hdgField] = Math.floor(next.heading);
                  doc[idField] = idVal;
                  setRtLastDoc(doc);
                  (async () => {
                    const res = await bulkInsert(selected!, indexName, [doc], 1);
                    if (!res.ok) {
                      setRtStatus(res.error || `Bulk failed HTTP ${res.status}`);
                    } else {
                      setRtInserted(prev => {
                        const next = prev + 1;
                        setRtStatus(`Inserted ${next} docs in real-time`);
                        return next;
                      });
                    }
                  })();
                  return { lat: next.lat, lon: next.lon, heading: next.heading, speed: p.speed, altitude: p.altitude };
                });
              }, 60000);
              setRtTimerId(id);
            }}>Start</button>
            <button disabled={!rtRunning} onClick={() => {
              if (rtTimerId) { window.clearInterval(rtTimerId); }
              setRtTimerId(null);
              setRtRunning(false);
              setRtStatus('Stopped');
            }}>Stop</button>
          </div>
        )}
        {rtEnabled && (
          <div className="row">
            <div className="col">
              <label>Last Real-Time Doc</label>
              <pre className="result">{rtLastDoc ? JSON.stringify(rtLastDoc, null, 2) : 'None'}</pre>
            </div>
            <div className="col">
              <label>Current Position</label>
              <pre className="result">{rtState ? JSON.stringify(rtState, null, 2) : 'N/A'}</pre>
            </div>
          </div>
        )}
        {rtEnabled && (
          <div className="row">
            <div className="col">
              <label>Real-Time Status</label>
              <pre className="result">{rtStatus}</pre>
            </div>
            <div className="col">
              <label>Inserted Count</label>
              <pre className="result">{String(rtInserted)}</pre>
            </div>
          </div>
        )}
        {totalDocs > 0 && (
          <div className="row">
            <div className="col">
              <label>Progress</label>
              <progress value={processed} max={totalDocs}></progress>
              <div>{processed}/{totalDocs} — ok {succCount}, failed {failCount}</div>
            </div>
          </div>
        )}
        <pre className="result">{genStatus}</pre>
      </section>
      )}
      {activeTab === 'compare' && (
      <section>
        <div className="section-header">
          <h2>Compare Schemas</h2>
        </div>
        <div className="row">
          <div className="col">
            <label>Old Index</label>
            <select value={cmpA} onChange={e => setCmpA(e.target.value)}>
              <option value="">Select…</option>
              {indices.map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="col">
            <label>New Index</label>
            <select value={cmpB} onChange={e => setCmpB(e.target.value)}>
              <option value="">Select…</option>
              {indices.map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
        </div>
        <pre className="result">{indicesStatus}</pre>
        <div className="row">
          <button disabled={!selected || !cmpA || !cmpB} onClick={async () => {
            if (!selected || !cmpA || !cmpB) return;
            setCmpStatus('Loading…');
            const rA = await fetchMapping(selected, cmpA);
            const rB = await fetchMapping(selected, cmpB);
            if (!rA.ok || !rA.json) { setCmpStatus(rA.error || `HTTP ${rA.status}`); return; }
            if (!rB.ok || !rB.json) { setCmpStatus(rB.error || `HTTP ${rB.status}`); return; }
            const mA = extractMappingFromResponse(rA.json, cmpA) ?? extractAnyMapping(rA.json);
            const mB = extractMappingFromResponse(rB.json, cmpB) ?? extractAnyMapping(rB.json);
            if (!mA || !mB) { setCmpStatus('No properties found'); return; }
            const d = diffMappings(mA, mB);
            setCmpAdded(d.added);
            setCmpRemoved(d.removed);
            setCmpChanged(d.changed);
            setCmpStatus(`Compared ${cmpA} vs ${cmpB}`);
          }}>Compare</button>
          <button onClick={() => { setCmpAdded([]); setCmpRemoved([]); setCmpChanged([]); setCmpStatus('Cleared'); }}>Clear</button>
        </div>
        <div className="row">
          <div className="col">
            <label>Added Fields</label>
            {cmpAdded.length === 0 ? (<p>None</p>) : (
              <select size={5}>{cmpAdded.map(f => (<option key={f} value={f}>{f}</option>))}</select>
            )}
          </div>
          <div className="col">
            <label>Removed Fields</label>
            {cmpRemoved.length === 0 ? (<p>None</p>) : (
              <select size={5}>{cmpRemoved.map(f => (<option key={f} value={f}>{f}</option>))}</select>
            )}
          </div>
        </div>
        {cmpChanged.length > 0 && (
          <div className="row">
            <div className="col">
              <label>Type Changes</label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Field</th><th>Old</th><th>New</th></tr>
                  </thead>
                  <tbody>
                    {cmpChanged.map((c, i) => (
                      <tr key={i}><td>{c.field}</td><td>{c.from ?? ''}</td><td>{c.to ?? ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <pre className="result">{cmpStatus}</pre>
      </section>
      )}


      

      {activeTab === 'sql' && (
      <section>
        <div className="section-header">
          <h2>Elasticsearch Editor (Using SQL Query)</h2>
        </div>
        <div className="row">
          <div className="col">
            <label>Source Type</label>
            <select value={sqlSourceType} onChange={e => { const t = e.target.value as 'index'|'data_stream'|'pattern'; setSqlSourceType(t); setSqlSourceValue(''); }}>
              <option value="index">Index</option>
              <option value="data_stream">Data Stream</option>
              <option value="pattern">Index Pattern</option>
            </select>
          </div>
          {sqlSourceType === 'index' && (
            <div className="col">
              <label>Index</label>
              <select value={sqlSourceValue} onChange={e => { const v = e.target.value; setSqlSourceValue(v); applyDefaultSqlFrom(v); }}>
                <option value="">Select…</option>
                {indices.map(n => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
          )}
          {sqlSourceType === 'data_stream' && (
            <div className="col">
              <label>Data Stream</label>
              <select value={sqlSourceValue} onChange={e => { const v = e.target.value; setSqlSourceValue(v); applyDefaultSqlFrom(v); }}>
                <option value="">Select…</option>
                {dataStreams.map(n => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
          )}
          {sqlSourceType === 'pattern' && (
            <div className="col">
              <label>Index Pattern</label>
              <input value={sqlSourceValue} onChange={e => { const v = e.target.value; setSqlSourceValue(v); applyDefaultSqlFrom(v); }} placeholder="logs-*-2025.*" />
            </div>
          )}
        </div>
        <pre className="result">{dataStreamsStatus}</pre>
        <div className="row">
          <div className="col">
            <label>SQL</label>
            <textarea rows={6} value={sqlText} onChange={e => { setSqlText(e.target.value); setSqlTouched(true); }} placeholder="SELECT * FROM index WHERE field > 10 ORDER BY field LIMIT 50"></textarea>
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Examples</label>
            <select value={exampleId} onChange={e => { const id = e.target.value; setExampleId(id); const ex = SQL_EXAMPLES.find(x => x.id === id); if (ex) setSqlText(ex.query); }}>
              <option value="">Choose example…</option>
              {SQL_EXAMPLES.map(ex => (<option key={ex.id} value={ex.id}>{ex.label}</option>))}
            </select>
          </div>
          <div className="col">
            <label>Compact mode</label>
            <input type="checkbox" checked={compactMode} onChange={e => setCompactMode(e.target.checked)} />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Fetch Size</label>
            <input type="number" value={sqlFetchSize} onChange={e => setSqlFetchSize(Number(e.target.value))} />
          </div>
        </div>
        <div className="row">
          <button disabled={!selected} onClick={async () => {
            if (!selected) return;
            setSqlStatus('Translating…');
            if (!isSqlReadableQuery(sqlText)) {
              setSqlStatus('Only readable SQL is supported: SELECT, WITH, SHOW, DESC/DESCRIBE, EXPLAIN');
              return;
            }
            const res = await translateSql(selected, sqlText);
            if (!res.ok || !res.json) {
              setSqlStatus(res.error || `HTTP ${res.status}`);
              return;
            }
            setSqlTranslateJson(JSON.stringify(res.json, null, 2));
            setSqlStatus('Translated');
          }}>Translate</button>
              <button disabled={!selected} onClick={async () => {
                if (!selected) return;
                setSqlStatus('Executing…');
                if (!isSqlReadableQuery(sqlText)) {
                  setSqlStatus('Only readable SQL is supported: SELECT, WITH, SHOW, DESC/DESCRIBE, EXPLAIN');
                  return;
                }
                const res = await executeSql(selected, sqlText, sqlFetchSize);
                if (!res.ok || !res.json) {
                  setSqlStatus(res.error || `HTTP ${res.status}`);
                  return;
                }
                const cols = res.json.columns;
                const rows = normalizeSqlRows(cols, res.json.rows);
                setSqlColumns(cols);
                setSqlRows(rows);
                setSqlCursor(res.json.cursor || '');
                setSqlStatus(`Fetched ${res.json.rows.length} rows`);
                setSqlPage(1);
                setSqlPageSize(sqlFetchSize);
              }}>Execute</button>
          <button disabled={!selected || !sqlCursor} onClick={async () => {
            if (!selected || !sqlCursor) return;
            setSqlStatus('Next page…');
            const res = await nextSqlPage(selected, sqlCursor);
            if (!res.ok || !res.json) {
              setSqlStatus(res.error || `HTTP ${res.status}`);
              return;
            }
            const page = res.json!;
            setSqlRows(prev => [...prev, ...normalizeSqlRows(sqlColumns, page.rows)]);
            setSqlCursor(page.cursor || '');
            setSqlStatus(`Fetched +${page.rows.length} rows`);
          }}>Next Page</button>
          <button disabled={!selected || !sqlCursor} onClick={async () => {
            if (!selected || !sqlCursor) return;
            await closeSqlCursor(selected, sqlCursor);
            setSqlCursor('');
            setSqlStatus('Cursor closed');
          }}>Close Cursor</button>
          <button onClick={() => { setSqlTranslateJson(''); setSqlColumns([]); setSqlRows([]); setSqlCursor(''); setSqlStatus('Cleared'); }}>Clear</button>
        </div>
        <div className="row">
          <div className="col">
            <label>Translation</label>
            <pre className="result">{sqlTranslateJson || 'No translation yet'}</pre>
          </div>
        </div>
        {sqlColumns.length > 0 && sqlView === 'table' && (
          <div className="row">
            <div className="col">
              <label>Results</label>
              <div className={`table-wrap ${compactMode ? 'compact' : ''}`}>
                <table>
                  <thead>
                    <tr>
                      {sqlColumns.map((c: { name: string; type: string }) => (<th key={c.name}>{c.name}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlRows.slice((sqlPage-1)*sqlPageSize, (sqlPage-1)*sqlPageSize + sqlPageSize).map((r: unknown[], i: number) => (
                      <tr key={i}>
                        {r.map((cell: unknown, j: number) => (<td key={j}>{cellToString(cell)}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {sqlColumns.length > 0 && sqlView === 'table' && (
          <div className="row table-pagination">
            <div className="col">
              <button disabled={sqlPage<=1} onClick={() => setSqlPage(p => Math.max(1, p-1))}>Prev</button>
            </div>
            <div className="col">
              <div>Page {sqlPage} of {Math.max(1, Math.ceil(sqlRows.length / sqlPageSize))}</div>
            </div>
            <div className="col">
              <button disabled={sqlPage>=Math.ceil(sqlRows.length/sqlPageSize)} onClick={() => setSqlPage(p => p+1)}>Next</button>
            </div>
            <div className="col">
              <label>Page Size</label>
              <input type="number" value={sqlPageSize} onChange={e => { const s = Math.max(1, Number(e.target.value)||50); setSqlPageSize(s); setSqlPage(1); }} />
            </div>
          </div>
        )}
        {sqlColumns.length > 0 && sqlView === 'json' && (
          <>
            <div className="row">
              <div className="col">
                <label>Results JSON</label>
              </div>
              <div className="col">
                <select value={sqlJsonMode} onChange={e => setSqlJsonMode(e.target.value as 'text' | 'tree')}>
                  <option value="text">Text</option>
                  <option value="tree">Tree</option>
                </select>
              </div>
              {sqlJsonMode === 'tree' && (
                <>
                  <div className="col"><button onClick={() => setSqlTreeExpanded(true)}>Expand All</button></div>
                  <div className="col"><button onClick={() => setSqlTreeExpanded(false)}>Collapse All</button></div>
                  <div className="col"><input placeholder="Filter keys" value={sqlFilter} onChange={e => setSqlFilter(e.target.value)} /></div>
                </>
              )}
            </div>
            <div className="row">
              <div className="col">
                {sqlJsonMode === 'text' ? (
                  <pre className="result result-pre">{JSON.stringify(sqlRows.map((r: unknown[]) => {
                    const obj: Record<string, unknown> = {};
                    for (let i = 0; i < r.length; i++) {
                      const k = sqlColumns[i]?.name ?? String(i);
                      obj[k] = r[i];
                    }
                    return obj;
                  }), null, 2)}</pre>
                ) : (
                  <div className="json-tree result">
                    {renderJsonTree(sqlRows.map((r: unknown[]) => {
                      const obj: Record<string, unknown> = {};
                      for (let i = 0; i < r.length; i++) {
                        const k = sqlColumns[i]?.name ?? String(i);
                        obj[k] = r[i];
                      }
                      return obj;
                    }), { expanded: sqlTreeExpanded, filter: sqlFilter })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <div className="row">
          <button disabled={sqlColumns.length === 0} onClick={() => setSqlView(sqlView === 'table' ? 'json' : 'table')}>{sqlView === 'table' ? 'View as JSON' : 'View as Table'}</button>
          <button disabled={sqlColumns.length === 0} onClick={() => {
            const cols = sqlColumns.map(c => c.name);
            const esc = (v: unknown): string => {
              const s = v == null ? '' : cellToString(v);
              const e = s.replace(/"/g, '""');
              return /[",\n]/.test(e) ? `"${e}"` : e;
            };
            const lines: string[] = [];
            lines.push(cols.map(n => esc(n)).join(','));
            for (const row of sqlRows) {
              const vals: string[] = [];
              for (let i = 0; i < cols.length; i++) {
                vals.push(esc(row[i]));
              }
              lines.push(vals.join(','));
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'results.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}>Download CSV</button>
        </div>
        <pre className="result">{sqlStatus}</pre>
      </section>
      )}

      {activeTab === 'delete' && (
      <section>
        <div className="section-header">
          <h2>Delete By Query</h2>
        </div>
        <div className="row">
          <div className="col">
            <label>Index</label>
            <select value={delIndex} onChange={e => setDelIndex(e.target.value)}>
              <option value="">Select…</option>
              {indices.map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="col">
            <label>Preview Size</label>
            <input type="number" value={delPreviewSize} onChange={e => setDelPreviewSize(Number(e.target.value))} />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Query JSON</label>
            <textarea rows={6} value={delQueryText} onChange={e => setDelQueryText(e.target.value)} placeholder='{"query":{"match_all":{}}}'></textarea>
          </div>
          <div className="col">
            <label>Examples</label>
            <select value={delExampleId} onChange={e => { const id = e.target.value; setDelExampleId(id); const ex = DEL_QUERY_EXAMPLES.find(x => x.id === id); if (ex) setDelQueryText(ex.body); }}>
              <option value="">Choose example…</option>
              {DEL_QUERY_EXAMPLES.map(ex => (<option key={ex.id} value={ex.id}>{ex.label}</option>))}
            </select>
          </div>
        </div>
        <div className="row">
              <button disabled={!selected || !delIndex} onClick={async () => {
                if (!selected || !delIndex) return;
                setDelPreviewStatus('Previewing…');
                let body: unknown;
                try {
                  body = delQueryText ? JSON.parse(delQueryText) : { query: { match_all: {} } };
                } catch {
                  setDelPreviewStatus('Invalid JSON');
                  return;
                }
                const merged = { size: delPreviewSize, ...((body as Record<string, unknown>) ?? {}) } as unknown;
                const res = await searchPreview(selected, delIndex, merged);
                if (!res.ok || !res.json) { setDelPreviewStatus(res.error || `HTTP ${res.status}`); setDelPreviewDocs([]); return; }
                const j = res.json as Record<string, unknown>;
                const hits = ((j.hits as Record<string, unknown>)?.hits as Array<unknown>) || [];
                const docs: Record<string, unknown>[] = hits.map(h => (typeof h === 'object' && h && (h as Record<string, unknown>)._source && typeof (h as Record<string, unknown>)._source === 'object') ? ((h as Record<string, unknown>)._source as Record<string, unknown>) : {});
                const totalObj = (j.hits && typeof (j.hits as Record<string, unknown>).total === 'object') ? ((j.hits as Record<string, unknown>).total as Record<string, unknown>) : null;
                const total = totalObj && typeof totalObj.value === 'number' ? (totalObj.value as number) : docs.length;
                setDelPreviewDocs(docs);
                setDelPreviewStatus(`Matched ${total} docs • Showing ${docs.length}`);
                setDelPage(1);
                setDelPageSize(delPreviewSize);
              }}>Preview Matches</button>
          <button disabled={!selected || !delIndex || delPreviewDocs.length === 0 || delInProgress} onClick={async () => {
            if (!selected || !delIndex) return;
            setDelStatus('Deleting…');
            setDelInProgress(true);
            setDelPercent(0);
            const ctrl = new AbortController();
            setDelCtrl(ctrl);
            let body: unknown;
            try {
              body = delQueryText ? JSON.parse(delQueryText) : { query: { match_all: {} } };
            } catch {
              setDelStatus('Invalid JSON');
              setDelInProgress(false);
              setDelCtrl(null);
              return;
            }
            const res = await deleteByQueryAsync(selected, delIndex, body, {
              signal: ctrl.signal,
              onProgress: (s) => {
                const t = Number(s.status?.total ?? 0);
                const d = Number(s.status?.deleted ?? 0);
                const vc = Number(s.status?.version_conflicts ?? 0);
                const np = Number(s.status?.noops ?? 0);
                const done = d + vc + np;
                const pct = t > 0 ? Math.min(100, Math.floor((done / t) * 100)) : 0;
                setDelPercent(pct);
                setDelStatus(`Progress ${pct}% • Deleted ${d}/${t} • Conflicts ${vc}`);
              },
            });
            setDelTaskId(res.taskId || '');
            if (!res.ok) {
              setDelStatus(res.error || `HTTP ${res.status}`);
              setDelInProgress(false);
              setDelCtrl(null);
              return;
            }
            const j = res.json as Record<string, unknown>;
            const deleted = Number((j.deleted as number) ?? 0);
            const total = Number((j.total as number) ?? 0);
            const conflicts = Number((j.version_conflicts as number) ?? 0);
            const batches = Number((j.batches as number) ?? 0);
            const timedOut = Boolean(j.timed_out);
            const failed = total > 0 ? Math.max(0, total - deleted) : conflicts;
            setDelPercent(100);
            setDelInProgress(false);
            setDelCtrl(null);
            setDelStatus(`Requested ${total} • Deleted ${deleted} • Failed ${failed} • Batches ${batches} • Conflicts ${conflicts} • Timed out ${timedOut}`);
            setDelPreviewDocs([]);
            setDelPreviewStatus('');
          }}>Delete</button>
          <button disabled={!delInProgress || !delTaskId} onClick={async () => {
            if (!delInProgress || !delTaskId) return;
            await cancelTask(selected!, delTaskId);
            delCtrl?.abort();
            setDelInProgress(false);
            setDelCtrl(null);
            setDelPercent(0);
            setDelStatus('Cancelled');
          }}>Cancel</button>
          <button onClick={() => { setDelPreviewDocs([]); setDelPreviewStatus('Cleared'); setDelStatus(''); }}>Clear</button>
        </div>
        {delInProgress && (
          <div className="row">
            <div className="col">
              <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px' }}>
                <div style={{ width: `${delPercent}%`, height: '8px', background: '#3b82f6', borderRadius: '4px' }} />
              </div>
            </div>
          </div>
        )}
        {delPreviewDocs.length > 0 && delView === 'json' && (
          <div className="row">
            <div className="col">
              <label>Preview JSON</label>
              {delJsonMode === 'text' ? (
                <pre className="result">{JSON.stringify(delPreviewDocs, null, 2)}</pre>
              ) : (
                <div className="json-tree result">
                  {renderJsonTree(delPreviewDocs, { expanded: delTreeExpanded, filter: delFilter })}
                </div>
              )}
            </div>
          </div>
        )}
        {delPreviewDocs.length > 0 && delView === 'table' && (
          <div className="row">
            <div className="col">
              <label>Preview Table</label>
              <div className={`table-wrap ${compactMode ? 'compact' : ''}`}>
                <table>
                  <thead>
                    <tr>
                      {Object.keys(delPreviewDocs[0] || {}).map(k => (<th key={k}>{k}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {delPreviewDocs.slice((delPage-1)*delPageSize, (delPage-1)*delPageSize + delPageSize).map((d, i) => (
                      <tr key={i}>
                        {Object.keys(delPreviewDocs[0] || {}).map((k, j) => (<td key={j}>{cellToString(d[k])}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {delPreviewDocs.length > 0 && delView === 'table' && (
          <div className="row table-pagination">
            <div className="col">
              <button disabled={delPage<=1} onClick={() => setDelPage(p => Math.max(1, p-1))}>Prev</button>
            </div>
            <div className="col">
              <div>Page {delPage} of {Math.max(1, Math.ceil(delPreviewDocs.length / delPageSize))}</div>
            </div>
            <div className="col">
              <button disabled={delPage>=Math.ceil(delPreviewDocs.length/delPageSize)} onClick={() => setDelPage(p => p+1)}>Next</button>
            </div>
            <div className="col">
              <label>Page Size</label>
              <input type="number" value={delPageSize} onChange={e => { const s = Math.max(1, Number(e.target.value)||10); setDelPageSize(s); setDelPage(1); }} />
            </div>
          </div>
        )}
        <div className="row">
          <button disabled={delPreviewDocs.length === 0} onClick={() => setDelView(delView === 'json' ? 'table' : 'json')}>{delView === 'json' ? 'View as Table' : 'View as JSON'}</button>
          {delView === 'json' && (
            <>
              <button disabled={delPreviewDocs.length === 0} onClick={() => setDelJsonMode(delJsonMode === 'text' ? 'tree' : 'text')}>{delJsonMode === 'text' ? 'Tree View' : 'Text View'}</button>
              {delJsonMode === 'tree' && (
                <>
                  <button disabled={delPreviewDocs.length === 0} onClick={() => setDelTreeExpanded(true)}>Expand All</button>
                  <button disabled={delPreviewDocs.length === 0} onClick={() => setDelTreeExpanded(false)}>Collapse All</button>
                  <input placeholder="Filter keys" value={delFilter} onChange={e => setDelFilter(e.target.value)} />
                </>
              )}
            </>
          )}
        </div>
        <pre className="result">{delPreviewStatus}</pre>
        <pre className="result">{delStatus}</pre>
      </section>
      )}

    </div>
  );
}

export default App;

function renderJsonTree(value: unknown, opts?: { expanded?: boolean; filter?: string }) {
  function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
  const expanded = opts?.expanded !== false;
  const filter = (opts?.filter ?? '').trim().toLowerCase();
  function hasMatch(v: unknown): boolean {
    if (!filter) return true;
    if (Array.isArray(v)) return v.some(it => hasMatch(it));
    if (isObj(v)) return Object.keys(v).some(k => k.toLowerCase().includes(filter)) || Object.values(v).some(val => hasMatch(val));
    return false;
  }
  function Node({ k, v }: { k?: string; v: unknown }) {
    if (Array.isArray(v)) {
      const children = filter ? v.filter(it => hasMatch(it)) : v;
      if (filter && children.length === 0) return <></>;
      return (
        <details open={expanded}>
          <summary>{k ? `${k}: ` : ''}Array[{children.length}]</summary>
          <div className="json-children">
            {children.map((item, i) => (<Node key={i} v={item} />))}
          </div>
        </details>
      );
    } else if (isObj(v)) {
      const entries = filter ? Object.entries(v).filter(([ck, cv]) => ck.toLowerCase().includes(filter) || hasMatch(cv)) : Object.entries(v);
      if (filter && entries.length === 0) return <></>;
      return (
        <details open={expanded}>
          <summary>{k ? `${k}: ` : ''}Object</summary>
          <div className="json-children">
            {entries.map(([ck, cv]) => (<Node key={ck} k={ck} v={cv} />))}
          </div>
        </details>
      );
    } else {
      const show = !filter || (k ? k.toLowerCase().includes(filter) : false);
      if (!show) return <></>;
      return (
        <div className="json-leaf">
          {k ? (<span className="json-key">{k}: </span>) : null}
          <span className="json-value">{String(v)}</span>
        </div>
      );
    }
  }
  return <Node v={value} />;
}
