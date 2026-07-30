const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/players', (_req, res) => res.json(GAME_PLAYERS));

// Intentionally curated: this keeps the first playable version fair and deterministic.
const PLAYERS = [
  { name: 'Trevor Lawrence', teams: ['Jacksonville Jaguars'], college: 'Clemson', number: '16' },
  { name: 'Travis Etienne Jr.', teams: ['Jacksonville Jaguars'], college: 'Clemson', number: '1' },
  { name: 'Christian Kirk', teams: ['Arizona Cardinals', 'Jacksonville Jaguars'], college: 'Texas A&M', number: '13' },
  { name: 'Josh Allen', teams: ['Jacksonville Jaguars'], college: 'Kentucky', number: '41' },
  { name: 'Patrick Mahomes', teams: ['Kansas City Chiefs'], college: 'Texas Tech', number: '15' },
  { name: 'Travis Kelce', teams: ['Kansas City Chiefs'], college: 'Cincinnati', number: '87' },
  { name: 'Isiah Pacheco', teams: ['Kansas City Chiefs'], college: 'Rutgers', number: '10' },
  { name: 'Chris Jones', teams: ['Kansas City Chiefs'], college: 'Mississippi State', number: '95' },
  { name: 'Jalen Hurts', teams: ['Philadelphia Eagles'], college: 'Oklahoma', number: '1' },
  { name: 'DeVonta Smith', teams: ['Philadelphia Eagles'], college: 'Alabama', number: '6' },
  { name: 'A. J. Brown', teams: ['Tennessee Titans', 'Philadelphia Eagles'], college: 'Ole Miss', number: '11' },
  { name: 'Saquon Barkley', teams: ['New York Giants', 'Philadelphia Eagles'], college: 'Penn State', number: '26' },
  { name: 'CeeDee Lamb', teams: ['Dallas Cowboys'], college: 'Oklahoma', number: '88' },
  { name: 'Dak Prescott', teams: ['Dallas Cowboys'], college: 'Mississippi State', number: '4' },
  { name: 'Micah Parsons', teams: ['Dallas Cowboys'], college: 'Penn State', number: '11' },
  { name: 'George Kittle', teams: ['San Francisco 49ers'], college: 'Iowa', number: '85' },
  { name: 'Brock Purdy', teams: ['San Francisco 49ers'], college: 'Iowa State', number: '13' },
  { name: 'Christian McCaffrey', teams: ['Carolina Panthers', 'San Francisco 49ers'], college: 'Stanford', number: '23' },
  { name: 'Lamar Jackson', teams: ['Baltimore Ravens'], college: 'Louisville', number: '8' },
  { name: 'Derrick Henry', teams: ['Tennessee Titans', 'Baltimore Ravens'], college: 'Alabama', number: '22' },
  { name: 'Mark Andrews', teams: ['Baltimore Ravens'], college: 'Oklahoma', number: '89' },
  { name: 'Justin Jefferson', teams: ['Minnesota Vikings'], college: 'LSU', number: '18' },
  { name: 'Joe Burrow', teams: ['Cincinnati Bengals'], college: 'LSU', number: '9' },
  { name: "Ja'Marr Chase", teams: ['Cincinnati Bengals'], college: 'LSU', number: '1' },
  { name: 'Jordan Love', teams: ['Green Bay Packers'], college: 'Utah State', number: '10' },
  { name: 'Aaron Rodgers', teams: ['Green Bay Packers', 'New York Jets'], college: 'California', number: '8' }
];
const TEAM_COLORS = { 'Jacksonville Jaguars':'#00a6a6', 'Kansas City Chiefs':'#e31837', 'Philadelphia Eagles':'#004c54', 'Dallas Cowboys':'#89c5e3', 'San Francisco 49ers':'#aa0000', 'Baltimore Ravens':'#241773', 'Minnesota Vikings':'#4f2683', 'Cincinnati Bengals':'#fb4f14', 'Green Bay Packers':'#ffb612' };
let GAME_PLAYERS = PLAYERS;
try {
  const imported = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'data', 'nflverse-players.json'), 'utf8'));
  if (Array.isArray(imported) && imported.length) GAME_PLAYERS = imported;
} catch { /* The built-in starter pool keeps first run playable. */ }
const rooms = new Map();
const key = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const jerseyNumbers = (player) => Array.isArray(player.number) ? player.number : [player.number].filter(Boolean);
const code = () => { let value; do value = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(value)); return value; };
const publicState = (room) => ({ code: room.code, phase: room.phase, hostId: room.hostId, team: room.team, players: room.players.map(({id, name, strikes, out}) => ({ id, name, strikes, out })), turnId: room.turnId, chain: room.chain, message: room.message, winner: room.winner });
const broadcast = (room) => io.to(room.code).emit('state', publicState(room));
const playerFor = (name) => GAME_PLAYERS.find((p) => key(p.name) === key(name));

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
  if (player.strikes >= 3) { player.out = true; room.message = `${player.name} is out — three strikes.`; }
  else room.message = `${player.name}: strike ${player.strikes}/3. ${reason}`;
  nextTurn(room);
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    const room = { code: code(), phase: 'lobby', hostId: socket.id, players: [{ id: socket.id, name: cleanName(name), strikes: 0, out: false }], team: null, chain: [], used: new Set(), turnId: null, message: 'Share the room code, then start when everyone has joined.', winner: null };
    rooms.set(room.code, room); socket.join(room.code); socket.emit('joined', { code: room.code, id: socket.id }); broadcast(room);
  });
  socket.on('join-room', ({ code: roomCode, name }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room || room.phase !== 'lobby') return socket.emit('error-message', 'That room does not exist or the game has already started.');
    if (room.players.length >= 6) return socket.emit('error-message', 'This room is full (six players).');
    room.players.push({ id: socket.id, name: cleanName(name), strikes: 0, out: false }); socket.join(room.code); socket.emit('joined', { code: room.code, id: socket.id }); room.message = `${cleanName(name)} joined the huddle.`; broadcast(room);
  });
  socket.on('start-game', () => {
    const room = findRoom(socket.id); if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error-message', 'Invite at least one more player first.');
    const seed = GAME_PLAYERS[Math.floor(Math.random() * GAME_PLAYERS.length)]; const team = seed.teams[Math.floor(Math.random() * seed.teams.length)];
    room.team = { name: team, color: TEAM_COLORS[team] || '#d4af37' }; room.phase = 'playing'; room.chain = [{ name: seed.name, by: 'Kickoff', team, connector: null }]; room.used = new Set([key(seed.name)]); room.turnId = room.players[0].id; room.message = `${room.players[0].name}, connect a new NFL player to ${seed.name}.`; broadcast(room);
  });
  socket.on('submit-move', ({ name, type }) => {
    const room = findRoom(socket.id); if (!room || room.phase !== 'playing' || room.turnId !== socket.id) return;
    const mover = room.players.find((p) => p.id === socket.id); const candidate = playerFor(name); const anchorName = room.chain.at(-1).name; const anchor = playerFor(anchorName);
    if (!candidate) { strike(room, mover, 'That player is not in this game’s curated player pool.'); return broadcast(room); }
    if (room.used.has(key(candidate.name))) { strike(room, mover, `${candidate.name} is already in the chain.`); return broadcast(room); }
    let shared;
    if (type === 'TEAM') shared = candidate.teams.find((team) => anchor.teams.includes(team));
    if (type === 'COLLEGE' && candidate.college === anchor.college) shared = candidate.college;
    if (type === 'NUMBER') shared = jerseyNumbers(candidate).find((number) => jerseyNumbers(anchor).includes(number));
    if (!shared) { strike(room, mover, `No matching ${String(type || '').toLowerCase()} connection to ${anchor.name}.`); return broadcast(room); }
    const connector = type === 'TEAM' ? `Team: ${shared}` : type === 'COLLEGE' ? `College: ${shared}` : `#${shared}`;
    room.chain.push({ name: candidate.name, by: mover.name, team: candidate.teams.at(-1), connector }); room.used.add(key(candidate.name)); room.message = `Connection holds: ${connector}.`; nextTurn(room); if (room.phase === 'playing') room.message += ` ${room.players.find((p) => p.id === room.turnId).name}, you're up.`; broadcast(room);
  });
  socket.on('disconnect', () => { const room = findRoom(socket.id); if (!room) return; const participant = room.players.find((p) => p.id === socket.id); if (participant && room.phase === 'playing') { participant.out = true; room.message = `${participant.name} disconnected and is out.`; nextTurn(room); broadcast(room); } });
});
function cleanName(name) { return String(name || 'Player').trim().slice(0, 16) || 'Player'; }
function findRoom(socketId) { return [...rooms.values()].find((room) => room.players.some((p) => p.id === socketId)); }
server.listen(PORT, () => console.log(`NFL Connections running at http://localhost:${PORT}`));
