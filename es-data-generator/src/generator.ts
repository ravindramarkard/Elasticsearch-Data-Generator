import { faker } from '@faker-js/faker';

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
export type PhoneRule = { kind: 'phone'; country: 
  'US' | 'GB' | 'IN' | 'CN' | 'JP' | 'DE' | 'FR' | 'IT' | 'ES' | 'CA' | 
  'AU' | 'BR' | 'MX' | 'RU' | 'KR' | 'ID' | 'TR' | 'SA' | 'AE' | 'EG' | 
  'ZA' | 'NG' | 'KE' | 'TH' | 'VN' | 'PH' | 'MY' | 'SG' | 'NZ' | 'AR' | 
  'CL' | 'CO' | 'PE' | 'VE' | 'PL' | 'NL' | 'BE' | 'SE' | 'NO' | 'DK' | 
  'FI' | 'CH' | 'AT' | 'PT' | 'GR' | 'IE' | 'CZ' | 'RO' | 'HU' | 'IL' | 
  'PK' | 'BD' | 'LK' | 'NP' | 'MM' | 'KH' | 'LA' | 'UZ' | 'KZ' | 'UA' | 
  'BY' | 'GE' | 'AZ' | 'AM' | 'JO' | 'LB' | 'KW' | 'QA' | 'BH' | 'OM' | 
  'MA' | 'DZ' | 'TN' | 'LY' | 'SD' | 'GH' | 'CI' | 'SN' | 'UG' | 'TZ' | 
  'ET' | 'ZM' | 'ZW' | 'MZ' | 'AO' | 'CM' | 'CD' | 'MG' | 'ML' | 'NE' | 
  'BF' | 'BJ' | 'TG' | 'SL' | 'LR' | 'GN' | 'GW' | 'GM' | 'MR' };
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

