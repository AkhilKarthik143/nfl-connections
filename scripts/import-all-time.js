/* Converts an nflverse-style all-time player CSV into the compact game lookup. */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-all-time.js <path-to-nfl_players_all_time.csv>');

const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LA: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers',
  SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders'
};

function parseLine(line) {
  const values = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(current); current = ''; }
    else current += char;
  }
  values.push(current); return values;
}

const [header, ...rows] = fs.readFileSync(input, 'utf8').trim().split(/\r?\n/);
const columns = parseLine(header);
const seen = new Set();
const players = rows.map(parseLine).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i] || '']))).map((row) => ({
  name: row.full_name,
  teams: (row.teams || '').split('/').map((team) => TEAM_NAMES[team] || team).filter(Boolean),
  college: row.college || '',
  number: (row.jersey_numbers || '').split('/').filter(Boolean),
  firstSeason: row.first_season || '',
  lastSeason: row.last_season || ''
})).filter((player) => player.name && player.teams.length && !seen.has(player.name.toLowerCase()) && seen.add(player.name.toLowerCase()));

const output = path.join(__dirname, '..', 'data', 'nflverse-players.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(players));
console.log(`Wrote ${players.length} all-time NFL players to ${output}`);
