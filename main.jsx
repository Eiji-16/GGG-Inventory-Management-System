import React from 'react'
import ReactDOM from 'react-dom/client'
// Points to your actual landing page component folder structure
import LandingPage from './src/components/LandingPage/landingPage.jsx'
import './src/components/LandingPage/landingPage.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>,
)
