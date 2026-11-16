// ==UserScript==
// @name         Eloguessr • Coletar duelos
// @namespace    eloguessr-local
// @version      0.6.0
// @description  Carrega duelos no Eloguessr usando sua sessão do GeoGuessr.
// @match        https://www.geoguessr.com/*
// @match        https://quem-jogou-eloguessr.novelalpaca1.chatgpt.site/*
// @run-at       document-start
// @noframes
// @connect      geoguessr.com
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// ==/UserScript==

/*
COMO USAR
1. Atualize este userscript no Tampermonkey e recarregue o Eloguessr.
2. Entre no GeoGuessr no mesmo navegador. Depois, a aba pode ser fechada.
3. Em Perfis no Eloguessr, cole os links e clique em Gerar jogos.
A extensão consulta apenas os servidores do GeoGuessr com a sessão do navegador;
a chave de sessão não é enviada ao Eloguessr.
O menu anterior para baixar JSON continua disponível no GeoGuessr.
*/
(function () {
  'use strict';
  const MAX_PROFILES = 10, MAX_DUELS_PER_PROFILE = 8;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function getId(value) {
    try {
      const u = new URL(value.trim());
      const m = u.hostname.toLowerCase().replace(/^www\./, '') === 'geoguessr.com' &&
        u.pathname.match(/^\/(?:[a-z]{2}\/)?user\/([a-z0-9]{24})\/?$/i);
      return m ? m[1].toLowerCase() : null;
    } catch (_) { return null; }
  }
  const validPoint = p => p && Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
    Number.isFinite(p.lng) && p.lng >= -180 && p.lng <= 180;
  const point = p => ({ lat: p.lat, lng: p.lng });
  function shuffle(arr) {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  async function json(url) {
    let response;
    try {
      if (location.origin === SITE_ORIGIN) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !['www.geoguessr.com', 'game-server.geoguessr.com'].includes(parsed.hostname)) throw new Error('Destino inválido');
        response = await new Promise((resolve, reject) => GM_xmlhttpRequest({
          method: 'GET', url, responseType: 'json', fetch: true,
          cookiePartition: { topLevelSite: 'https://www.geoguessr.com' },
          timeout: 30000,
          onload: r => resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.response }),
          onerror: reject, ontimeout: reject, onabort: reject
        }));
      } else response = await fetch(url, { credentials: 'include' });
    } catch (_) { throw new Error('Não foi possível conectar ao GeoGuessr. Verifique a conexão e as permissões do coletor.'); }
    if (response.status === 401 || response.status === 403)
      throw new Error(`Acesso negado pelo GeoGuessr (HTTP ${response.status}). Confirme que está conectado e que sua conta pode acessar o histórico.`);
    if (response.status === 429) throw new Error('O GeoGuessr limitou as consultas (HTTP 429). Aguarde antes de tentar novamente.');
    if (!response.ok) {
      const error = new Error(`O GeoGuessr respondeu HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    try { return await response.json(); }
    catch (_) { throw new Error('O GeoGuessr retornou uma resposta que não é JSON.'); }
  }
  function gameIds(history) {
    const list = history && (Array.isArray(history.gameIds) ? history.gameIds : history.payload && history.payload.gameIds);
    if (!Array.isArray(list))
      throw new Error('O formato do histórico mudou: não encontrei uma lista gameIds.');
    return [...new Set(list.map(x => typeof x === 'string' ? x : x && (x.gameId || x.id))
      .filter(x => typeof x === 'string' && /^[a-z0-9-]{8,100}$/i.test(x)))];
  }
  function extract(duel, playerId, gameId) {
    if (!duel || duel.status !== 'Finished' || !duel.result || !Array.isArray(duel.teams) || duel.teams.length !== 2 ||
        !Array.isArray(duel.rounds)) throw new Error('O formato dos detalhes do duelo não é o esperado.');
    if (duel.teams.some(t => !t || !Array.isArray(t.players)))
      throw new Error('O duelo recebido não contém as equipes esperadas.');
    // Este formato considera duelos solo finalizados com dois jogadores.
    if (duel.teams.some(t => t.players.length !== 1)) return null;
    const players = duel.teams.map(t => t.players[0]);
    if (players.some(p => !p || !Array.isArray(p.guesses)))
      throw new Error('O duelo recebido não contém listas de palpites.');
    const side = players.findIndex(p => String(p.playerId || '').toLowerCase() === playerId);
    if (side < 0) return null;
    // Saúde pertence à equipe, na mesma ordem usada para A e B.
    const healthFor = (team, index, roundNumber) => {
      if (!Array.isArray(team.roundResults)) return null;
      const rr = team.roundResults.find(item => item && item.roundNumber === roundNumber);
      if (!rr || !Number.isFinite(rr.healthBefore) || !Number.isFinite(rr.healthAfter) || rr.healthBefore < 0 || rr.healthAfter < 0) return null;
      const configured = index === 0 ? duel.options?.initialHealthTeamOne : duel.options?.initialHealthTeamTwo;
      const allValues = team.roundResults.flatMap(item => item ? [item.healthBefore, item.healthAfter] : []).filter(value => Number.isFinite(value) && value >= 0);
      const max = Math.max(1, configured || 0, duel.initialHealth || 0, duel.options?.initialHealth || 0, ...allValues);
      return { before: rr.healthBefore, after: rr.healthAfter, max };
    };
    const rounds = [];
    for (let i = 0; i < duel.rounds.length; i++) {
      const rd = duel.rounds[i];
      if (!rd || !Number.isInteger(rd.roundNumber) || (Number.isInteger(duel.currentRoundNumber) && rd.roundNumber > duel.currentRoundNumber)) continue;
      // Um jogador pode não palpitar em um round; não alinhe listas somente por posição.
      const a = players[0].guesses.find(g => g && g.roundNumber === rd.roundNumber);
      const b = players[1].guesses.find(g => g && g.roundNumber === rd.roundNumber);
      if (!validPoint(a) || !validPoint(b)) continue;
      const r = { caption: 'Round ' + (rd.roundNumber || i + 1),
        guesses: { A: point(a), B: point(b) } };
      if (validPoint(rd.panorama)) r.location = point(rd.panorama);
      const healthA = healthFor(duel.teams[0], 0, rd.roundNumber), healthB = healthFor(duel.teams[1], 1, rd.roundNumber);
      if (healthA || healthB) r.health = { A: healthA, B: healthB };
      if (rd.panorama && typeof rd.panorama === 'object') {
        r.panorama = rd.panorama;
        const panoId = rd.panorama.panoId || rd.panorama.pano;
        if (typeof panoId === 'string' && panoId) r.panoId = panoId;
        if (Number.isFinite(rd.panorama.heading)) r.heading = rd.panorama.heading;
        if (Number.isFinite(rd.panorama.pitch) && rd.panorama.pitch >= -90 && rd.panorama.pitch <= 90) r.pitch = rd.panorama.pitch;
      }
      rounds.push(r);
    }
    if (!rounds.length) return null;
    const rawMovement = duel.movementOptions || duel.options?.movementOptions;
    const movement = rawMovement && ['forbidMoving','forbidRotating','forbidZooming'].every(k => typeof rawMovement[k] === 'boolean')
      ? { forbidMoving: rawMovement.forbidMoving, forbidRotating: rawMovement.forbidRotating, forbidZooming: rawMovement.forbidZooming } : null;
    return { key: gameId, playerId, target: side === 0 ? 'A' : 'B', rounds, movement };
  }
  function assignDistinct(profiles, candidates) {
    const assigned = new Map();
    function assign(id, seen) {
      for (const game of candidates.get(id) || []) {
        if (seen.has(game.key)) continue;
        seen.add(game.key);
        const prev = assigned.get(game.key);
        if (!prev || assign(prev.id, seen)) { assigned.set(game.key, { id, game }); return true; }
      }
      return false;
    }
    for (const p of shuffle(profiles).sort((a, b) => candidates.get(a.id).length - candidates.get(b.id).length))
      assign(p.id, new Set());
    const found = new Set([...assigned.values()].map(x => x.id));
    return { missing: profiles.filter(p => !found.has(p.id)), games: shuffle([...assigned.values()].map(x => {
      const { key, ...game } = x.game; return { ...game, gameId: key };
    })) };
  }
  async function collectProfiles(links, progress = () => {}, isCancelled = () => false) {
    if (!Array.isArray(links)) throw new Error('Informe os links dos perfis.');
    const cleanLinks = links.map(x => typeof x === 'string' ? x.trim() : '').filter(Boolean);
    const ids = cleanLinks.map(getId);
    if (ids.length < 1 || ids.length > MAX_PROFILES || ids.some(id => !id) || new Set(ids).size !== ids.length)
      throw new Error('Informe de 1 a 10 links válidos e diferentes de perfis GeoGuessr.');
    const profiles = [], candidates = new Map(), cache = new Map();
    for (let i = 0; i < ids.length; i++) {
      if (isCancelled()) throw new Error('Coleta cancelada.');
      const id = ids[i]; progress(`Consultando perfil ${i + 1} de ${ids.length}...`);
      const user = await json('https://www.geoguessr.com/api/v3/users/' + encodeURIComponent(id));
      if (!user || typeof user.nick !== 'string') throw new Error('O perfil retornado não contém um nome reconhecível.');
      const p = { id, name: user.nick, url: cleanLinks[i] }; profiles.push(p);
      const history = await json('https://www.geoguessr.com/api/v4/game-history/' + encodeURIComponent(id) + '/game-ids');
      const games = shuffle(gameIds(history)).slice(0, MAX_DUELS_PER_PROFILE), usable = [];
      for (let n = 0; n < games.length; n++) {
        if (isCancelled()) throw new Error('Coleta cancelada.');
        progress(`Analisando ${p.name}: duelo ${n + 1} de ${games.length}...`);
        const gameId = games[n];
        if (!cache.has(gameId)) {
          await wait(350);
          try { cache.set(gameId, await json('https://game-server.geoguessr.com/api/duels/' + encodeURIComponent(gameId))); }
          catch (err) { if (err.status === 404) { cache.set(gameId, null); continue; } throw err; }
        }
        if (!cache.get(gameId)) continue;
        const game = extract(cache.get(gameId), id, gameId);
        if (game) usable.push(game);
      }
      candidates.set(id, usable);
    }
    if (isCancelled()) throw new Error('Coleta cancelada.');
    const chosen = assignDistinct(profiles, candidates);
    if (chosen.missing.length) throw new Error('Não foi possível obter um duelo solo distinto com palpites dos dois jogadores para: ' + chosen.missing.map(p => p.name).join(', ') + '. O histórico pode estar vazio, inacessível ou conter partidas sem dados completos.');
    return { profiles, games: chosen.games };
  }

  const SITE_ORIGIN = 'https://quem-jogou-eloguessr.novelalpaca1.chatgpt.site';
  const REQUEST_KEY = 'eloguessr.bridge.request.v1';
  const RESPONSE_PREFIX = 'eloguessr.bridge.response.v1.';
  const CANCEL_PREFIX = 'eloguessr.bridge.cancel.v1.';
  const CHANNEL = 'eloguessr-bridge-v1';
  const validId = id => typeof id === 'string' && /^[a-z0-9-]{20,80}$/i.test(id);

  if (location.origin === SITE_ORIGIN) {
    const active = new Map();
    const reply = message => window.postMessage({ channel: CHANNEL, ...message }, SITE_ORIGIN);
    window.addEventListener('message', event => {
      if (event.origin !== SITE_ORIGIN || !event.data || event.data.channel !== CHANNEL) return;
      const message = event.data;
      if (message.type === 'ping') { reply({ type: 'ready', version: '0.6.0' }); return; }
      if (message.type === 'cancel') { if (active.has(message.id)) active.get(message.id).cancelled = true; return; }
      if (message.type !== 'collect' || !validId(message.id) || !Array.isArray(message.links) || active.has(message.id)) return;
      if (message.links.length < 1 || message.links.length > MAX_PROFILES || message.links.some(link => !getId(link))) {
        reply({ type: 'error', id: message.id, message: 'Confira os links dos perfis.' }); return;
      }
      const state = { cancelled: false }; active.set(message.id, state);
      const send = (type, extra = {}) => { if (!state.cancelled) reply({ id: message.id, type, ...extra }); };
      send('started');
      collectProfiles(message.links, progress => send('progress', { message: progress }), () => state.cancelled)
        .then(data => send('result', { data }))
        .catch(error => send('error', { message: error && error.message || 'Não foi possível coletar as partidas.' }))
        .finally(() => active.delete(message.id));
    });
    window.addEventListener('pagehide', () => { for (const state of active.values()) state.cancelled = true; });
    reply({ type: 'ready', version: '0.6.0' });
    return;
  }
  if (location.origin !== 'https://www.geoguessr.com') return;

  const handled = new Set();
  async function processRequest(request) {
    if (!request || !validId(request.id) || !Array.isArray(request.links) || !Number.isFinite(request.createdAt) || Math.abs(Date.now() - request.createdAt) > 180000 || handled.has(request.id)) return;
    handled.add(request.id);
    const key = RESPONSE_PREFIX + request.id;
    const send = (type, extra = {}) => GM_setValue(key, { id: request.id, type, ...extra });
    const work = async lock => {
      if (!lock) return;
      const current = GM_getValue(REQUEST_KEY, null);
      if (!current || current.id !== request.id || GM_getValue(CANCEL_PREFIX + request.id, false)) return;
      GM_deleteValue(REQUEST_KEY); send('started');
      const cancelled = () => Boolean(GM_getValue(CANCEL_PREFIX + request.id, false));
      try { const data = await collectProfiles(request.links, message => send('progress', { message }), cancelled); if (!cancelled()) send('result', { data }); }
      catch (error) { if (!cancelled()) send('error', { message: error && error.message || 'Não foi possível coletar as partidas.' }); }
      finally { GM_deleteValue(CANCEL_PREFIX + request.id); }
    };
    const fail = message => {
      const current = GM_getValue(REQUEST_KEY, null);
      if (current && current.id === request.id) GM_deleteValue(REQUEST_KEY);
      if (!GM_getValue(CANCEL_PREFIX + request.id, false)) send('error', { message });
    };
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      try { await navigator.locks.request('eloguessr-' + request.id, { ifAvailable: true }, work); }
      catch (_) { fail('Não foi possível iniciar a coleta no GeoGuessr.'); }
    } else {
      fail('Este navegador não oferece a coordenação necessária entre abas. Tente no Chrome ou Edge.');
    }
  }
  GM_addValueChangeListener(REQUEST_KEY, (_name, _oldValue, value, remote) => { if (remote && value) processRequest(value); });
  const queued = GM_getValue(REQUEST_KEY, null); if (queued) processRequest(queued);

  function show() {
    if (document.getElementById('eloguessr-collector')) return;
    const back = document.createElement('div'); back.id = 'eloguessr-collector';
    back.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000b;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,sans-serif;color:#eee';
    const box = document.createElement('div'); box.style.cssText = 'width:min(520px,100%);background:#111b17;border:1px solid #405342;border-radius:12px;padding:24px;box-shadow:0 12px 70px #0008';
    const heading = document.createElement('h2'); heading.textContent = 'Coletar para o Eloguessr'; heading.style.margin = '0 0 12px';
    const info = document.createElement('p'); info.textContent = 'Cole de 1 a 10 links de perfis, um por linha. Esta opção baixa um JSON; também é possível gerar diretamente pelo Eloguessr com esta aba aberta.'; info.style.cssText = 'font-size:14px;line-height:1.5;color:#bdcbbf';
    const input = document.createElement('textarea'); input.placeholder = 'https://www.geoguessr.com/user/...'; input.rows = 6; input.style.cssText = 'box-sizing:border-box;width:100%;padding:12px;background:#09110d;border:1px solid #536658;border-radius:8px;color:white;resize:vertical;font:14px monospace';
    const status = document.createElement('p'); status.style.cssText = 'font-size:13px;line-height:1.5;white-space:pre-wrap;color:#c8dcae'; status.textContent = 'Nenhuma coleta foi iniciada.';
    const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:10px';
    const collect = document.createElement('button'); collect.textContent = 'Coletar e baixar JSON'; collect.style.cssText = 'padding:11px 15px;background:#c8f76b;color:#10200d;border:0;border-radius:6px;font-weight:bold;cursor:pointer';
    const close = document.createElement('button'); close.textContent = 'Fechar'; close.style.cssText = 'padding:11px 15px;background:#25372c;color:white;border:0;border-radius:6px;cursor:pointer';
    let cancelled = false; close.onclick = () => { cancelled = true; back.remove(); };
    collect.onclick = async () => {
      collect.disabled = true; input.disabled = true; collect.style.opacity = '.5';
      try {
        const links = input.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const data = await collectProfiles(links, message => { status.textContent = message; }, () => cancelled);
        if (cancelled) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const href = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = href; a.download = 'eloguessr-partidas.json'; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 30000);
        status.textContent = 'Arquivo gerado. Importe-o na página do Eloguessr.';
      } catch (err) { if (!cancelled) status.textContent = 'Não foi possível concluir: ' + (err && err.message || 'erro desconhecido'); }
      finally { if (!cancelled) { collect.disabled = false; input.disabled = false; collect.style.opacity = '1'; } }
    };
    buttons.append(collect, close); box.append(heading, info, input, status, buttons); back.append(box); document.body.append(back);
  }
  GM_registerMenuCommand('Eloguessr: coletar duelos', show);
})();
