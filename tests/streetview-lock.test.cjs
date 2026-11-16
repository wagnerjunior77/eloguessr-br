const test = require('node:test');
const assert = require('node:assert/strict');
require('../dist/streetview-lock.js');
const {StreetViewLock} = globalThis;
function harness(restrictions) {
  const handlers = new Map();
  const target = {addEventListener(type, fn){handlers.set(type, fn)}};
  let current = restrictions; StreetViewLock.install(target, () => current);
  return {set(value){current=value}, dispatch(type, {control=false,key=''}={}) {
    const event={target:{closest:()=>control},key, prevented:false, stopped:false,
      preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
    handlers.get(type)(event); return event;
  }};
}
test('NMPZ impede arrastar, roda e setas sem bloquear links do Google', () => {
  const h=harness({forbidRotating:true,forbidZooming:true});
  for(const type of ['pointerdown','mousedown','touchstart','dblclick','wheel']) assert.equal(h.dispatch(type).prevented,true,type);
  assert.equal(h.dispatch('keydown',{key:'ArrowLeft'}).stopped,true);
  assert.equal(h.dispatch('keydown',{key:'+'}).stopped,true);
  assert.equal(h.dispatch('pointerdown',{control:true}).prevented,false);
});
test('No Move permite girar e zoom; moving também permite navegação', () => {
  const h=harness({forbidRotating:false,forbidZooming:false});
  for(const type of ['pointerdown','mousedown','touchstart','dblclick','wheel']) assert.equal(h.dispatch(type).prevented,false,type);
  assert.equal(h.dispatch('keydown',{key:'ArrowLeft'}).prevented,false);
  h.set(null);assert.equal(h.dispatch('pointerdown').prevented,false);
});
