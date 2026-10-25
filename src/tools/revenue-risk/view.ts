import { createResultBanner } from '../../components/result-banner';
import { createHelpTip, releaseHelpTipsWithin, setHelpTipText } from '../../components/tooltip';
import { createWizard } from '../../components/wizard';
import { showStatusToast } from '../../components/toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import type { RevenueRiskFieldErrors } from './calc';
import { isRevenueStepValid, resolveInitialStep } from '../../lib/wizard';
import {
  formatCountWithNoun,
  formatIntegerGrouping,
  formatPercent,
  formatRubles,
  normalizeFiniteNumber,
} from '../../lib/format';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  type ConversionInputMode,
  MARKET_AVERAGE_BADGE_DISCLAIMER,
  MARKET_AVERAGE_RESULT_DISCLAIMER,
  NICHE_PRESETS,
  type NichePresetId,
  REVENUE_RISK_DEFAULTS,
  calculateRevenueRisk,
  getNichePresetById,
  lossFactorFromRecoveryPercent,
  recoveryPercentFromLossFactor,
  validateRevenueRiskDraft,
} from './calc';

const HELP = {
  leads:
    'Сколько раз за месяц вам пишут или звонят. Сообщение, звонок и заявка здесь считаются одним обращением.\n\nЧем больше обращений, тем выше возможные потери, если отвечать поздно.',
  late:
    'Доля обращений, на которые ответили поздно или не ответили. Порог опоздания задаёте вы: для кого-то это 15 минут, для кого-то час.',
  customMode:
    'Доля обращений, которые становятся покупкой, когда вы отвечаете вовремя.\n\nЕсли своей цифры нет, откройте «Сценарное допущение». Там круглые сценарии, не статистика.',
  presetMode:
    'Условный сценарий для типа бизнеса. Это не статистика по России и не ваши цифры.\n\nСвою конверсию можно поставить в режиме «Моя конверсия».',
  preset:
    'Подставляет условную конверсию и долю возврата для этого сценария. Цифры можно сразу поправить.',
  loss:
    'Какую часть выручки из зоны риска вы считаете возвратной, если отвечать сразу. 70% значит: из 10 таких продаж рассчитываете вернуть 7. Это ваше допущение.',
  check:
    'Средняя сумма одной покупки. Если чек скачет, возьмите самый частый.',
} as const;

function fieldHeading(
  inputId: string,
  title: string,
  unit: string,
  helpText: string,
  avoid: () => HTMLElement | null,
  unitId?: string,
): { readonly row: HTMLDivElement; readonly tip: HTMLButtonElement } {
  const row = document.createElement('div');
  row.className = 'field-label';

  const label = document.createElement('label');
  label.className = 'field-label__text';
  label.htmlFor = inputId;
  label.textContent = title;

  const tip = createHelpTip(helpText, { avoid });

  const unitEl = document.createElement('span');
  unitEl.className = 'field-unit';
  unitEl.textContent = unit;
  if (unitId) unitEl.id = unitId;

  row.append(label, tip, unitEl);
  return { row, tip };
}

function withHelp(
  control: HTMLElement,
  text: string,
  wrapClass: string,
  avoid: () => HTMLElement | null,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = wrapClass;
  wrap.append(control, createHelpTip(text, { avoid }));
  return wrap;
}

const TRACKING_ITEMS: readonly string[] = [
  'Время первого ответа по каждому обращению',
  'Конверсию из обращения в оплату по каналам',
  'Причины потери клиента (поздний ответ, не ответили, ушёл к конкуренту)',
] as const;

