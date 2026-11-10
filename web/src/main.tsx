import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProvedorSessao } from './sessao'
import { ProvedorToast } from './componentes/ui'
import './estilos/base.css'
import './estilos/legado.css'

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorToast>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </ProvedorToast>
  </StrictMode>,
)
