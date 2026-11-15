import { useEffect, useRef } from 'react';
import { geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { MAP_WIDTH, MAP_HEIGHT, pointOnLane } from './geo';
import { getState, useMapStore, RIPPLE_MS } from './mapStore';
import { US_STATE_NAMES } from '../lib/usStates';

const DOT_SPACING = 7.5;
const HOME = { x: MAP_WIDTH / 2, y: 300, k: 1 };
const WHITE = '255,255,255';
const GOLD = '240,196,98';
const RIPPLE_COLOUR = '255,150,90';
const RIPPLE_REACH = 420;
const LABEL_FAMILY = '"Inter Variable", Inter, sans-serif';
const LABEL_TRACKING = 0.8;
// Map units; small states get smaller codes so the Northeast does not pile up.
const labelSize = (area) => (area < 250 ? 7.5 : area < 1200 ? 9.5 : 12.5);
const ABBREVIATION = Object.fromEntries(Object.entries(US_STATE_NAMES).map(([code, name]) => [name, code]));

// Each state's two-letter code, in the middle of its largest piece (so
// Michigan's sits on the mitten, not in the lake), sized to the state.
function stateLabels(us, path) {
  const labels = [];
  for (const state of feature(us, us.objects.states).features) {
    const code = ABBREVIATION[state.properties.name];
    if (!code || code === 'DC') continue;
    const pieces = state.geometry.type === 'MultiPolygon' ? state.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates })) : [state.geometry];
    const largest = pieces.reduce((best, piece) => (path.area(piece) > path.area(best) ? piece : best));
    const [x, y] = path.centroid(largest);
    labels.push({ x, y, text: code, size: labelSize(path.area(largest)) });
  }
  return labels;
}

// The state shapes are heavy, so they load after first paint.
async function loadShapes() {
  const { default: us } = await import('us-atlas/states-albers-10m.json');
  const path = geoPath();
  const nation = new Path2D(path(feature(us, us.objects.nation)));
  const borders = new Path2D(path(mesh(us, us.objects.states, (a, b) => a !== b)));
  const probe = document.createElement('canvas').getContext('2d');
  const dots = [];
  for (let y = 8; y < MAP_HEIGHT; y += DOT_SPACING) {
    const stagger = (Math.round(y / DOT_SPACING) % 2) * (DOT_SPACING / 2);
    for (let x = stagger; x < MAP_WIDTH; x += DOT_SPACING) {
      if (probe.isPointInPath(nation, x, y)) dots.push([x, y]);
    }
  }
  return { nation, borders, dots, labels: stateLabels(us, path) };
}

function cameraFor(lane) {
  if (!lane) return HOME;
  const { A, B, C, length } = lane.geometry;
  return {
    x: C[0] * 0.4 + (A[0] + B[0]) * 0.3,
    y: C[1] * 0.4 + (A[1] + B[1]) * 0.3,
    // Short lanes zoom in; a coast-to-coast lane stays at full-map scale so
    // both ends remain in view.
    k: Math.max(1, Math.min(2.4, 430 / Math.max(length, 1))),
  };
}

