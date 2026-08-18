import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext'
import { GoogleAuthStatusProvider } from './context/GoogleAuthStatusContext'
import App from './App'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '771272691038-s9h707grr3b4ojkgp48aa5vb9tej2sjh.apps.googleusercontent.com'

function Root() {
  // Ad blockers / privacy extensions often block the Google Identity Services
  // script outright. When that happens the login button silently does nothing
  // (the underlying client never initializes), so we surface it explicitly.
  const [googleAuthBlocked, setGoogleAuthBlocked] = useState(false)

  return (
    <GoogleAuthStatusProvider blocked={googleAuthBlocked}>
      <GoogleOAuthProvider clientId={googleClientId} onScriptLoadError={() => setGoogleAuthBlocked(true)}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GoogleOAuthProvider>
    </GoogleAuthStatusProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
