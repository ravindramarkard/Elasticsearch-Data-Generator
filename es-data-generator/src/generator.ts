type FieldType = 'keyword' | 'text' | 'date' | 'float' | 'double' | 'integer' | 'short' | 'long' | 'boolean' | 'geo_point' | 'ip' | 'object';

type Properties = Record<string, { type?: FieldType; format?: string; properties?: Properties }>;

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

export type DateRule = { kind: 'date'; format: 'iso' | 'epoch_millis' | 'epoch_second' | 'yyyy-MM-dd' | 'MM/dd/yy' | 'yyyy/MM/dd' | 'dd-MM-yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd HH:mm:ss'; range?: TimeRange };
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
export type GeoPathRule = { 
  kind: 'geo_path'; 
  sourceLat: number; 
  sourceLon: number; 
  destLat: number; 
  destLon: number; 
  speed?: number; // km/h or knots - optional, for real-time calculation
};
export type FieldRule = DateRule | GeoRule | GeoNumberRule | NumberRangeRule | NumberMaxRule | StringListRule | ImagePathRule | IpRule | PrefixRule | PhoneRule | ManualRule | GeohashRule | GeoCityRule | GeoPathRule;
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

export const CITIES: { name: string; lat: number; lon: number; iata?: string }[] = [
  // North America
  { name: 'New York (JFK)', lat: 40.6413, lon: -73.7781, iata: 'JFK' },
  { name: 'Los Angeles (LAX)', lat: 33.9416, lon: -118.4085, iata: 'LAX' },
  { name: 'Chicago (ORD)', lat: 41.9742, lon: -87.9073, iata: 'ORD' },
  { name: 'San Francisco (SFO)', lat: 37.6213, lon: -122.3790, iata: 'SFO' },
  { name: 'Miami (MIA)', lat: 25.7959, lon: -80.2870, iata: 'MIA' },
  { name: 'Seattle (SEA)', lat: 47.4502, lon: -122.3088, iata: 'SEA' },
  { name: 'Boston (BOS)', lat: 42.3656, lon: -71.0096, iata: 'BOS' },
  { name: 'Toronto (YYZ)', lat: 43.6777, lon: -79.6248, iata: 'YYZ' },
  { name: 'Vancouver (YVR)', lat: 49.1967, lon: -123.1815, iata: 'YVR' },
  { name: 'Mexico City (MEX)', lat: 19.4363, lon: -99.0721, iata: 'MEX' },
  
  // Europe
  { name: 'London (LHR)', lat: 51.4700, lon: -0.4543, iata: 'LHR' },
  { name: 'Paris (CDG)', lat: 49.0097, lon: 2.5479, iata: 'CDG' },
  { name: 'Frankfurt (FRA)', lat: 50.0379, lon: 8.5622, iata: 'FRA' },
  { name: 'Amsterdam (AMS)', lat: 52.3105, lon: 4.7683, iata: 'AMS' },
  { name: 'Madrid (MAD)', lat: 40.4839, lon: -3.5680, iata: 'MAD' },
  { name: 'Rome (FCO)', lat: 41.8003, lon: 12.2389, iata: 'FCO' },
  { name: 'Istanbul (IST)', lat: 41.2753, lon: 28.7519, iata: 'IST' },
  { name: 'Moscow (SVO)', lat: 55.9726, lon: 37.4146, iata: 'SVO' },
  { name: 'Zurich (ZRH)', lat: 47.4582, lon: 8.5556, iata: 'ZRH' },
  { name: 'Barcelona (BCN)', lat: 41.2974, lon: 2.0833, iata: 'BCN' },
  
  // Asia
  { name: 'Tokyo (NRT)', lat: 35.7720, lon: 140.3929, iata: 'NRT' },
  { name: 'Dubai (DXB)', lat: 25.2532, lon: 55.3657, iata: 'DXB' },
  { name: 'Singapore (SIN)', lat: 1.3644, lon: 103.9915, iata: 'SIN' },
  { name: 'Hong Kong (HKG)', lat: 22.3080, lon: 113.9185, iata: 'HKG' },
  { name: 'Beijing (PEK)', lat: 40.0799, lon: 116.6031, iata: 'PEK' },
  { name: 'Shanghai (PVG)', lat: 31.1443, lon: 121.8083, iata: 'PVG' },
  { name: 'Seoul (ICN)', lat: 37.4602, lon: 126.4407, iata: 'ICN' },
  { name: 'Bangkok (BKK)', lat: 13.6900, lon: 100.7501, iata: 'BKK' },
  { name: 'Mumbai (BOM)', lat: 19.0896, lon: 72.8656, iata: 'BOM' },
  { name: 'Delhi (DEL)', lat: 28.5562, lon: 77.1000, iata: 'DEL' },
  
  // Oceania
  { name: 'Sydney (SYD)', lat: -33.9399, lon: 151.1753, iata: 'SYD' },
  { name: 'Melbourne (MEL)', lat: -37.6690, lon: 144.8410, iata: 'MEL' },
  { name: 'Auckland (AKL)', lat: -37.0082, lon: 174.7850, iata: 'AKL' },
  
  // South America
  { name: 'São Paulo (GRU)', lat: -23.4356, lon: -46.4731, iata: 'GRU' },
  { name: 'Buenos Aires (EZE)', lat: -34.8222, lon: -58.5358, iata: 'EZE' },
  { name: 'Lima (LIM)', lat: -12.0219, lon: -77.1143, iata: 'LIM' },
  
  // Africa
  { name: 'Johannesburg (JNB)', lat: -26.1392, lon: 28.2460, iata: 'JNB' },
  { name: 'Cairo (CAI)', lat: 30.1219, lon: 31.4056, iata: 'CAI' },
  { name: 'Nairobi (NBO)', lat: -1.3192, lon: 36.9278, iata: 'NBO' },
];

