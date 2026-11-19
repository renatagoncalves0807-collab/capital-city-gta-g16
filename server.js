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
  {
    place: "DOWNTOWN LOS SANTOS",
    title: "A entrada na cidade",
    question: "Quando os sócios realizam entradas de capital em dinheiro, qual é o principal efeito inicial?",
    answers: [
      "Aumenta o capital próprio e entra dinheiro na empresa",
      "Aumenta sempre o passivo",
      "Diminui o ativo e o capital próprio",
      "É registado como um gasto"
    ],
    correct: 0
  },
  {
    place: "CENTRO DA CIDADE",
    title: "Acordos de bastidores",
    question: "Qual é a diferença essencial entre suprimentos e prestações acessórias?",
    answers: [
      "São sempre entradas de capital social",
      "Os suprimentos são empréstimos dos sócios; as prestações acessórias são obrigações adicionais previstas nos termos legais/estatutários",
      "Os suprimentos são reservas e as prestações acessórias são dividendos",
      "Não existe qualquer diferença"
    ],
    correct: 1
  },
  {
    place: "VINEWOOD HILLS",
    title: "O valor escondido",
    question: "Para que servem, em geral, as reservas numa sociedade?",
    answers: [
      "Para substituir todas as dívidas",
      "Para distribuir obrigatoriamente todo o lucro",
      "Para reter resultados e reforçar o capital próprio, nos termos aplicáveis",
      "Para eliminar a necessidade de contabilidade"
    ],
    correct: 2
  },
  {
    place: "BLAINE COUNTY",
    title: "Risco no deserto",
    question: "Quando existe perda de capital social, o que deve a sociedade fazer?",
    answers: [
      "Ignorar a situação até ao exercício seguinte",
      "Analisar a situação e cumprir os deveres legais aplicáveis, incluindo a atuação dos órgãos sociais",
      "Distribuir mais dividendos",
      "Eliminar automaticamente todos os ativos"
    ],
    correct: 1
  },
  {
    place: "LOS SANTOS À NOITE",
    title: "A última auditoria",
    question: "Qual é o objetivo central dos procedimentos de auditoria?",
    answers: [
      "Garantir que a empresa nunca terá prejuízos",
      "Substituir a gestão da empresa",
      "Obter prova de auditoria suficiente e apropriada para fundamentar conclusões",
      "Preparar as decisões comerciais dos clientes"
    ],
    correct: 2
  }
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
    socket.emit("answer-result", { correct, points });
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
