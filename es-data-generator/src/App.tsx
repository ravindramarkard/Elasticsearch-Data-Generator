import { useMemo, useState, useEffect, useRef } from 'react';
import './App.css';
import './themes.css';
import * as XLSX from 'xlsx';
import type { Connection, AuthType } from './esClient';
import { pingHealth, fetchMapping, bulkInsert, translateSql, executeSql, nextSqlPage, closeSqlCursor, listIndices, listDataStreams, searchPreview, deleteByQueryAsync, updateByQueryAsync, updateById, cancelTask, getIndexCount } from './esClient';
import { loadConnections, saveConnections, loadGeneratorConfigs, saveGeneratorConfig, deleteGeneratorConfig, loadLastGenerator, saveLastGenerator, loadAuditLogs, saveAuditLogs, clearAuditLogs, deleteOldAuditLogs } from './storage';
import type { GeneratorConfig, AuditEntry } from './storage';
import { extractMappingFromResponse, extractAnyMapping, generateDocs, diffMappings, listFieldsByType, flattenMappingFields, getDateFormatForField, formatDate, calculateNextPosition, CITIES, SEAPORTS, VEHICLE_LOCATIONS } from './generator';
import type { Mapping, FieldRules, FieldRule, Granularity, Distribution, DateRule, TypeChange, GeoPathRule, PhoneRule } from './generator';

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
  { id: 'select-specific', label: 'Select specific fields (avoid arrays)', query: 'SELECT id, name, status, timestamp FROM myindex LIMIT 20' },
  { id: 'exclude-field', label: 'Exclude problematic field', query: 'SELECT id, name, status FROM myindex WHERE status IS NOT NULL LIMIT 20' },
];

const UPDATE_QUERY_EXAMPLES: { id: string; label: string; body: string }[] = [
  { id: 'set-field', label: 'Set field value for all', body: '{"script":{"source":"ctx._source.status = \'updated\'","lang":"painless"},"query":{"match_all":{}}}' },
  { id: 'increment-counter', label: 'Increment counter field', body: '{"script":{"source":"ctx._source.counter++","lang":"painless"},"query":{"match_all":{}}}' },
  { id: 'update-by-condition', label: 'Update where status=pending', body: '{"script":{"source":"ctx._source.status = \'processed\'; ctx._source.updated_at = new Date().getTime()","lang":"painless"},"query":{"term":{"status":"pending"}}}' },
  { id: 'add-field', label: 'Add new field', body: '{"script":{"source":"ctx._source.new_field = \'default_value\'","lang":"painless"},"query":{"match_all":{}}}' },
  { id: 'multiply-field', label: 'Multiply numeric field by 2', body: '{"script":{"source":"ctx._source.price = ctx._source.price * 2","lang":"painless"},"query":{"range":{"price":{"gt":0}}}}' },
  { id: 'conditional-update', label: 'Conditional field update', body: '{"script":{"source":"if (ctx._source.alt > 35000) { ctx._source.altitude_category = \'high\' } else { ctx._source.altitude_category = \'low\' }","lang":"painless"},"query":{"exists":{"field":"alt"}}}' },
  { id: 'remove-field', label: 'Remove field from docs', body: '{"script":{"source":"ctx._source.remove(\'old_field\')","lang":"painless"},"query":{"exists":{"field":"old_field"}}}' },
  { id: 'update-with-params', label: 'Update with parameters', body: '{"script":{"source":"ctx._source.status = params.new_status","lang":"painless","params":{"new_status":"completed"}},"query":{"term":{"status":"processing"}}}' },
];

