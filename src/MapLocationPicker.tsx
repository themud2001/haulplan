import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Check, Crosshair, LoaderCircle, MapPin, X } from 'lucide-react';
import type { Place } from './types';

type Coordinate = { lat: number; lon: number };
const coordinateLabel = ({ lat, lon }: Coordinate) => `Pinned location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;

export default function MapLocationPicker({ label, letter, initialPlace, onChoose, onCancel }: {
  label: string; letter: string; initialPlace: Place | null;
  onChoose: (place: Place) => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const [point, setPoint] = useState<Place | null>(initialPlace);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [status, setStatus] = useState<'ready' | 'loading' | 'fallback'>('ready');
  const [error, setError] = useState('');

  const pick = useCallback((lat: number, lon: number) => {
    if (lat < 24 || lat > 50 || lon < -125 || lon > -66) {
      setError('Choose a point within the contiguous United States.');
      return;
    }
    const next = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
    setError('');
    setPoint({ ...next, label: coordinateLabel(next) });
    setCoordinate(next);
    setStatus('loading');
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element || !container.current) return;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const leaflet = L.map(container.current, { zoomControl: false, minZoom: 3, maxBounds: [[15, -140], [60, -50]] });
    map.current = leaflet;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', maxZoom: 19,
    }).addTo(leaflet);
    L.control.zoom({ position: 'bottomright' }).addTo(leaflet);
    leaflet.setView(initialPlace ? [initialPlace.lat, initialPlace.lon] : [38.3, -95.6], initialPlace ? 12 : 4);
    leaflet.on('click', (event: L.LeafletMouseEvent) => pick(event.latlng.lat, event.latlng.lng));
    const observer = new ResizeObserver(() => leaflet.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      leaflet.remove();
      map.current = null;
      marker.current = null;
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [initialPlace, pick]);

  useEffect(() => {
    if (!map.current || !point) return;
    const location: L.LatLngExpression = [point.lat, point.lon];
    if (!marker.current) {
      marker.current = L.marker(location, {
        draggable: true, autoPan: true, title: `${label} pin`, alt: `${label} pin`,
        icon: L.divIcon({ className: 'map-pin-wrap', html: `<span class="map-pin picker-pin">${letter}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
      }).addTo(map.current);
      marker.current.on('dragend', () => {
        const location = marker.current!.getLatLng();
        pick(location.lat, location.lng);
      });
    } else marker.current.setLatLng(location);
  }, [point, label, letter, pick]);

  useEffect(() => {
    if (!coordinate) return;
    const controller = new AbortController();
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`/api/reverse-geocode?lat=${coordinate.lat}&lon=${coordinate.lon}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 400) {
            if (active) { setError(result.error); setStatus('ready'); }
            return;
          }
          throw new Error('Address lookup unavailable');
        }
        if (active) {
          // Keep the user's coordinates even when the nearest address is elsewhere.
          setPoint({ ...coordinate, label: result.place.label });
          setStatus(result.place.label.startsWith('Pinned location') ? 'fallback' : 'ready');
        }
      } catch {
        if (active) setStatus('fallback');
      } finally { clearTimeout(timeout); }
    }, 300);
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [coordinate]);

  return <dialog ref={dialog} className="location-picker no-print" aria-labelledby="picker-title" aria-describedby="picker-description" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <div className="picker-heading"><div><span className="eyebrow">CHOOSE YOUR STOP</span><h2 id="picker-title"><span className={`endpoint-letter endpoint-${letter.charCodeAt(0) - 65}`}>{letter}</span>{label}</h2><p id="picker-description">Click the map to drop a pin, or drag the pin to fine-tune your stop.</p></div><button type="button" className="icon-button" aria-label="Close location picker" onClick={onCancel}><X size={21} /></button></div>
    <div className="picker-map-wrap"><div ref={container} className="picker-map" role="region" aria-label={`Map for choosing ${label.toLowerCase()}`} aria-describedby="picker-keyboard-help" />
      <button type="button" className="picker-center-button" onClick={() => { const center = map.current?.getCenter(); if (center) pick(center.lat, center.lng); }}><Crosshair size={16} />Use map center</button>
    </div>
    <div className="picker-footer"><div className="picker-selection" aria-live="polite" aria-atomic="true"><span className="picker-selection-icon">{status === 'loading' ? <LoaderCircle className="spin" size={19} /> : <MapPin size={19} />}</span><div><span>{status === 'loading' ? 'Finding nearby address…' : point ? 'Selected location' : 'Drop a pin to choose a location'}</span><strong>{point?.label || 'Zoom in and click anywhere on the map.'}</strong>{point && <small>{point.lat.toFixed(5)}, {point.lon.toFixed(5)} · Exact pin will be saved</small>}{status === 'fallback' && <p className="picker-hint">Address unavailable. You can still use this exact pin.</p>}{error && <p className="picker-error" role="alert">{error}</p>}</div></div><div className="picker-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="button" className="primary-button" disabled={!point || !!error || status === 'loading'} onClick={() => point && onChoose(point)}><Check size={17} />Use this location</button></div></div>
    <p id="picker-keyboard-help" className="picker-keyboard-help">Use arrow keys to pan and + / − to zoom, then choose “Use map center”.</p>
  </dialog>;
}
