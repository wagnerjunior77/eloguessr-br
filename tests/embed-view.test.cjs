const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/app.js', 'utf8');
const html = fs.readFileSync('dist/index.html', 'utf8');
const start = source.indexOf('function normalizePanoramaId(');
const end = source.indexOf('function updateStreetView(', start);

function setup(round, key = 'test-key') {
  const frame = {hidden: true, src: '', removeAttribute(name) { if (name === 'src') this.src = ''; }};
  const notice = {hidden: false, textContent: ''};
  const streetview = {hidden: true}, badge = {textContent: ''};
  const elements = {embedStreetview: frame, sceneNotice: notice, streetview};
  const context = {URLSearchParams, TextDecoder, Uint8Array, Number, Math, JSON,
    gameIndex: 0, roundIndex: 0, imported: true, embedKey: key, lastEmbedScene: '',
    $: id => elements[id], document: {querySelector: () => badge}};
  vm.runInNewContext(source.slice(start, end) + '\nupdateEmbedStreetView(round);', {...context, round});
  return {frame, notice};
}

test('embed carrega o ID exato sem usar coordenadas alternativas', () => {
  const {frame, notice} = setup({panoId: 'pano-exato', heading: -20, pitch: 10});
  const url = new URL(frame.src);
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.pathname, '/maps/embed/v1/streetview');
  assert.equal(url.searchParams.get('pano'), 'pano-exato');
  assert.equal(url.searchParams.get('heading'), '340');
  assert.equal(url.searchParams.get('pitch'), '10');
  assert.equal(url.searchParams.has('location'), false);
  assert.equal(frame.hidden, false);
  assert.equal(notice.hidden, true);
});

test('round sem ID não mostra panorama próximo como se fosse o original', () => {
  const {frame, notice} = setup({location: {lat: 1, lng: 2}});
  assert.equal(frame.hidden, true);
  assert.match(notice.textContent, /não possui um ID/);
});

test('replay e panorama dinâmico não são carregados pela página', () => {
  assert.doesNotMatch(html, /id="replayOpen"|replay-timeline\.js/);
  assert.doesNotMatch(source, /new\s+g\.StreetViewPanorama/);
});
