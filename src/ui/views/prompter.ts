import { resolveConfig } from '../../core/align/config';
import { PositionController } from '../../core/position/controller';
import { buildScriptIndex, positionForWord } from '../../core/text/index';
import { parseScript } from '../../core/text/parse';
import type { ScriptIndex } from '../../core/text/types';
import type { EngineStatus, PositionChange, RecognizerEngine } from '../../core/types';
import { MicMeter } from '../../engines/micmeter';
import { getSpeechRecognition, WebSpeechEngine } from '../../engines/webspeech';
import { SimulatedEngine } from '../../engines/simulated';
import type { AppearanceSettings } from '../../storage/settings';
import { button, h } from '../components/dom';
import { createQuickPanel } from '../components/quickpanel';
import { createDebugPanel, debugEnabled } from '../debuglog';
import { createSimPanel, DEVSIM_CONFIG, simEnabled } from '../devsim';
import { browserEnv, detectCapabilities, meterEnabled, resolveEngine } from '../capabilities';
import { jumpMessage, linesBetween, statusBadge, TimingStats, VoiceFollowSession } from '../follow';
import { routeHash, type Route, type View } from '../router';
import {
  GESTURE_CONFIG,
  ScrollController,
  classifyGesture,
  dragScrollTop,
  planScroll,
  type LineGeometry,
  type ScrollPlan,
} from '../scroll';
import { cursorForPosition, spokenDelta } from '../wordstate';
import { attempt, type ViewDeps } from './deps';

export const PROMPTER_CONFIG = {
  /** Two words are on the same visual line if their tops differ by less than this × height. */
  sameLineFraction: 0.5,
  /** Bottom spacer as a fraction of viewport height, so the last line can reach the reading line. */
  bottomSpacerFraction: 1,
  /** How long the "Jumped ahead N lines — Undo" toast stays up. */
  jumpToastMs: 5000,
  /** How long capability notes (voice unavailable, iOS caveat) stay up. */
  noteMs: 8000,
  privacyUrl: 'https://github.com/Thulrus/Cadence#privacy',
} as const;

const CLS = {
  spoken: 'w-spoken',
  current: 'w-current',
  line: 'l-current',
} as const;

const MAX_HEADING_LEVEL = 6;

/**
 * Build the script DOM once: blocks → <h*>/<p>, words → <span data-w=i>. Returns the spans
 * indexed by display-word index.
 */
export function buildScriptDom(index: ScriptIndex): { root: HTMLElement; spans: HTMLElement[] } {
  const { blocks, words } = index.script;
  const root = document.createElement('div');
  root.className = 'prompter-text';
  const spans: HTMLElement[] = new Array<HTMLElement>(words.length);
  const frag = document.createDocumentFragment();
  for (const b of blocks) {
    const el = document.createElement(
      b.kind === 'heading' ? `h${Math.min(Math.max(b.level ?? 1, 1), MAX_HEADING_LEVEL)}` : 'p',
    );
    el.className = b.kind === 'heading' ? 'p-heading' : 'p-para';
    for (let i = b.wordStart; i < b.wordEnd; i++) {
      const w = words[i]!;
      if (i > b.wordStart) el.append(w.lineBreakBefore ? document.createElement('br') : ' ');
      const span = document.createElement('span');
      span.textContent = w.text;
      span.dataset.w = String(i);
      if (w.kind === 'direction') span.className = 'w-dir';
      if (w.emphasis) span.classList.add('w-em');
      el.append(span);
      spans[i] = span;
    }
    frag.append(el);
  }
  root.append(frag);
  return { root, spans };
}

