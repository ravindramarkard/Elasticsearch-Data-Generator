type FieldType = 'keyword' | 'text' | 'date' | 'float' | 'double' | 'integer' | 'short' | 'long' | 'boolean' | 'geo_point' | 'ip' | 'object';

type Properties = Record<string, { type?: FieldType; properties?: Properties }>;

export type Mapping = {
  properties: Properties;
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, precision = 5) {
  const v = Math.random() * (max - min) + min;
  return Number(v.toFixed(precision));
}
function randString(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[randInt(0, chars.length - 1)];
  return s;
}
function randIP() {
  return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`;
}

export type TimeRange = { start: Date; end: Date };

function randDate(range?: TimeRange) {
  const start = range?.start?.getTime() ?? (Date.now() - 24 * 3600_000);
  const end = range?.end?.getTime() ?? Date.now();
  const ts = randInt(start, end);
  return new Date(ts).toISOString();
}

export type GeneratedDoc = Record<string, unknown>;

export type DateRule = { kind: 'date'; format: 'iso' | 'epoch_millis' | 'yyyy-MM-dd' | 'MM/dd/yy' | 'yyyy/MM/dd' | 'dd-MM-yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd HH:mm:ss'; range?: TimeRange };
export type GeoRule = { kind: 'geo_point'; latMin: number; latMax: number; lonMin: number; lonMax: number };
export type GeoNumberRule = { kind: 'geo_number'; axis: 'lat' | 'lon'; min: number; max: number };
export type NumberRangeRule = { kind: 'num_range'; min: number; max: number };
export type NumberMaxRule = { kind: 'num_max'; max: number; min?: number };
export type StringListRule = { kind: 'string_list'; values: string[] };
export type ImagePathRule = { kind: 'image_path'; mode: 'static' | 'list' | 'random'; path?: string; values?: string[]; base?: string; ext?: string };
export type IpRule = { kind: 'ip'; version: 'v4' | 'v6' };
export type PrefixRule = { kind: 'prefix'; prefix: string };
export type PhoneRule = { kind: 'phone'; country: 'US' | 'IN' | 'GB' };
export type ManualRule = { kind: 'manual'; value: unknown };
export type GeohashRule = { kind: 'geohash'; precision: number };
export type GeoCityRule = { kind: 'geo_city'; city: string };
export type FieldRule = DateRule | GeoRule | GeoNumberRule | NumberRangeRule | NumberMaxRule | StringListRule | ImagePathRule | IpRule | PrefixRule | PhoneRule | ManualRule | GeohashRule | GeoCityRule;
export type FieldRules = Record<string, FieldRule>;

function randomIPv6() {
  const seg = () => randInt(0, 0xffff).toString(16);
  return `${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}`;
}
function randomPhone(country: PhoneRule['country']) {
  if (country === 'US') return `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`;
  if (country === 'GB') return `+44-${randInt(2000, 9999)}-${randInt(100000, 999999)}`;
  if (country === 'IN') return `+91-${randInt(60000, 99999)}-${randInt(10000, 99999)}`;
  return `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`;
}

const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function geohashEncode(lat: number, lon: number, precision = 7): string {
  let minLat = -90, maxLat = 90, minLon = -180, maxLon = 180;
  let even = true, bit = 0, ch = 0, geohash = '';
  while (geohash.length < precision) {
    if (even) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) { ch = (ch << 1) + 1; minLon = mid; }
      else { ch = (ch << 1) + 0; maxLon = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch = (ch << 1) + 1; minLat = mid; }
      else { ch = (ch << 1) + 0; maxLat = mid; }
    }
    even = !even;
    if (++bit === 5) { geohash += base32[ch]; bit = 0; ch = 0; }
  }
  return geohash;
}

export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'New York', lat: 40.7128, lon: -74.0060 },
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
];

const DOGS = ['Bella', 'Charlie', 'Max', 'Luna', 'Rocky', 'Milo', 'Buddy', 'Coco'];
const COUNTRIES = ['United States', 'United Kingdom', 'France', 'Germany', 'India', 'Japan'];
const COUNTRY_CODES = ['US', 'GB', 'FR', 'DE', 'IN', 'JP'];
const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White'];
const IATA_CODES = ['JFK', 'SFO', 'LHR', 'CDG', 'BOM', 'NRT', 'DEL', 'LAX'];
const ICAO_CODES = ['KJFK', 'KSFO', 'EGLL', 'LFPG', 'VABB', 'RJAA', 'VIDP', 'KLAX'];

function smartStringForField(key: string): string | null {
  const n = key.toLowerCase();
  if (n.includes('dog')) return DOGS[randInt(0, DOGS.length - 1)];
  if (n.includes('first') && n.includes('name')) return FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)];
  if (n.includes('last') && n.includes('name')) return LAST_NAMES[randInt(0, LAST_NAMES.length - 1)];
  if (n.includes('full') && n.includes('name')) return `${FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]}`;
  if (n.includes('city')) return CITIES[randInt(0, CITIES.length - 1)].name;
  if (n.includes('country') && n.includes('code')) return COUNTRY_CODES[randInt(0, COUNTRY_CODES.length - 1)];
  if (n.includes('country')) return COUNTRIES[randInt(0, COUNTRIES.length - 1)];
  if (n.includes('place') || n.includes('location')) return CITIES[randInt(0, CITIES.length - 1)].name;
  if (n.includes('email')) return `${randString(8)}@example.com`;
  if (n.includes('url') || n.includes('link')) return `https://example.com/${randString(12)}`;
  if (n.includes('image') || n.includes('photo') || n.includes('avatar') || n.includes('picture')) return `/images/${randString(12)}.jpg`;
  if (n.includes('iata')) return IATA_CODES[randInt(0, IATA_CODES.length - 1)];
  if (n.includes('icao')) return ICAO_CODES[randInt(0, ICAO_CODES.length - 1)];
  if (n.includes('airport')) return IATA_CODES[randInt(0, IATA_CODES.length - 1)];
  return null;
}

