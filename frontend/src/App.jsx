import { useEffect, useState } from 'react';
import { me, logout } from './api/auth';
import LoginPage from './pages/LoginPage';
import MainToolPage from './pages/MainToolPage';

function App() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'loggedOut' | 'loggedIn'
  const [username, setUsername] = useState(null);

  useEffect(() => {
    me()
      .then((data) => {
        setUsername(data.username);
        setStatus('loggedIn');
      })
      .catch(() => {
        setStatus('loggedOut');
      });
  }, []);

  function handleLoginSuccess(data) {
    setUsername(data.username);
    setStatus('loggedIn');
  }

  function handleLogout() {
    logout().finally(() => {
      setUsername(null);
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
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <MainToolPage username={username} onLogout={handleLogout} />;
}

export default App;
