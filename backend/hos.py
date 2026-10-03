"""Deterministic property-carrier planner. All arithmetic uses elapsed minutes.

The initial duty/drive clocks are fresh after a qualifying 10-hour rest. Historical
cycle hours cannot be aged out without daily history, so we choose a 34-hour restart
when the cycle is exhausted. 30-minute non-driving work also resets the break clock.
"""
from datetime import datetime, timedelta
import math

EPS = 1e-7


def schedule(legs, cycle_used, departure):
    now = 0.0
    shift_start = None
    drive_shift = 0.0
    drive_break = 0.0
    cycle = float(cycle_used) * 60
    mileage = 0.0
    since_fuel = 0.0
    events = []

    def add(status, kind, minutes, location, miles=0.0):
        nonlocal now, drive_shift, drive_break, cycle, mileage, since_fuel, shift_start
        if minutes <= EPS:
            return
        start = now
        events.append({
            'id': len(events), 'status': status, 'kind': kind,
            'start_min': start, 'end_min': start + minutes,
            'start': (departure + timedelta(minutes=start)).isoformat(timespec='seconds'),
            'end': (departure + timedelta(minutes=start + minutes)).isoformat(timespec='seconds'),
            'duration_minutes': round(minutes, 6), 'miles': round(miles, 6),
            'mile_start': mileage, 'mile_end': mileage + miles, 'location': location,
        })
        now += minutes
        if status in ('driving', 'on_duty'):
            if shift_start is None:
                shift_start = start
            cycle += minutes
        if status == 'driving':
            drive_shift += minutes
            drive_break += minutes
            mileage += miles
            since_fuel += miles
        elif minutes >= 30 - EPS:
            drive_break = 0.0
        if status in ('off_duty', 'sleeper') and minutes >= 600 - EPS:
            shift_start = None
            drive_shift = drive_break = 0.0
            if minutes >= 2040 - EPS:
                cycle = 0.0

    def prepare(location):
        nonlocal shift_start
        if cycle >= 4200 - EPS:
            add('off_duty', 'restart', 2040, location)
        elif shift_start is not None and (drive_shift >= 660 - EPS or now - shift_start >= 840 - EPS):
            add('sleeper', 'rest', 600, location)
        if shift_start is None:
            add('on_duty', 'inspection', 15, location)

    prepare(legs[0]['from']['label'])
    for index, leg in enumerate(legs):
        miles = leg['distance_miles']
        minutes = leg['duration_minutes']
        speed = miles / minutes if minutes > EPS else 0.0
        remaining = minutes
        while remaining > EPS:
            location = f"Route mile {mileage:.1f}"
            prepare(location)
            # A fuel stop and a load/unload can satisfy the 30-minute interruption.
            if since_fuel >= 1000 - EPS:
                add('on_duty', 'fuel', 30, location)
                since_fuel = 0.0
                continue
            if drive_break >= 480 - EPS:
                add('off_duty', 'break', 30, location)
                continue
            permitted = min(remaining, 660 - drive_shift, 480 - drive_break,
                            840 - (now - shift_start), 4200 - cycle)
            if speed > EPS:
                permitted = min(permitted, (1000 - since_fuel) / speed)
            if permitted <= EPS:
                # Inspection or fueling can consume the final available cycle minutes.
                prepare(location)
                continue
            is_end = remaining - permitted <= EPS
            add('driving', 'drive', permitted,
                leg['to']['label'] if is_end else location, permitted * speed)
            remaining -= permitted
            if len(events) > 3000:
                raise ValueError('This route is too long to plan.')
        # Non-driving work is legal past the 14/70 limits; no unnecessary rest at delivery.
        add('on_duty', 'pickup' if index == 0 else 'dropoff', 60, leg['to']['label'])
    return events, {
        'total_miles': round(mileage, 1),
        'driving_hours': round(sum(e['duration_minutes'] for e in events if e['status'] == 'driving') / 60, 2),
        'on_duty_hours': round(sum(e['duration_minutes'] for e in events if e['status'] in ('driving', 'on_duty')) / 60, 2),
        'elapsed_hours': round(now / 60, 2),
        'arrival': events[-1]['end'],
        'cycle_remaining_hours': round(max(0, 4200 - cycle) / 60, 2),
        'fuel_stops': sum(e['kind'] == 'fuel' for e in events),
        'rest_stops': sum(e['kind'] in ('rest', 'break', 'restart') for e in events),
        'restarts': sum(e['kind'] == 'restart' for e in events),
    }


def daily_logs(events, departure):
    """Split at home-terminal midnight and pad each displayed day to 24 hours."""
    midnight = departure.replace(hour=0, minute=0, second=0, microsecond=0)
    offset = (departure - midnight).total_seconds() / 60
    end = offset + events[-1]['end_min']
    days = max(1, math.ceil((end - EPS) / 1440))
    logs = []
    for day in range(days):
        low, high = day * 1440, (day + 1) * 1440
        segments = []
        remarks = []
        miles = 0.0
        cursor = low
        for event in events:
            start = offset + event['start_min']
            finish = offset + event['end_min']
            a, b = max(low, start), min(high, finish)
            if b - a <= EPS:
                continue
            if a > cursor + EPS:
                segments.append({'status': 'off_duty', 'start_min': cursor - low, 'end_min': a - low})
            segments.append({'status': event['status'], 'start_min': a - low, 'end_min': b - low})
            miles += event['miles'] * (b - a) / (finish - start)
            if low <= start < high:
                remarks.append({'minute': start - low, 'kind': event['kind'],
                                'location': event.get('start_location', event['location']), 'status': event['status']})
            elif a == low:
                remarks.append({'minute': 0, 'kind': event['kind'],
                                'location': event.get('start_location', event['location']), 'status': event['status'], 'continued': True})
            cursor = b
        if cursor < high - EPS:
            segments.append({'status': 'off_duty', 'start_min': cursor - low, 'end_min': 1440})
            remarks.append({'minute': cursor - low, 'kind': 'off_duty',
                            'status': 'off_duty', 'location': events[-1]['location']})
        totals = {key: round(sum(s['end_min'] - s['start_min'] for s in segments if s['status'] == key) / 60, 6)
                  for key in ('off_duty', 'sleeper', 'driving', 'on_duty')}
        logs.append({'date': (midnight + timedelta(days=day)).date().isoformat(),
                     'segments': segments, 'totals': totals, 'miles': round(miles, 1), 'remarks': remarks})
    return logs
