Настоящие ответы ядра `cores/carsensor` (`data` контракта), сняты 12.10.2026:

- `AU7375484964` — Toyota Harrier 2.5 Hybrid Z Leather Package, Токио, оценка 4;
- `AU6777335034` — BMW 320d xDrive, Фукуока, оценка 4.5.

Переснять: `node cores/carsensor/bin/fetch.mjs <номер> --no-photos --out /tmp/cs` и взять `data` из
`car.json`. Цены и фото дилеры меняют — тесты сверяют с образцом, а не с числами.
