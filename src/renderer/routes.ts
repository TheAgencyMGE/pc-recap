export type RouteId =
  | 'home' | 'today' | 'week' | 'month' | 'year' | 'all-time' | 'decade'
  | 'timeline' | 'on-this-day' | 'achievements' | 'categories' | 'settings'
  | `app:${string}`;
