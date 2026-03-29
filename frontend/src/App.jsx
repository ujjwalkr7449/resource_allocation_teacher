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

  let data = null
  try {
    data = await response.json()
  } catch (_) {
    data = null
  }

  if (!response.ok) {
    throw new Error(data?.detail || 'Request failed')
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
  const [form, setForm] = useState({
    class_name: '',
    room_number: '',
    periods_needed: 1,
    request_date: '',
    start_time: '',
    end_time: '',
    reason: '',
  })
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
      if (form.end_time <= form.start_time) {
        throw new Error('End time must be later than start time')
      }
      await api('/requests', 'POST', session.access_token, { ...form, periods_needed: Number(form.periods_needed) })
      setForm({
        class_name: '',
        room_number: '',
        periods_needed: 1,
        request_date: '',
        start_time: '',
        end_time: '',
        reason: '',
      })
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
          <label>Request Date</label>
          <input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} required />
          <label>Start Time</label>
          <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
          <label>End Time</label>
          <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
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
              <th>Date</th>
              <th>Time Slot</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="7">No requests yet.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.class_name}</td>
                  <td>{item.room_number}</td>
                  <td>{item.periods_needed}</td>
                  <td>{item.request_date}</td>
                  <td>{item.start_time} - {item.end_time}</td>
                  <td><span className={`status ${item.status}`}>{item.status}</span></td>
                  <td>{item.reason}</td>
                </tr>
              ))
            )}
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
            <th>Date</th>
            <th>Time Slot</th>
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
              <td>{item.request_date}</td>
              <td>{item.start_time} - {item.end_time}</td>
              <td>{item.reason}</td>
              <td><span className={`status ${item.status}`}>{item.status}</span></td>
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

function ResourceSchedule({ session }) {
  const [form, setForm] = useState({ request_date: '', room_number: '' })
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const search = async (event) => {
    event.preventDefault()
    try {
      setError('')
      const params = new URLSearchParams({ request_date: form.request_date })
      if (form.room_number.trim()) params.set('room_number', form.room_number.trim())
      const data = await api(`/resources/schedule?${params.toString()}`, 'GET', session.access_token)
      setItems(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <h3>Resource Schedule Search</h3>
      <p className="muted">Search by date and optional room to verify whether the resource is currently assignable.</p>
      <form onSubmit={search}>
        <label>Date</label>
        <input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} required />
        <label>Room Number (optional)</label>
        <input value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} placeholder="Search a specific room" />
        <button type="submit">Check Availability</button>
      </form>
      {items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Date</th>
              <th>Availability</th>
              <th>Bookings</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.room_number}-${item.request_date}`}>
                <td>{item.room_number}</td>
                <td>{item.request_date}</td>
                <td>
                  <span className={`status ${item.is_available ? 'approved' : 'rejected'}`}>
                    {item.is_available ? 'Available' : 'Assigned'}
                  </span>
                </td>
                <td>
                  {item.bookings.length === 0 ? (
                    'No bookings'
                  ) : (
                    <ul>
                      {item.bookings.map((booking, index) => (
                        <li key={`${booking.teacher_name}-${index}`}>
                          {booking.start_time} - {booking.end_time} ({booking.status}, {booking.teacher_name})
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items.length === 0 && <p className="muted">No schedule loaded. Run a search to view availability.</p>}
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
          <div className="user-meta">
            <span>{session.full_name} ({session.role}) </span>
            <button onClick={logout}>Logout</button>
          </div>
        )}
      </header>
      {!session && <AuthForm onAuth={onAuth} />}
      {session?.role === 'teacher' && (
        <>
          <ResourceSchedule session={session} />
          <TeacherPanel session={session} />
        </>
      )}
      {session?.role === 'admin' && (
        <>
          <ResourceSchedule session={session} />
          <AdminPanel session={session} />
        </>
      )}
    </main>
  )
}