export function buildRevenueRiskShareText(params: {
  readonly leadsPerMonth: number;
  readonly lateSharePercent: number;
  readonly conversionPercent: number;
  readonly avgCheck: number;
  readonly lossFactorPercent: number;
  readonly mode: ConversionInputMode;
  readonly presetTitle?: string;
  readonly lateLeads: number;
  readonly revenueAtRiskMax: number;
  readonly revenueAtRiskPerYear: number;
  readonly recoverableRevenue: number;
  readonly costPerMissedDialog: number;
}): string {
  const modeNote =
    params.mode === 'preset' && params.presetTitle
      ? `сценарий «${params.presetTitle}»`
      : 'мои данные';

  return [
    'Калькулятор выручки под риском',
    '',
    'Входные данные:',
    `• Обращений в месяц: ${formatIntegerGrouping(params.leadsPerMonth)}`,
    `• Доля поздних или пропущенных ответов: ${formatPercent(params.lateSharePercent, { decimals: 1 })}`,
    `• Конверсия в покупку: ${formatPercent(params.conversionPercent, { decimals: 1 })} (${modeNote})`,
    `• Доля возврата быстрым ответом: ${formatPercent(100 - params.lossFactorPercent, { decimals: 0 })}`,
    `• Средний чек: ${formatRubles(params.avgCheck)}`,
    '',
    'Результаты:',
    `• Потенциал возврата: ${formatRubles(params.recoverableRevenue)}/мес`,
    `• Выручка под риском в месяц: ${formatRubles(params.revenueAtRiskMax)}`,
    `• Поздних обращений: ${formatCountWithNoun(Math.round(params.lateLeads), ['обращение', 'обращения', 'обращений'])}/мес`,
    `• Выручка под риском в год: ${formatRubles(params.revenueAtRiskPerYear)}`,
    `• Один вовремя отвеченный диалог может принести ${formatRubles(params.costPerMissedDialog)}`,
    '',
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/#revenue-risk',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

export function renderRevenueRiskTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['revenue-risk'];
  const { bridge, store, dossier, onNavigateTool, onWizardStep, initialStep } = ctx;
  const incomingHandoff = bridge.consume('revenue-risk');
  const saved = bridge.getRevenueRiskResult();
  const draft = dossier.read().revenueDraft;
  const savedPreset = draft?.presetId ?? saved?.inputs.presetId;
  const restoredPreset: NichePresetId =
    savedPreset === 'beauty-local' ||
    savedPreset === 'ecommerce' ||
    savedPreset === 'experts-edu' ||
    savedPreset === 'b2b-services'
      ? savedPreset
      : REVENUE_RISK_DEFAULTS.presetId;

  let mode: ConversionInputMode = draft?.mode ?? saved?.inputs.mode ?? 'custom';
  let selectedPresetId: NichePresetId = restoredPreset;

  let leadsRaw =
    draft?.leadsPerMonth ??
    (saved
      ? String(saved.inputs.leadsPerMonth)
      : incomingHandoff
        ? String(Math.max(1, Math.round(incomingHandoff.suggestedValue)))
        : '');
  let lateShareRaw =
    draft?.lateSharePercent ?? (saved ? String(saved.inputs.lateSharePercent) : '');
  let customConversionRaw =
    draft?.conversionPercent ??
    (saved && saved.inputs.mode === 'custom' ? String(saved.inputs.conversionPercent) : '');
  const storedLossPercent =
    draft?.lossFactorPercent ??
    (saved ? String(Math.round(saved.inputs.lossFactor * 100)) : '');
  let customRecoveryRaw =
    storedLossPercent.trim() === '' || !Number.isFinite(Number(storedLossPercent))
      ? ''
      : String(recoveryPercentFromLossFactor(Number(storedLossPercent) / 100));
  let recoveryRaw = customRecoveryRaw;
  let avgCheckRaw = draft?.avgCheck ?? (saved ? String(saved.inputs.avgCheck) : '');
  let lastErrors: RevenueRiskFieldErrors = {};
  const openedStep = resolveInitialStep(4, initialStep, draft?.step ?? null);

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-revenue-risk');

  // --- 1. INPUT CARD ---
  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card__header';

  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.hidden = true;

  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-revenue-risk';
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
    handoffBanner.textContent = `С прошлого шага: ${incomingHandoff.label}. ${incomingHandoff.note}.`;
    inputCard.appendChild(handoffBanner);
  }

  // Field 1: Leads per month
  const leadsGroup = document.createElement('div');
  leadsGroup.className = 'field-group';

  const leadsInput = document.createElement('input');
  leadsInput.className = 'field-input';
  leadsInput.id = 'rr-leads-input';
  leadsInput.type = 'number';
  leadsInput.inputMode = 'numeric';
  leadsInput.min = '0';
  leadsInput.max = '1000000';
  leadsInput.step = '10';
  leadsInput.value = leadsRaw;

  const leadsHeading = fieldHeading(
    'rr-leads-input',
    'Количество обращений в месяц',
    'обращений/мес',
    HELP.leads,
    () => leadsInput,
  );

  const leadsError = document.createElement('p');
  leadsError.className = 'field-error';
  leadsError.id = 'rr-leads-error';
  leadsError.hidden = true;

  leadsGroup.append(leadsHeading.row, leadsInput, leadsError);

  // Field 2: Late / missed share (slider 0-100% + numeric input)
  const lateGroup = document.createElement('div');
  lateGroup.className = 'field-group';

  const lateSliderRow = document.createElement('div');
  lateSliderRow.className = 'slider-row';

  const lateSlider = document.createElement('input');
  lateSlider.className = 'field-slider';
  lateSlider.id = 'rr-late-slider';
  lateSlider.type = 'range';
  lateSlider.min = '0';
  lateSlider.max = '100';
  lateSlider.step = '1';
  lateSlider.value = lateShareRaw === '' ? '0' : lateShareRaw;
  if (lateShareRaw.trim() === '') lateSlider.setAttribute('aria-valuetext', 'Не задано');
  lateSlider.setAttribute(
    'aria-label',
    'Ползунок доли поздних или пропущенных ответов в процентах',
  );

  const lateInput = document.createElement('input');
  lateInput.className = 'field-input';
  lateInput.id = 'rr-late-input';
  lateInput.type = 'number';
  lateInput.inputMode = 'decimal';
  lateInput.min = '0';
  lateInput.max = '100';
  lateInput.step = '1';
  lateInput.value = lateShareRaw;

  lateSliderRow.append(lateSlider, lateInput);

  const lateHeading = fieldHeading(
    'rr-late-input',
    'Доля поздних или пропущенных ответов',
    '0–100%',
    HELP.late,
    () => lateSliderRow,
  );

  const lateError = document.createElement('p');
  lateError.className = 'field-error';
  lateError.id = 'rr-late-error';
  lateError.hidden = true;

  lateGroup.append(lateHeading.row, lateSliderRow, lateError);

  // Field 3: Conversion Mode Segmented Control + Input / Presets
  const convGroup = document.createElement('div');
  convGroup.className = 'field-group';

  const convHeading = fieldHeading(
    'rr-conv-input',
    'Конверсия из обращения в покупку',
    '1–95%',
    HELP.customMode,
    () => convInput,
    'rr-conv-unit',
  );
  const convLabel = convHeading.row;

  const segmented = document.createElement('div');
  segmented.className = 'segmented-control';
  segmented.setAttribute('role', 'group');
  segmented.setAttribute('aria-label', 'Режим выбора конверсии');

  const modeCustomBtn = document.createElement('button');
  modeCustomBtn.type = 'button';
  modeCustomBtn.className = 'segmented-control__btn';
  modeCustomBtn.id = 'rr-mode-custom';
  modeCustomBtn.textContent = 'Моя конверсия';
  modeCustomBtn.setAttribute('aria-pressed', 'true');

  const modePresetBtn = document.createElement('button');
  modePresetBtn.type = 'button';
  modePresetBtn.className = 'segmented-control__btn';
  modePresetBtn.id = 'rr-mode-preset';
  modePresetBtn.textContent = 'Сценарное допущение';
  modePresetBtn.setAttribute('aria-pressed', 'false');

  segmented.append(
    withHelp(modeCustomBtn, HELP.customMode, 'segmented-control__item', () => modeCustomBtn),
    withHelp(modePresetBtn, HELP.presetMode, 'segmented-control__item', () => modePresetBtn),
  );

  // Presets container (shown when mode === 'preset')
  const presetsWrap = document.createElement('div');
  presetsWrap.className = 'field-group';
  presetsWrap.hidden = true;

  const scenarioNote = document.createElement('aside');
  scenarioNote.className = 'scenario-disclaimer';
  scenarioNote.setAttribute('role', 'note');
  const scenarioLabel = document.createElement('p');
  scenarioLabel.className = 'scenario-disclaimer__label';
  const scenarioIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  scenarioIcon.setAttribute('viewBox', '0 0 24 24');
  scenarioIcon.setAttribute('width', '18');
  scenarioIcon.setAttribute('height', '18');
  scenarioIcon.setAttribute('aria-hidden', 'true');
  scenarioIcon.setAttribute('focusable', 'false');
  const scenarioPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  scenarioPath.setAttribute('fill', 'currentColor');
  scenarioPath.setAttribute(
    'd',
    'M12 3.2 2.4 20.2h19.2L12 3.2zm0 5.3c.5 0 .9.4.9.9v4.6a.9.9 0 0 1-1.8 0V9.4c0-.5.4-.9.9-.9zm0 8.2a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z',
  );
  scenarioIcon.append(scenarioPath);
  scenarioLabel.append(scenarioIcon, document.createTextNode('ДИСКЛЕЙМЕР'));
  const scenarioText = document.createElement('p');
  scenarioText.className = 'scenario-disclaimer__text';
  scenarioText.textContent = MARKET_AVERAGE_BADGE_DISCLAIMER;
  scenarioNote.append(scenarioLabel, scenarioText);

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'presets-grid';

  const presetButtons = new Map<NichePresetId, HTMLButtonElement>();

  for (const preset of NICHE_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-card';
    btn.dataset.presetId = preset.id;
    btn.setAttribute('aria-pressed', String(preset.id === selectedPresetId));

    btn.innerHTML = `
      <span class="preset-card__top">
        <span class="preset-card__title">${preset.title}</span>
        <span class="preset-card__conv">${preset.defaultConversionPercent}%</span>
      </span>
      <span class="preset-card__desc">${preset.description}</span>
      <span class="preset-card__range">возврат ${recoveryPercentFromLossFactor(preset.defaultLossFactor)}%</span>
    `;

    btn.addEventListener('click', () => {
      selectedPresetId = preset.id;
      for (const [id, b] of presetButtons.entries()) {
        b.setAttribute('aria-pressed', String(id === selectedPresetId));
      }
      syncConversionFieldWithMode();
      applyPresetRecovery();
      recalculateAndRender();
    });

    presetButtons.set(preset.id, btn);
    presetsGrid.append(
      withHelp(btn, HELP.preset, 'preset-card-wrap', () => btn),
    );
  }

  presetsWrap.append(scenarioNote, presetsGrid);

  const convInput = document.createElement('input');
  convInput.className = 'field-input';
  convInput.id = 'rr-conv-input';
  convInput.type = 'number';
  convInput.inputMode = 'decimal';
  convInput.min = '1';
  convInput.max = '95';
  convInput.step = '1';
  convInput.value = customConversionRaw;

  const convError = document.createElement('p');
  convError.className = 'field-error';
  convError.id = 'rr-conv-error';
  convError.hidden = true;

  convGroup.append(convLabel, segmented, presetsWrap, convInput, convError);

  // Field: loss share — visible and editable in both conversion modes
  const lossGroup = document.createElement('div');
  lossGroup.className = 'field-group';

  const lossHint = document.createElement('p');
  lossHint.className = 'field-hint';
  lossHint.id = 'rr-loss-hint';
  lossHint.textContent = 'Какую часть денег из зоны риска можно вернуть, если отвечать сразу.';

  const lossSliderRow = document.createElement('div');
  lossSliderRow.className = 'slider-row';

  const lossSlider = document.createElement('input');
  lossSlider.className = 'field-slider';
  lossSlider.id = 'rr-loss-slider';
  lossSlider.type = 'range';
  lossSlider.min = '0';
  lossSlider.max = '100';
  lossSlider.step = '5';
  lossSlider.value = recoveryRaw === '' ? '0' : recoveryRaw;
  lossSlider.setAttribute('aria-describedby', 'rr-loss-hint');
  lossSlider.setAttribute(
    'aria-label',
    'Ползунок доли возврата быстрым ответом в процентах',
  );

  const lossInput = document.createElement('input');
  lossInput.className = 'field-input';
  lossInput.id = 'rr-loss-input';
  lossInput.type = 'number';
  lossInput.inputMode = 'decimal';
  lossInput.min = '0';
  lossInput.max = '100';
  lossInput.step = '1';
  lossInput.value = recoveryRaw;
  lossInput.setAttribute('aria-describedby', 'rr-loss-hint');

  lossSliderRow.append(lossSlider, lossInput);

  const lossHeading = fieldHeading(
    'rr-loss-input',
    'Какую долю этих денег можно вернуть быстрым ответом',
    '0–100%',
    HELP.loss,
    () => lossSliderRow,
  );

  const lossError = document.createElement('p');
  lossError.className = 'field-error';
  lossError.id = 'rr-loss-error';
  lossError.hidden = true;

  lossGroup.append(lossHeading.row, lossHint, lossSliderRow, lossError);

  // Field 4: Average check
  const checkGroup = document.createElement('div');
  checkGroup.className = 'field-group';

  const checkInput = document.createElement('input');
  checkInput.className = 'field-input';
  checkInput.id = 'rr-check-input';
  checkInput.type = 'number';
  checkInput.inputMode = 'numeric';
  checkInput.min = '0';
  checkInput.max = '100000000';
  checkInput.step = '500';
  checkInput.value = avgCheckRaw;

  const checkHeading = fieldHeading(
    'rr-check-input',
    'Средний чек',
    '₽',
    HELP.check,
    () => checkInput,
  );

  const checkError = document.createElement('p');
  checkError.className = 'field-error';
  checkError.id = 'rr-check-error';
  checkError.hidden = true;

  checkGroup.append(checkHeading.row, checkInput, checkError);

  const leadStep = document.createElement('div');
  leadStep.className = 'step-panel';
  leadStep.append(leadsGroup);
  const lateStep = document.createElement('div');
  lateStep.className = 'step-panel';
  lateStep.append(lateGroup);
  const conversionStep = document.createElement('div');
  conversionStep.className = 'step-panel';
  conversionStep.append(convGroup);
  const moneyStep = document.createElement('div');
  moneyStep.className = 'step-panel';
  moneyStep.append(checkGroup, lossGroup);

  // --- 2. RESULT CARD (Screenshot & Repost Ready) ---
  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');

  const riskLineEl = document.createElement('p');
  riskLineEl.className = 'result-card__note';
  riskLineEl.id = 'rr-result-risk';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = `<span>ПОТЕНЦИАЛ ВОЗВРАТА</span><span>@_kartuzzz</span>`;

  const mainValueEl = document.createElement('p');
  mainValueEl.className = 'result-card__value';
  mainValueEl.id = 'rr-result-month';

  const subNoteEl = document.createElement('p');
  subNoteEl.className = 'result-card__note';
  subNoteEl.id = 'rr-result-late-leads';

  const metricsGrid = document.createElement('div');
  metricsGrid.className = 'metrics-grid';

  const yearBox = document.createElement('div');
  yearBox.className = 'metric-box';
  yearBox.innerHTML = `<span class="metric-box__label">Выручка под риском в год</span>`;
  const yearValEl = document.createElement('span');
  yearValEl.className = 'metric-box__value';
  yearValEl.id = 'rr-result-year';
  yearBox.appendChild(yearValEl);

  metricsGrid.append(yearBox);

  const triggerBanner = document.createElement('div');
  triggerBanner.className = 'trigger-banner';
  triggerBanner.id = 'rr-trigger-metric';

  const resultDisclaimerEl = document.createElement('p');
  resultDisclaimerEl.className = 'result-disclaimer';
  resultDisclaimerEl.id = 'rr-result-disclaimer';
  resultDisclaimerEl.textContent = MARKET_AVERAGE_RESULT_DISCLAIMER;
  resultDisclaimerEl.hidden = true;

  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--secondary';
  copyBtn.id = 'rr-copy-btn';
  copyBtn.textContent = 'Скопировать резюме для Threads';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.id = 'rr-save-btn';
  saveBtn.textContent = 'Сохранить «До» для сравнения';

  actions.append(copyBtn, saveBtn);

  const toastEl = document.createElement('p');
  toastEl.className = 'status-toast';
  toastEl.id = 'rr-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;

  resultCard.append(
    createResultBanner(),
    riskLineEl,
    eyebrow,
    mainValueEl,
    subNoteEl,
    metricsGrid,
    triggerBanner,
    resultDisclaimerEl,
    diffBox,
    actions,
    toastEl,
  );

  // --- 3. COLLAPSIBLE BLOCK: «Как посчитано» ---
  const howDetails = document.createElement('details');
  howDetails.className = 'info-details';
  howDetails.id = 'rr-how-calculated';

  const howSummary = document.createElement('summary');
  howSummary.className = 'info-details__summary';
  howSummary.innerHTML = `<span>Как посчитано (формула и ваши цифры)</span><span aria-hidden="true">▾</span>`;

  const howBody = document.createElement('div');
  howBody.className = 'info-details__body';
  howBody.id = 'rr-how-body';

  howDetails.append(howSummary, howBody);

  // --- 4. ALWAYS-VISIBLE BLOCK: «Что фиксировать» ---
  const trackingCard = document.createElement('section');
  trackingCard.className = 'tracking-card';
  trackingCard.setAttribute('aria-labelledby', 'rr-tracking-title');

  const trackingTitle = document.createElement('h3');
  trackingTitle.className = 'tracking-card__title';
  trackingTitle.id = 'rr-tracking-title';
  trackingTitle.textContent = 'Что фиксировать в бизнесе прямо сейчас';

  const trackingList = document.createElement('ol');
  trackingList.className = 'tracking-list';

  for (const item of TRACKING_ITEMS) {
    const li = document.createElement('li');
    li.textContent = item;
    trackingList.appendChild(li);
  }

  trackingCard.append(trackingTitle, trackingList);

  const incompleteNote = document.createElement('div');
  incompleteNote.className = 'result-card';
  incompleteNote.hidden = true;
  const incompleteText = document.createElement('p');
  incompleteText.className = 'result-card__note';
  incompleteText.textContent =
    'Чтобы увидеть расчёт, заполните количество обращений и долю поздних ответов на предыдущих шагах.';
  incompleteNote.append(incompleteText);

  panel.append(inputCard);
  container.appendChild(panel);

  function getActiveConversionRaw(): string {
    if (mode === 'preset') {
      const preset = getNichePresetById(selectedPresetId);
      return String(preset.defaultConversionPercent);
    }
    return customConversionRaw;
  }

  function writeRecovery(raw: string): void {
    recoveryRaw = raw;
    lossInput.value = raw;
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
      lossSlider.value = '0';
      lossSlider.setAttribute('aria-valuetext', 'Не задано');
      return;
    }
    lossSlider.value = String(Math.min(100, Math.max(0, Number(raw))));
    lossSlider.removeAttribute('aria-valuetext');
  }

  function applyPresetRecovery(): void {
    const recovery = recoveryPercentFromLossFactor(
      getNichePresetById(selectedPresetId).defaultLossFactor,
    );
    writeRecovery(String(recovery));
  }

  function syncConversionFieldWithMode(): void {
    const isPreset = mode === 'preset';
    setHelpTipText(convHeading.tip, isPreset ? HELP.presetMode : HELP.customMode);
    modeCustomBtn.setAttribute('aria-pressed', String(!isPreset));
    modePresetBtn.setAttribute('aria-pressed', String(isPreset));
    presetsWrap.hidden = !isPreset;
    resultDisclaimerEl.hidden = !isPreset;

    const unitSpan = convLabel.querySelector('#rr-conv-unit');
    if (unitSpan) unitSpan.textContent = '1–95%';
    if (isPreset) {
      const preset = getNichePresetById(selectedPresetId);
      convInput.value = String(preset.defaultConversionPercent);
      convInput.readOnly = true;
      convInput.setAttribute('aria-readonly', 'true');
      applyPresetRecovery();
    } else {
      convInput.readOnly = false;
      convInput.removeAttribute('aria-readonly');
      convInput.value = customConversionRaw;
      writeRecovery(customRecoveryRaw);
    }
  }

  function setFieldError(
    inputEl: HTMLInputElement,
    errorEl: HTMLElement,
    message: string | undefined,
  ): void {
    if (message) {
      inputEl.classList.add('field-input--invalid');
      inputEl.setAttribute('aria-invalid', 'true');
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      inputEl.classList.remove('field-input--invalid');
      inputEl.removeAttribute('aria-invalid');
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  function showToast(message: string): void {
    showStatusToast(toastEl, message);
  }

  function recalculateAndRender() {
    const activeConvRaw = getActiveConversionRaw();
    const validation = validateRevenueRiskDraft({
      leadsPerMonthRaw: leadsRaw,
      lateSharePercentRaw: lateShareRaw,
      conversionPercentRaw: activeConvRaw,
      avgCheckRaw: avgCheckRaw,
      lossFactorPercentRaw: recoveryRaw,
      mode,
    });

    const visibleError = (raw: string, message: string | undefined): string | undefined =>
      raw.trim() === '' ? undefined : message;
    setFieldError(leadsInput, leadsError, visibleError(leadsRaw, validation.errors.leadsPerMonth));
    setFieldError(lateInput, lateError, visibleError(lateShareRaw, validation.errors.lateSharePercent));
    setFieldError(
      convInput,
      convError,
      visibleError(activeConvRaw, validation.errors.conversionPercent),
    );
    setFieldError(lossInput, lossError, visibleError(recoveryRaw, validation.errors.lossFactorPercent));
    setFieldError(checkInput, checkError, visibleError(avgCheckRaw, validation.errors.avgCheck));
    lastErrors = validation.errors;

    const calcResult = calculateRevenueRisk({
      leadsPerMonth: validation.errors.leadsPerMonth ? 0 : Number(leadsRaw),
      lateSharePercent: validation.errors.lateSharePercent
        ? 0
        : Number(lateShareRaw),
      conversionPercent: validation.errors.conversionPercent
        ? 0
        : Number(activeConvRaw),
      avgCheck: validation.errors.avgCheck ? 0 : Number(avgCheckRaw),
      lossFactor: validation.errors.lossFactorPercent
        ? 0
        : lossFactorFromRecoveryPercent(Number(recoveryRaw)),
    });

    const { normalizedInput } = calcResult;

    riskLineEl.textContent = `Выручка под риском: ${formatRubles(calcResult.revenueAtRiskMax)}/мес`;
    mainValueEl.textContent = `${formatRubles(calcResult.recoverableRevenue)}/мес`;
    subNoteEl.textContent = `В зоне риска ${formatCountWithNoun(Math.round(calcResult.lateLeads), ['позднее обращение', 'поздних обращения', 'поздних обращений'])} из ${formatIntegerGrouping(normalizedInput.leadsPerMonth)} в месяц.`;

    yearValEl.textContent = formatRubles(calcResult.revenueAtRiskPerYear);

    triggerBanner.innerHTML = `Один вовремя отвеченный диалог может принести <span class="trigger-banner__highlight">${formatRubles(calcResult.costPerMissedDialog)}</span>`;

    // Update collapsible "Как посчитано" with live substituted numbers
    const recoveryPercent = recoveryPercentFromLossFactor(normalizedInput.lossFactor);
    howBody.innerHTML = `
      <p>Шаги расчёта:</p>
      <ol class="formula-list">
        <li>Поздние обращения = ${formatIntegerGrouping(normalizedInput.leadsPerMonth)} × ${formatPercent(normalizedInput.lateSharePercent)} = <strong>${formatCountWithNoun(Math.round(calcResult.lateLeads), ['обращение', 'обращения', 'обращений'])}/мес</strong></li>
        <li>Выручка под риском в месяц = ${Math.round(calcResult.lateLeads)} × ${formatPercent(normalizedInput.conversionPercent)} × ${formatRubles(normalizedInput.avgCheck)} = <strong>${formatRubles(calcResult.revenueAtRiskMax)}</strong></li>
        <li>Потенциал возврата = ${formatRubles(calcResult.revenueAtRiskMax)} × ${formatPercent(recoveryPercent)} = <strong>${formatRubles(calcResult.recoverableRevenue)}/мес</strong></li>
        <li>Выручка под риском в год = ${formatRubles(calcResult.revenueAtRiskMax)} × 12 = <strong>${formatRubles(calcResult.revenueAtRiskPerYear)}</strong></li>
        <li>Один вовремя отвеченный диалог = ${formatRubles(normalizedInput.avgCheck)} × ${formatPercent(normalizedInput.conversionPercent)} = <strong>${formatRubles(calcResult.costPerMissedDialog)}</strong></li>
      </ol>
    `;

    // Check saved scenario comparison ("До / После")
    const saved = store.load('revenue-risk');
    if (saved) {
      const comparison = store.compare(
        'revenue-risk',
        calcResult.revenueAtRiskMax,
        true,
      );
      diffBox.hidden = false;
      const sign = comparison && comparison.delta > 0 ? '+' : '';
      const pctText =
        comparison && comparison.deltaPercent !== null
          ? ` (${sign}${comparison.deltaPercent}%)`
          : '';
      diffBox.textContent = `Сравнение «До / После»: было ${saved.formattedValue} → сейчас ${formatRubles(calcResult.revenueAtRiskMax)}${pctText}`;
    } else {
      diffBox.hidden = true;
    }

    refreshSteps();
    return { calcResult, validation };
  }

  // Event listeners
  modeCustomBtn.addEventListener('click', () => {
    if (mode === 'custom') return;
    mode = 'custom';
    syncConversionFieldWithMode();
    recalculateAndRender();
  });

  modePresetBtn.addEventListener('click', () => {
    if (mode === 'preset') return;
    mode = 'preset';
    syncConversionFieldWithMode();
    recalculateAndRender();
  });

  leadsInput.addEventListener('input', () => {
    leadsRaw = leadsInput.value;
    recalculateAndRender();
  });

  lateSlider.addEventListener('input', () => {
    lateShareRaw = lateSlider.value;
    lateInput.value = lateShareRaw;
    lateSlider.removeAttribute('aria-valuetext');
    recalculateAndRender();
  });

  lateInput.addEventListener('input', () => {
    lateShareRaw = lateInput.value;
    const num = normalizeFiniteNumber(lateShareRaw, 0);
    lateSlider.value = String(Math.min(100, Math.max(0, num)));
    if (lateShareRaw.trim() === '') {
      lateSlider.setAttribute('aria-valuetext', 'Не задано');
    } else {
      lateSlider.removeAttribute('aria-valuetext');
    }
    recalculateAndRender();
  });

  lossSlider.addEventListener('input', () => {
    recoveryRaw = lossSlider.value;
    lossInput.value = recoveryRaw;
    lossSlider.removeAttribute('aria-valuetext');
    if (mode === 'custom') {
      customRecoveryRaw = recoveryRaw;
    }
    recalculateAndRender();
  });

  lossInput.addEventListener('input', () => {
    recoveryRaw = lossInput.value;
    if (recoveryRaw.trim() === '' || !Number.isFinite(Number(recoveryRaw))) {
      lossSlider.value = '0';
      lossSlider.setAttribute('aria-valuetext', 'Не задано');
    } else {
      lossSlider.value = String(Math.min(100, Math.max(0, Number(recoveryRaw))));
      lossSlider.removeAttribute('aria-valuetext');
    }
    if (mode === 'custom') {
      customRecoveryRaw = recoveryRaw;
    }
    recalculateAndRender();
  });

  convInput.addEventListener('input', () => {
    if (mode === 'custom') {
      customConversionRaw = convInput.value;
      recalculateAndRender();
    }
  });

  checkInput.addEventListener('input', () => {
    avgCheckRaw = checkInput.value;
    recalculateAndRender();
  });

  for (const field of [leadsInput, lateInput, lateSlider, lossInput, lossSlider, convInput, checkInput]) {
    field.addEventListener('change', () => {
      leadsRaw = leadsInput.value;
      lateShareRaw = lateInput.value;
      recoveryRaw = lossInput.value;
      if (mode === 'custom') {
        customConversionRaw = convInput.value;
        customRecoveryRaw = lossInput.value;
      }
      avgCheckRaw = checkInput.value;
      recalculateAndRender();
    });
  }

  copyBtn.addEventListener('click', async () => {
    const { calcResult } = recalculateAndRender();
    const { normalizedInput } = calcResult;
    const preset =
      mode === 'preset' ? getNichePresetById(selectedPresetId) : undefined;

    const text = buildRevenueRiskShareText({
      leadsPerMonth: normalizedInput.leadsPerMonth,
      lateSharePercent: normalizedInput.lateSharePercent,
      conversionPercent: normalizedInput.conversionPercent,
      avgCheck: normalizedInput.avgCheck,
      lossFactorPercent: Math.round(normalizedInput.lossFactor * 100),
      mode,
      ...(preset ? { presetTitle: preset.title } : {}),
      lateLeads: calcResult.lateLeads,
      revenueAtRiskMax: calcResult.revenueAtRiskMax,
      revenueAtRiskPerYear: calcResult.revenueAtRiskPerYear,
      recoverableRevenue: calcResult.recoverableRevenue,
      costPerMissedDialog: calcResult.costPerMissedDialog,
    });

    const res = await copyTextToClipboard(text, 'резюме для Threads');
    showToast(res.ok ? 'Скопировано резюме для Threads' : res.message);
  });

  saveBtn.addEventListener('click', () => {
    const { calcResult } = recalculateAndRender();
    const formatted = formatRubles(calcResult.revenueAtRiskMax);
    const saved = store.save('revenue-risk', {
      label: 'Сценарий «До»',
      primaryValue: calcResult.revenueAtRiskMax,
      formattedValue: formatted,
    });
    recalculateAndRender();
    showToast(
      saved.persisted
        ? `Сохранено «До»: ${formatted}/мес. Измените параметры для сравнения.`
        : `Сохранено на время сессии («До»: ${formatted}/мес).`,
    );
  });

  function persistRevenueDraft(step: number): void {
    dossier.update((current) => ({
      ...current,
      revenueDraft: {
        step,
        leadsPerMonth: leadsRaw,
        lateSharePercent: lateShareRaw,
        conversionPercent: customConversionRaw,
        avgCheck: avgCheckRaw,
        lossFactorPercent:
          recoveryRaw.trim() === '' || !Number.isFinite(Number(recoveryRaw))
            ? ''
            : String(Math.round(100 - Math.min(100, Math.max(0, Number(recoveryRaw))))),
        mode,
        presetId: mode === 'preset' ? selectedPresetId : null,
      },
    }));
  }

  function finishRevenue(): void {
    const { calcResult, validation } = recalculateAndRender();
    if (!validation.isValid) return;
    const bridgeSnapshot = bridge.saveRevenueRiskResult({
      inputs: {
        leadsPerMonth: calcResult.normalizedInput.leadsPerMonth,
        lateSharePercent: calcResult.normalizedInput.lateSharePercent,
        conversionPercent: calcResult.normalizedInput.conversionPercent,
        avgCheck: calcResult.normalizedInput.avgCheck,
        lossFactor: calcResult.normalizedInput.lossFactor,
        mode,
        ...(mode === 'preset' ? { presetId: selectedPresetId } : {}),
      },
      results: {
        lateLeads: calcResult.lateLeads,
        revenueAtRiskMax: calcResult.revenueAtRiskMax,
        recoverableRevenue: calcResult.recoverableRevenue,
        revenueAtRiskPerYear: calcResult.revenueAtRiskPerYear,
        costPerMissedDialog: calcResult.costPerMissedDialog,
      },
    });
    dossier.update((current) => ({
      ...current,
      revenue: bridgeSnapshot,
    }));
    bridge.send({
      fromTool: 'revenue-risk',
      toTool: meta.nextToolId,
      label: `${formatRubles(calcResult.revenueAtRiskMax)}/мес под риском`,
      suggestedValue: Math.max(
        15,
        Math.round(calcResult.normalizedInput.leadsPerMonth * 2),
      ),
      note: `${formatIntegerGrouping(calcResult.normalizedInput.leadsPerMonth)} обращений в месяц, из них поздних ${Math.round(calcResult.lateLeads)}`,
      revenueRiskSnapshot: bridgeSnapshot,
    });
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  }

  lastErrors = validateRevenueRiskDraft({
    leadsPerMonthRaw: leadsRaw,
    lateSharePercentRaw: lateShareRaw,
    conversionPercentRaw:
      mode === 'preset'
        ? String(getNichePresetById(selectedPresetId).defaultConversionPercent)
        : customConversionRaw,
    avgCheckRaw,
    lossFactorPercentRaw: recoveryRaw,
    mode,
  }).errors;

  let refreshSteps = (): void => {};
  const wizard = createWizard({
    toolId: 'revenue-risk',
    initialStep: openedStep,
    panels: [leadStep, lateStep, conversionStep, moneyStep],
    extras: [resultCard, howDetails, incompleteNote, trackingCard],
    isStepValid: (step) => isRevenueStepValid(step, lastErrors),
    finishLabel: meta.nextToolCta,
    onStep: (step) => {
      onWizardStep(step);
      persistRevenueDraft(step);
      const showResult = step === 4 && isRevenueStepValid(4, lastErrors);
      resultCard.hidden = !showResult;
      howDetails.hidden = !showResult;
      incompleteNote.hidden = step !== 4 || showResult;
    },
    onFinish: finishRevenue,
  });
  refreshSteps = () => wizard.refresh();
  inputCard.append(
    wizard.progress,
    leadStep,
    lateStep,
    conversionStep,
    moneyStep,
    resultCard,
    howDetails,
    incompleteNote,
    trackingCard,
    wizard.nav,
  );

  // Initial render
  syncConversionFieldWithMode();
  recalculateAndRender();
}
