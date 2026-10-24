import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/main.css'
import { SessionProvider } from './context/SessionContext'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>
)
