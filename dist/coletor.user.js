// ==UserScript==
// @name         Eloguessr • Coletar duelos
// @namespace    eloguessr-local
// @version      0.2.0
// @description  Exporta partidas disponíveis dos perfis informados para o Eloguessr, usando sua sessão GeoGuessr.
// @match        https://www.geoguessr.com/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
COMO USAR
1. Instale este script em um gerenciador de userscripts e entre no GeoGuessr.
2. No menu do gerenciador, escolha "Eloguessr: coletar duelos".
3. Informe de 1 a 10 links de perfis e clique em Coletar. Importe o JSON baixado no Eloguessr.
O script só consulta o GeoGuessr após o clique. Sua sessão e cookies não são enviados ao Eloguessr.
A conta conectada precisa ter acesso ao histórico. A disponibilidade varia por perfil.
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
    try { response = await fetch(url, { credentials: 'include' }); }
    catch (_) { throw new Error('A conexão foi bloqueada ou falhou. O navegador ou o GeoGuessr pode ter bloqueado o acesso entre domínios (CORS).'); }
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
    return { key: gameId, playerId, target: side === 0 ? 'A' : 'B', rounds };
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
      const { key, ...game } = x.game; return game;
    })) };
  }
  function show() {
    if (document.getElementById('eloguessr-collector')) return;
    const back = document.createElement('div'); back.id = 'eloguessr-collector';
    back.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000b;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,sans-serif;color:#eee';
    const box = document.createElement('div'); box.style.cssText = 'width:min(520px,100%);background:#111b17;border:1px solid #405342;border-radius:12px;padding:24px;box-shadow:0 12px 70px #0008';
    const heading = document.createElement('h2'); heading.textContent = 'Coletar para o Eloguessr'; heading.style.margin = '0 0 12px';
    const info = document.createElement('p'); info.textContent = 'Cole de 1 a 10 links de perfis, um por linha. A coleta usa sua sessão do GeoGuessr e só começa ao clicar no botão. O acesso aos históricos ainda depende das permissões da sua conta.'; info.style.cssText = 'font-size:14px;line-height:1.5;color:#bdcbbf';
    const input = document.createElement('textarea'); input.placeholder = 'https://www.geoguessr.com/user/...'; input.rows = 6; input.style.cssText = 'box-sizing:border-box;width:100%;padding:12px;background:#09110d;border:1px solid #536658;border-radius:8px;color:white;resize:vertical;font:14px monospace';
    const status = document.createElement('p'); status.style.cssText = 'font-size:13px;line-height:1.5;white-space:pre-wrap;color:#c8dcae'; status.textContent = 'Nenhuma coleta foi iniciada.';
    const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:10px';
    const collect = document.createElement('button'); collect.textContent = 'Coletar e baixar JSON'; collect.style.cssText = 'padding:11px 15px;background:#c8f76b;color:#10200d;border:0;border-radius:6px;font-weight:bold;cursor:pointer';
    const close = document.createElement('button'); close.textContent = 'Fechar'; close.style.cssText = 'padding:11px 15px;background:#25372c;color:white;border:0;border-radius:6px;cursor:pointer';
    let cancelled = false; close.onclick = () => { cancelled = true; back.remove(); };
    collect.onclick = async () => {
      const links = input.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const ids = links.map(getId);
      if (ids.length < 1 || ids.length > MAX_PROFILES || ids.some(id => !id) || new Set(ids).size !== ids.length) {
        status.textContent = 'Informe de 1 a 10 links válidos e diferentes de perfis GeoGuessr.'; return;
      }
      collect.disabled = true; input.disabled = true; collect.style.opacity = '.5';
      try {
        const profiles = [], candidates = new Map(), cache = new Map();
        for (let i = 0; i < ids.length; i++) {
          if (cancelled) return;
          const id = ids[i]; status.textContent = `Consultando perfil ${i + 1} de ${ids.length}...`;
          const user = await json('https://www.geoguessr.com/api/v3/users/' + encodeURIComponent(id));
          if (!user || typeof user.nick !== 'string') throw new Error('O perfil retornado não contém um nome reconhecível.');
          const p = { id, name: user.nick, url: links[i] }; profiles.push(p);
          const history = await json('https://www.geoguessr.com/api/v4/game-history/' + encodeURIComponent(id) + '/game-ids');
          const games = shuffle(gameIds(history)).slice(0, MAX_DUELS_PER_PROFILE);
          const usable = [];
          for (let n = 0; n < games.length; n++) {
            if (cancelled) return;
            status.textContent = `Analisando ${p.name}: duelo ${n + 1} de ${games.length}...`;
            const gameId = games[n];
            if (!cache.has(gameId)) {
              await wait(350);
              try {
                cache.set(gameId, await json('https://game-server.geoguessr.com/api/duels/' + encodeURIComponent(gameId)));
              } catch (err) {
                // Algumas partidas antigas não estão mais disponíveis.
                if (err.status === 404) { cache.set(gameId, null); continue; }
                throw err;
              }
            }
            if (!cache.get(gameId)) continue;
            const game = extract(cache.get(gameId), id, gameId);
            if (game) usable.push(game);
          }
          candidates.set(id, usable);
        }
        if (cancelled) return;
        const chosen = assignDistinct(profiles, candidates);
        if (chosen.missing.length) throw new Error('Não foi possível obter um duelo solo distinto com palpites dos dois jogadores para: ' + chosen.missing.map(p => p.name).join(', ') + '. O histórico pode estar vazio, inacessível ou conter partidas sem dados completos.');
        const blob = new Blob([JSON.stringify({ profiles, games: chosen.games }, null, 2)], { type: 'application/json' });
        const href = URL.createObjectURL(blob); const a = document.createElement('a');
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
