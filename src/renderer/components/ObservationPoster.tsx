import type { Observation } from '../../shared/types';

export function ObservationPoster({ observation }: { observation: Observation }) {
  return <article className="observation-poster" style={{ '--poster-accent': observation.accent } as React.CSSProperties}>
    <span>{observation.eyebrow}</span>
    <blockquote>{observation.text}</blockquote>
    <p>{observation.detail}</p>
    <i aria-hidden="true">//</i>
  </article>;
}
