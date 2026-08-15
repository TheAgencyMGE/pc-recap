import { AnimatePresence, motion } from 'framer-motion';
import { Activity, DatabaseBackup, HardDrive, LoaderCircle, ShieldCheck, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PCRecapAPI } from '../shared/ipc';
import type {
  AppDetail as AppDetailData, Category, DashboardData, OnThisDayEntry,
  PeriodKind, PeriodSummary, TrackedApp, TrackingSettings,
  RecapStoryData,
} from '../shared/types';
import { AppIconProvider } from './components/AppIcon';
import { InteriorHeader } from './components/InteriorHeader';
import { Onboarding } from './components/Onboarding';
import { rendererApi } from './lib/api';
import { Achievements } from './pages/Achievements';
import { AppDetail } from './pages/AppDetail';
import { Categories } from './pages/Categories';
import { CollectionHome } from './pages/CollectionHome';
import { Dashboard } from './pages/Dashboard';
import { OnThisDay } from './pages/OnThisDay';
import { PeriodView } from './pages/PeriodView';
import { Settings } from './pages/Settings';
import { HistoryRecovery } from './pages/HistoryRecovery';
import { Timeline } from './pages/Timeline';
import { YearlyRecap } from './pages/YearlyRecap';
import { DayReplay } from './pages/replay/DayReplay';
import { RecapStudio } from './pages/recap-studio/RecapStudio';
import type { RouteId } from './routes';

const PERIOD_ROUTES = new Set<RouteId>(['today', 'week', 'month', 'year', 'all-time', 'decade']);
const HOME_PERIODS: PeriodKind[] = ['today', 'week', 'month', 'year', 'all-time', 'decade'];

const routeTitle = (route: RouteId, detail?: AppDetailData | null) => {
  if (route.startsWith('app:')) return detail?.app.name ?? 'App';
  if (route.startsWith('day:')) return 'Day Replay';
  const titles: Partial<Record<RouteId, string>> = {
    today: 'Today', week: 'Week', month: 'Month', 'all-time': 'All time', decade: 'Decade',
    timeline: 'Timeline', 'on-this-day': 'On this day', achievements: 'Records',
    categories: 'Categories', settings: 'Settings', 'history-recovery': 'Recover history',
    'recap-studio': 'Recap Studio',
  };
  return titles[route] ?? 'PC Recap';
};

