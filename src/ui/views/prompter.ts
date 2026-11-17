import { resolveConfig } from '../../core/align/config';
import { PositionController } from '../../core/position/controller';
import { buildScriptIndex, positionForWord } from '../../core/text/index';
import { formatClock, pace } from '../../core/timing/pace';
import { TimedScroller } from '../../core/timing/timed';
import { SpokenWords } from '../../core/timing/words';
import { parseScript } from '../../core/text/parse';
import type { ScriptIndex } from '../../core/text/types';
import type { EngineStatus, PositionChange, RecognizerEngine } from '../../core/types';
import { MicMeter } from '../../engines/micmeter';
import { getSpeechRecognition, WebSpeechEngine } from '../../engines/webspeech';
import { SimulatedEngine } from '../../engines/simulated';
import {
  RUN_MODES,
  SETTINGS_LIMITS,
  type AppearanceSettings,
  type RunMode,
  type RunSettings,
} from '../../storage/settings';
import { stepFontSize } from '../appearance';
import { button, h } from '../components/dom';
import { createQuickPanel } from '../components/quickpanel';
import { createDebugPanel, debugEnabled } from '../debuglog';
import {
  exitFullscreen,
  fullscreenSupported,
  isFullscreen,
  toggleFullscreen,
  WakeLockKeeper,
} from '../device';
import { actionForKey, isTypingTarget } from '../keys';
import { canAutoHide, nearEdge, RunController, type RunDriver } from '../run';
import { createSimPanel, DEVSIM_CONFIG, simEnabled } from '../devsim';
import { browserEnv, detectCapabilities, meterEnabled, resolveEngine } from '../capabilities';
import {
  jumpMessage,
  linesBetween,
  statusAnnouncement,
  statusBadge,
  TimingStats,
  VoiceFollowSession,
} from '../follow';
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
import { RUN_MODE_LABELS } from './settings';

const VOICE_FAILED_MESSAGE =
  'Voice following hit a problem and stopped. Manual and timed modes still work; switch back to Voice and tap Start to try again.';

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
  /** Timed-scroll tick interval (position advances per word, so this only bounds latency). */
  timedTickMs: 100,
  /** Run timer / pace refresh interval. */
  timerRefreshMs: 250,
  /** WPM change per −/+ press in the bar. */
  wpmStep: 10,
  /** How often a blocked auto-hide (toast or panel open) re-checks. */
  autoHideRetryMs: 1000,
} as const;

