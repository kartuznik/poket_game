import type { ReadinessBand, ReadinessItemId, ReadinessStatus } from '../../lib/types';

export interface ReadinessItem {
  readonly id: ReadinessItemId;
  readonly group: 'Процесс' | 'Данные' | 'Люди';
  readonly title: string;
  readonly help: string;
}

export const READINESS_ITEMS: readonly ReadinessItem[] = [
  {
    id: 'repeated',
    group: 'Процесс',
    title: 'Есть действие, которое вы повторяете каждую неделю',
    help: 'Автоматизировать можно только то, что уже повторяется. Если каждый раз процесс новый, бот будет мешать.',
  },
  {
    id: 'rules',
    group: 'Процесс',
    title: 'Понятно, что отвечать в типовых ситуациях',
    help: 'Бот отвечает по вашим правилам. Если правил нет, он будет писать наугад.',
  },
  {
    id: 'one-path',
    group: 'Процесс',
    title: 'Запись, заказ или оплата идут по одному сценарию',
    help: 'Один сценарий можно собрать за день. Пять разных путей — это уже отдельный проект.',
  },
  {
    id: 'one-place',
    group: 'Данные',
    title: 'Обращения и контакты лежат в одном месте, не в десяти чатах',
    help: 'Если обращения размазаны по чатам, непонятно, кому уже ответили. Хватит одной таблицы.',
  },
  {
    id: 'faq',
    group: 'Данные',
    title: 'Есть список частых вопросов и ваших ответов',
    help: 'Готовые ответы — это то, что бот отправит без вас. Для старта обычно хватает десяти вопросов.',
  },
  {
    id: 'numbers',
    group: 'Данные',
    title: 'Вы примерно знаете число обращений и средний чек',
    help: 'Без этих двух цифр непонятно, окупится ли настройка. Важен порядок, не точность до рубля.',
  },
  {
    id: 'owner',
    group: 'Люди',
    title: 'Есть человек, который будет смотреть диалоги',
    help: 'Кто-то должен забирать диалоги, которые бот не закрыл. Это не обязательно вы, но человек нужен.',
  },
  {
    id: 'channel',
    group: 'Люди',
    title: 'Понятен главный канал: Telegram, WhatsApp, сайт или звонки',
    help: 'Начинать лучше с одного канала, где клиенты уже пишут, а не со всех сразу.',
  },
  {
    id: 'time',
    group: 'Люди',
    title: 'Есть несколько часов на первую настройку, не «когда-нибудь»',
    help: 'Первый сценарий занимает несколько часов. Без этого окна настройка растянется и заглохнет.',
  },
] as const;

export const READINESS_POINTS: Readonly<Record<ReadinessStatus, number>> = {
  yes: 1,
  partial: 0.5,
  no: 0,
};

export const READINESS_BAND_LABEL: Readonly<Record<ReadinessBand, string>> = {
  early: 'Рано',
  gaps: 'Закройте пробелы',
  ready: 'Можно начинать',
};

const BAND_NOTE: Readonly<Record<ReadinessBand, string>> = {
  early: 'Сначала опишите процесс руками: что повторяется и что отвечать клиенту. Автоматизировать пока рано.',
  gaps: 'Основа уже есть. Закройте пункты ниже — и можно собирать первый сценарий, а не большую систему.',
  ready: 'Процессы достаточно понятны, чтобы начать с одного сценария.',
};

export interface ReadinessResult {
  readonly score: number;
  readonly band: ReadinessBand;
  readonly bandLabel: string;
  readonly note: string;
  readonly unclosed: readonly { readonly id: ReadinessItemId; readonly title: string; readonly status: ReadinessStatus }[];
}

export function defaultReadinessAnswers(): Record<ReadinessItemId, ReadinessStatus> {
  return {
    repeated: 'no',
    rules: 'no',
    'one-path': 'no',
    'one-place': 'no',
    faq: 'no',
    numbers: 'no',
    owner: 'no',
    channel: 'no',
    time: 'no',
  };
}

export function pointsFor(status: ReadinessStatus): number {
  return READINESS_POINTS[status];
}

/** Fewer than 4 points is early, 4 up to 7 is gaps, 7 and above can start. */
export function bandForScore(score: number): ReadinessBand {
  if (score < 4) return 'early';
  if (score < 7) return 'gaps';
  return 'ready';
}

export function assessReadiness(
  answers: Readonly<Record<ReadinessItemId, ReadinessStatus>>,
): ReadinessResult {
  let score = 0;
  const unclosed: ReadinessResult['unclosed'][number][] = [];

  for (const item of READINESS_ITEMS) {
    const status = answers[item.id];
    score += pointsFor(status);
    if (status !== 'yes') {
      unclosed.push({ id: item.id, title: item.title, status });
    }
  }

  const rounded = Math.round(score * 2) / 2;
  const band = bandForScore(rounded);
  return {
    score: rounded,
    band,
    bandLabel: READINESS_BAND_LABEL[band],
    note: BAND_NOTE[band],
    unclosed,
  };
}
