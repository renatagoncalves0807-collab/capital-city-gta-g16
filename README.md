# Capital City — Grupo 17

Jogo de perguntas multiplayer inspirado na apresentação visual de jogos de mundo aberto. Inclui cenários fornecidos pela utilizadora, animação de personagem/carro, cinco missões, temporizador de 12 segundos e ranking sincronizado.

## Executar
1. `npm install`
2. `npm start`
3. Abrir `http://localhost:3000`

## Publicar no Render
Criar um serviço **Web Service** ligado ao repositório GitHub. Build command: `npm install`. Start command: `npm start`. Usar a instância Free, se disponível na conta.

O apresentador cria a sala e mostra o QR code. Os participantes entram nos seus telemóveis. O apresentador inicia e avança as missões. O estado é guardado em memória no servidor; reiniciar o serviço apaga a sala e a classificação.

As imagens em `public/assets/` foram fornecidas pela utilizadora e são usadas como cenários e elementos visuais. O jogo é uma experiência 2D de navegador com animações, não um motor 3D de mundo aberto.