const UPDATE_BY_ID_EXAMPLES: { id: string; label: string; body: string }[] = [
  { id: 'doc-partial', label: 'Partial doc update', body: '{"doc":{"status":"updated","updated_at":"2024-01-01T00:00:00Z"}}' },
  { id: 'doc-upsert', label: 'Doc with upsert', body: '{"doc":{"status":"active","counter":1},"doc_as_upsert":true}' },
  { id: 'script-update', label: 'Script update by ID', body: '{"script":{"source":"ctx._source.counter++","lang":"painless"}}' },
  { id: 'script-params', label: 'Script with params', body: '{"script":{"source":"ctx._source.status = params.status; ctx._source.updated_at = params.timestamp","lang":"painless","params":{"status":"completed","timestamp":"2024-01-01T00:00:00Z"}}}' },
  { id: 'scripted-upsert', label: 'Scripted upsert', body: '{"script":{"source":"ctx._source.counter = ctx._source.counter == null ? 1 : ctx._source.counter + 1","lang":"painless"},"upsert":{"counter":1}}' },
  { id: 'detect-noop', label: 'Detect noop (no change)', body: '{"doc":{"status":"active"},"detect_noop":true}' },
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

// Searchable Select Component for Index/Data Stream selection
function SearchableSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = "Type to search...",
  label
}: { 
  value: string; 
  onChange: (value: string) => void; 
  options: string[]; 
  placeholder?: string;
  label?: string;
}) {
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(term));
  }, [options, searchTerm]);

  // Track the previous value to detect external changes
  const prevValueRef = useRef<string>(value);
  useEffect(() => {
    // Only update searchTerm if value changed externally (not from user typing)
    if (value !== undefined && value !== prevValueRef.current) {
      setSearchTerm(value);
      prevValueRef.current = value;
    }
  }, [value]);

  const handleSelect = (option: string) => {
    setSearchTerm(option);
    onChange(option);
    setShowDropdown(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowDropdown(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && filteredOptions[focusedIndex]) {
          handleSelect(filteredOptions[focusedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setFocusedIndex(-1);
        break;
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {label && <label>{label}</label>}
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setShowDropdown(true);
          setFocusedIndex(-1);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => {
          setTimeout(() => setShowDropdown(false), 200);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {showDropdown && filteredOptions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: '200px',
          overflowY: 'auto',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
          marginTop: '2px'
        }}>
          {filteredOptions.map((option, idx) => (
            <div
              key={option}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(option);
              }}
              onMouseEnter={() => setFocusedIndex(idx)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: idx === focusedIndex ? '#e6f7ff' : 'white',
                color: '#333',
                borderBottom: idx < filteredOptions.length - 1 ? '1px solid #f0f0f0' : 'none'
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
      {showDropdown && filteredOptions.length === 0 && searchTerm && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
          marginTop: '2px',
          padding: '8px 12px',
          color: '#999'
        }}>
          No matches found
        </div>
      )}
    </div>
  );
}

function App() {
  // Theme management - Dark/Light toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('es-data-generator-theme');
    if (saved === 'light') return false;
    return true; // Default to dark
  });

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('es-data-generator-theme', theme);
  }, [isDarkMode]);

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
  const [startDate, setStartDate] = useState(DEFAULT_START_ISO);
  const [endDate, setEndDate] = useState(DEFAULT_END_ISO);
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
  
  // Generator configurations
  const [savedConfigs, setSavedConfigs] = useState<GeneratorConfig[]>(() => loadGeneratorConfigs());
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [configName, setConfigName] = useState('');
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
  const [rtInterval, setRtInterval] = useState<number>(60); // seconds
  const [rtDocCount, setRtDocCount] = useState<number>(1); // docs per interval
  const [rtGeoState, setRtGeoState] = useState<Record<string, { lat: number; lon: number }>>({});
  const ruleLabel: Record<string, string> = {
    date: 'Date format',
    geo_point: 'Geo bounds',
    geo_path: 'Geo path (source → dest)',
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
    else if (t === 'geo_point') opts.push('geo_point', 'geo_path', 'geohash', 'geo_city');
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
  // Update by ID state
  const [updateIdIndex, setUpdateIdIndex] = useState<string>('');
  const [updateIdDocId, setUpdateIdDocId] = useState<string>('');
  const [updateIdBody, setUpdateIdBody] = useState<string>('');
  const [updateIdExampleId, setUpdateIdExampleId] = useState<string>('');
  const [updateIdStatus, setUpdateIdStatus] = useState<string>('');
  const [updateIdResult, setUpdateIdResult] = useState<string>('');
  // Audit state
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(() => loadAuditLogs());
  const [auditFilter, setAuditFilter] = useState<string>('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
  // Import Data state
  const [importIndex, setImportIndex] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Record<string, unknown>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importInProgress, setImportInProgress] = useState<boolean>(false);
  const [importAbortController, setImportAbortController] = useState<AbortController | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; field?: string; error: string; data: Record<string, unknown> }>>([]);
  const [importSuccessCount, setImportSuccessCount] = useState<number>(0);
  const [importFailCount, setImportFailCount] = useState<number>(0);
  const [importIndexCount, setImportIndexCount] = useState<number | null>(null);
  const [importStartCount, setImportStartCount] = useState<number | null>(null);
  const [importMultipleFiles, setImportMultipleFiles] = useState<File[]>([]);
  const [importCurrentFileIndex, setImportCurrentFileIndex] = useState<number>(0);
  const [importFileResults, setImportFileResults] = useState<Array<{ fileName: string; status: 'pending' | 'processing' | 'success' | 'error'; rows: number; succeeded?: number; failed?: number; error?: string }>>([]);

  function logAudit(action: string, category: AuditEntry['category'], details: string, status: AuditEntry['status'] = 'success', metadata?: Record<string, unknown>) {
    const entry: AuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      user: selected?.name || 'System',
      action,
      category,
      details,
      status,
      metadata,
    };
    setAuditLog(prev => [entry, ...prev].slice(0, 1000)); // Keep last 1000 entries
  }

  function quoteIdent(name: string): string {
    return `"${name}"`;
  }

  // CSV Parser
  function parseCSV(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    // Parse CSV with quote handling
    function parseLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }
    
    const headers = parseLine(lines[0]);
    const rows: Record<string, unknown>[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length !== headers.length) continue; // Skip malformed rows
      
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        let value: unknown = values[index];
        // Try to parse numbers
        if (value && typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed === 'true') value = true;
          else if (trimmed === 'false') value = false;
          else if (trimmed === 'null' || trimmed === '') value = null;
          else if (!isNaN(Number(trimmed)) && trimmed !== '') value = Number(trimmed);
        }
        row[header] = value;
      });
      rows.push(row);
    }
    
    return { headers, rows };
  }

  // Excel Parser (basic XLSX support using browser APIs)
  async function parseExcel(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Parse the workbook
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('No worksheets found in the Excel file');
      }
      
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON (array of objects)
      const jsonData: unknown[] = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, // Get raw array of arrays first
        raw: false, // Convert numbers to strings to preserve precision
        defval: '' // Default value for empty cells
      });
      
      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        throw new Error('No data found in the Excel file');
      }
      
      // First row is headers
      const headersRow = jsonData[0];
      if (!Array.isArray(headersRow)) {
        throw new Error('Invalid headers row in Excel file');
      }
      
      const headers = headersRow.map((h, i) => {
        const str = String(h || '').trim();
        return str || `Column${i + 1}`;
      });
      
      // Remaining rows are data
      const dataRows = jsonData.slice(1);
      const rows: Record<string, unknown>[] = [];
      
      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        
        // Skip completely empty rows
        const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
        if (!hasData) continue;
        
        const rowObj: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          const value = row[index];
          // Store the value, even if empty (will be cleaned later)
          rowObj[header] = value !== null && value !== undefined ? value : '';
        });
        
        rows.push(rowObj);
      }
      
      return { headers, rows };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to parse Excel file';
      throw new Error(msg);
    }
  }

  async function handleFileUpload(file: File) {
    setImportFile(file);
    setImportStatus('Parsing file...');
    setImportData([]);
    setImportHeaders([]);
    setImportErrors([]);
    
    try {
      let result: { headers: string[]; rows: Record<string, unknown>[] };
      
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        result = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        result = await parseExcel(file);
      } else {
        setImportStatus('Error: Unsupported file format. Please use CSV or Excel files.');
        return;
      }
      
      setImportHeaders(result.headers);
      setImportData(result.rows);
      setImportStatus(`Parsed successfully: ${result.rows.length} rows, ${result.headers.length} columns`);
      logAudit('Parse Import File', 'system', `Parsed ${file.name}: ${result.rows.length} rows, ${result.headers.length} columns`, 'success', { fileName: file.name, rowCount: result.rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setImportStatus(`Error: ${msg}`);
      logAudit('Parse Import File', 'system', `Failed to parse ${file.name}: ${msg}`, 'error', { fileName: file.name });
    }
  }

  async function handleMultipleFilesUpload(files: FileList) {
    const fileArray = Array.from(files);
    setImportMultipleFiles(fileArray);
    setImportCurrentFileIndex(0);
    
    // Initialize results for each file
    const results = fileArray.map(f => ({
      fileName: f.name,
      status: 'pending' as const,
      rows: 0
    }));
    setImportFileResults(results);
    
    setImportStatus(`${fileArray.length} file(s) selected. Ready to import.`);
    logAudit('Select Multiple Files', 'import', `Selected ${fileArray.length} files for import`, 'success', { fileCount: fileArray.length, fileNames: fileArray.map(f => f.name) });
  }

  async function processMultipleFiles() {
    if (!selected) {
      setImportStatus('Error: Please select a connection');
      return;
    }
    
    if (!importIndex) {
      setImportStatus('Error: Please select a target index');
      return;
    }
    
    if (importMultipleFiles.length === 0) {
      setImportStatus('Error: No files selected');
      return;
    }
    
    setImportInProgress(true);
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalRows = 0;
    
    for (let i = 0; i < importMultipleFiles.length; i++) {
      const file = importMultipleFiles[i];
      setImportCurrentFileIndex(i);
      
      // Update status to processing
      setImportFileResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: 'processing' as const } : r
      ));
      
      setImportStatus(`[${i + 1}/${importMultipleFiles.length}] Processing ${file.name}...`);
      
      try {
        // Parse file
        let result: { headers: string[]; rows: Record<string, unknown>[] };
        
        if (file.name.endsWith('.csv')) {
          const text = await file.text();
          result = parseCSV(text);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          result = await parseExcel(file);
        } else {
          throw new Error('Unsupported file format');
        }
        
        totalRows += result.rows.length;

        // Make a mutable copy so we can apply the same transformations as single-file import
        const fileHeaders = [...result.headers];
        const fileRows = result.rows.map(row => ({ ...row }));

        // 1) Auto-combine LAT/LON into a geo_point field (same logic as single-file import)
        const hasLatColumn = fileHeaders.some(h => h.toLowerCase() === 'lat' || h.toLowerCase() === 'latitude');
        const hasLonColumn = fileHeaders.some(h => h.toLowerCase() === 'lon' || h.toLowerCase() === 'longitude' || h.toLowerCase() === 'long');

        if (hasLatColumn && hasLonColumn) {
          const latField = fileHeaders.find(h => h.toLowerCase() === 'lat' || h.toLowerCase() === 'latitude') || 'LAT';
          const lonField = fileHeaders.find(h => h.toLowerCase() === 'lon' || h.toLowerCase() === 'longitude' || h.toLowerCase() === 'long') || 'LON';

          // Try to detect geo field name from mapping
          let geoField = 'location'; // Default
          try {
            const mappingRes = await fetchMapping(selected, importIndex);
            if (mappingRes.ok && mappingRes.json) {
              const json = mappingRes.json as Record<string, any>;
              const indexMappings = json[importIndex]?.mappings || json.mappings || {};
              if (indexMappings.properties) {
                const geoFields = Object.entries(indexMappings.properties).filter(([_, spec]: any) => (spec as any).type === 'geo_point');
                if (geoFields.length > 0) {
                  geoField = geoFields[0][0];
                }
              }
            }
          } catch (e) {
            console.log('Could not detect geo field for batch import, using default "location"');
          }

          let combinedCount = 0;
          let skippedCount = 0;

          fileRows.forEach((doc, idx) => {
            const lat = (doc as any)[latField];
            const lon = (doc as any)[lonField];

            const latNum = typeof lat === 'string' ? parseFloat(lat) : (typeof lat === 'number' ? lat : NaN);
            const lonNum = typeof lon === 'string' ? parseFloat(lon) : (typeof lon === 'number' ? lon : NaN);

            if (!isNaN(latNum) && !isNaN(lonNum) && latNum !== 0 && lonNum !== 0) {
              (doc as any)[geoField] = { lat: latNum, lon: lonNum };
              combinedCount++;
              delete (doc as any)[latField];
              delete (doc as any)[lonField];
            } else {
              skippedCount++;
              console.warn(`[Batch] Row ${idx + 1} (${file.name}): Invalid LAT/LON - LAT: ${lat}, LON: ${lon}`);
              // Remove invalid LAT/LON fields to avoid ES errors
              delete (doc as any)[latField];
              delete (doc as any)[lonField];
            }
          });

          console.log('[Batch] Geo-point combination summary:', {
            file: file.name,
            total: fileRows.length,
            combined: combinedCount,
            skipped: skippedCount,
            geoField
          });
        }

        // 2) Clean data: remove empty/null/whitespace-only values (same as single-file import)
        const transformedData = fileRows.map((doc) => {
          const cleaned: Record<string, any> = {};

          for (const [key, value] of Object.entries(doc)) {
            if (value === '' || value === null || value === undefined) {
              continue;
            }
            if (typeof value === 'string' && value.trim() === '') {
              continue;
            }
            cleaned[key] = value;
          }

          return cleaned;
        });
        
        // Insert data
        const abortController = new AbortController();
        const chunkSize = result.rows.length < 10000 ? 1000 : result.rows.length < 50000 ? 3000 : 5000;
        
        const res = await bulkInsert(selected, importIndex, transformedData, chunkSize, {
          signal: abortController.signal,
          onProgress: () => {
            // Silent progress for multi-file
          }
        });
        
        if (res.ok) {
          const succeeded = res.succeeded || 0;
          const failed = res.failed || 0;
          totalSucceeded += succeeded;
          totalFailed += failed;
          
          setImportFileResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, status: 'success' as const, rows: result.rows.length, succeeded, failed } : r
          ));
          
          logAudit('Import File', 'import', `Imported ${file.name}: ${succeeded} succeeded, ${failed} failed`, 'success', { fileName: file.name, succeeded, failed });
        } else {
          throw new Error(res.error || 'Bulk insert failed');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setImportFileResults(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: 'error' as const, error: msg } : r
        ));
        logAudit('Import File', 'import', `Failed to import ${file.name}: ${msg}`, 'error', { fileName: file.name });
      }
    }
    
    setImportInProgress(false);
    setImportStatus(`✅ Completed: ${importMultipleFiles.length} files, ${totalRows} rows total. Succeeded: ${totalSucceeded}, Failed: ${totalFailed}`);
    logAudit('Complete Multiple Files Import', 'import', `Imported ${importMultipleFiles.length} files: ${totalSucceeded} succeeded, ${totalFailed} failed`, 'success', { fileCount: importMultipleFiles.length, totalRows, totalSucceeded, totalFailed });
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
  const [activeTab, setActiveTab] = useState<'connections' | 'schema' | 'compare' | 'sql' | 'update' | 'delete' | 'audit' | 'import'>('connections');
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
  // Update by Query state
  const [updIndex, setUpdIndex] = useState<string>('');
  const [updQueryText, setUpdQueryText] = useState<string>('');
  const [updExampleId, setUpdExampleId] = useState<string>('');
  const [updPreviewSize, setUpdPreviewSize] = useState<number>(10);
  const [updPreviewDocs, setUpdPreviewDocs] = useState<Record<string, unknown>[]>([]);
  const [updPreviewStatus, setUpdPreviewStatus] = useState<string>('');
  const [updView, setUpdView] = useState<'json' | 'table'>('json');
  const [updJsonMode, setUpdJsonMode] = useState<'text' | 'tree'>('text');
  const [updTreeExpanded, setUpdTreeExpanded] = useState<boolean>(true);
  const [updFilter, setUpdFilter] = useState<string>('');
  const [updStatus, setUpdStatus] = useState<string>('');
  const [updTaskId, setUpdTaskId] = useState<string>('');
  const [updInProgress, setUpdInProgress] = useState<boolean>(false);
  const [updCtrl, setUpdCtrl] = useState<AbortController | null>(null);
  const [updPercent, setUpdPercent] = useState<number>(0);
  const [updPage, setUpdPage] = useState<number>(1);
  const [updPageSize, setUpdPageSize] = useState<number>(10);

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

  // Load last used configuration on mount
  useEffect(() => {
    const lastConfig = loadLastGenerator();
    if (lastConfig && lastConfig.mapping) {
      setMappingLoaded(lastConfig.mapping);
      setMappingJson(JSON.stringify(lastConfig.mapping, null, 2));
      if (lastConfig.rules) setRules(lastConfig.rules);
      if (lastConfig.indexName) setIndexName(lastConfig.indexName);
      if (lastConfig.docCount) setGenCount(lastConfig.docCount);
      if (lastConfig.chunkSize) setChunkSize(lastConfig.chunkSize);
      if (lastConfig.startDate) {
        setStartDate(lastConfig.startDate);
        setRangeStart(lastConfig.startDate);
      }
      if (lastConfig.endDate) {
        setEndDate(lastConfig.endDate);
        setRangeEnd(lastConfig.endDate);
      }
      if (lastConfig.granularity) setGranularity(lastConfig.granularity as Granularity);
      if (lastConfig.distribution) setDistribution(lastConfig.distribution as Distribution);
      if (lastConfig.rate !== undefined) setRate(lastConfig.rate);
    }
  }, []);

  // Save audit logs to localStorage whenever they change
  useEffect(() => {
    if (auditLog.length > 0) {
      saveAuditLogs(auditLog);
    }
  }, [auditLog]);

  // Auto-save current configuration as "last used"
  useEffect(() => {
    if (mappingLoaded) {
      saveLastGenerator({
        mapping: mappingLoaded,
        rules,
        indexName,
        docCount: genCount,
        chunkSize,
        startDate,
        endDate,
        granularity,
        distribution,
        rate
      });
    }
  }, [mappingLoaded, rules, indexName, genCount, chunkSize, startDate, endDate, granularity, distribution, rate]);

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
      logAudit('Test Connection', 'connection', `Successfully tested connection to ${selected.url}`, 'success');
    } else {
      setResult(res.error || `HTTP ${res.status}`);
      logAudit('Test Connection', 'connection', `Failed to connect to ${selected.url}: ${res.error}`, 'error');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Elasticsearch Data Generator</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Theme</span>
          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              width: '64px',
              height: '32px',
              cursor: 'pointer'
            }}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <input
              type="checkbox"
              checked={!isDarkMode}
              onChange={() => setIsDarkMode(!isDarkMode)}
              style={{
                opacity: 0,
                width: 0,
                height: 0,
                position: 'absolute'
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: isDarkMode ? '#334155' : '#3b82f6',
                borderRadius: '16px',
                transition: 'background-color 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  height: '28px',
                  width: '28px',
                  left: isDarkMode ? '2px' : '34px',
                  backgroundColor: '#ffffff',
                  borderRadius: '50%',
                  transition: 'left 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                {isDarkMode ? '🌙' : '☀️'}
              </span>
            </span>
          </label>
        </div>
      </div>
      <div className="tabs">
        <button className={activeTab === 'connections' ? 'tab active' : 'tab'} onClick={() => setActiveTab('connections')}><span className="tab-icon">🔗</span><span>Connections</span></button>
        <button className={activeTab === 'schema' ? 'tab active' : 'tab'} onClick={() => setActiveTab('schema')}><span className="tab-icon">📐</span><span>Schema Generator</span></button>
        <button className={activeTab === 'sql' ? 'tab active' : 'tab'} onClick={() => setActiveTab('sql')}><span className="tab-icon">🧾</span><span>Elasticsearch Editor (Using SQL Query)</span></button>
        <button className={activeTab === 'compare' ? 'tab active' : 'tab'} onClick={() => setActiveTab('compare')}><span className="tab-icon">🔍</span><span>Compare Schemas</span></button>
        <button className={activeTab === 'update' ? 'tab active' : 'tab'} onClick={() => setActiveTab('update')}><span className="tab-icon">✏️</span><span>Update By Query</span></button>
        <button className={activeTab === 'delete' ? 'tab active' : 'tab'} onClick={() => setActiveTab('delete')}><span className="tab-icon">🗑️</span><span>Delete By Query</span></button>
        <button className={activeTab === 'audit' ? 'tab active' : 'tab'} onClick={() => setActiveTab('audit')}><span className="tab-icon">📋</span><span>Audit</span></button>
        <button className={activeTab === 'import' ? 'tab active' : 'tab'} onClick={() => setActiveTab('import')}><span className="tab-icon">📤</span><span>Import Data</span></button>
      </div>

      {activeTab === 'connections' && (
      <section>
        <div className="section-header">
          <h2>🔗 Manage Elasticsearch Connections</h2>
          <p style={{ fontSize: '0.9em', color: '#666', marginTop: '0.5em' }}>
            Add and manage multiple Elasticsearch connections. All connections are saved automatically in your browser.
          </p>
        </div>

        {/* Saved Connections List */}
        {connections.length > 0 && (
          <div style={{ marginBottom: '2em' }}>
            <div className="section-header">
              <h3>📋 Saved Connections ({connections.length})</h3>
            </div>
            
            <div style={{ background: '#f8f9fa', padding: '1em', borderRadius: '4px', marginBottom: '1em' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '0.5em', textAlign: 'center', verticalAlign: 'middle' }}>Active</th>
                    <th style={{ padding: '0.5em', textAlign: 'left', verticalAlign: 'middle' }}>Name</th>
                    <th style={{ padding: '0.5em', textAlign: 'left', verticalAlign: 'middle' }}>URL</th>
                    <th style={{ padding: '0.5em', textAlign: 'left', verticalAlign: 'middle' }}>Auth Type</th>
                    <th style={{ padding: '0.5em', textAlign: 'center', verticalAlign: 'middle' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn) => (
                    <tr key={conn.id} style={{ 
                      borderBottom: '1px solid #e9ecef',
                      background: selectedId === conn.id ? '#e3f2fd' : 'transparent'
                    }}>
                      <td style={{ padding: '0.5em', textAlign: 'center', verticalAlign: 'middle' }}>
                        <input 
                          type="radio" 
                          name="activeConnection" 
                          checked={selectedId === conn.id}
                          onChange={() => setSelectedId(conn.id)}
                          style={{ cursor: 'pointer', margin: 0 }}
                        />
                      </td>
                      <td style={{ padding: '0.5em', fontWeight: selectedId === conn.id ? 'bold' : 'normal', verticalAlign: 'middle' }}>
                        {conn.name}
                        {selectedId === conn.id && <span style={{ marginLeft: '0.5em', color: '#28a745' }}>✓</span>}
                      </td>
                      <td style={{ padding: '0.5em', fontSize: '0.9em', color: '#666', verticalAlign: 'middle' }}>{conn.url}</td>
                      <td style={{ padding: '0.5em', fontSize: '0.9em', verticalAlign: 'middle' }}>
                        <span style={{ 
                          padding: '0.2em 0.5em', 
                          background: conn.authType === 'basic' ? '#e3f2fd' : '#fff3cd',
                          borderRadius: '3px',
                          fontSize: '0.85em',
                          display: 'inline-block'
                        }}>
                          {conn.authType === 'basic' ? 'Basic Auth' : 'API Key'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5em', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: '0.5em', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button 
                            onClick={() => setSelectedId(conn.id)}
                            style={{ 
                              padding: '0.4em 1em', 
                              background: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.85em',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              minWidth: '70px'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#0056b3'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#007bff'}
                          >
                            Select
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm(`Delete connection "${conn.name}"?`)) {
                                const next = connections.filter(c => c.id !== conn.id);
                                setConnections(next);
                                saveConnections(next);
                                if (selectedId === conn.id) {
                                  setSelectedId(next[0]?.id || '');
                                }
                              }
                            }}
                            style={{ 
                              padding: '0.4em 1em', 
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.85em',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              minWidth: '70px'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#c82333'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#dc3545'}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Export/Import Connections */}
            <div className="row" style={{ marginBottom: '1em' }}>
              <button 
                onClick={() => {
                  const dataStr = JSON.stringify(connections, null, 2);
                  const dataBlob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(dataBlob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `es-connections-${Date.now()}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                  logAudit('Export Connections', 'system', `Exported ${connections.length} connections`, 'success', { count: connections.length });
                }}
                style={{ background: '#28a745' }}
              >
                📥 Export All Connections
              </button>
              <button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const imported = JSON.parse(text) as Connection[];
                      if (!Array.isArray(imported)) {
                        alert('Invalid file format');
                        return;
                      }
                      // Merge with existing, avoiding duplicates by URL
                      const merged = [...connections];
                      let addedCount = 0;
                      for (const conn of imported) {
                        if (!merged.some(c => c.url === conn.url && c.name === conn.name)) {
                          merged.push({ ...conn, id: crypto.randomUUID() });
                          addedCount++;
                        }
                      }
                      setConnections(merged);
                      saveConnections(merged);
                      alert(`Imported ${addedCount} new connections`);
                      logAudit('Import Connections', 'system', `Imported ${addedCount} connections`, 'success', { count: addedCount });
                    } catch (e) {
                      alert('Failed to import: ' + (e instanceof Error ? e.message : 'Unknown error'));
                    }
                  };
                  input.click();
                }}
                style={{ background: '#17a2b8' }}
              >
                📤 Import Connections
              </button>
            </div>
          </div>
        )}

        {/* Add New Connection Form */}
        <div className="section-header">
          <h3>➕ Add New Connection</h3>
        </div>
        <div className="row">
          <div className="col">
            <label>Connection Name</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="My Production ES" />
          </div>
          <div className="col">
            <label>Elasticsearch URL</label>
            <input value={form.url} onChange={e => update('url', e.target.value)} placeholder="https://elasticsearch.example.com:9200" />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Authentication Type</label>
            <select value={form.authType} onChange={e => update('authType', e.target.value as AuthType)}>
              <option value="basic">Basic Authentication (Username/Password)</option>
              <option value="apiKey">API Key</option>
            </select>
          </div>
          {form.authType === 'basic' ? (
            <>
              <div className="col">
                <label>Username</label>
                <input value={form.username} onChange={e => update('username', e.target.value)} placeholder="elastic" />
              </div>
              <div className="col">
                <label>Password</label>
                <input type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="••••••••" />
              </div>
            </>
          ) : (
            <div className="col">
              <label>API Key</label>
              <input value={form.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="base64EncodedApiKey" />
            </div>
          )}
        </div>
        <div className="row">
          <button onClick={addConnection} style={{ background: '#28a745' }}>
            💾 Save Connection
          </button>
          <button onClick={addLocalConnection} style={{ background: '#6c757d' }}>
            🏠 Add Localhost (http://localhost:9200)
          </button>
        </div>

        {/* Test Connection Section */}
        {selected && (
          <div style={{ marginTop: '2em' }}>
        <div className="section-header">
              <h3>🔧 Test Active Connection</h3>
              <p style={{ fontSize: '0.9em', color: '#666', marginTop: '0.5em' }}>
                Currently testing: <strong>{selected.name}</strong> ({selected.url})
              </p>
        </div>
            
            {/* Quick Edit */}
              <div className="row">
                <div className="col">
                <label>Edit URL</label>
                  <input value={selected.url} onChange={e => updateSelected('url', e.target.value)} />
                </div>
                <div className="col">
                <label>Edit Auth Type</label>
                  <select value={selected.authType} onChange={e => updateSelected('authType', e.target.value as AuthType)}>
                  <option value="basic">Basic Auth</option>
                    <option value="apiKey">API Key</option>
                  </select>
                </div>
              </div>

            <div className="row">
              <button onClick={testSelected} disabled={!selected || testing}>
                {testing ? '⏳ Testing...' : '🔌 Test Connection'}
              </button>
              <button onClick={removeSelected} disabled={!selected} style={{ background: '#dc3545' }}>
                🗑️ Delete Connection
              </button>
            </div>
            <pre className="result">{testing ? 'Testing connection to Elasticsearch...' : result}</pre>
            <p className="note">
              ℹ️ <strong>Note:</strong> Browsers enforce TLS. Self-signed certificates must be trusted by your operating system. 
              Uploading CA certificates is not supported in browser-based applications.
            </p>
          </div>
        )}

        {connections.length === 0 && (
          <div style={{ padding: '2em', textAlign: 'center', background: '#f8f9fa', borderRadius: '4px', marginTop: '2em' }}>
            <h3 style={{ color: '#666' }}>No connections saved yet</h3>
            <p style={{ color: '#999' }}>Add your first Elasticsearch connection above to get started!</p>
          </div>
        )}
      </section>
      )}

      {activeTab === 'schema' && (
      <section>
        <div className="section-header">
          <h2>Schema Generator</h2>
        </div>
        
        {/* Saved Configurations */}
        <div style={{ background: '#f8f9fa', padding: '1em', borderRadius: '4px', marginBottom: '1em' }}>
          <h3 style={{ marginTop: 0 }}>💾 Saved Configurations</h3>
        <div className="row">
          <div className="col">
              <label>Load Configuration</label>
              <select 
                value={selectedConfigId} 
                onChange={(e) => {
                  const configId = e.target.value;
                  setSelectedConfigId(configId);
                  if (configId) {
                    const config = savedConfigs.find(c => c.id === configId);
                    if (config) {
                      // Load all saved configuration fields
                      setConfigName(config.name); // Set the configuration name
                      setMappingLoaded(config.mapping);
                      setMappingJson(JSON.stringify(config.mapping, null, 2));
                      setRules(config.rules || {});
                      // Always set index name, even if empty
                      setIndexName(config.indexName || '');
                      setGenCount(config.docCount || 1000);
                      if (config.chunkSize) setChunkSize(config.chunkSize);
                      if (config.startDate) {
                        setStartDate(config.startDate);
                        setRangeStart(config.startDate);
                      }
                      if (config.endDate) {
                        setEndDate(config.endDate);
                        setRangeEnd(config.endDate);
                      }
                      if (config.granularity) setGranularity(config.granularity as Granularity);
                      if (config.distribution) setDistribution(config.distribution as Distribution);
                      if (config.rate !== undefined) setRate(config.rate);
                      setGenStatus(`✅ Loaded configuration: ${config.name} - All settings restored including index: ${config.indexName || '(none)'}`);
                    }
                  } else {
                    // Clear all fields when "Select a saved configuration..." is selected
                    // Reset all configuration fields to default values
                    setConfigName(''); // Clear configuration name
                    setMappingLoaded(null);
                    setMappingJson('');
                    setRules({});
                    setIndexName('');
                    setGenCount(1000);
                    setChunkSize(1000);
                    setStartDate(DEFAULT_START_ISO);
                    setEndDate(DEFAULT_END_ISO);
                    setRangeStart('');
                    setRangeEnd('');
                    setRangePreset('last-7d'); // Reset to default preset
                    setGranularity('hour');
                    setDistribution('uniform');
                    setRate(10);
                    setGenStatus('All fields reset. Start fresh configuration.');
                  }
                }}
              >
                <option value="">Select a saved configuration...</option>
                {savedConfigs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({new Date(c.updatedAt).toLocaleDateString()})
                  </option>
                ))}
            </select>
            </div>
            <div className="col">
              <label>Configuration Name</label>
              <input 
                value={configName} 
                onChange={e => setConfigName(e.target.value)} 
                placeholder="Enter name to save..."
              />
            </div>
          </div>
          <div className="row">
            <button 
              disabled={!configName || !mappingLoaded}
              onClick={() => {
                if (!configName || !mappingLoaded) return;
                const config: GeneratorConfig = {
                  id: selectedConfigId || `config-${Date.now()}`,
                  name: configName,
                  mapping: mappingLoaded,
                  rules,
                  indexName,
                  docCount: genCount,
                  chunkSize,
                  startDate,
                  endDate,
                  granularity,
                  distribution,
                  rate,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                saveGeneratorConfig(config);
                setSavedConfigs(loadGeneratorConfigs());
                setSelectedConfigId(config.id);
                setGenStatus(`Saved configuration: ${configName}`);
              }}
            >
              💾 Save Configuration
            </button>
            {selectedConfigId && (
              <button 
                onClick={() => {
                  if (confirm('Delete this configuration?')) {
                    deleteGeneratorConfig(selectedConfigId);
                    setSavedConfigs(loadGeneratorConfigs());
                    setSelectedConfigId('');
                    setConfigName('');
                    setGenStatus('Configuration deleted');
                  }
                }}
                style={{ background: '#dc3545' }}
              >
                🗑️ Delete
              </button>
            )}
            <button 
              onClick={() => {
                setSelectedConfigId('');
                setConfigName('');
                setMappingLoaded(null);
                setMappingJson('');
                setRules({});
                setIndexName('');
                setGenCount(1000);
                setChunkSize(1000);
                setStartDate(DEFAULT_START_ISO);
                setEndDate(DEFAULT_END_ISO);
                setRangeStart('');
                setRangeEnd('');
                setGranularity('hour');
                setDistribution('uniform');
                setRate(10);
                setGenStatus('Cleared configuration');
              }}
            >
              ✨ New Configuration
            </button>
          </div>
        </div>
        
        <div className="row">
          <div className="col">
            <SearchableSelect
              label="Index"
              value={indexName}
              onChange={setIndexName}
              options={indices}
              placeholder="Type to search indices..."
            />
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
            <label>Range Preset</label>
            <select value={rangePreset} onChange={e => {
              const p = e.target.value;
              setRangePreset(p);
              const now = new Date();
              let start = new Date(now);
              
              if (p === 'custom') {
                // Don't change dates for custom - let user enter manually
                return;
              } else if (p === 'last-24h') {
                start = new Date(now.getTime() - 24 * 3600_000);
              } else if (p === 'last-7d') {
                start = new Date(now.getTime() - 7 * 24 * 3600_000);
              } else if (p === 'last-30d') {
                start = new Date(now.getTime() - 30 * 24 * 3600_000);
              } else if (p === 'last-90d') {
                start = new Date(now.getTime() - 90 * 24 * 3600_000);
              } else if (p === 'last-180d') {
                start = new Date(now.getTime() - 180 * 24 * 3600_000);
              } else if (p === 'last-1y') {
                start = new Date(now.getTime() - 365 * 24 * 3600_000);
              } else if (p === 'last-2y') {
                start = new Date(now.getTime() - 2 * 365 * 24 * 3600_000);
              } else if (p === 'last-3y') {
                start = new Date(now.getTime() - 3 * 365 * 24 * 3600_000);
              } else if (p === 'last-5y') {
                start = new Date(now.getTime() - 5 * 365 * 24 * 3600_000);
              } else if (p === 'last-10y') {
                start = new Date(now.getTime() - 10 * 365 * 24 * 3600_000);
              } else if (p === 'this-week') {
                const d = new Date(now);
                const day = d.getDay();
                const diff = (day + 6) % 7;
                d.setHours(0,0,0,0);
                start = new Date(d.getTime() - diff * 24 * 3600_000);
              } else if (p === 'this-month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
              } else if (p === 'this-year') {
                start = new Date(now.getFullYear(), 0, 1);
              } else if (p === 'last-year') {
                start = new Date(now.getFullYear() - 1, 0, 1);
                const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
                const startIso = start.toISOString();
                const endIso = end.toISOString();
                setRangeStart(startIso);
                setRangeEnd(endIso);

                // Auto-populate Count based on this full-year range
                const ms = Math.max(0, end.getTime() - start.getTime());
                const unitMs =
                  countUnit === 'second'
                    ? 1000
                    : countUnit === 'minute'
                    ? 60_000
                    : countUnit === 'hour'
                    ? 3_600_000
                    : 86_400_000;
                let c = Math.floor(ms / unitMs);
                if (c === 0 && countUnit === 'day') c = 1;
                setGenCount(c);
                return;
              } else if (p === 'last-2-years') {
                start = new Date(now.getFullYear() - 2, 0, 1);
              } else if (p === 'last-5-years') {
                start = new Date(now.getFullYear() - 5, 0, 1);
              } else if (p === 'last-10-years') {
                start = new Date(now.getFullYear() - 10, 0, 1);
              }
              
              const startIso = start.toISOString();
              const endIso = now.toISOString();
              setRangeStart(startIso);
              setRangeEnd(endIso);

              // Auto-populate Count based on new range and current unit
              const ms = Math.max(0, now.getTime() - start.getTime());
              const unitMs =
                countUnit === 'second'
                  ? 1000
                  : countUnit === 'minute'
                  ? 60_000
                  : countUnit === 'hour'
                  ? 3_600_000
                  : 86_400_000;
              let c = Math.floor(ms / unitMs);
              if (c === 0 && countUnit === 'day') c = 1;
              setGenCount(c);
            }}>
              <optgroup label="Recent">
              <option value="last-24h">Last 24 hours</option>
              <option value="last-7d">Last 7 days</option>
              <option value="last-30d">Last 30 days</option>
                <option value="last-90d">Last 90 days</option>
                <option value="last-180d">Last 180 days</option>
              </optgroup>
              <optgroup label="Years">
                <option value="last-1y">Last 1 year</option>
                <option value="last-2y">Last 2 years</option>
                <option value="last-3y">Last 3 years</option>
                <option value="last-5y">Last 5 years</option>
                <option value="last-10y">Last 10 years</option>
              </optgroup>
              <optgroup label="Calendar Periods">
              <option value="this-week">This week</option>
              <option value="this-month">This month</option>
              <option value="this-year">This year</option>
                <option value="last-year">Last year (full year)</option>
                <option value="last-2-years">Last 2 years</option>
                <option value="last-5-years">Last 5 years</option>
                <option value="last-10-years">Last 10 years</option>
              </optgroup>
              <optgroup label="Custom">
                <option value="custom">Custom Range (Manual Entry)</option>
              </optgroup>
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
        
        {/* Custom Range Inputs - Show when "custom" is selected */}
        {rangePreset === 'custom' && (
          <div className="row" style={{ marginTop: '1em', padding: '1em', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
            <div className="col">
              <label>Range Start (ISO 8601)</label>
              <input 
                type="datetime-local"
                value={rangeStart ? new Date(rangeStart).toISOString().slice(0, 16) : ''}
                onChange={e => {
                  if (e.target.value) {
                    setRangeStart(new Date(e.target.value).toISOString());
                  }
                }}
                placeholder={DEFAULT_START_ISO}
                style={{ width: '100%' }}
              />
              <input 
                type="text"
                value={rangeStart}
                onChange={e => setRangeStart(e.target.value)}
                placeholder={DEFAULT_START_ISO}
                style={{ width: '100%', marginTop: '0.5em', fontSize: '0.85em' }}
              />
              <small style={{ color: '#666', fontSize: '0.8em' }}>Or enter ISO 8601 format: 2024-01-15T10:30:00Z</small>
            </div>
            <div className="col">
              <label>Range End (ISO 8601)</label>
              <input 
                type="datetime-local"
                value={rangeEnd ? new Date(rangeEnd).toISOString().slice(0, 16) : ''}
                onChange={e => {
                  if (e.target.value) {
                    setRangeEnd(new Date(e.target.value).toISOString());
                  }
                }}
                placeholder={DEFAULT_END_ISO}
                style={{ width: '100%' }}
              />
              <input 
                type="text"
                value={rangeEnd}
                onChange={e => setRangeEnd(e.target.value)}
                placeholder={DEFAULT_END_ISO}
                style={{ width: '100%', marginTop: '0.5em', fontSize: '0.85em' }}
              />
              <small style={{ color: '#666', fontSize: '0.8em' }}>Or enter ISO 8601 format: 2024-01-16T10:30:00Z</small>
            </div>
          </div>
        )}
        
        {/* Show current range for non-custom presets */}
        {rangePreset !== 'custom' && (
          <div className="row" style={{ marginTop: '0.5em', fontSize: '0.9em', color: '#666' }}>
            <div className="col">
              <strong>Start:</strong> {rangeStart ? new Date(rangeStart).toLocaleString() : 'Not set'}
            </div>
            <div className="col">
              <strong>End:</strong> {rangeEnd ? new Date(rangeEnd).toLocaleString() : 'Not set'}
            </div>
          </div>
        )}
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
            logAudit('Load Mapping', 'schema', `Loaded mapping from index: ${indexName}`, 'success');
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
            <p style={{ fontSize: '0.9em', color: '#666', margin: '0 0 1em 0' }}>
              ℹ️ Date formats (like epoch_second) are auto-detected from the schema. Add custom rules to override defaults.
            </p>
            {ruleField && rules[ruleField] && (
              <p style={{ fontSize: '0.9em', color: '#f39c12', margin: '0 0 1em 0', padding: '0.5em', background: '#fff9e6', borderRadius: '4px' }}>
                ✏️ Editing rule for field: <strong>{ruleField}</strong>
              </p>
            )}
            <div className="row">
              <div className="col">
                <label>Field (supports nested paths)</label>
                <select value={ruleField} onChange={e => {
                  setRuleField(e.target.value);
                  setRuleType('');
                  setRuleInputs({});
                }}>
                  <option value="">Select field</option>
                  {Object.entries(flattenMappingFields(mappingLoaded)).map(([k, t]) => (
                    <option key={k} value={k}>{k} {t ? `(${t})` : ''}{rules[k] ? ' ✓' : ''}</option>
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
                    <option value="epoch_second">epoch_second</option>
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
                  <label>City/Airport</label>
                  <select value={ruleInputs.city ?? ''} onChange={e => setRuleInputs(prev => ({ ...prev, city: e.target.value }))}>
                    <option value="">Select city/airport</option>
                    {CITIES.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
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
            {ruleType === 'geo_path' && (
              <>
                <div className="row">
                  <div className="col">
                    <label>Travel Mode</label>
                    <select 
                      value={ruleInputs.travelMode ?? 'aircraft'} 
                      onChange={e => {
                        const mode = e.target.value as 'aircraft' | 'vessel' | 'vehicle';
                        let defaultSpeed = '800';
                        if (mode === 'vessel') defaultSpeed = '40';
                        else if (mode === 'vehicle') defaultSpeed = '80';
                        setRuleInputs(prev => ({ 
                          ...prev, 
                          travelMode: mode,
                          speed: prev.speed || defaultSpeed,
                          sourceCity: '',
                          destCity: '',
                          sourceLat: '',
                          sourceLon: '',
                          destLat: '',
                          destLon: ''
                        }));
                      }}
                    >
                      <option value="aircraft">✈️ Aircraft (Airports)</option>
                      <option value="vessel">🚢 Vessel (Seaports)</option>
                      <option value="vehicle">🚗 Vehicle (Cities/Locations)</option>
                    </select>
                  </div>
                  <div className="col">
                    <label>Speed ({ruleInputs.travelMode === 'vessel' ? 'km/h (1 knot ≈ 1.85 km/h)' : 'km/h'})</label>
                    <input 
                      type="number" 
                      value={ruleInputs.speed ?? (ruleInputs.travelMode === 'vessel' ? '40' : ruleInputs.travelMode === 'vehicle' ? '80' : '800')} 
                      onChange={e => setRuleInputs(prev => ({ ...prev, speed: e.target.value }))} 
                      placeholder={ruleInputs.travelMode === 'vessel' ? '40 (≈22 knots)' : ruleInputs.travelMode === 'vehicle' ? '80' : '800'} 
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="col">
                    <label>Source {ruleInputs.travelMode === 'vessel' ? 'Seaport' : ruleInputs.travelMode === 'vehicle' ? 'Location' : 'Airport'}</label>
                    <select 
                      value={ruleInputs.sourceCity ?? ''} 
                      onChange={e => {
                        const locations = ruleInputs.travelMode === 'vessel' ? SEAPORTS : ruleInputs.travelMode === 'vehicle' ? VEHICLE_LOCATIONS : CITIES;
                        const location = locations.find(c => c.name === e.target.value);
                        if (location) {
                          setRuleInputs(prev => ({ 
                            ...prev, 
                            sourceCity: location.name,
                            sourceLat: String(location.lat), 
                            sourceLon: String(location.lon) 
                          }));
                        }
                      }}
                    >
                      <option value="">Select source...</option>
                      {(ruleInputs.travelMode === 'vessel' ? SEAPORTS : ruleInputs.travelMode === 'vehicle' ? VEHICLE_LOCATIONS : CITIES).map(c => (
                        <option key={c.name} value={c.name}>{c.name}{ruleInputs.travelMode === 'vehicle' && 'type' in c ? ` [${c.type}]` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col">
                    <label>Destination {ruleInputs.travelMode === 'vessel' ? 'Seaport' : ruleInputs.travelMode === 'vehicle' ? 'Location' : 'Airport'}</label>
                    <select 
                      value={ruleInputs.destCity ?? ''} 
                      onChange={e => {
                        const locations = ruleInputs.travelMode === 'vessel' ? SEAPORTS : ruleInputs.travelMode === 'vehicle' ? VEHICLE_LOCATIONS : CITIES;
                        const location = locations.find(c => c.name === e.target.value);
                        if (location) {
                          setRuleInputs(prev => ({ 
                            ...prev, 
                            destCity: location.name,
                            destLat: String(location.lat), 
                            destLon: String(location.lon) 
                          }));
                        }
                      }}
                    >
                      <option value="">Select destination...</option>
                      {(ruleInputs.travelMode === 'vessel' ? SEAPORTS : ruleInputs.travelMode === 'vehicle' ? VEHICLE_LOCATIONS : CITIES).map(c => (
                        <option key={c.name} value={c.name}>{c.name}{ruleInputs.travelMode === 'vehicle' && 'type' in c ? ` [${c.type}]` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="col" style={{ fontSize: '0.85em', color: '#666', padding: '0.5em' }}>
                    {ruleInputs.travelMode === 'vessel' ? '🚢' : ruleInputs.travelMode === 'vehicle' ? '🚗' : '✈️'} Selected Route: {ruleInputs.sourceCity || 'None'} → {ruleInputs.destCity || 'None'}
                    {ruleInputs.sourceCity && ruleInputs.destCity && (
                      <span style={{ marginLeft: '1em', color: '#999' }}>
                        ({ruleInputs.sourceLat}, {ruleInputs.sourceLon}) → ({ruleInputs.destLat}, {ruleInputs.destLon})
                      </span>
                    )}
                  </div>
                </div>
                <div className="row">
                  <div className="col" style={{ fontSize: '0.85em', color: '#666', padding: '0.5em' }}>
                    💡 For Real-Time Mode: Entity will move from source to destination, then restart from source automatically.
                    {ruleInputs.travelMode === 'vessel' && (
                      <span style={{ display: 'block', marginTop: '0.5em' }}>
                        ⚓ Typical vessel speeds: Container ship (40-50 km/h / 22-27 knots), Tanker (25-35 km/h / 14-19 knots), Cruise ship (37-46 km/h / 20-25 knots)
                      </span>
                    )}
                    {ruleInputs.travelMode === 'vehicle' && (
                      <span style={{ display: 'block', marginTop: '0.5em' }}>
                        🚗 Typical vehicle speeds: City Traffic (30-50 km/h), Highway (80-120 km/h), Delivery Van (60-80 km/h)
                      </span>
                    )}
                  </div>
                </div>
              </>
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
                  <select value={ruleInputs.country ?? 'US'} onChange={e => setRuleInputs(prev => ({ ...prev, country: e.target.value }))} style={{ width: '100%' }}>
                    <optgroup label="North America">
                      <option value="US">🇺🇸 United States (+1)</option>
                      <option value="CA">🇨🇦 Canada (+1)</option>
                      <option value="MX">🇲🇽 Mexico (+52)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="GB">🇬🇧 United Kingdom (+44)</option>
                      <option value="DE">🇩🇪 Germany (+49)</option>
                      <option value="FR">🇫🇷 France (+33)</option>
                      <option value="IT">🇮🇹 Italy (+39)</option>
                      <option value="ES">🇪🇸 Spain (+34)</option>
                      <option value="NL">🇳🇱 Netherlands (+31)</option>
                      <option value="BE">🇧🇪 Belgium (+32)</option>
                      <option value="SE">🇸🇪 Sweden (+46)</option>
                      <option value="NO">🇳🇴 Norway (+47)</option>
                      <option value="DK">🇩🇰 Denmark (+45)</option>
                      <option value="FI">🇫🇮 Finland (+358)</option>
                      <option value="CH">🇨🇭 Switzerland (+41)</option>
                      <option value="AT">🇦🇹 Austria (+43)</option>
                      <option value="PT">🇵🇹 Portugal (+351)</option>
                      <option value="GR">🇬🇷 Greece (+30)</option>
                      <option value="IE">🇮🇪 Ireland (+353)</option>
                      <option value="PL">🇵🇱 Poland (+48)</option>
                      <option value="CZ">🇨🇿 Czech Republic (+420)</option>
                      <option value="RO">🇷🇴 Romania (+40)</option>
                      <option value="HU">🇭🇺 Hungary (+36)</option>
                      <option value="UA">🇺🇦 Ukraine (+380)</option>
                      <option value="BY">🇧🇾 Belarus (+375)</option>
                      <option value="GE">🇬🇪 Georgia (+995)</option>
                      <option value="AZ">🇦🇿 Azerbaijan (+994)</option>
                      <option value="AM">🇦🇲 Armenia (+374)</option>
                    </optgroup>
                    <optgroup label="Asia-Pacific">
                      <option value="IN">🇮🇳 India (+91)</option>
                      <option value="CN">🇨🇳 China (+86)</option>
                      <option value="JP">🇯🇵 Japan (+81)</option>
                      <option value="KR">🇰🇷 South Korea (+82)</option>
                      <option value="ID">🇮🇩 Indonesia (+62)</option>
                      <option value="TH">🇹🇭 Thailand (+66)</option>
                      <option value="VN">🇻🇳 Vietnam (+84)</option>
                      <option value="PH">🇵🇭 Philippines (+63)</option>
                      <option value="MY">🇲🇾 Malaysia (+60)</option>
                      <option value="SG">🇸🇬 Singapore (+65)</option>
                      <option value="AU">🇦🇺 Australia (+61)</option>
                      <option value="NZ">🇳🇿 New Zealand (+64)</option>
                      <option value="PK">🇵🇰 Pakistan (+92)</option>
                      <option value="BD">🇧🇩 Bangladesh (+880)</option>
                      <option value="LK">🇱🇰 Sri Lanka (+94)</option>
                      <option value="NP">🇳🇵 Nepal (+977)</option>
                      <option value="MM">🇲🇲 Myanmar (+95)</option>
                      <option value="KH">🇰🇭 Cambodia (+855)</option>
                      <option value="LA">🇱🇦 Laos (+856)</option>
                      <option value="UZ">🇺🇿 Uzbekistan (+998)</option>
                      <option value="KZ">🇰🇿 Kazakhstan (+7)</option>
                    </optgroup>
                    <optgroup label="Middle East">
                      <option value="SA">🇸🇦 Saudi Arabia (+966)</option>
                      <option value="AE">🇦🇪 UAE (+971)</option>
                      <option value="TR">🇹🇷 Turkey (+90)</option>
                      <option value="EG">🇪🇬 Egypt (+20)</option>
                      <option value="IL">🇮🇱 Israel (+972)</option>
                      <option value="JO">🇯🇴 Jordan (+962)</option>
                      <option value="LB">🇱🇧 Lebanon (+961)</option>
                      <option value="KW">🇰🇼 Kuwait (+965)</option>
                      <option value="QA">🇶🇦 Qatar (+974)</option>
                      <option value="BH">🇧🇭 Bahrain (+973)</option>
                      <option value="OM">🇴🇲 Oman (+968)</option>
                    </optgroup>
                    <optgroup label="Africa">
                      <option value="ZA">🇿🇦 South Africa (+27)</option>
                      <option value="NG">🇳🇬 Nigeria (+234)</option>
                      <option value="KE">🇰🇪 Kenya (+254)</option>
                      <option value="GH">🇬🇭 Ghana (+233)</option>
                      <option value="CI">🇨🇮 Ivory Coast (+225)</option>
                      <option value="SN">🇸🇳 Senegal (+221)</option>
                      <option value="UG">🇺🇬 Uganda (+256)</option>
                      <option value="TZ">🇹🇿 Tanzania (+255)</option>
                      <option value="ET">🇪🇹 Ethiopia (+251)</option>
                      <option value="ZM">🇿🇲 Zambia (+260)</option>
                      <option value="ZW">🇿🇼 Zimbabwe (+263)</option>
                      <option value="MZ">🇲🇿 Mozambique (+258)</option>
                      <option value="AO">🇦🇴 Angola (+244)</option>
                      <option value="CM">🇨🇲 Cameroon (+237)</option>
                      <option value="CD">🇨🇩 Congo DR (+243)</option>
                      <option value="MG">🇲🇬 Madagascar (+261)</option>
                      <option value="ML">🇲🇱 Mali (+223)</option>
                      <option value="NE">🇳🇪 Niger (+227)</option>
                      <option value="BF">🇧🇫 Burkina Faso (+226)</option>
                      <option value="BJ">🇧🇯 Benin (+229)</option>
                      <option value="TG">🇹🇬 Togo (+228)</option>
                      <option value="SL">🇸🇱 Sierra Leone (+232)</option>
                      <option value="LR">🇱🇷 Liberia (+231)</option>
                      <option value="GN">🇬🇳 Guinea (+224)</option>
                      <option value="GW">🇬🇼 Guinea-Bissau (+245)</option>
                      <option value="GM">🇬🇲 Gambia (+220)</option>
                      <option value="MR">🇲🇷 Mauritania (+222)</option>
                      <option value="MA">🇲🇦 Morocco (+212)</option>
                      <option value="DZ">🇩🇿 Algeria (+213)</option>
                      <option value="TN">🇹🇳 Tunisia (+216)</option>
                      <option value="LY">🇱🇾 Libya (+218)</option>
                      <option value="SD">🇸🇩 Sudan (+249)</option>
                    </optgroup>
                    <optgroup label="Latin America">
                      <option value="BR">🇧🇷 Brazil (+55)</option>
                      <option value="AR">🇦🇷 Argentina (+54)</option>
                      <option value="CL">🇨🇱 Chile (+56)</option>
                      <option value="CO">🇨🇴 Colombia (+57)</option>
                      <option value="PE">🇵🇪 Peru (+51)</option>
                      <option value="VE">🇻🇪 Venezuela (+58)</option>
                    </optgroup>
                    <optgroup label="Russia & CIS">
                      <option value="RU">🇷🇺 Russia (+7)</option>
                    </optgroup>
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
                } else if (ruleType === 'geo_path') {
                  const sourceLat = Number(ruleInputs.sourceLat ?? 0);
                  const sourceLon = Number(ruleInputs.sourceLon ?? 0);
                  const destLat = Number(ruleInputs.destLat ?? 0);
                  const destLon = Number(ruleInputs.destLon ?? 0);
                  const speed = Number(ruleInputs.speed ?? 500);
                  rule = { kind: 'geo_path', sourceLat, sourceLon, destLat, destLon, speed };
                } else if (ruleType === 'ip') {
                  const version = (ruleInputs.version ?? 'v4') as 'v4' | 'v6';
                  rule = { kind: 'ip', version };
                } else if (ruleType === 'prefix') {
                  rule = { kind: 'prefix', prefix: ruleInputs.prefix ?? '' };
                } else if (ruleType === 'phone') {
                  const country = (ruleInputs.country ?? 'US') as PhoneRule['country'];
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
                  // Clear form after adding/updating
                  setRuleField('');
                  setRuleType('');
                  setRuleInputs({});
                }
              }}>{rules[ruleField] ? '✅ Update Rule' : '➕ Add Rule'}</button>
              {ruleField && (
                <button onClick={() => {
                  setRuleField('');
                  setRuleType('');
                  setRuleInputs({});
                }}>❌ Cancel</button>
              )}
            </div>
            {Object.keys(rules).length > 0 && (
              <div className="row">
                <div className="col full-width">
                  <label>Active Rules</label>
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '0.5em', maxHeight: '200px', overflowY: 'auto' }}>
                    {Object.entries(rules).map(([field, rule]) => (
                      <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5em', borderBottom: '1px solid #eee' }}>
                        <span style={{ flex: 1 }}>
                          <strong>{field}</strong>: {rule.kind}
                          {rule.kind === 'date' && ` (${rule.format})`}
                          {rule.kind === 'geo_path' && ` (${(rule as GeoPathRule).speed ?? 500} km/h)`}
                          {rule.kind === 'manual' && ` = "${(rule as any).value}"`}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5em' }}>
                          <button 
                            style={{ padding: '0.25em 0.5em', fontSize: '0.85em' }}
                            onClick={() => {
                              setRuleField(field);
                              setRuleType(rule.kind);
                              
                              // Populate inputs based on rule type
                              const inputs: Record<string, string> = {};
                              if (rule.kind === 'date') {
                                inputs.format = rule.format;
                                if (rule.range) {
                                  inputs.rangeStart = rule.range.start.toISOString();
                                  inputs.rangeEnd = rule.range.end.toISOString();
                                }
                              } else if (rule.kind === 'geo_point') {
                                inputs.latMin = String(rule.latMin);
                                inputs.latMax = String(rule.latMax);
                                inputs.lonMin = String(rule.lonMin);
                                inputs.lonMax = String(rule.lonMax);
                              } else if (rule.kind === 'geo_path') {
                                const geoRule = rule as GeoPathRule;
                                inputs.sourceLat = String(geoRule.sourceLat);
                                inputs.sourceLon = String(geoRule.sourceLon);
                                inputs.destLat = String(geoRule.destLat);
                                inputs.destLon = String(geoRule.destLon);
                                inputs.speed = String(geoRule.speed ?? 500);
                                // Try to find matching city/port names
                                const sourceLocation = [...CITIES, ...SEAPORTS, ...VEHICLE_LOCATIONS].find(
                                  l => Math.abs(l.lat - geoRule.sourceLat) < 0.01 && Math.abs(l.lon - geoRule.sourceLon) < 0.01
                                );
                                const destLocation = [...CITIES, ...SEAPORTS, ...VEHICLE_LOCATIONS].find(
                                  l => Math.abs(l.lat - geoRule.destLat) < 0.01 && Math.abs(l.lon - geoRule.destLon) < 0.01
                                );
                                if (sourceLocation) inputs.sourceCity = sourceLocation.name;
                                if (destLocation) inputs.destCity = destLocation.name;
                                // Determine travel mode
                                if (SEAPORTS.some(p => p.name === sourceLocation?.name)) inputs.travelMode = 'vessel';
                                else if (VEHICLE_LOCATIONS.some(v => v.name === sourceLocation?.name)) inputs.travelMode = 'vehicle';
                                else inputs.travelMode = 'aircraft';
                              } else if (rule.kind === 'ip') {
                                inputs.version = rule.version;
                              } else if (rule.kind === 'prefix') {
                                inputs.prefix = rule.prefix;
                              } else if (rule.kind === 'phone') {
                                inputs.country = rule.country;
                              } else if (rule.kind === 'manual') {
                                inputs.value = String((rule as any).value);
                              } else if (rule.kind === 'geohash') {
                                inputs.precision = String(rule.precision);
                              } else if (rule.kind === 'geo_city') {
                                inputs.city = (rule as any).city;
                              } else if (rule.kind === 'geo_number') {
                                inputs.latMin = String((rule as any).latMin);
                                inputs.latMax = String((rule as any).latMax);
                                inputs.lonMin = String((rule as any).lonMin);
                                inputs.lonMax = String((rule as any).lonMax);
                              } else if (rule.kind === 'num_range') {
                                inputs.min = String((rule as any).min);
                                inputs.max = String((rule as any).max);
                              } else if (rule.kind === 'num_max') {
                                inputs.max = String((rule as any).max);
                              } else if (rule.kind === 'string_list') {
                                inputs.values = (rule as any).values.join(', ');
                              } else if (rule.kind === 'image_path') {
                                inputs.mode = (rule as any).mode;
                                inputs.base = (rule as any).base;
                                inputs.ext = (rule as any).ext;
                              }
                              
                              setRuleInputs(inputs);
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button 
                            style={{ padding: '0.25em 0.5em', fontSize: '0.85em', background: '#e74c3c', color: 'white' }}
                            onClick={() => {
                              const newRules = { ...rules };
                              delete newRules[field];
                              setRules(newRules);
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                </div>
              </div>
            )}
            {Object.keys(rules).length > 0 && (
              <div className="row">
                <button onClick={() => setRules({})}>Clear All Rules</button>
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
                    <textarea 
                      readOnly 
                      rows={20} 
                      value={JSON.stringify(previewDocs, null, 2)}
                      style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                    />
                  ) : (
                    <div className="json-tree result" style={{ maxHeight: '500px', overflow: 'auto' }}>
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
              logAudit('Bulk Insert', 'generation', `Failed to insert ${docs.length} documents to ${indexName}: ${msg}`, 'error', { count: docs.length, index: indexName });
            } else {
              const succeeded = res.succeeded ?? succCount;
              const failed = res.failed ?? failCount;
              setGenStatus(`Requested ${docs.length}, succeeded ${succeeded}, failed ${failed}`);
              logAudit('Bulk Insert', 'generation', `Successfully inserted ${succeeded} documents to ${indexName} (${failed} failed)`, failed > 0 ? 'warning' : 'success', { succeeded, failed, index: indexName });
            }
          }}>Confirm & Generate + Insert</button>
          <button disabled={!uploading} onClick={() => { bulkCtrl?.abort(); }}>Cancel</button>
        </div>

        {/* Export generated data for multi-database use (ES, Postgres, MySQL, etc.) */}
        <div className="row">
          <button
            disabled={!mappingLoaded || uploading || !previewReady || previewConfig !== currentPreviewConfig}
            onClick={() => {
              if (!mappingLoaded) return;
              const start = rangeStart ? new Date(rangeStart) : new Date(Date.now() - 86400000);
              const end = rangeEnd ? new Date(rangeEnd) : new Date();
              const docs = generateDocs(mappingLoaded, genCount, { start, end }, rules);
              if (!docs || docs.length === 0) return;
              const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `schema-generated-${indexName || 'data'}-${new Date().toISOString()}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            📥 Download JSON (for any DB)
          </button>
          <button
            disabled={!mappingLoaded || uploading || !previewReady || previewConfig !== currentPreviewConfig}
            onClick={() => {
              if (!mappingLoaded) return;
              const start = rangeStart ? new Date(rangeStart) : new Date(Date.now() - 86400000);
              const end = rangeEnd ? new Date(rangeEnd) : new Date();
              const docs = generateDocs(mappingLoaded, genCount, { start, end }, rules);
              if (!docs || docs.length === 0) return;
              
              const headers = Array.from(
                docs.reduce<Set<string>>((set, d) => {
                  Object.keys(d as Record<string, unknown>).forEach(k => set.add(k));
                  return set;
                }, new Set<string>())
              );
              
              const rows = docs.map(d =>
                headers.map(h => {
                  const v = (d as Record<string, unknown>)[h];
                  const s =
                    v === null || v === undefined
                      ? ''
                      : typeof v === 'object'
                      ? JSON.stringify(v)
                      : String(v);
                  return `"${s.replace(/"/g, '""')}"`;
                }).join(',')
              );
              
              const csv = [headers.join(','), ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `schema-generated-${indexName || 'data'}-${new Date().toISOString()}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            📊 Download CSV (for SQL DBs)
          </button>
        </div>
        <h3>Real-Time Mode</h3>
        <p style={{ fontSize: '0.9em', color: '#666' }}>
          Automatically generate and insert documents at regular intervals using the same field rules and schema.
        </p>
        <div className="row">
          <div className="col">
            <label>Enable</label>
            <input type="checkbox" checked={rtEnabled} onChange={e => setRtEnabled(e.target.checked)} />
          </div>
          {rtEnabled && (
            <>
              <div className="col">
                <label>Interval (seconds)</label>
                <input 
                  type="number" 
                  value={rtInterval} 
                  onChange={e => setRtInterval(Number(e.target.value))} 
                  min="1"
                  placeholder="60"
                />
              </div>
              <div className="col">
                <label>Docs per Interval</label>
                <input 
                  type="number" 
                  value={rtDocCount} 
                  onChange={e => setRtDocCount(Number(e.target.value))} 
                  min="1"
                  max="1000"
                  placeholder="1"
                />
              </div>
            </>
          )}
        </div>
        {rtEnabled && (
          <div className="row">
            <button disabled={!selected || !mappingLoaded || rtRunning} onClick={async () => {
              if (!selected || !mappingLoaded) return;
              setRtInserted(0);
              setRtLastDoc(null);
              setRtStatus(`Starting real-time mode: ${rtDocCount} doc(s) every ${rtInterval}s`);
              
              // Find all date fields in the mapping
              const dateFields = listFieldsByType(mappingLoaded, 'date');
              
              // Initialize geo path state
              const initialGeoState: Record<string, { lat: number; lon: number }> = {};
              Object.entries(rules).forEach(([field, rule]) => {
                if (rule.kind === 'geo_path') {
                  initialGeoState[field] = { lat: rule.sourceLat, lon: rule.sourceLon };
                }
              });
              setRtGeoState(initialGeoState);
              
              setRtRunning(true);
              logAudit('Start Real-Time Mode', 'generation', `Started real-time mode: ${rtDocCount} doc(s) every ${rtInterval}s to ${indexName}`, 'success', { interval: rtInterval, docCount: rtDocCount, index: indexName });
              const id = window.setInterval(() => {
                  (async () => {
                  // Generate documents using current timestamp
                  const now = new Date();
                  const currentTimeRange = { start: now, end: now };
                  
                  // Create rules that override date fields with current timestamp
                  const rtRules = { ...rules };
                  dateFields.forEach(field => {
                    // Get the format for this field (from schema or rule)
                    const format = getDateFormatForField(mappingLoaded!, field, rules[field]);
                    // Override with manual rule using current timestamp
                    rtRules[field] = { kind: 'manual', value: formatDate(now, format) };
                  });
                  
                  // Update geo path positions and create rules
                  setRtGeoState(prevState => {
                    const newState = { ...prevState };
                    Object.entries(rules).forEach(([field, rule]) => {
                      if (rule.kind === 'geo_path') {
                        const current = prevState[field] || { lat: rule.sourceLat, lon: rule.sourceLon };
                        const speed = rule.speed || 500; // default 500 km/h
                        const next = calculateNextPosition(
                          current.lat,
                          current.lon,
                          rule.destLat,
                          rule.destLon,
                          speed,
                          rtInterval
                        );
                        
                        // If arrived, start over from source
                        if (next.arrived) {
                          newState[field] = { lat: rule.sourceLat, lon: rule.sourceLon };
                          rtRules[field] = { kind: 'manual', value: { lat: rule.sourceLat, lon: rule.sourceLon } };
                        } else {
                          newState[field] = { lat: next.lat, lon: next.lon };
                          rtRules[field] = { kind: 'manual', value: { lat: next.lat, lon: next.lon } };
                        }
                      }
                    });
                    return newState;
                  });
                  
                  // Generate documents with current timestamp and positions
                  const docs = generateDocs(mappingLoaded!, rtDocCount, currentTimeRange, rtRules);
                  setRtLastDoc(docs[docs.length - 1] || null);
                  
                  // Insert documents
                  const res = await bulkInsert(selected!, indexName, docs, docs.length);
                    if (!res.ok) {
                      setRtStatus(res.error || `Bulk failed HTTP ${res.status}`);
                    } else {
                      setRtInserted(prev => {
                      const next = prev + docs.length;
                      const timestamp = now.toLocaleTimeString();
                      setRtStatus(`Inserted ${next} docs in real-time (last: ${timestamp})`);
                        return next;
                      });
                    }
                  })();
              }, rtInterval * 1000);
              
              setRtTimerId(id);
            }}>Start</button>
            <button disabled={!rtRunning} onClick={() => {
              if (rtTimerId) { window.clearInterval(rtTimerId); }
              setRtTimerId(null);
              setRtRunning(false);
              setRtStatus('Stopped');
              logAudit('Stop Real-Time Mode', 'generation', `Stopped real-time mode. Total inserted: ${rtInserted} documents`, 'success', { totalInserted: rtInserted });
            }}>Stop</button>
          </div>
        )}
        {rtEnabled && rtLastDoc && (
          <div className="row">
            <div className="col">
              <label>Last Generated Document</label>
              <textarea 
                readOnly 
                rows={12} 
                value={JSON.stringify(rtLastDoc, null, 2)}
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>
          </div>
        )}
        {rtEnabled && Object.keys(rtGeoState).length > 0 && (
          <div className="row">
            <div className="col">
              <label>Current Geo Positions (Real-Time Path)</label>
              <textarea 
                readOnly 
                rows={10} 
                value={JSON.stringify(rtGeoState, null, 2)}
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
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
            <SearchableSelect
              label="Old Index"
              value={cmpA}
              onChange={setCmpA}
              options={indices}
              placeholder="Type to search..."
            />
          </div>
          <div className="col">
            <SearchableSelect
              label="New Index"
              value={cmpB}
              onChange={setCmpB}
              options={indices}
              placeholder="Type to search..."
            />
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
              <SearchableSelect
                label="Index"
                value={sqlSourceValue}
                onChange={(v) => { setSqlSourceValue(v); applyDefaultSqlFrom(v); }}
                options={indices}
                placeholder="Type to search indices..."
              />
            </div>
          )}
          {sqlSourceType === 'data_stream' && (
            <div className="col">
              <SearchableSelect
                label="Data Stream"
                value={sqlSourceValue}
                onChange={(v) => { setSqlSourceValue(v); applyDefaultSqlFrom(v); }}
                options={dataStreams}
                placeholder="Type to search data streams..."
              />
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
        
        <div style={{ padding: '0.75em', background: '#fff9e6', borderRadius: '4px', marginBottom: '1em', fontSize: '0.9em', color: '#856404', border: '1px solid #ffeaa7' }}>
          <strong>⚠️ Elasticsearch SQL Limitations:</strong>
          <ul style={{ margin: '0.5em 0 0 1.5em', paddingLeft: 0 }}>
            <li><strong>Array fields are not supported</strong> - Click "📋 View as List" button to see data with arrays in JSON format</li>
            <li>Nested objects may have limited support - use dot notation carefully</li>
            <li>Some aggregations may not work as expected with complex field types</li>
            <li><strong>TIP:</strong> Use "View as List" button to bypass SQL limitations and view all data including arrays!</li>
          </ul>
        </div>

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
                  let errorMsg = res.error || `HTTP ${res.status}`;
                  
                  // Check for common array field error and offer fallback
                  if (errorMsg.includes('Arrays') && errorMsg.includes('are not supported')) {
                    const arrayFieldMatch = errorMsg.match(/returned by \[([^\]]+)\]/);
                    const fieldName = arrayFieldMatch ? arrayFieldMatch[1] : 'unknown field';
                    
                    // Try fallback to Search API for viewing data
                    setSqlStatus(`❌ SQL doesn't support array field "${fieldName}". Attempting fallback to Search API...`);
                    
                    try {
                      // Extract index name from SQL query
                      const fromMatch = sqlText.match(/FROM\s+([^\s]+)/i);
                      const indexForSearch = fromMatch ? fromMatch[1].replace(/"/g, '') : sqlSourceValue;
                      
                      if (indexForSearch) {
                        // Use Search API as fallback
                        const searchBody = {
                          size: sqlFetchSize,
                          query: { match_all: {} }
                        };
                        
                        const searchRes = await searchPreview(selected, indexForSearch, searchBody);
                        
                        if (searchRes.ok && searchRes.json) {
                          const searchJson = searchRes.json as Record<string, unknown>;
                          const hits = ((searchJson.hits as Record<string, unknown>)?.hits as Array<any>) || [];
                          const docs = hits.map((h: any) => h._source || {});
                          
                          // Convert to SQL-like format for display
                          if (docs.length > 0) {
                            const allKeys = new Set<string>();
                            docs.forEach((doc: any) => {
                              Object.keys(doc).forEach(k => allKeys.add(k));
                            });
                            
                            const columns = Array.from(allKeys).map(k => ({ name: k, type: 'keyword' }));
                            const rows = docs.map((doc: any) => 
                              columns.map(col => doc[col.name])
                            );
                            
                            setSqlColumns(columns);
                            setSqlRows(rows);
                            setSqlCursor('');
                            setSqlView('json'); // Force JSON view for array data
                            setSqlStatus(`⚠️ SQL failed due to array field "${fieldName}"\n✅ Fallback: Loaded ${docs.length} documents using Search API\n💡 Switch to JSON view to see all fields including arrays`);
                            setSqlPage(1);
                            setSqlPageSize(sqlFetchSize);
                            logAudit('Execute SQL (Fallback)', 'query', `SQL failed, used Search API fallback for ${indexForSearch}: ${docs.length} docs`, 'warning', { rowCount: docs.length, arrayField: fieldName });
                            return;
                          }
                        }
                      }
                    } catch (fallbackError) {
                      // Fallback also failed, show original error
                      errorMsg = `❌ SQL Error: Elasticsearch SQL does not support array fields.\n\n` +
                                 `Field "${fieldName}" contains array values.\n\n` +
                                 `Solutions:\n` +
                                 `1. Exclude this field from your SELECT statement\n` +
                                 `2. Use wildcard to select all other fields: SELECT * EXCEPT ${fieldName}\n` +
                                 `3. Use the Search API instead of SQL for querying array fields\n` +
                                 `4. Flatten the array field in your index mapping\n\n` +
                                 `Original error:\n${res.error || `HTTP ${res.status}`}`;
                    }
                  }
                  
                  setSqlStatus(errorMsg);
                  logAudit('Execute SQL', 'query', `Failed to execute SQL query: ${sqlText.substring(0, 100)}...`, 'error');
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
                logAudit('Execute SQL', 'query', `Executed SQL query, fetched ${res.json.rows.length} rows`, 'success', { rowCount: res.json.rows.length });
              }}>Execute</button>
          
          <button disabled={!selected} onClick={async () => {
            if (!selected) return;
            setSqlStatus('Loading as List View (Search API)...');
            
            try {
              // Extract index name from SQL query or use default
              const fromMatch = sqlText.match(/FROM\s+([^\s]+)/i);
              const indexForSearch = fromMatch ? fromMatch[1].replace(/"/g, '') : sqlSourceValue;
              
              if (!indexForSearch) {
                setSqlStatus('❌ Please select an index or specify FROM clause in SQL');
                return;
              }
              
              // Use Search API to fetch data
              const searchBody = {
                size: sqlFetchSize,
                query: { match_all: {} }
              };
              
              const searchRes = await searchPreview(selected, indexForSearch, searchBody);
              
              if (!searchRes.ok || !searchRes.json) {
                setSqlStatus(searchRes.error || `HTTP ${searchRes.status}`);
                return;
              }
              
              const searchJson = searchRes.json as Record<string, unknown>;
              const hits = ((searchJson.hits as Record<string, unknown>)?.hits as Array<any>) || [];
              const docs = hits.map((h: any) => ({ _id: h._id, ...h._source }));
              
              if (docs.length === 0) {
                setSqlStatus('✅ Index is empty or no documents found');
                setSqlColumns([]);
                setSqlRows([]);
                return;
              }
              
              // Convert to SQL-like format
              const allKeys = new Set<string>();
              docs.forEach((doc: any) => {
                Object.keys(doc).forEach(k => allKeys.add(k));
              });
              
              const columns = Array.from(allKeys).map(k => ({ name: k, type: 'keyword' }));
              const rows = docs.map((doc: any) => 
                columns.map(col => doc[col.name])
              );
              
              setSqlColumns(columns);
              setSqlRows(rows);
              setSqlCursor('');
              setSqlView('json'); // Force JSON view for complete data
              setSqlStatus(`✅ List View: Loaded ${docs.length} documents from ${indexForSearch}\n💡 Using Search API - supports all field types including arrays`);
              setSqlPage(1);
              setSqlPageSize(sqlFetchSize);
              logAudit('View as List', 'query', `Loaded ${docs.length} documents from ${indexForSearch} using Search API`, 'success', { rowCount: docs.length, index: indexForSearch });
            } catch (error) {
              const msg = error instanceof Error ? error.message : 'Failed to load list view';
              setSqlStatus(`❌ ${msg}`);
              logAudit('View as List', 'query', `Failed to load list view: ${msg}`, 'error');
            }
          }}>📋 View as List</button>
          
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
            <textarea 
              readOnly 
              rows={12} 
              value={sqlTranslateJson || 'No translation yet'}
              style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
            />
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
                  <textarea 
                    readOnly 
                    rows={20} 
                    value={JSON.stringify(sqlRows.map((r: unknown[]) => {
                    const obj: Record<string, unknown> = {};
                    for (let i = 0; i < r.length; i++) {
                      const k = sqlColumns[i]?.name ?? String(i);
                      obj[k] = r[i];
                    }
                    return obj;
                    }), null, 2)}
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                  />
                ) : (
                  <div className="json-tree result" style={{ maxHeight: '500px', overflow: 'auto' }}>
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

        {/* Update by ID Section */}
        <div className="section-header" style={{ marginTop: '2em' }}>
          <h3>Update Document by ID</h3>
        </div>
        <div className="row">
          <div className="col">
            <SearchableSelect
              label="Index"
              value={updateIdIndex}
              onChange={setUpdateIdIndex}
              options={indices}
              placeholder="Type to search indices..."
            />
          </div>
          <div className="col">
            <label>Document ID</label>
            <input 
              value={updateIdDocId} 
              onChange={e => setUpdateIdDocId(e.target.value)} 
              placeholder="Enter document ID"
            />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Update Body (doc or script)</label>
            <textarea 
              rows={6} 
              value={updateIdBody} 
              onChange={e => setUpdateIdBody(e.target.value)} 
              placeholder='{"doc":{"status":"updated"}} or {"script":{"source":"ctx._source.counter++","lang":"painless"}}'
            ></textarea>
          </div>
          <div className="col">
            <label>Examples</label>
            <select 
              value={updateIdExampleId} 
              onChange={e => { 
                const id = e.target.value; 
                setUpdateIdExampleId(id); 
                const ex = UPDATE_BY_ID_EXAMPLES.find(x => x.id === id); 
                if (ex) setUpdateIdBody(ex.body); 
              }}
            >
              <option value="">Choose example…</option>
              {UPDATE_BY_ID_EXAMPLES.map(ex => (<option key={ex.id} value={ex.id}>{ex.label}</option>))}
            </select>
          </div>
        </div>
        <div className="row">
          <button 
            disabled={!selected || !updateIdIndex || !updateIdDocId} 
            onClick={async () => {
              if (!selected || !updateIdIndex || !updateIdDocId) return;
              setUpdateIdStatus('Updating document...');
              setUpdateIdResult('');
              
              let body: unknown;
              try {
                body = updateIdBody ? JSON.parse(updateIdBody) : { doc: { updated_at: new Date().toISOString() } };
              } catch {
                setUpdateIdStatus('Invalid JSON');
                return;
              }
              
              const res = await updateById(selected, updateIdIndex, updateIdDocId, body);
              
              if (!res.ok) {
                setUpdateIdStatus(`Error: ${res.error || `HTTP ${res.status}`}`);
                setUpdateIdResult('');
                logAudit('Update By ID', 'update', `Failed to update document ${updateIdDocId} in ${updateIdIndex}: ${res.error}`, 'error', { docId: updateIdDocId, index: updateIdIndex });
                return;
              }
              
              const result = res.json as Record<string, unknown>;
              const resultStr = result._result || result.result || 'unknown';
              const version = result._version || result.version || 'N/A';
              const seqNo = result._seq_no || result.seq_no || 'N/A';
              
              setUpdateIdStatus(`✅ Document updated: result=${resultStr}, version=${version}, seq_no=${seqNo}`);
              setUpdateIdResult(JSON.stringify(result, null, 2));
              logAudit('Update By ID', 'update', `Updated document ${updateIdDocId} in ${updateIdIndex} (result: ${resultStr})`, 'success', { docId: updateIdDocId, index: updateIdIndex, result: resultStr });
            }}
          >
            🔄 Update Document
          </button>
          <button onClick={() => { 
            setUpdateIdStatus(''); 
            setUpdateIdResult(''); 
            setUpdateIdDocId(''); 
            setUpdateIdBody(''); 
          }}>
            🗑️ Clear
          </button>
        </div>
        <pre className="result">{updateIdStatus}</pre>
        {updateIdResult && (
          <div className="row">
            <div className="col">
              <label>Update Result</label>
              <textarea 
                readOnly 
                rows={10} 
                value={updateIdResult}
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>
          </div>
        )}
      </section>
      )}

      {activeTab === 'update' && (
      <section>
        <div className="section-header">
          <h2>Update By Query</h2>
        </div>
        <div className="row">
          <div className="col">
            <SearchableSelect
              label="Index"
              value={updIndex}
              onChange={setUpdIndex}
              options={indices}
              placeholder="Type to search indices..."
            />
          </div>
          <div className="col">
            <label>Preview Size</label>
            <input type="number" value={updPreviewSize} onChange={e => setUpdPreviewSize(Number(e.target.value))} />
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>Update Query JSON (script + query)</label>
            <textarea rows={8} value={updQueryText} onChange={e => setUpdQueryText(e.target.value)} placeholder='{"script":{"source":"ctx._source.status = \"updated\"","lang":"painless"},"query":{"match_all":{}}}'></textarea>
          </div>
          <div className="col">
            <label>Examples</label>
            <select value={updExampleId} onChange={e => { const id = e.target.value; setUpdExampleId(id); const ex = UPDATE_QUERY_EXAMPLES.find(x => x.id === id); if (ex) setUpdQueryText(ex.body); }}>
              <option value="">Choose example…</option>
              {UPDATE_QUERY_EXAMPLES.map(ex => (<option key={ex.id} value={ex.id}>{ex.label}</option>))}
            </select>
          </div>
        </div>
        <div className="row">
          <button disabled={!selected || !updIndex} onClick={async () => {
            if (!selected || !updIndex) return;
            setUpdPreviewStatus('Previewing…');
            let body: unknown;
            try {
              const parsed = updQueryText ? JSON.parse(updQueryText) : { query: { match_all: {} } };
              const queryPart = (parsed as Record<string, unknown>).query || { match_all: {} };
              body = { query: queryPart };
            } catch {
              setUpdPreviewStatus('Invalid JSON');
              return;
            }
            const merged = { size: updPreviewSize, ...((body as Record<string, unknown>) ?? {}) } as unknown;
            const res = await searchPreview(selected, updIndex, merged);
            if (!res.ok || !res.json) { setUpdPreviewStatus(res.error || `HTTP ${res.status}`); setUpdPreviewDocs([]); return; }
            const j = res.json as Record<string, unknown>;
            const hits = ((j.hits as Record<string, unknown>)?.hits as Array<unknown>) || [];
            const docs: Record<string, unknown>[] = hits.map(h => (typeof h === 'object' && h && (h as Record<string, unknown>)._source && typeof (h as Record<string, unknown>)._source === 'object') ? ((h as Record<string, unknown>)._source as Record<string, unknown>) : {});
            const totalObj = (j.hits && typeof (j.hits as Record<string, unknown>).total === 'object') ? ((j.hits as Record<string, unknown>).total as Record<string, unknown>) : null;
            const total = totalObj && typeof totalObj.value === 'number' ? (totalObj.value as number) : docs.length;
            setUpdPreviewDocs(docs);
            setUpdPreviewStatus(`Matched ${total} docs • Showing ${docs.length} • These will be updated`);
            setUpdPage(1);
            setUpdPageSize(updPreviewSize);
          }}>Preview Matches</button>
          <button disabled={!selected || !updIndex || updPreviewDocs.length === 0 || updInProgress} onClick={async () => {
            if (!selected || !updIndex) return;
            setUpdStatus('Updating…');
            setUpdInProgress(true);
            setUpdPercent(0);
            const ctrl = new AbortController();
            setUpdCtrl(ctrl);
            let body: unknown;
            try {
              body = updQueryText ? JSON.parse(updQueryText) : { script: { source: "ctx._source.updated_at = new Date().getTime()", lang: "painless" }, query: { match_all: {} } };
            } catch {
              setUpdStatus('Invalid JSON');
              setUpdInProgress(false);
              setUpdCtrl(null);
              return;
            }
            const res = await updateByQueryAsync(selected, updIndex, body, {
              signal: ctrl.signal,
              onProgress: (s) => {
                const t = Number(s.status?.total ?? 0);
                const u = Number((s.status as any)?.updated ?? 0);
                const vc = Number(s.status?.version_conflicts ?? 0);
                const np = Number(s.status?.noops ?? 0);
                const done = u + vc + np;
                const pct = t > 0 ? Math.min(100, Math.floor((done / t) * 100)) : 0;
                setUpdPercent(pct);
                setUpdStatus(`Progress ${pct}% • Updated ${u}/${t} • Conflicts ${vc}`);
              },
            });
            setUpdTaskId(res.taskId || '');
            if (!res.ok) {
              setUpdStatus(res.error || `HTTP ${res.status}`);
              setUpdInProgress(false);
              setUpdCtrl(null);
              logAudit('Update By Query', 'update', `Failed to update documents in ${updIndex}: ${res.error}`, 'error', { index: updIndex });
              return;
            }
            const j = res.json as Record<string, unknown>;
            const updated = Number((j.updated as number) ?? 0);
            const total = Number((j.total as number) ?? 0);
            const conflicts = Number((j.version_conflicts as number) ?? 0);
            const batches = Number((j.batches as number) ?? 0);
            const timedOut = Boolean(j.timed_out);
            const failed = total > 0 ? Math.max(0, total - updated) : conflicts;
            setUpdPercent(100);
            setUpdInProgress(false);
            setUpdCtrl(null);
            setUpdStatus(`Requested ${total} • Updated ${updated} • Failed ${failed} • Batches ${batches} • Conflicts ${conflicts} • Timed out ${timedOut}`);
            setUpdPreviewDocs([]);
            setUpdPreviewStatus('');
            logAudit('Update By Query', 'update', `Updated ${updated} documents in ${updIndex} (${failed} failed, ${conflicts} conflicts)`, failed > 0 ? 'warning' : 'success', { updated, failed, conflicts, index: updIndex });
          }}>Update</button>
          <button disabled={!updInProgress || !updTaskId} onClick={async () => {
            if (!updInProgress || !updTaskId) return;
            await cancelTask(selected!, updTaskId);
            updCtrl?.abort();
            setUpdInProgress(false);
            setUpdCtrl(null);
            setUpdPercent(0);
            setUpdStatus('Cancelled');
          }}>Cancel</button>
          <button onClick={() => { setUpdPreviewDocs([]); setUpdPreviewStatus('Cleared'); setUpdStatus(''); }}>Clear</button>
        </div>
        {updInProgress && (
          <div className="row">
            <div className="col">
              <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px' }}>
                <div style={{ width: `${updPercent}%`, height: '8px', background: '#3b82f6', borderRadius: '4px' }} />
              </div>
            </div>
          </div>
        )}
        <pre className="result">{updPreviewStatus}</pre>
        <pre className="result">{updStatus}</pre>
        {updPreviewDocs.length > 0 && (
          <div className="row">
            <div className="col">
              <label>Preview (Documents that will be updated)</label>
              <textarea 
                readOnly 
                rows={15} 
                value={JSON.stringify(updPreviewDocs, null, 2)}
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </div>
          </div>
        )}
      </section>
      )}

      {activeTab === 'delete' && (
      <section>
        <div className="section-header">
          <h2>Delete By Query</h2>
        </div>
        <div className="row">
          <div className="col">
            <SearchableSelect
              label="Index"
              value={delIndex}
              onChange={setDelIndex}
              options={indices}
              placeholder="Type to search indices..."
            />
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
              logAudit('Delete By Query', 'delete', `Failed to delete documents from ${delIndex}: ${res.error}`, 'error', { index: delIndex });
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
            logAudit('Delete By Query', 'delete', `Deleted ${deleted} documents from ${delIndex} (${failed} failed, ${conflicts} conflicts)`, failed > 0 ? 'warning' : 'success', { deleted, failed, conflicts, index: delIndex });
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
                <textarea 
                  readOnly 
                  rows={20} 
                  value={JSON.stringify(delPreviewDocs, null, 2)}
                  style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                />
              ) : (
                <div className="json-tree result" style={{ maxHeight: '500px', overflow: 'auto' }}>
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

      {activeTab === 'audit' && (
      <section>
        <div className="section-header">
          <h2>Audit</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.9rem', color: '#9aa4b2', marginRight: '0.25rem' }}>Total Entries: {auditLog.length}</span>
            <button 
              onClick={() => {
                const blob = new Blob([JSON.stringify(auditLog, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit-${new Date().toISOString()}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              📥 Export JSON
            </button>
            <button 
              onClick={() => {
                const headers = ['Timestamp', 'User', 'Category', 'Action', 'Details', 'Status'];
                const rows = auditLog.map(entry => [
                  entry.timestamp,
                  entry.user,
                  entry.category,
                  entry.action,
                  entry.details,
                  entry.status
                ]);
                const csvContent = [headers, ...rows].map(row => 
                  row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
                ).join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit-${new Date().toISOString()}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              📊 Export CSV
            </button>
            <button 
              onClick={() => {
                if (confirm('Delete audit logs older than 7 days?')) {
                  const deletedCount = deleteOldAuditLogs(7);
                  setAuditLog(loadAuditLogs());
                  alert(`Deleted ${deletedCount} log entries older than 7 days`);
                  logAudit('Delete Old Logs', 'system', `Deleted ${deletedCount} audit logs older than 7 days`, 'success', { deletedCount });
                }
              }}
            >
              🗓️ Delete 7+ Days
            </button>
            <button 
              onClick={() => { 
                if (confirm('Clear all audit logs? This cannot be undone.')) {
                  clearAuditLogs();
                  setAuditLog([]);
                  alert('All audit logs have been cleared');
                }
              }}
            >
              🗑️ Clear All
            </button>
    </div>
        </div>

        <div className="row">
          <div className="col">
            <label>Search</label>
            <input 
              value={auditFilter} 
              onChange={e => setAuditFilter(e.target.value)} 
              placeholder="Search action, details..."
            />
          </div>
          <div className="col">
            <label>Category Filter</label>
            <select value={auditCategoryFilter} onChange={e => setAuditCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="connection">🔗 Connection</option>
              <option value="schema">📐 Schema</option>
              <option value="generation">⚡ Generation</option>
              <option value="query">🧾 Query</option>
              <option value="update">✏️ Update</option>
              <option value="delete">🗑️ Delete</option>
              <option value="import">📤 Import</option>
              <option value="system">⚙️ System</option>
            </select>
          </div>
          <div className="col">
            <label>Status Filter</label>
            <select value={auditStatusFilter} onChange={e => setAuditStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="success">✅ Success</option>
              <option value="error">❌ Error</option>
              <option value="warning">⚠️ Warning</option>
            </select>
          </div>
        </div>

        {auditLog.length === 0 ? (
          <div className="row">
            <div className="col">
              <pre className="result">No audit entries yet. User actions will be logged here.</pre>
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              <div className="col">
                <div className="table-wrap" style={{ maxHeight: '600px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Category</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog
                        .filter(entry => {
                          if (auditCategoryFilter !== 'all' && entry.category !== auditCategoryFilter) return false;
                          if (auditStatusFilter !== 'all' && entry.status !== auditStatusFilter) return false;
                          if (auditFilter && !entry.action.toLowerCase().includes(auditFilter.toLowerCase()) && 
                              !entry.details.toLowerCase().includes(auditFilter.toLowerCase())) return false;
                          return true;
                        })
                        .map(entry => (
                          <tr key={entry.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {new Date(entry.timestamp).toLocaleString()}
                            </td>
                            <td>{entry.user}</td>
                            <td>
                              {entry.category === 'connection' && '🔗'}
                              {entry.category === 'schema' && '📐'}
                              {entry.category === 'generation' && '⚡'}
                              {entry.category === 'query' && '🧾'}
                              {entry.category === 'update' && '✏️'}
                              {entry.category === 'delete' && '🗑️'}
                              {entry.category === 'system' && '⚙️'}
                              {entry.category === 'import' && '📤'}
                              {' '}{entry.category}
                            </td>
                            <td style={{ fontWeight: 600 }}>{entry.action}</td>
                            <td>{entry.details}</td>
                            <td>
                              {entry.status === 'success' && '✅'}
                              {entry.status === 'error' && '❌'}
                              {entry.status === 'warning' && '⚠️'}
                              {' '}{entry.status}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
      )}

      {activeTab === 'import' && (
      <section>
        <div className="section-header">
          <h2>Import Data from CSV/Excel</h2>
        </div>
        
        <div className="row">
          <div className="col">
            <SearchableSelect
              label="Target Index"
              value={importIndex}
              onChange={setImportIndex}
              options={indices}
              placeholder="Type to search indices..."
            />
          </div>
        </div>

        <div className="row">
          <div className="col">
            <label>Upload File(s) (CSV or Excel) - Select multiple files to batch import</label>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  if (files.length === 1) {
                    // Single file - show preview
                    handleFileUpload(files[0]);
                  } else if (files.length > 1) {
                    // Multiple files - batch mode
                    handleMultipleFilesUpload(files);
                  }
                }
              }}
              style={{ padding: '0.5rem', cursor: 'pointer' }}
            />
          </div>
        </div>

        {importFile && (
          <div className="row">
            <div className="col">
              <pre className="result">
                📄 File: {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)
              </pre>
            </div>
          </div>
        )}

        <pre className="result">{importStatus}</pre>

        {importMultipleFiles.length > 1 && (
          <>
            <h3>📁 Batch Import: {importMultipleFiles.length} Files</h3>
            <div className="row" style={{ marginBottom: '1em' }}>
              <div className="col">
                <div style={{ background: '#f8f9fa', padding: '1em', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '5%' }}>#</th>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '40%' }}>File Name</th>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '15%' }}>Status</th>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '10%' }}>Rows</th>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '15%' }}>Succeeded</th>
                        <th style={{ padding: '0.5em', textAlign: 'left', width: '15%' }}>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importFileResults.map((result, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e9ecef' }}>
                          <td style={{ padding: '0.5em' }}>{idx + 1}</td>
                          <td style={{ padding: '0.5em', wordBreak: 'break-all' }}>{result.fileName}</td>
                          <td style={{ padding: '0.5em' }}>
                            {result.status === 'pending' && '⏳ Pending'}
                            {result.status === 'processing' && '🔄 Processing...'}
                            {result.status === 'success' && '✅ Success'}
                            {result.status === 'error' && '❌ Error'}
                          </td>
                          <td style={{ padding: '0.5em' }}>{result.rows > 0 ? result.rows : '-'}</td>
                          <td style={{ padding: '0.5em', color: '#28a745' }}>{result.succeeded !== undefined ? result.succeeded : '-'}</td>
                          <td style={{ padding: '0.5em', color: '#dc3545' }}>{result.failed !== undefined ? result.failed : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importFileResults.some(r => r.status === 'error' && r.error) && (
                    <div style={{ marginTop: '1em', padding: '0.75em', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                      <strong>⚠️ Errors:</strong>
                      <ul style={{ margin: '0.5em 0 0 0', paddingLeft: '1.5em', fontSize: '0.9em' }}>
                        {importFileResults.filter(r => r.error).map((r, idx) => (
                          <li key={idx}><strong>{r.fileName}:</strong> {r.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="row" style={{ marginBottom: '2em' }}>
              <button
                disabled={!importIndex || importInProgress}
                onClick={processMultipleFiles}
                style={{ background: '#28a745' }}
              >
                🚀 Import All {importMultipleFiles.length} Files
              </button>
              <button
                onClick={() => {
                  setImportMultipleFiles([]);
                  setImportFileResults([]);
                  setImportStatus('Cleared batch import.');
                }}
                style={{ background: '#6c757d' }}
              >
                🗑️ Clear Batch
              </button>
            </div>
          </>
        )}

        {importData.length > 0 && importMultipleFiles.length <= 1 && (
          <>
            <h3>Data Preview ({importData.length} rows)</h3>
            <div className="row">
              <div className="col">
                <div className="table-wrap" style={{ maxHeight: '400px' }}>
                  <table>
                    <thead>
                      <tr>
                        {importHeaders.map((header, i) => (
                          <th key={i}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 100).map((row, i) => (
                        <tr key={i}>
                          {importHeaders.map((header, j) => (
                            <td key={j}>{JSON.stringify(row[header])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importData.length > 100 && (
                  <p style={{ fontSize: '0.85em', color: '#9aa4b2', marginTop: '0.5em' }}>
                    Showing first 100 rows. Total: {importData.length} rows
                  </p>
                )}
              </div>
            </div>

            <div className="row">
              <button 
                disabled={!selected || !importIndex || importInProgress || importData.length === 0}
                onClick={async () => {
                  if (!selected || !importIndex || importData.length === 0) return;
                  
                  // Create AbortController for cancellation
                  const abortController = new AbortController();
                  setImportAbortController(abortController);
                  
                  setImportInProgress(true);
                  setImportProgress(0);
                  setImportErrors([]);
                  setImportSuccessCount(0);
                  setImportFailCount(0);
                  setImportStatus('Preparing data for import...');

                  try {
                    // Check if we have separate LAT/LON columns that need to be combined
                    const hasLatColumn = importHeaders.some(h => h.toLowerCase() === 'lat' || h.toLowerCase() === 'latitude');
                    const hasLonColumn = importHeaders.some(h => h.toLowerCase() === 'lon' || h.toLowerCase() === 'longitude' || h.toLowerCase() === 'long');
                    
                    if (hasLatColumn && hasLonColumn) {
                      const latField = importHeaders.find(h => h.toLowerCase() === 'lat' || h.toLowerCase() === 'latitude') || 'LAT';
                      const lonField = importHeaders.find(h => h.toLowerCase() === 'lon' || h.toLowerCase() === 'longitude' || h.toLowerCase() === 'long') || 'LON';
                      
                      // Try to detect geo field name from mapping
                      let geoField = 'location'; // Default
                      try {
                        const mappingRes = await fetchMapping(selected, importIndex);
                        if (mappingRes.ok && mappingRes.json) {
                          const json = mappingRes.json as Record<string, any>;
                          const indexMappings = json[importIndex]?.mappings || json.mappings || {};
                          if (indexMappings.properties) {
                            const geoFields = Object.entries(indexMappings.properties).filter(([_, spec]: any) => spec.type === 'geo_point');
                            if (geoFields.length > 0) {
                              geoField = geoFields[0][0];
                            }
                          }
                        }
                      } catch (e) {
                        console.log('Could not detect geo field, using default "location"');
                      }
                      
                      setImportStatus(`🗺️ Auto-combining ${latField} and ${lonField} into "${geoField}"...`);
                      
                      let combinedCount = 0;
                      let skippedCount = 0;
                      
                      // Combine LAT/LON into geo_point field
                      importData.forEach((doc, idx) => {
                        const lat = doc[latField];
                        const lon = doc[lonField];
                        
                        // Check if both values exist and are valid numbers
                        const latNum = typeof lat === 'string' ? parseFloat(lat) : (typeof lat === 'number' ? lat : NaN);
                        const lonNum = typeof lon === 'string' ? parseFloat(lon) : (typeof lon === 'number' ? lon : NaN);
                        
                        if (!isNaN(latNum) && !isNaN(lonNum) && latNum !== 0 && lonNum !== 0) {
                          // Use object format for better ES compatibility
                          doc[geoField] = { lat: latNum, lon: lonNum };
                          combinedCount++;
                          
                          // Remove individual LAT/LON fields
                          delete doc[latField];
                          delete doc[lonField];
                        } else {
                          skippedCount++;
                          console.warn(`Row ${idx + 1}: Invalid LAT/LON - LAT: ${lat}, LON: ${lon}`);
                          // Remove invalid LAT/LON fields to avoid ES errors
                          delete doc[latField];
                          delete doc[lonField];
                        }
                      });
                      
                      // Update headers
                      setImportHeaders(prev => prev.filter(h => h !== latField && h !== lonField).concat(geoField));
                      
                      console.log('Geo-point combination summary:', {
                        total: importData.length,
                        combined: combinedCount,
                        skipped: skippedCount,
                        geoField,
                        sampleValid: importData.find(d => d[geoField]),
                        sampleInvalid: importData.find(d => !d[geoField])
                      });
                      
                      setImportStatus(`✅ Combined ${combinedCount} valid geo-points\n⚠️ Skipped ${skippedCount} rows with invalid LAT/LON values`);
                    }
                    
                    // Get initial index count
                    const initialCountRes = await getIndexCount(selected, importIndex);
                    const initialCount = initialCountRes.ok ? (initialCountRes.count || 0) : 0;
                    setImportStartCount(initialCount);
                    setImportIndexCount(initialCount);
                    
                    // Use data as-is without validation
                    // Clean data: remove empty strings and handle null values
                    setImportStatus('Cleaning data (removing empty values)...');
                    setImportProgress(5);
                    
                    const transformedData = importData.map((doc) => {
                      const cleaned: Record<string, any> = {};
                      
                      for (const [key, value] of Object.entries(doc)) {
                        // Skip empty strings, null, undefined - these cause ES parsing errors
                        if (value === '' || value === null || value === undefined) {
                          continue; // Don't include this field
                        }
                        
                        // Skip values that are just whitespace
                        if (typeof value === 'string' && value.trim() === '') {
                          continue;
                        }
                        
                        // Keep valid values
                        cleaned[key] = value;
                      }
                      
                      return cleaned;
                    });
                    
                    console.log('Data cleaning summary:', {
                      originalFields: Object.keys(importData[0] || {}).length,
                      cleanedFields: Object.keys(transformedData[0] || {}).length,
                      sampleOriginal: importData[0],
                      sampleCleaned: transformedData[0]
                    });
                    
                    setImportStatus('Data cleaned. Starting bulk insert...');
                    setImportProgress(10);
                    
                    // Bulk insert with optimized chunks
                    const CHUNK_SIZE = importData.length > 50000 ? 1000 : (importData.length > 10000 ? 2000 : 5000); // Larger chunks for faster insertion
                    
                    // Track index count updates
                    let lastCountUpdate = Date.now();
                    
                    const res = await bulkInsert(selected, importIndex, transformedData, CHUNK_SIZE, {
                      signal: abortController.signal,
                      onProgress: async (info) => {
                        // Progress: 10% prep, 90% for insertion
                        const insertionProgress = info.total > 0 ? Math.floor((info.processed / info.total) * 90) : 0;
                        const totalProgress = 10 + insertionProgress;
                        setImportProgress(totalProgress);
                        setImportSuccessCount(info.succeeded);
                        setImportFailCount(info.failed);
                        
                        // Update index count every 3 seconds or on completion
                        const now = Date.now();
                        if (now - lastCountUpdate > 3000 || info.processed === info.total) {
                          lastCountUpdate = now;
                          const countRes = await getIndexCount(selected, importIndex);
                          if (countRes.ok && countRes.count !== undefined) {
                            setImportIndexCount(countRes.count);
                          }
                        }
                        
                        const currentIndexDocs = importIndexCount !== null ? ` | 📊 Index: ${importIndexCount.toLocaleString()} docs` : '';
                        setImportStatus(`📤 Inserting data... ${info.processed}/${info.total} rows (chunk ${info.chunkIndex + 1}/${info.chunkCount})\n✅ Success: ${info.succeeded} | ❌ Failed: ${info.failed}${currentIndexDocs}`);
                      },
                    });

                    setImportInProgress(false);
                    setImportAbortController(null);
                    
                    if (!res.ok) {
                      const wasCancelled = res.error === 'Cancelled';
                      setImportStatus(wasCancelled ? '⚠️ Import cancelled by user' : `❌ Error: ${res.error || `HTTP ${res.status}`}`);
                      if (!wasCancelled) {
                        logAudit('Import Data', 'import', `Failed to import ${importData.length} rows to ${importIndex}: ${res.error}`, 'error', { rowCount: importData.length, index: importIndex, fileName: importFile?.name });
                      }
                      return;
                    }

                    const succeeded = res.succeeded ?? importSuccessCount;
                    const failed = res.failed ?? importFailCount;
                    
                    // Get final index count
                    const finalCountRes = await getIndexCount(selected, importIndex);
                    const finalCount = finalCountRes.ok ? (finalCountRes.count || 0) : 0;
                    setImportIndexCount(finalCount);
                    
                    const countDelta = importStartCount !== null ? finalCount - importStartCount : succeeded;
                    
                    // Collect errors from bulk insert response
                    const bulkErrors: Array<{ row: number; field?: string; error: string; data: Record<string, unknown> }> = [];
                    
                    if (res.errorDetails && Array.isArray(res.errorDetails)) {
                      res.errorDetails.forEach((detail: any) => {
                        bulkErrors.push({
                          row: detail.index + 1,
                          error: detail.error,
                          data: detail.doc as Record<string, unknown>
                        });
                      });
                    }
                    
                    // Show errors if any
                    if (bulkErrors.length > 0) {
                      setImportErrors(bulkErrors);
                      console.log('Import errors (first 10):', bulkErrors.slice(0, 10));
                      console.log('All error messages:', Array.from(new Set(bulkErrors.map(e => e.error))));
                    }
                    
                    // Log summary
                    console.log('Import summary:', {
                      attempted: importData.length,
                      succeeded,
                      failed,
                      bulkErrors: bulkErrors.length,
                      successRate: `${((succeeded / importData.length) * 100).toFixed(1)}%`
                    });
                    
                    // Log analysis for the consistent 19/80 split
                    if (succeeded === 19 && failed === 80) {
                      console.warn('⚠️ CONSISTENT PATTERN DETECTED: Always 19 succeed, 80 fail');
                      console.warn('Likely causes:');
                      console.warn('1. First 19 rows have valid data, remaining 80 have formatting issues');
                      console.warn('2. Check if rows 20-99 have empty/invalid LAT/LON values');
                      console.warn('3. Check if rows 20-99 are missing required fields');
                      console.log('Sample successful doc (row ~1-19):', transformedData[0]);
                      console.log('Sample failed doc (row ~20):', transformedData[19]);
                      console.log('Sample failed doc (row ~50):', transformedData[49]);
                    }

                    setImportProgress(100);
                    setImportStatus(
                      `✅ Import complete!\n\n` +
                      `📤 Attempted: ${importData.length.toLocaleString()} rows\n` +
                      `✅ Succeeded: ${succeeded.toLocaleString()}\n` +
                      `❌ Failed: ${failed.toLocaleString()}\n\n` +
                      `📊 Index "${importIndex}":\n` +
                      `   Before: ${importStartCount !== null ? importStartCount.toLocaleString() : 'N/A'} docs\n` +
                      `   After: ${finalCount.toLocaleString()} docs\n` +
                      `   Added: +${countDelta.toLocaleString()} docs`
                    );
                    logAudit('Import Data', 'import', `Imported ${succeeded} docs to ${importIndex}: ${succeeded} succeeded, ${failed} failed`, failed > 0 ? 'warning' : 'success', { succeeded, failed, index: importIndex, fileName: importFile?.name, beforeCount: importStartCount, afterCount: finalCount });
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Unknown error';
                    setImportInProgress(false);
                    setImportAbortController(null);
                    setImportStatus(`❌ Error: ${msg}`);
                    logAudit('Import Data', 'import', `Import failed: ${msg}`, 'error', { fileName: importFile?.name });
                  }
                }}
              >
                📤 Insert Data to Index
              </button>
              <button 
                disabled={!importInProgress}
                onClick={() => {
                  if (importAbortController) {
                    importAbortController.abort();
                    setImportStatus('⚠️ Cancelling import...');
                  }
                }}
                style={{ background: '#e74c3c' }}
              >
                🛑 Cancel Import
              </button>
              <button 
                onClick={() => {
                  setImportFile(null);
                  setImportData([]);
                  setImportHeaders([]);
                  setImportErrors([]);
                  setImportStatus('');
                  setImportProgress(0);
                  setImportSuccessCount(0);
                  setImportFailCount(0);
                  setImportIndexCount(null);
                  setImportStartCount(null);
                }}
              >
                🗑️ Clear
              </button>
            </div>

            {importInProgress && (
              <div className="row">
                <div className="col">
                  <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px' }}>
                    <div style={{ width: `${importProgress}%`, height: '8px', background: '#3b82f6', borderRadius: '4px', transition: 'width 0.3s' }} />
                  </div>
                  <p style={{ fontSize: '0.9em', color: '#9aa4b2', marginTop: '0.5em' }}>
                    Progress: {importProgress}% • Success: {importSuccessCount.toLocaleString()} • Failed: {importFailCount.toLocaleString()}
                    {importIndexCount !== null && importStartCount !== null && (
                      <span style={{ marginLeft: '1em', color: '#3b82f6', fontWeight: 600 }}>
                        📊 Index: {importIndexCount.toLocaleString()} docs (+{(importIndexCount - importStartCount).toLocaleString()})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {importErrors.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1em' }}>
                  <h3 style={{ color: '#e74c3c', margin: 0 }}>Errors ({importErrors.length})</h3>
                  <button 
                    onClick={() => {
                      // Export errors to CSV
                      const csvContent = [
                        ['Row #', 'Field', 'Error', 'Data'],
                        ...importErrors.map(err => [
                          err.row.toString(),
                          err.field || '-',
                          err.error,
                          JSON.stringify(err.data)
                        ])
                      ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
                      
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `import-errors-${importIndex}-${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{ padding: '0.5em 1em', background: '#3b82f6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9em' }}
                  >
                    📥 Export Errors to CSV
                  </button>
                </div>
                
                {/* Error summary */}
                <div style={{ padding: '1em', background: '#fff3f3', borderRadius: '4px', marginTop: '1em', marginBottom: '1em' }}>
                  <strong style={{ color: '#e74c3c' }}>⚠️ Error Analysis:</strong>
                  <div style={{ marginTop: '0.5em' }}>
                    <strong>Common Error Types:</strong>
                    <ul style={{ margin: '0.5em 0 0 0', paddingLeft: '1.5em', fontSize: '0.9em', color: '#666' }}>
                      {Array.from(new Set(importErrors.map(e => {
                        const match = e.error.match(/\[(\d+)\]\s*([^:]+)/);
                        return match ? `[${match[1]}] ${match[2]}` : e.error.substring(0, 50);
                      }))).slice(0, 5).map((errType, i) => {
                        const count = importErrors.filter(e => e.error.includes(errType.split(']')[1] || errType)).length;
                        return <li key={i}><strong>{errType}:</strong> {count} occurrence{count > 1 ? 's' : ''}</li>;
                      })}
                    </ul>
                  </div>
                  
                  <div style={{ marginTop: '1em', padding: '0.75em', background: '#fff', borderRadius: '4px', border: '1px solid #ffcccc' }}>
                    <strong>Sample Error Detail (Row {importErrors[0]?.row}):</strong>
                    <pre style={{ margin: '0.5em 0 0 0', fontSize: '0.85em', whiteSpace: 'pre-wrap', color: '#666' }}>
                      {importErrors[0]?.error}
                    </pre>
                    {importErrors[0]?.data && (
                      <details style={{ marginTop: '0.5em' }}>
                        <summary style={{ cursor: 'pointer', color: '#3b82f6', fontSize: '0.85em' }}>View failed document data</summary>
                        <pre style={{ margin: '0.5em 0 0 0', fontSize: '0.8em', color: '#666', maxHeight: '150px', overflow: 'auto' }}>
                          {JSON.stringify(importErrors[0].data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  
                  <div style={{ marginTop: '1em', fontSize: '0.9em', color: '#856404', padding: '0.5em', background: '#fff9e6', borderRadius: '4px' }}>
                    <strong>💡 Debugging Tips:</strong>
                    <ul style={{ margin: '0.5em 0 0 0', paddingLeft: '1.5em', fontSize: '0.95em' }}>
                      <li><strong>Check Console (F12):</strong> See detailed row-by-row analysis</li>
                      <li><strong>Export Errors:</strong> Click "📥 Export Errors to CSV" to analyze in Excel</li>
                      <li><strong>Check First Row:</strong> If row 1-19 succeed but 20+ fail, check for data differences</li>
                      <li><strong>Mapper Parsing Exception:</strong> Usually means field type mismatch (wrong data format for the field type)</li>
                      <li><strong>Empty Values:</strong> Missing required fields or empty geo-coordinates</li>
                    </ul>
                  </div>
                </div>
                
                <div className="row">
                  <div className="col">
                    <div className="table-wrap" style={{ maxHeight: '300px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Row #</th>
                            <th>Field</th>
                            <th>Error</th>
                            <th>Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importErrors.map((err, i) => (
                            <tr key={i} style={{ background: '#fff3f3' }}>
                              <td>{err.row}</td>
                              <td style={{ fontWeight: 600, color: '#3b82f6' }}>{err.field || '-'}</td>
                              <td style={{ color: '#e74c3c' }}>{err.error}</td>
                              <td style={{ maxWidth: '400px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>
                                {JSON.stringify(err.data, null, 2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
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
