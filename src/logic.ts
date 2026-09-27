// Pure helpers for Day Ahead. Temperatures °C, wind km/h, precip mm/cm.

export interface Hourly {
  time: string[]; // local "YYYY-MM-DDTHH:00"
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: (number | null)[];
  precipitation: number[];
  snowfall: number[];
  weather_code: number[];
  wind_gusts_10m: number[];
  is_day?: number[];
}

export interface Point { hour: number; temp: number; feels: number; pop: number; rain: number; snow: number; code: number; gust: number; day: boolean }

export function point(h: Hourly, day: string, hour: number): Point | null {
  const key = `${day}T${String(Math.min(23, hour)).padStart(2, '0')}:00`;
  const i = h.time.indexOf(key);
  if (i < 0) return null;
  return {
    hour, temp: h.temperature_2m[i], feels: h.apparent_temperature[i], pop: Number(h.precipitation_probability[i] ?? 0),
    rain: h.precipitation[i] ?? 0, snow: h.snowfall[i] ?? 0, code: h.weather_code[i], gust: h.wind_gusts_10m?.[i] ?? 0, day: (h.is_day?.[i] ?? 1) === 1,
  };
}

export function range(h: Hourly, day: string, from: number, to: number): Point[] {
  const out: Point[] = [];
  for (let hr = from; hr <= to; hr++) { const p = point(h, day, hr); if (p) out.push(p); }
  return out;
}

export const isSnow = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const isFreezing = (c: number) => c === 56 || c === 57 || c === 66 || c === 67;
export const isWet = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

export function sky(code: number): string {
  if (code === 0) return 'Clear'; if (code <= 2) return 'Partly cloudy'; if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog'; if (isFreezing(code)) return 'Freezing rain';
  if (code >= 51 && code <= 57) return 'Drizzle'; if (code >= 61 && code <= 65) return 'Rain';
  if (isSnow(code)) return 'Snow'; if (code >= 80 && code <= 82) return 'Showers'; if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

/** "Rain from about 3 PM", "Showers 11 AM–2 PM", "Dry all day". */
export function wetSpan(pts: Point[], fmt: (h: number) => string): string {
  const wet = pts.filter((p) => p.pop >= 50 || p.rain >= 0.3 || p.snow > 0);
  if (!wet.length) return pts.some((p) => p.pop >= 30) ? 'Small chance of a shower' : 'Dry all day';
  const kind = wet.some((p) => p.snow > 0 || isSnow(p.code)) ? 'Snow' : wet.some((p) => isFreezing(p.code)) ? 'Freezing rain' : 'Rain';
  const a = wet[0].hour, b = wet[wet.length - 1].hour + 1;
  if (b - a >= 12) return `${kind} most of the day`;
  return b >= pts[pts.length - 1].hour ? `${kind} from about ${fmt(a)}` : `${kind} ${fmt(a)}–${fmt(b)}`;
}

export interface Tip { key: string; icon: string; text: string; level: 'info' | 'warn' }

/** Heads-ups for a driver: umbrella, windshield, roads, wind, cold, sun glare. */
export function tips(leave: Point | null, back: Point | null, pts: Point[], overnightMin: number, overnightSnow: number): Tip[] {
  const t: Tip[] = [];
  const trips = [leave, back].filter(Boolean) as Point[];
  if (overnightSnow >= 0.5) t.push({ key: 'snow', icon: 'car', text: `${Math.round(overnightSnow)} cm of snow overnight — clear the car`, level: 'warn' });
  else if (leave && overnightMin <= 1 && leave.temp <= 3) t.push({ key: 'frost', icon: 'frost', text: 'Frost likely — scrape the windshield', level: 'warn' });
  if (pts.some((p) => isFreezing(p.code)) || (trips.some((p) => p.temp <= 1) && pts.some((p) => p.rain > 0 || p.snow > 0))) t.push({ key: 'ice', icon: 'car', text: 'Slippery roads possible — give yourself extra time', level: 'warn' });
  if (trips.some((p) => p.pop >= 50 && !isSnow(p.code))) t.push({ key: 'umbrella', icon: 'umbrella', text: 'Take an umbrella', level: 'info' });
  const gust = Math.max(0, ...pts.map((p) => p.gust));
  if (gust >= 50) t.push({ key: 'wind', icon: 'wind', text: `Gusts up to ${Math.round(gust)} km/h`, level: gust >= 70 ? 'warn' : 'info' });
  const cold = Math.min(...trips.map((p) => p.feels));
  if (trips.length && cold <= -15) t.push({ key: 'cold', icon: 'thermo', text: `Feels like ${Math.round(cold)}° — warm coat and gloves`, level: 'warn' });
  if (trips.some((p) => p.code <= 1 && p.day)) t.push({ key: 'sun', icon: 'sun', text: 'Sunny drive — sunglasses', level: 'info' });
  return t.slice(0, 3);
}
