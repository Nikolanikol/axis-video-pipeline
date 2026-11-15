// Название сцены из config/formats.json на языке интерфейса. Отдельным компонентом, а не useT в
// Preview: плеер перерисовывается редко и намеренно, а смена языка должна поменять только подпись
import React from 'react';
import {useT} from './index';

export const SceneTitle: React.FC<{title: string}> = ({title}) => <>{useT().cfg(title)}</>;
