import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronRight, History, Layers3, Shapes, Trophy } from 'lucide-react';
import type { CollectionCoverModel } from '../lib/collection-covers';
import { ActivityTape } from './ActivityTape';
import { AppIcon } from './AppIcon';

const CoverSymbol = ({ kind }: { kind: CollectionCoverModel['kind'] }) => {
  if (kind === 'archive') return <History />;
  if (kind === 'record') return <Trophy />;
  if (kind === 'utility') return <Shapes />;
  if (kind === 'period') return <CalendarDays />;
  return <Layers3 />;
};

export function CollectionCover({ model, onOpen, index = 0 }: { model: CollectionCoverModel; onOpen: () => void; index?: number }) {
  const reduceMotion = useReducedMotion();
  return <motion.button
    className={`collection-cover collection-cover--${model.kind}`}
    style={{ '--cover-bg': model.colors.background, '--cover-fg': model.colors.foreground, '--cover-accent': model.colors.accent, '--cover-support': model.colors.support } as React.CSSProperties}
    aria-label={`Open ${model.title}`}
    onClick={onOpen}
    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: reduceMotion ? 0 : index * .045, duration: .3 }}
    whileHover={reduceMotion ? undefined : { y: -6, rotate: index % 2 ? .5 : -.5 }}
  >
    {model.kind === 'app' && model.appId && model.appColor
      ? <AppIcon appId={model.appId} name={model.title} color={model.appColor} size="large" />
      : <span className="collection-cover__symbol"><CoverSymbol kind={model.kind} /></span>}
    <span className="collection-cover__copy">
      <b>{model.title}</b>
      {model.value ? <strong>{model.value}</strong> : model.kind === 'today' ? <strong>No activity yet</strong> : null}
      {model.subtitle && <small>{model.subtitle}</small>}
    </span>
    {model.tape?.length ? <ActivityTape data={model.tape} colors={[model.colors.accent, model.colors.support, model.colors.foreground]} label={`${model.title} activity`} /> : null}
    <ChevronRight className="collection-cover__arrow" />
  </motion.button>;
}