const MS_PER_SEC = 1000;

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
      const runSettings = (): RunSettings => deps.settings.get().run;

      // Mode switch (Voice / Timed / Manual), timed WPM −/+, run button, fullscreen.
      const modeBtns = new Map<RunMode, HTMLButtonElement>();
      for (const m of RUN_MODES) {
        modeBtns.set(
          m,
          button(RUN_MODE_LABELS[m], () => chooseMode(m), 'plain', {
            className: 'btn mode-btn',
            dataset: { mode: m },
          }),
        );
      }
      const modeGroup = h(
        'div',
        { className: 'mode-switch', role: 'group', ariaLabel: 'Mode' },
        ...modeBtns.values(),
      );
      const wpmOut = h('output', { className: 'wpm-value', ariaLive: 'polite' });
      const stepWpm = (n: number) => {
        const L = SETTINGS_LIMITS.timedWpm;
        const next = runSettings().timedWpm + n * PROMPTER_CONFIG.wpmStep;
        deps.settings.update({ run: { timedWpm: Math.min(L.max, Math.max(L.min, next)) } });
      };
      const wpmGroup = h(
        'div',
        { className: 'wpm-group', role: 'group', ariaLabel: 'Timed scroll speed' },
        button('−', () => stepWpm(-1), 'plain', { ariaLabel: 'Slower' }),
        wpmOut,
        button('+', () => stepWpm(1), 'plain', { ariaLabel: 'Faster' }),
      );
      const fsBtn = button('⛶', () => void toggleFullscreen(), 'plain', {
        className: 'btn fs-btn',
        ariaLabel: 'Fullscreen',
        title: 'Fullscreen (F)',
        hidden: !fullscreenSupported(),
      });
      const runBtn = button('Start', () => run.toggle(), 'primary', {
        className: 'btn btn-primary run-btn',
      });
      const bar = h(
        'header',
        { className: 'prompter-bar' },
        h('a', { href: routeHash({ name: 'library' }), className: 'btn' }, '‹ Back'),
        h('span', { className: 'prompter-title' }, rec.title),
        modeGroup,
        wpmGroup,
        fsBtn,
        quick.toggle,
        runBtn,
      );
      // A pointer click leaves focus on the button, so a later Space (pause) would click it
      // again; drop focus after pointer clicks. Keyboard activation keeps focus.
      bar.addEventListener('click', (e) => {
        if (e.detail > 0) (e.target as Element).closest('button')?.blur();
      });
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
      // Not a live region: status changes are spoken by `srStatus` (statusAnnouncement), so
      // the recognizer's frequent restarts aren't announced.
      const srStatus = h('span', { className: 'sr-only' });
      srStatus.setAttribute('aria-live', 'polite');
      let lastSpoken: string | null = null;
      // Everything that floats over the text lives in stageArea. The bar overlays its top
      // (CSS --bar-off), so auto-hiding the bar never resizes the stage.
      const stageArea = h(
        'div',
        { className: 'prompter-main' },
        stage,
        quick.panel,
        resume,
        toast,
        lostBadge,
        srStatus,
      );
      const timerClock = h('span', { className: 'run-timer-clock' }, '0:00');
      const timerPace = h('span', { className: 'run-timer-pace' });
      const timerEl = h('div', { className: 'run-timer' }, timerClock, timerPace);
      timerEl.setAttribute('aria-label', 'Elapsed time');
      stageArea.append(timerEl);
      // Bar first in the DOM so keyboard focus starts at the controls (it's an absolute overlay).
      const view = h('section', { className: 'view-prompter' }, bar, stageArea);
      root = view;
      container.append(view);
      const barRo = new ResizeObserver(() =>
        view.style.setProperty('--bar-h', `${bar.offsetHeight}px`),
      );
      barRo.observe(bar);
      cleanups.push(() => barRo.disconnect());

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
      // Assigned in the run section below; declared here because earlier handlers use them.
      let timed: TimedScroller;
      let run: RunController;
      let controlsHidden = (): boolean => false;
      let showControls = (): void => {};
      let scheduleHide = (): void => {};
      let toastTimer: ReturnType<typeof setTimeout> | undefined;
      function hideToast(): void {
        clearTimeout(toastTimer);
        if (toast.hidden) return;
        toast.hidden = true;
        scheduleHide(); // the toast was blocking auto-hide
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
          if (c.source !== 'timed') timed.setPosition(c.position);
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
          if (groups.includes('run')) {
            timed.setWpm(settings.run.timedWpm);
            renderRun();
            renderTimer();
            scheduleHide();
          }
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
        if (
          controlsHidden() &&
          nearEdge(e.clientY - view.getBoundingClientRect().top, view.clientHeight)
        ) {
          showControls();
          return;
        }
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
      const onHover = (e: PointerEvent) => {
        // Desktop: moving the mouse to the top edge brings the controls back.
        if (e.pointerType !== 'mouse' || !controlsHidden()) return;
        if (e.clientY - view.getBoundingClientRect().top < bar.offsetHeight) showControls();
      };
      scroller.addEventListener('pointermove', onHover);

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
          try {
            engine = new WebSpeechEngine({
              Recognition,
              lang: () => deps.settings.get().engine.lang,
              meter,
              debug: debugLog?.log,
            });
          } catch (e) {
            // Engine couldn't be built: the prompter still works in timed/manual mode.
            console.error('[cadence] speech engine unavailable:', e);
            deps.notices.show(VOICE_FAILED_MESSAGE, 'warning');
          }
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
      const meterFill = h('span', { className: 'listen-meter-fill' });
      const meterEl = h('span', { className: 'listen-meter', hidden: true }, meterFill);
      meterEl.setAttribute('aria-hidden', 'true');
      bar.insertBefore(badge, fsBtn);
      bar.insertBefore(meterEl, fsBtn);

      let engineStatus: { status: EngineStatus; message?: string } = { status: 'idle' };
      function renderStatus(): void {
        const lost = session?.isLost ?? false;
        const b = statusBadge(engineStatus.status, lost, engineStatus.message);
        badge.textContent = b.label;
        badge.dataset.state = b.state;
        badge.title = engineStatus.message ?? '';
        run?.driverActive('voice', b.active);
        meterEl.hidden = !(meterOn && b.active);
        if (!b.active) meterFill.style.transform = 'scaleX(0)';
        lostBadge.hidden = !(lost && b.active);
        const say = statusAnnouncement(lastSpoken, b);
        if (say && engine) srStatus.textContent = lastSpoken = say;
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

      /** Voice driver start: re-centre on the current position, then listen. */
      function startListening(): void {
        if (!session) return;
        session.resync();
        if (engine?.id === 'webspeech' && !deps.settings.get().engine.privacyNoticeSeen) {
          privacy.hidden = false;
          return;
        }
        void session.start(); // inside the click/key: Web Speech needs a user gesture
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
        session.events.on('failed', () => {
          deps.notices.show(VOICE_FAILED_MESSAGE, 'warning');
          // Fall back to manual for this run; the stored mode stays Voice for next time.
          if (run.mode === 'voice') run.setMode('manual');
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

      // ---- run: mode, pause/resume, timed scroll, clock ----
      const words = new SpokenWords(index);
      timed = new TimedScroller(words, runSettings().timedWpm);
      let timedLoop: ReturnType<typeof setInterval> | undefined;
      const stopTimedLoop = () => clearInterval(timedLoop);
      const drivers: Record<RunMode, RunDriver> = {
        voice: { deferred: true, start: startListening, stop: () => session?.stop() },
        timed: {
          start: () => {
            timed.setPosition(ctl.position);
            if (timed.finished) return;
            timed.start(performance.now());
            stopTimedLoop();
            timedLoop = setInterval(() => {
              const p = timed.tick(performance.now());
              if (p !== null) ctl.set(p, 'timed');
              if (timed.finished) run.pause();
            }, PROMPTER_CONFIG.timedTickMs);
          },
          stop: () => {
            timed.pause();
            stopTimedLoop();
          },
        },
        manual: { start: () => {}, stop: () => {} },
      };
      // Without a voice engine the Voice mode is hidden and a stored "voice" runs as manual
      // (the stored setting is left alone, so it comes back where voice works).
      const stored = runSettings().mode;
      modeBtns.get('voice')!.hidden = !session;
      run = new RunController(stored === 'voice' && !session ? 'manual' : stored, drivers, () =>
        performance.now(),
      );
      cleanups.push(() => drivers[run.mode].stop(), stopTimedLoop);

      function chooseMode(m: RunMode): void {
        run.setMode(m);
        deps.settings.update({ run: { mode: m } });
      }

      const wake = new WakeLockKeeper((msg) =>
        deps.notices.show(msg, 'info', PROMPTER_CONFIG.noteMs),
      );
      cleanups.push(() => wake.destroy());

      function renderRun(): void {
        const { mode, active } = run;
        view.dataset.mode = mode;
        for (const [m, b] of modeBtns) b.setAttribute('aria-pressed', String(m === mode));
        runBtn.textContent = active ? 'Pause' : run.started ? 'Resume' : 'Start';
        runBtn.setAttribute('aria-pressed', String(active));
        runBtn.title =
          mode === 'voice'
            ? 'Start/pause listening (Space)'
            : mode === 'timed'
              ? 'Start/pause scrolling (Space)'
              : 'Start/pause the timer (Space)';
        wpmGroup.hidden = mode !== 'timed';
        wpmOut.value = `${runSettings().timedWpm} wpm`;
        badge.hidden = !session || mode !== 'voice';
      }

      function renderTimer(): void {
        const { timer, targetDurationSec } = runSettings();
        timerEl.hidden = timer === 'off';
        timerEl.dataset.display = timer;
        const elapsed = run.elapsed();
        timerClock.textContent = formatClock(elapsed);
        const p =
          targetDurationSec === null
            ? null
            : pace(elapsed, words.fraction(ctl.position), targetDurationSec * MS_PER_SEC);
        timerPace.textContent = p?.label ?? '';
        timerPace.hidden = !p?.label;
        timerPace.dataset.state = p?.state ?? '';
        timerEl.title = p?.projectedMs
          ? `Projected total ${formatClock(p.projectedMs)} (target ${formatClock(targetDurationSec! * MS_PER_SEC)})`
          : '';
      }
      const timerLoop = setInterval(renderTimer, PROMPTER_CONFIG.timerRefreshMs);
      cleanups.push(() => clearInterval(timerLoop));

      const resetTimer = button('Reset timer', () => run.resetClock());
      quick.panel.insertBefore(resetTimer, quick.panel.lastElementChild);

      // ---- auto-hiding controls ----
      let hideTimer: ReturnType<typeof setTimeout> | undefined;
      let pointerInBar = false;
      controlsHidden = () => view.dataset.controls === 'hidden';
      const overlayOpen = () => !quick.panel.hidden || !toast.hidden || !privacy.hidden;
      const hideAllowed = () =>
        canAutoHide({
          active: run.active,
          delayMs: runSettings().autoHideSec * MS_PER_SEC,
          overlayOpen: overlayOpen(),
          pointerInControls: pointerInBar || bar.contains(document.activeElement),
        });
      showControls = () => {
        if (controlsHidden()) {
          view.dataset.controls = 'shown';
          bar.inert = false;
        }
        scheduleHide();
      };
      scheduleHide = () => {
        clearTimeout(hideTimer);
        if (!run?.active) return;
        const delay = runSettings().autoHideSec * MS_PER_SEC;
        if (delay <= 0) return;
        hideTimer = setTimeout(() => {
          if (hideAllowed()) {
            view.dataset.controls = 'hidden';
            bar.inert = true;
            quick.close();
          } else if (run.active) {
            hideTimer = setTimeout(() => scheduleHide(), PROMPTER_CONFIG.autoHideRetryMs);
          }
        }, delay);
      };
      bar.addEventListener('pointerdown', () => scheduleHide());
      bar.addEventListener('pointerenter', () => (pointerInBar = true));
      bar.addEventListener('pointerleave', () => {
        pointerInBar = false;
        scheduleHide();
      });
      bar.addEventListener('focusin', () => scheduleHide());
      cleanups.push(() => clearTimeout(hideTimer));

      run.events.on('change', ({ active }) => {
        if (active) wake.enable(); // held from the first start until leaving the prompter
        if (active) scheduleHide();
        else showControls();
        renderRun();
        renderTimer();
      });
      cleanups.push(() => run.events.clear());

      // ---- fullscreen ----
      const onFs = () => {
        fsBtn.setAttribute('aria-pressed', String(isFullscreen()));
        fsBtn.ariaLabel = isFullscreen() ? 'Exit fullscreen' : 'Fullscreen';
      };
      document.addEventListener('fullscreenchange', onFs);
      cleanups.push(() => document.removeEventListener('fullscreenchange', onFs), exitFullscreen);
      onFs();

      // ---- keyboard / clicker (keys.ts) ----
      const nudge = (fn: () => void) => {
        fn();
        ctl.attach();
        follow({ backward: true, force: true }, 'ease');
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || !privacy.hidden) return;
        if (isTypingTarget(e.target as HTMLElement | null, e.key)) return;
        const action = actionForKey(e);
        if (!action) return;
        e.preventDefault();
        if (e.repeat && (action === 'toggle-run' || action === 'fullscreen')) return;
        switch (action) {
          case 'toggle-run':
            return run.toggle();
          case 'line-next':
            return nudge(() => ctl.nudgeLines(1));
          case 'line-prev':
            return nudge(() => ctl.nudgeLines(-1));
          case 'para-next':
            return nudge(() => ctl.nudgeParagraphs(1));
          case 'para-prev':
            return nudge(() => ctl.nudgeParagraphs(-1));
          case 'home':
            return nudge(() => ctl.reset());
          case 'font-smaller':
          case 'font-larger':
            return deps.settings.update({
              appearance: {
                fontSizePx: stepFontSize(
                  appearance.fontSizePx,
                  action === 'font-larger' ? 1 : -1,
                  SETTINGS_LIMITS.fontSizePx,
                ),
              },
            });
          case 'fullscreen':
            if (fullscreenSupported()) void toggleFullscreen();
            return;
          case 'show-controls':
            return showControls();
        }
      };
      document.addEventListener('keydown', onKey);
      cleanups.push(() => document.removeEventListener('keydown', onKey));

      view.dataset.controls = 'shown';
      renderRun();
      renderTimer();
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
