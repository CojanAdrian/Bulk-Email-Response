import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

const TIER_COLOR = {
  perfect: '#15803d',
  strong: '#1d4ed8',
  weak: '#92600c',
  regional_perfect: '#15803d',
  regional: '#6b7280',
};
const DIMMED_COLOR = 'rgba(107,114,128,0.15)';
const HIGHLIGHT_COLOR = '#ffffff';

// Wraps react-globe.gl, translating match data (see carrierMatching.js on
// the backend) into the arcs/points that library expects. No globeImageUrl
// is set -- per the library's own documented fallback ("If no image is
// provided, the globe is represented as a black sphere"), omitting it
// avoids depending on an external texture URL while still looking
// intentional (a dark sphere + colored atmosphere glow), rather than
// guessing at a CDN link.
//
// When a carrier is selected (selectedCarrierId), their historical lanes
// (selectedCarrierHistory, from carrier_lane_history) are drawn as bright
// white arcs alongside whatever match arc they already have, and every
// other carrier's arc/point is dimmed out -- the camera also eases toward
// the selected carrier's lanes so the highlight isn't lost on a full globe.
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

  // Ease the camera toward the selected carrier's lanes so a highlight on a
  // full globe of arcs is actually visible instead of lost at the current view.
  useEffect(() => {
    if (!selectedCarrierId || !globeRef.current) return;
    const relevant = arcsData.filter((a) => a.carrierId === selectedCarrierId);
    if (relevant.length === 0) return;
    const avgLat = relevant.reduce((sum, a) => sum + a.startLat, 0) / relevant.length;
    const avgLng = relevant.reduce((sum, a) => sum + a.startLng, 0) / relevant.length;
    globeRef.current.pointOfView({ lat: avgLat, lng: avgLng, altitude: 1.6 }, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCarrierId, selectedCarrierHistory]);

  function arcColor(d) {
    if (d.isFocusedLoad) return '#d7ff3d';
    if (d.isHistory) return HIGHLIGHT_COLOR;
    if (selectedCarrierId && d.carrierId !== selectedCarrierId) return DIMMED_COLOR;
    if (selectedCarrierId && d.carrierId === selectedCarrierId) return HIGHLIGHT_COLOR;
    return TIER_COLOR[d.tier] || '#6b7280';
  }

  function pointColor(d) {
    if (selectedCarrierId && d.carrierId !== selectedCarrierId) return DIMMED_COLOR;
    if (selectedCarrierId && d.carrierId === selectedCarrierId) return HIGHLIGHT_COLOR;
    return TIER_COLOR[d.tier] || '#6b7280';
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="#d7ff3d"
        atmosphereAltitude={0.2}
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
