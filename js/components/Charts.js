/* ============================================
   Vantage Charts — Lightweight SVG Chart Components
   No external dependencies. Uses CSS variables.
   ============================================ */
window.VantageCharts = window.VantageCharts || {};

(function () {
  var e = React.createElement;
  var useState = React.useState;
  var useRef = React.useRef;
  var useCallback = React.useCallback;
  var useEffect = React.useEffect;

  function fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return Math.round(n * 10) / 10;
  }

  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt)) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getDate();
  }

  function emptyMessage(text) {
    return e('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: '120px', color: 'var(--text-secondary)',
        fontSize: '13px', letterSpacing: '0.5px',
      },
    }, text || 'No data');
  }

  /* ─── LineChart ─────────────────────────────────────── */

  VantageCharts.LineChart = function LineChart(props) {
    var data = props.data || [];
    var title = props.title || '';
    var color = props.color || 'var(--accent-primary)';
    var height = props.height || 200;
    var showDots = props.showDots !== false;
    var showArea = props.showArea || false;
    var yLabel = props.yLabel || '';

    var svgRef = useRef(null);
    var _s = useState(null);
    var tooltip = _s[0];
    var setTooltip = _s[1];

    var W = 600;
    var H = height;
    var pad = { top: 20, right: 20, bottom: 36, left: 50 };
    var cw = W - pad.left - pad.right;
    var ch = H - pad.top - pad.bottom;

    if (!data.length) {
      return e('div', { className: 'vchart-container' },
        title && e('div', { className: 'vchart-title' }, title),
        emptyMessage(),
      );
    }

    var yVals = data.map(function (d) { return d.y; });
    var yMin = Math.min.apply(null, yVals);
    var yMax = Math.max.apply(null, yVals);
    var yPad = (yMax - yMin) * 0.1 || 10;
    yMin = Math.floor(yMin - yPad);
    yMax = Math.ceil(yMax + yPad);
    if (yMin < 0) yMin = 0;

    var xScale = function (i) { return pad.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2); };
    var yScale = function (v) { return pad.top + ch - ((v - yMin) / (yMax - yMin || 1)) * ch; };

    var pathD = '';
    var areaD = '';
    for (var i = 0; i < data.length; i++) {
      var px = xScale(i);
      var py = yScale(data[i].y);
      pathD += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
      if (showArea) {
        areaD += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ',' + py.toFixed(1);
      }
    }
    if (showArea && data.length > 1) {
      areaD += 'L' + xScale(data.length - 1).toFixed(1) + ',' + (pad.top + ch).toFixed(1);
      areaD += 'L' + xScale(0).toFixed(1) + ',' + (pad.top + ch).toFixed(1) + 'Z';
    }

    var gridLines = 4;
    var gridEls = [];
    for (var g = 0; g <= gridLines; g++) {
      var gv = yMin + (yMax - yMin) * (g / gridLines);
      var gy = yScale(gv);
      gridEls.push(
        e('line', { key: 'g' + g, x1: pad.left, y1: gy, x2: W - pad.right, y2: gy,
          stroke: 'var(--border-secondary, rgba(255,255,255,0.06))', strokeWidth: 1 }),
        e('text', { key: 'gl' + g, x: pad.left - 8, y: gy + 4,
          fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'end' }, fmt(gv))
      );
    }

    var xLabelEls = [];
    var labelStep = Math.max(1, Math.ceil(data.length / 6));
    for (var xi = 0; xi < data.length; xi += labelStep) {
      xLabelEls.push(
        e('text', { key: 'xl' + xi, x: xScale(xi), y: H - 6,
          fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'middle' },
          fmtDate(data[xi].x))
      );
    }

    var dotEls = [];
    if (showDots) {
      for (var di = 0; di < data.length; di++) {
        (function (idx) {
          var dx = xScale(idx);
          var dy = yScale(data[idx].y);
          dotEls.push(
            e('circle', {
              key: 'd' + idx, cx: dx, cy: dy, r: 3,
              fill: color, stroke: 'var(--bg-card, #1a1d2e)', strokeWidth: 1.5,
              style: { cursor: 'pointer' },
              onMouseEnter: function () {
                setTooltip({ x: dx, y: dy, label: data[idx].x, value: data[idx].y });
              },
              onMouseLeave: function () { setTooltip(null); },
            })
          );
        })(di);
      }
    }

    var tooltipEl = null;
    if (tooltip) {
      var tx = Math.min(tooltip.x, W - 80);
      var ty = Math.max(tooltip.y - 30, pad.top);
      tooltipEl = e('g', null,
        e('rect', { x: tx - 40, y: ty - 14, width: 80, height: 28, rx: 4,
          fill: 'var(--bg-card, #1a1d2e)', stroke: 'var(--border-primary, rgba(255,255,255,0.1))', strokeWidth: 1 }),
        e('text', { x: tx, y: ty - 1, fill: 'var(--text-primary)', fontSize: 10, textAnchor: 'middle' },
          fmtDate(tooltip.label)),
        e('text', { x: tx, y: ty + 11, fill: color, fontSize: 11, textAnchor: 'middle', fontWeight: 600 },
          fmt(tooltip.value)),
      );
    }

    return e('div', { className: 'vchart-container' },
      title && e('div', { className: 'vchart-title' }, title),
      e('svg', { ref: svgRef, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
        style: { width: '100%', height: 'auto', maxHeight: height + 'px' } },
        yLabel && e('text', { x: 12, y: pad.top + ch / 2, fill: 'var(--text-secondary)',
          fontSize: 10, textAnchor: 'middle',
          transform: 'rotate(-90, 12, ' + (pad.top + ch / 2) + ')' }, yLabel),
        gridEls,
        xLabelEls,
        showArea && areaD && e('path', { d: areaD, fill: color, opacity: 0.1 }),
        e('path', { d: pathD, fill: 'none', stroke: color, strokeWidth: 2,
          strokeLinecap: 'round', strokeLinejoin: 'round' }),
        dotEls,
        tooltipEl,
      ),
    );
  };

  /* ─── BarChart ──────────────────────────────────────── */

  VantageCharts.BarChart = function BarChart(props) {
    var data = props.data || [];
    var title = props.title || '';
    var color = props.color || 'var(--accent-primary)';
    var height = props.height || 200;

    var _s = useState(null);
    var tooltip = _s[0];
    var setTooltip = _s[1];

    var W = 600;
    var H = height;
    var pad = { top: 20, right: 20, bottom: 40, left: 40 };
    var cw = W - pad.left - pad.right;
    var ch = H - pad.top - pad.bottom;

    if (!data.length) {
      return e('div', { className: 'vchart-container' },
        title && e('div', { className: 'vchart-title' }, title),
        emptyMessage(),
      );
    }

    var maxVal = Math.max.apply(null, data.map(function (d) { return d.value; }));
    if (maxVal === 0) maxVal = 1;
    var yMax = Math.ceil(maxVal * 1.15);

    var barW = Math.max(4, Math.min(40, (cw / data.length) * 0.65));
    var gap = (cw - barW * data.length) / (data.length + 1);

    var gridLines = 4;
    var gridEls = [];
    for (var g = 0; g <= gridLines; g++) {
      var gv = yMax * (g / gridLines);
      var gy = pad.top + ch - (gv / yMax) * ch;
      gridEls.push(
        e('line', { key: 'g' + g, x1: pad.left, y1: gy, x2: W - pad.right, y2: gy,
          stroke: 'var(--border-secondary, rgba(255,255,255,0.06))', strokeWidth: 1 }),
        e('text', { key: 'gl' + g, x: pad.left - 6, y: gy + 4,
          fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'end' }, Math.round(gv)),
      );
    }

    var barEls = [];
    var labelEls = [];
    for (var bi = 0; bi < data.length; bi++) {
      (function (idx) {
        var bx = pad.left + gap + idx * (barW + gap);
        var bh = (data[idx].value / yMax) * ch;
        var by = pad.top + ch - bh;
        barEls.push(
          e('rect', {
            key: 'b' + idx, x: bx, y: by, width: barW, height: Math.max(0, bh),
            rx: 2, fill: color, opacity: 0.85,
            style: { cursor: 'pointer', transition: 'opacity 0.15s' },
            onMouseEnter: function (ev) {
              if (ev.target) ev.target.setAttribute('opacity', '1');
              setTooltip({ x: bx + barW / 2, y: by, label: data[idx].label, value: data[idx].value });
            },
            onMouseLeave: function (ev) {
              if (ev.target) ev.target.setAttribute('opacity', '0.85');
              setTooltip(null);
            },
          })
        );
        var labelStep2 = Math.max(1, Math.ceil(data.length / 8));
        if (idx % labelStep2 === 0) {
          labelEls.push(
            e('text', { key: 'bl' + idx, x: bx + barW / 2, y: H - 8,
              fill: 'var(--text-secondary)', fontSize: 9, textAnchor: 'middle' },
              data[idx].label)
          );
        }
      })(bi);
    }

    var tooltipEl = null;
    if (tooltip) {
      tooltipEl = e('g', null,
        e('rect', { x: tooltip.x - 30, y: tooltip.y - 28, width: 60, height: 22, rx: 4,
          fill: 'var(--bg-card, #1a1d2e)', stroke: 'var(--border-primary, rgba(255,255,255,0.1))', strokeWidth: 1 }),
        e('text', { x: tooltip.x, y: tooltip.y - 13, fill: color, fontSize: 11, textAnchor: 'middle', fontWeight: 600 },
          tooltip.value),
      );
    }

    return e('div', { className: 'vchart-container' },
      title && e('div', { className: 'vchart-title' }, title),
      e('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
        style: { width: '100%', height: 'auto', maxHeight: height + 'px' } },
        gridEls,
        barEls,
        labelEls,
        tooltipEl,
      ),
    );
  };

  /* ─── RadarChart ────────────────────────────────────── */

  VantageCharts.RadarChart = function RadarChart(props) {
    var data = props.data || [];
    var title = props.title || '';
    var height = props.height || 260;
    var fillColor = props.fillColor || 'var(--accent-primary)';

    var W = 300;
    var H = height;
    var cx = W / 2;
    var cy = H / 2;
    var R = Math.min(cx, cy) - 40;
    var n = data.length;

    if (n < 3) {
      return e('div', { className: 'vchart-container' },
        title && e('div', { className: 'vchart-title' }, title),
        emptyMessage('Need at least 3 categories'),
      );
    }

    var angle = function (i) { return (Math.PI * 2 * i) / n - Math.PI / 2; };
    var pointOnAxis = function (i, r) {
      var a = angle(i);
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    };

    var levels = [20, 40, 60, 80, 100];
    var gridEls = [];
    for (var li = 0; li < levels.length; li++) {
      var lr = (levels[li] / 100) * R;
      var pts = [];
      for (var pi = 0; pi < n; pi++) {
        var pp = pointOnAxis(pi, lr);
        pts.push(pp.x.toFixed(1) + ',' + pp.y.toFixed(1));
      }
      gridEls.push(
        e('polygon', { key: 'lv' + li, points: pts.join(' '),
          fill: 'none', stroke: 'var(--border-secondary, rgba(255,255,255,0.08))', strokeWidth: 1 })
      );
    }

    var axisEls = [];
    var labelEls = [];
    for (var ai = 0; ai < n; ai++) {
      var ap = pointOnAxis(ai, R);
      axisEls.push(
        e('line', { key: 'ax' + ai, x1: cx, y1: cy, x2: ap.x, y2: ap.y,
          stroke: 'var(--border-secondary, rgba(255,255,255,0.08))', strokeWidth: 1 })
      );
      var lp = pointOnAxis(ai, R + 22);
      var anchor = 'middle';
      if (lp.x < cx - 10) anchor = 'end';
      else if (lp.x > cx + 10) anchor = 'start';
      labelEls.push(
        e('text', { key: 'lb' + ai, x: lp.x, y: lp.y + 4,
          fill: 'var(--text-secondary)', fontSize: 10, textAnchor: anchor },
          data[ai].label)
      );
    }

    var dataPts = [];
    for (var di = 0; di < n; di++) {
      var val = Math.max(0, Math.min(100, data[di].value || 0));
      var dp = pointOnAxis(di, (val / 100) * R);
      dataPts.push(dp.x.toFixed(1) + ',' + dp.y.toFixed(1));
    }

    var dotEls = [];
    for (var ddi = 0; ddi < n; ddi++) {
      var dval = Math.max(0, Math.min(100, data[ddi].value || 0));
      var ddp = pointOnAxis(ddi, (dval / 100) * R);
      dotEls.push(
        e('circle', { key: 'rd' + ddi, cx: ddp.x, cy: ddp.y, r: 3.5,
          fill: fillColor, stroke: 'var(--bg-card, #1a1d2e)', strokeWidth: 1.5 },
          e('title', null, data[ddi].label + ': ' + Math.round(dval))
        )
      );
    }

    return e('div', { className: 'vchart-container' },
      title && e('div', { className: 'vchart-title' }, title),
      e('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
        style: { width: '100%', height: 'auto', maxHeight: height + 'px' } },
        gridEls,
        axisEls,
        e('polygon', { points: dataPts.join(' '),
          fill: fillColor, fillOpacity: 0.15,
          stroke: fillColor, strokeWidth: 2, strokeLinejoin: 'round' }),
        dotEls,
        labelEls,
      ),
    );
  };

  /* ─── ProgressChart ─────────────────────────────────── */

  VantageCharts.ProgressChart = function ProgressChart(props) {
    var data = props.data || [];
    var title = props.title || '';
    var color = props.color || 'var(--success, #00e676)';
    var height = props.height || 180;

    var _s = useState(null);
    var tooltip = _s[0];
    var setTooltip = _s[1];

    var W = 600;
    var H = height;
    var pad = { top: 20, right: 20, bottom: 36, left: 50 };
    var cw = W - pad.left - pad.right;
    var ch = H - pad.top - pad.bottom;

    if (!data.length) {
      return e('div', { className: 'vchart-container' },
        title && e('div', { className: 'vchart-title' }, title),
        emptyMessage(),
      );
    }

    var yVals = data.map(function (d) { return d.value; });
    var yMin = 0;
    var yMax = Math.ceil(Math.max.apply(null, yVals) * 1.1);
    if (yMax === 0) yMax = 100;

    var xScale = function (i) { return pad.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2); };
    var yScale = function (v) { return pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch; };

    var stepD = '';
    for (var si = 0; si < data.length; si++) {
      var sx = xScale(si);
      var sy = yScale(data[si].value);
      if (si === 0) {
        stepD += 'M' + sx.toFixed(1) + ',' + sy.toFixed(1);
      } else {
        var prevY = yScale(data[si - 1].value);
        stepD += 'L' + sx.toFixed(1) + ',' + prevY.toFixed(1);
        stepD += 'L' + sx.toFixed(1) + ',' + sy.toFixed(1);
      }
    }

    var areaD = stepD + 'L' + xScale(data.length - 1).toFixed(1) + ',' + (pad.top + ch).toFixed(1);
    areaD += 'L' + xScale(0).toFixed(1) + ',' + (pad.top + ch).toFixed(1) + 'Z';

    var gridLines = 4;
    var gridEls = [];
    for (var g = 0; g <= gridLines; g++) {
      var gv = yMin + (yMax - yMin) * (g / gridLines);
      var gy = yScale(gv);
      gridEls.push(
        e('line', { key: 'pg' + g, x1: pad.left, y1: gy, x2: W - pad.right, y2: gy,
          stroke: 'var(--border-secondary, rgba(255,255,255,0.06))', strokeWidth: 1 }),
        e('text', { key: 'pgl' + g, x: pad.left - 8, y: gy + 4,
          fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'end' }, Math.round(gv)),
      );
    }

    var markerEls = [];
    var xLabelEls = [];
    var labelStep = Math.max(1, Math.ceil(data.length / 6));
    for (var mi = 0; mi < data.length; mi++) {
      (function (idx) {
        var mx = xScale(idx);
        var my = yScale(data[idx].value);
        markerEls.push(
          e('circle', {
            key: 'pm' + idx, cx: mx, cy: my, r: 4,
            fill: color, stroke: 'var(--bg-card, #1a1d2e)', strokeWidth: 2,
            style: { cursor: 'pointer' },
            onMouseEnter: function () {
              setTooltip({ x: mx, y: my, label: data[idx].date, value: data[idx].value });
            },
            onMouseLeave: function () { setTooltip(null); },
          })
        );
        if (idx % labelStep === 0) {
          xLabelEls.push(
            e('text', { key: 'pxl' + idx, x: mx, y: H - 6,
              fill: 'var(--text-secondary)', fontSize: 10, textAnchor: 'middle' },
              fmtDate(data[idx].date))
          );
        }
      })(mi);
    }

    var tooltipEl = null;
    if (tooltip) {
      var tx2 = Math.min(tooltip.x, W - 80);
      var ty2 = Math.max(tooltip.y - 30, pad.top);
      tooltipEl = e('g', null,
        e('rect', { x: tx2 - 40, y: ty2 - 14, width: 80, height: 28, rx: 4,
          fill: 'var(--bg-card, #1a1d2e)', stroke: 'var(--border-primary, rgba(255,255,255,0.1))', strokeWidth: 1 }),
        e('text', { x: tx2, y: ty2 - 1, fill: 'var(--text-primary)', fontSize: 10, textAnchor: 'middle' },
          fmtDate(tooltip.label)),
        e('text', { x: tx2, y: ty2 + 11, fill: color, fontSize: 11, textAnchor: 'middle', fontWeight: 600 },
          fmt(tooltip.value)),
      );
    }

    return e('div', { className: 'vchart-container' },
      title && e('div', { className: 'vchart-title' }, title),
      e('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
        style: { width: '100%', height: 'auto', maxHeight: height + 'px' } },
        gridEls,
        xLabelEls,
        e('path', { d: areaD, fill: color, opacity: 0.08 }),
        e('path', { d: stepD, fill: 'none', stroke: color, strokeWidth: 2,
          strokeLinecap: 'round', strokeLinejoin: 'round' }),
        markerEls,
        tooltipEl,
      ),
    );
  };
})();
