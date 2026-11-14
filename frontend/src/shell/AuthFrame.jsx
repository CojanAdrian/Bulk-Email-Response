import { useEffect } from 'react';
import UsMap from '../map/UsMap';
import { setLanes, setFocus, setInsets, ripple } from '../map/mapStore';
import Brand from './Brand';

// A few long-haul lanes so the map is alive behind the sign-in card.
const LANES = [
  { id: 1, from: [-87.63, 41.88], to: [-96.8, 32.78], fromLabel: 'Chicago', toLabel: 'Dallas' },
  { id: 2, from: [-118.24, 34.05], to: [-112.07, 33.45], fromLabel: 'Los Angeles', toLabel: 'Phoenix' },
  { id: 3, from: [-84.39, 33.75], to: [-80.84, 35.23], fromLabel: 'Atlanta', toLabel: 'Charlotte' },
  { id: 4, from: [-122.33, 47.61], to: [-111.89, 40.76], fromLabel: 'Seattle', toLabel: 'Salt Lake City' },
  { id: 5, from: [-95.37, 29.76], to: [-90.05, 35.15], fromLabel: 'Houston', toLabel: 'Memphis' },
  { id: 6, from: [-80.19, 25.76], to: [-74.17, 40.74], fromLabel: 'Miami', toLabel: 'Newark' },
  { id: 7, from: [-104.99, 39.74], to: [-94.58, 39.1], fromLabel: 'Denver', toLabel: 'Kansas City' },
];
const CYCLE_MS = 3200;

// The frame for signing in and signing up: the map with lanes lighting up
// one after another, and the form on top.
function AuthFrame({ children }) {
  useEffect(() => {
    setLanes(LANES);
    setInsets({ left: 0, right: 0 });
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return () => setLanes([]);
    let index = 0;
    setFocus(LANES[0].id);
    const timer = setInterval(() => {
      index = (index + 1) % LANES.length;
      setFocus(LANES[index].id);
      ripple(LANES[index].from);
    }, CYCLE_MS);
    return () => {
      clearInterval(timer);
      setLanes([]);
      setFocus(null);
    };
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-shell-bg px-4 text-text">
      <div className="opacity-60">
        <UsMap />
      </div>
      <div className="grain" aria-hidden="true" />
      <div className="fixed left-4 top-6 z-10 sm:left-9">
        <Brand />
      </div>
      <div className="mat relative z-10 w-full max-w-[400px] rounded-[30px] p-7 motion-safe:animate-[rise-in_1.1s_var(--spring)_both]">{children}</div>
    </div>
  );
}

export default AuthFrame;
