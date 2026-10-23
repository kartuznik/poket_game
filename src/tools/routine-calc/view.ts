import { createFieldHeading } from '../../components/field-heading';
import { createHelpTip, releaseHelpTipsWithin } from '../../components/tooltip';
import { copyTextToClipboard } from '../../lib/clipboard';
import {
  formatCountWithNoun,
  formatRubles,
  formatWorkHours,
} from '../../lib/format';
import type { RoutinePresetId } from '../../lib/types';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  ROUTINE_DEFAULTS,
  ROUTINE_PRESETS,
  calculateRoutine,
  getRoutinePresetById,
  validateRoutineDraft,
  type RoutineResult,
} from './calc';

const HELP = {
  operations:
    'Сколько раз в неделю вы делаете эту операцию. Звонок, сообщение, запись или строка в таблице — один раз считается одной операцией.',
  minutes:
    'Сколько минут занимает один такой раз, от начала до конца. Если обычно 5–10 минут, поставьте типичное время, а не самый долгий случай.',
  rate:
    'Сколько стоит ваш час. Пустое поле оставляет расчёт в часах и рабочих днях, без рублей.\n\nНоль — это указанная ставка: экономия в рублях будет нулевой.',
  automation:
    'Какую долю этих операций можно отдать шаблону или боту. 0% — всё остаётся руками, 100% — операция уходит целиком. Часы и рубли экономии считаются от этой доли.',
  preset:
    'Подставляет типичное число операций, минут и долю автоматизации для этой рутины. Ставку не меняет. Цифры можно сразу поправить.',
} as const;

const WORKDAY_FORMS = ['рабочий день', 'рабочих дня', 'рабочих дней'] as const;

function formatWorkDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  return formatCountWithNoun(rounded, WORKDAY_FORMS);
}

