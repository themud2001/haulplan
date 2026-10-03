import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, Download, FileText, Fuel, HelpCircle, Info, LoaderCircle, MapPinned,
  Moon, Navigation, Printer, Route, ShieldCheck, SlidersHorizontal, Truck, X,
} from 'lucide-react';
import LocationInput from './LocationInput';
import RouteMap from './RouteMap';
import MapLocationPicker from './MapLocationPicker';
import LogSheet, { type DriverDetails } from './LogSheet';
import { type Place, type Plan, type TripEvent, eventNames, formatDate, formatDuration, formatTime } from './types';

const initialPlaces: Place[] = [
  { label: 'Atlanta, Georgia', lat: 33.749, lon: -84.388 },
  { label: 'Nashville, Tennessee', lat: 36.1627, lon: -86.7816 },
  { label: 'Chicago, Illinois', lat: 41.8781, lon: -87.6298 },
];
const coastPlaces: Place[] = [
  { label: 'Los Angeles, California', lat: 34.0522, lon: -118.2437 },
  { label: 'Phoenix, Arizona', lat: 33.4484, lon: -112.074 },
  { label: 'Miami, Florida', lat: 25.7617, lon: -80.1918 },
];
const inputNames = ['Current location', 'Pickup location', 'Drop-off location'];
const isoDay = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const iconFor = (kind: string) => kind === 'drive' ? Truck : kind === 'fuel' ? Fuel : ['rest', 'restart', 'break'].includes(kind) ? Moon : kind === 'inspection' ? ShieldCheck : MapPinned;