export function generateDoc(mapping: Mapping, range?: TimeRange, rules?: FieldRules): GeneratedDoc {
  function genProps(props: Properties, basePath = ''): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(props)) {
      const t = spec.type ?? (spec.properties ? 'object' : 'keyword');
      const path = basePath ? `${basePath}.${key}` : key;
      const rule = (rules?.[path] ?? rules?.[key]);
      if (rule?.kind === 'manual') { out[key] = rule.value; continue; }
      switch (t) {
        case 'keyword':
        case 'text':
          if (rule?.kind === 'prefix') {
            out[key] = `${rule.prefix}${randString(10)}`;
          } else if (rule?.kind === 'phone') {
            out[key] = randomPhone(rule.country);
          } else if (rule?.kind === 'string_list') {
            const vals = Array.isArray(rule.values) ? rule.values : [];
            const idx = vals.length > 0 ? randInt(0, vals.length - 1) : -1;
            out[key] = idx >= 0 ? vals[idx] : '';
          } else if (rule?.kind === 'image_path') {
            if (rule.mode === 'static') {
              out[key] = rule.path ?? '';
            } else if (rule.mode === 'list') {
              const vals = Array.isArray(rule.values) ? rule.values : [];
              const idx = vals.length > 0 ? randInt(0, vals.length - 1) : -1;
              out[key] = idx >= 0 ? vals[idx] : '';
            } else {
              const base = rule.base ?? '/images';
              const ext = rule.ext ?? 'jpg';
              out[key] = `${base}/${randString(12)}.${ext}`;
            }
          } else {
            const guessed = smartStringForField(key);
            out[key] = guessed ?? randString(10);
          }
          break;
        case 'date':
          {
            const r = (rule?.kind === 'date' ? rule.range : undefined) ?? range;
            const iso = randDate(r);
            const d = new Date(iso);
            if (rule && rule.kind === 'date') {
              if (rule.format === 'epoch_millis') {
                out[key] = d.getTime();
              } else if (rule.format === 'iso') {
                out[key] = iso;
              } else if (rule.format === 'yyyy-MM-dd') {
                const yyyy = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                out[key] = `${yyyy}-${MM}-${dd}`;
              } else if (rule.format === 'MM/dd/yy') {
                const yy = String(d.getFullYear()).slice(-2);
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                out[key] = `${MM}/${dd}/${yy}`;
              } else if (rule.format === 'yyyy/MM/dd') {
                const yyyy = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                out[key] = `${yyyy}/${MM}/${dd}`;
              } else if (rule.format === 'dd-MM-yyyy') {
                const yyyy = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                out[key] = `${dd}-${MM}-${yyyy}`;
              } else if (rule.format === 'dd/MM/yyyy') {
                const yyyy = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                out[key] = `${dd}/${MM}/${yyyy}`;
              } else if (rule.format === 'yyyy-MM-dd HH:mm:ss') {
                const yyyy = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const HH = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                out[key] = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
              } else {
                out[key] = iso;
              }
            } else {
              out[key] = iso;
            }
          }
          break;
        case 'float':
        case 'double':
          if (rule?.kind === 'geo_number') {
            out[key] = randFloat(rule.min, rule.max);
          } else if (rule?.kind === 'num_range') {
            out[key] = randFloat(rule.min, rule.max);
          } else if (rule?.kind === 'num_max') {
            const min = rule.min ?? 0;
            out[key] = randFloat(min, rule.max);
          } else {
            out[key] = randFloat(0, 1000);
          }
          break;
        case 'integer':
        case 'short':
        case 'long':
          if (rule?.kind === 'geo_number') {
            const minI = Math.floor(rule.min);
            const maxI = Math.floor(rule.max);
            out[key] = randInt(minI, maxI);
          } else if (rule?.kind === 'num_range') {
            const minI = Math.floor(rule.min);
            const maxI = Math.floor(rule.max);
            out[key] = randInt(minI, maxI);
          } else if (rule?.kind === 'num_max') {
            const minI = Math.floor(rule.min ?? 0);
            const maxI = Math.floor(rule.max);
            out[key] = randInt(minI, maxI);
          } else {
            out[key] = randInt(0, 1000);
          }
          break;
        case 'boolean':
          out[key] = Math.random() < 0.5;
          break;
        case 'geo_point':
          if (rule?.kind === 'geo_point') {
            const lat = randFloat(rule.latMin, rule.latMax);
            const lon = randFloat(rule.lonMin, rule.lonMax);
            out[key] = { lat, lon };
          } else if (rule?.kind === 'geo_city') {
            const city = CITIES.find(c => c.name === rule.city) ?? CITIES[randInt(0, CITIES.length - 1)];
            out[key] = { lat: city.lat, lon: city.lon };
          } else if (rule?.kind === 'geohash') {
            const lat = randFloat(-90, 90);
            const lon = randFloat(-180, 180);
            out[key] = geohashEncode(lat, lon, rule.precision);
          } else {
            out[key] = { lat: randFloat(-90, 90), lon: randFloat(-180, 180) };
          }
          break;
        case 'ip':
          if (rule?.kind === 'ip' && rule.version === 'v6') {
            out[key] = randomIPv6();
          } else {
            out[key] = randIP();
          }
          break;
        case 'object':
          out[key] = genProps(spec.properties ?? {}, path);
          break;
        default:
          out[key] = randString(8);
      }
    }
    return out;
  }
  return genProps(mapping.properties);
}

