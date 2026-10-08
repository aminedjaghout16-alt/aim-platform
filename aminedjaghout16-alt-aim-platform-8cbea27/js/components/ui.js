/* ============================================
   Vantage UI — Reusable Components
   ============================================ */
window.VantageUI = window.VantageUI || {};
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;
const e = React.createElement;

/* --- Button --- */
VantageUI.Button = function Button({ children, variant = 'primary', size = 'md', disabled, onClick, className, style, type }) {
  const variants = {
    primary: 'vbtn-primary',
    secondary: 'vbtn-secondary',
    ghost: 'vbtn-ghost',
    danger: 'vbtn-danger',
    accent: 'vbtn-accent',
  };
  const sizes = { sm: 'vbtn-sm', md: 'vbtn-md', lg: 'vbtn-lg' };
  return e('button', {
    type: type || 'button',
    className: `vbtn ${variants[variant]} ${sizes[size]} ${className || ''}`.trim(),
    disabled,
    onClick,
    style,
  }, children);
};

/* --- Card --- */
VantageUI.Card = function Card({ children, className, style, hover, onClick, padding }) {
  return e('div', {
    className: `vcard ${hover ? 'vcard-hover' : ''} ${onClick ? 'vcard-clickable' : ''} ${className || ''}`.trim(),
    style: { ...style, padding: padding !== undefined ? padding : undefined },
    onClick,
  }, children);
};

/* --- Input --- */
VantageUI.Input = function Input({ label, error, type = 'text', value, onChange, placeholder, className }) {
  return e('div', { className: `vinput-group ${className || ''}` },
    label && e('label', { className: 'vinput-label' }, label),
    e('input', {
      type,
      value,
      onChange: (ev) => onChange && onChange(ev.target.value),
      placeholder,
      className: `vinput ${error ? 'vinput-error' : ''}`,
    }),
    error && e('span', { className: 'vinput-error-text' }, error),
  );
};

/* --- Select --- */
VantageUI.Select = function Select({ label, value, onChange, options, className }) {
  return e('div', { className: `vselect-group ${className || ''}` },
    label && e('label', { className: 'vinput-label' }, label),
    e('select', {
      value,
      onChange: (ev) => onChange && onChange(ev.target.value),
      className: 'vselect',
    },
      options.map(opt =>
        e('option', { key: opt.value, value: opt.value }, opt.label)
      )
    ),
  );
};

/* --- Modal --- */
VantageUI.Modal = function Modal({ isOpen, onClose, title, children, width }) {
  if (!isOpen) return null;
  return e('div', { className: 'vmodal-backdrop', onClick: onClose },
    e('div', {
      className: 'vmodal',
      style: { maxWidth: width || '480px' },
      onClick: (ev) => ev.stopPropagation(),
    },
      e('div', { className: 'vmodal-header' },
        e('h3', null, title),
        e('button', { className: 'vmodal-close', onClick: onClose }, '×'),
      ),
      e('div', { className: 'vmodal-body' }, children),
    )
  );
};

/* --- ProgressBar --- */
VantageUI.ProgressBar = function ProgressBar({ value, max = 100, color, label, showValue, height }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return e('div', { className: 'vprogress' },
    (label || showValue) && e('div', { className: 'vprogress-header' },
      label && e('span', { className: 'vprogress-label' }, label),
      showValue && e('span', { className: 'vprogress-value' }, `${Math.round(pct)}%`),
    ),
    e('div', { className: 'vprogress-track', style: { height: height || '6px' } },
      e('div', {
        className: 'vprogress-fill',
        style: {
          width: `${pct}%`,
          background: color || 'var(--accent-primary)',
        },
      })
    ),
  );
};

/* --- Badge --- */
VantageUI.Badge = function Badge({ children, color, variant = 'filled' }) {
  const style = variant === 'filled'
    ? { background: color || 'var(--accent-primary)', color: '#000' }
    : { background: 'transparent', color: color || 'var(--accent-primary)', border: `1px solid ${color || 'var(--accent-primary)'}` };
  return e('span', { className: 'vbadge', style }, children);
};

/* --- StatCard --- */
VantageUI.StatCard = function StatCard({ label, value, unit, icon, color, subtext }) {
  return e('div', { className: 'vstat-card' },
    e('div', { className: 'vstat-icon', style: { color: color || 'var(--accent-primary)' } }, icon || '◆'),
    e('div', { className: 'vstat-content' },
      e('div', { className: 'vstat-value' },
        e('span', null, value),
        unit && e('span', { className: 'vstat-unit' }, unit),
      ),
      e('div', { className: 'vstat-label' }, label),
      subtext && e('div', { className: 'vstat-subtext' }, subtext),
    ),
  );
};

/* --- EmptyState --- */
VantageUI.EmptyState = function EmptyState({ icon, title, description, action }) {
  return e('div', { className: 'vempty-state' },
    e('div', { className: 'vempty-icon' }, icon || '◇'),
    e('h3', null, title || 'Nothing here yet'),
    description && e('p', null, description),
    action,
  );
};

/* --- Tabs --- */
VantageUI.Tabs = function Tabs({ tabs, activeTab, onChange }) {
  return e('div', { className: 'vtabs' },
    tabs.map(tab =>
      e('button', {
        key: tab.id,
        className: `vtab ${activeTab === tab.id ? 'vtab-active' : ''}`,
        onClick: () => onChange(tab.id),
      }, tab.label)
    )
  );
};

/* --- Slider --- */
VantageUI.Slider = function Slider({ label, value, onChange, min = 0, max = 100, step = 1, unit }) {
  return e('div', { className: 'vslider-group' },
    e('div', { className: 'vslider-header' },
      e('span', { className: 'vinput-label' }, label),
      e('span', { className: 'vslider-value' }, `${value}${unit || ''}`),
    ),
    e('input', {
      type: 'range',
      min, max, step, value,
      onChange: (ev) => onChange && onChange(Number(ev.target.value)),
      className: 'vslider',
    }),
  );
};

/* --- PageHeader --- */
VantageUI.PageHeader = function PageHeader({ title, subtitle, action, breadcrumb }) {
  return e('div', { className: 'vpage-header' },
    breadcrumb && e('div', { className: 'vbreadcrumb' }, breadcrumb),
    e('div', { className: 'vpage-header-row' },
      e('div', null,
        e('h1', { className: 'vpage-title' }, title),
        subtitle && e('p', { className: 'vpage-subtitle' }, subtitle),
      ),
      action && e('div', null, action),
    ),
  );
};
