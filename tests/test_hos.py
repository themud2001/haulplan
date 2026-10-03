import os
import unittest
from datetime import datetime
from unittest.mock import patch
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.test import Client
from backend.hos import schedule, daily_logs


def legs(a=110, b=110, speed=55):
    return [{'from': {'label': 'A'}, 'to': {'label': 'B'}, 'distance_miles': a, 'duration_minutes': a / speed * 60},
            {'from': {'label': 'B'}, 'to': {'label': 'C'}, 'distance_miles': b, 'duration_minutes': b / speed * 60}]


class HoursOfServiceTests(unittest.TestCase):
    departure = datetime(2026, 10, 3, 6)

    def assert_legal(self, events, initial_cycle):
        # Independent replay of the generated duty stream, including inspection/work.
        cycle = initial_cycle * 60
        drive = since_break = 0.0
        shift = None
        miles_since_fuel = 0.0
        prior_end = 0.0
        for event in events:
            self.assertAlmostEqual(event['start_min'], prior_end, places=5)
            self.assertGreater(event['duration_minutes'], 0)
            prior_end = event['end_min']
            duration = event['end_min'] - event['start_min']
            if event['status'] in ('on_duty', 'driving') and shift is None:
                shift = event['start_min']
            if event['status'] == 'driving':
                drive += duration
                since_break += duration
                self.assertLessEqual(drive, 660 + 0.0001)
                self.assertLessEqual(since_break, 480 + 0.0001)
                self.assertLessEqual(event['end_min'] - shift, 840 + 0.0001)
                self.assertLessEqual(cycle + duration, 4200 + 0.0001)
                miles_since_fuel += event['miles']
                self.assertLessEqual(miles_since_fuel, 1000.0001)
            elif duration >= 30 - 0.0001:
                since_break = 0
            if event['status'] in ('on_duty', 'driving'):
                cycle += duration
            if event['kind'] == 'fuel':
                self.assertEqual(event['status'], 'on_duty')
                miles_since_fuel = 0
            if event['status'] in ('off_duty', 'sleeper') and duration >= 600 - 0.0001:
                drive = since_break = 0
                shift = None
                if duration >= 2040 - 0.0001:
                    cycle = 0

    def test_short_trip_exact_work_and_distance(self):
        events, summary = schedule(legs(), 0, self.departure)
        self.assertEqual(summary['total_miles'], 220)
        self.assertEqual(summary['driving_hours'], 4)
        self.assertEqual(summary['elapsed_hours'], 6.25)
        self.assertEqual(summary['rest_stops'], 0)
        self.assertEqual([e['duration_minutes'] for e in events if e['kind'] in ('pickup', 'dropoff')], [60, 60])
        self.assert_legal(events, 0)

    def test_eight_hours_requires_break_before_more_driving(self):
        events, _ = schedule(legs(550, 0), 0, self.departure)
        first_drive = next(e for e in events if e['kind'] == 'drive')
        self.assertEqual(first_drive['duration_minutes'], 480)
        self.assertEqual(events[events.index(first_drive) + 1]['kind'], 'break')
        self.assert_legal(events, 0)

    def test_pickup_satisfies_driving_break(self):
        events, _ = schedule(legs(440, 110), 0, self.departure)
        self.assertFalse(any(e['kind'] == 'break' for e in events))
        self.assert_legal(events, 0)

    def test_fueling_every_thousand_miles_across_pickup(self):
        events, summary = schedule(legs(450, 1800), 0, self.departure)
        self.assertEqual(summary['fuel_stops'], 2)
        fuel = [e['mile_start'] for e in events if e['kind'] == 'fuel']
        self.assertAlmostEqual(fuel[0], 1000)
        self.assertAlmostEqual(fuel[1], 2000)
        self.assert_legal(events, 0)

    def test_cycle_seventy_restarts_before_driving(self):
        events, _ = schedule(legs(), 70, self.departure)
        self.assertEqual(events[0]['kind'], 'restart')
        self.assertEqual(events[0]['duration_minutes'], 2040)
        self.assert_legal(events, 70)

    def test_partial_cycle_and_inspection_boundary(self):
        for cycle in [69, 69.74, 69.75, 69.99]:
            with self.subTest(cycle=cycle):
                events, _ = schedule(legs(), cycle, self.departure)
                self.assert_legal(events, cycle)
                self.assertTrue(any(e['kind'] == 'restart' for e in events))

    def test_delivery_work_can_finish_beyond_cycle(self):
        events, _ = schedule(legs(55, 55), 66.75, self.departure)
        self.assertEqual(events[-1]['kind'], 'dropoff')
        self.assertFalse(any(e['kind'] == 'restart' for e in events))
        self.assert_legal(events, 66.75)

    def test_daily_window_and_midnight_splits(self):
        depart = datetime(2026, 10, 3, 22, 45)
        events, _ = schedule(legs(1800, 2200), 58, depart)
        logs = daily_logs(events, depart)
        self.assertGreater(len(logs), 4)
        for log in logs:
            self.assertAlmostEqual(sum(log['totals'].values()), 24, places=5)
            self.assertEqual(log['segments'][0]['start_min'], 0)
            self.assertEqual(log['segments'][-1]['end_min'], 1440)
            for first, second in zip(log['segments'], log['segments'][1:]):
                self.assertAlmostEqual(first['end_min'], second['start_min'])
        self.assertAlmostEqual(sum(l['miles'] for l in logs), 4000, delta=len(logs) * 0.05)
        self.assert_legal(events, 58)

    def test_no_extra_sheet_when_delivery_ends_at_midnight(self):
        depart = datetime(2026, 10, 3, 17, 45)
        events, _ = schedule(legs(), 0, depart)
        logs = daily_logs(events, depart)
        self.assertEqual(len(logs), 1)

    def test_zero_distance_and_very_long_trip(self):
        for a, b, cycle in [(0, 0, 0), (0, 100, 68), (7000, 7000, 65)]:
            events, summary = schedule(legs(a, b), cycle, self.departure)
            self.assertEqual(summary['total_miles'], a + b)
            self.assert_legal(events, cycle)


class ApiValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = Client()
        self.data = {'current': {'label': 'Atlanta', 'lat': 33.749, 'lon': -84.388},
                     'pickup': {'label': 'Nashville', 'lat': 36.1627, 'lon': -86.7816},
                     'dropoff': {'label': 'Chicago', 'lat': 41.8781, 'lon': -87.6298},
                     'cycle_used': 24, 'departure': '2026-10-03T06:00'}

    def test_health_and_method_validation(self):
        self.assertEqual(self.client.get('/api/health').json()['framework'], 'Django')
        self.assertEqual(self.client.get('/api/plan').status_code, 405)

    def test_invalid_values_rejected_before_map_request(self):
        for value in [-1, 70.01, 'NaN', 'Infinity', True, None, '']:
            with self.subTest(value=value), patch('backend.views.get_route') as upstream:
                self.data['cycle_used'] = value
                response = self.client.post('/api/plan', self.data, content_type='application/json')
                self.assertEqual(response.status_code, 400)
                upstream.assert_not_called()

    def test_malformed_and_outside_us(self):
        self.assertEqual(self.client.post('/api/plan', data='[1]', content_type='application/json').status_code, 400)
        self.data['current']['lat'] = 0
        self.assertEqual(self.client.post('/api/plan', self.data, content_type='application/json').status_code, 400)

    def test_upstream_failure_is_actionable(self):
        from backend.maps import MapServiceError
        with patch('backend.views.get_route', side_effect=MapServiceError('Try again shortly.')):
            response = self.client.post('/api/plan', self.data, content_type='application/json')
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['error'], 'Try again shortly.')


if __name__ == '__main__':
    unittest.main()
