import { createRoot } from 'react-dom/client';
import App from './App';
import { strings } from './strings';
import './style.css';
import './layout.css';

document.title = strings.title;
createRoot(document.getElementById('root')!).render(<App />);