export const SEAPORTS: { name: string; lat: number; lon: number; code?: string }[] = [
  // Asia
  { name: 'Shanghai Port', lat: 31.2304, lon: 121.4737, code: 'CNSHA' },
  { name: 'Singapore Port', lat: 1.2644, lon: 103.8220, code: 'SGSIN' },
  { name: 'Ningbo-Zhoushan Port', lat: 29.8683, lon: 121.5440, code: 'CNNGB' },
  { name: 'Shenzhen Port', lat: 22.5431, lon: 114.0579, code: 'CNSZX' },
  { name: 'Guangzhou Port', lat: 23.1291, lon: 113.2644, code: 'CNGZH' },
  { name: 'Busan Port', lat: 35.1028, lon: 129.0403, code: 'KRPUS' },
  { name: 'Hong Kong Port', lat: 22.3193, lon: 114.1694, code: 'HKHKG' },
  { name: 'Qingdao Port', lat: 36.0671, lon: 120.3826, code: 'CNTAO' },
  { name: 'Tianjin Port', lat: 38.9795, lon: 117.7417, code: 'CNTSN' },
  { name: 'Port Klang', lat: 2.9987, lon: 101.3932, code: 'MYPKG' },
  { name: 'Dubai Port', lat: 25.2854, lon: 55.3607, code: 'AEDXB' },
  { name: 'Tokyo Port', lat: 35.6437, lon: 139.7673, code: 'JPTYO' },
  { name: 'Mumbai Port', lat: 18.9667, lon: 72.8333, code: 'INBOM' },
  { name: 'Chennai Port', lat: 13.1021, lon: 80.2984, code: 'INMAA' },
  { name: 'Bangkok Port', lat: 13.7074, lon: 100.5332, code: 'THBKK' },
  
  // Europe
  { name: 'Rotterdam Port', lat: 51.9225, lon: 4.4792, code: 'NLRTM' },
  { name: 'Antwerp Port', lat: 51.2194, lon: 4.4025, code: 'BEANR' },
  { name: 'Hamburg Port', lat: 53.5459, lon: 9.9716, code: 'DEHAM' },
  { name: 'Valencia Port', lat: 39.4561, lon: -0.3545, code: 'ESVLC' },
  { name: 'Piraeus Port', lat: 37.9478, lon: 23.6425, code: 'GRPIR' },
  { name: 'Felixstowe Port', lat: 51.9540, lon: 1.2979, code: 'GBFXT' },
  { name: 'Le Havre Port', lat: 49.4944, lon: 0.1079, code: 'FRLEH' },
  { name: 'Genoa Port', lat: 44.4056, lon: 8.9463, code: 'ITGOA' },
  { name: 'Barcelona Port', lat: 41.3675, lon: 2.1609, code: 'ESBCN' },
  { name: 'Algeciras Port', lat: 36.1256, lon: -5.4318, code: 'ESALG' },
  
  // North America
  { name: 'Los Angeles Port', lat: 33.7406, lon: -118.2719, code: 'USLAX' },
  { name: 'Long Beach Port', lat: 33.7545, lon: -118.1932, code: 'USLGB' },
  { name: 'New York/New Jersey Port', lat: 40.6683, lon: -74.0458, code: 'USNYC' },
  { name: 'Savannah Port', lat: 32.0282, lon: -81.1649, code: 'USSAV' },
  { name: 'Houston Port', lat: 29.7210, lon: -95.2622, code: 'USHOU' },
  { name: 'Seattle Port', lat: 47.5952, lon: -122.3359, code: 'USSEA' },
  { name: 'Vancouver Port', lat: 49.2827, lon: -123.1207, code: 'CAVAN' },
  { name: 'Montreal Port', lat: 45.5017, lon: -73.5673, code: 'CAYMQ' },
  { name: 'Panama Canal (Pacific)', lat: 8.8837, lon: -79.5199, code: 'PABAL' },
  { name: 'Veracruz Port', lat: 19.1945, lon: -96.1331, code: 'MXVER' },
  
  // South America
  { name: 'Santos Port', lat: -23.9537, lon: -46.3054, code: 'BRSSZ' },
  { name: 'Buenos Aires Port', lat: -34.6037, lon: -58.3816, code: 'ARBUE' },
  { name: 'Callao Port', lat: -12.0467, lon: -77.1547, code: 'PECLL' },
  { name: 'Cartagena Port', lat: 10.3910, lon: -75.5148, code: 'COCTG' },
  { name: 'Valparaiso Port', lat: -33.0458, lon: -71.6197, code: 'CLVAP' },
  
  // Oceania
  { name: 'Sydney Port', lat: -33.8568, lon: 151.2153, code: 'AUSYD' },
  { name: 'Melbourne Port', lat: -37.8314, lon: 144.9344, code: 'AUMEL' },
  { name: 'Brisbane Port', lat: -27.3812, lon: 153.1753, code: 'AUBNE' },
  { name: 'Auckland Port', lat: -36.8406, lon: 174.7594, code: 'NZAKL' },
  
  // Africa
  { name: 'Port Said (Suez Canal)', lat: 31.2564, lon: 32.3018, code: 'EGPSD' },
  { name: 'Durban Port', lat: -29.8587, lon: 31.0218, code: 'ZADUR' },
  { name: 'Cape Town Port', lat: -33.9072, lon: 18.4233, code: 'ZACPT' },
  { name: 'Lagos Port', lat: 6.4474, lon: 3.3903, code: 'NGLOS' },
  { name: 'Alexandria Port', lat: 31.2001, lon: 29.9187, code: 'EGALY' },
  { name: 'Mombasa Port', lat: -4.0544, lon: 39.6661, code: 'KEMBA' },
];

