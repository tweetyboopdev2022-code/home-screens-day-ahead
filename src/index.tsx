import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { frame, ink, caps, Icon, I, Shape, wxIcon, sdk, useNow, dayKey, localHM, parseHM } from './ui';
import { Hourly, Point, point, range, sky, wetSpan, tips } from './logic';

const C = (x: number, y: number, r: number): Shape => ({ c: [x, y, r] });
const X: Record<string, Shape[]> = {
  umbrella: ['M22 12a10.06 10.06 1 0 0-20 0Z', 'M12 12v8a2 2 0 0 0 4 0', 'M12 2v1'],
  wind: ['M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2', 'M9.6 4.6A2 2 0 1 1 11 8H2', 'M12.6 19.4A2 2 0 1 0 14 16H2'],
  frost: ['M2 12h20', 'M12 2v20', 'm4.93 4.93 14.14 14.14', 'm19.07 4.93-14.14 14.14'],
  car: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', C(7, 17, 2), 'M9 17h6', C(17, 17, 2)],
  thermo: ['M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z'],
  home: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  out: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
};

export default function DayAhead({ config, style, timezone, units, ...rest }: PluginComponentProps & { units?: string; timeFormat?: string }) {
  const now = useNow(60000);
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const accent = String(config.accentColor || '#059669');
  const leaveM = parseHM(String(config.leaveTime || '07:30')), backM = parseHM(String(config.returnTime || '17:30'));
  const from = Number(config.fromHour ?? 6), to = Number(config.toHour ?? 22);
  const tomorrow = localHM(now, tz) >= Number(config.switchToTomorrowAt ?? 20) * 60;
  const imperial = units === 'imperial';
  const deg = (c: number) => `${Math.round(imperial ? c * 9 / 5 + 32 : c)}°`;
  const tf = (rest as any).timeFormat;
  const h12 = tf !== '24h';
  const fmtH = (h: number, m = 0) => { const hh = ((h % 24) + 24) % 24; if (!h12) return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`; const ap = hh < 12 ? 'AM' : 'PM'; const x = hh % 12 || 12; return m ? `${x}:${String(m).padStart(2, '0')} ${ap}` : `${x} ${ap}`; };

  const lat = (rest as any).latitude ?? sdk()?.getHostSettings?.()?.latitude;
  const lon = (rest as any).longitude ?? sdk()?.getHostSettings?.()?.longitude;
  const [hourly, setHourly] = React.useState<Hourly | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const tick = Math.floor(now.getTime() / 1800000);
  React.useEffect(() => {
    if (lat == null || lon == null) return;
    (async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(3)}&longitude=${Number(lon).toFixed(3)}`
          + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,wind_gusts_10m,is_day'
          + `&timezone=${encodeURIComponent(tz)}&past_days=1&forecast_days=3`;
        const res: Response = await sdk().pluginFetch('day-ahead', { url, cacheTtlMs: 1800000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setHourly((await res.json()).hourly); setErr(null);
      } catch { setErr('Weather unavailable right now'); }
    })();
  }, [lat, lon, tz, tick]);

  const root = frame(style, { gap: '0.7em' });
  if (lat == null) return <div style={root}><div style={{ margin: 'auto', opacity: 0.6 }}>Set your location in Settings first.</div></div>;
  if (!hourly) return <div style={root}><div style={{ margin: 'auto', opacity: 0.6 }}>{err ?? 'Checking the forecast…'}</div></div>;

  const day = dayKey(new Date(now.getTime() + (tomorrow ? 86400000 : 0)), tz);
  const prev = dayKey(new Date(now.getTime() - (tomorrow ? 0 : 86400000)), tz);
  const leave = point(hourly, day, Math.round(leaveM / 60));
  const back = point(hourly, day, Math.round(backM / 60));
  const pts = range(hourly, day, from, Math.min(23, to));
  const all = range(hourly, day, 0, 23);
  const night = [...range(hourly, prev, 20, 23), ...range(hourly, day, 0, Math.floor(leaveM / 60))];
  const hi = Math.max(...all.map((p) => p.temp)), lo = Math.min(...all.map((p) => p.temp));
  const mainCode = pts.reduce((a, p) => (p.code > a ? p.code : a), 0);
  const tipList = tips(leave, back, pts, Math.min(...night.map((p) => p.temp)), night.reduce((a, p) => a + p.snow, 0));
  const span = wetSpan(pts, (h) => fmtH(h));
  const counts: Record<string, number> = {}; pts.forEach((p) => { const k = sky(p.code); counts[k] = (counts[k] ?? 0) + 1; });
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? sky(mainCode);
  const headline = /^(Dry|Small)/.test(span) ? `${common} · ${span.toLowerCase()}` : span;
  const strip = pts.filter((p) => (p.hour - from) % 2 === 0);

  const trip = (label: string, icon: Shape[], at: number, p: Point | null) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35em', padding: '0.7em 0.8em', borderRadius: '0.8em', background: ink(style, 0.05), minWidth: 0 }}>
      <div style={{ ...caps, display: 'flex', alignItems: 'center', gap: '0.45em', opacity: 0.7 }}><Icon d={icon} size="1.2em" stroke={2} />{label} · {fmtH(Math.floor(at / 60), at % 60)}</div>
      {p ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
          <Icon d={wxIcon(p.code, !p.day)} size="2.4em" stroke={1.5} />
          <span style={{ fontSize: '2.3em', fontWeight: 300, lineHeight: 1 }}>{deg(p.temp)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.72em', lineHeight: 1.35, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{sky(p.code)}</span>
            <span style={{ opacity: 0.55 }}>Feels {deg(p.feels)}{p.pop >= 20 ? ` · ${p.pop}% rain` : ''}</span>
          </div>
        </div>
      ) : <div style={{ opacity: 0.5, fontSize: '0.8em' }}>No forecast</div>}
    </div>
  );

  return (
    <div style={root}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em', minWidth: 0 }}>
        <span style={{ ...caps, color: accent, opacity: 1 }}>{tomorrow ? 'Tomorrow' : 'Today'}</span>
        <span style={{ fontSize: '1.1em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{headline}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8em', opacity: 0.6, whiteSpace: 'nowrap' }}>H {deg(hi)} · L {deg(lo)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7em' }}>
        {trip('Leaving', X.out, leaveM, leave)}
        {trip('Coming home', X.home, backM, back)}
      </div>

      {tipList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45em' }}>
          {tipList.map((t) => (
            <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4em', padding: '0.3em 0.7em', borderRadius: '999px', fontSize: '0.72em', fontWeight: 500,
              background: t.level === 'warn' ? 'color-mix(in srgb, #f59e0b 18%, transparent)' : `color-mix(in srgb, ${accent} 12%, transparent)` }}>
              <Icon d={t.icon === 'sun' ? I.sun : X[t.icon]} size="1.1em" stroke={2} />{t.text}
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: `repeat(${strip.length}, 1fr)`, gap: '0.2em', paddingTop: '0.6em', borderTop: `1px solid ${ink(style, 0.08)}` }}>
        {strip.map((p) => {
          const mark = [Math.round(leaveM / 60), Math.round(backM / 60)].some((h) => h === p.hour || h === p.hour + 1);
          return (
            <div key={p.hour} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2em', fontSize: '0.8em', padding: '0.45em 0', borderRadius: '0.6em', background: mark ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent' }}>
              <span style={{ opacity: 0.55 }}>{fmtH(p.hour)}</span>
              <Icon d={wxIcon(p.code, !p.day)} size="1.9em" stroke={1.5} />
              <span style={{ fontWeight: 600 }}>{deg(p.temp)}</span>
              <div style={{ width: '70%', height: '0.3em', borderRadius: '999px', background: ink(style, 0.08), overflow: 'hidden' }}>
                <div style={{ width: `${p.pop}%`, height: '100%', background: '#3b82f6' }} />
              </div>
              <span style={{ fontSize: '0.85em', opacity: p.pop >= 20 ? 0.6 : 0 }}>{p.pop}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
