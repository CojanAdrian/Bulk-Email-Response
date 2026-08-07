import { useEffect, useState } from 'react';
import { me, logout } from './api/auth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainToolPage from './pages/MainToolPage';

function App() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'loggedOut' | 'loggedIn'
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState(null);

  useEffect(() => {
    me()
      .then((data) => {
        setUsername(data.username);
        setStatus('loggedIn');
      })
      .catch((err) => {
        if (err.status !== 401) {
          console.error('Session check failed:', err);
        }
        setStatus('loggedOut');
      });
  }, []);

  function handleAuthSuccess(data) {
    setUsername(data.username);
    setStatus('loggedIn');
  }

  function handleLogout() {
    logout()
      .catch((err) => {
        console.error('Logout request failed:', err);
      })
      .finally(() => {
        setUsername(null);
        setAuthView('login');
        setStatus('loggedOut');
      });
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  if (status === 'loggedOut') {
    if (authView === 'register') {
      return <RegisterPage onRegisterSuccess={handleAuthSuccess} onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onLoginSuccess={handleAuthSuccess} onSwitchToRegister={() => setAuthView('register')} />;
  }

  return <MainToolPage username={username} onLogout={handleLogout} />;
}

export default App;
