// Звуки машины без голоса — проба.
//
// При озвучке живой звук глушится целиком: иначе в кадре говорят два голоса — свой в съёмке
// и начитка. Вместе с голосом пропадает и машина: двери, двигатель, шаги.
//
// Модель разделения (Demucs) делит дорожку на речь и всё остальное. «Всё остальное» можно
// подкладывать под начитку, второго голоса в нём нет. Замер на Mercedes: голос подавлен на
// 18 дБ, удар двери сохранился на 95%, и дорожка перестала «оживать» под речь — перепад
// громкости речь/пауза упал с ×3,3 до ×0,8.
//
// Разделение неидеальное: местами голос просачивается. Поэтому шаг ручной, а слой выключается.
//
// Зависимостью проекта не является: нет окружения — нет кнопки, остальное работает как работало.
// Установка: python3 -m venv .venv-demucs && .venv-demucs/bin/pip install demucs numpy soundfile
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {HttpError, ROOT} from './store.mjs';

const VENV = process.env.DEMUCS_PYTHON || path.join(ROOT, '.venv-demucs', 'bin', 'python');
const MODEL = process.env.DEMUCS_MODEL || 'htdemucs';
// 13 секунд разделились за 15 с вместе с загрузкой модели; при потолке исходника в 10 минут
// счёт идёт минутами. Полчаса — запас, но конечный: зависший процесс не должен держать обзор.
const TIMEOUT_MS = Number(process.env.DEMUCS_TIMEOUT_MS || 30 * 60 * 1000);

/** Установлено ли окружение. От этого зависит, показывать ли кнопку вообще. */
export const hasSeparator = async () => {
  try {
    await fs.access(VENV);
    return true;
  } catch {
    return false;
  }
};

const runPython = (args, {timeout = TIMEOUT_MS} = {}) => new Promise((resolve, reject) => {
  const child = spawn(VENV, args, {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
  let err = '';
  let out = '';
  let killed = false;
  const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeout);
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('error', (e) => { clearTimeout(timer); reject(e); });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (killed) return reject(new Error(`Разделение не уложилось в ${Math.round(timeout / 60000)} мин и было остановлено`));
    if (code === 0) return resolve(out);
    // В хвосте stderr обычно и лежит причина; прогресс-бар выкидываем, он занимает всё
    const tail = err.split('\n').filter((l) => l.trim() && !l.includes('%|')).slice(-3).join(' ');
    reject(new Error(tail || `Разделение вернуло код ${code}`));
  });
});

/**
 * Выделить звуки без голоса из дорожки видео.
 * @param {string} video — рабочая копия
 * @param {string} outFile — куда положить результат (.m4a)
 * @param {(stage: string) => void} [onStage]
 */
export const separateAmbience = async (video, outFile, onStage) => {
  if (!await hasSeparator()) {
    throw new HttpError(400, 'Окружение для разделения не установлено — см. server/ambience.mjs');
  }
  const work = await fs.mkdtemp(path.join(path.dirname(outFile), 'stems-'));
  try {
    onStage?.('Готовлю дорожку');
    const wav = path.join(work, 'in.wav');
    // Модель ждёт несжатый звук; заодно отвязываемся от контейнера видео
    const {run} = await import('./media.mjs');
    await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '2', '-ar', '44100', wav]);

    onStage?.('Разделяю голос и звуки');
    await runPython(['-m', 'demucs', '--two-stems=vocals', '-n', MODEL, '-o', work, '--filename', '{stem}.{ext}', wav]);

    const stem = path.join(work, MODEL, 'no_vocals.wav');
    await fs.access(stem).catch(() => { throw new Error('Модель не вернула дорожку без голоса'); });

    onStage?.('Сжимаю');
    // Контейнер задаём явно: сборка ffmpeg из Remotion не выводит его из расширения .m4a
    await run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', stem, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4', outFile]);
    return outFile;
  } finally {
    await fs.rm(work, {recursive: true, force: true}).catch(() => {});
  }
};
