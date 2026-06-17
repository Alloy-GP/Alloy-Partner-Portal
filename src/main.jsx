import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Register the <image-slot> custom element (side-effect import).
import './lib/image-slot.js';

// CSS load order matters — later files intentionally override earlier ones.
import './styles/01-base.css';
import './styles/02-components.css';
import './styles/03-features.css';
import './styles/04-rise-hero.css';
import './styles/05-desktop.css';
import './styles/06-alloy-hero.css';
import './styles/07-leads.css';
import './styles/08-tour.css';
import './styles/09-account.css';
import './styles/10-projects.css';
import './styles/11-roadmap.css';
import './styles/12-quarter-card.css';

import AuthGate from './AuthGate.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  </React.StrictMode>
);
