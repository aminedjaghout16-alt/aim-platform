/* ============================================
   Training Menu — in-session HUD, pause menu and settings
   Pure presentational components used by TrainingGameplay.
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

(function () {
  const TM = VantageComponents;

  const CROSSHAIR_COLORS = [
    { id: '#00e0d0', label: 'Teal' },
    { id: '#ffffff', label: 'White' },
    { id: '#00e676', label: 'Green' },
    { id: '#ffe600', label: 'Yellow' },
    { id: '#ff3df2', label: 'Magenta' },
    { id: '#ff3d5a', label: 'Red' },
  ];

  const TARGET_COLORS = [
    { id: '#ff2d95', label: 'Hot pink' },
    { id: '#39ff14', label: 'Neon green' },
    { id: '#1e6bff', label: 'Electric blue' },
    { id: '#ff7a00', label: 'Orange' },
    { id: '#ff2020', label: 'Red' },
    { id: '#00e0d0', label: 'Teal' },
    { id: '#ffe600', label: 'Yellow' },
    { id: '#a64dff', label: 'Purple' },
  ];

  /* ---------- Formatting helpers ---------- */

  function fmtClock(totalSeconds) {
    const t = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  // Remaining time: M:SS, switching to tenths in the last 10 seconds
  TM.formatRemaining = function formatRemaining(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 10) return s.toFixed(1);
    return fmtClock(Math.ceil(s));
  };
  TM.formatElapsed = fmtClock;

  /* ---------- Crosshair ---------- */

  TM.CrosshairView = function CrosshairView({ crosshair, hit }) {
    const ch = crosshair;
    return e('div', {
      className: `vcrosshair ${hit ? 'vcrosshair-hit' : ''}`,
      style: {
        '--ch-color': ch.color,
        '--ch-len': `${ch.length}px`,
        '--ch-thick': `${ch.thickness}px`,
        '--ch-gap': `${ch.gap}px`,
        '--ch-dot': `${ch.thickness + 1}px`,
        '--ch-alpha': ch.opacity / 100,
      },
    },
      ch.dot && e('div', { className: 'vcrosshair-dot' }),
      e('div', { className: 'vcrosshair-line vcrosshair-top' }),
      e('div', { className: 'vcrosshair-line vcrosshair-bottom' }),
      e('div', { className: 'vcrosshair-line vcrosshair-left' }),
      e('div', { className: 'vcrosshair-line vcrosshair-right' }),
      hit && e('div', { className: 'vhitmarker' },
        e('div', { className: 'vhitmarker-line vhitmarker-1' }),
        e('div', { className: 'vhitmarker-line vhitmarker-2' }),
      ),
    );
  };

  /* ---------- HUD ---------- */

  function HudStat({ label, value, sub, tone, big }) {
    return e('div', { className: `vtm-stat ${big ? 'vtm-stat-big' : ''}` },
      e('span', { className: 'vtm-stat-label' }, label),
      e('span', { className: `vtm-stat-value ${tone ? 'vtm-tone-' + tone : ''}` }, value),
      sub && e('span', { className: 'vtm-stat-sub' }, sub),
    );
  }

  // props: timerText, timerLabel, timerLow, timeFraction (0..1 elapsed or null), score, accuracy (number|null),
  //        hits, shots, avgReaction (ms|null), difficultyLabel, progression (0..1)
  TM.TrainingHud = function TrainingHud(p) {
    const pct = Math.round((p.progression || 0) * 100);
    return e('div', { className: 'vtm-hud' },
      e('div', { className: 'vtm-hud-row' },
        e('div', { className: 'vtm-hud-side vtm-hud-left' },
          e(HudStat, { label: 'Score', value: p.score, big: true }),
          e(HudStat, { label: 'Accuracy', value: p.accuracy === null ? '—' : `${p.accuracy}%` }),
        ),
        e('div', { className: 'vtm-hud-center' },
          e('div', { className: 'vtm-timer-label' }, p.timerLabel),
          e('div', { className: `vtm-timer ${p.timerLow ? 'vtm-timer-low' : ''}` }, p.timerText),
          p.timeFraction !== null && e('div', { className: 'vtm-timebar' },
            e('i', { style: { width: `${Math.min(100, Math.max(0, p.timeFraction * 100))}%` } }),
          ),
          e('div', { className: 'vtm-diff' },
            e('span', null, p.difficultyLabel),
            e('span', { className: 'vtm-diff-sep' }, '·'),
            e('span', { className: 'vtm-diff-label' }, 'Intensity'),
            e('span', { className: 'vtm-intensity' }, e('i', { style: { width: `${pct}%` } })),
            e('span', { className: 'vtm-diff-pct' }, `${pct}%`),
          ),
        ),
        e('div', { className: 'vtm-hud-side vtm-hud-right' },
          e(HudStat, { label: 'Hits', value: p.hits, sub: `of ${p.shots} shot${p.shots === 1 ? '' : 's'}`, big: true }),
          e(HudStat, { label: 'Avg reaction', value: p.avgReaction === null ? '—' : `${p.avgReaction}ms` }),
        ),
      ),
    );
  };

  // Small bottom-left reminder while playing
  TM.PauseHint = function PauseHint() {
    return e('div', { className: 'vtm-hint' }, e('kbd', null, 'ESC'), ' pause');
  };

  /* ---------- Small building blocks ---------- */

  function MenuButton({ label, hint, variant = 'secondary', onClick, autoFocus, icon }) {
    return e('button', {
      type: 'button',
      className: `vtm-btn vtm-btn-${variant}`,
      onClick,
      autoFocus,
    },
      icon && e('span', { className: 'vtm-btn-icon' }, icon),
      e('span', { className: 'vtm-btn-label' }, label),
      hint && e('kbd', null, hint),
    );
  }

  // Slider with a typeable number box. onCommit fires when the drag/keypress ends (for audio previews).
  function MenuSlider({ label, value, min, max, step, unit, decimals = 0, onChange, onCommit, note }) {
    const [text, setText] = useState(null); // null → show the live value
    const shown = text !== null ? text : Number(value).toFixed(decimals);
    const pct = ((value - min) / (max - min)) * 100;

    const commitText = () => {
      if (text === null) return;
      const n = parseFloat(String(text).replace(',', '.'));
      setText(null);
      if (isFinite(n)) {
        const c = Math.min(max, Math.max(min, n));
        onChange(c);
        if (onCommit) onCommit(c);
      }
    };

    return e('div', { className: 'vtm-slider' },
      e('div', { className: 'vtm-slider-head' },
        e('span', { className: 'vtm-label' }, label),
        e('span', { className: 'vtm-numwrap' },
          e('input', {
            className: 'vtm-num',
            type: 'text',
            inputMode: 'decimal',
            value: shown,
            'aria-label': label,
            onFocus: (ev) => { setText(Number(value).toFixed(decimals)); ev.target.select(); },
            onChange: (ev) => setText(ev.target.value),
            onBlur: commitText,
            onKeyDown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } },
          }),
          e('span', { className: 'vtm-unit' }, unit || ''),
        ),
      ),
      e('input', {
        type: 'range',
        className: 'vtm-range',
        min, max, step, value,
        'aria-label': label,
        style: { '--pct': `${pct}%` },
        onChange: (ev) => onChange(Number(ev.target.value)),
        onPointerUp: () => onCommit && onCommit(value),
        onKeyUp: () => onCommit && onCommit(value),
      }),
      note && e('div', { className: 'vtm-note' }, note),
    );
  }

  function Segmented({ label, value, options, onChange, activeValue }) {
    return e('div', { className: 'vtm-seg-group' },
      e('span', { className: 'vtm-label' }, label),
      e('div', { className: 'vtm-seg' },
        options.map((o) => e('button', {
          key: o.id,
          type: 'button',
          className: `vtm-seg-btn ${value === o.id ? 'vtm-seg-on' : ''} ${activeValue === o.id ? 'vtm-seg-live' : ''}`,
          onClick: () => onChange(o.id),
          title: activeValue === o.id ? 'Currently in use' : undefined,
        }, o.label)),
      ),
    );
  }

  /* ---------- Pause menu (main view) ---------- */

  // props: scenarioName, snapshot {remaining, score, accuracy, hits}, isEndless, lockError,
  //        onResume, onRestart, onSettings, onQuit, onEndSession
  TM.PauseMenu = function PauseMenu(p) {
    const s = p.snapshot;
    return e('div', { className: 'vtm-card vtm-pause', role: 'dialog', 'aria-label': 'Pause menu' },
      e('div', { className: 'vtm-eyebrow' }, p.scenarioName),
      e('h2', { className: 'vtm-title' }, 'Paused'),
      e('div', { className: 'vtm-snapshot' },
        [
          [p.isEndless ? 'Elapsed' : 'Remaining', s.time],
          ['Score', s.score],
          ['Accuracy', s.accuracy === null ? '—' : `${s.accuracy}%`],
          ['Hits', s.hits],
        ].map(([label, value]) => e('div', { key: label, className: 'vtm-snap' },
          e('span', { className: 'vtm-snap-value' }, value),
          e('span', { className: 'vtm-snap-label' }, label),
        )),
      ),
      p.lockError && e('div', { className: 'vtm-error' }, 'Your browser blocked mouse capture. Click RESUME again.'),
      e('div', { className: 'vtm-btn-stack' },
        e(MenuButton, { label: 'Resume', hint: 'Esc', variant: 'primary', onClick: p.onResume, autoFocus: true }),
        e(MenuButton, { label: 'Restart Training', hint: 'R', onClick: p.onRestart }),
        e(MenuButton, { label: 'Settings', hint: 'S', onClick: p.onSettings }),
        p.isEndless && e(MenuButton, { label: 'End Session & View Results', onClick: p.onEndSession }),
        e(MenuButton, { label: 'Quit to Training Library', hint: 'Q', variant: 'danger', onClick: p.onQuit }),
      ),
      e('div', { className: 'vtm-footnote' }, 'Resuming recaptures your mouse. Your clock and stats are frozen while paused.'),
    );
  };

  /* ---------- Confirm panel ---------- */

  // props: title, body, confirmLabel, danger, onConfirm, onCancel
  TM.ConfirmPanel = function ConfirmPanel(p) {
    return e('div', { className: 'vtm-card vtm-confirm', role: 'alertdialog', 'aria-label': p.title },
      e('h2', { className: 'vtm-title vtm-title-sm' }, p.title),
      e('p', { className: 'vtm-confirm-body' }, p.body),
      e('div', { className: 'vtm-confirm-actions' },
        e(MenuButton, { label: 'Cancel', hint: 'Esc', onClick: p.onCancel, autoFocus: true }),
        e(MenuButton, { label: p.confirmLabel, variant: p.danger ? 'danger' : 'primary', onClick: p.onConfirm }),
      ),
    );
  };

  /* ---------- Settings panel ---------- */

  const TABS = [
    { id: 'controls', label: 'Controls' },
    { id: 'audio', label: 'Audio' },
    { id: 'crosshair', label: 'Crosshair' },
    { id: 'targets', label: 'Targets' },
  ];

  // props:
  //  tab, onTab, onBack, onResetTab
  //  prefs, onPrefs(patch)               — fov, volumes, crosshair
  //  sensitivity, onSensitivity(v), cm360, gameName, dpi
  //  pending, onPending(patch), live     — staged target settings and the ones currently in use
  //  canApply, applyLabel, onApply
  //  onPreviewSound()
  TM.SettingsPanel = function SettingsPanel(p) {
    const S = VantageEngine.Settings;
    const R = VantageEngine.PlayerPrefs.RANGES;
    const prefs = p.prefs;
    const ch = prefs.crosshair;
    const setCh = (patch) => p.onPrefs({ crosshair: patch });

    let body;
    if (p.tab === 'controls') {
      body = e('div', { className: 'vtm-tabbody' },
        e(MenuSlider, {
          label: 'Mouse sensitivity',
          value: p.sensitivity, min: 0.05, max: 20, step: 0.05, decimals: 2,
          onChange: p.onSensitivity,
          note: p.cm360 > 0
            ? `≈ ${p.cm360} cm per 360° · ${p.gameName} sensitivity at ${p.dpi} DPI · applies instantly`
            : 'Applies instantly',
        }),
        e(MenuSlider, {
          label: 'Field of view',
          value: prefs.fov, min: R.fov[0], max: R.fov[1], step: 1, unit: '°',
          onChange: (v) => p.onPrefs({ fov: v }),
          note: 'Vertical FOV. Default 75°.',
        }),
      );
    } else if (p.tab === 'audio') {
      body = e('div', { className: 'vtm-tabbody' },
        e(MenuSlider, {
          label: 'Master volume', value: prefs.masterVolume, min: 0, max: 100, step: 1, unit: '%',
          onChange: (v) => p.onPrefs({ masterVolume: v }), onCommit: p.onPreviewSound,
        }),
        e(MenuSlider, {
          label: 'Music volume', value: prefs.musicVolume, min: 0, max: 100, step: 1, unit: '%',
          onChange: (v) => p.onPrefs({ musicVolume: v }),
        }),
        e(MenuSlider, {
          label: 'Sound effects volume', value: prefs.sfxVolume, min: 0, max: 100, step: 1, unit: '%',
          onChange: (v) => p.onPrefs({ sfxVolume: v }), onCommit: p.onPreviewSound,
          note: 'Hit, miss and countdown sounds. Releasing a slider plays a preview.',
        }),
      );
    } else if (p.tab === 'crosshair') {
      body = e('div', { className: 'vtm-tabbody vtm-ch-body' },
        e('div', { className: 'vtm-ch-preview', 'aria-label': 'Crosshair preview' },
          e(TM.CrosshairView, { crosshair: ch, hit: false }),
        ),
        e('div', { className: 'vtm-ch-controls' },
          e('div', { className: 'vtm-swatch-row' },
            e('span', { className: 'vtm-label' }, 'Color'),
            e('div', { className: 'vtm-swatches' },
              CROSSHAIR_COLORS.map((c) => e('button', {
                key: c.id, type: 'button', title: c.label, 'aria-label': c.label,
                className: `vtm-swatch ${ch.color.toLowerCase() === c.id ? 'vtm-swatch-on' : ''}`,
                style: { background: c.id },
                onClick: () => setCh({ color: c.id }),
              })),
              e('label', { className: 'vtm-swatch vtm-swatch-custom', title: 'Custom color' },
                e('input', {
                  type: 'color', value: ch.color, 'aria-label': 'Custom crosshair color',
                  onChange: (ev) => setCh({ color: ev.target.value }),
                }),
              ),
            ),
          ),
          e(MenuSlider, { label: 'Length', value: ch.length, min: R.length[0], max: R.length[1], step: 1, unit: 'px', onChange: (v) => setCh({ length: v }) }),
          e(MenuSlider, { label: 'Thickness', value: ch.thickness, min: R.thickness[0], max: R.thickness[1], step: 1, unit: 'px', onChange: (v) => setCh({ thickness: v }) }),
          e(MenuSlider, { label: 'Center gap', value: ch.gap, min: R.gap[0], max: R.gap[1], step: 1, unit: 'px', onChange: (v) => setCh({ gap: v }) }),
          e(MenuSlider, { label: 'Opacity', value: ch.opacity, min: R.opacity[0], max: R.opacity[1], step: 1, unit: '%', onChange: (v) => setCh({ opacity: v }) }),
          e('div', { className: 'vtm-toggle-row' },
            e('span', { className: 'vtm-label' }, 'Center dot'),
            e('button', {
              type: 'button', role: 'switch', 'aria-checked': ch.dot,
              className: `vtoggle ${ch.dot ? 'vtoggle-on' : ''}`,
              onClick: () => setCh({ dot: !ch.dot }),
            }, e('span', { className: 'vtoggle-knob' })),
          ),
        ),
      );
    } else {
      body = e('div', { className: 'vtm-tabbody' },
        e('div', { className: 'vtm-swatch-row' },
          e('span', { className: 'vtm-label' }, 'Target color'),
          e('div', { className: 'vtm-swatches' },
            TARGET_COLORS.map((c) => e('button', {
              key: c.id, type: 'button', title: c.label, 'aria-label': c.label,
              className: `vtm-swatch ${String(prefs.targetColor || '').toLowerCase() === c.id ? 'vtm-swatch-on' : ''}`,
              style: { background: c.id },
              onClick: () => p.onPrefs({ targetColor: c.id }),
            })),
            e('label', { className: 'vtm-swatch vtm-swatch-custom', title: 'Custom color' },
              e('input', {
                type: 'color', value: prefs.targetColor || '#ff2d95', 'aria-label': 'Custom target color',
                onChange: (ev) => p.onPrefs({ targetColor: ev.target.value }),
              }),
            ),
          ),
        ),
        e('div', { className: 'vtm-note vtm-note-block' }, 'Target color applies instantly, even to targets already on screen.'),
        e(Segmented, {
          label: 'Target size', value: p.pending.targetSize, activeValue: p.live.targetSize,
          options: S.getAllTargetSizes(), onChange: (v) => p.onPending({ targetSize: v }),
        }),
        e(Segmented, {
          label: 'Target speed', value: p.pending.targetSpeed, activeValue: p.live.targetSpeed,
          options: S.getAllTargetSpeeds(), onChange: (v) => p.onPending({ targetSpeed: v }),
        }),
        e(Segmented, {
          label: 'Difficulty', value: p.pending.difficulty, activeValue: p.live.difficulty,
          options: S.getAllDifficulties(), onChange: (v) => p.onPending({ difficulty: v }),
        }),
        e('div', { className: 'vtm-note vtm-note-block' },
          'Target changes apply on restart, so every score in a run is earned under one set of conditions. ',
          e('span', { className: 'vtm-legend' }, e('i', { className: 'vtm-legend-dot' }), ' = in use now')),
        e('div', { className: 'vtm-apply-row' },
          p.canApply && e('span', { className: 'vtm-pending-chip' }, 'Unapplied changes'),
          e('button', {
            type: 'button',
            className: 'vtm-btn vtm-btn-primary vtm-btn-inline',
            disabled: !p.canApply,
            onClick: p.onApply,
          }, e('span', { className: 'vtm-btn-label' }, p.applyLabel)),
        ),
      );
    }

    return e('div', { className: 'vtm-card vtm-settings', role: 'dialog', 'aria-label': 'Settings' },
      e('div', { className: 'vtm-settings-head' },
        e('h2', { className: 'vtm-title vtm-title-sm' }, 'Settings'),
        e('button', { type: 'button', className: 'vtm-back', onClick: p.onBack }, '← Back ', e('kbd', null, 'Esc')),
      ),
      e('div', { className: 'vtm-tabs', role: 'tablist' },
        TABS.map((t) => e('button', {
          key: t.id, type: 'button', role: 'tab', 'aria-selected': p.tab === t.id,
          className: `vtm-tab ${p.tab === t.id ? 'vtm-tab-on' : ''}`,
          onClick: () => p.onTab(t.id),
        }, t.label)),
      ),
      body,
      e('div', { className: 'vtm-settings-foot' },
        p.tab !== 'targets' && e('button', { type: 'button', className: 'vtm-link', onClick: p.onResetTab }, 'Reset this tab'),
        e('span', { className: 'vtm-foot-spacer' }),
        e('span', { className: 'vtm-saved' }, 'Saved automatically'),
      ),
    );
  };
})();
