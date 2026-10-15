import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.class.css';
import './theme.css';

import App from './App';
import { applyTheme, tg } from './telegram';

setupIonicReact({ mode: 'ios' });

tg?.ready();
tg?.expand();
tg?.disableVerticalSwipes?.();
applyTheme();
tg?.onEvent('themeChanged', applyTheme);

createRoot(document.getElementById('root')!).render(<App />);
