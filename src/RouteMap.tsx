import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Place, Plan, TripEvent } from './types';
import { eventNames, formatDate, formatDuration, formatTime } from './types';

export default function RouteMap({ plan, places, selected, onSelect }: {
  plan: Plan | null; places: Place[]; selected: number | null; onSelect: (id: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<number, L.Marker>>(new Map());
  useEffect(() => {
    if (!container.current) return;
    map.current = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView([38.3, -95.6], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const observer = new ResizeObserver(() => map.current?.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    const addMarker = (coordinate: [number, number], text: string, css: string, label: string, event?: TripEvent) => {
      const marker = L.marker([coordinate[1], coordinate[0]], { icon: L.divIcon({
        className: 'map-pin-wrap', html: `<span class="map-pin ${css}">${text}</span>`, iconSize: [30, 30], iconAnchor: [15, 15],
      }) }).addTo(layer.current!);
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = label;
      content.appendChild(title);
      if (event) {
        const detail = document.createElement('div');
        detail.textContent = `${formatDate(event.start)} · ${formatTime(event.start)} · ${formatDuration(event.duration_minutes)}`;
        const location = document.createElement('div');
        location.textContent = event.location;
        content.append(detail, location);
        marker.on('click', () => onSelect(event.id));
        markers.current.set(event.id, marker);
      }
      marker.bindPopup(content);
    };
    const locations = plan ? plan.route.locations : places;
    if (plan) {
      const polyline = L.polyline(plan.route.geometry.coordinates.map(c => [c[1], c[0]] as [number, number]), {
        color: '#527257', weight: 5, opacity: 0.95,
      }).addTo(layer.current);
      const empty = L.polyline(plan.route.geometry.coordinates.map(c => [c[1], c[0]] as [number, number]), {
        color: '#fff', weight: 1, opacity: 0.4, dashArray: '2 10',
      }).addTo(layer.current);
      empty.bringToFront();
      plan.events.filter(e => ['fuel', 'rest', 'restart', 'break'].includes(e.kind)).forEach(e =>
        addMarker(e.coordinate, e.kind === 'fuel' ? 'F' : e.kind === 'break' ? 'B' : 'R',
          e.kind === 'fuel' ? 'fuel' : 'rest', eventNames[e.kind], e));
      if (polyline.getBounds().isValid()) map.current.fitBounds(polyline.getBounds(), { padding: [45, 45], maxZoom: 10 });
    }
    locations.forEach((p, i) => addMarker([p.lon, p.lat], String.fromCharCode(65 + i), `point point-${i}`, p.label));
    if (!plan && locations.length) map.current.fitBounds(L.latLngBounds(locations.map(p => [p.lat, p.lon])), { padding: [60, 70], maxZoom: 7 });
  }, [plan, places, onSelect]);

  useEffect(() => {
    if (selected === null) return;
    const marker = markers.current.get(selected);
    if (marker) { marker.openPopup(); map.current?.panTo(marker.getLatLng()); }
  }, [selected]);
  return <div className="route-map" ref={container} aria-label="Interactive route map with pickup, delivery, fuel and rest stops" />;
}
