import type { DesignThemeId, ToolId, ToolMeta } from '../lib/types';

export interface ThemeDirectionMeta {
  readonly id: DesignThemeId;
  readonly shortName: string;
  readonly description: string;
}

export const THEME_DIRECTIONS: readonly ThemeDirectionMeta[] = [
  {
    id: 'minimal',
    shortName: '1. Минимализм',
    description: 'Светлый инженерный каркас с одним индиго-акцентом и табличными цифрами.',
  },
  {
    id: 'playful',
    shortName: '2. Карточный',
    description: 'Тактильные карточки с контрастным контуром и дружелюбными акцентами.',
  },
  {
    id: 'editorial',
    shortName: '3. Типографика',
    description: 'Газетная антиква в заголовках, бумажный фон и строгие линейки.',
  },
] as const;

export const TOOLS_CATALOG: Readonly<Record<ToolId, ToolMeta>> = {
  'revenue-risk': {
    id: 'revenue-risk',
    shortTitle: 'Выручка под риском',
    title: 'Калькулятор выручки под риском',
    subtitle:
      'Оценка потенциальных потерь от поздних или пропущенных ответов на обращения клиентов.',
    badge: 'Инструмент 01 · Каркас Этапа 1',
    inputLabel: 'Обращений клиентов в месяц',
    inputUnit: 'заявок/мес',
    defaultInput: 120,
    minInput: 0,
    maxInput: 50000,
    stepInput: 10,
    nextToolId: 'routine-calc',
    nextToolCta: 'Передать объём потока в Калькулятор рутины →',
  },
  'routine-calc': {
    id: 'routine-calc',
    shortTitle: 'Калькулятор рутины',
    title: 'Калькулятор времени на рутине',
    subtitle:
      'Подсчёт часов, которые уходят на однотипные ответы, приём заказов, записи и перенос в таблицы.',
    badge: 'Инструмент 02 · Каркас Этапа 1',
    inputLabel: 'Минут ручной рутины в неделю',
    inputUnit: 'мин/нед',
    defaultInput: 240,
    minInput: 0,
    maxInput: 10000,
    stepInput: 15,
    nextToolId: 'priority-diag',
    nextToolCta: 'Перейти к диагностике приоритетов →',
  },
  'priority-diag': {
    id: 'priority-diag',
    shortTitle: 'Что первым',
    title: 'Диагностика «Что автоматизировать первым»',
    subtitle:
      'Ранжирование шести процессов (обращения, ответы, запись, оплата, напоминания, отчёты) по частоте и цене ошибки.',
    badge: 'Инструмент 03 · Каркас Этапа 1',
    inputLabel: 'Оценка критичности узкого места',
    inputUnit: 'из 100%',
    defaultInput: 75,
    minInput: 0,
    maxInput: 100,
    stepInput: 5,
    nextToolId: 'revenue-risk',
    nextToolCta: 'Посчитать выручку под риском для процесса №1 →',
  },
  'readiness-check': {
    id: 'readiness-check',
    shortTitle: 'Чек-лист готовности',
    title: 'Чек-лист готовности к автоматизации',
    subtitle:
      'Проверка девяти базовых условий перед внедрением бота: от «рано» до «можно начинать».',
    badge: 'Инструмент 04 · Каркас Этапа 1',
    inputLabel: 'Готовых пунктов из чек-листа',
    inputUnit: 'из 9 пунктов',
    defaultInput: 6,
    minInput: 0,
    maxInput: 9,
    stepInput: 1,
    nextToolId: 'priority-diag',
    nextToolCta: 'Выбрать первый процесс в Диагностике →',
  },
};
