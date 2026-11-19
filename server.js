const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const QUESTION_TIME = 15000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const missions = [
  { place:"DOWNTOWN LOS SANTOS", title:"Entrada de capital", question:"Quando os sócios realizam entradas de capital em dinheiro, qual é o principal efeito?", answers:["Aumenta o capital próprio e entra dinheiro na empresa","Aumenta sempre o passivo","É registado como um gasto"], correct:0 },
  { place:"CENTRO DA CIDADE", title:"Suprimentos", question:"O que caracteriza, em regra, um suprimento?", answers:["Uma reserva obrigatória","Um empréstimo do sócio à sociedade","Uma distribuição de dividendos"], correct:1 },
  { place:"VINEWOOD HILLS", title:"Prestações acessórias", question:"As prestações acessórias correspondem a…", answers:["Obrigações adicionais dos sócios previstas nos termos legais","Juros pagos aos bancos","Lucros distribuídos aos trabalhadores"], correct:0 },
  { place:"BLAINE COUNTY", title:"Reservas", question:"Qual é a finalidade principal da reserva legal?", answers:["Financiar exclusivamente publicidade","Substituir o capital social","Reforçar a proteção do capital próprio, nos termos legais"], correct:2 },
  { place:"LOS SANTOS", title:"Participações próprias", question:"Quando uma sociedade adquire ações ou quotas próprias, estas…", answers:["São sempre um ativo financeiro comum","São uma dedução ao capital próprio","Aumentam automaticamente os resultados"], correct:1 },
  { place:"MIRROR PARK", title:"Perda de capital", question:"Perante uma perda grave de capital próprio, a sociedade deve…", answers:["Ignorar a situação","Distribuir dividendos adicionais","Analisar a situação e cumprir os deveres legais aplicáveis"], correct:2 },
  { place:"VESPUCCI BEACH", title:"Dividendos antecipados", question:"A distribuição de dividendos antecipados exige…", answers:["Apenas autorização verbal de um sócio","Que exista dinheiro na conta, independentemente dos resultados","O cumprimento dos requisitos legais e contabilísticos aplicáveis"], correct:2 }
];
const rooms = new Map();
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c;do{c=Array.from({length:5},()=>chars[crypto.randomInt(chars.length)]).join("");}while(rooms.has(c));return c;}
function playersOf(room){return [...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,correct:p.correct,elapsed:p.elapsed})).sort((a,b)=>b.score-a.score||b.correct-a.correct||a.elapsed-b.elapsed||a.name.localeCompare(b.name,"pt"));}
function emitState(room){
 const state={code:room.code,phase:room.phase,missionIndex:room.missionIndex,
 mission:room.phase==="question"?{place:missions[room.missionIndex].place,title:missions[room.missionIndex].title,question:missions[room.missionIndex].question,answers:missions[room.missionIndex].answers}:null,
 endsAt:room.endsAt,totalPlayers:room.players.size,players:playersOf(room)};
 io.to(room.code).emit("state",state);
}
function finish(room){if(room.phase!=="question")return;clearTimeout(room.timer);room.phase="podium";room.endsAt=0;emitState(room);}
function start(room,index){
 clearTimeout(room.timer);if(index>=missions.length){room.phase="final";room.missionIndex=missions.length-1;emitState(room);return;}
 room.phase="question";room.missionIndex=index;room.endsAt=Date.now()+QUESTION_TIME;
 for(const p of room.players.values())p.answered=false;
 emitState(room);room.timer=setTimeout(()=>finish(room),QUESTION_TIME);
}
io.on("connection",socket=>{
 socket.on("host:create",()=>{const code=makeCode(),room={code,hostId:socket.id,players:new Map(),phase:"lobby",missionIndex:-1,endsAt:0,timer:null};rooms.set(code,room);socket.join(code);socket.data.roomCode=code;socket.data.role="host";socket.emit("created",{code});emitState(room);});
 socket.on("player:join",({code,name}={})=>{code=String(code||"").trim().toUpperCase();name=String(name||"").trim().slice(0,18);const room=rooms.get(code);if(!room)return socket.emit("error-msg","Não encontrámos essa sala. Confirma o código.");if(!name)return socket.emit("error-msg","Escreve o teu nome para entrar.");if(room.phase!=="lobby")return socket.emit("error-msg","Esta sessão já começou. Pede ao apresentador um novo código.");room.players.set(socket.id,{id:socket.id,name,score:0,correct:0,elapsed:0,answered:false});socket.join(code);socket.data.roomCode=code;socket.data.role="player";socket.emit("joined",{code});emitState(room);});
 socket.on("host:start",()=>{const r=rooms.get(socket.data.roomCode);if(!r||r.hostId!==socket.id||r.phase!=="lobby")return;if(!r.players.size)return socket.emit("error-msg","É preciso pelo menos um jogador para começar.");start(r,0);});
 socket.on("host:next",()=>{const r=rooms.get(socket.data.roomCode);if(r&&r.hostId===socket.id&&r.phase==="podium")start(r,r.missionIndex+1);});
 socket.on("player:answer",({choice}={})=>{const r=rooms.get(socket.data.roomCode);if(!r||socket.data.role!=="player"||r.phase!=="question")return;const p=r.players.get(socket.id);if(!p||p.answered)return;p.answered=true;const now=Date.now(),m=missions[r.missionIndex],correct=now<=r.endsAt&&Number(choice)===m.correct,remaining=Math.max(0,r.endsAt-now),points=correct?1000+Math.floor(remaining/QUESTION_TIME*1000):0;if(correct){p.score+=points;p.correct++;}p.elapsed+=now-(r.endsAt-QUESTION_TIME);const ranked=playersOf(r),position=ranked.findIndex(x=>x.id===p.id)+1;socket.emit("answer-result",{correct,points,position,topFour:ranked.slice(0,4).map(x=>({name:x.name,score:x.score})),totalPlayers:ranked.length});emitState(r);if([...r.players.values()].every(x=>x.answered))finish(r);});
 socket.on("disconnect",()=>{const code=socket.data.roomCode,r=rooms.get(code);if(!r)return;if(socket.data.role==="host"&&r.hostId===socket.id){clearTimeout(r.timer);rooms.delete(code);return;}if(r.players.delete(socket.id)){emitState(r);if(r.phase==="question"&&r.players.size&&[...r.players.values()].every(x=>x.answered))finish(r);}});
});
server.listen(PORT,()=>console.log(`Capital City a correr na porta ${PORT}`));
