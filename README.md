# Haulplan

A full-stack trip planner built with **Django 5.2, React, TypeScript and Leaflet**. Enter a current location, pickup, drop-off and current cycle hours to generate a real road route, a duty schedule, and printable daily log sheets.

**Live app:** [haulplan.vercel.app](https://haulplan.vercel.app)

## Features

- Free Photon location search, OSRM route geometry and turn-by-turn instructions, and OpenStreetMap map tiles.
- Both current → pickup and pickup → drop-off legs, with geographic fuel/rest/break pins.
- Property-carrier scheduling: 11-hour driving limit, 14-hour window, 30-minute interruption after 8 cumulative driving hours, 10-hour daily rest, and conservative 70-hour cycle accounting with 34-hour restarts.
- Fueling at least every 1,000 miles, 1 hour each for loading/unloading, and 15-minute pre-trip inspections.
- Midnight-split 24-hour log graphs, four duty statuses, totals, daily mileage, and duty-change remarks.
- Optional carrier/driver/vehicle/shipping information; print every daily sheet or save them as PDF using the browser print dialog.
- JSON trip export, keyboard-accessible location suggestions, loading/error states, responsive mobile layout, and reduced-motion support.

## Run locally

Requires **Node 24** and **Python 3.12+**.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

In another terminal:

```sh
npm run dev
```

Open the Vite URL (normally http://127.0.0.1:5173). Vite proxies `/api` requests to Django. No map keys or database are needed.

## Verify

```sh
npm run build
.venv/bin/python manage.py check
.venv/bin/python -m unittest discover -s tests -v
```

The tests independently replay schedules to check driving windows, breaks, cycle limits, fuel intervals, zero-distance trips, long routes, exact-midnight endings, 24-hour totals and API validation.

## Vercel deployment

Import this repository into Vercel. Use the **Vite** framework preset, repository root, `npm run build`, and `dist` output. `vercel.json` routes `/api/*` to the Django WSGI function in `api/index.py`; Vercel installs the pinned Python dependencies from `requirements.txt`.

The API is stateless, with no accounts, sessions or durable database. Per-instance in-memory caching limits repeat map requests. Set `DJANGO_SECRET_KEY` if extending the app with authentication, sessions or signing. No secret is required for the stateless calculation API.

### API

- `GET /api/health` — deployment health and backend framework.
- `GET /api/geocode?q=Atlanta,Georgia` — contiguous-US location candidates.
- `POST /api/plan` — locations as `{label,lat,lon}`, `cycle_used` (0–70), and `departure` (local ISO date/time).

## Accuracy and assumptions

The planner assumes a property-carrying driver on a 70-hour/8-day cycle, a fresh shift after 10 hours off duty, a full fuel tank, and no adverse-condition or split-sleeper exceptions. Loading/unloading and fueling count as on-duty time and can satisfy the required 30-minute interruption from driving.

Only a total cycle-hours value is supplied, so the previous seven days cannot be reconstructed. The planner does **not** invent recaptured hours; it conservatively schedules a 34-hour restart when the available cycle is consumed. Non-driving work can finish beyond the 14/70-hour driving limits, as permitted by the rules. Driving resumes only after the appropriate reset.

Driving time uses the slower of OSRM’s road estimate and a 55 mph average. All log sheets use one fixed home-terminal time basis, even across geographical time zones. Daylight-saving transitions are not modeled.

**Routing limitations:** OSRM’s public service uses a car road profile, not a truck-restriction profile. Check vehicle dimensions, weight, hazmat restrictions and road suitability separately. Fuel and rest markers are interpolated planning positions along the real route, not verified truck stops or legal parking facilities. Photon reverse geocoding supplies the nearest town/state when available; route-mile coordinates remain as a fallback. These sheets are planned estimates, not certified ELD records. Actual duty activity and locations must be verified before signing.

Public map services may rate-limit requests or be unavailable. Failures are shown to the user; fabricated routes are never returned. For a production fleet workload, use hosted routing/geocoding with a truck profile and persistent shared caching/rate limiting.

## Structure

```text
src/                 React UI, map, location search and SVG log sheets
backend/hos.py       Pure scheduling and daily-log algorithms
backend/maps.py      Map services, caching and stop coordinates
backend/views.py     Django JSON endpoints and validation
api/index.py         Vercel WSGI entrypoint
tests/               Scheduler and API regression tests
vercel.json          Vite + Python deployment configuration
```

## References

- [FMCSA Hours of Service summary](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)
- Attached April 2022 Interstate Truck Driver’s Guide to Hours of Service and blank daily log reference.
- [OSRM API](https://project-osrm.org/docs/v5.24.0/api/)
- [Photon](https://github.com/komoot/photon)
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)