export function generateDocs(mapping: Mapping, count: number, range?: TimeRange, rules?: FieldRules): GeneratedDoc[] {
  const docs: GeneratedDoc[] = [];
  for (let i = 0; i < count; i++) {
    docs.push(generateDoc(mapping, range, rules));
  }
  return docs;
}

export function extractMappingFromResponse(resp: unknown, index: string): Mapping | null {
  if (typeof resp !== 'object' || resp === null) return null;
  const top = resp as Record<string, unknown>;
  const entry = top[index];
  if (typeof entry !== 'object' || entry === null) return null;
  const mappings = (entry as Record<string, unknown>)['mappings'];
  if (typeof mappings !== 'object' || mappings === null) return null;
  const props = (mappings as Record<string, unknown>)['properties'];
  if (typeof props !== 'object' || props === null) return null;
  return { properties: props as Properties };
}

function mergeProps(a: Properties, b: Properties): Properties {
  const out: Properties = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const existing = out[k];
    if (existing && existing.properties && v.properties) {
      out[k] = { ...existing, properties: mergeProps(existing.properties, v.properties) };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function extractAnyMapping(resp: unknown): Mapping | null {
  if (typeof resp !== 'object' || resp === null) return null;
  const top = resp as Record<string, unknown>;
  let combined: Properties | null = null;
  for (const val of Object.values(top)) {
    if (typeof val !== 'object' || val === null) continue;
    const mappings = (val as Record<string, unknown>)['mappings'];
    if (typeof mappings !== 'object' || mappings === null) continue;
    const props = (mappings as Record<string, unknown>)['properties'];
    if (typeof props !== 'object' || props === null) continue;
    combined = combined ? mergeProps(combined, props as Properties) : (props as Properties);
  }
  return combined ? { properties: combined } : null;
}

export function listFieldsByType(mapping: Mapping, type: FieldType): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(mapping.properties)) {
    if ((v.type ?? (v.properties ? 'object' : undefined)) === type) out.push(k);
  }
  return out;
}

