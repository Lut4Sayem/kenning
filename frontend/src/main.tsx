import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import './styles/tokens.css'
import './styles/base.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/app">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Back after logging out can restore a frozen app page from the back/forward cache; reload so the session check runs.
addEventListener('pageshow', (e) => { if (e.persisted) location.reload() })

// Dead-code-removed in production builds, so the panel never ships.
if (import.meta.env.DEV) void import('./dev/mount').then((m) => m.mountTokenPanel())
