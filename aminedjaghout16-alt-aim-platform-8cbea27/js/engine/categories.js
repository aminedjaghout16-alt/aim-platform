/* ============================================
   Training Categories
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Categories = {
  LIST: [
    {
      id: 'flicking',
      name: 'Flicking',
      shortName: 'Flick',
      description: 'Fast, precise mouse movements to snap onto static or semi-static targets. Builds raw flick accuracy.',
      icon: '◎',
      color: '#00e0d0',
    },
    {
      id: 'tracking',
      name: 'Tracking',
      shortName: 'Track',
      description: 'Keep your crosshair locked on smoothly or erratically moving targets. Develops smooth pursuit aim.',
      icon: '⟶',
      color: '#448aff',
    },
    {
      id: 'target_switching',
      name: 'Target Switching',
      shortName: 'Switch',
      description: 'Rapidly transition aim between multiple targets. Combines flick speed with target acquisition.',
      icon: '⇄',
      color: '#ffb830',
    },
    {
      id: 'click_timing',
      name: 'Click Timing',
      shortName: 'Click',
      description: 'Click targets at the right moment as they move through a window. Trains precision timing.',
      icon: '⊕',
      color: '#ff3d5a',
    },
    {
      id: 'micro_adjustments',
      name: 'Micro Adjustments',
      shortName: 'Micro',
      description: 'Tiny, precise corrections to land on small targets. Develops fine motor control and stability.',
      icon: '◈',
      color: '#b388ff',
    },
    {
      id: 'movement_aim',
      name: 'Movement & Aim',
      shortName: 'Move',
      description: 'Combine character movement with aiming. Simulates real in-game strafing and counter-strafing.',
      icon: '◇',
      color: '#00e676',
    },
    {
      id: 'game_specific',
      name: 'Game-Specific',
      shortName: 'Game',
      description: 'Scenarios tailored to specific game mechanics, weapon patterns, and common in-game situations.',
      icon: '⬡',
      color: '#ff9100',
    },
  ],

  getById(id) {
    return this.LIST.find(c => c.id === id) || null;
  },

  getAll() {
    return this.LIST;
  },
};