export function buildRoutineShareText(params: {
  readonly presetTitle: string | null;
  readonly result: RoutineResult;
}): string {
  const subject = params.presetTitle ?? 'своя рутина';
  const money =
    params.result.savedMoneyPerMonth === null
      ? 'Ставка не указана.'
      : `Экономия ${formatRubles(params.result.savedMoneyPerMonth)}/мес.`;
  return [
    `Калькулятор рутины: ${subject}.`,
    `${formatWorkHours(params.result.hoursPerMonth)} в месяц, ${formatWorkDays(params.result.workDaysPerYear)} в год.`,
    `Можно вернуть ${formatWorkHours(params.result.savedHoursPerMonth)}/мес. ${money}`,
    '',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

export function renderRoutineCalcTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['routine-calc'];
  const { bridge, store, onNavigateTool } = ctx;
  const incoming = bridge.consume('routine-calc');
  const saved = bridge.getRoutineResult();

  let presetId: RoutinePresetId | null = saved?.inputs.presetId ?? ROUTINE_DEFAULTS.presetId;
  let operationsRaw = String(saved?.inputs.operationsPerWeek ?? ROUTINE_DEFAULTS.operationsPerWeek);
  let minutesRaw = String(saved?.inputs.minutesPerOperation ?? ROUTINE_DEFAULTS.minutesPerOperation);
  let shareRaw = String(
    saved?.inputs.automationSharePercent ?? ROUTINE_DEFAULTS.automationSharePercent,
  );
  let rateRaw =
    saved?.inputs.hourlyRate === null || saved?.inputs.hourlyRate === undefined
      ? ''
      : String(saved.inputs.hourlyRate);

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-routine-calc');

  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.textContent = meta.badge;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-routine-calc';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  inputCard.append(header);

  if (incoming) {
    const banner = document.createElement('div');
    banner.className = 'handoff-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = `С прошлого шага: ${incoming.label}. ${incoming.note}.`;
    inputCard.append(banner);
  }

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'presets-grid';
  const presetButtons = new Map<RoutinePresetId, HTMLButtonElement>();

  const operationsInput = document.createElement('input');
  operationsInput.className = 'field-input';
  operationsInput.id = 'rc-ops-input';
  operationsInput.type = 'number';
  operationsInput.inputMode = 'decimal';
  operationsInput.min = '0';
  operationsInput.max = '10000';
  operationsInput.step = '1';
  operationsInput.value = operationsRaw;

  const minutesInput = document.createElement('input');
  minutesInput.className = 'field-input';
  minutesInput.id = 'rc-minutes-input';
  minutesInput.type = 'number';
  minutesInput.inputMode = 'decimal';
  minutesInput.min = '0';
  minutesInput.max = '480';
  minutesInput.step = '1';
  minutesInput.value = minutesRaw;

  const rateInput = document.createElement('input');
  rateInput.className = 'field-input';
  rateInput.id = 'rc-rate-input';
  rateInput.type = 'number';
  rateInput.inputMode = 'numeric';
  rateInput.min = '0';
  rateInput.max = '100000';
  rateInput.step = '100';
  rateInput.placeholder = 'не обязательно';
  rateInput.value = rateRaw;

  const shareRow = document.createElement('div');
  shareRow.className = 'slider-row';
  const shareSlider = document.createElement('input');
  shareSlider.className = 'field-slider';
  shareSlider.type = 'range';
  shareSlider.min = '0';
  shareSlider.max = '100';
  shareSlider.step = '5';
  shareSlider.value = shareRaw;
  shareSlider.setAttribute('aria-label', 'Ползунок доли автоматизации в процентах');
  const shareInput = document.createElement('input');
  shareInput.className = 'field-input';
  shareInput.id = 'rc-share-input';
  shareInput.type = 'number';
  shareInput.inputMode = 'decimal';
  shareInput.min = '0';
  shareInput.max = '100';
  shareInput.step = '1';
  shareInput.value = shareRaw;
  shareRow.append(shareSlider, shareInput);

  function markPreset(next: RoutinePresetId | null): void {
    presetId = next;
    for (const [id, button] of presetButtons) {
      button.setAttribute('aria-pressed', String(id === presetId));
    }
  }

  for (const preset of ROUTINE_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.setAttribute('aria-pressed', String(preset.id === presetId));
    button.innerHTML = `
      <span class="preset-card__top">
        <span class="preset-card__title">${preset.title}</span>
        <span class="preset-card__conv">${preset.operationsPerWeek}/нед</span>
      </span>
      <span class="preset-card__desc">${preset.description}</span>
      <span class="preset-card__range">${preset.minutesPerOperation} мин · автоматизация ${preset.automationSharePercent}%</span>
    `;
    button.addEventListener('click', () => {
      markPreset(preset.id);
      operationsRaw = String(preset.operationsPerWeek);
      minutesRaw = String(preset.minutesPerOperation);
      shareRaw = String(preset.automationSharePercent);
      operationsInput.value = operationsRaw;
      minutesInput.value = minutesRaw;
      shareInput.value = shareRaw;
      shareSlider.value = shareRaw;
      recalculate();
    });
    presetButtons.set(preset.id, button);
    const wrap = document.createElement('div');
    wrap.className = 'preset-card-wrap';
    wrap.append(button, createHelpTip(HELP.preset, { avoid: () => button }));
    presetsGrid.append(wrap);
  }

  const operationsError = document.createElement('p');
  operationsError.className = 'field-error';
  operationsError.hidden = true;
  const minutesError = document.createElement('p');
  minutesError.className = 'field-error';
  minutesError.hidden = true;
  const rateError = document.createElement('p');
  rateError.className = 'field-error';
  rateError.hidden = true;
  const shareError = document.createElement('p');
  shareError.className = 'field-error';
  shareError.hidden = true;

  const operationsGroup = document.createElement('div');
  operationsGroup.className = 'field-group';
  operationsGroup.append(
    createFieldHeading('rc-ops-input', 'Операций в неделю', 'раз/нед', HELP.operations, () => operationsInput).row,
    operationsInput,
    operationsError,
  );

  const minutesGroup = document.createElement('div');
  minutesGroup.className = 'field-group';
  minutesGroup.append(
    createFieldHeading('rc-minutes-input', 'Минут на операцию', 'мин', HELP.minutes, () => minutesInput).row,
    minutesInput,
    minutesError,
  );

  const rateGroup = document.createElement('div');
  rateGroup.className = 'field-group';
  rateGroup.append(
    createFieldHeading('rc-rate-input', 'Ставка', '₽/час', HELP.rate, () => rateInput).row,
    rateInput,
    rateError,
  );

  const shareGroup = document.createElement('div');
  shareGroup.className = 'field-group';
  shareGroup.append(
    createFieldHeading('rc-share-input', 'Доля автоматизации', '0–100%', HELP.automation, () => shareRow).row,
    shareRow,
    shareError,
  );

  inputCard.append(presetsGrid, operationsGroup, minutesGroup, rateGroup, shareGroup);

  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = '<span>ЧАСЫ НА РУТИНЕ В МЕСЯЦ</span><span>@_kartuzzz</span>';
  const valueEl = document.createElement('p');
  valueEl.className = 'result-card__value';
  const noteEl = document.createElement('p');
  noteEl.className = 'result-card__note';
  const metrics = document.createElement('div');
  metrics.className = 'metrics-grid';
  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--secondary';
  copyBtn.textContent = 'Скопировать резюме для Threads';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Сохранить «До» для сравнения';
  const handoffBtn = document.createElement('button');
  handoffBtn.type = 'button';
  handoffBtn.className = 'action-btn action-btn--primary';
  handoffBtn.textContent = meta.nextToolCta;
  const earlyReportBtn = document.createElement('button');
  earlyReportBtn.type = 'button';
  earlyReportBtn.className = 'early-report-link';
  earlyReportBtn.textContent = 'или посмотреть итоги сейчас';
  actions.append(copyBtn, saveBtn, handoffBtn, earlyReportBtn);

  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  const how = document.createElement('details');
  how.className = 'info-details';
  const howSummary = document.createElement('summary');
  howSummary.className = 'info-details__summary';
  howSummary.textContent = 'Как посчитано';
  const howBody = document.createElement('div');
  howBody.className = 'info-details__body';
  how.append(howSummary, howBody);

  resultCard.append(eyebrow, valueEl, noteEl, metrics, diffBox, actions, toast, how);
  panel.append(inputCard, resultCard);
  container.append(panel);

  let latest: RoutineResult | null = null;

  function showError(node: HTMLElement, input: HTMLElement, message: string | undefined): void {
    node.hidden = !message;
    node.textContent = message ?? '';
    input.classList.toggle('field-input--invalid', Boolean(message));
  }

  function metric(label: string, value: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'metric-box';
    const labelEl = document.createElement('span');
    labelEl.className = 'metric-box__label';
    labelEl.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = 'metric-box__value';
    valueNode.textContent = value;
    box.append(labelEl, valueNode);
    return box;
  }

  function recalculate(): void {
    operationsRaw = operationsInput.value;
    minutesRaw = minutesInput.value;
    shareRaw = shareInput.value;
    rateRaw = rateInput.value;
    const validated = validateRoutineDraft({
      operationsPerWeekRaw: operationsRaw,
      minutesPerOperationRaw: minutesRaw,
      automationSharePercentRaw: shareRaw,
      hourlyRateRaw: rateRaw,
    });
    showError(operationsError, operationsInput, validated.errors.operationsPerWeek);
    showError(minutesError, minutesInput, validated.errors.minutesPerOperation);
    showError(rateError, rateInput, validated.errors.hourlyRate);
    showError(shareError, shareInput, validated.errors.automationSharePercent);

    if (!validated.isValid || !validated.input) {
      latest = null;
      valueEl.textContent = 'Проверьте поля';
      noteEl.textContent = 'Расчёт появится, когда числа будут в допустимых границах.';
      metrics.replaceChildren();
      howBody.replaceChildren();
      return;
    }

    const result = calculateRoutine(validated.input);
    latest = result;
    const presetTitle = presetId ? getRoutinePresetById(presetId).title : null;
    valueEl.textContent = formatWorkHours(result.hoursPerMonth);
    noteEl.textContent = presetTitle
      ? `«${presetTitle}». Это ${formatWorkDays(result.workDaysPerYear)} в год.`
      : `Свои цифры. Это ${formatWorkDays(result.workDaysPerYear)} в год.`;

    const money =
      result.savedMoneyPerMonth === null
        ? 'Ставка не указана'
        : `${formatRubles(result.savedMoneyPerMonth)}/мес`;
    metrics.replaceChildren(
      metric('Можно вернуть', `${formatWorkHours(result.savedHoursPerMonth)}/мес`),
      metric('Рабочих дней экономии в год', formatWorkDays(result.savedWorkDaysPerYear)),
      metric('Экономия', money),
    );

    const steps = [
      `Часы в месяц = ${operationsRaw} × ${minutesRaw} мин × 4,33 ÷ 60 = ${formatWorkHours(result.hoursPerMonth)}.`,
      `Рабочие дни в год = часы × 12 ÷ 8 = ${formatWorkDays(result.workDaysPerYear)}.`,
      `Экономия часов = часы × ${shareRaw}% = ${formatWorkHours(result.savedHoursPerMonth)}.`,
      result.savedMoneyPerMonth === null
        ? 'Ставка не указана, поэтому рубли не считаются.'
        : `Экономия в рублях = часы экономии × ставка = ${formatRubles(result.savedMoneyPerMonth)} в месяц.`,
    ];
    const formula = document.createElement('ol');
    formula.className = 'formula-list';
    for (const step of steps) {
      const item = document.createElement('li');
      item.textContent = step;
      formula.append(item);
    }
    howBody.replaceChildren(formula);

    bridge.saveRoutineResult({
      inputs: {
        presetId,
        operationsPerWeek: validated.input.operationsPerWeek,
        minutesPerOperation: validated.input.minutesPerOperation,
        hourlyRate: validated.input.hourlyRate,
        automationSharePercent: validated.input.automationSharePercent,
      },
      results: result,
    });

    const stored = store.load('routine-calc');
    if (stored) {
      const comparison = store.compare('routine-calc', result.hoursPerMonth, true);
      diffBox.hidden = false;
      diffBox.textContent = comparison
        ? `Сравнение «До / После»: было ${stored.formattedValue} → сейчас ${formatWorkHours(result.hoursPerMonth)}.`
        : '';
    } else {
      diffBox.hidden = true;
    }
  }

  function onManualEdit(): void {
    markPreset(null);
    recalculate();
  }

  operationsInput.addEventListener('input', onManualEdit);
  minutesInput.addEventListener('input', onManualEdit);
  rateInput.addEventListener('input', () => {
    rateRaw = rateInput.value;
    recalculate();
  });
  shareInput.addEventListener('input', () => {
    shareSlider.value = shareInput.value;
    onManualEdit();
  });
  shareSlider.addEventListener('input', () => {
    shareInput.value = shareSlider.value;
    onManualEdit();
  });
  for (const field of [operationsInput, minutesInput, rateInput, shareInput, shareSlider]) {
    field.addEventListener('change', () => {
      if (field === shareSlider) shareInput.value = shareSlider.value;
      if (field === shareInput) shareSlider.value = shareInput.value;
      recalculate();
    });
  }

  copyBtn.addEventListener('click', async () => {
    if (!latest) {
      toast.hidden = false;
      toast.textContent = 'Сначала исправьте поля — копировать пока нечего.';
      return;
    }
    const text = buildRoutineShareText({
      presetTitle: presetId ? getRoutinePresetById(presetId).title : null,
      result: latest,
    });
    const copied = await copyTextToClipboard(text, 'резюме рутины для Threads');
    toast.hidden = false;
    toast.textContent = copied.ok ? 'Скопировано резюме для Threads' : copied.message;
  });

  saveBtn.addEventListener('click', () => {
    if (!latest) return;
    const formatted = formatWorkHours(latest.hoursPerMonth);
    const savedScenario = store.save('routine-calc', {
      label: 'Сценарий «До»',
      primaryValue: latest.hoursPerMonth,
      formattedValue: formatted,
    });
    recalculate();
    toast.hidden = false;
    toast.textContent = savedScenario.persisted
      ? `Сохранено локально («До»: ${formatted}).`
      : `Сохранено на время сессии («До»: ${formatted}).`;
  });

  handoffBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  });
  earlyReportBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
