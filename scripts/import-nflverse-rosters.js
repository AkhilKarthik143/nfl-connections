/* Downloads nflverse's season roster data and creates the game's compact player pool. */
const fs = require('fs');
const path = require('path');

const season = process.argv[2] || new Date().getFullYear();
const ZERO_LEGAL_FROM_SEASON = 2023;
const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;

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
const TEAM_NAMES = { ARI:'Arizona Cardinals', ATL:'Atlanta Falcons', BAL:'Baltimore Ravens', BUF:'Buffalo Bills', CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', CLE:'Cleveland Browns', DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers', HOU:'Houston Texans', IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars', KC:'Kansas City Chiefs', LAC:'Los Angeles Chargers', LV:'Las Vegas Raiders', LA:'Los Angeles Rams', MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints', NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers', SF:'San Francisco 49ers', SEA:'Seattle Seahawks', TB:'Tampa Bay Buccaneers', TEN:'Tennessee Titans', WAS:'Washington Commanders' };
const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  console.log(`Downloading nflverse roster data for ${season}…`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`nflverse returned HTTP ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const columns = parseLine(header);
  const records = rows.map(parseLine).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i] || ''])));
  const output = path.join(__dirname, '..', 'data', 'nflverse-players.json');
  const players = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
  const byName = new Map(players.map((player) => [key(player.name), player]));
  for (const row of records) {
    if (!row.full_name || !row.team) continue;
    const year = Number(row.entry_year) || Number(season), nameKey = key(row.full_name);
    const player = byName.get(nameKey) || { name: row.full_name, teams: [], college: [], position: row.position || '', number: [], firstSeason: String(year), lastSeason: String(year) };
    player.college = Array.isArray(player.college) ? player.college : String(player.college || '').split(';').filter(Boolean);
    const colleges = (row.college || '').split(';').map((college) => college.trim()).filter(Boolean);
    for (const college of colleges) if (!player.college.includes(college)) player.college.push(college);
    const team = TEAM_NAMES[row.team] || row.team; if (!player.teams.includes(team)) player.teams.push(team);
    const number = String(row.jersey_number || '').replace(/\.0$/, ''); if (number && !(number === '0' && Number(season) < ZERO_LEGAL_FROM_SEASON) && !player.number.includes(number)) player.number.push(number);
    player.firstSeason = String(Math.min(Number(player.firstSeason) || year, year)); player.lastSeason = String(Math.max(Number(player.lastSeason) || year, Number(season)));
    byName.set(nameKey, player);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify([...byName.values()]));
  console.log(`Merged ${records.length} roster rows into ${byName.size} NFL players at ${output}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
