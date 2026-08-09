import { ArrowLeft } from 'lucide-react';

export function InteriorHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <header className="interior-header">
    <button aria-label="Back home" title="Back home" onClick={onBack}><ArrowLeft /></button>
    <span>{title}</span>
  </header>;
}
