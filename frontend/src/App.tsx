import { Routes, Route } from 'react-router-dom'
import TelegramAuth from './components/auth/TelegramAuth'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/auth/telegram" element={<TelegramAuth />} />
      <Route path="/*" element={<Dashboard />} />
    </Routes>
  )
}

export default App
