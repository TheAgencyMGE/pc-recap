import { Palette, Plus, Shapes } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { Category, TrackedApp } from '../../shared/types';
import { AppIcon } from '../components/AppIcon';

export function Categories({ api, categories, apps, onChanged }: { api: PCRecapAPI; categories: Category[]; apps: TrackedApp[]; onChanged: () => void }) {
  const [selected, setSelected] = useState(categories[0]?.id ?? 'other');
  const selectedCategory = categories.find((item) => item.id === selected);
  const saveNew = async () => {
    const index = categories.length + 1;
    await api.saveCategory({ id: `custom-${Date.now()}`, name: `My category ${index}`, color: '#B79CFF', icon: 'sparkles', isDefault: false });
    onChanged();
  };
  return <motion.div className="page categories-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <div className="simple-page-heading simple-page-heading--split"><h1>Categories</h1><button className="primary-button" onClick={saveNew}><Plus size={16} /> New</button></div>
    <section className="category-layout"><aside>{categories.map((category) => <button key={category.id} className={selected === category.id ? 'is-active' : ''} onClick={() => setSelected(category.id)}><i style={{ background: category.color }} /><span><b>{category.name}</b><small>{apps.filter((app) => app.categoryId === category.id).length} apps</small></span></button>)}</aside>
      <article className="category-editor"><div className="category-editor__title"><span className="category-editor__icon" style={{ color: selectedCategory?.color }}><Shapes /></span><div><h2>{selectedCategory?.name}</h2></div><span className="category-editor__swatch" style={{ background: selectedCategory?.color }} aria-label={`${selectedCategory?.name} color`}><Palette /></span></div>
        <div className="assigned-apps">{apps.filter((app) => app.categoryId === selected).map((app) => <div key={app.id}><AppIcon appId={app.id} name={app.name} color={app.color} /><span><b>{app.name}</b><small>{app.executable}</small></span><select value={app.categoryId} onChange={async (event) => { await api.setAppCategory(app.id, event.target.value); onChanged(); }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>)}</div>
        {!apps.some((app) => app.categoryId === selected) && <div className="empty-state empty-state--compact"><Shapes /><h2>No apps here</h2></div>}
      </article>
    </section>
  </motion.div>;
}
