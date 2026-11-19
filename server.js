const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const QUESTION_TIME = 15_000;
const PODIUM_TIME = 5_000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const missions = [
  { place:"DOWNTOWN LOS SANTOS", title:"Entrada de capital", question:"Quando os sócios realizam entradas de capital em dinheiro, qual é o principal efeito?", answers:["Aumenta o capital próprio e entra dinheiro na empresa","Aumenta sempre o passivo","Diminui o ativo e o capital próprio","É registado como um gasto"], correct:0 },
  { place:"CENTRO DA CIDADE", title:"Suprimentos", question:"O que caracteriza, em regra, um suprimento?", answers:["Uma reserva obrigatória","Um empréstimo do sócio à sociedade","Uma distribuição de dividendos","Uma entrada automática no capital social"], correct:1 },
  { place:"VINEWOOD HILLS", title:"Prestações acessórias", question:"As prestações acessórias correspondem a…", answers:["Obrigações adicionais dos sócios previstas no contrato de sociedade ou deliberadas nos termos legais","Juros pagos aos bancos","Lucros distribuídos aos trabalhadores","Impostos sobre o rendimento"], correct:0 },
  { place:"BLAINE COUNTY", title:"Reservas", question:"Qual é a finalidade principal da reserva legal?", answers:["Financiar exclusivamente publicidade","Substituir o capital social","Reforçar a proteção do capital próprio, nos termos legais","Eliminar todas as dívidas"], correct:2 },
  { place:"LOS SANTOS", title:"Participações próprias", question:"Quando uma sociedade adquire ações ou quotas próprias, estas…", answers:["São sempre consideradas um ativo financeiro comum","Devem ser tratadas contabilisticamente como uma dedução ao capital próprio","Aumentam automaticamente os resultados","Transformam-se em reservas legais"], correct:1 },
  { place:"MIRROR PARK", title:"Perda de capital", question:"Perante uma perda grave de capital próprio, a sociedade deve…", answers:["Ignorar a situação","Distribuir dividendos adicionais","Analisar a situação e cumprir os deveres legais aplicáveis","Encerrar automaticamente no próprio dia"], correct:2 },
  { place:"VESPUCCI BEACH", title:"Dividendos antecipados", question:"A distribuição de dividendos antecipados exige, entre outras condições…", answers:["Apenas autorização verbal de um sócio","Que exista dinheiro na conta bancária, independentemente dos resultados","O cumprimento dos requisitos legais e contabilísticos aplicáveis","Que a empresa não tenha capital próprio"], correct:2 }
];

const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function publicPlayers(room) {
  return [...room.players.values()]
    .map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      correct: p.correct,
      elapsed: p.elapsed
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.correct - a.correct ||
      a.elapsed - b.elapsed ||
      a.name.localeCompare(b.name, "pt")
    );
}

function emitState(room) {
  const players = publicPlayers(room);
  const state = {
    code: room.code,
    phase: room.phase,
    missionIndex: room.missionIndex,
    mission: room.phase === "question" ? {
      place: missions[room.missionIndex].place,
      title: missions[room.missionIndex].title,
      question: missions[room.missionIndex].question,
      answers: missions[room.missionIndex].answers
    } : null,
    endsAt: room.endsAt,
    totalPlayers: room.players.size,
    answeredCount: [...room.players.values()].filter(p => p.answered).length,
    players
  };
  io.to(room.code).emit("state", state);
}

function finishQuestion(room) {
  if (room.phase !== "question") return;
  clearTimeout(room.questionTimer);
  room.phase = "podium";
  room.endsAt = 0;
  emitState(room);
  room.podiumTimer = setTimeout(() => {
    if (room.phase === "podium") {
      // O apresentador decide quando avançar; o tempo serve apenas para manter a sala ativa.
      emitState(room);
    }
  }, PODIUM_TIME);
}

function startMission(room, index) {
  clearTimeout(room.questionTimer);
  clearTimeout(room.podiumTimer);
  if (index >= missions.length) {
    room.phase = "final";
    room.missionIndex = missions.length - 1;
    emitState(room);
    return;
  }
  room.phase = "question";
  room.missionIndex = index;
  room.endsAt = Date.now() + QUESTION_TIME;
  for (const player of room.players.values()) {
    player.answered = false;
    player.lastAnswerAt = null;
  }
  emitState(room);
  room.questionTimer = setTimeout(() => finishQuestion(room), QUESTION_TIME);
}

io.on("connection", socket => {
  socket.on("host:create", () => {
    const code = makeCode();
    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      phase: "lobby",
      missionIndex: -1,
      endsAt: 0,
      questionTimer: null,
      podiumTimer: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "host";
    socket.emit("created", { code });
    emitState(room);
  });

  socket.on("player:join", ({ code, name } = {}) => {
    code = String(code || "").trim().toUpperCase();
    name = String(name || "").trim().slice(0, 18);
    const room = rooms.get(code);
    if (!room) return socket.emit("error-msg", "Não encontrámos essa sala. Confirma o código.");
    if (!name) return socket.emit("error-msg", "Escreve o teu nome para entrar.");
    if (room.phase !== "lobby") return socket.emit("error-msg", "Esta sessão já começou. Pede ao apresentador um novo código.");
    const player = {
      id: socket.id,
      name,
      score: 0,
      correct: 0,
      elapsed: 0,
      answered: false,
      lastAnswerAt: null
    };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "player";
    socket.emit("joined", { code });
    emitState(room);
  });

  socket.on("host:start", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
    if (room.players.size === 0) {
      socket.emit("error-msg", "É preciso pelo menos um jogador para começar.");
      return;
    }
    startMission(room, 0);
  });

  socket.on("host:next", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== "podium") return;
    startMission(room, room.missionIndex + 1);
  });

  socket.on("player:answer", ({ choice } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || socket.data.role !== "player" || room.phase !== "question") return;
    const player = room.players.get(socket.id);
    if (!player || player.answered) return;

    const now = Date.now();
    if (now > room.endsAt) {
      player.answered = true;
      player.lastAnswerAt = room.endsAt;
      emitState(room);
      if ([...room.players.values()].every(p => p.answered)) finishQuestion(room);
      return;
    }

    player.answered = true;
    player.lastAnswerAt = now;
    const mission = missions[room.missionIndex];
    const correct = Number(choice) === mission.correct;
    const remaining = Math.max(0, room.endsAt - now);
    const speedBonus = Math.floor((remaining / QUESTION_TIME) * 1000);
    const points = correct ? 1000 + speedBonus : 0;
    if (correct) {
      player.score += points;
      player.correct += 1;
    }
    player.elapsed += now - (room.endsAt - QUESTION_TIME);
    const ranked = publicPlayers(room);
    const position = ranked.findIndex(p => p.id === player.id) + 1;
    socket.emit("answer-result", {
      correct, points, position,
      topFour: ranked.slice(0, 4).map(p => ({ name:p.name, score:p.score })),
      totalPlayers: ranked.length
    });
    emitState(room);
    if ([...room.players.values()].every(p => p.answered)) finishQuestion(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.data.role === "host" && room.hostId === socket.id) {
      clearTimeout(room.questionTimer);
      clearTimeout(room.podiumTimer);
      rooms.delete(code);
      return;
    }
    if (room.players.delete(socket.id)) {
      emitState(room);
      if (room.phase === "question" && room.players.size > 0 &&
          [...room.players.values()].every(p => p.answered)) finishQuestion(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Capital City a correr na porta ${PORT}`);
});
