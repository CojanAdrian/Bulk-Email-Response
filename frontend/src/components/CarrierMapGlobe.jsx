import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import statesTopology from 'us-atlas/states-10m.json';
import countriesTopology from 'world-atlas/countries-110m.json';

const TIER_COLOR = {
  perfect: '#15803d',
  strong: '#1d4ed8',
  weak: '#92600c',
  regional_perfect: '#15803d',
  regional: '#6b7280',
};
const DIMMED_COLOR = 'rgba(107,114,128,0.15)';
const HISTORY_COLOR = '#22d3ee';
const CURRENT_LANE_COLOR = '#d7ff3d';

// Country + US-state outlines (from the topojson-client/world-atlas/us-atlas
// ecosystem -- real Census/Natural-Earth-derived data, not a photographic
// texture), converted to GeoJSON once at module load and tagged with a
// `_kind` so one polygon layer can style the two differently (country fill
// + a faint border, state borders drawn on top with no fill of their own).
const COUNTRY_FEATURES = feature(countriesTopology, countriesTopology.objects.countries).features.map((f) => ({ ...f, _kind: 'country' }));
const STATE_FEATURES = feature(statesTopology, statesTopology.objects.states).features.map((f) => ({ ...f, _kind: 'state' }));
const MAP_POLYGONS = [...COUNTRY_FEATURES, ...STATE_FEATURES];

const OCEAN_MATERIAL = new THREE.MeshPhongMaterial({ color: '#050a14', shininess: 0 });

function midpoint(lat1, lng1, lat2, lng2) {
  return { lat: (lat1 + lat2) / 2, lng: (lng1 + lng2) / 2 };
}

// Wraps react-globe.gl, translating match data (see carrierMatching.js on
// the backend) into the arcs/points that library expects. Styled as a flat,
// muted map (dark ocean + faint country fill/borders + brighter state
// borders) rather than a photographic satellite texture -- closer to a
// clean "trucking ops" map look than an actual photo of the earth.
//
// The camera eases toward whatever's relevant: the searched/focused lane on
// load (a wider view), then in tighter on a selected carrier's own lane
// when one is picked from the list -- with a gentle idle auto-rotate the
// rest of the time, paused while either of those transitions is active.
function CarrierMapGlobe({ focusedLoad, laneMatches, regionalMatches, onSelectCarrier, selectedCarrierId, selectedCarrierHistory }) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 500 });

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: Math.max(400, entry.contentRect.height) });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const arcsData = [];
  if (focusedLoad) {
    arcsData.push({
      isFocusedLoad: true,
      startLat: focusedLoad.originLat,
      startLng: focusedLoad.originLng,
      endLat: focusedLoad.destLat,
      endLng: focusedLoad.destLng,
    });
  }
  laneMatches.forEach((match) => {
    arcsData.push({
      isFocusedLoad: false,
      isHistory: false,
      carrierId: match.carrierId,
      tier: match.tier,
      startLat: match.originLat,
      startLng: match.originLng,
      endLat: match.destLat,
      endLng: match.destLng,
    });
  });
  (selectedCarrierHistory || []).forEach((entry) => {
    if (entry.origin_lat === null || entry.origin_lat === undefined || entry.dest_lat === null || entry.dest_lat === undefined) return;
    arcsData.push({
      isFocusedLoad: false,
      isHistory: true,
      carrierId: selectedCarrierId,
      startLat: Number(entry.origin_lat),
      startLng: Number(entry.origin_lng),
      endLat: Number(entry.dest_lat),
      endLng: Number(entry.dest_lng),
    });
  });

  const pointsData = [];
  regionalMatches.forEach((match) => {
    (match.stateCentroids || []).forEach((centroid) => {
      pointsData.push({
        carrierId: match.carrierId,
        tier: match.tier,
        lat: centroid.lat,
        lng: centroid.lng,
        label: `${match.carrierName} — ${centroid.state}`,
      });
    });
  });

  // Idle ambient rotation -- switched off while a directed camera move
  // (focused lane / selected carrier) is in flight, back on once neither
  // is set (see the two effects below).
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = !focusedLoad && !selectedCarrierId;
    controls.autoRotateSpeed = 0.35;
  }, [focusedLoad, selectedCarrierId]);

  // Ease toward the searched/focused lane first (a wider establishing view).
  useEffect(() => {
    if (!focusedLoad || !globeRef.current) return;
    const mid = midpoint(focusedLoad.originLat, focusedLoad.originLng, focusedLoad.destLat, focusedLoad.destLng);
    globeRef.current.pointOfView({ ...mid, altitude: 0.9 }, 1800);
  }, [focusedLoad?.originLat, focusedLoad?.originLng, focusedLoad?.destLat, focusedLoad?.destLng]);

  // Then zoom in tight on a selected carrier's own lane (their current
  // match if they have one, else their most recent history entry).
  useEffect(() => {
    if (!selectedCarrierId || !globeRef.current) return;
    const currentArc = arcsData.find((a) => a.carrierId === selectedCarrierId && !a.isHistory);
    const historyArc = arcsData.find((a) => a.carrierId === selectedCarrierId && a.isHistory);
    const target = currentArc || historyArc;
    if (!target) return;
    const mid = midpoint(target.startLat, target.startLng, target.endLat, target.endLng);
    globeRef.current.pointOfView({ ...mid, altitude: 0.35 }, 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCarrierId, selectedCarrierHistory]);

  function arcColor(d) {
    if (d.isFocusedLoad) return CURRENT_LANE_COLOR;
    if (d.isHistory) return HISTORY_COLOR;
    if (selectedCarrierId && d.carrierId !== selectedCarrierId) return DIMMED_COLOR;
    if (selectedCarrierId && d.carrierId === selectedCarrierId) return CURRENT_LANE_COLOR;
    return TIER_COLOR[d.tier] || '#6b7280';
  }

  function pointColor(d) {
    if (selectedCarrierId && d.carrierId !== selectedCarrierId) return DIMMED_COLOR;
    if (selectedCarrierId && d.carrierId === selectedCarrierId) return CURRENT_LANE_COLOR;
    return TIER_COLOR[d.tier] || '#6b7280';
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={OCEAN_MATERIAL}
        showAtmosphere
        atmosphereColor="#d7ff3d"
        atmosphereAltitude={0.18}
        polygonsData={MAP_POLYGONS}
        polygonCapColor={(d) => (d._kind === 'country' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0)')}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={(d) => (d._kind === 'country' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.32)')}
        polygonAltitude={(d) => (d._kind === 'country' ? 0.001 : 0.0016)}
        polygonLabel={(d) => d.properties.name}
        arcsData={arcsData}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcColor={arcColor}
        arcStroke={(d) => (d.isFocusedLoad ? 1 : d.isHistory ? 0.7 : selectedCarrierId === d.carrierId ? 0.8 : 0.5)}
        arcDashLength={(d) => (d.isFocusedLoad ? 0.4 : 0.6)}
        arcDashGap={(d) => (d.isFocusedLoad ? 0.15 : 0.3)}
        arcDashAnimateTime={(d) => (d.isFocusedLoad || d.isHistory ? 1800 : 0)}
        onArcClick={(arc) => {
          if (!arc.isFocusedLoad && !arc.isHistory && onSelectCarrier) onSelectCarrier(arc.carrierId);
        }}
        pointsData={pointsData}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={pointColor}
        pointRadius={0.6}
        pointLabel={(d) => d.label}
        onPointClick={(point) => {
          if (onSelectCarrier) onSelectCarrier(point.carrierId);
        }}
      />
    </div>
  );
}

export default CarrierMapGlobe;
