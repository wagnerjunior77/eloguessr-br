/* Data adapter: replace the sample dataset with validated GeoGuessr match data when an authorized source is available. */
const images=[
 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=85',
 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1800&q=85',
 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=85',
 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1800&q=85',
 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1800&q=85'
];
const profiles=[{id:'nina',name:'Nina',url:''},{id:'caio',name:'Caio',url:''},{id:'leo',name:'Léo',url:''}];
function demoRound(i, seed){const locations=[[-13.1,-58.2],[46.8,8.2],[35.4,137.1],[-25.2,133.7],[48.6,-113.8]]; const c=locations[(i+seed)%locations.length];return {image:images[(i+seed)%images.length],caption:'Paisagem de demonstração',location:{lat:c[0],lng:c[1]},guesses:{A:{lat:c[0]+(seed+1)*2.6,lng:c[1]-4.3},B:{lat:c[0]-3.3,lng:c[1]+(i+1)*2.2}}}}
// Dados de vida fictícios somente para a demonstração.
const demoHealth=[
 {A:[6000,6000,4900,4900,5200,3900],B:[6000,4800,4800,3500,3500,2400]},
 {A:[6000,4200,4200,2800,3100,3100],B:[6000,6000,4800,4800,3600,2400]},
 {A:[6000,6000,5100,4200,4200,3200],B:[6000,5200,5200,5200,4200,2500]}
];
const demo={profiles,games:['caio','leo','nina'].map((playerId,seed)=>({playerId,target:'A',rounds:Array.from({length:5},(_,i)=>{const round=demoRound(i,seed);round.health=Object.fromEntries(['A','B'].map(side=>[side,{before:demoHealth[seed][side][i],after:demoHealth[seed][side][i+1],max:6000}]));return round})}))};
let data=structuredClone(demo), gameIndex=0, roundIndex=0, answers={}, map, mapLayer, imported=false;
let googleReady=false, googleActive=false, googleAuthFailed=false, googleKeyUsed='', googleMap, googleMarkers=[], googleLines=[], streetView, streetViewService, streetViewRequest=0, lastSceneKey='';
let embedActive=false, embedKey='', lastEmbedScene='';
let healthScene='',healthAnimation=0;
const $=id=>document.getElementById(id);
function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function render(){
 const game=data.games[gameIndex],round=game.rounds[roundIndex],target=game.target||'A';
 $('gameTabs').replaceChildren();data.games.forEach((g,i)=>{const b=make('button','game-tab'+(i===gameIndex?' active':'')+(answers[i]?' answered':''));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(i===gameIndex));b.append(document.createTextNode('Jogo '+String(i+1).padStart(2,'0')),make('span','tab-num',answers[i]?'✓':''));b.onclick=()=>{gameIndex=i;roundIndex=0;render()};$('gameTabs').append(b)});
 const done=Object.keys(answers).length;$('progressText').innerHTML=done+' <small>/ '+data.games.length+'</small>';$('progressBar').style.width=(done/data.games.length*100)+'%';$('currentGame').textContent='Jogo '+String(gameIndex+1).padStart(2,'0');$('selectedCount').textContent=(answers[gameIndex]?1:0)+' / 1';$('roundBadge').textContent='ROUND '+String(roundIndex+1).padStart(2,'0');document.querySelector('.round-badge .tiny-label').textContent=imported?'PARTIDA IMPORTADA':'DEMONSTRAÇÃO';$('roundLabel').innerHTML=String(roundIndex+1).padStart(2,'0')+' <i>/</i> '+String(game.rounds.length).padStart(2,'0');$('sceneCaption').textContent=round.caption||'Local da rodada';$('scene').style.backgroundImage=round.image?'url("'+round.image.replace(/["\\]/g,'')+'")':'none';
 document.querySelector('.side-description').replaceChildren(document.createTextNode('Identifique '),make('strong','',`★ Jogador ${target}`),document.createTextNode('.'));document.querySelector('.round-summary strong:last-child').innerHTML='<span class="star">★</span> Jogador '+target;
 $('roundDots').replaceChildren();game.rounds.forEach((_,i)=>{const b=make('button',i===roundIndex?'active':'');b.setAttribute('aria-label','Ir para round '+(i+1));b.onclick=()=>{roundIndex=i;render()};$('roundDots').append(b)});
 $('playerOptions').replaceChildren();data.profiles.forEach(p=>{
  const selected=answers[gameIndex]===p.id;
  const used=Object.entries(answers).find(([index,id])=>Number(index)!==gameIndex && id===p.id);
  const b=make('button','player-option'+(selected?' selected':'')+(used?' unavailable':''));
  b.setAttribute('aria-pressed',String(selected));b.disabled=Boolean(used);
  const av=make('span','avatar',p.name.trim().slice(0,2).toUpperCase());const info=make('span','option-text');info.append(make('strong','',p.name));
  if(used){const label='Escolhido no Jogo '+String(Number(used[0])+1).padStart(2,'0');info.append(make('small','',label));b.title=label+'. Remova a seleção naquele jogo para usar este jogador.'}
  b.append(av,info,make('span','radio'));b.onclick=()=>{if(selected)delete answers[gameIndex];else answers[gameIndex]=p.id;render()};$('playerOptions').append(b)
 });
 const complete=done===data.games.length;$('submitButton').disabled=!complete;$('submitStatus').innerHTML=complete?'<span>✓</span> Tudo pronto para revelar':'<span>◌</span> Responda todos os jogos para revelar';
 renderHealth(round,target);
 updateMap(round,target);
 updateStreetView(round);
}
function renderHealth(round,target){
 const signature=JSON.stringify([gameIndex,roundIndex,imported,target,round.health]);
 if(signature===healthScene)return;healthScene=signature;const token=++healthAnimation;
 const format=new Intl.NumberFormat('pt-BR');
 for(const side of ['A','B']){
  const h=round.health?.[side], label=$('healthName'+side),value=$('healthValue'+side),fill=$('healthFill'+side),change=$('healthChange'+side);
  label.textContent='Jogador '+side+(target===side?' ★':'');
  const valid=h && Number.isFinite(h.before) && h.before>=0 && Number.isFinite(h.after) && h.after>=0 && Number.isFinite(h.max) && h.max>0 && h.before<=h.max && h.after<=h.max;
  if(!valid){value.textContent='—';value.removeAttribute('aria-label');fill.style.width='0%';change.textContent='Vida indisponível';change.className='health-change';continue}
  const delta=h.after-h.before;
  value.textContent=format.format(h.before)+' HP';fill.style.transition='none';fill.style.width=(100*h.before/h.max)+'%';
  change.textContent=delta===0?'Sem alteração':(delta>0?'+':'−')+format.format(Math.abs(delta))+' HP';
  change.className='health-change '+(delta>0?'gain':delta<0?'loss':'');
  value.setAttribute('aria-label','Vida no início: '+format.format(h.before)+'; no fim: '+format.format(h.after)+' pontos');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==healthAnimation)return;fill.style.transition='';fill.style.width=(100*h.after/h.max)+'%';value.textContent=format.format(h.after)+' HP'}));
 }
}
function updateLeafletMap(round,target){if(!window.L)return;if(!map){map=L.map('leafletMap',{zoomControl:true,scrollWheelZoom:false,attributionControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);mapLayer=L.layerGroup().addTo(map)}mapLayer.clearLayers();const points=[];['A','B'].forEach(letter=>{const p=round.guesses[letter];points.push([p.lat,p.lng]);const icon=L.divIcon({className:'',html:'<div class="map-pin '+letter.toLowerCase()+'">'+letter+(target===letter?'<span>★</span>':'')+'</div>',iconSize:[27,27],iconAnchor:[13,13]});L.marker([p.lat,p.lng],{icon}).addTo(mapLayer)});if(round.location){const p=round.location;points.push([p.lat,p.lng]);L.marker([p.lat,p.lng],{icon:L.divIcon({className:'map-location',html:'✚',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(mapLayer);['A','B'].forEach(letter=>L.polyline([[p.lat,p.lng],[round.guesses[letter].lat,round.guesses[letter].lng]],{color:letter==='A'?'#6f913e':'#688ba2',weight:2,dashArray:'4 4'}).addTo(mapLayer))}map.fitBounds(points,{padding:[28,28],maxZoom:7});setTimeout(()=>map.invalidateSize(),50)}
function updateMap(round,target){
 const shell=document.querySelector('.map-shell');shell.hidden=embedActive; $('embedMapNotice').hidden=!embedActive; $('scene').classList.toggle('embed-mode',embedActive);
 if(embedActive){$('leafletMap').hidden=true;$('googleMap').hidden=true;return}
 if(!googleActive || !googleReady){$('googleMap').hidden=true;$('leafletMap').hidden=false;updateLeafletMap(round,target);return}
 $('leafletMap').hidden=true;$('googleMap').hidden=false;
 const g=window.google.maps;
 if(!googleMap) googleMap=new g.Map($('googleMap'),{mapId:$('mapsId').value.trim()||'ebc2e3b6b7138a628cf18dd3',mapTypeId:'roadmap',streetViewControl:false,mapTypeControl:false,fullscreenControl:false,gestureHandling:'greedy'});
 googleMarkers.forEach(m=>m.setMap(null));googleLines.forEach(l=>l.setMap(null));googleMarkers=[];googleLines=[];
 const bounds=new g.LatLngBounds();
 ['A','B'].forEach(letter=>{const point=round.guesses[letter];bounds.extend(point);googleMarkers.push(new g.Marker({map:googleMap,position:point,title:'Jogador '+letter+(target===letter?' (procurado)':''),label:{text:letter+(target===letter?'★':''),color:'white',fontSize:'11px',fontWeight:'bold'},icon:{path:g.SymbolPath.CIRCLE,scale:15,fillColor:letter==='A'?'#719339':'#668eaa',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2}}));});
 if(round.location){bounds.extend(round.location);googleMarkers.push(new g.Marker({map:googleMap,position:round.location,title:'Local da rodada',label:{text:'✚',color:'#183322',fontWeight:'bold'},icon:{path:g.SymbolPath.CIRCLE,scale:10,fillColor:'#ffffff',fillOpacity:1,strokeColor:'#183322',strokeWeight:1}}));['A','B'].forEach(letter=>googleLines.push(new g.Polyline({map:googleMap,path:[round.location,round.guesses[letter]],strokeColor:letter==='A'?'#719339':'#668eaa',strokeOpacity:.8,strokeWeight:2})));}
 googleMap.fitBounds(bounds,28);
}
function normalizePanoramaId(value){
 if(typeof value!=='string')return '';const id=value.trim();
 // GeoGuessr sometimes serializes a Google panorama ID as hexadecimal bytes.
 // Decode only if the entire value is valid hex and the result looks like a panorama ID.
 if(id.length>=32 && id.length%2===0 && /^[0-9a-f]+$/i.test(id)){
  try{const bytes=new Uint8Array(id.match(/../g).map(x=>parseInt(x,16)));const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/^[A-Za-z0-9_-]{10,}$/.test(decoded))return decoded}catch(_){}
 }
 return id;
}
function hideEmbed(){embedActive=false;lastEmbedScene='';$('embedStreetview').hidden=true;$('embedStreetview').removeAttribute('src')}
function updateEmbedStreetView(round){
 const panoId=normalizePanoramaId(round.panoId || round.panorama?.panoId || round.panorama?.pano);
 const sceneKey=JSON.stringify([gameIndex,roundIndex,imported,panoId,round.heading,round.pitch]);
 if(sceneKey===lastEmbedScene)return;lastEmbedScene=sceneKey;
 const frame=$('embedStreetview'),notice=$('sceneNotice');
 frame.hidden=true;frame.removeAttribute('src');$('streetview').hidden=true;
 if(!imported){notice.hidden=true;document.querySelector('.view-badge').textContent='◉   DEMONSTRAÇÃO';return}
 if(!panoId){notice.textContent='Esta rodada não possui um ID de panorama. Não é possível garantir a imagem original usando apenas as coordenadas.';notice.hidden=false;document.querySelector('.view-badge').textContent='◉   PANORAMA INDISPONÍVEL';return}
 const query=new URLSearchParams({key:embedKey,pano:panoId});
 if(Number.isFinite(round.heading))query.set('heading',String(Math.max(-180,Math.min(360,round.heading))));
 if(Number.isFinite(round.pitch))query.set('pitch',String(Math.max(-90,Math.min(90,round.pitch))));
 // Only pano is sent: adding location would silently fall back to different imagery.
 frame.src='https://www.google.com/maps/embed/v1/streetview?'+query.toString();frame.hidden=false;notice.hidden=true;
 document.querySelector('.view-badge').textContent='◉   STREET VIEW EMBED';
}
function updateStreetView(round){
 if(embedActive){updateEmbedStreetView(round);return}
 const panoId=normalizePanoramaId(round.panoId || round.panorama?.panoId || round.panorama?.pano);
 const canShow=googleActive && googleReady && imported && panoId; const key=JSON.stringify([googleActive,googleReady,imported,gameIndex,roundIndex,panoId,round.heading,round.pitch,round.panorama?.zoom,round.image]);
 if(key===lastSceneKey)return;lastSceneKey=key;const request=++streetViewRequest;
 $('streetview').hidden=true;const notice=$('sceneNotice');notice.hidden=!(imported&&!round.image);notice.textContent=googleActive?'Buscando o panorama desta rodada...':'Ative o Google Maps em Mapa para visualizar o Street View desta rodada.';document.querySelector('.view-badge').textContent='◉   VISTA DA RODADA';
 if(!canShow){if(imported && googleActive && !panoId){notice.hidden=false;notice.textContent='Este round não possui um ID de panorama. Não é possível garantir a imagem original usando apenas coordenadas.'}return;}
 const g=window.google.maps;streetViewService ||= new g.StreetViewService();
 document.querySelector('.view-badge').textContent='◉   BUSCANDO STREET VIEW';
 const query={pano:panoId};
 streetViewService.getPanorama(query,(result,status)=>{
  if(request!==streetViewRequest)return;
  if(status!==g.StreetViewStatus.OK || !result?.location?.pano){notice.hidden=false;notice.textContent='Não foi encontrado um panorama disponível para esta rodada.';document.querySelector('.view-badge').textContent='◉   STREET VIEW INDISPONÍVEL';return}
  streetView ||= new g.StreetViewPanorama($('streetview'),{addressControl:false,showRoadLabels:false,linksControl:true,fullscreenControl:false,enableCloseButton:false});
  notice.hidden=true;streetView.setPano(result.location.pano);streetView.setPov({heading:Number.isFinite(round.heading)?round.heading:(Number.isFinite(round.panorama?.heading)?round.panorama.heading:0),pitch:Number.isFinite(round.pitch)?round.pitch:(Number.isFinite(round.panorama?.pitch)?round.panorama.pitch:0)});if(Number.isFinite(round.panorama?.zoom))streetView.setZoom(Math.max(0,round.panorama.zoom));$('streetview').hidden=false;g.event.trigger(streetView,'resize');document.querySelector('.view-badge').textContent='◉   PANORAMA DA RODADA';
 });
}
function useOpenStreetMap(message='Mapa atual: OpenStreetMap.'){
 hideEmbed();googleActive=false;lastSceneKey='';$('mapsStatus').textContent=message;render();
}
function showMapError(message){const banner=$('mapErrorBanner');banner.textContent=message;banner.hidden=false}
window.gm_authFailure=()=>{googleAuthFailed=true;googleReady=false;$('enableGoogle').disabled=false;const message='Não foi possível autorizar o Google Maps. Confira se a Maps JavaScript API está ativa, o faturamento e a restrição do domínio no Google Cloud.';showMapError(message);useOpenStreetMap(message)};
$('enableEmbed').onclick=()=>{const value=$('embedKey').value.trim();if(!value){$('mapsStatus').textContent='Informe uma chave com a Maps Embed API ativada.';return}embedKey=value;$('embedKey').value='';embedActive=true;googleActive=false;streetViewRequest++;lastEmbedScene='';if(map){map.remove();map=null;mapLayer=null}document.querySelector('.map-kicker').textContent='MAPA INDISPONÍVEL';$('mapsStatus').textContent='Street View Embed selecionado. O carregamento depende da chave e do panorama.';$('mapsDialog').close();render()};
$('closeMaps').onclick=()=>$('mapsDialog').close();$('useOsm').onclick=()=>{useOpenStreetMap();$('mapsDialog').close()};
function enableGoogleMaps(configuredKey){
 const key=configuredKey||$('mapsKey').value.trim()||googleKeyUsed;if(!key){$('mapsStatus').textContent='Informe uma chave da Maps JavaScript API.';return}
 if(googleKeyUsed && key!==googleKeyUsed){$('mapsStatus').textContent='Para usar outra chave, recarregue esta página e tente novamente.';return}
 if(googleReady){hideEmbed();googleActive=true;googleMap=null;lastSceneKey='';$('mapsStatus').textContent='Google Maps ativado.';$('mapsDialog').close();render();return}
 if(googleKeyUsed){$('mapsStatus').textContent='Recarregue a página para tentar novamente.';return}
 googleKeyUsed=key;$('mapsStatus').textContent='Carregando Google Maps...';$('enableGoogle').disabled=true;
 const sdk=document.createElement('script');sdk.async=true;sdk.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback=eloguessrMapsReady';
 window.eloguessrMapsReady=()=>{if(googleAuthFailed)return;hideEmbed();googleReady=true;googleActive=true;$('enableGoogle').disabled=false;$('mapsKey').value='';$('mapsStatus').textContent='Google Maps carregado; a autorização é verificada pelo Google.';$('mapErrorBanner').hidden=true;if($('mapsDialog').open)$('mapsDialog').close();lastSceneKey='';render()};
 sdk.onerror=()=>{$('enableGoogle').disabled=false;const message='Não foi possível carregar o Google Maps. Verifique a conexão e recarregue a página para tentar novamente.';showMapError(message);useOpenStreetMap(message)};document.head.append(sdk);
}
$('enableGoogle').onclick=()=>enableGoogleMaps();
$('prevRound').onclick=()=>{roundIndex=(roundIndex-1+data.games[gameIndex].rounds.length)%data.games[gameIndex].rounds.length;render()};$('nextRound').onclick=()=>{roundIndex=(roundIndex+1)%data.games[gameIndex].rounds.length;render()};$('expandMap').onclick=()=>{document.querySelector('.map-shell').classList.toggle('expanded');setTimeout(()=>{if(googleActive && googleMap){google.maps.event.trigger(googleMap,'resize');updateMap(data.games[gameIndex].rounds[roundIndex],data.games[gameIndex].target)}else if(map)map.invalidateSize()},220)};
$('profilesButton').onclick=()=>{$('profileDialog').showModal();requestBridgeReady()};$('closeProfiles').onclick=()=>{cancelBridge();$('profileDialog').close()};$('saveProfiles').onclick=()=>{cancelBridge();$('profileDialog').close()};
$('restartButton').onclick=()=>{answers={};gameIndex=0;roundIndex=0;render()};$('submitButton').onclick=()=>{if(Object.keys(answers).length!==data.games.length || new Set(Object.values(answers)).size!==data.games.length)return;let score=0;$('resultList').replaceChildren();data.games.forEach((g,i)=>{const correct=data.profiles.find(p=>p.id===g.playerId),chosen=data.profiles.find(p=>p.id===answers[i]);const ok=correct.id===chosen.id;if(ok)score++;const row=make('div','result-row');const desc=make('div');desc.append(make('small','',`JOGO ${String(i+1).padStart(2,'0')} · VOCÊ ESCOLHEU ${chosen.name.toUpperCase()}`),make('strong','',`Jogador correto: ${correct.name}`));const actions=make('div','result-actions');if(typeof g.gameId==='string' && /^[a-z0-9-]{8,100}$/i.test(g.gameId)){const link=make('a','result-link','Ver partida ↗');link.href='https://www.geoguessr.com/duels/'+encodeURIComponent(g.gameId)+'/summary';link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`Ver partida ${i+1} no GeoGuessr (abre em nova aba)`);actions.append(link)}actions.append(make('span','status'+(ok?'':' wrong'),ok?'✓':'×'));row.append(desc,actions);$('resultList').append(row)});$('score').innerHTML=score+'<span>/'+data.games.length+'</span>';$('scoreMessage').textContent=score===data.games.length?'Você acertou todos os jogadores!':'Cada palpite conta uma história.';$('resultDialog').showModal()};$('closeResults').onclick=()=>$('resultDialog').close();$('playAgain').onclick=()=>{$('resultDialog').close();answers={};gameIndex=0;roundIndex=0;render()};
function validate(d){if(!d||!Array.isArray(d.profiles)||!Array.isArray(d.games)||d.profiles.length<1||d.profiles.length>20||d.games.length!==d.profiles.length)throw Error('Inclua de 1 a 20 perfis e exatamente um jogo por perfil.');const ids=new Set();for(const p of d.profiles){if(typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim()||ids.has(p.id))throw Error('Cada perfil precisa de id único e nome.');ids.add(p.id)}const owners=new Set();const validPoint=p=>p&&Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lng)&&p.lng>=-180&&p.lng<=180;for(const g of d.games){if(!ids.has(g.playerId)||owners.has(g.playerId)||!['A','B'].includes(g.target)||!Array.isArray(g.rounds)||!g.rounds.length||g.rounds.length>50)throw Error('Cada jogo precisa de um playerId único, target A ou B e rounds.');owners.add(g.playerId);for(const r of g.rounds){if(!r.guesses||!validPoint(r.guesses.A)||!validPoint(r.guesses.B)||(r.location&&!validPoint(r.location)))throw Error('Confira as coordenadas dos palpites e locais.');if(r.panoId!==undefined&&(typeof r.panoId!=='string'||!r.panoId.trim()))throw Error('O panoId deve ser um texto não vazio.');if((r.heading!==undefined&&!Number.isFinite(r.heading))||(r.pitch!==undefined&&(!Number.isFinite(r.pitch)||r.pitch < -90||r.pitch > 90)))throw Error('Confira heading e pitch do panorama.');if(r.image&&(!/^https:\/\//i.test(r.image)||typeof r.image!=='string'))throw Error('As imagens devem usar URLs HTTPS.')}}return d}
$('jsonFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('O arquivo deve ter até 1 MB.');const parsed=validate(JSON.parse(await file.text()));cancelBridge();activateData(parsed)}catch(err){$('profileMessage').textContent='Não foi possível importar: '+err.message}e.target.value=''};
const historyFiles=[];
$('historyFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const ownerId=DuelImport.parseProfileId($('historyOwner').value);if(!ownerId)throw Error('Informe o link do perfil que exportou o arquivo.');if(file.size>25*1024*1024)throw Error('O arquivo deve ter até 25 MB.');const payload=JSON.parse(await file.text());if(!payload.stores||!Array.isArray(payload.stores.duels)||!Array.isArray(payload.stores.rounds))throw Error('Este não parece ser um export compatível da extensão.');historyFiles.push({ownerId,payload});$('historyStatus').textContent=historyFiles.length+' histórico(s) adicionado(s).';$('profileMessage').textContent='Arquivo carregado somente neste navegador.'}catch(err){$('profileMessage').textContent='Não foi possível adicionar: '+err.message}e.target.value=''};
$('startHistory').onclick=()=>{try{const lines=$('profileLinks').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const profiles=lines.map((line,i)=>{const parts=line.split('|').map(x=>x.trim());const url=parts.length>1?parts[parts.length-1]:parts[0];const id=DuelImport.parseProfileId(url);if(!id)throw Error('Confira o link na linha '+(i+1)+'.');return {id,name:parts.length>1?parts[0]:'Jogador '+(i+1),url}});const result=DuelImport.convert(historyFiles,profiles);if(result.missing.length)throw Error('Não foi possível encontrar um duelo distinto para: '+result.missing.map(p=>p.name).join(', ')+'. Adicione outros históricos ou ajuste os perfis.');cancelBridge();activateData(result.data)}catch(err){$('profileMessage').textContent='Não foi possível montar: '+err.message}};
// O coletor usa a sessão no navegador e consulta diretamente o GeoGuessr.
const BRIDGE_CHANNEL='eloguessr-bridge-v1';
let bridgeReady=false, bridgePending=null, bridgeTimer=null;
function requestBridgeReady(){bridgeReady=false;window.postMessage({channel:BRIDGE_CHANNEL,type:'ping'},location.origin)}
function bridgeReset(){if(bridgeTimer)clearTimeout(bridgeTimer);bridgeTimer=null;bridgePending=null;$('generateGames').disabled=false}
function cancelBridge(){if(bridgePending?.sent)window.postMessage({channel:BRIDGE_CHANNEL,type:'cancel',id:bridgePending.id},location.origin);bridgeReset()}
function activateData(dataset){
 data=validate(dataset);imported=true;lastSceneKey='';lastEmbedScene='';healthScene='';answers={};gameIndex=roundIndex=0;
 document.querySelector('.demo-badge').innerHTML='<i></i> PARTIDAS IMPORTADAS';document.querySelector('footer span:last-child').textContent='Dados de partidas importadas';
 $('profileDialog').close();render();
}
function bridgeTimeout(message,ms){if(bridgeTimer)clearTimeout(bridgeTimer);const id=bridgePending?.id;bridgeTimer=setTimeout(()=>{if(!bridgePending||bridgePending.id!==id)return;cancelBridge();$('profileMessage').textContent=message},ms)}
function startBridgeRequest(){
 if(!bridgePending||bridgePending.sent||!bridgeReady)return;
 bridgePending.sent=true;const {id,links}=bridgePending;
 $('profileMessage').textContent='Iniciando consulta ao GeoGuessr...';
 window.postMessage({channel:BRIDGE_CHANNEL,type:'collect',id,links},location.origin);
 bridgeTimeout('O coletor não respondeu. Atualize o coletor, recarregue esta página e tente novamente.',15000);
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||!event.data||event.data.channel!==BRIDGE_CHANNEL)return;
 const msg=event.data;
 if(msg.type==='ready'){const [major=0,minor=0,patch=0]=String(msg.version||'').split('.').map(Number);bridgeReady=major>0||minor>5||(minor===5&&patch>=1);startBridgeRequest();return}
 if(!bridgePending||msg.id!==bridgePending.id)return;
 if(msg.type==='started'){bridgePending.started=true;$('profileMessage').textContent='Conectado ao GeoGuessr. Buscando jogos...';bridgeTimeout('A coleta demorou demais. Verifique sua conexão e tente novamente.',120000)}
 else if(msg.type==='progress'&&typeof msg.message==='string'){$('profileMessage').textContent=msg.message;bridgeTimeout('A coleta demorou demais. Verifique sua conexão e tente novamente.',120000)}
 else if(msg.type==='error'){const message=typeof msg.message==='string'?msg.message:'Não foi possível coletar os jogos.';bridgeReset();$('profileMessage').textContent=message}
 else if(msg.type==='result'){try{const selected=validate(msg.data),expected=new Set(bridgePending.links.map(link=>DuelImport.parseProfileId(link)));if(selected.profiles.length!==expected.size||selected.profiles.some(p=>!expected.has(p.id.toLowerCase())))throw Error('Os perfis recebidos não correspondem aos solicitados.');bridgeReset();activateData(selected);$('profileMessage').textContent=''}catch(error){bridgeReset();$('profileMessage').textContent='Não foi possível carregar: '+error.message}}
});
$('generateGames').onclick=()=>{
 if(bridgePending)return;
 const inputs=$('profileLinks').value.split(/\n+/).map(line=>line.trim()).filter(Boolean).map(line=>line.split('|').pop().trim());
 const ids=inputs.map(link=>DuelImport.parseProfileId(link));
 const links=inputs.map((input,i)=>/^[a-z0-9]{24}$/i.test(input)?'https://www.geoguessr.com/user/'+ids[i]:input);
 if(!links.length||links.length>10||ids.some(id=>!id)||new Set(ids).size!==ids.length){$('profileMessage').textContent='Informe de 1 a 10 links válidos e diferentes, um por linha.';return}
 const id=crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
 bridgePending={id,links,sent:false,started:false};$('generateGames').disabled=true;$('profileMessage').textContent='Procurando o coletor...';requestBridgeReady();
 bridgeTimer=setTimeout(()=>{
  if(!bridgePending||bridgePending.id!==id||bridgePending.sent)return;
  bridgeReset();$('profileMessage').textContent='Instale ou atualize o coletor, depois recarregue esta página.';
 },2000);
};

render();
if(typeof window.ELOGUESSR_CONFIG?.googleMapsApiKey==='string' && window.ELOGUESSR_CONFIG.googleMapsApiKey.trim())enableGoogleMaps(window.ELOGUESSR_CONFIG.googleMapsApiKey.trim());
else showMapError('Google Maps não está configurado neste ambiente. O mapa alternativo está ativo.');
