import { createFieldHeading } from '../../components/field-heading';
import { mountNicheMenu } from '../../components/niche-menu';
import { createResultBanner } from '../../components/result-banner';
import { appendPriorContext } from '../../components/prior-context';
import { createHelpTip, releaseHelpTipsWithin } from '../../components/tooltip';
import { createWizard } from '../../components/wizard';
import { showStatusToast } from '../../components/toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import { recordMetricSnapshot } from '../../lib/dossier';
import {
  NICHE_CAPTION,
  nicheById,
  nicheCaptionVisible,
  nichePromptKind,
  routineNicheFields,
  type BusinessNicheId,
  type NichePreset as BusinessNichePreset,
} from '../../lib/niche-presets';
import { isRoutineStartChosen, isRoutineStepValid, resolveInitialStep } from '../../lib/wizard';
import {
  formatCountWithNoun,
  formatRubles,
  formatWorkHours,
} from '../../lib/format';
import type { RoutinePresetId } from '../../lib/types';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  ROUTINE_PRESETS,
  aggregateRoutine,
  calculateRoutine,
  getRoutinePresetById,
  validateRoutineDraft,
  weightedAutomationShare,
  type RoutineFieldErrors,
  type RoutineResult,
} from './calc';
import { EMPTY_RATE_HINT, SHARE_INPUT_STEP, collapsePresetsToManual, routineStepModel } from './steps';

