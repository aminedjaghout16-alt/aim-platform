/* ============================================
   Tactical Scenarios — VALORANT-style training mode selection
   ============================================ */
(function () {
  var styleId = 'vantage-tactical-scenarios-css';
  if (!document.getElementById(styleId)) {
    var el = document.createElement('style');
    el.id = styleId;
    el.textContent = [
      '.vtactical-header { display:flex; align-items:center; gap:12px; margin-bottom:8px; }',
      '.vtactical-back-btn { margin-bottom:16px; }',

      '.vscenario-grid.tactical { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:20px; }',

      '.vscenario-card.tactical { position:relative; background:var(--bg-secondary,#1a1a1f); border-radius:12px; overflow:hidden; transition:transform .2s ease, box-shadow .2s ease; }',
      '.vscenario-card.tactical::before { content:""; position:absolute; inset:0; border-radius:12px; padding:1px; background:linear-gradient(135deg,var(--accent-primary,#00e0d0) 0%,transparent 50%,var(--accent-secondary,#448aff) 100%); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; opacity:.45; transition:opacity .25s ease; }',
      '.vscenario-card.tactical:hover { transform:translateY(-3px); box-shadow:0 8px 32px rgba(0,224,208,.12); }',
      '.vscenario-card.tactical:hover::before { opacity:.85; }',

      '.vtactical-card-glow { position:absolute; top:-40%; left:-20%; width:140%; height:80%; background:radial-gradient(ellipse at center,rgba(0,224,208,.06) 0%,transparent 70%); pointer-events:none; }',

      '.vtactical-weapons { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }',
      '.vtactical-weapon-tag { font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(255,255,255,.06); color:var(--text-secondary,#8b8fa3); border:1px solid rgba(255,255,255,.06); letter-spacing:.3px; }',

      '.vtactical-best-score { display:flex; align-items:center; gap:6px; padding:8px 0 0; border-top:1px solid rgba(255,255,255,.06); margin-top:8px; }',
      '.vtactical-best-score-label { font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--text-secondary,#8b8fa3); }',
      '.vtactical-best-score-value { font-size:15px; font-weight:700; color:var(--accent-primary,#00e0d0); }',
    ].join('\n');
    document.head.appendChild(el);
  }
})();

window.VantagePages = window.VantagePages || {};

VantagePages.TacticalScenarios = function TacticalScenarios({ onNavigate, onSelectScenario, onQuickStart, onStartTraining, user }) {
  var scenarios = VantageEngine.Scenarios.getTactical();
  var Settings = VantageEngine.Settings;

  var uid = user ? user.uid : null;
  var _s = useState({});
  var personalBests = _s[0];
  var setPersonalBests = _s[1];

  useEffect(function () {
    if (!uid) return;
    var cancelled = false;
    var DB = VantageServices.DatabaseService;
    DB.getUserResults(uid).then(function (results) {
      if (cancelled) return;
      var bests = {};
      results.forEach(function (r) {
        var sid = r.scenarioId;
        if (!bests[sid] || (r.score || 0) > bests[sid]) {
          bests[sid] = r.score || 0;
        }
      });
      setPersonalBests(bests);
    }).catch(function () {});
    return function () { cancelled = true; };
  }, [uid]);

  var getDifficultyColor = function (diff) {
    var map = { easy: '#00e676', medium: '#ffb830', hard: '#ff3d5a' };
    return map[diff] || '#8b8fa3';
  };

  var getWeaponName = function (id) {
    var w = VantageEngine.Weapons && VantageEngine.Weapons.getById ? VantageEngine.Weapons.getById(id) : null;
    return w ? w.name : id;
  };

  return e('div', { className: 'vpage-training' },
    e('div', { className: 'vtactical-back-btn animate-in' },
      e(VantageUI.Button, {
        variant: 'ghost',
        onClick: function () { onNavigate('training'); },
      }, '\u2190 BACK TO LIBRARY'),
    ),

    e(VantageUI.PageHeader, {
      title: 'Tactical Scenarios',
      subtitle: 'VALORANT-style training \u2014 counter-strafe, peek, micro-adjust, track movers, and duel under pressure',
    }),

    scenarios.length > 0
      ? e('div', { className: 'vscenario-grid tactical' },
          scenarios.map(function (s, i) {
            var cat = VantageEngine.Categories.getById(s.category);
            var weapons = (s.allowedWeapons || []).map(getWeaponName);
            var best = personalBests[s.id];

            return e('div', { key: s.id, className: 'animate-in stagger-' + Math.min(i + 1, 6) },
              e(VantageUI.Card, {
                className: 'vscenario-card tactical',
                hover: true,
                onClick: function () { onStartTraining(s.id, s.defaults); },
              },
                e('div', { className: 'vtactical-card-glow' }),

                e('div', { className: 'vscenario-card-header' },
                  e('div', {
                    className: 'vscenario-icon',
                    style: { color: cat ? cat.color : 'var(--accent-primary)' },
                  }, cat ? cat.icon : '\u25CE'),
                  e('div', { className: 'vscenario-badges' },
                    cat && e(VantageUI.Badge, {
                      color: cat.color,
                      variant: 'outline',
                    }, cat.shortName || cat.name),
                    e(VantageUI.Badge, {
                      color: getDifficultyColor(s.difficulty),
                      variant: 'outline',
                    }, s.difficulty),
                  ),
                ),

                e('h3', { className: 'vscenario-name' }, s.name),
                e('p', { className: 'vscenario-desc' }, s.description),

                e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'SKILLS'),
                  e('div', { className: 'vscenario-skills-list' },
                    s.skillsTrained.slice(0, 3).map(function (skill) {
                      return e('span', { key: skill, className: 'vscenario-skill' }, skill);
                    }),
                  ),
                ),

                weapons.length > 0 && e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'WEAPONS'),
                  e('div', { className: 'vtactical-weapons' },
                    weapons.map(function (name) {
                      return e('span', { key: name, className: 'vtactical-weapon-tag' }, name);
                    }),
                  ),
                ),

                e('div', { className: 'vscenario-meta' },
                  e('div', { className: 'vscenario-meta-item' },
                    e('span', { className: 'vscenario-meta-label' }, 'DURATION'),
                    e('span', { className: 'vscenario-meta-value' }, s.estimatedDuration),
                  ),
                  e('div', { className: 'vscenario-meta-item' },
                    e('span', { className: 'vscenario-meta-label' }, 'TYPE'),
                    e('span', { className: 'vscenario-meta-value' }, s.trainingType),
                  ),
                ),

                best !== undefined && e('div', { className: 'vtactical-best-score' },
                  e('span', { className: 'vtactical-best-score-label' }, 'BEST'),
                  e('span', { className: 'vtactical-best-score-value' }, best),
                ),

                e('div', { className: 'vscenario-footer' },
                  e(VantageUI.Button, {
                    variant: 'primary',
                    size: 'sm',
                    onClick: function (ev) {
                      ev.stopPropagation();
                      onStartTraining(s.id, s.defaults);
                    },
                  }, 'START'),
                ),
              ),
            );
          }),
        )
      : e(VantageUI.EmptyState, {
          icon: '\u25CE',
          title: 'No tactical scenarios available',
          description: 'Tactical scenarios will be added soon.',
          action: e(VantageUI.Button, {
            variant: 'secondary',
            size: 'sm',
            onClick: function () { onNavigate('training'); },
          }, 'BACK TO LIBRARY'),
        }),
  );
};
