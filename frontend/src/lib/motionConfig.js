import { useReducedMotion } from 'framer-motion';

const INSTANT_TRANSITION = { duration: 0.05 };

const REDUCED_PRESET = {
  reduced: true,
  popIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: INSTANT_TRANSITION },
    transition: INSTANT_TRANSITION,
  },
  modal: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: INSTANT_TRANSITION,
    },
    card: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: INSTANT_TRANSITION },
      transition: INSTANT_TRANSITION,
    },
  },
  crossfade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: INSTANT_TRANSITION,
  },
  banner: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: INSTANT_TRANSITION },
    transition: INSTANT_TRANSITION,
  },
  sheet: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: INSTANT_TRANSITION,
    },
    panel: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: INSTANT_TRANSITION },
      transition: INSTANT_TRANSITION,
    },
  },
  selectionPop: {
    initial: { scale: 1 },
    animate: { scale: 1 },
    transition: INSTANT_TRANSITION,
  },
  stagger: 0,
  tap: {},
};

const FULL_PRESET = {
  reduced: false,
  popIn: {
    initial: { opacity: 0, scale: 0.96, y: -8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  modal: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    },
    card: {
      initial: { opacity: 0, scale: 0.95, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } },
      transition: { type: 'spring', stiffness: 400, damping: 32 },
    },
  },
  crossfade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },
  // A bigger entrance than popIn -- this is reserved for the one alert that
  // needs to interrupt whatever the user is looking at (a new inquiry
  // coming in), so it drops in from off-screen with a springy overshoot
  // instead of the subtle fade/scale everything else uses.
  banner: {
    initial: { opacity: 0, y: -72, scale: 0.92 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -40, scale: 0.96, transition: { duration: 0.18 } },
    transition: { type: 'spring', stiffness: 320, damping: 22 },
  },
  // A modal variant that slides up from the bottom instead of popping in
  // centered (see `modal` above) -- for content that reads as a "drill
  // into detail" rather than a short, focused action (BottomSheet.jsx).
  sheet: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    },
    panel: {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%', transition: { duration: 0.2 } },
      transition: { type: 'spring', stiffness: 350, damping: 35 },
    },
  },
  // The checkmark circle's fill animation in selection mode -- a slight
  // overshoot (low damping relative to stiffness) so it reads as a native
  // iOS "pop," not a linear checkbox tick.
  selectionPop: {
    initial: { scale: 0 },
    animate: { scale: 1 },
    transition: { type: 'spring', stiffness: 500, damping: 22 },
  },
  stagger: 0.04,
  tap: { scale: 0.97 },
};

export function useMotionPreset() {
  const reduced = useReducedMotion();
  return reduced ? REDUCED_PRESET : FULL_PRESET;
}
