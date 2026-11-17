/** Minimal hash router: #/library, #/editor/<id>, #/prompter/<id>, #/settings. */

export const ROUTE_NAMES = ['library', 'editor', 'prompter', 'settings'] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export interface Route {
  name: RouteName;
  /** Script id for editor/prompter; undefined otherwise or when absent. */
  id?: string;
}

export interface View {
  mount(container: HTMLElement, params: Route): void;
  unmount(): void;
}

export type ViewMap = Record<RouteName, () => View>;

/** Parse a location hash. Unknown or malformed routes fall back to the library. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, rawId] = parts;
  if (!name || !(ROUTE_NAMES as readonly string[]).includes(name)) return { name: 'library' };
  const routeName = name as RouteName;
  if ((routeName === 'editor' || routeName === 'prompter') && rawId) {
    try {
      return { name: routeName, id: decodeURIComponent(rawId) };
    } catch {
      return { name: 'library' };
    }
  }
  return { name: routeName };
}

/** Build a hash for a route (inverse of parseRoute). */
export function routeHash(route: Route): string {
  return route.id ? `#/${route.name}/${encodeURIComponent(route.id)}` : `#/${route.name}`;
}

/** Mounts one view at a time into `container`, following `hashchange`. */
export class Router {
  private current: View | null = null;
  private currentRoute: Route | null = null;
  private readonly onHashChange = () => this.render();

  constructor(
    private readonly container: HTMLElement,
    private readonly views: ViewMap,
    /** A view whose mount throws is replaced by this fallback instead of a blank screen. */
    private readonly onMountError?: (error: unknown, route: Route) => HTMLElement,
  ) {}

  start(): void {
    window.addEventListener('hashchange', this.onHashChange);
    this.render();
  }

  stop(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.current?.unmount();
    this.current = null;
  }

  navigate(route: Route): void {
    const hash = routeHash(route);
    if (location.hash === hash) this.render();
    else location.hash = hash;
  }

  get route(): Route | null {
    return this.currentRoute;
  }

  private render(): void {
    const route = parseRoute(location.hash);
    this.current?.unmount();
    this.container.replaceChildren();
    this.currentRoute = route;
    try {
      this.current = this.views[route.name]();
      this.current.mount(this.container, route);
    } catch (e) {
      if (!this.onMountError) throw e;
      try {
        this.current?.unmount();
      } catch {
        // Half-mounted view; nothing more to clean up safely.
      }
      this.current = null;
      this.container.replaceChildren(this.onMountError(e, route));
    }
  }
}
