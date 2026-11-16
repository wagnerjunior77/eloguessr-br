const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('dist/coletor.user.js', 'utf8');
const siteOrigin = 'https://quem-jogou-eloguessr.novelalpaca1.chatgpt.site';
const geoOrigin = 'https://www.geoguessr.com';
const channel = 'eloguessr-bridge-v1';
const player = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const opponent = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const gameId = '123456789abcdef012345678';
const player2 = 'cccccccccccccccccccccccc';
const gameId2 = '123456789abcdef012345679';

function setup(authenticated = true, geoCount = 2, movement = {forbidMoving:true,forbidRotating:true,forbidZooming:true}) {
  const values = new Map(), subscriptions = new Map(), listeners = new Map(), locks = new Set(), messages = [], calls = [];
  let nextListener = 1;
  const fixture = {
    gameId, status:'Finished', currentRoundNumber:2, result:{isDraw:false}, initialHealth:6000, movementOptions:movement,
    teams:[
      {players:[{playerId:opponent,guesses:[{roundNumber:1,lat:1,lng:1},{roundNumber:2,lat:2,lng:2}]}],roundResults:[{roundNumber:2,healthBefore:5000,healthAfter:5500}]},
      {players:[{playerId:player,guesses:[{roundNumber:2,lat:3,lng:3}]}],roundResults:[{roundNumber:2,healthBefore:6000,healthAfter:4000}]}
    ],
    rounds:[{roundNumber:1,panorama:{lat:4,lng:4,panoId:'first'}},{roundNumber:2,panorama:{lat:5,lng:5,panoId:'second',heading:45,pitch:0}},{roundNumber:3,panorama:{lat:6,lng:6,panoId:'unplayed'}}]
  };
  const fixture2 = structuredClone(fixture); fixture2.gameId=gameId2; fixture2.teams[1].players[0].playerId=player2;
  function globals(context, origin) {
    const eventHandlers = {};
    const win = {
      addEventListener(type, fn) { (eventHandlers[type] ||= []).push(fn); },
      postMessage(data, target) {
        assert.equal(target, origin);
        messages.push(data);
        queueMicrotask(() => (eventHandlers.message || []).forEach(fn => fn({source:win,origin,data})));
      },
    };
    function notify(key, previous, next) {
      for (const listener of subscriptions.values()) {
        if (listener.key === key) queueMicrotask(() => listener.fn(key, previous, next, listener.context !== context));
      }
    }
    const gm = {
      GM_getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
      GM_setValue(key, value) { const previous=values.get(key);values.set(key,value);notify(key,previous,value); },
      GM_deleteValue(key) { const previous=values.get(key);values.delete(key);notify(key,previous,undefined); },
      GM_addValueChangeListener(key, fn) { const id=nextListener++;subscriptions.set(id,{key,fn,context});return id; },
      GM_removeValueChangeListener(id) { subscriptions.delete(id); },
      GM_registerMenuCommand(_name, fn) { listeners.set(context,fn); }
    };
    const navigator = {locks:{request:async(name,_options,fn)=>{
      if (locks.has(name)) return fn(null);
      locks.add(name);try{return await fn({name})}finally{locks.delete(name)}
    }}};
    const fetch = async (url, options) => {
      calls.push({url,options});
      if (!authenticated) return {ok:false,status:401};
      let data;
      if (url.includes('/api/v3/users/')) data={nick:url.endsWith(player2)?'Teste 2':'Teste'};
      else if (url.includes('/game-ids')) { const second=url.includes(player2);data={userId:second?player2:player,gameIds:[second?gameId2:gameId]}; }
      else if (url.includes('/api/duels/')) data=url.endsWith(gameId2)?fixture2:fixture;
      else throw Error('unexpected URL');
      return {ok:true,status:200,json:async()=>data};
    };
    const timeout = (fn, ms) => ms === 350 ? setTimeout(fn, 0) : {unref(){}};
    const document={getElementById:()=>null};
    const GM_xmlhttpRequest = request => {
      fetch(request.url, {credentials:'include'}).then(async response => {
        request.onload({status:response.status, response:response.ok?await response.json():null});
      }).catch(request.onerror);
    };
    const sandbox={window:win,location:{origin,hostname:new URL(origin).hostname},navigator,document,fetch,GM_xmlhttpRequest,URL,Blob,console,Math,Date,Number,Map,Set,Error,setTimeout:timeout,clearTimeout,...gm};
    vm.runInNewContext(source,sandbox,{filename:'coletor.user.js'});
    return {win,eventHandlers};
  }
  const site=globals('site',siteOrigin);
  for(let i=0;i<geoCount;i++) globals('geo'+i,geoOrigin);
  return {site,values,messages,calls,startGeo:()=>globals('lateGeo',geoOrigin)};
}
async function waitFor(fn) {
  for(let i=0;i<200;i++){const value=fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,5));}
  throw Error('Resposta não chegou');
}

