import { useEffect, useMemo, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'

async function api(path, method = 'GET', token, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.detail || 'Request failed')
  }
  return data
}

function AuthForm({ onAuth }) {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'teacher' })
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const payload = isRegister ? form : { email: form.email, password: form.password }
      const data = await api(endpoint, 'POST', null, payload)
      onAuth(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <h2>{isRegister ? 'Register' : 'Login'}</h2>
      <form onSubmit={submit}>
        {isRegister && (
          <>
            <label>Full Name</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </>
        )}
        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <label>Password</label>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <button type="submit">{isRegister ? 'Create Account' : 'Login'}</button>
      </form>
      <button className="secondary" onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function TeacherPanel({ session }) {
  const [form, setForm] = useState({ class_name: '', room_number: '', periods_needed: 1, reason: '' })
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')
      const data = await api('/requests/my', 'GET', session.access_token)
      setItems(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    try {
      setError('')
      await api('/requests', 'POST', session.access_token, { ...form, periods_needed: Number(form.periods_needed) })
      setForm({ class_name: '', room_number: '', periods_needed: 1, reason: '' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const approvedCount = useMemo(() => items.filter((it) => it.status === 'approved').length, [items])

  return (
    <div className="layout">
      <div className="card">
        <h3>Raise Resource Ticket</h3>
        <form onSubmit={submit}>
          <label>Class Name (e.g. Section B)</label>
          <input value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} required />
          <label>Classroom / Room Number</label>
          <input value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} required />
          <label>How many periods needed?</label>
          <input type="number" min="1" max="12" value={form.periods_needed} onChange={(e) => setForm({ ...form, periods_needed: e.target.value })} required />
          <label>Why do you need to occupy this room?</label>
          <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
          <button type="submit">Submit Ticket</button>
        </form>
      </div>

      <div className="card">
        <h3>My Tickets</h3>
        <p>Approved tickets visible for your account: {approvedCount}</p>
        <button className="secondary" onClick={load}>Refresh</button>
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Room</th>
              <th>Periods</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.class_name}</td>
                <td>{item.room_number}</td>
                <td>{item.periods_needed}</td>
                <td>{item.status}</td>
                <td>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function AdminPanel({ session }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setError('')
      const data = await api('/admin/requests', 'GET', session.access_token)
      setItems(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updateStatus = async (id, status) => {
    try {
      setError('')
      await api(`/admin/requests/${id}`, 'PATCH', session.access_token, { status })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <h3>Admin Panel - Teacher Requests</h3>
      <button className="secondary" onClick={load}>Refresh</button>
      <table>
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Class</th>
            <th>Room</th>
            <th>Periods</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.teacher_name}</td>
              <td>{item.class_name}</td>
              <td>{item.room_number}</td>
              <td>{item.periods_needed}</td>
              <td>{item.reason}</td>
              <td>{item.status}</td>
              <td>
                <button onClick={() => updateStatus(item.id, 'approved')}>Approve</button>
                <button className="danger" onClick={() => updateStatus(item.id, 'rejected')}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem('session')
    return raw ? JSON.parse(raw) : null
  })

  const onAuth = (authData) => {
    localStorage.setItem('session', JSON.stringify(authData))
    setSession(authData)
  }

  const logout = () => {
    localStorage.removeItem('session')
    setSession(null)
  }

  return (
    <main>
      <header>
        <h1>Teacher Resource Allocation System</h1>
        {session && (
          <div>
            <span>{session.full_name} ({session.role}) </span>
            <button onClick={logout}>Logout</button>
          </div>
        )}
      </header>
      {!session && <AuthForm onAuth={onAuth} />}
      {session?.role === 'teacher' && <TeacherPanel session={session} />}
      {session?.role === 'admin' && <AdminPanel session={session} />}
    </main>
  )
}