export const VEHICLE_LOCATIONS: { name: string; lat: number; lon: number; type: 'city' | 'hub' | 'warehouse' }[] = [
  // UAE - Dubai
  { name: 'Dubai Downtown', lat: 25.1972, lon: 55.2744, type: 'city' },
  { name: 'Dubai Marina', lat: 25.0805, lon: 55.1397, type: 'city' },
  { name: 'Dubai Mall', lat: 25.1972, lon: 55.2796, type: 'hub' },
  { name: 'Burj Khalifa', lat: 25.1972, lon: 55.2744, type: 'hub' },
  { name: 'Dubai International Airport', lat: 25.2532, lon: 55.3657, type: 'hub' },
  { name: 'Jebel Ali Port', lat: 24.9857, lon: 55.0272, type: 'warehouse' },
  { name: 'Dubai Silicon Oasis', lat: 25.1245, lon: 55.3789, type: 'hub' },
  { name: 'Dubai Industrial City', lat: 24.8951, lon: 55.1493, type: 'warehouse' },
  { name: 'Dubai Logistics City', lat: 25.0208, lon: 55.1767, type: 'warehouse' },
  { name: 'Dubai Internet City', lat: 25.0965, lon: 55.1674, type: 'hub' },
  { name: 'Dubai Media City', lat: 25.0987, lon: 55.1632, type: 'hub' },
  { name: 'JBR - Jumeirah Beach', lat: 25.0788, lon: 55.1345, type: 'city' },
  { name: 'Business Bay', lat: 25.1883, lon: 55.2645, type: 'hub' },
  { name: 'Dubai Creek Harbour', lat: 25.1847, lon: 55.3453, type: 'city' },
  { name: 'Dubai Sports City', lat: 25.0397, lon: 55.2066, type: 'city' },
  { name: 'Dubai Motor City', lat: 25.0416, lon: 55.2301, type: 'city' },
  { name: 'Dubai World Central', lat: 24.8969, lon: 55.1612, type: 'hub' },
  { name: 'Dubai South', lat: 24.8972, lon: 55.1557, type: 'warehouse' },
  
  // UAE - Abu Dhabi
  { name: 'Abu Dhabi Downtown', lat: 24.4539, lon: 54.3773, type: 'city' },
  { name: 'Abu Dhabi Corniche', lat: 24.4796, lon: 54.3517, type: 'city' },
  { name: 'Yas Island', lat: 24.4889, lon: 54.6087, type: 'hub' },
  { name: 'Abu Dhabi Airport', lat: 24.4330, lon: 54.6511, type: 'hub' },
  { name: 'Abu Dhabi Port', lat: 24.5237, lon: 54.3771, type: 'warehouse' },
  { name: 'Masdar City', lat: 24.4286, lon: 54.6175, type: 'hub' },
  { name: 'Al Raha Beach', lat: 24.5106, lon: 54.6361, type: 'city' },
  { name: 'Khalifa City', lat: 24.4217, lon: 54.5982, type: 'city' },
  { name: 'Mussafah Industrial', lat: 24.3675, lon: 54.5049, type: 'warehouse' },
  { name: 'ICAD Industrial City', lat: 24.3397, lon: 54.5273, type: 'warehouse' },
  
  // UAE - Sharjah
  { name: 'Sharjah City Center', lat: 25.3463, lon: 55.4209, type: 'city' },
  { name: 'Sharjah Airport', lat: 25.3286, lon: 55.5172, type: 'hub' },
  { name: 'Sharjah Industrial Area', lat: 25.3179, lon: 55.4117, type: 'warehouse' },
  { name: 'Sharjah Hamriyah Free Zone', lat: 25.4416, lon: 55.5353, type: 'warehouse' },
  
  // UAE - Ajman
  { name: 'Ajman City Center', lat: 25.4052, lon: 55.5136, type: 'city' },
  { name: 'Ajman Free Zone', lat: 25.3896, lon: 55.4850, type: 'warehouse' },
  
  // UAE - Ras Al Khaimah
  { name: 'Ras Al Khaimah Downtown', lat: 25.7899, lon: 55.9432, type: 'city' },
  { name: 'RAK Free Trade Zone', lat: 25.6929, lon: 55.9283, type: 'warehouse' },
  
  // UAE - Fujairah
  { name: 'Fujairah City', lat: 25.1288, lon: 56.3265, type: 'city' },
  { name: 'Fujairah Port', lat: 25.1133, lon: 56.3500, type: 'warehouse' },
  
  // UAE - Umm Al Quwain
  { name: 'Umm Al Quwain Center', lat: 25.5647, lon: 55.5550, type: 'city' },
  
  // UAE - Al Ain
  { name: 'Al Ain City Center', lat: 24.2075, lon: 55.7447, type: 'city' },
  { name: 'Al Ain Industrial Area', lat: 24.1886, lon: 55.7645, type: 'warehouse' },
];