/** Prompter view: renders a script, follows the PositionController, manual tap/drag control. */
export function createPrompterView(deps: ViewDeps): View {
  const cleanups: (() => void)[] = [];
  let root: HTMLElement | null = null;

  function notFound(container: HTMLElement, id: string | undefined): void {
    root = h(
      'section',
      { className: 'view' },
      h('h1', {}, 'Script not found'),
      h('p', {}, id ? `No script with id “${id}”. It may have been deleted.` : 'No script chosen.'),
      h('a', { href: routeHash({ name: 'library' }), className: 'btn btn-primary' }, 'Library'),
    );
    container.append(root);
  }

  return {
    mount(container: HTMLElement, route: Route) {
      const rec = route.id ? deps.scripts.get(route.id) : undefined;
      if (!rec) return notFound(container, route.id);
      void attempt(deps, () => deps.scripts.markOpened(rec.id));

      const index = buildScriptIndex(parseScript(rec.text));
      const ctl = new PositionController(index);
      const { root: text, spans } = buildScriptDom(index);

      const scroller = h('div', { className: 'prompter-scroll' }, text);
      const marker = h('div', { className: 'reading-line', ariaHidden: 'true' });
      const stage = h('div', { className: 'prompter-stage' }, scroller, marker);
      const resume = button('Resume following', () => ctl.attach(), 'primary', {
        className: 'btn btn-primary resume-follow',
        hidden: true,
      });
      const quick = createQuickPanel(deps.settings);
      cleanups.push(() => quick.destroy());
      const bar = h(
        'header',
        { className: 'prompter-bar' },
        h('a', { href: routeHash({ name: 'library' }), className: 'btn' }, '‹ Back'),
        h('span', { className: 'prompter-title' }, rec.title),
        quick.toggle,
      );
      const toastText = h('span', {});
      const toast = h(
        'div',
        { className: 'follow-toast', hidden: true },
        toastText,
        button('Undo', () => {
          hideToast();
          session?.undoJump();
        }),
      );
      toast.setAttribute('role', 'status');
      const lostBadge = h(
        'div',
        { className: 'follow-lost', hidden: true },
        'Lost — tap a word to resync',
      );
      lostBadge.setAttribute('role', 'status');
      // Everything that floats over the text lives in stageArea, which starts below the
      // bar, so overlays size to the space actually left (the bar may wrap on narrow screens).
      const stageArea = h(
        'div',
        { className: 'prompter-main' },
        stage,
        quick.panel,
        resume,
        toast,
        lostBadge,
      );
      root = h('section', { className: 'view-prompter' }, bar, stageArea);
      container.append(root);

      const scroll = new ScrollController(scroller);
      let appearance: AppearanceSettings = deps.settings.get().appearance;
      let cursor = 0;
      let plan: ScrollPlan | null = null;
      let lineMarked: HTMLElement[] = [];
      let lineStartsCache: number[] | null = null;

      // ---- geometry (reads layout; cached per layout) ----
      const geom = (span: HTMLElement): LineGeometry => ({
        top: text.offsetTop + span.offsetTop,
        height: span.offsetHeight,
      });
      const sameLine = (a: LineGeometry, b: LineGeometry) =>
        Math.abs(a.top - b.top) < Math.max(a.height, 1) * PROMPTER_CONFIG.sameLineFraction;

      /** Display words on the same visual line (and block) as word `w`. */
      function lineWords(w: number): HTMLElement[] {
        const { words } = index.script;
        const g = geom(spans[w]!);
        let a = w;
        let b = w;
        while (a > 0 && words[a - 1]!.block === words[w]!.block && sameLine(geom(spans[a - 1]!), g))
          a--;
        while (
          b < spans.length - 1 &&
          words[b + 1]!.block === words[w]!.block &&
          sameLine(geom(spans[b + 1]!), g)
        )
          b++;
        return spans.slice(a, b + 1);
      }

      let session: VoiceFollowSession | null = null;
      let toastTimer: ReturnType<typeof setTimeout> | undefined;
      function hideToast(): void {
        clearTimeout(toastTimer);
        toast.hidden = true;
      }
      function showToast(message: string): void {
        clearTimeout(toastTimer);
        toastText.textContent = message;
        toast.hidden = false;
        toastTimer = setTimeout(hideToast, PROMPTER_CONFIG.jumpToastMs);
      }
      cleanups.push(hideToast);

      const lineStarts = (): number[] => {
        if (lineStartsCache) return lineStartsCache;
        const { words } = index.script;
        const starts: number[] = [];
        let lineGeom: LineGeometry | null = null;
        let lineBlock = -1;
        let lineHasStart = false;
        for (let i = 0; i < words.length; i++) {
          const g = geom(spans[i]!);
          if (words[i]!.block !== lineBlock || !lineGeom || !sameLine(g, lineGeom)) {
            lineGeom = g;
            lineBlock = words[i]!.block;
            lineHasStart = false;
          }
          if (!lineHasStart && words[i]!.tokenEnd > words[i]!.tokenStart) {
            starts.push(words[i]!.tokenStart);
            lineHasStart = true;
          }
        }
        return (lineStartsCache = starts);
      };
      ctl.setLineStarts(lineStarts);

      /** The span to keep at the reading line: current word, or the last word at the end. */
      const focusSpan = (): HTMLElement | undefined => spans[Math.min(cursor, spans.length - 1)];
      const hasCurrent = () => index.tokens.length > 0 && cursor < spans.length;

      // ---- word states (only touch words whose state changed) ----
      function updateLineHighlight(): void {
        for (const el of lineMarked) el.classList.remove(CLS.line);
        lineMarked = appearance.highlight === 'line' && hasCurrent() ? lineWords(cursor) : [];
        for (const el of lineMarked) el.classList.add(CLS.line);
      }

      function setCursor(next: number): void {
        if (hasCurrent()) spans[cursor]!.classList.remove(CLS.current);
        const d = spokenDelta(cursor, next);
        for (let i = d.add[0]; i < d.add[1]; i++) spans[i]!.classList.add(CLS.spoken);
        for (let i = d.remove[0]; i < d.remove[1]; i++) spans[i]!.classList.remove(CLS.spoken);
        cursor = next;
        if (hasCurrent()) spans[cursor]!.classList.add(CLS.current);
        updateLineHighlight();
      }

      // ---- scrolling ----
      function follow(opts: { backward: boolean; force: boolean }, mode: 'ease' | 'jump'): void {
        const span = focusSpan();
        if (!ctl.following || !span) return;
        plan = planScroll(
          plan,
          geom(span),
          {
            height: scroller.clientHeight,
            readingPct: appearance.readingLinePct,
            maxScroll: scroller.scrollHeight - scroller.clientHeight,
          },
          opts,
        );
        if (mode === 'jump') scroll.jumpTo(plan.target);
        else scroll.easeTo(plan.target);
      }

      /** Layout changed (resize, fonts, appearance): recompute spacers, lines, scroll. */
      function relayout(mode: 'ease' | 'jump'): void {
        const vh = scroller.clientHeight;
        text.style.paddingTop = `${(vh * appearance.readingLinePct) / 100}px`;
        text.style.paddingBottom = `${vh * PROMPTER_CONFIG.bottomSpacerFraction}px`;
        lineStartsCache = null;
        updateLineHighlight();
        follow({ backward: false, force: true }, mode);
      }

      cleanups.push(
        ctl.events.on('change', (c: PositionChange) => {
          if (c.source !== 'align') hideToast();
          setCursor(cursorForPosition(index, c.position));
          follow({ backward: c.previous > c.position, force: false }, 'ease');
        }),
        ctl.events.on('follow', ({ following }) => {
          resume.hidden = following;
          if (following) follow({ backward: true, force: true }, 'ease');
        }),
        deps.settings.on('change', ({ settings, groups }) => {
          if (groups.includes('align')) session?.setConfig(resolveConfig(settings.align));
          if (!groups.includes('appearance')) return;
          appearance = settings.appearance;
          relayout('jump');
        }),
      );

      // ---- manual control: tap a word vs. drag/wheel to detach ----
      let press: {
        id: number;
        x: number;
        y: number;
        t: number;
        moved: number;
        mouse: boolean;
        startScroll: number;
      } | null = null;

      function grab(): void {
        scroll.stop();
        ctl.detach();
      }

      const onDown = (e: PointerEvent) => {
        if (!e.isPrimary || e.button > 0) return;
        press = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          t: e.timeStamp,
          moved: 0,
          mouse: e.pointerType === 'mouse',
          startScroll: scroller.scrollTop,
        };
      };
      const onMove = (e: PointerEvent) => {
        if (!press || e.pointerId !== press.id) return;
        const dy = e.clientY - press.y;
        press.moved = Math.max(press.moved, Math.hypot(e.clientX - press.x, dy));
        if (press.moved <= GESTURE_CONFIG.tapMaxMovePx) return;
        if (ctl.following || scroll.animating) grab();
        // Touch/pen pan natively; mouse gets grab-to-scroll (respecting vertical flip).
        if (press.mouse) {
          if (!scroller.hasPointerCapture(e.pointerId)) scroller.setPointerCapture(e.pointerId);
          scroller.scrollTop = dragScrollTop(press.startScroll, dy, appearance.flipY);
        }
      };
      const onUp = (e: PointerEvent) => {
        if (!press || e.pointerId !== press.id) return;
        const g = classifyGesture(press.moved, e.timeStamp - press.t);
        press = null;
        if (g !== 'tap') return;
        const target = (e.target as Element | null)?.closest<HTMLElement>('[data-w]');
        if (!target) return;
        ctl.set(positionForWord(index, Number(target.dataset.w)), 'manual');
        ctl.attach();
        session?.resync(); // also clears "lost" when the same word is re-tapped
        // Same position re-tapped while following: still ease back to it.
        follow({ backward: true, force: true }, 'ease');
      };
      const onCancel = (e: PointerEvent) => {
        // The browser took over the touch for native panning.
        if (press && e.pointerId === press.id) grab();
        press = null;
      };
      const onWheel = () => grab();

      scroller.addEventListener('pointerdown', onDown);
      scroller.addEventListener('pointermove', onMove);
      scroller.addEventListener('pointerup', onUp);
      scroller.addEventListener('pointercancel', onCancel);
      scroller.addEventListener('wheel', onWheel, { passive: true });

      const ro = new ResizeObserver(() => relayout('jump'));
      ro.observe(scroller);
      ro.observe(text);
      cleanups.push(
        () => ro.disconnect(),
        () => scroll.stop(),
        () => ctl.events.clear(),
      );

      // ---- voice follow ----
      const caps = detectCapabilities(browserEnv());
      const forceSim = simEnabled(location.search);
      const engineSettings = deps.settings.get().engine;
      const resolved = resolveEngine(engineSettings.choice, caps, {
        dev: import.meta.env.DEV,
        forceSim,
      });
      const devTools = import.meta.env.DEV || forceSim;
      const debugLog = debugEnabled(location.search) ? createDebugPanel() : null;
      if (debugLog) {
        stageArea.append(debugLog.el);
        cleanups.push(() => debugLog.el.remove());
        debugLog.log(
          `engine ${resolved.engine}; webSpeech ${caps.webSpeech}, secure ${caps.secure}, getUserMedia ${caps.getUserMedia}, meter setting ${engineSettings.micMeter}, android ${caps.android}`,
        );
      }
      if (resolved.note) deps.notices.show(resolved.note, 'info', PROMPTER_CONFIG.noteMs);

      function startFollow(engine: RecognizerEngine): VoiceFollowSession {
        const s = new VoiceFollowSession(
          engine,
          index,
          ctl,
          resolveConfig(deps.settings.get().align),
        );
        s.events.on('jump', ({ previous, position }) =>
          showToast(
            jumpMessage(linesBetween(lineStarts(), previous, position), position > previous),
          ),
        );
        if (devTools) {
          const stats = new TimingStats(DEVSIM_CONFIG.timingWindow);
          s.events.on('timing', ({ ms }) => {
            const sum = stats.add(ms);
            if (sum) {
              console.debug(
                `[cadence] result → align → render: mean ${sum.mean.toFixed(2)} ms, max ${sum.max.toFixed(2)} ms (${sum.n} events, ${index.tokens.length} tokens)`,
              );
            }
          });
        }
        cleanups.push(() => s.destroy());
        return s;
      }

      let engine: RecognizerEngine | null = null;
      let meterOn = false;
      if (resolved.engine === 'webspeech') {
        const Recognition = getSpeechRecognition();
        if (Recognition) {
          meterOn = meterEnabled(engineSettings.micMeter, caps);
          const meter = meterOn
            ? new MicMeter({
                onFail: (err) => {
                  debugLog?.log(`meter failed: ${String(err)}`);
                  meterOn = false;
                  meterEl.hidden = true;
                  console.info('[cadence] mic level meter unavailable:', err);
                },
              })
            : null;
          engine = new WebSpeechEngine({
            Recognition,
            lang: () => deps.settings.get().engine.lang,
            meter,
            debug: debugLog?.log,
          });
        }
      } else if (resolved.engine === 'simulated') {
        const sim = new SimulatedEngine();
        engine = sim;
        const panel = createSimPanel(sim, index, () => ctl.position);
        sim.events.on('status', ({ status }) => panel.setStatus(status));
        stageArea.append(panel.el);
        cleanups.push(() => panel.destroy());
      }

      // Bar controls: status badge, level meter, Start/Pause listening.
      const badge = h('span', { className: 'listen-badge', hidden: !engine });
      badge.setAttribute('role', 'status');
      const meterFill = h('span', { className: 'listen-meter-fill' });
      const meterEl = h('span', { className: 'listen-meter', hidden: true }, meterFill);
      meterEl.setAttribute('aria-hidden', 'true');
      const listenBtn = button('Start listening', () => toggleListening(), 'primary', {
        className: 'btn btn-primary listen-btn',
        hidden: !engine,
      });
      bar.insertBefore(badge, quick.toggle);
      bar.insertBefore(meterEl, quick.toggle);
      bar.insertBefore(listenBtn, quick.toggle);

      let engineStatus: { status: EngineStatus; message?: string } = { status: 'idle' };
      function renderStatus(): void {
        const lost = session?.isLost ?? false;
        const b = statusBadge(engineStatus.status, lost, engineStatus.message);
        badge.textContent = b.label;
        badge.dataset.state = b.state;
        badge.title = engineStatus.message ?? '';
        listenBtn.textContent = b.active ? 'Pause listening' : 'Start listening';
        listenBtn.setAttribute('aria-pressed', String(b.active));
        meterEl.hidden = !(meterOn && b.active);
        if (!b.active) meterFill.style.transform = 'scaleX(0)';
        lostBadge.hidden = !(lost && b.active);
      }

      // One-time privacy notice before the first Web Speech start.
      const privacy = h(
        'div',
        { className: 'privacy-notice', hidden: true },
        h('h2', {}, 'Before you start'),
        h(
          'p',
          {},
          'Voice following uses your browser’s speech service. In Chrome, your microphone audio is sent to Google to be transcribed, so it needs an internet connection. Cadence itself never sends or stores audio or scripts.',
        ),
        h(
          'p',
          {},
          h(
            'a',
            { href: PROMPTER_CONFIG.privacyUrl, target: '_blank', rel: 'noopener' },
            'Privacy details (README)',
          ),
        ),
        h(
          'div',
          { className: 'privacy-actions' },
          button('Cancel', () => (privacy.hidden = true)),
          button(
            'Start listening',
            () => {
              privacy.hidden = true;
              deps.settings.update({ engine: { privacyNoticeSeen: true } });
              void session?.start();
            },
            'primary',
          ),
        ),
      );
      privacy.setAttribute('role', 'dialog');
      privacy.setAttribute('aria-modal', 'true');
      privacy.addEventListener('pointerdown', (e) => e.stopPropagation());
      stageArea.append(privacy);

      function toggleListening(): void {
        if (!session) return;
        if (statusBadge(engineStatus.status, false).active) return session.stop();
        if (engine?.id === 'webspeech' && !deps.settings.get().engine.privacyNoticeSeen) {
          privacy.hidden = false;
          return;
        }
        void session.start(); // inside the click: Web Speech needs a user gesture
      }

      if (engine) {
        session = startFollow(engine);
        session.events.on('status', (st) => {
          debugLog?.log(`status ${st.status}${st.message ? `: ${st.message}` : ''}`);
          engineStatus = st;
          renderStatus();
          if (st.status === 'no-permission') {
            deps.notices.show(
              'Microphone access was denied. Allow the microphone for this site in the browser’s site settings, then tap Start listening.',
              'warning',
            );
          }
        });
        session.events.on('lost', renderStatus);
        session.events.on('level', (l) => {
          meterFill.style.transform = `scaleX(${l.toFixed(3)})`;
        });
        renderStatus();
        // Dev console handle: __cadenceFollow.aligner.state etc.
        if (devTools) {
          (window as unknown as { __cadenceFollow?: VoiceFollowSession }).__cadenceFollow = session;
        }
      }

      setCursor(cursorForPosition(index, ctl.position));
      relayout('jump');
    },

    unmount() {
      for (const c of cleanups.splice(0)) c();
      root?.remove();
      root = null;
    },
  };
}
