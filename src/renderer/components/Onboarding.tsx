import { motion } from 'framer-motion';
import { Activity, ArrowRight, HardDrive, Pause } from 'lucide-react';
import type { TrackingSettings } from '../../shared/types';
import { LogoMark } from './LogoMark';

export function Onboarding({ onComplete }: { onComplete: (patch: Partial<TrackingSettings>) => void }) {
  return <motion.div className="onboarding onboarding--minimal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header><LogoMark /></header>
    <main>
      <section className="onboarding__cover">
        <h1>Your PC,<br /><em>remembered.</em></h1>
      </section>
      <section className="onboarding__liner">
        <div className="onboarding__promises">
          <div><Activity /><b>Active app</b></div>
          <div><HardDrive /><b>Stored here</b></div>
          <div><Pause /><b>Pause anytime</b></div>
        </div>
        <button className="primary-button primary-button--large" onClick={() => onComplete({ onboardingComplete: true })}>Continue <ArrowRight size={18} /></button>
      </section>
    </main>
  </motion.div>;
}