test('carrega duelo, HP e panorama sem outra aba ou JSON', async()=>{
  const h=setup(true,0);
  h.site.win.postMessage({channel,type:'collect',mode:'any',id:'12345678-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.profiles.length,1);assert.equal(reply.data.profiles[0].id,player);assert.equal(reply.data.games.length,1);
  const game=reply.data.games[0];assert.equal(game.gameId,gameId);assert.equal(game.movement.forbidRotating,true);assert.equal(game.movement.forbidMoving,true);assert.equal(game.movement.forbidZooming,true);assert.equal(game.target,'B');assert.equal(game.rounds.length,1);assert.equal(game.rounds[0].caption,'Round 2');assert.equal(game.rounds[0].panoId,'second');
  assert.equal(game.rounds[0].health.A.after,5500);assert.equal(game.rounds[0].health.B.after,4000);
  assert.equal(h.calls.length,3,'a mesma solicitação não deve ser processada duas vezes');
  assert.ok(h.calls.every(call=>call.options.credentials==='include'));
  assert.ok(h.calls.every(call=>call.url.startsWith(geoOrigin+'/')||call.url.startsWith('https://game-server.geoguessr.com/')));
  assert.equal(JSON.stringify(reply.data).includes('cookie'),false);
});

test('sessão ausente produz erro e não retorna jogos', async()=>{
  const h=setup(false);
  h.site.win.postMessage({channel,type:'collect',mode:'any',id:'99999999-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='error'));
  assert.match(reply.message,/Acesso negado/);assert.equal(h.messages.some(m=>m.type==='result'),false);
});


test('dois perfis geram uma partida distinta para cada um', async()=>{
  const h=setup();
  h.site.win.postMessage({channel,type:'collect',mode:'any',id:'11111111-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player,geoOrigin+'/user/'+player2]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.profiles.length,2);assert.equal(reply.data.games.length,2);
  assert.deepEqual(new Set(reply.data.games.map(game=>game.playerId)),new Set([player,player2]));
  assert.equal(h.calls.length,6);
});

test('cancelamento impede resultado posterior', async()=>{
  const h=setup(true,0), id='33333333-aaaa-bbbb-cccc-123456789012';
  h.site.win.postMessage({channel,type:'collect',mode:'any',id,links:[geoOrigin+'/user/'+player]},siteOrigin);
  h.site.win.postMessage({channel,type:'cancel',id},siteOrigin);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(h.messages.some(m=>m.type==='result'),false);
});

test('filtro NMPZ aceita duelo NMPZ', async()=>{
  const h=setup(true,0);
  h.site.win.postMessage({channel,type:'collect',mode:'nmpz',id:'44444444-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.games[0].movement.forbidRotating,true);
});
test('filtro Moving não aceita duelo NMPZ', async()=>{
  const h=setup(true,0);
  h.site.win.postMessage({channel,type:'collect',mode:'moving',id:'55555555-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='error'));
  assert.match(reply.message,/modo escolhido/);
  assert.equal(h.messages.some(m=>m.type==='result'),false);
});

for (const [mode,movement] of [
  ['moving',{forbidMoving:false,forbidRotating:false,forbidZooming:false}],
  ['no_move',{forbidMoving:true,forbidRotating:false,forbidZooming:false}]
]) test(`filtro ${mode} seleciona partida compatível`, async()=>{
  const h=setup(true,0,movement);
  h.site.win.postMessage({channel,type:'collect',mode,id:'66666666-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.deepEqual(JSON.parse(JSON.stringify(reply.data.games[0].movement)),movement);
});
