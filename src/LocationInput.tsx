import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';
import type { Place } from './types';

export default function LocationInput({ label, letter, value, onChange, onChoose, onMapPick, disabled }: {
  label: string; letter: string; value: string; onChange: (text: string) => void;
  onChoose: (place: Place) => void; onMapPick: () => void; disabled: boolean;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [index, setIndex] = useState(-1);
  const edited = useRef(false);
  useEffect(() => {
    if (!focused || !edited.current || value.trim().length < 3) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setMessage('');
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResults(data.places); setIndex(-1);
        if (!data.places.length) setMessage('No US location found. Try city and state.');
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Location search failed.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, focused]);
  const choose = (place: Place) => { edited.current = false; onChoose(place); setFocused(false); setResults([]); };
  return <div className="location-field"><label htmlFor={`location-${letter}`}>{label}</label><div className={`location-box location-${letter}`}><span className="location-letter">{letter}</span><input id={`location-${letter}`} type="text" value={value} disabled={disabled} maxLength={250} required placeholder="Search an address or choose on map" autoComplete="off" role="combobox" aria-expanded={focused && results.length > 0} aria-controls={`results-${letter}`} aria-autocomplete="list" aria-activedescendant={index >= 0 ? `option-${letter}-${index}` : undefined} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => { edited.current = true; onChange(event.target.value); }} onKeyDown={event => {
      if (event.key === 'Escape') setFocused(false);
      if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setIndex(i => (i + 1) % results.length); }
      if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setIndex(i => (i - 1 + results.length) % results.length); }
      if (event.key === 'Enter' && focused && index >= 0) { event.preventDefault(); choose(results[index]); }
    }} />{loading && <LoaderCircle className="spin" size={16} />}</div>
    {focused && results.length > 0 && <ul id={`results-${letter}`} className="location-results" role="listbox" aria-label={`${label} suggestions`}>{results.map((place, i) => <li key={`${place.lat}-${place.lon}`} role="option" id={`option-${letter}-${i}`} aria-selected={index === i}><button type="button" tabIndex={-1} className={index === i ? 'highlighted' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}><MapPin size={15} />{place.label}</button></li>)}</ul>}
    {focused && message && <p className="field-message">{message}</p>}
    <button type="button" className="map-pick-button" aria-label={`Choose ${label.toLowerCase()} on map`} aria-haspopup="dialog" disabled={disabled} onClick={() => { setFocused(false); onMapPick(); }}><MapPin size={14} />Choose on map</button>
  </div>;
}
