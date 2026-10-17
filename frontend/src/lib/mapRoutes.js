// Draws one driving route on a Google map, behind one interface:
//   draw({ map, color, origin, destination }) ->
//     Promise<{ renderer: { setMap(map|null) }, distanceText, durationText }>
//
// Prefers the current Routes API (google.maps.routes.Route.computeRoutes).
// Google deprecated DirectionsService and stopped offering the legacy
// Directions API to new projects, so on a recent key it can fail outright.
// Falls back to DirectionsService for older projects, and if neither works
// draws a straight geodesic line so the lane is still visible instead of
// an empty map.

function textOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.text || null;
}

function group(items) {
  return {
    setMap(map) {
      items.forEach((item) => item && item.setMap(map));
    },
  };
}

function endpointMarkers(map, origin, destination, color) {
  const g = window.google?.maps;
  if (!g || typeof g.Marker !== 'function') return [];
  return [origin, destination].map(
    (position, i) =>
      new g.Marker({
        position,
        map,
        label: { text: i === 0 ? 'A' : 'B', color: '#0a0a0a', fontWeight: '700', fontSize: '11px' },
        icon: { path: g.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#0a0a0a', strokeWeight: 1.5 },
      })
  );
}

async function drawWithRoutesApi(Route, { map, color, origin, destination }) {
  const { routes } = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    fields: ['path', 'distanceMeters', 'durationMillis', 'localizedValues'],
  });
  const route = routes && routes[0];
  if (!route) throw new Error('No route found');
  const polylines = route.createPolylines();
  polylines.forEach((polyline) => {
    polyline.setOptions({ strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 });
    polyline.setMap(map);
  });
  const markers = endpointMarkers(map, origin, destination, color);
  return {
    renderer: group([...polylines, ...markers]),
    distanceText: textOf(route.localizedValues?.distance),
    durationText: textOf(route.localizedValues?.duration),
  };
}

async function drawWithDirections(directionsService, { map, color, origin, destination }) {
  const result = await directionsService.route({ origin, destination, travelMode: 'DRIVING' });
  const renderer = new window.google.maps.DirectionsRenderer({
    map,
    directions: result,
    suppressMarkers: false,
    preserveViewport: true,
    polylineOptions: { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 },
  });
  const leg = result.routes?.[0]?.legs?.[0];
  return { renderer, distanceText: leg?.distance?.text ?? null, durationText: leg?.duration?.text ?? null };
}

function drawStraightLine({ map, color, origin, destination }) {
  const g = window.google.maps;
  const line = new g.Polyline({
    path: [origin, destination],
    geodesic: true,
    strokeColor: color,
    strokeOpacity: 0.85,
    strokeWeight: 3,
    map,
  });
  return { renderer: group([line, ...endpointMarkers(map, origin, destination, color)]), distanceText: null, durationText: null };
}

export function createRouteDrawer(routesLib) {
  const Route = routesLib && routesLib.Route && typeof routesLib.Route.computeRoutes === 'function' ? routesLib.Route : null;
  const directionsService = routesLib && typeof routesLib.DirectionsService === 'function' ? new routesLib.DirectionsService() : null;
  let routesApiBroken = false;

  return async function draw(request) {
    if (Route && !routesApiBroken) {
      try {
        return await drawWithRoutesApi(Route, request);
      } catch (err) {
        // A lane with no drivable route isn't the API being unavailable.
        if (err && err.message !== 'No route found') routesApiBroken = true;
        console.warn('Routes API failed; falling back to DirectionsService.', err);
      }
    }
    if (directionsService) {
      try {
        return await drawWithDirections(directionsService, request);
      } catch (err) {
        console.warn('DirectionsService failed; drawing a straight line instead.', err);
      }
    }
    return drawStraightLine(request);
  };
}
