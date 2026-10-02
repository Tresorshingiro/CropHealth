import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGate from './auth/AuthGate.jsx'
import LoginPage from './auth/LoginPage.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <Dashboard />
          </AuthGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
