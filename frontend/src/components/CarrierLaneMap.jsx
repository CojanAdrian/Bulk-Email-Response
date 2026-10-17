import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsLibrary, hasGoogleMapsKey, onGoogleAuthFailure, googleKeyHint } from '../lib/googleMapsLoader';
import { createRouteDrawer } from '../lib/mapRoutes';

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

// Loads the real Google Maps JavaScript API (satellite/hybrid imagery,
// actual roads) plus the Routes library (DirectionsService/Renderer) --
// replacing the earlier custom WebGL globe with the genuine Google Maps
// product, per direct request.
function loadMapsLibraries() {
  return Promise.all([loadGoogleMapsLibrary('maps'), loadGoogleMapsLibrary('routes')]).then(([mapsLib, routesLib]) => ({
    Map: mapsLib.Map,
    routesLib,
  }));
}

const LOAD_TIMEOUT_MS = 15000;

// What each Google refusal code means for whoever manages the key.
function explainGoogleError(code) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'this site';
  switch (code) {
    case 'RefererNotAllowedMapError':
      return `This site's address isn't in the key's allowed websites. In Google Cloud Console > Credentials > the key > Website restrictions, add ${origin}/*`;
    case 'ApiNotActivatedMapError':
      return "Maps JavaScript API isn't enabled on the key's project.";
    case 'ApiTargetBlockedMapError':
      return "The key's API restrictions don't allow the Maps JavaScript API. Add it (and Places / Routes) under the key's API restrictions.";
    case 'BillingNotEnabledMapError':
      return "Billing isn't enabled on the key's Google Cloud project.";
    case 'InvalidKeyMapError':
      return 'Google says this key does not exist -- the key in this build is not the one in your Google Cloud project.';
    case 'ExpiredKeyMapError':
      return 'This key has expired. Create a new one and redeploy with it.';
    case 'DeletedApiProjectMapError':
      return "The key's Google Cloud project was deleted.";
    default:
      return 'Make sure the key\'s project has billing on, Maps JavaScript API enabled, and this site in its allowed websites.';
  }
}

function toLatLng(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
}

// Real Google Maps in satellite/hybrid view with actual driving routes
// (DirectionsService/Renderer) drawn for the currently searched/focused
// lane and, when a carrier is selected, their lane history -- in place of
// the earlier custom 3D-globe visualization. Same props interface as the
// component it replaces so CarrierMapPage barely had to change.
function CarrierLaneMap({ focusedLoad, laneMatches, regionalMatches, onSelectCarrier, selectedCarrierId, selectedCarrierHistory }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const drawRouteRef = useRef(null);
  const currentRenderersRef = useRef([]);
  const historyRenderersRef = useRef([]);
  const matchMarkersRef = useRef([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'missing-key' | 'auth-failed' | 'timeout'
  const [errorCode, setErrorCode] = useState(null);
  const [routeInfo, setRouteInfo] = useState({ current: null, history: [] });

  useEffect(() => {
    if (!hasGoogleMapsKey()) {
      setStatus('missing-key');
      return;
    }
    let cancelled = false;
    const stopListening = onGoogleAuthFailure((code) => {
      if (cancelled) return;
      setStatus('auth-failed');
      setErrorCode(code || null);
    });
    // Google's script being blocked (ad/privacy blocker, firewall) or never
    // answering used to leave a silent black box; say so instead.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setStatus((prev) => (prev === 'loading' ? 'timeout' : prev));
    }, LOAD_TIMEOUT_MS);
    loadMapsLibraries()
      .then(({ Map, routesLib }) => {
        if (cancelled || !containerRef.current) return;
        mapObjRef.current = new Map(containerRef.current, {
          center: CONTINENTAL_US_CENTER,
          zoom: 4,
          mapTypeId: 'hybrid',
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        drawRouteRef.current = createRouteDrawer(routesLib);
        setStatus((prev) => (prev === 'auth-failed' ? prev : 'ready'));
        clearTimeout(timeoutId);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      stopListening();
      clearTimeout(timeoutId);
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
    if (status !== 'ready') return;
    // Cleared unconditionally, before the early returns below -- otherwise
    // clearing the search (focusedLoad -> null) left the previous route
    // drawn on the map forever, since nothing ever told its renderer to go.
    clearRenderers(currentRenderersRef);
    setRouteInfo((prev) => ({ ...prev, current: null }));
    if (!focusedLoad) return;
    const origin = toLatLng(focusedLoad.originLat, focusedLoad.originLng);
    const destination = toLatLng(focusedLoad.destLat, focusedLoad.destLng);
    if (!origin || !destination) return;
    let cancelled = false;
    drawRouteRef.current({ map: mapObjRef.current, color: CURRENT_LANE_COLOR, origin, destination })
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
        return drawRouteRef.current({ map: mapObjRef.current, color: HISTORY_COLOR, origin, destination });
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
            API key (Maps JavaScript API, Places API (New) and Routes API enabled) to show the live map here.
          </p>
        </div>
      )}
      {(status === 'error' || status === 'timeout' || status === 'auth-failed') && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-[#05060a] p-6 text-center">
          <div className="max-w-md space-y-2 text-sm text-white/70">
            {status === 'auth-failed' && (
              <>
                <p className="font-semibold text-white">Google refused to load the map{errorCode ? ` (${errorCode})` : ''}.</p>
                <p>{explainGoogleError(errorCode)}</p>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="font-semibold text-white">Couldn&apos;t download Google Maps.</p>
                <p>Something blocked maps.googleapis.com -- usually an ad or privacy blocker, a VPN, or a company firewall. Allow it for this site and reload.</p>
              </>
            )}
            {status === 'timeout' && (
              <>
                <p className="font-semibold text-white">Google Maps didn&apos;t respond.</p>
                <p>The map script never finished loading. A browser extension or network filter blocking maps.googleapis.com is the usual cause -- try a private window or another network, then reload.</p>
              </>
            )}
            {googleKeyHint() && <p className="text-xs text-white/40">Key in this build ends in …{googleKeyHint()}</p>}
          </div>
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
