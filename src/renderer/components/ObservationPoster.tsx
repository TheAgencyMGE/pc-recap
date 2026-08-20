import { motion, useReducedMotion } from 'framer-motion';
import type { Observation } from '../../shared/types';

export function ObservationPoster({ observation }: { observation: Observation }) {
  const reduceMotion = useReducedMotion();
  return <motion.article className="observation-poster" style={{ '--poster-accent': observation.accent } as React.CSSProperties}
    initial={reduceMotion ? false : { opacity: 0, y: 18, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: reduceMotion ? 0 : .38 }}>
    <span>{observation.eyebrow}</span>
    <blockquote>{observation.text}</blockquote>
    <p>{observation.detail}</p>
    <i aria-hidden="true">//</i>
  </motion.article>;
}
