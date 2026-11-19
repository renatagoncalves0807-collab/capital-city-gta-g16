const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

const missions = [
 {title:'A entrada na cidade', place:'DOWNTOWN LOS SANTOS', question:'Qual é uma forma de entrada de capital numa sociedade?', answers:['Entrada em dinheiro ou bens pelos sócios','Empréstimo bancário obtido pela empresa','Pagamento de uma fatura a fornecedor','Recebimento de um cliente'], correct:0},
 {title:'O negócio da garagem', place:'VESPUCCI CANALS', question:'Qual é a principal diferença entre suprimentos e prestações acessórias?', answers:['Os suprimentos são sempre capital social','Os suprimentos são empréstimos dos sócios à sociedade','As prestações acessórias são salários','Não existe qualquer diferença'], correct:1},
 {title:'O cofre da empresa', place:'VINEWOOD HILLS', question:'Para que serve, em regra, a reserva legal?', answers:['Distribuir lucros todos os meses','Financiar despesas pessoais dos sócios','Reforçar a proteção do capital próprio','Substituir o capital social'], correct:2},
 {title:'Alerta financeiro', place:'SANDY SHORES', question:'Quando existe perda de metade do capital social, o que devem os órgãos sociais fazer?', answers:['Ignorar a situação','Convocar os sócios para deliberar medidas adequadas','Distribuir dividendos antecipados','Encerrar automaticamente a empresa'], correct:1},
 {title:'A última missão: auditoria', place:'LOS SANTOS NIGHT', question:'Qual é o objetivo principal da circularização de saldos?', answers:['Confirmar informação junto de terceiros','Calcular o IVA mensal','Escolher o método de inventário','Determinar o preço de venda'], correct:0}
];
const rooms = new Map();
function code(){ return Math.random().toString(36).slice(2,7).toUpperCase(); }
function ranking(room){return Object.values(room.players).sort((a,b)=>b.score-a.score || b.correct-a.correct || a.time-b.time || a.name.localeCompare(b.name));}
function publicState(room){return {code:room.code,phase:room.phase,missionIndex:room.missionIndex,mission:room.phase==='question'?missions[room.missionIndex]:null,players:ranking(room).map(p=>({id:p.id,name:p.name,score:p.score,correct:p.correct,answered:p.answered})),endsAt:room.endsAt,answeredCount:Object.values(room.players).filter(p=>p.answered).length,totalPlayers:Object.keys(room.players).length};}
function broadcast(room){io.to(room.code).emit('state',publicState(room));}
function startQuestion(room){room.phase='question';room.endsAt=Date.now()+12000;Object.values(room.players).forEach(p=>{p.answered=false;p.lastResult=null;});broadcast(room);clearTimeout(room.timer);room.timer=setTimeout(()=>{if(room.phase==='question'){room.phase='podium';broadcast(room);}},12000);}
io.on('connection',socket=>{
 socket.on('host:create',()=>{let c=code();while(rooms.has(c))c=code();const room={code:c,host:socket.id,players:{},phase:'lobby',missionIndex:0,endsAt:null};rooms.set(c,room);socket.join(c);socket.emit('created',{code:c});broadcast(room);});
 socket.on('player:join',({code:c,name})=>{const room=rooms.get(String(c||'').toUpperCase());if(!room){socket.emit('error-msg','Código não encontrado.');return;}if(room.phase!=='lobby'){socket.emit('error-msg','A missão já começou. Pede ao apresentador para criar uma nova sala.');return;}const clean=String(name||'').trim().slice(0,18);if(!clean){socket.emit('error-msg','Escreve o teu nome.');return;}room.players[socket.id]={id:socket.id,name:clean,score:0,correct:0,time:0,answered:false};socket.join(room.code);socket.data.room=room.code;socket.emit('joined',{code:room.code});broadcast(room);});
 socket.on('host:start',()=>{const room=rooms.get(socket.data.room)||[...rooms.values()].find(r=>r.host===socket.id);if(!room||room.host!==socket.id)return;room.missionIndex=0;startQuestion(room);});
 socket.on('player:answer',({choice})=>{const room=rooms.get(socket.data.room);if(!room||room.phase!=='question')return;const p=room.players[socket.id];if(!p||p.answered)return;p.answered=true;const elapsed=Math.max(0,12000-(room.endsAt-Date.now()));const correct=Number(choice)===missions[room.missionIndex].correct;p.time+=elapsed;if(correct){p.correct++;p.score+=500+Math.round((12000-elapsed)/12000*500);}socket.emit('answer-result',{correct,points:correct?500+Math.round((12000-elapsed)/12000*500):0});broadcast(room);if(Object.values(room.players).length && Object.values(room.players).every(x=>x.answered)){clearTimeout(room.timer);room.phase='podium';broadcast(room);}});
 socket.on('host:next',()=>{const room=[...rooms.values()].find(r=>r.host===socket.id);if(!room||room.host!==socket.id)return;if(room.missionIndex>=missions.length-1){room.phase='final';broadcast(room);}else{room.missionIndex++;startQuestion(room);}});
 socket.on('disconnect',()=>{for(const room of rooms.values()){if(room.players[socket.id]){delete room.players[socket.id];broadcast(room);}if(room.host===socket.id){clearTimeout(room.timer);rooms.delete(room.code);}}});
});
server.listen(PORT,()=>console.log(`Capital City a correr na porta ${PORT}`));
