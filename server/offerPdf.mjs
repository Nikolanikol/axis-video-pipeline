// Печатаем тем же Chromium, что и ролики. CLI --print-to-pdf зависает в боевом Linux-образе
// даже на одном абзаце; Page.printToPDF у того же браузера отрабатывает за доли секунды.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {openBrowser} from '@remotion/renderer';
import {serverLog} from './log.mjs';

const log = serverLog('offers');
const TIMEOUT_MS = 60_000;

export const printOfferPdf = async (htmlFile, pdfFile) => {
  let browser;
  let timer;
  let timedOut = false;
  const timeoutError = new Error('Печать КП не завершилась за 60 секунд');
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(timeoutError); }, TIMEOUT_MS);
  });

  const print = async () => {
    const opened = await openBrowser('chrome', {
      browserExecutable: process.env.CHROME_PATH || null,
      logLevel: 'error',
    });
    // Если открытие закончилось уже после дедлайна, внешний finally браузера ещё не видел.
    if (timedOut) {
      await opened.close({silent: true});
      throw timeoutError;
    }
    browser = opened;
    const page = await browser.newPage({
      context: () => null, logLevel: 'error', indent: false, pageIndex: 0,
      onBrowserLog: null, onLog: () => {},
    });
    await page.goto({url: pathToFileURL(htmlFile).href, timeout: TIMEOUT_MS});
    // Ждём готовности ресурсов, а не условные пять секунд виртуального времени:
    // иначе печать могла завершиться успешно с пустыми буквами или неготовыми фотографиями.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    // CDP у зафиксированной версии Remotion возвращает ответ внутри value.
    // Размер листа и поля задаёт общая вёрстка КП, браузерных колонтитулов не добавляем.
    const {value: {data}} = await page._client().send('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    });
    if (timedOut) throw timeoutError;
    const pdf = Buffer.from(data, 'base64');
    if (pdf.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Chromium вернул пустой или некорректный PDF');
    }
    await fs.writeFile(pdfFile, pdf);
  };

  try {
    await Promise.race([print(), deadline]);
  } finally {
    clearTimeout(timer);
    // Закрываем и при ошибке/таймауте: очередь не должна освобождать слот,
    // оставляя процесс печати расходовать память рядом с клиентскими роликами.
    if (browser) await browser.close({silent: true}).catch((error) => {
      log.warn('browser.close_failed', {note: 'не удалось закрыть браузер печати КП', error});
    });
  }
};