const DOGS = ['Bella', 'Charlie', 'Max', 'Luna', 'Rocky', 'Milo', 'Buddy', 'Coco'];
const COUNTRIES = ['United States', 'United Kingdom', 'France', 'Germany', 'India', 'Japan', 'China', 'Singapore', 'Australia', 'Brazil'];
const COUNTRY_CODES = ['US', 'GB', 'FR', 'DE', 'IN', 'JP', 'CN', 'SG', 'AU', 'BR'];
const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White'];
const IATA_CODES = ['JFK', 'SFO', 'LHR', 'CDG', 'BOM', 'NRT', 'DEL', 'LAX', 'ORD', 'DXB', 'SIN', 'HKG', 'ICN', 'SYD'];
const ICAO_CODES = ['KJFK', 'KSFO', 'EGLL', 'LFPG', 'VABB', 'RJAA', 'VIDP', 'KLAX', 'KORD', 'OMDB', 'WSSS', 'VHHH', 'RKSI', 'YSSY'];
const VESSEL_NAMES = ['Pacific Explorer', 'Atlantic Star', 'Ocean Navigator', 'Sea Voyager', 'Marine Pioneer', 'Global Trader', 'Container Express', 'Cargo Master'];
const VESSEL_TYPES = ['Container Ship', 'Tanker', 'Bulk Carrier', 'Cruise Ship', 'Cargo Ship', 'RoRo Vessel', 'LNG Carrier', 'General Cargo'];
const IMO_NUMBERS = ['IMO9876543', 'IMO9234567', 'IMO9567890', 'IMO9345678', 'IMO9456789', 'IMO9678901', 'IMO9789012', 'IMO9890123'];
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Truck', 'Delivery Van', 'Box Truck', 'Pickup Truck', 'Cargo Van'];
const VEHICLE_MAKES = ['Toyota', 'Ford', 'Honda', 'Chevrolet', 'Mercedes', 'Volkswagen', 'Tesla', 'Nissan', 'BMW', 'Hyundai'];