// The United States as a dot field with the board's lanes drawn across it.
// It fits itself into the part of the window the store says is free.
function UsMap() {
  const canvasRef = useRef(null);
  const dimmed = useMapStore((s) => s.dimmed);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const camera = { ...HOME };
    const pointer = [0, 0];
    let shapes = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frameId = 0;
    let cancelled = false;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    function onPointerMove(event) {
      pointer[0] = event.clientX / width - 0.5;
      pointer[1] = event.clientY / height - 0.5;
    }

    // The land (dots, borders, state codes) only changes when the camera
    // moves, so it is drawn into its own canvas and reused frame after
    // frame; the lanes and their animations are drawn fresh on top.
    function drawStaticLand(c, k) {
      const size = 1.5 / Math.sqrt(k);
      c.fillStyle = `rgba(${WHITE},.11)`;
      c.beginPath();
      for (const [x, y] of shapes.dots) c.rect(x, y, size, size);
      c.fill();

      c.lineWidth = 0.7 / k;
      c.strokeStyle = `rgba(${WHITE},.09)`;
      c.stroke(shapes.borders);
      c.lineWidth = 1 / k;
      c.strokeStyle = `rgba(${WHITE},.2)`;
      c.stroke(shapes.nation);

      // Codes stay about the same size on screen as the camera zooms.
      const shrink = Math.pow(k, -0.75);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = `rgba(${WHITE},.46)`;
      if ('letterSpacing' in c) c.letterSpacing = `${LABEL_TRACKING * shrink}px`;
      let font = '';
      for (const label of shapes.labels) {
        const next = `700 ${(label.size * shrink).toFixed(2)}px ${LABEL_FAMILY}`;
        if (next !== font) c.font = font = next;
        c.fillText(label.text, label.x, label.y);
      }
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }

    function drawRipples(k, now, ripples) {
      const size = 1.5 / Math.sqrt(k);
      for (const wave of ripples) {
        const age = (now - wave.startedAt) / RIPPLE_MS;
        if (age < 0 || age > 1) continue;
        const radius = age * RIPPLE_REACH;
        ctx.fillStyle = `rgba(${RIPPLE_COLOUR},${0.9 * (1 - age)})`;
        ctx.beginPath();
        for (const [x, y] of shapes.dots) {
          if (Math.abs(Math.hypot(x - wave.x, y - wave.y) - radius) < 16) {
            ctx.rect(x - size * 0.4, y - size * 0.4, size * 1.8, size * 1.8);
          }
        }
        ctx.fill();
      }
    }

    // The stored land picture and what it was drawn for.
    const land = { canvas: document.createElement('canvas'), key: '' };

    function landFor(k, baseX, baseY) {
      const key = [k.toFixed(5), baseX.toFixed(2), baseY.toFixed(2), camera.x.toFixed(3), camera.y.toFixed(3), canvas.width, canvas.height].join('|');
      if (land.key === key) return land.canvas;
      const c = land.canvas.getContext('2d');
      if (land.canvas.width !== canvas.width || land.canvas.height !== canvas.height) {
        land.canvas.width = canvas.width;
        land.canvas.height = canvas.height;
      } else {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, land.canvas.width, land.canvas.height);
      }
      c.setTransform(dpr * k, 0, 0, dpr * k, dpr * (baseX - camera.x * k), dpr * (baseY - camera.y * k));
      drawStaticLand(c, k);
      land.key = key;
      return land.canvas;
    }

    // rest: how visible a lane is when nothing is focused. A full board
    // draws many lanes, so each one is fainter.
    function drawLane(lane, index, k, now, focusId, rest) {
      const { A, B, C } = lane.geometry;
      const focused = focusId === lane.id;
      const faded = focusId !== null && !focused;
      const colour = lane.gold || lane.star ? GOLD : WHITE;

      ctx.lineCap = 'round';
      ctx.lineWidth = (focused ? 1.6 : lane.star ? 1.4 : 1) / k;
      ctx.strokeStyle = `rgba(${colour},${faded ? Math.min(0.06, rest) : focused ? 0.4 : lane.star ? 0.55 : rest})`;
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.quadraticCurveTo(C[0], C[1], B[0], B[1]);
      ctx.stroke();

      // A starred carrier's lane always carries its light; others only when focused.
      if ((focused || (lane.star && !faded)) && !still) {
        const head = (now / 1500 + index * 0.31) % 1.4;
        ctx.shadowColor = `rgba(${colour},.9)`;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2.6 / k;
        ctx.strokeStyle = `rgb(${colour})`;
        ctx.beginPath();
        let started = false;
        for (let step = 0; step <= 14; step += 1) {
          const t = head - 0.28 + (step / 14) * 0.28;
          if (t < 0 || t > 1) continue;
          const [x, y] = pointOnLane(lane.geometry, t);
          if (started) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          started = true;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const eastbound = A[0] < B[0];
      for (const [point, label, isOrigin] of [[A, lane.fromLabel, true], [B, lane.toLabel, false]]) {
        ctx.fillStyle = `rgba(${colour},${faded ? 0.15 : focused ? 1 : Math.min(1, rest * 3.2)})`;
        ctx.beginPath();
        ctx.arc(point[0], point[1], (focused ? 3.4 : 2.2) / k, 0, Math.PI * 2);
        ctx.fill();
        if (!focused) continue;
        if (!still) {
          const phase = (now / 1400) % 1;
          ctx.strokeStyle = `rgba(${colour},${0.6 * (1 - phase)})`;
          ctx.lineWidth = 1 / k;
          ctx.beginPath();
          ctx.arc(point[0], point[1], (4 + phase * 18) / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (label) {
          const outward = isOrigin === eastbound ? -1 : 1;
          ctx.font = `600 ${12 / k}px "Inter Variable", Inter, sans-serif`;
          ctx.fillStyle = 'rgb(245,245,242)';
          ctx.textAlign = outward < 0 ? 'right' : 'left';
          ctx.fillText(String(label).toUpperCase(), point[0] + (outward * 9) / k, point[1] + 4 / k);
        }
      }

      if (focused && lane.miles) {
        const [x, y] = pointOnLane(lane.geometry, 0.5);
        ctx.font = `500 ${11 / k}px "Inter Variable", Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(245,245,242,.6)';
        ctx.fillText(`${lane.miles.toLocaleString()} mi`, x, y - 10 / k);
      }
    }

    function frame() {
      frameId = requestAnimationFrame(frame);
      if (document.hidden) return;
      const now = Date.now();
      const { lanes, focusId, ripples, insets } = getState();
      const target = cameraFor(lanes.find((lane) => lane.id === focusId));
      const ease = still ? 1 : 0.07;
      camera.x += (target.x - camera.x) * ease;
      camera.y += (target.y - camera.y) * ease;
      camera.k += (target.k - camera.k) * ease;
      // Close enough: settle exactly, so a still map is not redrawn.
      if (Math.abs(target.x - camera.x) < 0.02 && Math.abs(target.y - camera.y) < 0.02 && Math.abs(target.k - camera.k) < 0.0002) {
        camera.x = target.x;
        camera.y = target.y;
        camera.k = target.k;
      }

      const { left, right } = insets;
      const freeLeft = left;
      const freeRight = Math.max(freeLeft + 320, width - right);
      const fit = Math.min((freeRight - freeLeft) / MAP_WIDTH, (height - 210) / MAP_HEIGHT);
      const k = Math.max(fit, 0.2) * camera.k;
      const baseX = (freeLeft + freeRight) / 2;
      const baseY = height * 0.48;
      const driftX = still ? 0 : -pointer[0] * 14;
      const driftY = still ? 0 : -pointer[1] * 10;
      const anchorX = baseX + driftX;
      const anchorY = baseY + driftY;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(anchorX, anchorY, 0, anchorX, anchorY, width * 0.5);
      glow.addColorStop(0, `rgba(${WHITE},.035)`);
      glow.addColorStop(1, `rgba(${WHITE},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (anchorX - camera.x * k), dpr * (anchorY - camera.y * k));
      if (shapes) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(landFor(k, baseX, baseY), Math.round(driftX * dpr), Math.round(driftY * dpr));
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (anchorX - camera.x * k), dpr * (anchorY - camera.y * k));
        if (ripples.length) drawRipples(k, now, ripples);
      }
      const rest = Math.max(0.08, Math.min(0.3, 14 / Math.max(lanes.length, 1)));
      lanes.forEach((lane, index) => drawLane(lane, index, k, now, focusId, rest));
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove);
    loadShapes()
      .then((loaded) => {
        if (!cancelled) shapes = loaded;
      })
      .catch((err) => console.error('Map shapes failed to load:', err));
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 h-full w-full transition-opacity duration-700 ease-soft ${dimmed ? 'opacity-40' : 'opacity-100'}`}
    />
  );
}

export default UsMap;