const HELP = {
  operations:
    'Сколько раз в неделю вы делаете эту операцию. Звонок, сообщение, запись или строка в таблице — один раз считается одной операцией.',
  minutes:
    'Сколько минут занимает один такой раз, от начала до конца. Если обычно 5–10 минут, поставьте своё обычное время, а не самый долгий случай.',
  rate:
    'Сколько стоит ваш час. Пустое поле оставляет расчёт в часах и рабочих днях, без рублей.\n\nНоль — это указанная ставка: экономия в рублях будет нулевой.',
  automation:
    'Какую долю этих операций можно отдать шаблону или боту. 0% — всё остаётся руками, 100% — операция уходит целиком. Часы и рубли экономии считаются от этой доли.',
  preset:
    'Подставляет условный пример для этого вида работы: сколько раз в неделю, сколько минут и какую долю можно отдать автоматизации. Ставку не трогает. Цифры можно сразу заменить.',
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
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/#routine-calc',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

export function renderRoutineCalcTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['routine-calc'];
  const { bridge, store, dossier, onNavigateTool, onWizardStep, initialStep } = ctx;
  bridge.consume('routine-calc');
  const saved = bridge.getRoutineResult();
  const draft = dossier.read().routineDraft;

  let presetIds: RoutinePresetId[] = draft?.presetIds
    ? [...draft.presetIds]
    : draft?.presetId
      ? [draft.presetId]
      : (saved?.inputs.items
          ?.flatMap((item) => (item.presetId ? [item.presetId] : [])) ??
        (saved?.inputs.presetId ? [saved.inputs.presetId] : []));
  let customEntry = draft
    ? draft.customEntry
    : saved !== null && presetIds.length === 0;
  let operationsRaw = draft?.operationsPerWeek ?? (saved ? String(saved.inputs.operationsPerWeek) : '');
  let minutesRaw = draft?.minutesPerOperation ?? (saved ? String(saved.inputs.minutesPerOperation) : '');
  let shareRaw = draft?.automationSharePercent ?? (saved ? String(saved.inputs.automationSharePercent) : '');
  let rateRaw = draft
    ? draft.hourlyRate
    : saved?.inputs.hourlyRate === null || saved?.inputs.hourlyRate === undefined
      ? ''
      : String(saved.inputs.hourlyRate);
  let lastErrors: RoutineFieldErrors = {};
  const openedStep = resolveInitialStep(4, initialStep, draft?.step ?? null);

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
  badge.hidden = true;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-routine-calc';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  const nicheStrip = document.createElement('p');
  nicheStrip.className = 'niche-strip';
  nicheStrip.hidden = true;
  header.append(nicheStrip);
  inputCard.append(header);
  appendPriorContext(
    inputCard,
    {
      revenue: bridge.getRevenueRiskResult(),
      routine: null,
      priority: null,
    },
    'routine-calc',
  );

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
  rateInput.value = rateRaw;

  const shareRow = document.createElement('div');
  shareRow.className = 'slider-row';
  const shareSlider = document.createElement('input');
  shareSlider.className = 'field-slider';
  shareSlider.type = 'range';
  shareSlider.min = '0';
  shareSlider.max = '100';
  shareSlider.step = SHARE_INPUT_STEP;
  shareSlider.value = shareRaw === '' ? '0' : shareRaw;
  shareSlider.setAttribute('aria-label', 'Ползунок доли автоматизации в процентах');
  const shareInput = document.createElement('input');
  shareInput.className = 'field-input';
  shareInput.id = 'rc-share-input';
  shareInput.type = 'number';
  shareInput.inputMode = 'decimal';
  shareInput.min = '0';
  shareInput.max = '100';
  shareInput.step = SHARE_INPUT_STEP;
  shareInput.value = shareRaw;
  shareRow.append(shareSlider, shareInput);

  let ownNumbersBtn: HTMLButtonElement | null = null;
  let breakdownHosts: HTMLDivElement[] = [];
  const checklistCaption = document.createElement('p');
  checklistCaption.className = 'field-note';
  checklistCaption.hidden = true;

  function presetLine(id: RoutinePresetId) {
    const preset = getRoutinePresetById(id);
    return {
      presetId: id,
      operationsPerWeek: preset.operationsPerWeek,
      minutesPerOperation: preset.minutesPerOperation,
      automationSharePercent: preset.automationSharePercent,
      hourlyRate: null as number | null,
    };
  }

  function paintPresets(): void {
    for (const [id, button] of presetButtons) {
      button.setAttribute('aria-pressed', String(!customEntry && presetIds.includes(id)));
    }
    ownNumbersBtn?.setAttribute('aria-pressed', String(customEntry && presetIds.length === 0));
    const niche = nicheById(dossier.read().niche);
    const same =
      niche !== null &&
      niche.routinePresetIds.length === presetIds.length &&
      niche.routinePresetIds.every((id) => presetIds.includes(id));
    checklistCaption.hidden = !same;
    checklistCaption.textContent = same && niche ? niche.conversionCaption : '';
    const model = routineStepModel({
      presetIds,
      customEntry,
      operations: operationsRaw,
      minutes: minutesRaw,
      share: shareRaw,
    });
    const breakdown = model.kind === 'breakdown';
    for (const host of breakdownHosts) paintBreakdownHost(host, model);
    operationsGroup.hidden = breakdown;
    minutesGroup.hidden = breakdown;
    shareGroup.hidden = breakdown;
    operationsInput.readOnly = false;
    minutesInput.readOnly = false;
    shareInput.readOnly = false;
    shareSlider.disabled = false;
    shareSlider.step = SHARE_INPUT_STEP;
  }

  for (const preset of ROUTINE_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-card';
    button.setAttribute('aria-pressed', String(!customEntry && presetIds.includes(preset.id)));
    button.innerHTML = `
      <span class="preset-card__top">
        <span class="preset-card__title">${preset.title}</span>
        <span class="preset-card__conv">${preset.operationsPerWeek}/нед</span>
      </span>
      <span class="preset-card__desc">${preset.description}</span>
        <span class="preset-card__range">${preset.minutesPerOperation} мин · ${formatWorkHours(calculateRoutine({ operationsPerWeek: preset.operationsPerWeek, minutesPerOperation: preset.minutesPerOperation, automationSharePercent: preset.automationSharePercent, hourlyRate: null }).hoursPerMonth)}</span>
    `;
    button.addEventListener('click', () => {
      customEntry = false;
      presetIds = presetIds.includes(preset.id)
        ? presetIds.filter((id) => id !== preset.id)
        : [...presetIds, preset.id];
      presetIds = ROUTINE_PRESETS.map((item) => item.id).filter((id) => presetIds.includes(id));
      paintPresets();
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
  const operationsNote = nicheNote();
  operationsGroup.append(
    createFieldHeading('rc-ops-input', 'Операций в неделю', 'раз/нед', HELP.operations, () => operationsInput).row,
    operationsInput,
    operationsNote,
    operationsError,
  );

  const minutesGroup = document.createElement('div');
  minutesGroup.className = 'field-group';
  const minutesNote = nicheNote();
  minutesGroup.append(
    createFieldHeading('rc-minutes-input', 'Минут на операцию', 'мин', HELP.minutes, () => minutesInput).row,
    minutesInput,
    minutesNote,
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

  function enterManualMode(): void {
    if (presetIds.length > 0) {
      const collapsed = collapsePresetsToManual(presetIds.map(presetLine));
      operationsRaw = String(collapsed.operationsPerWeek);
      minutesRaw = String(collapsed.minutesPerOperation);
      shareRaw = String(collapsed.automationSharePercent);
      operationsInput.value = operationsRaw;
      minutesInput.value = minutesRaw;
      shareInput.value = shareRaw;
      shareSlider.step = SHARE_INPUT_STEP;
      shareSlider.value = shareRaw;
    }
    customEntry = true;
    presetIds = [];
    paintPresets();
    recalculate();
  }

  function paintBreakdownHost(
    host: HTMLDivElement,
    model: ReturnType<typeof routineStepModel>,
  ): void {
    host.hidden = model.kind !== 'breakdown';
    host.replaceChildren();
    if (model.kind !== 'breakdown') return;
    for (const card of model.cards) {
      const row = document.createElement('article');
      row.className = 'routine-breakdown__card';
      const name = document.createElement('p');
      name.className = 'routine-breakdown__title';
      name.textContent = card.title;
      const detail = document.createElement('p');
      detail.className = 'routine-breakdown__detail';
      detail.textContent = `${String(card.operationsPerWeek)} операций в неделю · ${String(card.minutesPerOperation)} мин · доля ${String(card.automationSharePercent)}%`;
      row.append(name, detail);
      host.append(row);
    }
    const total = document.createElement('p');
    total.className = 'routine-breakdown__total';
    total.textContent =
      model.totalHours === null ? '' : `Итого ${formatWorkHours(model.totalHours)}`;
    host.append(total);
    if (model.manualSwitch) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-btn action-btn--secondary';
      button.textContent = 'Введу свои цифры';
      button.addEventListener('click', enterManualMode);
      host.append(button);
    }
  }

  ownNumbersBtn = document.createElement('button');
  ownNumbersBtn.type = 'button';
  ownNumbersBtn.className = 'action-btn action-btn--secondary';
  ownNumbersBtn.textContent = 'Введу свои цифры';
  ownNumbersBtn.setAttribute('aria-pressed', String(customEntry && presetIds.length === 0));
  ownNumbersBtn.addEventListener('click', enterManualMode);

  const presetStep = document.createElement('div');
  presetStep.className = 'step-panel';
  presetStep.append(checklistCaption, presetsGrid, ownNumbersBtn);
  const operationsStep = document.createElement('div');
  operationsStep.className = 'step-panel';
  const minutesStep = document.createElement('div');
  minutesStep.className = 'step-panel';
  const shareStep = document.createElement('div');
  shareStep.className = 'step-panel';
  breakdownHosts = [0, 1, 2].map(() => {
    const host = document.createElement('div');
    host.className = 'routine-breakdown';
    host.hidden = true;
    return host;
  });
  operationsStep.append(breakdownHosts[0]!, operationsGroup);
  minutesStep.append(breakdownHosts[1]!, minutesGroup);
  shareStep.append(breakdownHosts[2]!, shareGroup, rateGroup);

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
  copyBtn.textContent = 'Скопировать в Threads';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Запомнить «До»';
  const earlyReportBtn = document.createElement('button');
  earlyReportBtn.type = 'button';
  earlyReportBtn.className = 'early-report-link';
  earlyReportBtn.textContent = 'или посмотреть итоги сейчас';
  actions.append(copyBtn, saveBtn);

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

  resultCard.append(createResultBanner(), eyebrow, valueEl, noteEl, metrics, diffBox, actions, toast, how);
  panel.append(inputCard);
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
    const visibleError = (raw: string, message: string | undefined): string | undefined =>
      raw.trim() === '' ? undefined : message;
    showError(
      operationsError,
      operationsInput,
      visibleError(operationsRaw, validated.errors.operationsPerWeek),
    );
    showError(
      minutesError,
      minutesInput,
      visibleError(minutesRaw, validated.errors.minutesPerOperation),
    );
    showError(rateError, rateInput, visibleError(rateRaw, validated.errors.hourlyRate));
    showError(
      shareError,
      shareInput,
      visibleError(shareRaw, validated.errors.automationSharePercent),
    );
    const usingPresets = presetIds.length > 0 && !customEntry;
    const rateBroken = Boolean(validated.errors.hourlyRate) && rateRaw.trim() !== '';
    if (usingPresets) {
      lastErrors = rateBroken && validated.errors.hourlyRate ? { hourlyRate: validated.errors.hourlyRate } : {};
      showError(operationsError, operationsInput, undefined);
      showError(minutesError, minutesInput, undefined);
      showError(shareError, shareInput, undefined);
    } else {
      lastErrors = validated.errors;
    }

    if ((!usingPresets && (!validated.isValid || !validated.input)) || (usingPresets && rateBroken)) {
      latest = null;
      valueEl.textContent = 'Проверьте поля';
      noteEl.textContent = 'Расчёт появится, когда числа будут в допустимых границах.';
      metrics.replaceChildren();
      howBody.replaceChildren();
      paintPresets();
      refreshSteps();
      return;
    }

    const hourlyRate = rateRaw.trim() === '' ? null : Number(rateRaw);
    const lines = usingPresets
      ? presetIds.map((id) => ({
          ...presetLine(id),
          hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
        }))
      : null;
    const result = lines ? aggregateRoutine(lines) : calculateRoutine(validated.input!);
    latest = result;
    const presetTitle = lines
      ? lines.map((line) => getRoutinePresetById(line.presetId).title).join(', ')
      : null;
    const shareText = lines
      ? `${lines
          .map(
            (line) =>
              `${String(line.automationSharePercent)}% у ${getRoutinePresetById(line.presetId).title}`,
          )
          .join(', ')}, вместе ${String(weightedAutomationShare(lines)).replace('.', ',')}%`
      : null;
    valueEl.textContent = formatWorkHours(result.hoursPerMonth);
    noteEl.textContent = presetTitle
      ? `«${presetTitle}». Это ${formatWorkDays(result.workDaysPerYear)} в год.${shareText ? ` ${shareText}.` : ''}`
      : `Свои цифры. Это ${formatWorkDays(result.workDaysPerYear)} в год.`;

    const money =
      result.savedMoneyPerMonth === null
        ? EMPTY_RATE_HINT
        : `${formatRubles(result.savedMoneyPerMonth)}/мес`;
    metrics.replaceChildren(
      metric('Можно вернуть', `${formatWorkHours(result.savedHoursPerMonth)}/мес`),
      metric('Рабочих дней экономии в год', formatWorkDays(result.savedWorkDaysPerYear)),
      metric('Экономия', money),
    );

    const steps = [
      `Часы в месяц = ${operationsRaw} × ${minutesRaw} мин × 4,33 ÷ 60 = ${formatWorkHours(result.hoursPerMonth)}.`,
      `Рабочие дни в год = часы × 12 ÷ 8 = ${formatWorkDays(result.workDaysPerYear)}.`,
      shareText
        ? `Доля: ${shareText}. Экономия часов = ${formatWorkHours(result.savedHoursPerMonth)}.`
        : `Экономия часов = часы × ${shareRaw}% = ${formatWorkHours(result.savedHoursPerMonth)}.`,
      result.savedMoneyPerMonth === null
        ? EMPTY_RATE_HINT
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
    paintNicheNotes();
    paintPresets();
    refreshSteps();
  }

  function onManualEdit(): void {
    if (operationsInput.readOnly) return;
    customEntry = true;
    presetIds = [];
    paintPresets();
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
      showStatusToast(toast, 'Сначала исправьте поля — копировать пока нечего.');
      return;
    }
    const text = buildRoutineShareText({
      presetTitle:
        presetIds.length > 0
          ? presetIds.map((id) => getRoutinePresetById(id).title).join(', ')
          : null,
      result: latest,
    });
    const copied = await copyTextToClipboard(text, 'резюме рутины для Threads');
    showStatusToast(toast, copied.ok ? 'Скопировано резюме для Threads' : copied.message);
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
    showStatusToast(
      toast,
      savedScenario.persisted
        ? `Сохранено локально («До»: ${formatted}).`
        : `Сохранено на время сессии («До»: ${formatted}).`,
    );
  });

  function persistRoutineDraft(step: number): void {
    dossier.update((current) => ({
      ...current,
      routineDraft: {
        step,
        presetId: presetIds.length === 1 ? presetIds[0]! : null,
        presetIds: [...presetIds],
        customEntry,
        operationsPerWeek: operationsRaw,
        minutesPerOperation: minutesRaw,
        automationSharePercent: shareRaw,
        hourlyRate: rateRaw,
      },
    }));
  }

  function finishRoutine(): void {
    recalculate();
    const validated = validateRoutineDraft({
      operationsPerWeekRaw: operationsRaw,
      minutesPerOperationRaw: minutesRaw,
      automationSharePercentRaw: shareRaw,
      hourlyRateRaw: rateRaw,
    });
    const usingPresets = presetIds.length > 0 && !customEntry;
    if (!usingPresets && (!validated.isValid || !validated.input)) return;
    if (!latest) return;
    const hourlyRate = rateRaw.trim() === '' ? null : Number(rateRaw);
    const items = usingPresets
      ? presetIds.map((id) => {
          const line = presetLine(id);
          return {
            presetId: line.presetId,
            operationsPerWeek: line.operationsPerWeek,
            minutesPerOperation: line.minutesPerOperation,
            automationSharePercent: line.automationSharePercent,
          };
        })
      : [
          {
            presetId: null,
            operationsPerWeek: validated.input!.operationsPerWeek,
            minutesPerOperation: validated.input!.minutesPerOperation,
            automationSharePercent: validated.input!.automationSharePercent,
          },
        ];
    const first = items[0]!;
    const snapshot = bridge.saveRoutineResult({
      inputs: {
        presetId: items.length === 1 ? first.presetId : null,
        operationsPerWeek: first.operationsPerWeek,
        minutesPerOperation: first.minutesPerOperation,
        hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
        automationSharePercent: usingPresets
          ? weightedAutomationShare(items.map((item) => ({ ...item, hourlyRate: null })))
          : first.automationSharePercent,
        items,
      },
      results: latest,
    });
    dossier.update((current) =>
      recordMetricSnapshot({ ...current, routine: snapshot }, Date.now()),
    );
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  }

  lastErrors = validateRoutineDraft({
    operationsPerWeekRaw: operationsRaw,
    minutesPerOperationRaw: minutesRaw,
    automationSharePercentRaw: shareRaw,
    hourlyRateRaw: rateRaw,
  }).errors;

  let refreshSteps = (): void => {};
  const wizard = createWizard({
    toolId: 'routine-calc',
    initialStep: openedStep,
    panels: [presetStep, operationsStep, minutesStep, shareStep],
    extras: [resultCard],
    isStepValid: (step) =>
      step === 1
        ? isRoutineStartChosen(presetIds.length > 0, customEntry)
        : isRoutineStepValid(step, lastErrors),
    finishLabel: meta.nextToolCta,
    onStep: (step) => {
      onWizardStep(step);
      persistRoutineDraft(step);
      if (step === 4 && !latest) resultCard.hidden = true;
    },
    onFinish: finishRoutine,
  });
  function nicheNote(): HTMLParagraphElement {
    const note = document.createElement('p');
    note.className = 'field-note';
    note.hidden = true;
    return note;
  }

  interface RoutineUndo {
    readonly operations: string;
    readonly minutes: string;
    readonly customEntry: boolean;
    readonly presetIds: readonly RoutinePresetId[];
    readonly niche: BusinessNicheId | null;
  }
  let routineUndo: RoutineUndo | null = null;
  let refreshNicheMenu = (): void => {};

  function paintNicheNotes(): void {
    const preset = nicheById(dossier.read().niche);
    nicheStrip.hidden = preset === null;
    nicheStrip.textContent = preset ? `Ниша: ${preset.title}` : '';
    const rows: readonly [HTMLParagraphElement, string, number | undefined][] = [
      [operationsNote, operationsRaw, preset?.operationsPerWeek],
      [minutesNote, minutesRaw, preset?.minutesPerOperation],
    ];
    for (const [note, raw, value] of rows) {
      const show = value !== undefined && nicheCaptionVisible(raw, value);
      note.hidden = !show;
      note.textContent = show ? NICHE_CAPTION : '';
    }
    refreshNicheMenu();
  }

  function applyRoutineNiche(preset: BusinessNichePreset): void {
    routineUndo = {
      operations: operationsRaw,
      minutes: minutesRaw,
      customEntry,
      presetIds: [...presetIds],
      niche: dossier.read().niche,
    };
    presetIds = [...preset.routinePresetIds];
    customEntry = false;
    paintPresets();
    dossier.update((current) => ({ ...current, niche: preset.id }));
    recalculate();
    persistRoutineDraft(wizard.currentStep());
  }

  refreshSteps = () => wizard.refresh();
  const nicheMenu = mountNicheMenu({
    dossier,
    prompt: nichePromptKind([operationsRaw, minutesRaw]),
    readFields: (preset) => routineNicheFields({ presetIds }, preset),
    applyNumbers: applyRoutineNiche,
    applyLabel: (id) => {
      dossier.update((current) => ({ ...current, niche: id }));
      paintNicheNotes();
    },
    undo: () => {
      if (!routineUndo) return;
      const previous = routineUndo;
      routineUndo = null;
      operationsRaw = previous.operations;
      minutesRaw = previous.minutes;
      customEntry = previous.customEntry;
      operationsInput.value = operationsRaw;
      minutesInput.value = minutesRaw;
      presetIds = [...previous.presetIds];
      paintPresets();
      dossier.update((current) => ({ ...current, niche: previous.niche }));
      recalculate();
      persistRoutineDraft(wizard.currentStep());
    },
    hasUndo: () => routineUndo !== null,
  });
  refreshNicheMenu = () => nicheMenu.refresh();
  presetStep.prepend(nicheMenu.element);
  inputCard.append(
    wizard.progress,
    presetStep,
    operationsStep,
    minutesStep,
    shareStep,
    resultCard,
    wizard.nav,
    earlyReportBtn,
  );

  earlyReportBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
