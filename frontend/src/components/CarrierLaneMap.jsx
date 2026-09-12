import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const CURRENT_LANE_COLOR = '#d7ff3d';
const HISTORY_COLOR = '#22d3ee';
const CONTINENTAL_US_CENTER = { lat: 39.5, lng: -98.35 };
const TIER_COLOR = {
  perfect: '#15803d',
  strong: '#1d4ed8',
  weak: '#92600c',
  regional_perfect: '#15803d',
  regional: '#6b7280',
};

let configured = false;
let librariesPromise = null;

// Loads the real Google Maps JavaScript API (satellite/hybrid imagery,
// actual roads) plus the Routes library (DirectionsService/Renderer) --
// replacing the earlier custom WebGL globe with the genuine Google Maps
// product, per direct request. Cached at module scope so repeated mounts
// (e.g. switching tabs) don't re-trigger the script load.
function loadMapsLibraries() {
  if (!librariesPromise) {
    if (!configured) {
      setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', v: 'weekly' });
      configured = true;
    }
    librariesPromise = Promise.all([importLibrary('maps'), importLibrary('routes')]).then(([mapsLib, routesLib]) => ({
      Map: mapsLib.Map,
      DirectionsService: routesLib.DirectionsService,
      DirectionsRenderer: routesLib.DirectionsRenderer,
    }));
  }
  return librariesPromise;
}

function toLatLng(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
}

// Real driving directions between origin/dest, rendered with a
// DirectionsRenderer in the given color. Returns the route's
// distance/duration text (for the on-map summary) or null on failure.
async function drawRoute({ directionsService, map, color, origin, destination }) {
  const result = await directionsService.route({ origin, destination, travelMode: 'DRIVING' });
  const renderer = new google.maps.DirectionsRenderer({
    map,
    directions: result,
    suppressMarkers: false,
    preserveViewport: true,
    polylineOptions: { strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 },
  });
  const leg = result.routes?.[0]?.legs?.[0];
  return { renderer, distanceText: leg?.distance?.text ?? null, durationText: leg?.duration?.text ?? null };
}

