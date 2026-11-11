import { createFieldHeading } from '../../components/field-heading';
import { mountNicheMenu } from '../../components/niche-menu';
import { createResultBanner } from '../../components/result-banner';
import { appendPriorContext } from '../../components/prior-context';
import { releaseHelpTipsWithin } from '../../components/tooltip';
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
import { isRoutineStartChosen, isRoutineStepValid, migrateRoutineStep, resolveInitialStep } from '../../lib/wizard';
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
import {
  EMPTY_RATE_HINT,
  SHARE_INPUT_STEP,
  collapsePresetsToManual,
  initialRoutinePresetIds,
  manualSwitchClass,
  nicheRoutineMatch,
  routineDetailModel,
  routineStepModel,
  shareFieldError,
} from './steps';

const OPERATIONS_NOTE = 'Один звонок, сообщение или запись — одна операция.';
const MINUTES_NOTE = 'Обычное время одного раза, не самый долгий случай.';
const SHARE_NOTE = '0% — всё руками, 100% — операция уходит целиком.';
const RATE_NOTE = 'Пустое поле оставляет расчёт в часах, без рублей.';

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

  let presetIds: RoutinePresetId[] = initialRoutinePresetIds({
    draft,
    saved,
    niche: dossier.read().niche,
  });
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
  const nichePresetsActive = (): boolean =>
    nicheRoutineMatch(
      nicheById(dossier.read().niche)?.routinePresetIds ?? null,
      presetIds,
      customEntry,
    );
  const lineEdits = new Map<RoutinePresetId, { operations: string; minutes: string }>();
  for (const line of draft?.lines ?? []) {
    lineEdits.set(line.presetId, {
      operations: line.operationsPerWeek,
      minutes: line.minutesPerOperation,
    });
  }
  const openedStep = resolveInitialStep(
    2,
    initialStep === null ? null : migrateRoutineStep(initialStep),
    draft?.step ?? null,
  );

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
  let cardsHost: HTMLDivElement | null = null;
  let tableHost: HTMLDivElement | null = null;
  let tableError: HTMLParagraphElement | null = null;
  let tableSignature = '';

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

  function detailKind(): 'niche' | 'table' | 'custom' {
    if (nichePresetsActive()) return 'niche';
    if (presetIds.length > 0 && !customEntry) return 'table';
    return 'custom';
  }

  function lineOf(id: RoutinePresetId): { operations: string; minutes: string } {
    const edited = lineEdits.get(id);
    if (edited) return edited;
    const preset = getRoutinePresetById(id);
    const seeded = {
      operations: String(preset.operationsPerWeek),
      minutes: String(preset.minutesPerOperation),
    };
    lineEdits.set(id, seeded);
    return seeded;
  }

  function readTableInputs(): void {
    if (!tableHost || detailKind() !== 'table') return;
    for (const id of presetIds) {
      const ops = tableHost.querySelector(`[data-routine-ops="${id}"]`);
      const mins = tableHost.querySelector(`[data-routine-min="${id}"]`);
      if (ops instanceof HTMLInputElement && mins instanceof HTMLInputElement) {
        lineEdits.set(id, { operations: ops.value, minutes: mins.value });
      }
    }
  }

  function paintPresets(): void {
    for (const [id, button] of presetButtons) {
      button.setAttribute('aria-pressed', String(!customEntry && presetIds.includes(id)));
    }
    const matched = nichePresetsActive();
    ownNumbersBtn?.setAttribute('aria-pressed', String(customEntry && presetIds.length === 0));
    if (ownNumbersBtn) ownNumbersBtn.hidden = matched;
    const lines: Record<string, { operations: string; minutes: string }> = {};
    for (const id of presetIds) lines[id] = lineOf(id);
    const detail = routineDetailModel({
      nicheMatch: matched,
      customEntry,
      presetIds,
      operations: operationsRaw,
      minutes: minutesRaw,
      lines,
    });
    const nicheModel = routineStepModel({
      presetIds,
      customEntry: false,
      operations: '',
      minutes: '',
      share: '',
      allowManualSwitch: false,
    });
    if (cardsHost) {
      if (detail.kind === 'niche') paintBreakdownHost(cardsHost, nicheModel);
      else {
        cardsHost.replaceChildren();
        cardsHost.hidden = true;
      }
    }
    operationsGroup.hidden = detail.kind !== 'custom';
    minutesGroup.hidden = detail.kind !== 'custom';
    shareGroup.hidden = !detail.shareVisible;
    paintTable(detail.kind);
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
      if (!nichePresetsActive() && shareRaw.trim() === '' && presetIds.length > 0) {
        shareRaw = String(weightedAutomationShare(presetIds.map(presetLine)));
        shareInput.value = shareRaw;
        shareSlider.value = shareRaw;
      }
      paintPresets();
      recalculate();
    });
    presetButtons.set(preset.id, button);
    const wrap = document.createElement('div');
    wrap.className = 'preset-card-wrap';
    wrap.append(button);
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
    createFieldHeading('rc-ops-input', 'Операций в неделю', 'раз/нед', OPERATIONS_NOTE),
    operationsInput,
    operationsNote,
    operationsError,
  );

  const minutesGroup = document.createElement('div');
  minutesGroup.className = 'field-group';
  const minutesNote = nicheNote();
  minutesGroup.append(
    createFieldHeading('rc-minutes-input', 'Минут на операцию', 'мин', MINUTES_NOTE),
    minutesInput,
    minutesNote,
    minutesError,
  );

  const rateGroup = document.createElement('div');
  rateGroup.className = 'field-group';
  rateGroup.append(
    createFieldHeading('rc-rate-input', 'Ставка', '₽/час', RATE_NOTE),
    rateInput,
    rateError,
  );

  const shareGroup = document.createElement('div');
  shareGroup.className = 'field-group';
  shareGroup.append(
    createFieldHeading('rc-share-input', 'Доля автоматизации', '0–100%', SHARE_NOTE),
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
      model.totalHours === null ? '' : `Итого ${formatWorkHours(model.totalHours)} в месяц`;
    host.append(total);
    if (model.manualSwitch) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = manualSwitchClass(model.cards.length);
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
  presetStep.append(presetsGrid, ownNumbersBtn);
  cardsHost = document.createElement('div');
  cardsHost.className = 'routine-breakdown';
  cardsHost.hidden = true;
  tableHost = document.createElement('div');
  tableHost.className = 'routine-table-wrap';
  tableHost.hidden = true;
  tableError = document.createElement('p');
  tableError.className = 'field-error';
  tableError.hidden = true;
  const detailStep = document.createElement('div');
  detailStep.className = 'step-panel';
  detailStep.append(cardsHost, tableHost, tableError, operationsGroup, minutesGroup, shareGroup, rateGroup);

  function paintTable(kind: 'niche' | 'table' | 'custom'): void {
    if (!tableHost) return;
    tableHost.hidden = kind !== 'table';
    const signature = `${kind}:${presetIds.join(',')}`;
    if (signature === tableSignature) return;
    tableSignature = signature;
    tableHost.replaceChildren();
    if (kind !== 'table') return;
    const table = document.createElement('div');
    table.className = 'routine-table';
    table.setAttribute('role', 'table');
    const head = document.createElement('div');
    head.className = 'routine-table__row routine-table__head';
    head.setAttribute('role', 'row');
    for (const label of ['Рутина', 'Операций в неделю', 'Минут на операцию']) {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'columnheader');
      cell.textContent = label;
      head.append(cell);
    }
    table.append(head);
    for (const id of presetIds) {
      const preset = getRoutinePresetById(id);
      const values = lineOf(id);
      const row = document.createElement('div');
      row.className = 'routine-table__row';
      row.setAttribute('role', 'row');
      const name = document.createElement('span');
      name.className = 'routine-table__name';
      name.textContent = preset.title;
      const ops = document.createElement('input');
      ops.className = 'field-input';
      ops.type = 'number';
      ops.inputMode = 'decimal';
      ops.min = '0';
      ops.max = '10000';
      ops.step = '1';
      ops.value = values.operations;
      ops.dataset.routineOps = id;
      ops.setAttribute('aria-label', `${preset.title}: операций в неделю`);
      const mins = document.createElement('input');
      mins.className = 'field-input';
      mins.type = 'number';
      mins.inputMode = 'decimal';
      mins.min = '0';
      mins.max = '480';
      mins.step = '1';
      mins.value = values.minutes;
      mins.dataset.routineMin = id;
      mins.setAttribute('aria-label', `${preset.title}: минут на операцию`);
      const remember = (): void => {
        lineEdits.set(id, { operations: ops.value, minutes: mins.value });
        recalculate();
      };
      ops.addEventListener('input', remember);
      mins.addEventListener('input', remember);
      row.append(name, ops, mins);
      table.append(row);
    }
    tableHost.append(table);
  }

  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = '<span>ЧАСЫ НА РУТИНЕ В МЕСЯЦ</span>';
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
  copyBtn.textContent = 'Текст для поста в Threads';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Сохранить как «до» — сравним через месяц';
  const earlyReportBtn = document.createElement('button');
  earlyReportBtn.type = 'button';
  earlyReportBtn.className = 'early-report-link';
  earlyReportBtn.textContent = 'Сразу к итогам →';
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

  function metric(label: string, value: string, variant = ''): HTMLElement {
    const box = document.createElement('div');
    box.className = variant === '' ? 'metric-box' : `metric-box ${variant}`;
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
    readTableInputs();
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
    const kind = detailKind();
    showError(
      shareError,
      shareInput,
      shareFieldError(kind, validated.errors.automationSharePercent),
    );
    const rateBroken = Boolean(validated.errors.hourlyRate) && rateRaw.trim() !== '';
    const shareBroken = Boolean(validated.errors.automationSharePercent) && shareRaw.trim() !== '';
    let tableBroken = false;
    if (kind === 'niche') {
      lastErrors = rateBroken && validated.errors.hourlyRate ? { hourlyRate: validated.errors.hourlyRate } : {};
      showError(operationsError, operationsInput, undefined);
      showError(minutesError, minutesInput, undefined);
      if (tableError) {
        tableError.hidden = true;
        tableError.textContent = '';
      }
    } else if (kind === 'table') {
      let operationsMessage: string | undefined;
      let minutesMessage: string | undefined;
      for (const id of presetIds) {
        const raw = lineOf(id);
        const row = validateRoutineDraft({
          operationsPerWeekRaw: raw.operations,
          minutesPerOperationRaw: raw.minutes,
          automationSharePercentRaw: shareRaw,
          hourlyRateRaw: rateRaw,
        });
        const opsInput = tableHost?.querySelector(`[data-routine-ops="${id}"]`);
        const minsInput = tableHost?.querySelector(`[data-routine-min="${id}"]`);
        if (opsInput instanceof HTMLInputElement) {
          opsInput.classList.toggle('field-input--invalid', Boolean(row.errors.operationsPerWeek));
        }
        if (minsInput instanceof HTMLInputElement) {
          minsInput.classList.toggle('field-input--invalid', Boolean(row.errors.minutesPerOperation));
        }
        if (!row.isValid || !row.input) tableBroken = true;
        operationsMessage ??= row.errors.operationsPerWeek;
        minutesMessage ??= row.errors.minutesPerOperation;
      }
      lastErrors = {
        ...(operationsMessage ? { operationsPerWeek: operationsMessage } : {}),
        ...(minutesMessage ? { minutesPerOperation: minutesMessage } : {}),
        ...(validated.errors.automationSharePercent
          ? { automationSharePercent: validated.errors.automationSharePercent }
          : {}),
        ...(validated.errors.hourlyRate ? { hourlyRate: validated.errors.hourlyRate } : {}),
      };
      showError(operationsError, operationsInput, undefined);
      showError(minutesError, minutesInput, undefined);
      if (tableError) {
        const message = operationsMessage ?? minutesMessage;
        tableError.hidden = !message;
        tableError.textContent = message ?? '';
      }
    } else {
      lastErrors = validated.errors;
      if (tableError) {
        tableError.hidden = true;
        tableError.textContent = '';
      }
    }

    const blocked =
      kind === 'niche'
        ? rateBroken
        : kind === 'table'
          ? tableBroken || shareBroken || rateBroken
          : !validated.isValid || !validated.input;
    if (blocked) {
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
    const lines =
      kind === 'custom'
        ? null
        : presetIds.map((id) => {
            if (kind === 'niche') {
              return {
                ...presetLine(id),
                hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
              };
            }
            const raw = lineOf(id);
            const row = validateRoutineDraft({
              operationsPerWeekRaw: raw.operations,
              minutesPerOperationRaw: raw.minutes,
              automationSharePercentRaw: shareRaw,
              hourlyRateRaw: rateRaw,
            }).input!;
            return {
              presetId: id,
              operationsPerWeek: row.operationsPerWeek,
              minutesPerOperation: row.minutesPerOperation,
              automationSharePercent: row.automationSharePercent,
              hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : null,
            };
          });
    const result = lines ? aggregateRoutine(lines) : calculateRoutine(validated.input!);
    latest = result;
    const presetTitle = lines
      ? lines.map((line) => getRoutinePresetById(line.presetId).title).join(', ')
      : null;
    const shareText = lines
      ? `${lines
          .map((line, index) => {
            const title = getRoutinePresetById(line.presetId).title;
            const cased = index === 0 ? title : `${title.charAt(0).toLowerCase()}${title.slice(1)}`;
            return `${cased} — ${String(line.automationSharePercent)}%`;
          })
          .join(', ')}, в среднем ${String(Math.round(weightedAutomationShare(lines)))}%`
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
      metric('Экономия в год', formatWorkDays(result.savedWorkDaysPerYear), 'metric-box--year-days'),
      metric('Экономия', money),
    );

    const steps = [
      kind === 'custom'
        ? `Часы в месяц = ${operationsRaw} × ${minutesRaw} мин × 4,33 ÷ 60 = ${formatWorkHours(result.hoursPerMonth)}.`
        : `Часы в месяц = ${formatWorkHours(result.hoursPerMonth)}.`,
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
    persistRoutineDraft(wizard.currentStep());
  });
  shareInput.addEventListener('input', () => {
    shareSlider.value = shareInput.value;
    shareRaw = shareInput.value;
    if (detailKind() === 'custom') onManualEdit();
    else recalculate();
  });
  shareSlider.addEventListener('input', () => {
    shareInput.value = shareSlider.value;
    shareRaw = shareInput.value;
    if (detailKind() === 'custom') onManualEdit();
    else recalculate();
  });
  for (const field of [operationsInput, minutesInput, rateInput, shareInput, shareSlider]) {
    field.addEventListener('change', () => {
      if (field === shareSlider) shareInput.value = shareSlider.value;
      if (field === shareInput) shareSlider.value = shareInput.value;
      rateRaw = rateInput.value;
      recalculate();
      persistRoutineDraft(wizard.currentStep());
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
        ...(presetIds.length > 0
          ? {
              lines: presetIds.map((id) => {
                const line = lineOf(id);
                return {
                  presetId: id,
                  operationsPerWeek: line.operations,
                  minutesPerOperation: line.minutes,
                };
              }),
            }
          : {}),
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
    const kind = detailKind();
    if (kind === 'custom' && (!validated.isValid || !validated.input)) return;
    if (!latest) return;
    const hourlyRate = rateRaw.trim() === '' ? null : Number(rateRaw);
    const items =
      kind === 'niche'
        ? presetIds.map((id) => {
            const line = presetLine(id);
            return {
              presetId: line.presetId,
              operationsPerWeek: line.operationsPerWeek,
              minutesPerOperation: line.minutesPerOperation,
              automationSharePercent: line.automationSharePercent,
            };
          })
        : kind === 'table'
          ? presetIds.map((id) => {
              const raw = lineOf(id);
              const row = validateRoutineDraft({
                operationsPerWeekRaw: raw.operations,
                minutesPerOperationRaw: raw.minutes,
                automationSharePercentRaw: shareRaw,
                hourlyRateRaw: rateRaw,
              }).input!;
              return {
                presetId: id,
                operationsPerWeek: row.operationsPerWeek,
                minutesPerOperation: row.minutesPerOperation,
                automationSharePercent: row.automationSharePercent,
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
    const usingPresets = kind !== 'custom';
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
    initialHoldFields: saved === null,
    panels: [presetStep, detailStep],
    extras: [resultCard],
    isStepValid: (step) =>
      step === 1
        ? isRoutineStartChosen(presetIds.length > 0, customEntry)
        : isRoutineStepValid(step, lastErrors, nichePresetsActive()),
    finishLabel: meta.nextToolCta,
    onStep: (step) => {
      onWizardStep(step);
      persistRoutineDraft(step);
      if (step === 2 && !latest) resultCard.hidden = true;
    },
    onFinish: finishRoutine,
    onRecalculate: recalculate,
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
      if (id === null) customEntry = false;
      paintPresets();
      recalculate();
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
  inputCard.append(wizard.progress, presetStep, detailStep, resultCard, wizard.nav, earlyReportBtn);

  earlyReportBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
