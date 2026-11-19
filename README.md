# Capital City — Grupo 16

Jogo multiplayer de navegador com cenário 3D em terceira pessoa, personagem controlável, carro conduzível, sete missões sobre Capital Próprio, temporizador de 15 segundos e classificação sincronizada.

## Executar
1. `npm install`
2. `npm start`
3. Abrir `http://localhost:3000`

## Publicar no Render
Build command: `npm install`
Start command: `npm start`

O apresentador cria uma sala e partilha o QR code. Os participantes entram nos seus telemóveis. O jogo usa Three.js através de CDN (é necessária ligação à Internet para carregar o motor 3D) e Socket.IO para o modo multijogador.

Controlos: joystick táctil ou teclas WASD/setas para movimentar o personagem; aproxima-te do carro e toca em «Entrar no carro»; usa «Acel.» e «Trav.» para conduzir. O apresentador inicia e avança as sete missões.

Nota: esta é uma versão 3D leve para navegador, não um jogo AAA. O estado das salas fica em memória no servidor e perde-se se o serviço reiniciar.
