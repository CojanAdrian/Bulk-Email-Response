import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';
import statesTopology from 'us-atlas/states-10m.json';
import worldTopology from 'world-atlas/countries-110m.json';

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

// A single unified world landmass silhouette (not per-country borders) --
// genlogs' own map reads as plain land/ocean, not a country atlas, and it
// sidesteps the jagged/degenerate edges 110m-resolution country polygons
// can produce around the Arctic. US state borders (from us-atlas, much
// higher resolution) carry all the actually-relevant detail for a US
// trucking map. Converted to GeoJSON once at module load -- static data.
const LAND_FEATURES = feature(worldTopology, worldTopology.objects.land).features.map((f) => ({ ...f, _kind: 'land' }));
const STATE_FEATURES = feature(statesTopology, statesTopology.objects.states).features.map((f) => ({ ...f, _kind: 'state' }));
const MAP_POLYGONS = [...LAND_FEATURES, ...STATE_FEATURES];

// Always-on state name labels (not just an on-hover tooltip) -- position
// is each state polygon's true geometric centroid, computed from the same
// real boundary data rather than a hand-picked point.
const STATE_LABELS = STATE_FEATURES.map((f) => {
  const [lng, lat] = geoCentroid(f);
  return { lat, lng, text: f.properties.name };
});

const OCEAN_MATERIAL = new THREE.MeshPhongMaterial({ color: '#050a14', shininess: 0 });

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function midpoint(lat1, lng1, lat2, lng2) {
  return { lat: (lat1 + lat2) / 2, lng: (lng1 + lng2) / 2 };
}

// Great-circle angular distance in degrees, used to size how far the
// camera should pull back so a lane's two endpoints both stay in frame --
// a 50-mile lane and a 2,000-mile lane need very different zoom levels.
function angularDistanceDeg(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * (180 / Math.PI);
}

// Wraps react-globe.gl, translating match data (see carrierMatching.js on
// the backend) into the arcs/points that library expects. Styled as a flat,
// muted map (dark ocean + a plain land silhouette + bright state borders +
// state name labels) rather than a photographic satellite texture.
//
// The camera eases toward whatever's relevant: the searched/focused lane on
// load (a wider establishing view), then in tighter on a selected carrier's
// own lane when one is picked from the list -- both sized to the lane's
// actual length so a short in-state lane doesn't get an absurdly tight
// zoom. A gentle idle auto-rotate runs the rest of the time, paused while
// either of those transitions is active.
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

  // Ease toward the searched/focused lane first (a wider establishing view,
  // sized to the lane's own length so a short in-state hop and a coast-to-
  // coast lane don't get the same zoom level).
  useEffect(() => {
    if (!focusedLoad || !globeRef.current) return;
    const mid = midpoint(focusedLoad.originLat, focusedLoad.originLng, focusedLoad.destLat, focusedLoad.destLng);
    const span = angularDistanceDeg(focusedLoad.originLat, focusedLoad.originLng, focusedLoad.destLat, focusedLoad.destLng);
    const altitude = Math.min(1.8, Math.max(0.6, span / 12));
    globeRef.current.pointOfView({ ...mid, altitude }, 1800);
  }, [focusedLoad?.originLat, focusedLoad?.originLng, focusedLoad?.destLat, focusedLoad?.destLng]);

  // Then zoom in on a selected carrier's own lane (their current match if
  // they have one, else their most recent history entry) -- still framed
  // by the lane's actual length, just tighter than the establishing view.
  useEffect(() => {
    if (!selectedCarrierId || !globeRef.current) return;
    const currentArc = arcsData.find((a) => a.carrierId === selectedCarrierId && !a.isHistory);
    const historyArc = arcsData.find((a) => a.carrierId === selectedCarrierId && a.isHistory);
    const target = currentArc || historyArc;
    if (!target) return;
    const mid = midpoint(target.startLat, target.startLng, target.endLat, target.endLng);
    const span = angularDistanceDeg(target.startLat, target.startLng, target.endLat, target.endLng);
    const altitude = Math.min(1.2, Math.max(0.55, span / 10));
    globeRef.current.pointOfView({ ...mid, altitude }, 1800);
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

  // Small, distinct altitudes per arc kind -- otherwise two short,
  // geographically close lanes (e.g. the current search + a carrier's
  // history, both within one state) sit at nearly the same auto-computed
  // altitude and visually fuse into a single blob instead of two readable
  // curves.
  function arcAltitude(d) {
    if (d.isFocusedLoad) return 0.18;
    if (d.isHistory) return 0.12;
    return 0.06;
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
        polygonCapColor={(d) => (d._kind === 'land' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0)')}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={(d) => (d._kind === 'land' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)')}
        polygonAltitude={(d) => (d._kind === 'land' ? 0.001 : 0.0016)}
        polygonLabel={(d) => d.properties?.name}
        labelsData={STATE_LABELS}
        labelLat={(d) => d.lat}
        labelLng={(d) => d.lng}
        labelText={(d) => d.text}
        labelSize={0.55}
        labelColor={() => 'rgba(255,255,255,0.55)'}
        labelDotRadius={0}
        labelResolution={2}
        labelAltitude={0.002}
        arcsData={arcsData}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcColor={arcColor}
        arcAltitude={arcAltitude}
        arcStroke={(d) => (d.isFocusedLoad ? 0.5 : d.isHistory ? 0.4 : selectedCarrierId === d.carrierId ? 0.45 : 0.3)}
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
