// Площадки-источники — тот же список, что в приложении (app/Sources.tsx: SOURCES). Там он живёт
// внутри React-компонента, поэтому здесь копия трёх строк. Новый источник в приложении — строка и здесь.
export const SOURCES = [
  {id: 'encar', name: 'Encar', country: 'src.korea', url: 'https://www.encar.com', logo: '/shared/sources/encar.png'},
  {id: 'che168', name: 'che168', country: 'src.china', url: 'https://www.che168.com', logo: '/shared/sources/che168.png'},
  {id: 'carsensor', name: 'Carsensor', country: 'src.japan', url: 'https://www.carsensor.net/usedcar/', logo: '/shared/sources/carsensor.png'},
] as const;
