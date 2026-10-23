import { createFieldHeading } from '../components/field-heading';
import { releaseHelpTipsWithin } from '../components/tooltip';
import type { ToolBridge } from '../lib/bridge';
import { copyTextToClipboard } from '../lib/clipboard';
import {
  formatCountWithNoun,
  formatDurationMinutes,
  formatPercent,
  formatRubles,
  normalizeFiniteNumber,
} from '../lib/format';
import type { ScenarioStore } from '../lib/storage';
import type { ToolId, ToolMeta } from '../lib/types';

export interface ToolStubRenderContext {
  readonly meta: ToolMeta;
  readonly bridge: ToolBridge;
  readonly store: ScenarioStore;
  readonly onNavigateTool: (targetTool: ToolId) => void;
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
  }
}

export function renderToolStub(
  container: HTMLElement,
  ctx: ToolStubRenderContext,
): void {
  const { meta, bridge, store, onNavigateTool } = ctx;
  const incomingHandoff = bridge.consume(meta.id);

  let currentValue = incomingHandoff
    ? incomingHandoff.suggestedValue
    : meta.defaultInput;

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', `tool-heading-${meta.id}`);

  // 1. Input Card
  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card__header';

  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.textContent = meta.badge;

  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = `tool-heading-${meta.id}`;
  title.textContent = meta.title;

  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;

  header.append(badge, title, subtitle);
  inputCard.appendChild(header);

  if (incomingHandoff) {
    const handoffBanner = document.createElement('div');
    handoffBanner.className = 'handoff-banner';
    handoffBanner.setAttribute('role', 'status');
    handoffBanner.textContent = `Связка инструментов: получено значение «${incomingHandoff.label}» (${incomingHandoff.note}).`;
    inputCard.appendChild(handoffBanner);
  }

  const fieldGroup = document.createElement('div');
  fieldGroup.className = 'field-group';

  const inputRow = document.createElement('div');
  inputRow.className = 'field-input-row';

  const inputEl = document.createElement('input');
  inputEl.className = 'field-input';
  inputEl.id = `input-${meta.id}`;
  inputEl.type = 'number';
  inputEl.inputMode = 'numeric';
  inputEl.min = String(meta.minInput);
  inputEl.max = String(meta.maxInput);
  inputEl.step = String(meta.stepInput);
  inputEl.value = String(currentValue);

  inputRow.appendChild(inputEl);

  const heading = createFieldHeading(
    inputEl.id,
    meta.inputLabel,
    meta.inputUnit,
    ctx.helpText ??
      'Это поле участвует в расчёте. Измените число, чтобы увидеть, как сдвинется результат.',
    () => inputEl,
  );

  fieldGroup.append(heading.row, inputRow);
  inputCard.appendChild(fieldGroup);

  // 2. Result Card (Screenshot & Repost ready)
  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');

  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = `<span>КАРТОЧКА РЕЗУЛЬТАТА · @_kartuzzz</span><span>Реактивный расчёт</span>`;

  const valueEl = document.createElement('p');
  valueEl.className = 'result-card__value';

  const noteEl = document.createElement('p');
  noteEl.className = 'result-card__note';

  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--secondary';
  copyBtn.textContent = 'Скопировать результат';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Сохранить «До» для сравнения';

  const handoffBtn = document.createElement('button');
  handoffBtn.type = 'button';
  handoffBtn.className = 'action-btn action-btn--primary';
  handoffBtn.textContent = meta.nextToolCta;

  actions.append(copyBtn, saveBtn, handoffBtn);

  const toastEl = document.createElement('p');
  toastEl.className = 'status-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;

  resultCard.append(eyebrow, valueEl, noteEl, diffBox, actions, toastEl);
  panel.append(inputCard, resultCard);
  container.appendChild(panel);

  const showToast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
  };

  const updateView = () => {
    const preview = formatStubPreview(meta.id, currentValue);
    valueEl.textContent = preview.formattedDisplay;
    noteEl.textContent = preview.unitExplanation;

    const saved = store.load(meta.id);
    if (saved) {
      const comparison = store.compare(
        meta.id,
        preview.primaryNumber,
        meta.id !== 'readiness-check',
      );
      diffBox.hidden = false;
      const sign =
        comparison && comparison.delta > 0
          ? '+'
          : '';
      const pctText =
        comparison && comparison.deltaPercent !== null
          ? ` (${sign}${comparison.deltaPercent}%)`
          : '';
      diffBox.textContent = `Сравнение «До / После»: было ${saved.formattedValue} → сейчас ${preview.formattedDisplay}${pctText}`;
    } else {
      diffBox.hidden = true;
    }
  };

  inputEl.addEventListener('input', () => {
    currentValue = normalizeFiniteNumber(inputEl.value, 0);
    updateView();
  });

  copyBtn.addEventListener('click', async () => {
    const preview = formatStubPreview(meta.id, currentValue);
    const shareText = `Игра в бизнес (@_kartuzzz) — ${meta.title}: ${preview.formattedDisplay}`;
    const res = await copyTextToClipboard(
      shareText,
      `${meta.shortTitle} (${preview.formattedDisplay})`,
    );
    showToast(res.message);
  });

  saveBtn.addEventListener('click', () => {
    const preview = formatStubPreview(meta.id, currentValue);
    const res = store.save(meta.id, {
      label: 'Сценарий «До»',
      primaryValue: preview.primaryNumber,
      formattedValue: preview.formattedDisplay,
    });
    updateView();
    showToast(
      res.persisted
        ? `Сохранено локально («До»: ${preview.formattedDisplay}). Поменяйте число для сравнения.`
        : `Сохранено на время сессии («До»: ${preview.formattedDisplay}) — приватный режим браузера.`,
    );
  });

  handoffBtn.addEventListener('click', () => {
    const preview = formatStubPreview(meta.id, currentValue);
    bridge.send({
      fromTool: meta.id,
      toTool: meta.nextToolId,
      label: preview.formattedDisplay,
      suggestedValue: Math.max(10, Math.round(currentValue)),
      note: `передано из «${meta.shortTitle}»`,
    });
    onNavigateTool(meta.nextToolId);
  });

  updateView();
}