function generateLicensePlate(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const format = randInt(0, 2);
  if (format === 0) {
    // ABC-1234 format
    return `${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}-${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}`;
  } else if (format === 1) {
    // 1ABC234 format
    return `${digits[randInt(0, 9)]}${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}`;
  } else {
    // AB12CDE format
    return `${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}${digits[randInt(0, 9)]}${digits[randInt(0, 9)]}${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}${letters[randInt(0, 25)]}`;
  }
}

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
  // Vessel/Maritime specific
  if (n.includes('vessel') && n.includes('name')) return VESSEL_NAMES[randInt(0, VESSEL_NAMES.length - 1)];
  if (n.includes('ship') && n.includes('name')) return VESSEL_NAMES[randInt(0, VESSEL_NAMES.length - 1)];
  if (n.includes('vessel') && n.includes('type')) return VESSEL_TYPES[randInt(0, VESSEL_TYPES.length - 1)];
  if (n.includes('ship') && n.includes('type')) return VESSEL_TYPES[randInt(0, VESSEL_TYPES.length - 1)];
  if (n.includes('imo')) return IMO_NUMBERS[randInt(0, IMO_NUMBERS.length - 1)];
  if (n.includes('port') && n.includes('name')) return SEAPORTS[randInt(0, SEAPORTS.length - 1)].name;
  // Vehicle specific
  if (n.includes('license') || n.includes('plate')) return generateLicensePlate();
  if (n.includes('vehicle') && n.includes('type')) return VEHICLE_TYPES[randInt(0, VEHICLE_TYPES.length - 1)];
  if (n.includes('make')) return VEHICLE_MAKES[randInt(0, VEHICLE_MAKES.length - 1)];
  if (n.includes('vin')) return `${randInt(10, 99)}${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}${randInt(100000, 999999)}${randInt(10000, 99999)}`;
  if (n.includes('driver')) return `${FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]}`;
  if (n.includes('delivery') && n.includes('id')) return `DEL-${randInt(100000, 999999)}`;
  if (n.includes('route') && n.includes('id')) return `RT-${randInt(1000, 9999)}`;
  if (n.includes('warehouse')) {
    const warehouses = VEHICLE_LOCATIONS.filter(v => v.type === 'warehouse');
    return warehouses[randInt(0, warehouses.length - 1)].name;
  }
  return null;
}

// Auto-detect date format from ES mapping format string
export function detectDateFormat(esFormat?: string): DateRule['format'] {
  if (!esFormat) return 'iso';
  const fmt = esFormat.toLowerCase();
  // Handle multiple formats separated by ||
  const formats = fmt.split('||').map(f => f.trim());
  const firstFormat = formats[0];
  
  if (firstFormat === 'epoch_millis') return 'epoch_millis';
  if (firstFormat === 'epoch_second') return 'epoch_second';
  if (firstFormat === 'strict_date_optional_time' || firstFormat === 'date_optional_time') return 'iso';
  if (firstFormat === 'yyyy-mm-dd' || firstFormat === 'strict_date') return 'yyyy-MM-dd';
  if (firstFormat === 'mm/dd/yy') return 'MM/dd/yy';
  if (firstFormat === 'yyyy/mm/dd') return 'yyyy/MM/dd';
  if (firstFormat === 'dd-mm-yyyy') return 'dd-MM-yyyy';
  if (firstFormat === 'dd/mm/yyyy') return 'dd/MM/yyyy';
  if (firstFormat.includes('yyyy-mm-dd') && firstFormat.includes('hh:mm:ss')) return 'yyyy-MM-dd HH:mm:ss';
  
  // Default to ISO for any unrecognized format
  return 'iso';
}

