import type { ToolBridge } from '../lib/bridge';
import {
  formatCountWithNoun,
  formatDurationMinutes,
  formatPercent,
  formatRubles,
  normalizeFiniteNumber,
} from '../lib/format';
import type { DossierStore } from '../lib/dossier';
import type { ScenarioStore } from '../lib/storage';
import type { ToolId, ToolMeta } from '../lib/types';

export interface ToolStubRenderContext {
  readonly meta: ToolMeta;
  readonly bridge: ToolBridge;
  readonly store: ScenarioStore;
  readonly dossier: DossierStore;
  readonly initialStep: number | null;
  readonly onWizardStep: (step: number) => void;
  readonly onNavigateTool: (targetTool: ToolId, step?: number) => void;
  readonly helpText?: string;
}

/**
 * Formats the preview display value for the Stage 1 stub screen using our tested utilities.
 * Note: actual business formulas will be plugged in at Stage 2 per specification.
 */
export function formatStubPreview(toolId: ToolId, rawInput: number): {
  readonly primaryNumber: number;
  readonly formattedDisplay: string;
  readonly unitExplanation: string;
} {
  const safe = Math.max(0, normalizeFiniteNumber(rawInput, 0));

  switch (toolId) {
    case 'revenue-risk': {
      // Stage 1 placeholder display: formats input volume & currency formatting demo
      const demoAmount = safe * 1000;
      return {
        primaryNumber: demoAmount,
        formattedDisplay: formatRubles(demoAmount),
        unitExplanation: `Для потока ${formatCountWithNoun(safe, ['обращение', 'обращения', 'обращений'])} в месяц (формула потерь подключается на Этапе 2).`,
      };
    }
    case 'routine-calc': {
      return {
        primaryNumber: safe,
        formattedDisplay: formatDurationMinutes(safe),
        unitExplanation:
          'Еженедельный объём ручных операций (пресеты и расчёт в месяц подключаются на Этапе 2).',
      };
    }
    case 'priority-diag': {
      const clamped = Math.min(100, safe);
      return {
        primaryNumber: clamped,
        formattedDisplay: `Индекс ${formatPercent(clamped)}`,
        unitExplanation:
          'Приоритет процесса №1 для передачи в калькулятор выручки или рутины (матрица 6 процессов — на Этапе 2).',
      };
    }
    case 'readiness-check': {
      const clamped = Math.min(9, Math.round(safe));
      return {
        primaryNumber: clamped,
        formattedDisplay: `${formatCountWithNoun(clamped, ['пункт', 'пункта', 'пунктов'])} из 9`,
        unitExplanation:
          'Ориентир готовности к внедрению бота (9 критериев и вердикт — на Этапе 2).',
      };
    }
    case 'final-report':
      return {
        primaryNumber: safe,
        formattedDisplay: 'Сводка',
        unitExplanation: 'Итог собирается из результатов инструментов.',
      };
    case 'audit-finish':
      return {
        primaryNumber: safe,
        formattedDisplay: 'Сводка',
        unitExplanation: 'Финальный экран собирает подтверждённые результаты и контакты.',
      };
  }
}
