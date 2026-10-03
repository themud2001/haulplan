import os
import unittest
from unittest.mock import patch

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.core.cache import cache
from django.test import Client
from backend.maps import MapServiceError, reverse_place


class MapPickerTests(unittest.TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()

    def test_address_lookup_preserves_exact_pin_even_when_cached(self):
        nearby = {'features': [{'geometry': {'coordinates': [-84.39, 33.75]},
                   'properties': {'countrycode': 'US', 'housenumber': '42',
                                  'street': 'Peachtree Street', 'city': 'Atlanta', 'state': 'Georgia'}}]}
        with patch('backend.maps.get_json', return_value=nearby) as upstream:
            first = reverse_place(33.749001, -84.388001)
            second = reverse_place(33.749002, -84.388002)
        self.assertEqual(first['label'], '42 Peachtree Street, Atlanta, Georgia')
        self.assertEqual((first['lat'], first['lon']), (33.749001, -84.388001))
        self.assertEqual((second['lat'], second['lon']), (33.749002, -84.388002))
        self.assertEqual(upstream.call_count, 1)

    def test_invalid_coordinates_do_not_call_upstream(self):
        for query in ['lat=NaN&lon=-84', 'lat=33&lon=Infinity', 'lat=0&lon=0', 'lat=33', 'lat=bad&lon=-84']:
            with self.subTest(query=query), patch('backend.views.reverse_place') as upstream:
                self.assertEqual(self.client.get('/api/reverse-geocode?' + query).status_code, 400)
                upstream.assert_not_called()
        self.assertEqual(self.client.post('/api/reverse-geocode').status_code, 405)

    def test_foreign_address_rejected_and_empty_result_keeps_pin(self):
        with patch('backend.maps.get_json', return_value={'features': [{'properties': {'countrycode': 'CA'}}]}):
            self.assertEqual(self.client.get('/api/reverse-geocode?lat=49&lon=-100').status_code, 400)
        with patch('backend.maps.get_json', return_value={'features': []}):
            response = self.client.get('/api/reverse-geocode?lat=33.749001&lon=-84.388001')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['place']['label'].startswith('Pinned location'))
        self.assertEqual(response.json()['place']['lon'], -84.388001)

    def test_lookup_outage_has_a_distinct_service_error(self):
        with patch('backend.views.reverse_place', side_effect=MapServiceError('Try again shortly.')):
            response = self.client.get('/api/reverse-geocode?lat=33&lon=-84')
        self.assertEqual(response.status_code, 502)


if __name__ == '__main__':
    unittest.main()