export function flattenMappingFields(mapping: Mapping, prefix = ''): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(mapping.properties)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const t = v.type ?? (v.properties ? 'object' : undefined);
    if (t) out[path] = t as string;
    if (v.properties) {
      const nested = flattenMappingFields({ properties: v.properties }, path);
      for (const [nk, nt] of Object.entries(nested)) out[nk] = nt;
    }
  }
  return out;
}

export type TypeChange = { field: string; from?: string; to?: string };
export function diffMappings(oldM: Mapping, newM: Mapping): { added: string[]; removed: string[]; changed: TypeChange[] } {
  const oldFlat = flattenMappingFields(oldM);
  const newFlat = flattenMappingFields(newM);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: TypeChange[] = [];
  const oldKeys = new Set(Object.keys(oldFlat));
  const newKeys = new Set(Object.keys(newFlat));
  for (const k of newKeys) {
    if (!oldKeys.has(k)) added.push(k);
  }
  for (const k of oldKeys) {
    if (!newKeys.has(k)) removed.push(k);
    else {
      const a = oldFlat[k];
      const b = newFlat[k];
      if (a !== b) changed.push({ field: k, from: a, to: b });
    }
  }
  return { added, removed, changed };
}

export type Granularity = 'hour' | 'minute' | 'second';
export type Distribution = 'uniform' | 'poisson';

function poissonSample(mean: number): number {
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1;
  while (p > L) { k++; p *= Math.random(); }
  return k - 1;
}

export function generateTimestamps(range: TimeRange, granularity: Granularity, rate: number, distribution: Distribution): Date[] {
  const start = range.start.getTime();
  const end = range.end.getTime();
  const step = granularity === 'hour' ? 3600_000 : granularity === 'minute' ? 60_000 : 1_000;
  const out: Date[] = [];
  for (let t = start; t <= end; t += step) {
    const count = distribution === 'poisson' ? poissonSample(rate) : rate;
    for (let i = 0; i < count; i++) {
      const jitter = Math.floor(Math.random() * step);
      const ts = new Date(Math.min(t + jitter, end));
      out.push(ts);
    }
  }
  return out;
}

export function generateDocsWithTimestamps(mapping: Mapping, timestamps: Date[], rules: FieldRules | undefined, dateField: string): GeneratedDoc[] {
  const docs: GeneratedDoc[] = [];
  for (const d of timestamps) {
    const r = rules?.[dateField];
    let value: unknown = d.toISOString();
    if (r && r.kind === 'date') {
      if (r.format === 'epoch_millis') value = d.getTime();
      else if (r.format === 'iso') value = d.toISOString();
      else if (r.format === 'yyyy-MM-dd') {
        const yyyy = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        value = `${yyyy}-${MM}-${dd}`;
      } else if (r.format === 'MM/dd/yy') {
        const yy = String(d.getFullYear()).slice(-2);
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        value = `${MM}/${dd}/${yy}`;
      } else if (r.format === 'yyyy/MM/dd') {
        const yyyy = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        value = `${yyyy}/${MM}/${dd}`;
      } else if (r.format === 'dd-MM-yyyy') {
        const yyyy = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        value = `${dd}-${MM}-${yyyy}`;
      } else if (r.format === 'dd/MM/yyyy') {
        const yyyy = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        value = `${dd}/${MM}/${yyyy}`;
      } else if (r.format === 'yyyy-MM-dd HH:mm:ss') {
        const yyyy = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const HH = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        value = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
      }
    }
    const manual: FieldRules = { ...(rules ?? {}), [dateField]: { kind: 'manual', value } } as FieldRules;
    docs.push(generateDoc(mapping, undefined, manual));
  }
  return docs;
}
