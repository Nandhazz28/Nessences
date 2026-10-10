import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode><ErrorBoundary><BrowserRouter><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></BrowserRouter></ErrorBoundary></StrictMode>,
);
