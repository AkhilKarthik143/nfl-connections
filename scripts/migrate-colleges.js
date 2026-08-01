const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'nflverse-players.json');
const additionalColleges = {
  'Caleb Williams': ['Oklahoma']
};

const players = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const player of players) {
  const colleges = (Array.isArray(player.college) ? player.college : String(player.college || '').split(';'))
    .map((college) => college.trim())
    .filter(Boolean);
  for (const college of additionalColleges[player.name] || []) if (!colleges.includes(college)) colleges.push(college);
  player.college = colleges;
}
fs.writeFileSync(file, JSON.stringify(players));
console.log(`Migrated ${players.length} players to multi-college data.`);
