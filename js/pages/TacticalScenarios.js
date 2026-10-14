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
      '.vtactical-weapon-tag { font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(255,255,255,.06); color:var(--text-secondary,#8b8fa3); border:1px solid rgba(255,255,255,.06); letter-spacing:.3px; cursor:pointer; transition:all .2s ease; }',
      '.vtactical-weapon-tag.selected { background:rgba(0,224,208,.12); color:var(--accent-primary,#00e0d0); border-color:var(--accent-primary,#00e0d0); }',

      '.vtactical-best-score { display:flex; align-items:center; gap:6px; padding:8px 0 0; border-top:1px solid rgba(255,255,255,.06); margin-top:8px; }',
      '.vtactical-best-score-label { font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--text-secondary,#8b8fa3); }',
      '.vtactical-best-score-value { font-size:15px; font-weight:700; color:var(--accent-primary,#00e0d0); }',

      '.vtactical-diff-selector { display:flex; gap:6px; margin:10px 0 6px; }',
      '.vtactical-diff-pill { flex:1; padding:6px 0; border-radius:6px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); color:var(--text-secondary,#8b8fa3); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.8px; text-align:center; cursor:pointer; transition:all .2s ease; user-select:none; }',
      '.vtactical-diff-pill:hover { background:rgba(255,255,255,.08); }',
      '.vtactical-diff-pill.active-easy { background:rgba(0,230,118,.15); border-color:#00e676; color:#00e676; box-shadow:0 0 12px rgba(0,230,118,.2); }',
      '.vtactical-diff-pill.active-medium { background:rgba(255,184,48,.15); border-color:#ffb830; color:#ffb830; box-shadow:0 0 12px rgba(255,184,48,.2); }',
      '.vtactical-diff-pill.active-hard { background:rgba(255,61,90,.15); border-color:#ff3d5a; color:#ff3d5a; box-shadow:0 0 12px rgba(255,61,90,.2); }',
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

  var _diffState = useState({});
  var selectedDiffs = _diffState[0];
  var setSelectedDiffs = _diffState[1];

  var _weaponState = useState({});
  var selectedWeapons = _weaponState[0];
  var setSelectedWeapons = _weaponState[1];

  useEffect(function () {
    if (!uid) return;
    var cancelled = false;
    var DB = VantageServices.DatabaseService;
    DB.getUserResults(uid).then(function (results) {
      if (cancelled) return;
      var bests = {};
      results.forEach(function (r) {
        var diff = (r.config && r.config.difficulty) ? r.config.difficulty : null;
        var key = diff ? r.scenarioId + ':' + diff : r.scenarioId;
        if (!bests[key] || (r.score || 0) > bests[key]) {
          bests[key] = r.score || 0;
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

  var isDuelScenario = function (s) {
    var name = (s.name || '').toLowerCase();
    return name.indexOf('sheriff') !== -1 || name.indexOf('classic') !== -1 || name.indexOf('duel') !== -1;
  };

  var getScenarioDifficulties = function () {
    var diffs = ['easy', 'medium', 'hard'];
    var available = [];
    for (var i = 0; i < diffs.length; i++) {
      var info = Settings.getDifficulty ? Settings.getDifficulty(diffs[i]) : null;
      if (info) {
        available.push(diffs[i]);
      } else {
        available.push(diffs[i]);
      }
    }
    return available;
  };

  var getSelectedDiff = function (scenarioId) {
    return selectedDiffs[scenarioId] || 'medium';
  };

  var getSelectedWeapon = function (scenarioId, weapons) {
    if (selectedWeapons[scenarioId]) return selectedWeapons[scenarioId];
    return weapons.length > 0 ? weapons[0] : null;
  };

  var handleDiffSelect = function (scenarioId, diff) {
    setSelectedDiffs(function (prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[scenarioId] = diff;
      return next;
    });
  };

  var handleWeaponSelect = function (scenarioId, weaponId) {
    setSelectedWeapons(function (prev) {
      var next = {};
      for (var k in prev) { next[k] = prev[k]; }
      next[scenarioId] = weaponId;
      return next;
    });
  };

  var handleStart = function (scenario, ev) {
    if (ev) ev.stopPropagation();
    var diff = getSelectedDiff(scenario.id);
    var config = {
      difficulty: diff,
      duration: 'endless',
      targetSize: scenario.defaults.targetSize,
      targetSpeed: scenario.defaults.targetSpeed,
    };
    if (isDuelScenario(scenario)) {
      var weapons = (scenario.allowedWeapons || []).map(function (wid) {
        var w = VantageEngine.Weapons && VantageEngine.Weapons.getById ? VantageEngine.Weapons.getById(wid) : null;
        return w ? w.id || wid : wid;
      });
      var selWeapon = getSelectedWeapon(scenario.id, weapons);
      if (selWeapon) {
        var lowName = (getWeaponName(selWeapon) || '').toLowerCase();
        if (lowName.indexOf('sheriff') !== -1 || lowName.indexOf('classic') !== -1) {
          config.weapon = selWeapon;
        }
      }
    }
    onStartTraining(scenario.id, config);
  };

  var allDiffs = getScenarioDifficulties();

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
            var weaponIds = s.allowedWeapons || [];
            var weaponNames = weaponIds.map(getWeaponName);
            var duel = isDuelScenario(s);
            var duelWeapons = duel ? weaponIds.filter(function (wid) {
              var wname = (getWeaponName(wid) || '').toLowerCase();
              return wname.indexOf('sheriff') !== -1 || wname.indexOf('classic') !== -1;
            }) : [];
            var curDiff = getSelectedDiff(s.id);
            var bestKey = s.id + ':' + curDiff;
            var best = personalBests[bestKey];

            return e('div', { key: s.id, className: 'animate-in stagger-' + Math.min(i + 1, 6) },
              e(VantageUI.Card, {
                className: 'vscenario-card tactical',
                hover: true,
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
                  ),
                ),

                e('h3', { className: 'vscenario-name' }, s.name),
                e('p', { className: 'vscenario-desc' }, s.description),

                e('div', { className: 'vtactical-diff-selector' },
                  allDiffs.map(function (diff) {
                    var isActive = curDiff === diff;
                    var cls = 'vtactical-diff-pill' + (isActive ? ' active-' + diff : '');
                    return e('div', {
                      key: diff,
                      className: cls,
                      onClick: function (ev) {
                        ev.stopPropagation();
                        handleDiffSelect(s.id, diff);
                      },
                    }, diff);
                  }),
                ),

                duel && duelWeapons.length > 0 && e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'WEAPON'),
                  e('div', { className: 'vtactical-weapons' },
                    duelWeapons.map(function (wid) {
                      var wname = getWeaponName(wid);
                      var curWeapon = getSelectedWeapon(s.id, duelWeapons);
                      var isSelected = curWeapon === wid;
                      return e('span', {
                        key: wid,
                        className: 'vtactical-weapon-tag' + (isSelected ? ' selected' : ''),
                        onClick: function (ev) {
                          ev.stopPropagation();
                          handleWeaponSelect(s.id, wid);
                        },
                      }, wname);
                    }),
                  ),
                ),

                !duel && weaponNames.length > 0 && e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'WEAPONS'),
                  e('div', { className: 'vtactical-weapons' },
                    weaponNames.map(function (name) {
                      return e('span', { key: name, className: 'vtactical-weapon-tag' }, name);
                    }),
                  ),
                ),

                e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'SKILLS'),
                  e('div', { className: 'vscenario-skills-list' },
                    s.skillsTrained.slice(0, 3).map(function (skill) {
                      return e('span', { key: skill, className: 'vscenario-skill' }, skill);
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
                  e('span', { className: 'vtactical-best-score-label' }, 'BEST (' + curDiff + ')'),
                  e('span', { className: 'vtactical-best-score-value' }, best),
                ),

                e('div', { className: 'vscenario-footer' },
                  e(VantageUI.Button, {
                    variant: 'primary',
                    size: 'sm',
                    onClick: function (ev) { handleStart(s, ev); },
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
