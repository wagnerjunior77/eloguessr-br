(function (root) {
  'use strict';
  function install(element, getRestrictions) {
    const pointerEvents = ['pointerdown', 'mousedown', 'touchstart', 'dblclick'];
    function isGoogleControl(target) {
      return target && typeof target.closest === 'function' && !!target.closest('a,button');
    }
    function block(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    for (const type of pointerEvents) element.addEventListener(type, event => {
      const restrictions = getRestrictions();
      if (restrictions?.forbidRotating && !isGoogleControl(event.target)) block(event);
    }, { capture: true, passive: false });
    element.addEventListener('wheel', event => {
      if (getRestrictions()?.forbidZooming && !isGoogleControl(event.target)) block(event);
    }, { capture: true, passive: false });
    element.addEventListener('keydown', event => {
      const restrictions = getRestrictions();
      if (!restrictions || isGoogleControl(event.target)) return;
      const key = event.key;
      if ((restrictions.forbidRotating && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s'].includes(key)) ||
          (restrictions.forbidZooming && ['+','-','=','PageUp','PageDown'].includes(key))) block(event);
    }, true);
  }
  root.StreetViewLock = { install };
})(globalThis);
