# Eloguessr BR

Jogo para descobrir quem disputou cada duelo do GeoGuessr a partir dos rounds e palpites.

## Executar com Docker

1. Copie `.env.example` para `.env` e preencha `GOOGLE_MAPS_API_KEY` com sua chave da Maps JavaScript API.
2. Execute `docker compose up -d --build`.
3. Acesse `http://localhost:8765/`.

O arquivo `.env` é local e não deve ser publicado. A chave da Maps JavaScript API é enviada ao navegador para carregar o Google Maps e o Street View; configure restrições de sites e de APIs no Google Cloud antes de expor o serviço.

Para buscar duelos, instale ou atualize o coletor indicado na tela de perfis e mantenha sua conta do GeoGuessr conectada no mesmo navegador. A chave de sessão não é enviada ao site.

Execute os testes com `node --test tests/collector-bridge.test.cjs tests/replay-timeline.test.cjs`.
