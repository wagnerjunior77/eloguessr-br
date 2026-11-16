const test=require('node:test');
const assert=require('node:assert/strict');
const Timeline=require('../dist/replay-timeline.js');
const events=[{time:1000,type:'PanoPov',payload:{heading:5,pitch:2}},{time:1500,type:'MapDisplay',payload:{isActive:true}},{time:2000,type:'PinPosition',payload:{lat:2,lng:3}},{time:2200,type:'PanoPov',payload:{heading:30,pitch:4}}];
test('a linha do tempo processa eventos só quando chegam',()=>{const t=new Timeline(events);let v=t.seek(0);assert.equal(v.state.pov.heading,5);assert.ok(v.changed.has('pov'));v=t.seek(400);assert.equal(v.changed.size,0);v=t.seek(500);assert.equal(v.state.visible,true);assert.deepEqual([...v.changed],['visible']);v=t.seek(1200);assert.equal(v.state.pov.heading,30);assert.equal(v.state.pin.lat,2)});
test('voltar no tempo remove eventos posteriores e reconstrói a cena',()=>{const t=new Timeline(events);t.seek(1200);const v=t.seek(0);assert.equal(v.state.pov.heading,5);assert.equal(v.state.visible,false);assert.equal(v.state.pin,null);assert.ok(v.changed.has('pin'));});
