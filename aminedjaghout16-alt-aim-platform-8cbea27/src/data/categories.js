/* =========================================================
   AIMFORGE — Training categories
   High-level skill families. Every scenario belongs to one.
   ========================================================= */

export const CATEGORIES = {
  click:      { id: "click",      code: "CAT.CLK", name: "Click-timing",   desc: "Static and pop-up targets — reaction and precision-click training." },
  tracking:   { id: "tracking",   code: "CAT.TRK", name: "Tracking",       desc: "Smooth pursuit of moving targets — crosshair-under-target discipline." },
  flick:      { id: "flick",      code: "CAT.FLK", name: "Flick",          desc: "Rapid angular acceleration to a target — first-shot accuracy." },
  switching:  { id: "switching",  code: "CAT.SWT", name: "Target switch",  desc: "Multiple targets — priority selection and micro-corrections." },
  strafe:     { id: "strafe",     code: "CAT.STR", name: "Strafe-aim",     desc: "Aiming while counter-strafing — engine feel for CS-style movement." },
  memory:     { id: "memory",     code: "CAT.MEM", name: "Spatial memory", desc: "Prefire, pre-aim angles, common site holds — location retention." }
};

export const CATEGORY_LIST = Object.values(CATEGORIES);
