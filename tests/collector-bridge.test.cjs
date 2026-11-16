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

function setup(authenticated = true, geoCount = 2) {
  const values = new Map(), subscriptions = new Map(), listeners = new Map(), locks = new Set(), messages = [], calls = [];
  let nextListener = 1;
  const fixture = {
    gameId, status:'Finished', currentRoundNumber:2, result:{isDraw:false}, initialHealth:6000,
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
    const sandbox={window:win,location:{origin,hostname:new URL(origin).hostname},navigator,document,fetch,URL,Blob,console,Math,Date,Number,Map,Set,Error,setTimeout:timeout,clearTimeout,...gm};
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

test('uma solicitação carrega duelo, HP e panorama entre abas sem baixar JSON', async()=>{
  const h=setup();
  h.site.win.postMessage({channel,type:'collect',id:'12345678-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.profiles.length,1);assert.equal(reply.data.profiles[0].id,player);assert.equal(reply.data.games.length,1);
  const game=reply.data.games[0];assert.equal(game.target,'B');assert.equal(game.rounds.length,1);assert.equal(game.rounds[0].caption,'Round 2');assert.equal(game.rounds[0].panoId,'second');
  assert.equal(game.rounds[0].health.A.after,5500);assert.equal(game.rounds[0].health.B.after,4000);
  assert.equal(h.calls.length,3,'a mesma solicitação não deve ser processada duas vezes');
  assert.ok(h.calls.every(call=>call.options.credentials==='include'));
  assert.ok(h.calls.every(call=>call.url.startsWith(geoOrigin+'/')||call.url.startsWith('https://game-server.geoguessr.com/')));
  assert.equal(JSON.stringify(reply.data).includes('cookie'),false);
});

test('sessão ausente produz erro e não retorna jogos', async()=>{
  const h=setup(false);
  h.site.win.postMessage({channel,type:'collect',id:'99999999-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='error'));
  assert.match(reply.message,/Acesso negado/);assert.equal(h.messages.some(m=>m.type==='result'),false);
});


test('dois perfis geram uma partida distinta para cada um', async()=>{
  const h=setup();
  h.site.win.postMessage({channel,type:'collect',id:'11111111-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player,geoOrigin+'/user/'+player2]},siteOrigin);
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.profiles.length,2);assert.equal(reply.data.games.length,2);
  assert.deepEqual(new Set(reply.data.games.map(game=>game.playerId)),new Set([player,player2]));
  assert.equal(h.calls.length,6);
});

test('aba do GeoGuessr aberta depois da solicitação recebe a coleta pendente', async()=>{
  const h=setup(true,0);
  h.site.win.postMessage({channel,type:'collect',id:'22222222-aaaa-bbbb-cccc-123456789012',links:[geoOrigin+'/user/'+player]},siteOrigin);
  await waitFor(()=>h.values.has('eloguessr.bridge.request.v1'));
  h.startGeo();
  const reply=await waitFor(()=>h.messages.find(m=>m.type==='result'));
  assert.equal(reply.data.games.length,1);
});

test('cancelamento impede a execução quando não há aba do GeoGuessr', async()=>{
  const h=setup(true,0), id='33333333-aaaa-bbbb-cccc-123456789012';
  h.site.win.postMessage({channel,type:'collect',id,links:[geoOrigin+'/user/'+player]},siteOrigin);
  await waitFor(()=>h.values.has('eloguessr.bridge.request.v1'));
  h.site.win.postMessage({channel,type:'cancel',id},siteOrigin);
  await waitFor(()=>!h.values.has('eloguessr.bridge.request.v1'));
  h.startGeo();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(h.calls.length,0);assert.equal(h.messages.some(m=>m.type==='result'),false);
});
