import { createRoot } from 'react-dom/client';
import App from './App';
import { strings } from './i18n/strings';
import './styles/base.css';
import './styles/game.css';
import './styles/themes.css';
import './styles/classroom.css';
import './styles/layout.css';

document.title = strings.title;
createRoot(document.getElementById('root')!).render(<App />);
