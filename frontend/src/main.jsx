import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Catch the browser's install offer as early as it comes.
import './lib/installApp';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
