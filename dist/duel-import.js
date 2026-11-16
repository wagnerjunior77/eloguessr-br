/* Importa exports do userscript "Geoguessr head-to-head duel statistics".
 * Uso: DuelImport.convert([{ ownerId, payload }], profiles)
 * Perfis: [{ id, name, url? }]. Retorno: { data, missing, skippedRounds }.
 */
(function (root) {
  'use strict';

  function validPoint(p) {
    return p && Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
      Number.isFinite(p.lng) && p.lng >= -180 && p.lng <= 180;
  }
  function point(p) { return { lat: p.lat, lng: p.lng }; }
  function shuffled(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function parseProfileId(input) {
    if (typeof input !== 'string') return null;
    const value = input.trim();
    if (/^[a-z0-9]{24}$/i.test(value)) return value.toLowerCase();
    try {
      const url = new URL(value);
      const match = url.hostname.toLowerCase().replace(/^www\./, '') === 'geoguessr.com' &&
        url.pathname.match(/^\/(?:[a-z]{2}\/)?user\/([a-z0-9]{24})\/?$/i);
      return match ? match[1].toLowerCase() : null;
    } catch (_) { return null; }
  }
  function convert(files, profiles) {
    if (!Array.isArray(profiles) || profiles.length < 2 || profiles.length > 20)
      throw new Error('Informe entre 2 e 20 perfis.');
    const cleanProfiles = profiles.map(p => {
      const id = parseProfileId(p.id || p.url || '');
      if (!id || typeof p.name !== 'string' || !p.name.trim())
        throw new Error('Cada perfil precisa de um link ou ID válido e um nome.');
      return { id, name: p.name.trim(), url: p.url || `https://www.geoguessr.com/user/${id}` };
    });
    if (new Set(cleanProfiles.map(p => p.id)).size !== cleanProfiles.length)
      throw new Error('Os perfis precisam ser diferentes.');
    if (!Array.isArray(files) || !files.length) throw new Error('Importe ao menos um arquivo de histórico.');
    const ids = new Set(cleanProfiles.map(p => p.id));
    const candidates = new Map(cleanProfiles.map(p => [p.id, []]));
    let skippedRounds = 0;
    for (const file of files) {
      const ownerId = parseProfileId(file.ownerId || '');
      if (!ownerId) throw new Error('Associe cada arquivo ao link ou ID do perfil que o exportou.');
      const stores = file.payload && file.payload.stores;
      if (!stores || !Array.isArray(stores.duels) || !Array.isArray(stores.rounds))
        throw new Error('O arquivo não é uma exportação de histórico de duelos compatível.');
      const roundByGame = new Map(stores.rounds.filter(r => r && typeof r.gameId === 'string').map(r => [r.gameId, r]));
      for (const duel of stores.duels) {
        if (!duel || typeof duel.gameId !== 'string') continue;
        const opponent = parseProfileId(duel.opponent || '');
        const raw = roundByGame.get(duel.gameId);
        if (!raw || !Array.isArray(raw.rounds)) continue;
        const rounds = [];
        for (const r of raw.rounds) {
          if (!r || !validPoint(r.ourGuess) || !validPoint(r.theirGuess)) { skippedRounds++; continue; }
          const panorama = r.panorama && typeof r.panorama === 'object' ? r.panorama : null;
          const result = { caption: 'Round ' + (r.roundNumber || rounds.length + 1),
            guesses: { A: point(r.ourGuess), B: point(r.theirGuess) } };
          if (validPoint(panorama)) result.location = point(panorama);
          // Preserve panorama metadata for a Google Street View adapter, if configured.
          if (panorama) { result.panorama = panorama; const panoId = panorama.panoId || panorama.pano; if (typeof panoId === 'string' && panoId) result.panoId = panoId; if (Number.isFinite(panorama.heading)) result.heading = panorama.heading; if (Number.isFinite(panorama.pitch) && panorama.pitch >= -90 && panorama.pitch <= 90) result.pitch = panorama.pitch; }
          rounds.push(result);
        }
        if (!rounds.length) continue;
        if (ids.has(ownerId)) candidates.get(ownerId).push({ key: duel.gameId, playerId: ownerId, target: 'A', rounds });
        if (opponent && ids.has(opponent) && opponent !== ownerId)
          candidates.get(opponent).push({ key: duel.gameId, playerId: opponent, target: 'B', rounds });
      }
    }
    // Assign distinct games with augmenting paths so a shared duel is not used twice.
    const assigned = new Map();
    const order = shuffled(cleanProfiles).sort((a, b) => candidates.get(a.id).length - candidates.get(b.id).length);
    const lists = new Map([...candidates].map(([id, games]) => [id, shuffled(games)]));
    function assign(id, seen) {
      for (const game of lists.get(id)) {
        if (seen.has(game.key)) continue;
        seen.add(game.key);
        const previous = assigned.get(game.key);
        if (!previous || assign(previous.id, seen)) {
          assigned.set(game.key, { id, game });
          return true;
        }
      }
      return false;
    }
    for (const profile of order) assign(profile.id, new Set());
    const found = new Set([...assigned.values()].map(x => x.id));
    const missing = cleanProfiles.filter(p => !found.has(p.id));
    const games = shuffled([...assigned.values()].map(({ game }) => ({
      playerId: game.playerId, target: game.target, rounds: game.rounds
    })));
    return { data: { profiles: cleanProfiles, games }, missing, skippedRounds };
  }
  root.DuelImport = Object.freeze({ convert, parseProfileId });
})(typeof window !== 'undefined' ? window : globalThis);
