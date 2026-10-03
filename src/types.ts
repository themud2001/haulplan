export type Place = { label: string; lat: number; lon: number };
export type Status = 'off_duty' | 'sleeper' | 'driving' | 'on_duty';
export type TripEvent = {
  id: number; status: Status; kind: string; start: string; end: string;
  start_min: number; end_min: number; duration_minutes: number;
  miles: number; mile_start: number; mile_end: number; location: string;
  coordinate: [number, number]; end_coordinate: [number, number]; start_location: string;
};
export type DailyLog = {
  date: string; miles: number; totals: Record<Status, number>;
  segments: { status: Status; start_min: number; end_min: number }[];
  remarks: { minute: number; kind: string; status: Status; location: string; continued?: boolean }[];
};
export type Plan = {
  departure: string; cycle_used: number;
  route: {
    locations: Place[]; geometry: { type: string; coordinates: [number, number][] };
    legs: { from: Place; to: Place; distance_miles: number; duration_minutes: number }[];
    directions: { instruction: string; miles: number; leg: number; coordinate: [number, number] }[];
    provider: string;
  };
  events: TripEvent[]; logs: DailyLog[]; assumptions: string[];
  summary: {
    total_miles: number; driving_hours: number; elapsed_hours: number; arrival: string;
    fuel_stops: number; rest_stops: number; restarts: number;
    on_duty_hours: number; cycle_remaining_hours: number;
  };
};
export const eventNames: Record<string, string> = {
  off_duty: 'Off duty',
  drive: 'Driving', inspection: 'Pre-trip inspection', pickup: 'Pick up cargo', dropoff: 'Deliver cargo',
  fuel: 'Fuel stop', break: '30-minute break', rest: '10-hour rest', restart: '34-hour cycle restart',
};
export const formatDuration = (minutes: number) => {
  const value = Math.round(minutes);
  return `${Math.floor(value / 60) ? `${Math.floor(value / 60)}h ` : ''}${value % 60 ? `${value % 60}m` : ''}`.trim() || '0m';
};
export const formatTime = (iso: string) => iso.slice(11, 16);
export const formatDate = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
