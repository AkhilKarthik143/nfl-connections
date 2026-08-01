/* Replaces ambiguous roster team codes with historical franchise identities. */
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/apply-franchise-lineage.js <path-to-nfl_players_by_season.csv>');

const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

function franchise(code, season) {
  const year = Number(season);
  if (code === 'HOU') return year <= 1996 ? 'Houston Oilers' : 'Houston Texans';
  if (code === 'HST') return 'Houston Texans';
  if (code === 'OIL' || code === 'TEN') return 'Tennessee Titans';
  if (code === 'BAL' || code === 'BLT') return year <= 1983 ? 'Baltimore Colts' : 'Baltimore Ravens';
  if (code === 'IND') return 'Indianapolis Colts';
  if (code === 'STL') return year <= 1987 ? 'St. Louis Cardinals' : 'Los Angeles Rams';
  if (code === 'LA' || code === 'RAM' || code === 'SL') return 'Los Angeles Rams';
  if (code === 'SD' || code === 'LAC') return 'Los Angeles Chargers';
  if (code === 'OAK' || code === 'RAI' || code === 'LV') return 'Las Vegas Raiders';
  if (code === 'PHO' || code === 'ARI' || code === 'ARZ') return 'Arizona Cardinals';
  if (code === 'CLV' || code === 'CLE') return 'Cleveland Browns';
  if (code === 'WAS' || code === 'WSH') return 'Washington Commanders';
  const names = { ATL:'Atlanta Falcons', BUF:'Buffalo Bills', CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers', JAX:'Jacksonville Jaguars', KC:'Kansas City Chiefs', MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints', NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers', SF:'San Francisco 49ers', SEA:'Seattle Seahawks', TB:'Tampa Bay Buccaneers' };
  return names[code] || code;
}

const output = path.join(__dirname, '..', 'data', 'nflverse-players.json');
const players = JSON.parse(fs.readFileSync(output, 'utf8'));
const byName = new Map(players.map((player) => [key(player.name), player]));
const [header, ...rows] = fs.readFileSync(input, 'utf8').trim().split(/\r?\n/);
const columns = parseLine(header); const teamSets = new Map();
for (const line of rows) {
  const row = Object.fromEntries(parseLine(line).map((value, index) => [columns[index], value || '']));
  const playerKey = key(row.full_name); if (!byName.has(playerKey)) continue;
  if (!teamSets.has(playerKey)) teamSets.set(playerKey, new Set());
  teamSets.get(playerKey).add(franchise(row.team, row.season));
}
for (const [playerKey, teams] of teamSets) byName.get(playerKey).teams = [...teams];
fs.writeFileSync(output, JSON.stringify(players));
console.log(`Applied franchise identities to ${teamSets.size} players.`);
