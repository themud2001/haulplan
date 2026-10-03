import json
import math
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from .hos import schedule, daily_logs
from .maps import search_places, get_route, locate_events, MapServiceError


@require_GET
def health(request):
    return JsonResponse({'status': 'ok', 'framework': 'Django', 'version': '1.0.0'})


@require_GET
def geocode(request):
    query = request.GET.get('q', '').strip()
    if not 3 <= len(query) <= 200:
        return JsonResponse({'error': 'Enter a US city or address with 3–200 characters.'}, status=400)
    try:
        return JsonResponse({'places': search_places(query)})
    except MapServiceError as exc:
        return JsonResponse({'error': str(exc)}, status=502)


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('The request must contain a JSON object.')
    locations = []
    for key in ('current', 'pickup', 'dropoff'):
        place = data.get(key)
        if not isinstance(place, dict) or not isinstance(place.get('label'), str) or not 1 <= len(place['label']) <= 250:
            raise ValueError(f'Choose a valid {key} location.')
        try:
            lat, lon = float(place['lat']), float(place['lon'])
        except (ValueError, TypeError, KeyError):
            raise ValueError(f'Choose a valid {key} location.')
        if not (math.isfinite(lat) and math.isfinite(lon) and 24 <= lat <= 50 and -125 <= lon <= -66):
            raise ValueError('This assessment supports routes within the contiguous United States.')
        locations.append({'label': place['label'], 'lat': lat, 'lon': lon})
    try:
        value = data['cycle_used']
        if isinstance(value, bool) or value == '':
            raise ValueError()
        cycle = float(value)
    except (KeyError, ValueError, TypeError):
        raise ValueError('Current cycle used must be a number between 0 and 70 hours.')
    if not math.isfinite(cycle) or not 0 <= cycle <= 70:
        raise ValueError('Current cycle used must be between 0 and 70 hours.')
    try:
        departure = datetime.fromisoformat(data['departure'])
    except (KeyError, ValueError, TypeError):
        raise ValueError('Enter a valid departure date and time.')
    if departure.tzinfo is not None:
        raise ValueError('Use local home-terminal time without a timezone offset.')
    if not 2000 <= departure.year <= 2100:
        raise ValueError('Departure year must be between 2000 and 2100.')
    return locations, cycle, departure.replace(second=0, microsecond=0)


@require_POST
def plan(request):
    try:
        if len(request.body) > 32768:
            raise ValueError('The request is too large.')
        data = json.loads(request.body)
        locations, cycle, departure = validate(data)
        route = get_route(locations)
        if sum(leg['distance_miles'] for leg in route['legs']) > 15000:
            raise ValueError('Please choose a route shorter than 15,000 miles.')
        events, summary = schedule(route['legs'], cycle, departure)
        locate_events(route, events)
        logs = daily_logs(events, departure)
        return JsonResponse({'route': route, 'events': events, 'summary': summary, 'logs': logs,
                             'departure': departure.isoformat(), 'cycle_used': cycle,
                             'assumptions': [
                                 'Property carrier, 70 hours / 8 days; no adverse-condition or split-sleeper exceptions.',
                                 'Fresh driving shift after 10 hours off duty; full fuel tank at departure.',
                                 'Driving time uses the slower of OSRM travel time and a 55 mph average.',
                                 '15-minute inspection per shift; 1 hour each for pickup and drop-off; 30-minute fuel stops.',
                                 'Cycle history is unknown: no recaptured hours are assumed; 34-hour restarts are scheduled as needed.',
                                 'All logs use a fixed home-terminal time basis; daylight-saving transitions are not modeled.',
                                 'Rest and fuel pins are planning points on the route, not verified truck parking or fuel facilities.',
                                 'OSRM uses a car road profile; truck size, weight, hazmat and road restrictions need separate verification.',
                                 'Logs are planned estimates. Route-mile coordinates identify stops; actual town and state remarks must be verified.',
                             ]})
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'Send a valid JSON request.'}, status=400)
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    except MapServiceError as exc:
        return JsonResponse({'error': str(exc)}, status=502)
