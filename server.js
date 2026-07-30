const path = require('path');
const http = require('http');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

const FALLBACK_PLAYERS = [
  { name: 'Patrick Mahomes', teams: ['Kansas City Chiefs'], number: '15' },
  { name: 'Travis Kelce', teams: ['Kansas City Chiefs'], number: '87' },
  { name: 'Jalen Hurts', teams: ['Philadelphia Eagles'], number: '1' },
  { name: 'CeeDee Lamb', teams: ['Dallas Cowboys'], number: '88' }
];
let GAME_PLAYERS = FALLBACK_PLAYERS;
try {
  const imported = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'nflverse-players.json'), 'utf8'));
  if (Array.isArray(imported) && imported.length) GAME_PLAYERS = imported;
} catch { /* Starter data keeps a first run playable. */ }
app.get('/api/players', (_req, res) => res.json(GAME_PLAYERS));

const TEAM_COLORS = { 'Kansas City Chiefs':'#e31837', 'Philadelphia Eagles':'#004c54', 'Dallas Cowboys':'#89c5e3', 'San Francisco 49ers':'#aa0000', 'Baltimore Ravens':'#241773', 'Green Bay Packers':'#ffb612' };
const rooms = new Map();
const key = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const jerseyNumbers = (player) => Array.isArray(player.number) ? player.number.map(String) : [player.number].filter(Boolean).map(String);
const roomCode = () => { let value; do value = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(value)); return value; };
const playerFor = (name) => GAME_PLAYERS.find((p) => key(p.name) === key(name));
const cleanName = (name) => String(name || 'Player').trim().slice(0, 16) || 'Player';
const findRoom = (socketId) => [...rooms.values()].find((room) => room.players.some((p) => p.id === socketId));
const publicState = (room) => ({ code: room.code, phase: room.phase, hostId: room.hostId, team: room.team, roundNumber: room.roundNumber, step: room.step, players: room.players.map(({ id, name, strikes, out }) => ({ id, name, strikes, out })), turnId: room.turnId, chain: room.chain, message: room.message, winner: room.winner });
const broadcast = (room) => io.to(room.code).emit('state', publicState(room));

function nextTurn(room) {
  const alive = room.players.filter((p) => !p.out);
  if (alive.length <= 1) { room.phase = 'finished'; room.winner = alive[0]?.name || null; return; }
  const current = room.players.findIndex((p) => p.id === room.turnId);
  for (let step = 1; step <= room.players.length; step++) {
    const candidate = room.players[(current + step) % room.players.length];
    if (!candidate.out) { room.turnId = candidate.id; return; }
  }
}
function strike(room, player, reason) {
  player.strikes += 1;
  room.message = player.strikes >= 3 ? `${player.name} is out — three strikes.` : `${player.name}: strike ${player.strikes}/3. ${reason}`;
  if (player.strikes >= 3) player.out = true;
  nextTurn(room);
}
function randomTeam() {
  const player = GAME_PLAYERS[Math.floor(Math.random() * GAME_PLAYERS.length)];
  return player.teams[Math.floor(Math.random() * player.teams.length)];
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    const room = { code: roomCode(), phase: 'lobby', hostId: socket.id, players: [{ id: socket.id, name: cleanName(name), strikes: 0, out: false }], team: null, roundNumber: null, step: 'number', chain: [], used: new Set(), turnId: null, message: 'Share the room code, then start when everyone has joined.', winner: null };
    rooms.set(room.code, room); socket.join(room.code); socket.emit('joined', { id: socket.id }); broadcast(room);
  });
  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room || room.phase !== 'lobby') return socket.emit('error-message', 'That room does not exist or the game has already started.');
    if (room.players.length >= 6) return socket.emit('error-message', 'This room is full (six players).');
    const player = { id: socket.id, name: cleanName(name), strikes: 0, out: false };
    room.players.push(player); socket.join(room.code); socket.emit('joined', { id: socket.id }); room.message = `${player.name} joined the huddle.`; broadcast(room);
  });
  socket.on('start-game', () => {
    const room = findRoom(socket.id); if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error-message', 'Invite at least one more player first.');
    const team = randomTeam();
    room.team = { name: team, color: TEAM_COLORS[team] || '#d4af37' }; room.phase = 'playing'; room.roundNumber = null; room.step = 'number'; room.chain = []; room.used = new Set(); room.turnId = room.players[0].id; room.message = `AI picked the ${team}. ${room.players[0].name}, name a jersey number for that team.`; broadcast(room);
  });
  socket.on('submit-number', ({ number }) => {
    const room = findRoom(socket.id); if (!room || room.phase !== 'playing' || room.turnId !== socket.id || room.step !== 'number') return;
    const mover = room.players.find((p) => p.id === socket.id); const chosen = String(number || '').trim();
    const valid = GAME_PLAYERS.some((p) => p.teams.includes(room.team.name) && jerseyNumbers(p).includes(chosen));
    if (!valid) { strike(room, mover, `No ${room.team.name} player in the data wears #${chosen}.`); return broadcast(room); }
    room.roundNumber = chosen; room.step = 'player'; nextTurn(room);
    if (room.phase === 'playing') room.message = `#${chosen} for the ${room.team.name}. ${room.players.find((p) => p.id === room.turnId).name}, name the player.`;
    broadcast(room);
  });
  socket.on('submit-player', ({ name }) => {
    const room = findRoom(socket.id); if (!room || room.phase !== 'playing' || room.turnId !== socket.id || room.step !== 'player') return;
    const mover = room.players.find((p) => p.id === socket.id); const candidate = playerFor(name);
    if (!candidate || !candidate.teams.includes(room.team.name) || !jerseyNumbers(candidate).includes(String(room.roundNumber))) { strike(room, mover, `${name || 'That player'} does not match ${room.team.name} #${room.roundNumber}.`); return broadcast(room); }
    if (room.used.has(key(candidate.name))) { strike(room, mover, `${candidate.name} is already in the chain.`); return broadcast(room); }
    room.chain.push({ name: candidate.name, by: mover.name, team: room.team.name, connector: `#${room.roundNumber}` }); room.used.add(key(candidate.name)); room.roundNumber = null; room.step = 'number'; nextTurn(room);
    if (room.phase === 'playing') room.message = `Correct: ${candidate.name}. ${room.players.find((p) => p.id === room.turnId).name}, pick another ${room.team.name} jersey number.`;
    broadcast(room);
  });
  socket.on('disconnect', () => {
    const room = findRoom(socket.id); if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player && room.phase === 'playing') { player.out = true; room.message = `${player.name} disconnected and is out.`; nextTurn(room); broadcast(room); }
  });
});
server.listen(PORT, () => console.log(`NFL Connections running at http://localhost:${PORT}`));
