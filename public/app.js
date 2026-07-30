const socket = io(); let state = null, selfId = null, local = null;
const app = document.querySelector('#app');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const jerseys = (p) => (Array.isArray(p.number) ? p.number : [p.number]).filter(Boolean).map(String);

function landing(error = '') {
  local = null;
  app.innerHTML = `<section class="game hero"><div class="eyebrow">NFL NUMBER GAME</div><h1>NFL CONNECTIONS</h1><p>The AI chooses a team. One player names a jersey number; the next names the player. Three strikes and you're out.</p><div class="form"><button id="local">Pass &amp; play</button><button class="secondary" id="online">Play online</button><div class="error">${esc(error)}</div></div></section>`;
  document.querySelector('#local').onclick = localSetup; document.querySelector('#online').onclick = onlineLanding;
}
function onlineLanding(error = '') {
  app.innerHTML = `<section class="game hero"><div class="eyebrow">MULTIPLAYER NUMBER GAME</div><h1>PLAY ONLINE</h1><p>Create a room and share its code. Rooms support 2–6 players.</p><div class="form"><input id="name" maxlength="16" placeholder="Your name"><button id="create">Create room</button><input id="code" maxlength="4" placeholder="Room code"><button class="secondary" id="join">Join room</button><button class="secondary" id="back">Back</button><div class="error">${esc(error)}</div></div></section>`;
  document.querySelector('#create').onclick = () => socket.emit('create-room', { name: document.querySelector('#name').value });
  document.querySelector('#join').onclick = () => socket.emit('join-room', { name: document.querySelector('#name').value, code: document.querySelector('#code').value });
  document.querySelector('#back').onclick = landing;
}
function render() { if (local) return localRender(); if (!state) return onlineLanding(); if (state.phase === 'lobby') return lobby(); if (state.phase === 'finished') return finish(state.winner, state.chain.length); game(); }
function lobby() {
  const host = state.hostId === selfId;
  app.innerHTML = `<section class="game hero"><div class="eyebrow">YOUR ROOM CODE</div><div class="code">${state.code}</div><h2>THE HUDDLE (${state.players.length}/6)</h2><p>${state.players.map((p) => esc(p.name)).join(' · ')}</p><p>Have everyone open this site, enter the code, then join the room.</p>${host ? '<button id="start">Start game</button>' : '<p>Waiting for the host to start…</p>'}</section>`;
  document.querySelector('#start')?.addEventListener('click', () => socket.emit('start-game'));
}
function finish(winner, length) { app.innerHTML = `<section class="game end"><div class="eyebrow">FINAL WHISTLE</div><h1>${esc(winner || 'Nobody')} WINS</h1><p>${length} players were correctly named.</p><button id="again">Play again</button><button class="secondary" id="menu">Modes</button></section>`; document.querySelector('#again').onclick = local ? localSetup : onlineLanding; document.querySelector('#menu').onclick = landing; }
function playersMarkup(players, turnId) { return `<div class="players">${players.map((p, i) => { const active = (p.id || i) === turnId; return `<div class="player ${active ? 'active' : ''} ${p.out ? 'out' : ''}"><b>${esc(p.name)}</b><span class="flags">${'■'.repeat(p.strikes)}${'□'.repeat(3 - p.strikes)}</span><small>${p.out ? 'OUT' : active ? 'ON THE CLOCK' : 'waiting'}</small></div>`; }).join('')}</div>`; }
function cards(chain) { return chain.length ? `<div class="chain">${chain.map((c) => `<div class="card"><b>${esc(c.name)}</b><small>${esc(c.team)} · #${esc(c.connector.replace('#', ''))} · named by ${esc(c.by)}</small></div>`).join('')}</div>` : ''; }
function turnForm(step, team, number, emit) { const isNumber = step === 'number'; return `<div class="submit"><input id="move" inputmode="${isNumber ? 'numeric' : 'text'}" placeholder="${isNumber ? `Jersey number for ${esc(team)}` : `Player wearing #${esc(number)}`} "><button id="submit">${isNumber ? 'Lock number' : 'Name player'}</button></div>`; }
function game() {
  const me = state.players.find((p) => p.id === selfId), mine = state.turnId === selfId;
  app.innerHTML = `<section class="game"><header class="header"><div><div class="eyebrow">NUMBER GAME · ROOM ${state.code}</div><div class="title">CONNECTIONS</div></div><div class="chip" style="--team:${state.team.color}">${esc(state.team.name).toUpperCase()}</div></header>${playersMarkup(state.players, state.turnId)}<div class="status">${esc(state.message)}</div>${state.roundNumber ? `<div class="connector">CURRENT NUMBER: #${esc(state.roundNumber)}</div>` : ''}${cards(state.chain)}<footer class="foot">${mine ? turnForm(state.step, state.team.name, state.roundNumber) : `<div class="status">${me?.out ? 'You are out of this round.' : 'Wait for your turn.'}</div>`}</footer></section>`;
  if (mine) bindSubmit((value) => socket.emit(state.step === 'number' ? 'submit-number' : 'submit-player', state.step === 'number' ? { number: value } : { name: value }));
}
function bindSubmit(handler) { const submit = () => { const value = document.querySelector('#move').value.trim(); if (value) handler(value); }; document.querySelector('#submit').onclick = submit; document.querySelector('#move').onkeydown = (e) => e.key === 'Enter' && submit(); }

function localSetup() {
  app.innerHTML = `<section class="game hero"><div class="eyebrow">PASS &amp; PLAY</div><h1>SAME DEVICE</h1><p>Add 2–6 players, then hand the device to the next player after each answer.</p><div class="form" id="names"><input maxlength="16" placeholder="Player 1"><input maxlength="16" placeholder="Player 2"></div><div class="form"><button class="secondary" id="add">Add player</button><button id="kick">Kick off</button><button class="secondary" id="back">Back</button><div class="error" id="local-error"></div></div></section>`;
  document.querySelector('#add').onclick = () => { const inputs = document.querySelectorAll('#names input'); if (inputs.length < 6) { const input = document.createElement('input'); input.maxLength = 16; input.placeholder = `Player ${inputs.length + 1}`; document.querySelector('#names').append(input); } };
  document.querySelector('#back').onclick = landing;
  document.querySelector('#kick').onclick = async () => { try { const pool = await fetch('/api/players').then((r) => r.json()); if (!pool.length) throw Error(); const names = [...document.querySelectorAll('#names input')].map((i, n) => i.value.trim() || `Player ${n + 1}`); const seed = pool[Math.floor(Math.random() * pool.length)]; const team = seed.teams[Math.floor(Math.random() * seed.teams.length)]; local = { pool, names, strikes: names.map(() => 0), out: names.map(() => false), turn: 0, team, roundNumber: null, step: 'number', chain: [], used: new Set(), message: `AI picked the ${team}. ${names[0]}, name a jersey number for that team.`, phase: 'game' }; localRender(); } catch { document.querySelector('#local-error').textContent = 'Could not load the player pool. Try again.'; } };
}
function nextLocal() { const alive = local.out.map((out, i) => !out ? i : -1).filter((i) => i >= 0); if (alive.length <= 1) { local.phase = 'over'; return; } for (let step = 1; step <= local.names.length; step++) { const candidate = (local.turn + step) % local.names.length; if (!local.out[candidate]) { local.turn = candidate; return; } } }
function localStrike(reason) { const index = local.turn; local.strikes[index]++; if (local.strikes[index] >= 3) local.out[index] = true; const name = local.names[index], count = local.strikes[index]; nextLocal(); local.message = local.phase === 'over' || local.out[index] ? `${name} is out — three strikes.` : `${name}: strike ${count}/3. ${reason}`; localRender(); }
function localRender() {
  if (local.phase === 'over') return finish(local.names.find((_, i) => !local.out[i]), local.chain.length);
  const players = local.names.map((name, i) => ({ id: i, name, strikes: local.strikes[i], out: local.out[i] }));
  app.innerHTML = `<section class="game"><header class="header"><div><div class="eyebrow">PASS &amp; PLAY</div><div class="title">CONNECTIONS</div></div><div class="chip">${esc(local.team).toUpperCase()}</div></header>${playersMarkup(players, local.turn)}<div class="status">${esc(local.message)}</div>${local.roundNumber ? `<div class="connector">CURRENT NUMBER: #${esc(local.roundNumber)}</div>` : ''}${cards(local.chain)}<footer class="foot">${turnForm(local.step, local.team, local.roundNumber)}</footer></section>`;
  bindSubmit(localSubmit);
}
function localSubmit(value) {
  if (local.step === 'number') { const valid = local.pool.some((p) => p.teams.includes(local.team) && jerseys(p).includes(value)); if (!valid) return localStrike(`No ${local.team} player in the data wears #${value}.`); local.roundNumber = value; local.step = 'player'; nextLocal(); local.message = `#${value} for the ${local.team}. ${local.names[local.turn]}, name the player.`; return localRender(); }
  const candidate = local.pool.find((p) => norm(p.name) === norm(value));
  if (!candidate || !candidate.teams.includes(local.team) || !jerseys(candidate).includes(local.roundNumber) || local.used.has(norm(candidate?.name))) return localStrike(`${value || 'That player'} does not match ${local.team} #${local.roundNumber}.`);
  local.chain.push({ name: candidate.name, team: local.team, by: local.names[local.turn], connector: `#${local.roundNumber}` }); local.used.add(norm(candidate.name)); local.roundNumber = null; local.step = 'number'; nextLocal(); local.message = `Correct: ${candidate.name}. ${local.names[local.turn]}, pick another ${local.team} jersey number.`; localRender();
}
socket.on('joined', ({ id }) => { selfId = id; }); socket.on('state', (s) => { state = s; render(); }); socket.on('error-message', onlineLanding); landing();
