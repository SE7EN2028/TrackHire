import { useState, useEffect, useMemo } from 'react'

const API = 'http://localhost:3001/api'

const STATUSES = ['Applied', 'Phone Screen', 'Interview', 'Offer', 'Rejected']

const STATUS_STYLE = {
  'Applied':      { background: '#dbeafe', color: '#1d4ed8' },
  'Phone Screen': { background: '#ede9fe', color: '#7c3aed' },
  'Interview':    { background: '#fef3c7', color: '#d97706' },
  'Offer':        { background: '#d1fae5', color: '#065f46' },
  'Rejected':     { background: '#f3f4f6', color: '#6b7280' },
}

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('token')
  return fetch(API + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  }).then(r => r.json())
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token')
    const email = localStorage.getItem('email')
    return token ? { token, email } : null
  })

  function login(data) {
    localStorage.setItem('token', data.token)
    localStorage.setItem('email', data.email)
    setUser(data)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    setUser(null)
  }

  if (!user) return <AuthPage onAuth={login} />
  return <Dashboard user={user} onLogout={logout} />
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiFetch(`/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (data.error) { setError(data.error); setLoading(false); return }
      onAuth(data)
    } catch {
      setError('Could not connect to server')
      setLoading(false)
    }
  }

  const tab = (label, value) => (
    <button
      type="button"
      onClick={() => { setMode(value); setError('') }}
      style={{
        flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
        cursor: 'pointer', fontSize: '14px',
        background: mode === value ? '#111' : '#f3f4f6',
        color: mode === value ? '#fff' : '#374151',
        fontWeight: mode === value ? 600 : 400,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', width: '360px', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>TrackHire</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>Keep your job search organized</p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          {tab('Log in', 'login')}
          {tab('Sign up', 'signup')}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={inputStyle}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            style={inputStyle}
          />
          {error && <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Loading...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([])
  const [view, setView] = useState('table')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [sortBy, setSortBy] = useState('date')
  const [modal, setModal] = useState(null) // null | 'add' | job object
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    apiFetch('/jobs').then(data => Array.isArray(data) && setJobs(data))
  }, [])

  const filtered = useMemo(() => {
    let list = jobs
    if (filterStatus !== 'All') list = list.filter(j => j.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(j => j.company.toLowerCase().includes(q) || j.title.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'company') return a.company.localeCompare(b.company)
      if (sortBy === 'status') return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
      return new Date(b.date_applied || b.created_at) - new Date(a.date_applied || a.created_at)
    })
  }, [jobs, filterStatus, search, sortBy])

  const stats = useMemo(() => {
    const active = jobs.filter(j => !['Offer', 'Rejected'].includes(j.status)).length
    const interviews = jobs.filter(j => j.status === 'Interview').length
    const responded = jobs.filter(j => j.status !== 'Applied').length
    const rate = jobs.length ? Math.round((responded / jobs.length) * 100) : 0
    return { total: jobs.length, active, interviews, rate }
  }, [jobs])

  async function handleSave(form) {
    if (modal && modal !== 'add') {
      const updated = await apiFetch(`/jobs/${modal.id}`, { method: 'PUT', body: JSON.stringify(form) })
      setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))
    } else {
      const created = await apiFetch('/jobs', { method: 'POST', body: JSON.stringify(form) })
      setJobs(prev => [created, ...prev])
    }
    setModal(null)
  }

  async function handleDelete(id) {
    await apiFetch(`/jobs/${id}`, { method: 'DELETE' })
    setJobs(prev => prev.filter(j => j.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '17px' }}>TrackHire</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#9ca3af', fontSize: '13px' }}>{user.email}</span>
            <button onClick={onLogout} style={btnSecondary}>Logout</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total applied', value: stats.total },
            { label: 'Active',        value: stats.active },
            { label: 'Interviews',    value: stats.interviews },
            { label: 'Response rate', value: `${stats.rate}%` },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 20px' }}>
              <div style={{ fontSize: '26px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Search company or role..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: '1', minWidth: '160px' }}
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="All">All statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
            <option value="date">Sort by date</option>
            <option value="company">Sort by company</option>
            <option value="status">Sort by status</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
            {[['table', 'Table'], ['cards', 'Cards']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: '13px',
                background: view === v ? '#111' : '#fff', color: view === v ? '#fff' : '#374151',
              }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setModal('add')} style={{ ...btnPrimary, padding: '7px 16px' }}>
            + Add job
          </button>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af' }}>
            {jobs.length === 0
              ? 'No applications yet — add your first one!'
              : 'No results match your filters.'}
          </div>
        )}

        {/* Table view */}
        {filtered.length > 0 && view === 'table' && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  {['Company', 'Role', 'Status', 'Applied', 'Follow-up', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => {
                  const overdue = job.follow_up_date && job.follow_up_date < today && !['Offer', 'Rejected'].includes(job.status)
                  const expanded = expandedId === job.id
                  return (
                    <TableRow
                      key={job.id}
                      job={job}
                      overdue={overdue}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : job.id)}
                      onEdit={() => setModal(job)}
                      onDelete={() => handleDelete(job.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Card view */}
        {filtered.length > 0 && view === 'cards' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {filtered.map(job => {
              const overdue = job.follow_up_date && job.follow_up_date < today && !['Offer', 'Rejected'].includes(job.status)
              return (
                <JobCard key={job.id} job={job} overdue={overdue} onEdit={() => setModal(job)} onDelete={() => handleDelete(job.id)} />
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <JobModal
          job={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ─── Table row (with expandable notes) ───────────────────────────────────────

function TableRow({ job, overdue, expanded, onToggle, onEdit, onDelete }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: expanded ? 'none' : '1px solid #f3f4f6', cursor: 'pointer', background: expanded ? '#fafafa' : '#fff' }}
        onMouseEnter={e => !expanded && (e.currentTarget.style.background = '#fafafa')}
        onMouseLeave={e => !expanded && (e.currentTarget.style.background = '#fff')}
      >
        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{job.company}</td>
        <td style={{ padding: '12px 16px', color: '#4b5563' }}>{job.title}</td>
        <td style={{ padding: '12px 16px' }}>
          <StatusBadge status={job.status} />
        </td>
        <td style={{ padding: '12px 16px', color: '#6b7280' }}>{job.date_applied || '—'}</td>
        <td style={{ padding: '12px 16px', color: overdue ? '#dc2626' : '#6b7280', fontWeight: overdue ? 600 : 400 }}>
          {job.follow_up_date ? `${overdue ? '⚠ ' : ''}${job.follow_up_date}` : '—'}
        </td>
        <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={onEdit} style={btnSecondary}>Edit</button>
            <button onClick={onDelete} style={btnDanger}>Delete</button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
          <td colSpan={6} style={{ padding: '4px 16px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Notes</div>
            <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {job.notes || 'No notes yet. Click Edit to add some.'}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function JobCard({ job, overdue, onEdit, onDelete }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>{job.company}</div>
          <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>{job.title}</div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {job.date_applied && <span>Applied {job.date_applied}</span>}
        {job.follow_up_date && (
          <span style={{ color: overdue ? '#dc2626' : '#6b7280', fontWeight: overdue ? 600 : 400 }}>
            {overdue ? '⚠ ' : ''}Follow-up {job.follow_up_date}
          </span>
        )}
      </div>
      {job.notes && (
        <div style={{ fontSize: '12px', color: '#4b5563', borderTop: '1px solid #f3f4f6', paddingTop: '10px', whiteSpace: 'pre-wrap', maxHeight: '72px', overflow: 'hidden', lineHeight: 1.5 }}>
          {job.notes}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
        <button onClick={onEdit} style={{ ...btnSecondary, flex: 1 }}>Edit</button>
        <button onClick={onDelete} style={btnDanger}>Delete</button>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function JobModal({ job, onSave, onClose }) {
  const [form, setForm] = useState({
    company:        job?.company        || '',
    title:          job?.title          || '',
    status:         job?.status         || 'Applied',
    date_applied:   job?.date_applied   || new Date().toISOString().split('T')[0],
    follow_up_date: job?.follow_up_date || '',
    notes:          job?.notes          || '',
  })

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.company.trim() || !form.title.trim()) return
    onSave(form)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '460px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.12)' }}
      >
        <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '20px' }}>
          {job ? 'Edit application' : 'Add application'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Company *">
              <input value={form.company} onChange={e => set('company', e.target.value)} required placeholder="Google" style={inputStyle} />
            </Field>
            <Field label="Job title *">
              <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Software Engineer" style={inputStyle} />
            </Field>
          </div>

          <Field label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} style={selectStyle}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Date applied">
              <input type="date" value={form.date_applied} onChange={e => set('date_applied', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Follow-up date">
              <input type="date" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)} style={inputStyle} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={4}
              placeholder="Recruiter emails, interview notes, anything..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>{job ? 'Save changes' : 'Add job'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Small components ────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      whiteSpace: 'nowrap', ...STATUS_STYLE[status],
    }}>
      {status}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
      {label}
      {children}
    </label>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '6px',
  fontSize: '14px', outline: 'none', width: '100%',
}

const selectStyle = {
  padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '6px',
  fontSize: '14px', outline: 'none', background: '#fff', cursor: 'pointer',
}

const btnPrimary = {
  padding: '8px 16px', background: '#111', color: '#fff', border: 'none',
  borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
}

const btnSecondary = {
  padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: '6px',
  background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#374151',
}

const btnDanger = {
  padding: '6px 10px', border: '1px solid #fecaca', borderRadius: '6px',
  background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#dc2626',
}
