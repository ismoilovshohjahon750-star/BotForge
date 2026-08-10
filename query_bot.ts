import Database from 'better-sqlite3';
const db = new Database('ukaaaa.db');
const rows = db.prepare("SELECT * FROM bots LIMIT 5").all();
console.log(rows);
