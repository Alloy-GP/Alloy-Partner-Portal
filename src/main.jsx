import React from 'react';
import ReactDOM from 'react-dom/client';

// Register the <image-slot> custom element (side-effect import).
import './lib/image-slot.js';

// CSS load order matters — later files intentionally override earlier ones.
import './styles/01-base.css';
import './styles/02-components.css';
import './styles/03-features.css';
import './styles/04-rise-hero.css';
import './styles/05-desktop.css';
import './styles/06-alloy-hero.css';

import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
