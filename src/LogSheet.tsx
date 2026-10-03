import type { DailyLog, Place, Status } from './types';
import { eventNames, formatDate } from './types';

const rows: { key: Status; name: string; color: string }[] = [
  { key: 'off_duty', name: '1. Off duty', color: '#6c796f' },
  { key: 'sleeper', name: '2. Sleeper berth', color: '#859869' },
  { key: 'driving', name: '3. Driving', color: '#344e42' },
  { key: 'on_duty', name: '4. On duty (not driving)', color: '#b18b46' },
];
export type DriverDetails = { driver: string; carrier: string; address: string; vehicle: string; shipping: string; codriver: string; terminal: string };

export default function LogSheet({ log, locations, details }: { log: DailyLog; locations: Place[]; details: DriverDetails }) {
  const x = (minute: number) => 155 + minute / 1440 * 840;
  const y = (status: Status) => 55 + rows.findIndex(r => r.key === status) * 44;
  let path = '';
  log.segments.forEach((segment, index) => {
    if (index === 0) path += `M ${x(segment.start_min)} ${y(segment.status)}`;
    else path += ` L ${x(segment.start_min)} ${y(segment.status)}`;
    path += ` L ${x(segment.end_min)} ${y(segment.status)}`;
  });
  const hours = (value: number) => value.toFixed(2).replace(/\.00$/, '');
  return <article className="log-sheet">
    <div className="sheet-heading"><div><span className="eyebrow">PLANNED RECORD OF DUTY STATUS</span><h2>Driver’s daily log</h2><p>One calendar day · 24 hours · {details.terminal || 'Home-terminal time'}</p></div><div className="sheet-date"><strong>{formatDate(log.date)}, {log.date.slice(0, 4)}</strong><span>{log.miles.toLocaleString()} miles driven</span></div></div>
    <div className="sheet-fields">
      <div><span>Driver</span><strong>{details.driver || 'Not provided'}</strong></div>
      <div><span>Carrier</span><strong>{details.carrier || 'Not provided'}</strong></div>
      <div><span>Main office address</span><strong>{details.address || 'Not provided'}</strong></div>
      <div><span>Truck / tractor & trailer</span><strong>{details.vehicle || 'Not provided'}</strong></div>
      <div><span>From</span><strong>{locations[0].label}</strong></div>
      <div><span>To</span><strong>{locations[2].label}</strong></div>
      <div><span>Shipping document / commodity</span><strong>{details.shipping || 'Not provided'}</strong></div>
      <div><span>Co-driver</span><strong>{details.codriver || 'None'}</strong></div>
    </div>
    <div className="grid-scroll"><svg className="log-grid" viewBox="0 0 1090 235" role="img" aria-label={`24-hour duty graph for ${log.date}`}>
      <rect x="155" y="33" width="840" height="176" fill="#fafbf8" stroke="#aab3a8" />
      {Array.from({ length: 97 }, (_, i) => <line key={i} x1={155 + i * 8.75} x2={155 + i * 8.75} y1="33" y2="209" stroke={i % 4 === 0 ? '#aab3a8' : '#e1e5dd'} strokeWidth={i % 4 === 0 ? 0.9 : 0.5} />)}
      {Array.from({ length: 25 }, (_, i) => <text key={i} x={155 + i * 35} y="21" textAnchor="middle" fontSize="11" fill="#687468">{i === 0 || i === 24 ? 'Mid' : i === 12 ? 'Noon' : i % 12}</text>)}
      <text x="1055" y="21" textAnchor="middle" fontSize="10" fill="#687468">HOURS</text>
      {rows.map((r, i) => <g key={r.key}><line x1="155" x2="995" y1={33 + i * 44} y2={33 + i * 44} stroke="#aab3a8" /><text x="7" y={60 + i * 44} fontSize="12" fill="#36463c">{r.name}</text><text x="1055" y={60 + i * 44} textAnchor="middle" fontSize="15" fontWeight="600" fill="#36463c">{hours(log.totals[r.key])}</text></g>)}
      <path d={path} fill="none" stroke="#344e42" strokeWidth="3" strokeLinejoin="round" />
      <text x="1055" y="231" fontSize="12" textAnchor="middle" fontWeight="600">24 total</text>
    </svg></div>
    <div className="sheet-remarks"><h3>Remarks & duty changes</h3><div className="remark-list">{log.remarks.map((remark, i) => <div key={i}><time>{String(Math.floor(remark.minute / 60)).padStart(2, '0')}:{String(Math.floor(remark.minute % 60)).padStart(2, '0')}</time><span><strong>{eventNames[remark.kind]}{remark.continued ? ' (continued)' : ''}</strong> · {remark.location}</span></div>)}</div></div>
    <div className="sheet-footer"><p>Planning estimate · Verify actual activity and stop locations before certification.</p><span>Driver signature: ______________________</span></div>
  </article>;
}
