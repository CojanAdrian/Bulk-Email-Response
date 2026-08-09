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
  stagger: 0.04,
  tap: { scale: 0.97 },
};

export function useMotionPreset() {
  const reduced = useReducedMotion();
  return reduced ? REDUCED_PRESET : FULL_PRESET;
}
