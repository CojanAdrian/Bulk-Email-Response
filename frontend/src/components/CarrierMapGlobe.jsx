import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

const TIER_COLOR = {
  perfect: '#15803d',
  strong: '#1d4ed8',
  weak: '#92600c',
  regional_perfect: '#15803d',
  regional: '#6b7280',
};

// Wraps react-globe.gl, translating match data (see carrierMatching.js on
// the backend) into the arcs/points that library expects. No globeImageUrl
// is set -- per the library's own documented fallback ("If no image is
// provided, the globe is represented as a black sphere"), omitting it
// avoids depending on an external texture URL while still looking
// intentional (a dark sphere + colored atmosphere glow), rather than
// guessing at a CDN link.
function CarrierMapGlobe({ focusedLoad, laneMatches, regionalMatches, onSelectCarrier }) {
  const containerRef = useRef(null);
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
      carrierId: match.carrierId,
      tier: match.tier,
      startLat: match.originLat,
      startLng: match.originLng,
      endLat: match.destLat,
      endLng: match.destLng,
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

  return (
    <div ref={containerRef} className="h-full w-full">
      <Globe
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="#d7ff3d"
        atmosphereAltitude={0.18}
        arcsData={arcsData}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcColor={(d) => (d.isFocusedLoad ? '#d7ff3d' : TIER_COLOR[d.tier] || '#6b7280')}
        arcStroke={(d) => (d.isFocusedLoad ? 1 : 0.5)}
        arcDashLength={(d) => (d.isFocusedLoad ? 0.4 : 0.6)}
        arcDashGap={(d) => (d.isFocusedLoad ? 0.15 : 0.3)}
        arcDashAnimateTime={(d) => (d.isFocusedLoad ? 1800 : 0)}
        onArcClick={(arc) => {
          if (!arc.isFocusedLoad && onSelectCarrier) onSelectCarrier(arc.carrierId);
        }}
        pointsData={pointsData}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={(d) => TIER_COLOR[d.tier] || '#6b7280'}
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
