import { Palette, Plus, Save, Shapes, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { Category, TrackedApp } from '../../shared/types';
import { AppIcon } from '../components/AppIcon';

export function Categories({ api, categories, apps, onChanged }: { api: PCRecapAPI; categories: Category[]; apps: TrackedApp[]; onChanged: () => void }) {
  const [selected, setSelected] = useState(categories[0]?.id ?? 'other');
  const selectedCategory = categories.find((item) => item.id === selected) ?? categories[0];
  const [name, setName] = useState(selectedCategory?.name ?? '');
  const [color, setColor] = useState(selectedCategory?.color ?? '#B79CFF');
  const [replacement, setReplacement] = useState('other');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setName(selectedCategory?.name ?? '');
    setColor(selectedCategory?.color ?? '#B79CFF');
    setReplacement(categories.find((item) => item.id !== selected)?.id ?? 'other');
  }, [categories, selected, selectedCategory?.color, selectedCategory?.name]);

  const saveNew = async () => {
    const id = `custom-${Date.now()}`;
    await api.saveCategory({ id, name: 'New category', color: '#B79CFF', icon: 'sparkles', isDefault: false });
    setSelected(id);
    setMessage('Category created.');
    onChanged();
  };
  const saveChanges = async () => {
    if (!selectedCategory || !name.trim()) return;
    await api.updateCategory({ ...selectedCategory, name: name.trim(), color });
    setMessage('Changes saved.');
    onChanged();
  };
  const deleteSelected = async () => {
    if (!selectedCategory || selectedCategory.isDefault) return;
    await api.deleteCategory(selectedCategory.id, replacement);
    setSelected(replacement);
    setMessage('Category deleted and apps reassigned.');
    onChanged();
  };

  return <motion.div className="page categories-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <div className="simple-page-heading simple-page-heading--split"><h1>Categories</h1><button className="primary-button" onClick={() => { void saveNew(); }}><Plus size={16} /> New category</button></div>
    {message && <p className="category-message" role="status">{message}</p>}
    <section className="category-layout"><aside>{categories.map((category) => <button key={category.id} className={selected === category.id ? 'is-active' : ''} onClick={() => setSelected(category.id)}><i style={{ background: category.color }} /><span><b>{category.name}</b><small>{apps.filter((app) => app.categoryId === category.id).length} apps</small></span></button>)}</aside>
      <article className="category-editor">
        <div className="category-editor__title"><span className="category-editor__icon" style={{ color }}><Shapes /></span><div><h2>{selectedCategory?.name ?? 'Category'}</h2><small>{selectedCategory?.isDefault ? 'Built in' : 'Custom'}</small></div><span className="category-editor__swatch" style={{ background: color }} aria-label={`${selectedCategory?.name} color`}><Palette /></span></div>
        {selectedCategory && <div className="category-fields">
          <label><span>Name</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Color</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          <button className="primary-button" type="button" disabled={!name.trim()} onClick={() => { void saveChanges(); }}><Save /> Save changes</button>
        </div>}
        <div className="assigned-apps">{apps.filter((app) => app.categoryId === selected).map((app) => <div key={app.id}><AppIcon appId={app.id} name={app.name} color={app.color} /><span><b>{app.name}</b><small>{app.executable}</small></span><select aria-label={`Category for ${app.name}`} value={app.categoryId} onChange={async (event) => { await api.setAppCategory(app.id, event.target.value); onChanged(); }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>)}</div>
        {!apps.some((app) => app.categoryId === selected) && <div className="empty-state empty-state--compact"><Shapes /><h2>No apps here</h2></div>}
        {selectedCategory && !selectedCategory.isDefault && <div className="category-delete"><span><b>Delete category</b><small>Move its apps somewhere else first.</small></span><select aria-label="Move apps to" value={replacement} onChange={(event) => setReplacement(event.target.value)}>{categories.filter((category) => category.id !== selectedCategory.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" onClick={() => { void deleteSelected(); }}><Trash2 /> Delete</button></div>}
      </article>
    </section>
  </motion.div>;
}