// Format a date according to the specified format
export function formatDate(date: Date, format: DateRule['format']): unknown {
  switch (format) {
    case 'epoch_millis':
      return date.getTime();
    case 'epoch_second':
      return Math.floor(date.getTime() / 1000);
    case 'iso':
      return date.toISOString();
    case 'yyyy-MM-dd': {
      const yyyy = String(date.getFullYear());
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${MM}-${dd}`;
    }
    case 'MM/dd/yy': {
      const yy = String(date.getFullYear()).slice(-2);
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${MM}/${dd}/${yy}`;
    }
    case 'yyyy/MM/dd': {
      const yyyy = String(date.getFullYear());
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}/${MM}/${dd}`;
    }
    case 'dd-MM-yyyy': {
      const yyyy = String(date.getFullYear());
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${dd}-${MM}-${yyyy}`;
    }
    case 'dd/MM/yyyy': {
      const yyyy = String(date.getFullYear());
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${dd}/${MM}/${yyyy}`;
    }
    case 'yyyy-MM-dd HH:mm:ss': {
      const yyyy = String(date.getFullYear());
      const MM = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const HH = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    }
    default:
      return date.toISOString();
  }
}

// Calculate next position along path from current to destination
export function calculateNextPosition(
  currentLat: number, 
  currentLon: number, 
  destLat: number, 
  destLon: number, 
  speedKmH: number, 
  intervalSeconds: number
): { lat: number; lon: number; arrived: boolean } {
  // Calculate distance to destination in km
  const R = 6371; // Earth radius in km
  const dLat = (destLat - currentLat) * Math.PI / 180;
  const dLon = (destLon - currentLon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(currentLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  
  // Calculate distance to move in this interval
  const distanceToMove = (speedKmH * intervalSeconds) / 3600; // km
  
  // If we're close enough, just go to destination
  if (distanceToMove >= distanceKm) {
    return { lat: destLat, lon: destLon, arrived: true };
  }
  
  // Calculate bearing
  const y = Math.sin(dLon) * Math.cos(destLat * Math.PI / 180);
  const x = Math.cos(currentLat * Math.PI / 180) * Math.sin(destLat * Math.PI / 180) -
            Math.sin(currentLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);
  
  // Calculate new position
  const angularDistance = distanceToMove / R;
  const lat1 = currentLat * Math.PI / 180;
  const lon1 = currentLon * Math.PI / 180;
  
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) +
                         Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
                                  Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
  
  return {
    lat: lat2 * 180 / Math.PI,
    lon: lon2 * 180 / Math.PI,
    arrived: false
  };
}

// Get the date format for a field from mapping or rule
export function getDateFormatForField(mapping: Mapping, fieldPath: string, rule?: FieldRule): DateRule['format'] {
  // If there's a rule with a format, use it
  if (rule && rule.kind === 'date') {
    return rule.format;
  }
  
  // Otherwise, try to auto-detect from mapping
  const parts = fieldPath.split('.');
  let currentProps = mapping.properties;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const field = currentProps[part];
    
    if (!field) return 'iso'; // Field not found, default to ISO
    
    if (i === parts.length - 1) {
      // Last part - this is the target field
      if (field.type === 'date') {
        return detectDateFormat(field.format);
      }
      return 'iso';
    }
    
    // Not the last part, go deeper
    if (field.properties) {
      currentProps = field.properties;
    } else {
      return 'iso'; // Can't go deeper, default to ISO
    }
  }
  
  return 'iso';
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
            // Auto-detect format from mapping if no rule is provided
            const format = rule?.kind === 'date' ? rule.format : detectDateFormat(spec.format);
            out[key] = formatDate(d, format);
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
    // Include format info for date fields
    if (t === 'date' && v.format) {
      out[path] = `${t as string} [${v.format}]`;
    } else if (t) {
      out[path] = t as string;
    }
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
    const format = getDateFormatForField(mapping, dateField, rules?.[dateField]);
    const value = formatDate(d, format);
    const manual: FieldRules = { ...(rules ?? {}), [dateField]: { kind: 'manual', value } } as FieldRules;
    docs.push(generateDoc(mapping, undefined, manual));
  }
  return docs;
}