export function App({ api = rendererApi }: { api?: PCRecapAPI }) {
  const [route, setRoute] = useState<RouteId>('home');
  const [data, setData] = useState<DashboardData>();
  const [summaries, setSummaries] = useState<Partial<Record<PeriodKind, PeriodSummary>>>({});
  const [settings, setSettings] = useState<TrackingSettings>();
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [onThisDay, setOnThisDay] = useState<OnThisDayEntry[]>([]);
  const [appDetail, setAppDetail] = useState<AppDetailData | null>();
  const [recapStory, setRecapStory] = useState<RecapStoryData>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const period: PeriodKind = PERIOD_ROUTES.has(route) ? route as PeriodKind : 'today';
  const selectedYear = new Date().getFullYear();

  useEffect(() => {
    let live = true;
    setError('');
    const load = async () => {
      const [dashboard, nextSettings, nextApps, nextCategories, entries, homeSummaries] = await Promise.all([
        api.getDashboard(period, period === 'year' ? selectedYear : undefined),
        api.getSettings(), api.listApps(), api.getCategories(), api.getOnThisDay(),
        route === 'home'
          ? Promise.all(HOME_PERIODS.map(async (kind) => [kind, await api.getSummary(kind, kind === 'year' ? selectedYear : undefined)] as const))
          : Promise.resolve([]),
      ]);
      if (!live) return;
      setData(dashboard);
      setSettings(nextSettings);
      setApps(nextApps);
      setCategories(nextCategories);
      setOnThisDay(entries);
      if (homeSummaries.length) setSummaries(Object.fromEntries(homeSummaries));
    };
    void load().catch((reason: unknown) => live && setError(reason instanceof Error ? reason.message : 'Could not open PC Recap.'));
    return () => { live = false; };
  }, [api, period, revision, route, selectedYear]);

  useEffect(() => {
    if (!route.startsWith('app:')) { setAppDetail(undefined); return; }
    void api.getAppDetail(route.slice(4)).then(setAppDetail);
  }, [api, route, revision]);

  useEffect(() => api.onTrackingStatus((status) => setData((current) => current ? { ...current, trackingStatus: status } : current)), [api]);

  const toggleTracking = useCallback(async () => {
    if (!data || !settings) return;
    const trackingEnabled = !settings.trackingEnabled;
    const status = await api.setTrackingEnabled(trackingEnabled);
    setData({ ...data, trackingStatus: status });
    setSettings({ ...settings, trackingEnabled });
  }, [api, data, settings]);

  const page = useMemo(() => {
    if (!data || !settings) return null;
    if (route === 'home') return <CollectionHome
      summaries={summaries}
      timeline={data.timeline}
      achievements={data.achievements}
      apps={apps}
      onThisDay={onThisDay}
      status={data.trackingStatus}
      trackingEnabled={settings.trackingEnabled}
      onNavigate={setRoute}
      onToggleTracking={() => { void toggleTracking(); }}
    />;
    if (PERIOD_ROUTES.has(route) && data.summary.sessionCount === 0) return <EmptyArchive api={api} isArchiveEmpty={apps.length === 0} status={data.trackingStatus.state} onChanged={reload} />;
    if (route === 'today') return <Dashboard summary={data.summary} timeline={data.timeline} onNavigate={setRoute} />;
    if (route === 'week' || route === 'month' || route === 'all-time' || route === 'decade') return <PeriodView summary={data.summary} onNavigate={setRoute} />;
    if (route === 'timeline') return <Timeline api={api} onNavigate={setRoute} />;
    if (route === 'on-this-day') return <OnThisDay entries={onThisDay} />;
    if (route === 'achievements') return <Achievements achievements={data.achievements} />;
    if (route === 'categories') return <Categories api={api} categories={categories} apps={apps} onChanged={reload} />;
    if (route === 'settings') return <Settings api={api} settings={settings} onChanged={reload} onNavigate={setRoute} />;
    if (route === 'history-recovery') return <HistoryRecovery api={api} onChanged={reload} />;
    if (route === 'recap-studio') return <RecapStudio api={api} onPlay={setRecapStory} />;
    if (route.startsWith('day:')) return <DayReplay api={api} day={route.slice(4)} />;
    if (route.startsWith('app:')) return appDetail ? <AppDetail detail={appDetail} onSetExcluded={async (excluded) => {
      await api.setAppExcluded(appDetail.app.id, excluded);
      reload();
    }} /> : <Loading />;
    return null;
  }, [api, appDetail, apps, categories, data, onThisDay, reload, route, settings, summaries, toggleTracking]);

  if (error) return <div className="fatal-state"><h1>Could not open PC Recap.</h1><p>{error}</p><button className="primary-button" onClick={reload}>Try again</button></div>;
  if (!data || !settings) return <Loading />;
  if (!settings.onboardingComplete) return <Onboarding onComplete={async (patch) => { setSettings(await api.updateSettings(patch)); reload(); }} />;
  if (recapStory) return <AppIconProvider api={api}><YearlyRecap api={api} summary={recapStory.summary} timeline={recapStory.timeline} selection={recapStory.selection} recoveredClues={recapStory.recoveredClues} pins={recapStory.pins} onClose={() => setRecapStory(undefined)} /></AppIconProvider>;
  if (route === 'year' && data.summary.sessionCount > 0) return <AppIconProvider api={api}><YearlyRecap api={api} summary={data.summary} timeline={data.timeline} onClose={() => setRoute('home')} /></AppIconProvider>;

  if (route === 'home') return <AppIconProvider api={api}>{page}</AppIconProvider>;
  return <AppIconProvider api={api}><div className="interior-app">
    <InteriorHeader title={routeTitle(route, appDetail)} onBack={() => setRoute('home')} />
    <div className="interior-scroll"><AnimatePresence mode="wait"><motion.div key={route} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>{page}</motion.div></AnimatePresence></div>
  </div></AppIconProvider>;
}

function Loading() {
  return <div className="loading-state"><LoaderCircle /><span>Opening</span></div>;
}

function EmptyArchive({ api, isArchiveEmpty, status, onChanged }: { api: PCRecapAPI; isArchiveEmpty: boolean; status: string; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const importHistory = async () => {
    const result = await api.importBackup();
    if (result.ok) { setMessage(`${result.importedSessions ?? 0} sessions imported.`); onChanged(); }
    else if (!result.canceled) setMessage(result.error ?? 'Import failed.');
  };
  return <motion.main className="page empty-archive" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="empty-archive__mark"><Activity /></div>
    <h1>{isArchiveEmpty ? 'No activity yet.' : 'Nothing here.'}</h1>
    <p>{status === 'tracking' ? 'Leave PC Recap running and come back later.' : 'Resume tracking to add activity.'}</p>
    <div className="empty-archive__facts">
      <div><HardDrive /><span><b>{status === 'tracking' ? 'Tracking is on' : 'Tracking is paused'}</b></span></div>
      <div><DatabaseBackup /><span><b>Have a backup?</b></span></div>
      <div><ShieldCheck /><span><b>Settings stay available</b></span></div>
    </div>
    <button className="primary-button" onClick={importHistory}><Upload size={17} /> Import</button>
    {message && <p className="empty-archive__message">{message}</p>}
  </motion.main>;
}