// Real Google Maps in satellite/hybrid view with actual driving routes
// (DirectionsService/Renderer) drawn for the currently searched/focused
// lane and, when a carrier is selected, their lane history -- in place of
// the earlier custom 3D-globe visualization. Same props interface as the
// component it replaces so CarrierMapPage barely had to change.
function CarrierLaneMap({ focusedLoad, laneMatches, regionalMatches, onSelectCarrier, selectedCarrierId, selectedCarrierHistory }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const currentRenderersRef = useRef([]);
  const historyRenderersRef = useRef([]);
  const matchMarkersRef = useRef([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'missing-key'
  const [routeInfo, setRouteInfo] = useState({ current: null, history: [] });

  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      setStatus('missing-key');
      return;
    }
    let cancelled = false;
    loadMapsLibraries()
      .then(({ Map, DirectionsService }) => {
        if (cancelled || !containerRef.current) return;
        mapObjRef.current = new Map(containerRef.current, {
          center: CONTINENTAL_US_CENTER,
          zoom: 4,
          mapTypeId: 'hybrid',
          tilt: 45,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        directionsServiceRef.current = new DirectionsService();
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function clearRenderers(ref) {
    ref.current.forEach((renderer) => renderer.setMap(null));
    ref.current = [];
  }

  function clearMarkers() {
    matchMarkersRef.current.forEach((marker) => marker.setMap(null));
    matchMarkersRef.current = [];
  }

  // The current searched/focused lane -- real driving route in lime.
  useEffect(() => {
    if (status !== 'ready' || !focusedLoad) return;
    const origin = toLatLng(focusedLoad.originLat, focusedLoad.originLng);
    const destination = toLatLng(focusedLoad.destLat, focusedLoad.destLng);
    if (!origin || !destination) return;
    let cancelled = false;
    clearRenderers(currentRenderersRef);
    drawRoute({ directionsService: directionsServiceRef.current, map: mapObjRef.current, color: CURRENT_LANE_COLOR, origin, destination })
      .then(({ renderer, distanceText, durationText }) => {
        if (cancelled) {
          renderer.setMap(null);
          return;
        }
        currentRenderersRef.current.push(renderer);
        setRouteInfo((prev) => ({ ...prev, current: { distanceText, durationText } }));
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(destination);
        mapObjRef.current.fitBounds(bounds, 80);
      })
      .catch(() => {
        if (!cancelled) setRouteInfo((prev) => ({ ...prev, current: null }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, focusedLoad?.originLat, focusedLoad?.originLng, focusedLoad?.destLat, focusedLoad?.destLng]);

  // A selected carrier's own lane history -- real driving routes in cyan.
  useEffect(() => {
    if (status !== 'ready') return;
    clearRenderers(historyRenderersRef);
    setRouteInfo((prev) => ({ ...prev, history: [] }));
    if (!selectedCarrierId || !selectedCarrierHistory || selectedCarrierHistory.length === 0) return;
    let cancelled = false;
    const bounds = new google.maps.LatLngBounds();
    if (focusedLoad) {
      const o = toLatLng(focusedLoad.originLat, focusedLoad.originLng);
      const d = toLatLng(focusedLoad.destLat, focusedLoad.destLng);
      if (o) bounds.extend(o);
      if (d) bounds.extend(d);
    }
    Promise.all(
      selectedCarrierHistory.map((entry) => {
        const origin = toLatLng(entry.origin_lat, entry.origin_lng);
        const destination = toLatLng(entry.dest_lat, entry.dest_lng);
        if (!origin || !destination) return null;
        bounds.extend(origin);
        bounds.extend(destination);
        return drawRoute({ directionsService: directionsServiceRef.current, map: mapObjRef.current, color: HISTORY_COLOR, origin, destination });
      })
    ).then((results) => {
      if (cancelled) {
        results.forEach((r) => r && r.renderer.setMap(null));
        return;
      }
      const valid = results.filter(Boolean);
      historyRenderersRef.current = valid.map((r) => r.renderer);
      setRouteInfo((prev) => ({ ...prev, history: valid.map((r) => ({ distanceText: r.distanceText, durationText: r.durationText })) }));
      if (!bounds.isEmpty()) mapObjRef.current.fitBounds(bounds, 80);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, selectedCarrierId, selectedCarrierHistory]);

  // Simple pins for the rest of the match list -- a full driving route for
  // every unselected match would mean a billed Directions request per row
  // just for browsing the list, so those just get a marker at their origin
  // (where that carrier's own matched lane starts, not a point on your
  // current route). Drawn as a small colored dot, not the default red
  // teardrop pin -- otherwise it's indistinguishable from the current
  // lane's own A/B route endpoints and reads as a mystery stop on the way.
  useEffect(() => {
    if (status !== 'ready') return;
    clearMarkers();
    const allMatches = [...laneMatches, ...(regionalMatches || [])];
    allMatches.forEach((match) => {
      if (selectedCarrierId === match.carrierId) return;
      const origin = toLatLng(match.originLat, match.originLng) || (match.stateCentroids?.[0] ? toLatLng(match.stateCentroids[0].lat, match.stateCentroids[0].lng) : null);
      if (!origin) return;
      const marker = new google.maps.Marker({
        position: origin,
        map: mapObjRef.current,
        title: `${match.carrierName} (matched carrier)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: TIER_COLOR[match.tier] || '#6b7280',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      });
      marker.addListener('click', () => onSelectCarrier && onSelectCarrier(match.carrierId));
      matchMarkersRef.current.push(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, laneMatches, regionalMatches, selectedCarrierId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {status === 'missing-key' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05060a] p-6 text-center">
          <p className="max-w-sm text-sm text-white/60">
            Set <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/80">VITE_GOOGLE_MAPS_API_KEY</code> to a browser-restricted Google Maps
            API key (Maps JavaScript API + Directions API enabled) to show the live map here.
          </p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05060a] p-6 text-center">
          <p className="max-w-sm text-sm text-error">Failed to load Google Maps.</p>
        </div>
      )}
      {(routeInfo.current || routeInfo.history.length > 0) && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-xs text-white backdrop-blur-xl">
          {routeInfo.current && (
            <span className="mr-4 inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CURRENT_LANE_COLOR }} />
              Current: {routeInfo.current.distanceText} · {routeInfo.current.durationText}
            </span>
          )}
          {routeInfo.history.map((entry, i) => (
            <span key={i} className="mr-4 inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HISTORY_COLOR }} />
              History: {entry.distanceText} · {entry.durationText}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default CarrierLaneMap;