// Generate valid IMEI (International Mobile Equipment Identity)
// Format: 15 digits - TAC (8) + SNR (6) + Check Digit (1)
function generateIMEI(): string {
  // TAC (Type Allocation Code) - first 8 digits
  const tac = String(randInt(35000000, 35999999)); // Using common TAC range
  
  // Serial Number - next 6 digits
  const snr = String(randInt(100000, 999999));
  
  // Calculate Luhn check digit
  const imeiWithoutCheck = tac + snr;
  let sum = 0;
  for (let i = 0; i < imeiWithoutCheck.length; i++) {
    let digit = parseInt(imeiWithoutCheck[i]);
    if (i % 2 === 1) { // Double every second digit
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return imeiWithoutCheck + checkDigit;
}

// Generate valid IMSI (International Mobile Subscriber Identity)
// Format: 15 digits - MCC (3) + MNC (2-3) + MSIN (9-10)
function generateIMSI(): string {
  // MCC (Mobile Country Code) - 3 digits
  const mccs = ['310', '311', '262', '208', '234', '404', '460', '440', '510', '525', '250', '510']; // US, DE, FR, GB, IN, CN, JP, KR, ID, SG, RU, TH
  const mcc = mccs[randInt(0, mccs.length - 1)];
  
  // MNC (Mobile Network Code) - 2 digits
  const mnc = String(randInt(10, 99));
  
  // MSIN (Mobile Subscription Identification Number) - 10 digits
  const msin = String(randInt(1000000000, 9999999999));
  
  return mcc + mnc + msin;
}

// Generate MAC Address
function generateMACAddress(): string {
  const hex = () => randInt(0, 255).toString(16).padStart(2, '0');
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

// Generate UUID
function generateUUID(): string {
  const hex = () => randInt(0, 15).toString(16);
  const segment = (len: number) => Array.from({length: len}, () => hex()).join('');
  return `${segment(8)}-${segment(4)}-4${segment(3)}-${hex()}${segment(3)}-${segment(12)}`;
}

// Verhoeff algorithm for checksum calculation (used in UID)
function verhoeffChecksum(num: string): number {
  // Multiplication table
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  
  // Permutation table
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  
  // Inverse table
  const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
  
  let c = 0;
  const reversedNum = num.split('').reverse().join('');
  
  for (let i = 0; i < reversedNum.length; i++) {
    c = d[c][p[(i + 1) % 8][parseInt(reversedNum[i])]];
  }
  
  return inv[c];
}

// Generate UID (12-digit with Verhoeff checksum)
// Format: 12-digit number with last digit as checksum
function generateUID(): string {
  // Generate first 11 digits
  const firstDigit = randInt(1, 9); // First digit should not be 0
  const remainingDigits = Array.from({length: 10}, () => randInt(0, 9)).join('');
  const uidWithoutChecksum = String(firstDigit) + remainingDigits;
  
  // Calculate checksum using Verhoeff algorithm
  const checksum = verhoeffChecksum(uidWithoutChecksum);
  
  return uidWithoutChecksum + checksum;
}

// Generate EID (Enrolment ID)
// Format: xxx-xxxx-xxxxxxx-x (3-4-7-1 digits with hyphens, total 15 digits)
function generateEID(): string {
  const part1 = String(randInt(100, 999)); // 3 digits
  const part2 = String(randInt(1000, 9999)); // 4 digits
  const part3 = String(randInt(1000000, 9999999)); // 7 digits
  const part4 = String(randInt(0, 9)); // 1 digit
  
  return `${part1}-${part2}-${part3}-${part4}`;
}

// Generate EID with timestamp
// Returns enrollment number with timestamp: xxx-xxxx-xxxxxxx-x (yyyy/mm/dd hh:mm:ss)
function generateEIDWithTimestamp(): string {
  const enrollmentNumber = generateEID();
  
  // Generate a random date within the last 5 years
  const now = new Date();
  const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);
  const randomDate = new Date(fiveYearsAgo.getTime() + Math.random() * (now.getTime() - fiveYearsAgo.getTime()));
  
  const year = randomDate.getFullYear();
  const month = String(randomDate.getMonth() + 1).padStart(2, '0');
  const day = String(randomDate.getDate()).padStart(2, '0');
  const hours = String(randomDate.getHours()).padStart(2, '0');
  const minutes = String(randomDate.getMinutes()).padStart(2, '0');
  const seconds = String(randomDate.getSeconds()).padStart(2, '0');
  
  const timestamp = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  
  return `${enrollmentNumber} (${timestamp})`;
}
function randomPhone(country: PhoneRule['country']) {
  const formats: Record<PhoneRule['country'], () => string> = {
    // North America
    'US': () => `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`,
    'CA': () => `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`,
    
    // Europe
    'GB': () => `+44-${randInt(20, 79)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'DE': () => `+49-${randInt(30, 89)}-${randInt(10000000, 99999999)}`,
    'FR': () => `+33-${randInt(1, 9)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'IT': () => `+39-${randInt(300, 399)}-${randInt(1000000, 9999999)}`,
    'ES': () => `+34-${randInt(600, 799)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'NL': () => `+31-${randInt(6, 6)}-${randInt(10000000, 99999999)}`,
    'BE': () => `+32-${randInt(470, 499)}-${randInt(100000, 999999)}`,
    'SE': () => `+46-${randInt(70, 79)}-${randInt(1000000, 9999999)}`,
    'NO': () => `+47-${randInt(400, 999)}-${randInt(10000, 99999)}`,
    'DK': () => `+45-${randInt(20, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'FI': () => `+358-${randInt(40, 50)}-${randInt(1000000, 9999999)}`,
    'CH': () => `+41-${randInt(76, 79)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'AT': () => `+43-${randInt(660, 699)}-${randInt(1000000, 9999999)}`,
    'PT': () => `+351-${randInt(910, 969)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'GR': () => `+30-${randInt(690, 699)}-${randInt(1000000, 9999999)}`,
    'IE': () => `+353-${randInt(85, 89)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'PL': () => `+48-${randInt(500, 799)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'CZ': () => `+420-${randInt(600, 799)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'RO': () => `+40-${randInt(720, 789)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'HU': () => `+36-${randInt(20, 30)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'UA': () => `+380-${randInt(50, 99)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'BY': () => `+375-${randInt(29, 44)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'GE': () => `+995-${randInt(550, 599)}-${randInt(100000, 999999)}`,
    'AZ': () => `+994-${randInt(50, 70)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'AM': () => `+374-${randInt(90, 99)}-${randInt(100000, 999999)}`,
    
    // Asia-Pacific
    'IN': () => `+91-${randInt(70, 99)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'CN': () => `+86-${randInt(130, 189)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'JP': () => `+81-${randInt(70, 90)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'KR': () => `+82-${randInt(10, 19)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'ID': () => `+62-${randInt(811, 899)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'TH': () => `+66-${randInt(80, 99)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'VN': () => `+84-${randInt(90, 99)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'PH': () => `+63-${randInt(900, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'MY': () => `+60-${randInt(10, 19)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'SG': () => `+65-${randInt(8000, 9999)}-${randInt(1000, 9999)}`,
    'AU': () => `+61-${randInt(4, 4)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'NZ': () => `+64-${randInt(20, 29)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'PK': () => `+92-${randInt(300, 349)}-${randInt(1000000, 9999999)}`,
    'BD': () => `+880-${randInt(1700, 1999)}-${randInt(100000, 999999)}`,
    'LK': () => `+94-${randInt(70, 77)}-${randInt(1000000, 9999999)}`,
    'NP': () => `+977-${randInt(980, 986)}-${randInt(1000000, 9999999)}`,
    'MM': () => `+95-${randInt(9, 9)}-${randInt(100000000, 999999999)}`,
    'KH': () => `+855-${randInt(10, 99)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'LA': () => `+856-${randInt(20, 20)}-${randInt(10000000, 99999999)}`,
    'UZ': () => `+998-${randInt(90, 99)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'KZ': () => `+7-${randInt(700, 778)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    
    // Middle East
    'IL': () => `+972-${randInt(50, 59)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'SA': () => `+966-${randInt(50, 59)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'AE': () => `+971-${randInt(50, 56)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'TR': () => `+90-${randInt(530, 559)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'EG': () => `+20-${randInt(100, 129)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'JO': () => `+962-${randInt(7, 7)}-${randInt(9000, 9999)}-${randInt(1000, 9999)}`,
    'LB': () => `+961-${randInt(3, 7)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'KW': () => `+965-${randInt(5000, 6999)}-${randInt(1000, 9999)}`,
    'QA': () => `+974-${randInt(3000, 7999)}-${randInt(1000, 9999)}`,
    'BH': () => `+973-${randInt(3000, 3999)}-${randInt(1000, 9999)}`,
    'OM': () => `+968-${randInt(9000, 9999)}-${randInt(1000, 9999)}`,
    
    // Africa
    'ZA': () => `+27-${randInt(60, 89)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'NG': () => `+234-${randInt(800, 909)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'KE': () => `+254-${randInt(700, 799)}-${randInt(100000, 999999)}`,
    'GH': () => `+233-${randInt(20, 59)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'CI': () => `+225-${randInt(40, 79)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'SN': () => `+221-${randInt(70, 78)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'UG': () => `+256-${randInt(700, 799)}-${randInt(100000, 999999)}`,
    'TZ': () => `+255-${randInt(60, 79)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'ET': () => `+251-${randInt(91, 94)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'ZM': () => `+260-${randInt(95, 97)}-${randInt(1000000, 9999999)}`,
    'ZW': () => `+263-${randInt(71, 78)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'MZ': () => `+258-${randInt(82, 87)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'AO': () => `+244-${randInt(910, 949)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'CM': () => `+237-${randInt(6, 6)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'CD': () => `+243-${randInt(800, 999)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'MG': () => `+261-${randInt(30, 34)}-${randInt(10, 99)}-${randInt(100, 999)}-${randInt(10, 99)}`,
    'ML': () => `+223-${randInt(60, 79)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'NE': () => `+227-${randInt(90, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'BF': () => `+226-${randInt(50, 79)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'BJ': () => `+229-${randInt(90, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'TG': () => `+228-${randInt(90, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'SL': () => `+232-${randInt(30, 88)}-${randInt(100000, 999999)}`,
    'LR': () => `+231-${randInt(70, 88)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'GN': () => `+224-${randInt(600, 669)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'GW': () => `+245-${randInt(5, 7)}-${randInt(100000, 999999)}`,
    'GM': () => `+220-${randInt(300, 799)}-${randInt(1000, 9999)}`,
    'MR': () => `+222-${randInt(20, 49)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'MA': () => `+212-${randInt(6, 7)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'DZ': () => `+213-${randInt(5, 7)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}-${randInt(10, 99)}`,
    'TN': () => `+216-${randInt(20, 99)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'LY': () => `+218-${randInt(91, 94)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'SD': () => `+249-${randInt(90, 99)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    
    // Latin America
    'BR': () => `+55-${randInt(11, 99)}-${randInt(90000, 99999)}-${randInt(1000, 9999)}`,
    'MX': () => `+52-${randInt(55, 99)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'AR': () => `+54-${randInt(11, 11)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'CL': () => `+56-${randInt(9, 9)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
    'CO': () => `+57-${randInt(300, 320)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    'PE': () => `+51-${randInt(900, 999)}-${randInt(100, 999)}-${randInt(100, 999)}`,
    'VE': () => `+58-${randInt(412, 426)}-${randInt(100, 999)}-${randInt(1000, 9999)}`,
    
    // Russia and CIS
    'RU': () => `+7-${randInt(900, 999)}-${randInt(100, 999)}-${randInt(10, 99)}-${randInt(10, 99)}`,
  };
  
  const generator = formats[country];
  return generator ? generator() : formats['US']();
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
const COUNTRIES = ['United States', 'United Kingdom', 'France', 'Germany', 'India', 'Japan', 'China', 'Singapore', 'Australia', 'Brazil', 
                   'Canada', 'Mexico', 'Brazil', 'Argentina', 'Spain', 'Italy', 'Netherlands', 'Russia', 'South Korea', 'Indonesia',
                   'Thailand', 'Vietnam', 'Philippines', 'Malaysia', 'UAE', 'Saudi Arabia', 'Egypt', 'South Africa', 'Nigeria', 'Kenya'];
const COUNTRY_CODES = ['US', 'GB', 'FR', 'DE', 'IN', 'JP', 'CN', 'SG', 'AU', 'BR', 
                       'CA', 'MX', 'AR', 'ES', 'IT', 'NL', 'RU', 'KR', 'ID', 'TH',
                       'VN', 'PH', 'MY', 'AE', 'SA', 'EG', 'ZA', 'NG', 'KE'];

// Occupations/Jobs list
const OCCUPATIONS = [
  'Software Engineer', 'Data Scientist', 'Product Manager', 'Business Analyst', 'UX Designer',
  'Teacher', 'Doctor', 'Nurse', 'Lawyer', 'Accountant', 'Architect', 'Civil Engineer',
  'Marketing Manager', 'Sales Representative', 'Financial Analyst', 'Consultant', 'Project Manager',
  'Chef', 'Mechanic', 'Electrician', 'Plumber', 'Carpenter', 'Construction Worker',
  'Police Officer', 'Firefighter', 'Pilot', 'Flight Attendant', 'Driver', 'Security Guard',
  'Pharmacist', 'Dentist', 'Veterinarian', 'Scientist', 'Researcher', 'Journalist', 'Writer',
  'Graphic Designer', 'Photographer', 'Artist', 'Musician', 'Actor', 'Athlete',
  'Real Estate Agent', 'Insurance Agent', 'Bank Teller', 'Cashier', 'Receptionist', 'Secretary',
  'HR Manager', 'Recruiter', 'IT Support', 'Network Administrator', 'Database Administrator',
  'Customer Service Representative', 'Call Center Agent', 'Retail Manager', 'Store Manager',
  'Operations Manager', 'Supply Chain Manager', 'Logistics Coordinator', 'Warehouse Manager'
];
const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White'];

// Multi-language name mappings - CORRESPONDING names (same person, different language)
// Index 0 in all arrays = Alice/أليس/Alice/Alice, etc.
const FIRST_NAMES_AR = ['أليس', 'بوب', 'تشارلي', 'ديانا', 'إيثان', 'فيونا', 'جورج', 'هانا'];
const LAST_NAMES_AR = ['سميث', 'جونسون', 'براون', 'تايلور', 'أندرسون', 'توماس', 'جاكسون', 'وايت'];
const FIRST_NAMES_FR = ['Alice', 'Bob', 'Charlie', 'Diane', 'Étienne', 'Fiona', 'Georges', 'Hannah'];
const LAST_NAMES_FR = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White'];
const FIRST_NAMES_ES = ['Alicia', 'Roberto', 'Carlos', 'Diana', 'Ethan', 'Fiona', 'Jorge', 'Ana'];
const LAST_NAMES_ES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White'];
const FIRST_NAMES_DE = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'Georg', 'Hannah'];
const LAST_NAMES_DE = ['Schmidt', 'Johnson', 'Braun', 'Schneider', 'Anderson', 'Thomas', 'Wagner', 'Weiss'];
const FIRST_NAMES_ZH = ['爱丽丝', '鲍勃', '查理', '戴安娜', '伊桑', '菲奥娜', '乔治', '汉娜'];
const LAST_NAMES_ZH = ['史密斯', '约翰逊', '布朗', '泰勒', '安德森', '托马斯', '杰克逊', '怀特'];
const FIRST_NAMES_JA = ['アリス', 'ボブ', 'チャーリー', 'ダイアナ', 'イーサン', 'フィオナ', 'ジョージ', 'ハンナ'];
const LAST_NAMES_JA = ['スミス', 'ジョンソン', 'ブラウン', 'テイラー', 'アンダーソン', 'トーマス', 'ジャクソン', 'ホワイト'];
const FIRST_NAMES_RU = ['Элис', 'Боб', 'Чарли', 'Диана', 'Итан', 'Фиона', 'Джордж', 'Ханна'];
const LAST_NAMES_RU = ['Смит', 'Джонсон', 'Браун', 'Тейлор', 'Андерсон', 'Томас', 'Джексон', 'Уайт'];

// Multi-language city/place names - CORRESPONDING (same city, different language)
// Using major international cities that appear in CITIES array
const CITIES_EN_FOR_TRANSLATION = ['New York', 'London', 'Paris', 'Tokyo', 'Dubai', 'Singapore', 'Sydney', 'Mumbai'];
const CITIES_AR = ['نيويورك', 'لندن', 'باريس', 'طوكيو', 'دبي', 'سنغافورة', 'سيدني', 'مومباي'];
const CITIES_FR = ['New York', 'Londres', 'Paris', 'Tokyo', 'Dubaï', 'Singapour', 'Sydney', 'Mumbai'];
const CITIES_ES = ['Nueva York', 'Londres', 'París', 'Tokio', 'Dubái', 'Singapur', 'Sídney', 'Bombay'];
const CITIES_DE = ['New York', 'London', 'Paris', 'Tokio', 'Dubai', 'Singapur', 'Sydney', 'Mumbai'];
const CITIES_ZH = ['纽约', '伦敦', '巴黎', '东京', '迪拜', '新加坡', '悉尼', '孟买'];

// Multi-language common words - CORRESPONDING
// Status words corresponding to: Active, Inactive, Pending, Completed, Cancelled
const STATUS_EN = ['Active', 'Inactive', 'Pending', 'Completed', 'Cancelled'];
const STATUS_AR = ['نشط', 'غير نشط', 'معلق', 'مكتمل', 'ملغي'];
const STATUS_FR = ['Actif', 'Inactif', 'En attente', 'Terminé', 'Annulé'];
const STATUS_ES = ['Activo', 'Inactivo', 'Pendiente', 'Completado', 'Cancelado'];
const STATUS_DE = ['Aktiv', 'Inaktiv', 'Ausstehend', 'Abgeschlossen', 'Storniert'];
const STATUS_ZH = ['活跃', '不活跃', '待定', '已完成', '已取消'];

// Department words corresponding to: Sales, Marketing, Engineering, HR, Finance, Operations, IT, Customer Service
const DEPARTMENTS_EN = ['Sales', 'Marketing', 'Engineering', 'HR', 'Finance', 'Operations', 'IT', 'Customer Service'];
const DEPARTMENTS_AR = ['المبيعات', 'التسويق', 'الهندسة', 'الموارد البشرية', 'المالية', 'العمليات', 'تقنية المعلومات', 'خدمة العملاء'];
const DEPARTMENTS_FR = ['Ventes', 'Marketing', 'Ingénierie', 'RH', 'Finance', 'Opérations', 'IT', 'Service Client'];
const DEPARTMENTS_ES = ['Ventas', 'Marketing', 'Ingeniería', 'RRHH', 'Finanzas', 'Operaciones', 'IT', 'Atención al Cliente'];
const DEPARTMENTS_DE = ['Vertrieb', 'Marketing', 'Technik', 'HR', 'Finanzen', 'Betrieb', 'IT', 'Kundenservice'];
const DEPARTMENTS_ZH = ['销售', '市场营销', '工程', '人力资源', '财务', '运营', '信息技术', '客户服务'];

// Language suffix detection
const LANG_SUFFIXES = ['_en', '_ar', '_fr', '_es', '_de', '_zh', '_ja', '_ru', '_it', '_pt', '_nl', '_tr', '_hi', '_ko'];

// Detect if a field has a language suffix and return the base name and language
function detectLanguageField(fieldName: string): { baseName: string; lang: string } | null {
  const lower = fieldName.toLowerCase();
  for (const suffix of LANG_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return {
        baseName: fieldName.substring(0, fieldName.length - suffix.length),
        lang: suffix.substring(1) // Remove the '_' prefix
      };
    }
  }
  return null;
}

// Get translated name based on language - Use Faker for English, keep arrays for other languages for consistency
function getTranslatedName(type: 'first' | 'last' | 'full', lang: string, seed?: number): string {
  // Use seed for consistent multi-language matching
  if (seed !== undefined) {
    faker.seed(seed);
  }
  
  switch (lang) {
    case 'ar':
      const idxAr = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_AR[idxAr];
      if (type === 'last') return LAST_NAMES_AR[idxAr];
      return `${FIRST_NAMES_AR[idxAr]} ${LAST_NAMES_AR[idxAr]}`;
    case 'fr':
      const idxFr = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_FR[idxFr];
      if (type === 'last') return LAST_NAMES_FR[idxFr];
      return `${FIRST_NAMES_FR[idxFr]} ${LAST_NAMES_FR[idxFr]}`;
    case 'es':
      const idxEs = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_ES[idxEs];
      if (type === 'last') return LAST_NAMES_ES[idxEs];
      return `${FIRST_NAMES_ES[idxEs]} ${LAST_NAMES_ES[idxEs]}`;
    case 'de':
      const idxDe = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_DE[idxDe];
      if (type === 'last') return LAST_NAMES_DE[idxDe];
      return `${FIRST_NAMES_DE[idxDe]} ${LAST_NAMES_DE[idxDe]}`;
    case 'zh':
      const idxZh = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_ZH[idxZh];
      if (type === 'last') return LAST_NAMES_ZH[idxZh];
      return `${LAST_NAMES_ZH[idxZh]}${FIRST_NAMES_ZH[idxZh]}`;
    case 'ja':
      const idxJa = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_JA[idxJa];
      if (type === 'last') return LAST_NAMES_JA[idxJa];
      return `${LAST_NAMES_JA[idxJa]} ${FIRST_NAMES_JA[idxJa]}`;
    case 'ru':
      const idxRu = seed !== undefined ? seed % 8 : randInt(0, 7);
      if (type === 'first') return FIRST_NAMES_RU[idxRu];
      if (type === 'last') return LAST_NAMES_RU[idxRu];
      return `${FIRST_NAMES_RU[idxRu]} ${LAST_NAMES_RU[idxRu]}`;
    case 'en':
    default:
      // Use Faker for English names
      if (type === 'first') return faker.person.firstName();
      if (type === 'last') return faker.person.lastName();
      return faker.person.fullName();
  }
}

// Get translated city based on language - Use Faker for English
function getTranslatedCity(lang: string, seed?: number): string {
  if (seed !== undefined) {
    faker.seed(seed);
  }
  
  switch (lang) {
    case 'ar':
      const idxAr = seed !== undefined ? seed % CITIES_AR.length : randInt(0, CITIES_AR.length - 1);
      return CITIES_AR[idxAr];
    case 'fr':
      const idxFr = seed !== undefined ? seed % CITIES_FR.length : randInt(0, CITIES_FR.length - 1);
      return CITIES_FR[idxFr];
    case 'es':
      const idxEs = seed !== undefined ? seed % CITIES_ES.length : randInt(0, CITIES_ES.length - 1);
      return CITIES_ES[idxEs];
    case 'de':
      const idxDe = seed !== undefined ? seed % CITIES_DE.length : randInt(0, CITIES_DE.length - 1);
      return CITIES_DE[idxDe];
    case 'zh':
      const idxZh = seed !== undefined ? seed % CITIES_ZH.length : randInt(0, CITIES_ZH.length - 1);
      return CITIES_ZH[idxZh];
    case 'en':
    default:
      // Use Faker for English cities
      return faker.location.city();
  }
}

// Get translated status based on language
function getTranslatedStatus(lang: string, seed?: number): string {
  const idx = seed !== undefined ? seed : randInt(0, 4);
  
  switch (lang) {
    case 'ar': return STATUS_AR[Math.min(idx, STATUS_AR.length - 1)];
    case 'fr': return STATUS_FR[Math.min(idx, STATUS_FR.length - 1)];
    case 'es': return STATUS_ES[Math.min(idx, STATUS_ES.length - 1)];
    case 'de': return STATUS_DE[Math.min(idx, STATUS_DE.length - 1)];
    case 'zh': return STATUS_ZH[Math.min(idx, STATUS_ZH.length - 1)];
    case 'en':
    default:
      return STATUS_EN[idx];
  }
}

// Get translated product name based on language - Use Faker for English
function getTranslatedProduct(lang: string, seed?: number): string {
  if (seed !== undefined) {
    faker.seed(seed);
  }
  
  switch (lang) {
    case 'ar':
      const numAr = seed !== undefined ? (seed % 900) + 100 : randInt(100, 999);
      return `منتج ${numAr}`;
    case 'fr':
      const numFr = seed !== undefined ? (seed % 900) + 100 : randInt(100, 999);
      return `Produit ${numFr}`;
    case 'es':
      const numEs = seed !== undefined ? (seed % 900) + 100 : randInt(100, 999);
      return `Producto ${numEs}`;
    case 'de':
      const numDe = seed !== undefined ? (seed % 900) + 100 : randInt(100, 999);
      return `Produkt ${numDe}`;
    case 'zh':
      const numZh = seed !== undefined ? (seed % 900) + 100 : randInt(100, 999);
      return `产品 ${numZh}`;
    case 'en':
    default:
      // Use Faker for English product names
      return faker.commerce.productName();
  }
}

// Get translated department based on language - Use Faker for English
function getTranslatedDepartment(lang: string, seed?: number): string {
  if (seed !== undefined) {
    faker.seed(seed);
  }
  
  switch (lang) {
    case 'ar':
      const idxAr = seed !== undefined ? seed % DEPARTMENTS_AR.length : randInt(0, DEPARTMENTS_AR.length - 1);
      return DEPARTMENTS_AR[idxAr];
    case 'fr':
      const idxFr = seed !== undefined ? seed % DEPARTMENTS_FR.length : randInt(0, DEPARTMENTS_FR.length - 1);
      return DEPARTMENTS_FR[idxFr];
    case 'es':
      const idxEs = seed !== undefined ? seed % DEPARTMENTS_ES.length : randInt(0, DEPARTMENTS_ES.length - 1);
      return DEPARTMENTS_ES[idxEs];
    case 'de':
      const idxDe = seed !== undefined ? seed % DEPARTMENTS_DE.length : randInt(0, DEPARTMENTS_DE.length - 1);
      return DEPARTMENTS_DE[idxDe];
    case 'zh':
      const idxZh = seed !== undefined ? seed % DEPARTMENTS_ZH.length : randInt(0, DEPARTMENTS_ZH.length - 1);
      return DEPARTMENTS_ZH[idxZh];
    case 'en':
    default:
      // Use Faker for English departments
      return faker.commerce.department();
  }
}
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

// Smart number generation based on field name semantics - Enhanced with Faker
function smartNumberForField(key: string, isInteger: boolean): number | null {
  const n = key.toLowerCase();
  
  // Age-related fields - Use Faker
  if (n === 'age' || n.includes('_age') || n.includes('age_')) {
    return faker.number.int({ min: 1, max: 100 });
  }
  if (n.includes('birth') && n.includes('year')) {
    return faker.date.birthdate({ min: 1920, max: 2024, mode: 'year' }).getFullYear();
  }
  
  // Quantity and count fields - Use Faker
  if (n.includes('quantity') || n.includes('qty')) {
    return faker.number.int({ min: 1, max: 100 });
  }
  if (n.includes('count')) {
    return faker.number.int({ min: 0, max: 1000 });
  }
  if (n.includes('stock') || n.includes('inventory')) {
    return faker.number.int({ min: 0, max: 500 });
  }
  
  // Percentage fields - Use Faker
  if (n.includes('percent') || n.includes('percentage') || n.includes('rate')) {
    return isInteger ? faker.number.int({ min: 0, max: 100 }) : faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
  }
  if (n.includes('score') && !n.includes('credit')) {
    return isInteger ? faker.number.int({ min: 0, max: 100 }) : faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
  }
  
  // Price and financial fields - Use Faker
  if (n.includes('price') || n.includes('cost') || n.includes('amount')) {
    return isInteger ? faker.number.int({ min: 10, max: 10000 }) : faker.commerce.price({ min: 10, max: 10000, dec: 2 });
  }
  if (n.includes('salary') || n.includes('wage')) {
    return isInteger ? faker.number.int({ min: 30000, max: 150000 }) : faker.number.float({ min: 30000, max: 150000, fractionDigits: 2 });
  }
  if (n.includes('revenue') || n.includes('income')) {
    return isInteger ? faker.number.int({ min: 10000, max: 1000000 }) : faker.number.float({ min: 10000, max: 1000000, fractionDigits: 2 });
  }
  
  // Weight and measurement fields - Use Faker
  if (n.includes('weight')) {
    if (n.includes('kg') || n.includes('kilo')) {
      return isInteger ? faker.number.int({ min: 40, max: 150 }) : faker.number.float({ min: 40, max: 150, fractionDigits: 1 });
    } else if (n.includes('lb') || n.includes('pound')) {
      return isInteger ? faker.number.int({ min: 90, max: 330 }) : faker.number.float({ min: 90, max: 330, fractionDigits: 1 });
    }
    return isInteger ? faker.number.int({ min: 1, max: 200 }) : faker.number.float({ min: 1, max: 200, fractionDigits: 1 });
  }
  if (n.includes('height')) {
    if (n.includes('cm') || n.includes('centimeter')) {
      return isInteger ? faker.number.int({ min: 150, max: 200 }) : faker.number.float({ min: 150, max: 200, fractionDigits: 1 });
    } else if (n.includes('m') || n.includes('meter')) {
      return isInteger ? faker.number.int({ min: 1, max: 2 }) : faker.number.float({ min: 1.5, max: 2.0, fractionDigits: 2 });
    } else if (n.includes('ft') || n.includes('feet') || n.includes('inch')) {
      return isInteger ? faker.number.int({ min: 60, max: 78 }) : faker.number.float({ min: 60, max: 78, fractionDigits: 1 });
    }
    return isInteger ? faker.number.int({ min: 150, max: 200 }) : faker.number.float({ min: 150, max: 200, fractionDigits: 1 });
  }
  if (n.includes('distance')) {
    return isInteger ? faker.number.int({ min: 1, max: 1000 }) : faker.number.float({ min: 1, max: 1000, fractionDigits: 2 });
  }
  
  // Temperature fields - Use Faker
  if (n.includes('temp') || n.includes('temperature')) {
    return isInteger ? faker.number.int({ min: -20, max: 50 }) : faker.number.float({ min: -20, max: 50, fractionDigits: 1 });
  }
  
  // Duration fields - Use Faker
  if (n.includes('duration') || n.includes('time') && (n.includes('elapsed') || n.includes('spent'))) {
    return isInteger ? faker.number.int({ min: 1, max: 3600 }) : faker.number.float({ min: 1, max: 3600, fractionDigits: 2 });
  }
  
  // Speed fields - Use Faker
  if (n.includes('speed') || n.includes('velocity')) {
    return isInteger ? faker.number.int({ min: 0, max: 300 }) : faker.number.float({ min: 0, max: 300, fractionDigits: 1 });
  }
  
  // Rating fields - Use Faker
  if (n.includes('rating')) {
    return isInteger ? faker.number.int({ min: 1, max: 5 }) : faker.number.float({ min: 1, max: 5, fractionDigits: 1 });
  }
  
  // Priority fields - Use Faker
  if (n.includes('priority')) {
    return faker.number.int({ min: 1, max: 5 });
  }
  
  // Special ID formats - UID and EID
  if (n === 'uid' || n === 'user_id' && n.includes('uid') || n.includes('aadhaar') || n.includes('aadhar')) {
    return generateUID(); // 12-digit with Verhoeff checksum
  }
  if (n === 'eid' || n.includes('enrol') && n.includes('id') || n.includes('enrollment') && n.includes('id')) {
    if (n.includes('timestamp') || n.includes('full') || n.includes('detail')) {
      return generateEIDWithTimestamp(); // EID with timestamp
    }
    return generateEID(); // Just the enrollment number
  }
  
  // Passport and ID numbers - Use Faker
  if (n.includes('passport') && (n.includes('number') || n.includes('no'))) {
    return faker.string.alphanumeric({ length: 9, casing: 'upper' });
  }
  if (n.includes('ssn') || n.includes('social') && n.includes('security')) {
    return faker.string.numeric({ length: 9, allowLeadingZeros: true }).replace(/(\d{3})(\d{2})(\d{4})/, '$1-$2-$3');
  }
  if (n.includes('national') && n.includes('id')) {
    return faker.string.numeric({ length: 13 });
  }
  if (n.includes('tax') && n.includes('id')) {
    return faker.string.numeric({ length: 9 }).replace(/(\d{2})(\d{7})/, '$1-$2');
  }
  
  // Special numeric IDs - UID as number (without formatting)
  if (n === 'uid' || n.includes('aadhaar') || n.includes('aadhar')) {
    // Return as number without spaces
    const uid = generateUID();
    return parseInt(uid);
  }
  
  // ID fields (numeric) - Use Faker
  if ((n.includes('id') || n.includes('number') || n.includes('no')) && 
      !n.includes('phone') && !n.includes('mobile') && !n.includes('passport') && 
      !n.includes('ssn') && !n.includes('national') && !n.includes('tax')) {
    return faker.number.int({ min: 10000, max: 999999 });
  }
  
  // Phone/mobile as string numbers
  if (n.includes('phone') || n.includes('mobile') || n.includes('tel')) {
    return null; // Handle in string generation
  }
  
  return null;
}

function smartStringForField(key: string, languageContext?: { baseName: string; lang: string; seed?: number }, englishValueMap?: Record<string, string>): string | null {
  const n = key.toLowerCase();
  
  // Multi-language field handling
  if (languageContext) {
    const { baseName, lang, seed } = languageContext;
    const base = baseName.toLowerCase();
    
    // For Arabic fields, ensure we use the same seed as the corresponding English field
    // This ensures that if name_en = "Charlie Brown", then name_ar = "تشارلي براون" (same person)
    const effectiveSeed = seed !== undefined ? seed : (englishValueMap && englishValueMap[baseName] ? 
      // Use hash of English value to get consistent seed
      Math.abs(englishValueMap[baseName].split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 8 : 
      randInt(0, 7));
    
    // Name fields with language support
    if (base.includes('first') && base.includes('name')) {
      return getTranslatedName('first', lang, effectiveSeed);
    }
    if (base.includes('last') && base.includes('name')) {
      return getTranslatedName('last', lang, effectiveSeed);
    }
    if (base.includes('full') && base.includes('name') || base === 'name') {
      return getTranslatedName('full', lang, effectiveSeed);
    }
    
    // City fields with language support
    if (base.includes('city')) {
      return getTranslatedCity(lang, effectiveSeed);
    }
    
    // Status fields with language support
    if (base === 'status' || base.includes('_status') || base.includes('status_')) {
      return getTranslatedStatus(lang, effectiveSeed);
    }
    
    // Product fields with language support
    if (base.includes('product') && base.includes('name')) {
      return getTranslatedProduct(lang, effectiveSeed);
    }
    
    // Department fields with language support
    if (base.includes('department') || base.includes('dept')) {
      return getTranslatedDepartment(lang, effectiveSeed);
    }
    
    // Description/Title fields with language support - Use Faker for English
    if (base.includes('description') || base.includes('desc') || base.includes('title') || 
        base.includes('comment') || base.includes('note')) {
      if (effectiveSeed !== undefined) {
        faker.seed(effectiveSeed);
      }
      
      if (lang === 'ar') {
        // For Arabic, use the English value if available to create a corresponding translation
        if (englishValueMap && englishValueMap[baseName]) {
          return `ترجمة عربية لـ ${englishValueMap[baseName]}`;
        }
        return `نص تجريبي ${baseName}`;
      } else if (lang === 'fr') {
        return `Texte d'exemple pour ${baseName}`;
      } else if (lang === 'es') {
        return `Texto de muestra para ${baseName}`;
      } else if (lang === 'de') {
        return `Beispieltext für ${baseName}`;
      } else if (lang === 'zh') {
        return `${baseName}的示例文本`;
      } else if (lang === 'ja') {
        return `${baseName}のサンプルテキスト`;
      } else if (lang === 'ru') {
        return `Пример текста для ${baseName}`;
      }
      // Use Faker for English descriptions
      if (base.includes('title')) {
        return faker.lorem.words({ min: 2, max: 5 });
      }
      return faker.lorem.sentence();
    }
  }
  
  // Gender field - Use Faker
  if (n === 'gender' || n === 'sex' || n.includes('_gender') || n.includes('gender_')) {
    return faker.person.sex();
  }
  
  // Status fields - generic: only Active / Inactive
  if (n === 'status' || n.includes('_status') || n.includes('status_')) {
    return faker.helpers.arrayElement(['Active', 'Inactive']);
  }
  if (n.includes('order') && n.includes('status')) {
    return faker.helpers.arrayElement(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded']);
  }
  if (n.includes('payment') && n.includes('status')) {
    return faker.helpers.arrayElement(['Pending', 'Paid', 'Failed', 'Refunded', 'Processing']);
  }
  
  // Phone/Mobile fields - Use Faker for realistic phone numbers
  if (n.includes('phone') || n.includes('mobile') || n.includes('tel')) {
    // Generate as numeric string without formatting
    return faker.phone.number().replace(/\D/g, '');
  }
  
  // Occupation/Job fields - Use Faker
  if (n.includes('occupation') || n.includes('job') && !n.includes('title') || n.includes('profession') || n.includes('career')) {
    return faker.person.jobTitle();
  }
  
  // Department and role fields - Use Faker
  if (n.includes('department') || n.includes('dept')) {
    return faker.commerce.department();
  }
  if (n.includes('role') || n.includes('position') || n.includes('title') && n.includes('job')) {
    return faker.person.jobDescriptor();
  }
  
  // Education fields - Use Faker
  if (n.includes('education') || n.includes('degree')) {
    return faker.person.bio();
  }
  
  // Marital status - Use Faker
  if (n.includes('marital')) {
    return faker.helpers.arrayElement(['Single', 'Married', 'Divorced', 'Widowed', 'Separated']);
  }
  
  // Name fields - Use Faker for realistic names
  if (n.includes('dog')) return faker.animal.dog();
  if (n.includes('first') && n.includes('name')) return faker.person.firstName();
  if (n.includes('last') && n.includes('name')) return faker.person.lastName();
  if (n.includes('full') && n.includes('name') || n === 'name' || n === 'username') {
    return faker.person.fullName();
  }
  if (n === 'username' || n.includes('user') && n.includes('name')) {
    return faker.internet.userName();
  }
  
  // Location fields - Use Faker for realistic locations
  if (n.includes('city')) return faker.location.city();
  if (n.includes('country') && n.includes('code')) return faker.location.countryCode();
  if (n.includes('from') && n.includes('country') || n.includes('origin') && n.includes('country') || 
      n.includes('birth') && n.includes('country') || n.includes('home') && n.includes('country') ||
      n.includes('nationality')) {
    return faker.location.country();
  }
  if (n.includes('country')) return faker.location.country();
  if (n.includes('place') || n.includes('location') && !n.includes('lat') && !n.includes('lon')) {
    return faker.location.city();
  }
  if (n.includes('state') && !n.includes('status')) {
    return faker.location.state({ abbreviated: true });
  }
  if (n.includes('zipcode') || n.includes('zip') || n.includes('postal')) {
    return faker.location.zipCode();
  }
  if (n.includes('street') || n.includes('address') && !n.includes('email')) {
    return faker.location.streetAddress();
  }
  
  // Network/IP fields - Use Faker
  if (n.includes('ip') && (n.includes('address') || n === 'ip' || n.includes('ipv4'))) {
    return faker.internet.ip();
  }
  if (n.includes('ipv6')) {
    return faker.internet.ipv6();
  }
  if (n.includes('hostname') || n.includes('host') && n.includes('name')) {
    return faker.internet.domainName();
  }
  if (n.includes('user') && n.includes('agent')) {
    return faker.internet.userAgent();
  }
  
  // Device/Hardware identifiers - Keep custom for special formats
  if (n.includes('imei')) {
    return generateIMEI();
  }
  if (n.includes('imsi')) {
    return generateIMSI();
  }
  if (n.includes('mac') && (n.includes('address') || n === 'mac')) {
    return faker.internet.mac();
  }
  if (n.includes('uuid') || n.includes('guid')) {
    return faker.string.uuid();
  }
  if (n.includes('serial') && (n.includes('number') || n.includes('no'))) {
    return faker.string.alphanumeric({ length: 12, casing: 'upper' });
  }
  
  // Financial identifiers - Use Faker
  if (n.includes('credit') && n.includes('card') || n.includes('card') && n.includes('number')) {
    return faker.finance.creditCardNumber();
  }
  if (n.includes('bank') && n.includes('account')) {
    return faker.finance.accountNumber();
  }
  if (n.includes('iban')) {
    return faker.finance.iban();
  }
  if (n.includes('swift') || n.includes('bic')) {
    return faker.finance.bic();
  }
  if (n.includes('routing') && n.includes('number')) {
    return faker.finance.routingNumber();
  }
  if (n.includes('pin') || n.includes('cvv') || n.includes('cvc')) {
    return faker.finance.pin();
  }

  // Generic digit-only fields (IDs, codes, numeric values stored as strings)
  // If the field name clearly suggests an identifier / code / value, prefer numeric strings.
  const looksNumericString =
    (n.includes('id') || n.includes('uid') || n.includes('eid')) ||
    (n.includes('number') || n.endsWith('_no') || n.includes('no_')) ||
    n.includes('code') ||
    n.endsWith('_value') || n.includes('value_') ||
    n.includes('age') ||
    (n.includes('phone') || n.includes('mobile') || n.includes('tel'));

  if (looksNumericString) {
    // Keep more specific patterns above (IMEI, IMSI, SSN, credit cards, etc.)
    // Here we just return a simple numeric string with a reasonable length.
    const length =
      n.includes('age') ? 2 :
      n.includes('phone') || n.includes('mobile') || n.includes('tel') ? 10 :
      n.includes('uid') || n.includes('eid') ? 12 :
      8;
    return faker.string.numeric({ length, allowLeadingZeros: true });
  }
  
  // Contact fields - Use Faker
  if (n.includes('email') || n.includes('mail') && !n.includes('male')) {
    return faker.internet.email();
  }
  if (n.includes('url') || n.includes('website') || n.includes('link')) {
    return faker.internet.url();
  }
  if (n.includes('domain')) {
    return faker.internet.domainName();
  }
  
  // Media fields - Use Faker
  if (n.includes('image') || n.includes('photo') || n.includes('avatar') || n.includes('picture')) {
    return faker.image.url();
  }
  if (n.includes('video')) return faker.image.url({ width: 1920, height: 1080 });
  if (n.includes('file') || n.includes('document')) {
    return faker.system.fileName({ extensionCount: 1 });
  }
  
  // Color fields - Use Faker
  if (n.includes('color') || n.includes('colour')) {
    return faker.color.human();
  }
  
  // Size fields - Use Faker
  if (n.includes('size') && !n.includes('page') && !n.includes('file')) {
    return faker.helpers.arrayElement(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  }
  
  // Category/Type fields - Use Faker
  if (n.includes('category') || n.includes('type') && !n.includes('vessel') && !n.includes('vehicle')) {
    return faker.commerce.productAdjective();
  }
  
  // Product fields - Use Faker
  if (n.includes('product') && n.includes('name')) {
    return faker.commerce.productName();
  }
  if (n.includes('sku') || n.includes('product') && n.includes('code')) {
    return faker.string.alphanumeric({ length: 10, casing: 'upper' });
  }
  if (n.includes('product') && n.includes('description')) {
    return faker.commerce.productDescription();
  }
  
  // Airport/Aviation
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
  if (n.includes('make') && !n.includes('email')) return VEHICLE_MAKES[randInt(0, VEHICLE_MAKES.length - 1)];
  if (n.includes('vin')) return generateVIN();
  if (n.includes('driver')) return generateDriverName();
  if (n.includes('delivery') && n.includes('id')) return generateDeliveryId();
  if (n.includes('route') && n.includes('id')) return generateRouteId();
  if (n.includes('warehouse')) {
    const warehouses = VEHICLE_LOCATIONS.filter(v => v.type === 'warehouse');
    return warehouses[randInt(0, warehouses.length - 1)].name;
  }
  
  // Description fields - Use Faker
  if (n.includes('description') || n.includes('desc') || n.includes('comment') || n.includes('note')) {
    return faker.lorem.sentence();
  }
  if (n.includes('title') && !n.includes('job')) {
    return faker.lorem.words({ min: 2, max: 5 });
  }
  if (n.includes('text') || n.includes('content')) {
    return faker.lorem.paragraph();
  }
  if (n.includes('bio') || n.includes('biography')) {
    return faker.person.bio();
  }
  
  // Company/Business fields - Use Faker
  if (n.includes('company') && n.includes('name')) {
    return faker.company.name();
  }
  if (n.includes('company') && n.includes('suffix')) {
    return faker.company.buzzNoun();
  }
  if (n.includes('business') && n.includes('name')) {
    return faker.company.name();
  }
  
  // Vehicle fields - Keep custom for specific formats
  if (n.includes('license') || n.includes('plate')) {
    return generateLicensePlate();
  }
  if (n.includes('vehicle') && n.includes('type')) {
    return VEHICLE_TYPES[randInt(0, VEHICLE_TYPES.length - 1)];
  }
  if (n.includes('make') && !n.includes('email')) {
    return VEHICLE_MAKES[randInt(0, VEHICLE_MAKES.length - 1)];
  }
  if (n.includes('vin')) {
    return generateVIN();
  }
  if (n.includes('driver')) {
    return generateDriverName();
  }
  if (n.includes('delivery') && n.includes('id')) {
    return generateDeliveryId();
  }
  if (n.includes('route') && n.includes('id')) {
    return generateRouteId();
  }
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
  // Language context map: baseName -> seed value
  const languageSeedMap: Record<string, number> = {};
  // Store English values for Arabic translation
  const englishValueMap: Record<string, string> = {};
  
  function genProps(props: Properties, basePath = ''): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    
    // First pass: identify all language field pairs and assign seeds
    for (const [key] of Object.entries(props)) {
      const langInfo = detectLanguageField(key);
      if (langInfo && !languageSeedMap[langInfo.baseName]) {
        // Assign a consistent seed for this base field name
        languageSeedMap[langInfo.baseName] = randInt(0, 7);
      }
    }
    
    // Second pass: Generate all _en fields first and store their values
    for (const [key, spec] of Object.entries(props)) {
      const langInfo = detectLanguageField(key);
      if (langInfo && langInfo.lang === 'en') {
        const t = spec.type ?? (spec.properties ? 'object' : 'keyword');
        const path = basePath ? `${basePath}.${key}` : key;
        const rule = (rules?.[path] ?? rules?.[key]);
        
        if (rule?.kind !== 'manual' && (t === 'keyword' || t === 'text')) {
          const languageContext = {
            baseName: langInfo.baseName,
            lang: 'en',
            seed: languageSeedMap[langInfo.baseName]
          };
          const guessed = smartStringForField(key, languageContext);
          if (guessed) {
            englishValueMap[langInfo.baseName] = guessed;
          }
        }
      }
    }
    
    for (const [key, spec] of Object.entries(props)) {
      const t = spec.type ?? (spec.properties ? 'object' : 'keyword');
      const path = basePath ? `${basePath}.${key}` : key;
      const rule = (rules?.[path] ?? rules?.[key]);
      if (rule?.kind === 'manual') { out[key] = rule.value; continue; }
      
      // Check if this is a language-specific field
      const langInfo = detectLanguageField(key);
      const languageContext = langInfo ? {
        baseName: langInfo.baseName,
        lang: langInfo.lang,
        seed: languageSeedMap[langInfo.baseName]
      } : undefined;
      
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
            const guessed = smartStringForField(key, languageContext, englishValueMap);
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
            // Try smart number generation based on field name
            const smartNum = smartNumberForField(key, false);
            out[key] = smartNum !== null ? smartNum : randFloat(0, 1000);
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
            // Try smart number generation based on field name
            const smartNum = smartNumberForField(key, true);
            out[key] = smartNum !== null ? smartNum : randInt(0, 1000);
          }
          break;
        case 'boolean':
          // Smart boolean generation based on field name
          const n = key.toLowerCase();
          if (n.includes('active') || n.includes('enabled') || n.includes('verified') || 
              n.includes('confirmed') || n.includes('approved')) {
            out[key] = Math.random() < 0.7; // 70% true for active/enabled fields
          } else if (n.includes('deleted') || n.includes('blocked') || n.includes('banned') || 
                     n.includes('suspended') || n.includes('archived')) {
            out[key] = Math.random() < 0.2; // 20% true for negative fields
          } else {
            out[key] = Math.random() < 0.5; // 50/50 for generic boolean fields
          }
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
