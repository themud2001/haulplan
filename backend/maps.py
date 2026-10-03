"""Free public map services, with bounded requests and per-instance caches."""
import bisect
import math
import requests
import hashlib
from concurrent.futures import ThreadPoolExecutor
from django.core.cache import cache

METERS_PER_MILE = 1609.344
HEADERS = {'User-Agent': 'HaulplanAssessment/1.0 (educational route planner)', 'Accept': 'application/json'}


class MapServiceError(Exception):
    pass


def get_json(url, params=None):
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=(5, 25))
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise MapServiceError('The map service is temporarily unavailable. Please try again shortly.') from exc


def search_places(query):
    key = 'place:' + hashlib.sha256(query.casefold().encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    data = get_json('https://photon.komoot.io/api/', {'q': query, 'limit': 10,
                    'bbox': '-125,24,-66,50', 'lang': 'en'})
    places = []
    seen = set()
    for feature in data.get('features', []):
        prop = feature['properties']
        lon, lat = feature['geometry']['coordinates']
        if prop.get('countrycode', '').upper() != 'US' or not (24 <= lat <= 50 and -125 <= lon <= -66):
            continue
        parts = [prop.get('name'), prop.get('city'), prop.get('state')]
        label = ', '.join(dict.fromkeys(p for p in parts if p))
        if label and label not in seen:
            places.append({'label': label, 'lat': lat, 'lon': lon})
            seen.add(label)
    cache.set(key, places, 86400)
    return places


def get_route(locations):
    coordinates = ';'.join(f"{p['lon']:.6f},{p['lat']:.6f}" for p in locations)
    key = 'route:' + coordinates
    cached = cache.get(key)
    if cached:
        return cached
    data = get_json('https://router.project-osrm.org/route/v1/driving/' + coordinates,
                    {'overview': 'full', 'geometries': 'geojson', 'steps': 'true'})
    if data.get('code') != 'Ok' or not data.get('routes'):
        raise MapServiceError('No connected road route was found between these locations.')
    route = data['routes'][0]
    if any(w.get('distance', 0) > 10000 for w in data.get('waypoints', [])):
        raise MapServiceError('A location is too far from a routable road. Choose a nearby city or street.')
    legs = []
    directions = []
    for index, leg in enumerate(route['legs']):
        miles = leg['distance'] / METERS_PER_MILE
        minutes = math.ceil(max(leg['duration'] / 60, miles / 55 * 60))
        legs.append({'from': locations[index], 'to': locations[index + 1],
                     'distance_miles': miles, 'duration_minutes': minutes})
        for step in leg['steps']:
            maneuver = step['maneuver']
            kind = maneuver['type'].replace(' ', ' ').capitalize()
            modifier = maneuver.get('modifier', '').replace(' ', ' ')
            name = step.get('name') or step.get('ref') or 'the road'
            instruction = f"{kind} {modifier} onto {name}".replace('  ', ' ')
            if maneuver['type'] == 'depart':
                instruction = f"Depart {locations[index]['label']} on {name}"
            elif maneuver['type'] == 'arrive':
                instruction = f"Arrive at {locations[index + 1]['label']}"
            directions.append({'instruction': instruction, 'miles': round(step['distance'] / METERS_PER_MILE, 2),
                               'leg': index, 'coordinate': maneuver['location']})
    result = {'legs': legs, 'geometry': route['geometry'], 'directions': directions,
              'provider': 'OSRM / OpenStreetMap', 'locations': locations}
    cache.set(key, result, 3600)
    return result


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    value = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 3958.7613 * 2 * math.asin(min(1, math.sqrt(value)))


def locate_events(route, events):
    coords = route['geometry']['coordinates']
    lengths = [0.0]
    for a, b in zip(coords, coords[1:]):
        lengths.append(lengths[-1] + haversine(a, b))
    total_miles = sum(leg['distance_miles'] for leg in route['legs'])

    def at(mile):
        if not coords:
            return [route['locations'][0]['lon'], route['locations'][0]['lat']]
        value = mile / total_miles * lengths[-1] if total_miles else 0
        i = max(1, min(len(coords) - 1, bisect.bisect_left(lengths, value)))
        if len(coords) == 1:
            return coords[0]
        span = lengths[i] - lengths[i - 1]
        fraction = (value - lengths[i - 1]) / span if span else 0
        return [coords[i - 1][n] + fraction * (coords[i][n] - coords[i - 1][n]) for n in (0, 1)]

    for event in events:
        event['coordinate'] = at(event['mile_start'])
        event['end_coordinate'] = at(event['mile_end'])
        event['start_location'] = (route['locations'][0]['label'] if event['mile_start'] < 0.01 else
                                   route['locations'][1]['label'] if abs(event['mile_start'] - route['legs'][0]['distance_miles']) < 0.01 else
                                   route['locations'][2]['label'] if abs(event['mile_start'] - total_miles) < 0.01 else
                                   f"Route mile {event['mile_start']:.1f} ({event['coordinate'][1]:.3f}, {event['coordinate'][0]:.3f})")
        if event['kind'] == 'drive':
            if event['location'].startswith('Route mile'):
                event['location'] = f"Route mile {event['mile_end']:.1f} ({event['end_coordinate'][1]:.3f}, {event['end_coordinate'][0]:.3f})"
        else:
            event['location'] = event['start_location']

    # Label stop points with the nearest mapped town/state for log remarks. These
    # remain proposed positions, not verified commercial parking/fuel facilities.
    unknown = {tuple(round(c, 4) for c in e['coordinate']) for e in events if e['start_location'].startswith('Route mile')}

    def reverse(coordinate):
        key = f'reverse-town:{coordinate[0]}:{coordinate[1]}'
        cached = cache.get(key)
        if cached is not None:
            return coordinate, cached
        label = None
        try:
            response = requests.get('https://photon.komoot.io/reverse', params={
                'lon': coordinate[0], 'lat': coordinate[1], 'limit': 1, 'lang': 'en',
                'layer': ['city', 'locality'], 'radius': 50},
                headers=HEADERS, timeout=(2, 4))
            response.raise_for_status()
            features = response.json().get('features', [])
            if features:
                prop = features[0]['properties']
                town = prop.get('city') or prop.get('district') or prop.get('name')
                state = prop.get('state')
                if town and state:
                    label = f"Near {town}, {state}"
        except (requests.RequestException, ValueError):
            pass
        if label:
            cache.set(key, label, 86400)
        return coordinate, label

    with ThreadPoolExecutor(max_workers=8) as executor:
        names = dict(executor.map(reverse, list(unknown)[:48]))
    for event in events:
        name = names.get(tuple(round(c, 4) for c in event['coordinate']))
        if name:
            event['start_location'] = name + f" · mile {event['mile_start']:.1f}"
            if event['kind'] != 'drive':
                event['location'] = event['start_location']
        end_name = names.get(tuple(round(c, 4) for c in event['end_coordinate']))
        if event['kind'] == 'drive' and end_name:
            event['location'] = end_name + f" · mile {event['mile_end']:.1f}"
