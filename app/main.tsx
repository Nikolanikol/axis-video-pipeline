// Точка входа интерфейса: монтирует оболочку в страницу.
import React from 'react';
import {createRoot} from 'react-dom/client';
// Шрифт платформы KOK. Только интерфейс: ролики клиентов собираются своими шрифтами
// (src/shared/ui.tsx), и Manrope туда не попадает. Начертания — те, что есть в styles.css
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/cyrillic-500.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/cyrillic-700.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/cyrillic-800.css';
import '@fontsource/manrope/latin-800.css';
import {Shell} from './Shell';
import './styles.css';

createRoot(document.getElementById('root')!).render(<Shell />);