export default function App() {
  const [texts, setTexts] = useState(initialPlaces.map(p => p.label));
  const [places, setPlaces] = useState<(Place | null)[]>(initialPlaces);
  const [cycle, setCycle] = useState('24');
  const [departure, setDeparture] = useState(`${isoDay()}T06:00`);
  const [details, setDetails] = useState<DriverDetails>({ driver: '', carrier: '', address: '', vehicle: '', shipping: '', codriver: '', terminal: 'Home-terminal time' });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'logs'>('overview');
  const [logIndex, setLogIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [mapPickIndex, setMapPickIndex] = useState<number | null>(null);
  const [itineraryTab, setItineraryTab] = useState<'stops' | 'directions'>('stops');
  const help = useRef<HTMLDialogElement>(null);
  const visiblePlaces = useMemo(() => places.map((place, index) => place ? { ...place, index } : null).filter((p): p is Place & { index: number } => !!p), [places]);
  const selectEvent = useCallback((id: number) => setSelected(id), []);
  const updateText = (index: number, value: string) => {
    setTexts(old => old.map((text, i) => i === index ? value : text));
    setPlaces(old => old.map((place, i) => i === index ? null : place)); setDirty(true);
  };
  const choosePlace = (index: number, place: Place) => {
    setPlaces(old => old.map((p, i) => i === index ? place : p));
    setTexts(old => old.map((text, i) => i === index ? place.label : text)); setDirty(true);
  };
  const setExample = (coast: boolean) => {
    const sample = coast ? coastPlaces : initialPlaces;
    setTexts(sample.map(p => p.label)); setPlaces(sample); setCycle(coast ? '48' : '24');
    setDirty(true); setError(''); setTab('overview');
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const resolved = await Promise.all(texts.map(async (text, index) => {
        if (places[index]) return places[index]!;
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(text.trim())}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!result.places.length) throw new Error(`No US location found for “${text}”. Try city and state.`);
        return result.places[0] as Place;
      }));
      const response = await fetch('/api/plan', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: resolved[0], pickup: resolved[1],
          dropoff: resolved[2], cycle_used: cycle, departure }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The trip could not be planned. Please try again.');
      setPlan(result); setPlaces(resolved); setTexts(resolved.map(p => p.label));
      setDirty(false); setTab('overview'); setLogIndex(0); setSelected(null);
    } catch (err) {
      setError(controller.signal.aborted ? 'The map service took too long. Please try again.' : err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { clearTimeout(timer); setLoading(false); }
  };
  const printLogs = () => { setTab('logs'); setTimeout(() => window.print(), 150); };
  const download = () => {
    if (!plan) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...plan, driver_details: details }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `haulplan-${plan.logs[0].date}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const showHelp = () => help.current?.showModal();
  const stops = plan?.events.filter(e => e.kind !== 'drive') || [];
  const tripDuration = plan ? formatDuration(plan.summary.elapsed_hours * 60) : '—';

  return <>
    <aside className="sidebar no-print">
      <button className="brand" aria-label="Haulplan home" onClick={() => setTab('overview')}><span className="brand-symbol">h</span><span>haulplan<span className="brand-dot">.</span></span></button>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={tab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('overview')}><Route size={19} />Trip planner<ChevronRight size={15} /></button>
        <button className={tab === 'logs' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('logs')}><FileText size={19} />Daily logs{plan && <span className="nav-count">{plan.logs.length}</span>}</button>
      </nav>
      <div className="sidebar-note"><div className="road-illustration"><svg viewBox="0 0 180 84" fill="none" aria-hidden="true"><path d="M-5 76C48 83 112 58 81 40S86 5 184 13" stroke="#526352" strokeWidth="25" /><path d="M-5 76C48 83 112 58 81 40S86 5 184 13" stroke="#d0df85" strokeWidth="1.5" strokeDasharray="5 5" /><circle cx="149" cy="13" r="6" fill="#d9ed78" /></svg></div><strong>A little planning.<br />A smoother journey.</strong><p>Your route, rest stops and logs.<br />All in one place.</p></div>
      <button className="sidebar-help" onClick={showHelp}><HelpCircle size={18} />How Haulplan works<ArrowUpRight size={15} /></button>
      <div className="sidebar-footer"><span className="avatar"><Truck size={18} /></span><div><strong>Driver workspace</strong><span>Property carrier</span></div><span className="online-dot" /></div>
    </aside>
    <div className="app-shell no-print">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14} /><strong>{tab === 'overview' ? 'Trip planner' : 'Daily logs'}</strong></div><div className="topbar-right"><span className="rule-badge"><span />70-hour / 8-day cycle</span><button className="icon-button" aria-label="Help and planning assumptions" onClick={showHelp}><HelpCircle size={19} /></button></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">A CLEARER ROAD AHEAD</div><h1>{tab === 'overview' ? 'Plan your next haul.' : 'Every hour, accounted for.'}</h1><p>{tab === 'overview' ? 'A thoughtful route. The right breaks. Your daily logs, ready to go.' : 'Review your planned duty status and take your logs on the road.'}</p></div><button className="secondary-button" onClick={plan ? printLogs : showHelp}>{plan ? <Printer size={16} /> : <Info size={16} />}{plan ? 'Print logs' : 'Planning guide'}<ArrowUpRight size={15} /></button></div>
        {tab === 'overview' ? <>
          <div className="planner-grid">
            <section className="card form-card"><div className="card-title"><div><h2>Trip details</h2><p>Where are we headed?</p></div><Truck size={21} /></div>
              <form onSubmit={generate}>
                <div className="location-fields">{texts.map((text, index) => <LocationInput key={index} label={inputNames[index]} letter={String.fromCharCode(65 + index)} value={text} onChange={value => updateText(index, value)} onChoose={place => choosePlace(index, place)} onMapPick={() => setMapPickIndex(index)} disabled={loading} />)}</div>
                <div className="form-divider" />
                <div className="cycle-label"><label htmlFor="cycle">Current cycle used</label><span>of 70 hours</span></div>
                <div className="number-box"><Clock3 size={17} /><input id="cycle" type="number" min="0" max="70" step="0.01" required value={cycle} disabled={loading} onChange={event => { setCycle(event.target.value); setDirty(true); }} /><span>hours</span></div>
                <div className="cycle-progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(cycle) / 70 * 100))}%` }} /></div><p className="cycle-caption">{Math.max(0, 70 - Number(cycle || 0)).toFixed(2).replace(/\.00$/, '')} hours available in your cycle</p>
                <details className="departure-options"><summary><SlidersHorizontal size={15} />Departure & log details<ChevronDown size={15} /></summary><div className="advanced-fields"><label htmlFor="departure">Departure in home-terminal time</label><input id="departure" type="datetime-local" value={departure} min="2000-01-01T00:00" max="2100-12-31T23:59" required disabled={loading} onChange={event => { setDeparture(event.target.value); setDirty(true); }} />
                  {(Object.keys(details) as (keyof DriverDetails)[]).map(key => <label key={key} className="detail-label">{{ driver: 'Driver name', carrier: 'Carrier name', address: 'Main office address', vehicle: 'Truck / trailer numbers', shipping: 'Shipping document / commodity', codriver: 'Co-driver (optional)', terminal: 'Home-terminal time basis' }[key]}<input value={details[key]} maxLength={200} placeholder={key === 'terminal' ? 'e.g. Central time' : 'Optional'} onChange={event => setDetails(old => ({ ...old, [key]: event.target.value }))} /></label>)}
                </div></details>
                {error && <div className="error-message" role="alert"><Info size={17} />{error}</div>}
                <button type="submit" className="primary-button" disabled={loading}>{loading ? <><LoaderCircle size={18} className="spin" />Planning your trip…</> : <><Route size={18} />{plan && dirty ? 'Update trip plan' : 'Generate trip plan'}<ArrowRight size={18} /></>}</button>
                <p className="fresh-shift"><ShieldCheck size={14} />Starts after a 10-hour off-duty reset</p>
              </form>
            </section>
            <section className="card map-card"><div className="map-heading"><div><span className="section-dot" /><h2>Route overview</h2></div><span className={`map-status ${plan && !dirty ? 'ready' : ''}`}>{loading ? 'Calculating route' : plan ? dirty ? 'Inputs changed' : 'Trip planned' : 'Ready to plan'}</span></div>
              <div className="map-container"><RouteMap plan={dirty ? null : plan} places={visiblePlaces} selected={selected} onSelect={selectEvent} />
                {!plan && !loading && <div className="map-prompt"><span className="prompt-icon"><Navigation size={22} /></span><div><strong>Your journey starts here</strong><p>Add your stops. We’ll take care of the plan.</p></div></div>}
                {loading && <div className="map-loading" role="status"><LoaderCircle className="spin" size={28} /><strong>Finding your way</strong><span>Mapping the route and scheduling your breaks…</span></div>}
                <div className="map-key"><span><i className="legend-route" />Route</span><span><i className="legend-fuel" />Fuel</span><span><i className="legend-rest" />Rest / break</span></div>
              </div>
              <div className="route-endpoints">{texts.map((text, i) => <div key={i}><span className={`endpoint-letter endpoint-${i}`}>{String.fromCharCode(65 + i)}</span><div><span>{['Starting point', 'Pickup', 'Drop-off'][i]}</span><strong>{text.split(',')[0] || 'Choose location'}</strong></div>{i < 2 && <ArrowRight size={16} />}</div>)}</div>
            </section>
          </div>
          <div className="stats-grid">
            <Stat icon={Route} label="Total distance" value={plan ? plan.summary.total_miles.toLocaleString() : '—'} unit={plan ? 'mi' : ''} caption={plan ? 'Across both route legs' : 'Your complete route'} />
            <Stat icon={Clock3} label="Trip duration" value={tripDuration} caption={plan ? `${plan.summary.driving_hours} hours of driving` : 'Driving, work & rest included'} />
            <Stat icon={Moon} label="Scheduled stops" value={plan ? String(plan.summary.rest_stops + plan.summary.fuel_stops) : '—'} caption={plan ? `${plan.summary.rest_stops} rest / breaks · ${plan.summary.fuel_stops} fuel` : 'Fuel and rest, taken care of'} />
            <Stat icon={FileText} label="Daily log sheets" value={plan ? String(plan.logs.length) : '—'} caption={plan ? 'Filled out & ready to print' : 'One sheet for every day'} />
          </div>
          {plan ? <section className="card itinerary-card"><div className="itinerary-heading"><div><div className="eyebrow">YOUR ROADBOOK</div><h2>The journey, step by step.</h2></div><div className="arrival"><span>Delivery complete</span><strong>{formatDate(plan.summary.arrival)} at {formatTime(plan.summary.arrival)}</strong></div></div>
            <div className="itinerary-tabs"><button className={itineraryTab === 'stops' ? 'selected' : ''} onClick={() => setItineraryTab('stops')}><MapPinned size={16} />Stops & schedule<span>{stops.length}</span></button><button className={itineraryTab === 'directions' ? 'selected' : ''} onClick={() => setItineraryTab('directions')}><Navigation size={16} />Route instructions</button><button className="export-button" onClick={download}><Download size={15} />Export trip</button></div>
            {itineraryTab === 'stops' ? <div className="schedule-list">{plan.events.map((event, index) => { const Icon = iconFor(event.kind); return <button key={event.id} className={`schedule-row ${selected === event.id ? 'selected' : ''}`} onClick={() => selectEvent(event.id)}><span className={`schedule-icon ${event.kind}`}><Icon size={18} /></span><span className="event-main"><strong>{eventNames[event.kind]}{event.kind === 'drive' && <small>{event.miles.toFixed(1)} mi</small>}</strong><span>{event.kind === 'drive' ? `${event.start_location} → ${event.location}` : event.location}</span></span><span className="event-time"><strong>{formatTime(event.start)}–{formatTime(event.end)}</strong><span>{formatDate(event.start)}{event.start.slice(0, 10) !== event.end.slice(0, 10) ? ` → ${formatDate(event.end)}` : ''}</span></span><span className="event-duration">{formatDuration(event.duration_minutes)}</span><ChevronRight size={15} /><span className="sr-only">Stop {index + 1}</span></button>; })}</div> : <div className="directions-list">{plan.route.legs.map((leg, i) => <div key={i}><h3><span className="endpoint-letter">{String.fromCharCode(65 + i)}</span>{leg.from.label.split(',')[0]} <ArrowRight size={15} /> {leg.to.label.split(',')[0]}<small>{Math.round(leg.distance_miles)} mi</small></h3>{plan.route.directions.filter(d => d.leg === i).map((d, n) => <div key={n}><span>{n + 1}</span><p>{d.instruction}</p><strong>{d.miles} mi</strong></div>)}</div>)}</div>}
            <div className="itinerary-footer"><ShieldCheck size={17} /><p>Rest is scheduled within the 11-hour driving and 14-hour duty windows.</p><button onClick={() => setTab('logs')}>View daily logs <ArrowRight size={15} /></button></div>
          </section> : <section className="sample-banner"><span className="sample-icon"><Route size={23} /></span><div><strong>Take the scenic route through the app.</strong><p>Try a longer haul to see fuel stops, overnight rests and multiple daily logs.</p></div><button onClick={() => setExample(true)}>Try a coast-to-coast trip <ArrowRight size={17} /></button></section>}
          <div className="planning-note"><Info size={16} /><p>Planned estimates for the contiguous US. Road routes use a car profile; verify truck restrictions and real rest / fuel facilities. <button onClick={showHelp}>See planning assumptions</button></p></div>
        </> : plan ? <>
          <section className="card log-toolbar"><div><FileText size={20} /><strong>{plan.logs.length} daily log sheets</strong><span>{formatDate(plan.logs[0].date)} – {formatDate(plan.logs[plan.logs.length - 1].date)}</span></div><div className="log-pagination"><button className="icon-button" aria-label="Previous log day" disabled={logIndex === 0} onClick={() => setLogIndex(i => i - 1)}><ChevronLeft size={18} /></button><span>Day {logIndex + 1} of {plan.logs.length}</span><button className="icon-button" aria-label="Next log day" disabled={logIndex === plan.logs.length - 1} onClick={() => setLogIndex(i => i + 1)}><ChevronRight size={18} /></button></div></section>
          <div className="day-tabs" role="tablist" aria-label="Daily log dates">{plan.logs.map((log, i) => <button role="tab" aria-selected={i === logIndex} key={log.date} className={i === logIndex ? 'active' : ''} onClick={() => setLogIndex(i)}><span>DAY {i + 1}</span><strong>{formatDate(log.date)}</strong><small>{log.miles} mi</small></button>)}</div>
          <LogSheet log={plan.logs[logIndex]} locations={plan.route.locations} details={details} />
          <div className="log-totals">{Object.entries(plan.logs[logIndex].totals).map(([key, value]) => <span key={key}><i className={`duty-${key}`} />{{ off_duty: 'Off duty', sleeper: 'Sleeper berth', driving: 'Driving', on_duty: 'On duty' }[key]}<strong>{formatDuration(value * 60)}</strong></span>)}<span className="total-check"><Check size={16} />24 hours accounted for</span></div>
          <p className="log-note">Add driver, carrier and vehicle information in “Departure & log details” before printing. “Print logs” includes every day; use your browser’s Save as PDF option to download them.</p>
        </> : <section className="card empty-logs"><span><FileText size={34} /></span><h2>Your logbook is ready for a trip.</h2><p>Generate a trip plan to see a filled daily log for every day on the road.</p><button className="primary-button" onClick={() => setTab('overview')}>Plan a trip <ArrowRight size={17} /></button></section>}
        <footer className="page-footer"><span>HAULPLAN <span>·</span> MADE FOR THE MILES AHEAD</span><a href="https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations" target="_blank" rel="noreferrer">FMCSA hours-of-service reference <ArrowUpRight size={12} /></a></footer>
      </main>
    </div>
    {plan && <div className="print-only">{plan.logs.map(log => <LogSheet key={log.date} log={log} locations={plan.route.locations} details={details} />)}</div>}
    {mapPickIndex !== null && <MapLocationPicker label={inputNames[mapPickIndex]} letter={String.fromCharCode(65 + mapPickIndex)} initialPlace={places[mapPickIndex]} onCancel={() => setMapPickIndex(null)} onChoose={place => { choosePlace(mapPickIndex, place); setMapPickIndex(null); }} />}
    <dialog ref={help} className="help-dialog no-print"><button className="dialog-close icon-button" aria-label="Close guide" onClick={() => help.current?.close()}><X size={21} /></button><span className="eyebrow">THE PLANNING GUIDE</span><h2>A little context for the road.</h2><p>Enter your current location, pickup, drop-off and cycle hours. Haulplan maps both legs, schedules work and breaks, then draws a 24-hour log for each trip day.</p><div className="rules-grid">{[['11h', 'Driving per shift'], ['14h', 'Driving window'], ['30m', 'Break after 8h driving'], ['10h', 'Daily reset'], ['70h', '8-day cycle'], ['34h', 'Cycle restart']].map(([value, name]) => <div key={value}><strong>{value}</strong><span>{name}</span></div>)}</div><h3>Planning assumptions</h3><ul>{(plan?.assumptions || [
      'Property carrier on a 70-hour / 8-day cycle, with no adverse driving conditions or split-sleeper exceptions.',
      'Start with a fresh driving shift after 10 hours off duty and a full fuel tank.',
      'Allow 1 hour each for pickup and delivery, 15 minutes for shift inspections, and 30 minutes for fueling at least every 1,000 miles.',
      'Use the slower of road travel time and a 55 mph average for the schedule.',
      'Without prior daily cycle history, recaptured hours are not assumed. A 34-hour restart is scheduled when needed.',
      'All logs use one fixed home-terminal time basis; daylight-saving transitions are not modeled.',
      'Routes use OSRM’s car profile. Stop pins show points along the route, not verified truck facilities. Verify truck restrictions and stop locations.',
      'These are planned logs. Add actual activity and location details before signing.',
    ]).map(text => <li key={text}>{text}</li>)}</ul><a href="https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations" target="_blank" rel="noreferrer">Read the FMCSA HOS summary <ArrowUpRight size={15} /></a></dialog>
  </>;
}

function Stat({ icon: Icon, label, value, unit, caption }: { icon: typeof Route; label: string; value: string; unit?: string; caption: string }) {
  return <section className="card stat-card"><div><span>{label}</span><Icon size={18} /></div><strong>{value}<small>{unit}</small></strong><p>{caption}</p></section>;
}
