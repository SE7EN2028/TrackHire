const express = require('express')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const path = require('path')

const app = express()
const db = new Database(path.join(__dirname, 'trackhire.db'))
const JWT_SECRET = process.env.JWT_SECRET || 'trackhire-dev-secret'

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'Applied',
    date_applied TEXT,
    follow_up_date TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const result = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hash)
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, email })
  } catch {
    res.status(400).json({ error: 'Email already exists' })
  }
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, email: user.email })
})

app.get('/api/jobs', auth, (req, res) => {
  const jobs = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  res.json(jobs)
})

app.post('/api/jobs', auth, (req, res) => {
  const { company, title, status, date_applied, follow_up_date, notes } = req.body
  const result = db.prepare(
    'INSERT INTO jobs (user_id, company, title, status, date_applied, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, company, title, status || 'Applied', date_applied || null, follow_up_date || null, notes || '')
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid)
  res.json(job)
})

app.put('/api/jobs/:id', auth, (req, res) => {
  const { company, title, status, date_applied, follow_up_date, notes } = req.body
  db.prepare(
    'UPDATE jobs SET company=?, title=?, status=?, date_applied=?, follow_up_date=?, notes=? WHERE id=? AND user_id=?'
  ).run(company, title, status, date_applied || null, follow_up_date || null, notes, req.params.id, req.user.id)
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  res.json(job)
})

app.delete('/api/jobs/:id', auth, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

app.listen(3001, () => console.log('Server running on http://localhost:3001'))
