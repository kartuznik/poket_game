import {
  ICON_ARROW,
  ICON_COPY,
  ICON_PIN,
  paintDisclosure,
  paintLabeledButton,
} from '../../components/action-icon';
import { mountNicheMenu } from '../../components/niche-menu';
import { createResultBanner } from '../../components/result-banner';
import { releaseHelpTipsWithin } from '../../components/tooltip';
import { createWizard } from '../../components/wizard';
import { showStatusToast } from '../../components/toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import { recordMetricSnapshot } from '../../lib/dossier';
import {
  NICHE_CAPTION,
  activeConversionNiche,
  applyNicheGuess,
  nicheById,
  nicheCaptionVisible,
  nicheConversionCardTitle,
  nichePromptKind,
  revenueNicheFields,
  storedNicheConversionCard,
  type BusinessNicheId,
  type NichePreset as BusinessNichePreset,
} from '../../lib/niche-presets';
import type { RevenueRiskFieldErrors } from './calc';
import { isRevenueStepValid, resolveInitialStep } from '../../lib/wizard';
import {
  formatCountWithNoun,
  formatIntegerGrouping,
  formatNumber,
  formatPercent,
  formatRubles,
  formatWorkHours,
  normalizeFiniteNumber,
} from '../../lib/format';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  type ConversionInputMode,
  MARKET_AVERAGE_BADGE_DISCLAIMER,
  MARKET_AVERAGE_RESULT_DISCLAIMER,
  BOT_COVERAGE_CHOICES,
  UNCERTAINTY_INPUT_ACCUSATIVE,
  UNCERTAINTY_INPUT_LABELS,
  UNCERTAINTY_TAG_LABELS,
  calculateRevenueRisk,
  computeCorridor,
  computeWhatIf,
  defaultUncertainty,
  botShareLabel,
  formatCorridorLine,
  resolvedBotCoverage,
  segmentedButtonClass,
  formatUncertaintyProfile,
  lossFactorFromRecoveryPercent,
  recoveryPercentFromLossFactor,
  shouldShowMeasureFirst,
  topUncertainInputs,
  uncertaintyAfterModeChange,
  validateRevenueRiskDraft,
} from './calc';
import type { UncertaintyInputId, UncertaintyProfile, UncertaintyTag } from '../../lib/types';
import { answersAutomationPercent } from '../routine-calc/calc';

const LEADS_NOTE = 'Сообщение, звонок и заявка — одно обращение.';
const LATE_NOTE =
  'Доля обращений с поздним ответом или без ответа. Порог задаёте вы: хоть 15 минут, хоть час.';

function fieldHeading(
  inputId: string,
  title: string,
  unit: string,
  note?: string,
  unitId?: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-label';

  const label = document.createElement('label');
  label.className = 'field-label__text';
  label.htmlFor = inputId;
  label.textContent = title;

  const unitEl = document.createElement('span');
  unitEl.className = 'field-unit';
  unitEl.textContent = unit;
  if (unitId) unitEl.id = unitId;

  row.append(label, unitEl);
  if (!note) return row;

  const wrap = document.createElement('div');
  wrap.className = 'field-copy';
  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = note;
  wrap.append(row, hint);
  return wrap;
}

function segmentItem(control: HTMLElement): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'segmented-control__item';
  wrap.append(control);
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
  readonly tags: UncertaintyProfile;
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
    `• Можно вернуть: ${formatRubles(params.recoverableRevenue)}/мес`,
    `• ${formatCorridorLine(
      computeCorridor(
        {
          leadsPerMonth: params.leadsPerMonth,
          lateSharePercent: params.lateSharePercent,
          conversionPercent: params.conversionPercent,
          avgCheck: params.avgCheck,
          lossFactor: params.lossFactorPercent / 100,
        },
        params.tags,
      ),
      params.tags,
    )}`,
    `• Насколько вы уверены в цифрах: ${formatUncertaintyProfile(params.tags)}`,
    `• Выручка под риском в месяц: ${formatRubles(params.revenueAtRiskMax)}`,
    `• Поздних обращений: ${formatCountWithNoun(params.lateLeads, ['обращение', 'обращения', 'обращений'])}/мес`,
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

  let mode: ConversionInputMode = draft?.mode ?? saved?.inputs.mode ?? 'custom';
  let nicheConversionId: BusinessNicheId | null = activeConversionNiche(
    dossier.read().niche,
    mode,
    null,
  );
  if (mode === 'preset' && !nicheConversionId) {
    mode = 'custom';
  }
  let tags: UncertaintyProfile =
    draft?.uncertainty ?? saved?.uncertainty ?? defaultUncertainty(mode);
  const storedCoverage = draft?.botCoverage ?? saved?.botCoverage ?? null;
  let botFromRoutine = false;
  const suggestedCoverage = answersAutomationPercent(bridge.getRoutineResult());
  if (
    storedCoverage !== null &&
    suggestedCoverage !== null &&
    Math.abs(storedCoverage - suggestedCoverage / 100) < 0.001
  ) {
    botFromRoutine = true;
  }
  let botCoverage = resolvedBotCoverage(storedCoverage);

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
  const nicheStrip = document.createElement('p');
  nicheStrip.className = 'niche-strip';
  nicheStrip.hidden = true;
  header.append(nicheStrip);
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
    LEADS_NOTE,
  );

  const leadsError = document.createElement('p');
  leadsError.className = 'field-error';
  leadsError.id = 'rr-leads-error';
  leadsError.hidden = true;

  const leadsNote = nicheNote();
  leadsGroup.append(leadsHeading, leadsInput, leadsNote, leadsError);

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
    LATE_NOTE,
  );

  const lateError = document.createElement('p');
  lateError.className = 'field-error';
  lateError.id = 'rr-late-error';
  lateError.hidden = true;

  const lateNote = nicheNote();
  lateGroup.append(lateHeading, lateSliderRow, lateNote, lateError);

  // Field 3: Conversion Mode Segmented Control + Input / Presets
  const convGroup = document.createElement('div');
  convGroup.className = 'field-group';

  const convLabel = fieldHeading(
    'rr-conv-input',
    'Конверсия из обращения в покупку',
    '1–95%',
    undefined,
    'rr-conv-unit',
  );

  const segmented = document.createElement('div');
  segmented.className = 'segmented-control';
  segmented.setAttribute('role', 'group');
  segmented.setAttribute('aria-label', 'Режим выбора конверсии');

  const modeCustomBtn = document.createElement('button');
  modeCustomBtn.type = 'button';
  modeCustomBtn.className = segmentedButtonClass(mode === 'custom');
  modeCustomBtn.id = 'rr-mode-custom';
  modeCustomBtn.textContent = 'Моя конверсия';
  modeCustomBtn.setAttribute('aria-pressed', 'true');

  const modePresetBtn = document.createElement('button');
  modePresetBtn.type = 'button';
  modePresetBtn.className = segmentedButtonClass(mode === 'preset');
  modePresetBtn.id = 'rr-mode-preset';
  modePresetBtn.textContent = 'Пример по нише';
  modePresetBtn.setAttribute('aria-pressed', 'false');

  segmented.append(segmentItem(modeCustomBtn), segmentItem(modePresetBtn));

  // Presets container (shown when mode === 'preset')
  const presetsWrap = document.createElement('div');
  presetsWrap.className = 'field-group';
  presetsWrap.hidden = true;

  const scenarioNote = document.createElement('aside');
  scenarioNote.className = 'scenario-disclaimer';
  scenarioNote.setAttribute('role', 'note');
  const scenarioText = document.createElement('p');
  scenarioText.className = 'scenario-disclaimer__text';
  scenarioText.textContent = MARKET_AVERAGE_BADGE_DISCLAIMER;
  scenarioNote.append(scenarioText);

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'presets-grid';

  const nicheCard = document.createElement('button');
  nicheCard.type = 'button';
  nicheCard.className = 'preset-card';
  nicheCard.hidden = true;
  nicheCard.setAttribute('aria-pressed', 'true');
  const nicheCardTitle = document.createElement('span');
  nicheCardTitle.className = 'preset-card__title';
  const nicheCardConv = document.createElement('span');
  nicheCardConv.className = 'preset-card__conv';
  const nicheCardTop = document.createElement('span');
  nicheCardTop.className = 'preset-card__top';
  nicheCardTop.append(nicheCardTitle, nicheCardConv);
  nicheCard.append(nicheCardTop);
  presetsGrid.append(nicheCard);

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

  const lossHeading = fieldHeading('rr-loss-input', 'Вернуть быстрым ответом', '0–100%');

  const lossError = document.createElement('p');
  lossError.className = 'field-error';
  lossError.id = 'rr-loss-error';
  lossError.hidden = true;

  lossGroup.append(lossHeading, lossHint, lossSliderRow, lossError);

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

  const checkHeading = fieldHeading('rr-check-input', 'Средний чек', '₽');

  const checkError = document.createElement('p');
  checkError.className = 'field-error';
  checkError.id = 'rr-check-error';
  checkError.hidden = true;

  const checkNote = nicheNote();
  checkGroup.append(checkHeading, checkInput, checkNote, checkError);

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
  eyebrow.innerHTML = `<span>МОЖНО ВЕРНУТЬ</span>`;

  const mainValueEl = document.createElement('p');
  mainValueEl.className = 'result-card__value';
  mainValueEl.id = 'rr-result-month';

  const corridorEl = document.createElement('p');
  corridorEl.className = 'result-card__note result-card__corridor';
  corridorEl.id = 'rr-result-corridor';

  const certaintyDetails = document.createElement('details');
  certaintyDetails.className = 'certainty-details';
  const certaintySummary = document.createElement('summary');
  certaintySummary.className = 'certainty-details__summary';
  paintDisclosure(certaintySummary, 'Насколько вы уверены в цифрах');
  const certaintyBody = document.createElement('div');
  certaintyBody.className = 'certainty-details__body';
  const tagButtons = new Map<UncertaintyInputId, Map<UncertaintyTag, HTMLButtonElement>>();
  for (const inputId of [
    'leads',
    'lateShare',
    'conversion',
    'check',
    'recoveryShare',
  ] as const) {
    const row = document.createElement('div');
    row.className = 'certainty-row';
    const label = document.createElement('span');
    label.className = 'certainty-row__label';
    label.textContent = UNCERTAINTY_INPUT_LABELS[inputId];
    const control = document.createElement('div');
    control.className = 'segmented-control segmented-control--triple';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', UNCERTAINTY_INPUT_LABELS[inputId]);
    const buttons = new Map<UncertaintyTag, HTMLButtonElement>();
    for (const tag of ['precise', 'rough', 'guess'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = segmentedButtonClass(tags[inputId] === tag);
      button.textContent = UNCERTAINTY_TAG_LABELS[tag];
      button.setAttribute('aria-pressed', String(tags[inputId] === tag));
      button.addEventListener('click', () => {
        tags = { ...tags, [inputId]: tag };
        paintCertainty();
        persistRevenueDraft(wizard.currentStep());
      });
      buttons.set(tag, button);
      control.append(button);
    }
    tagButtons.set(inputId, buttons);
    row.append(label, control);
    certaintyBody.append(row);
  }
  certaintyDetails.append(certaintySummary, certaintyBody);

  const measureBlock = document.createElement('section');
  measureBlock.className = 'measure-first';
  const measureTitle = document.createElement('h3');
  measureTitle.className = 'measure-first__title';
  measureTitle.textContent = 'Что замерить первым';
  const measureTargets = document.createElement('p');
  measureTargets.className = 'measure-first__targets';
  measureBlock.append(measureTitle, measureTargets);

  const whatIf = document.createElement('section');
  whatIf.className = 'what-if';
  const whatIfTitle = document.createElement('h3');
  whatIfTitle.className = 'what-if__title';
  whatIfTitle.textContent = 'А если первым отвечает бот?';
  const whatIfCaption = document.createElement('p');
  whatIfCaption.className = 'what-if__caption';
  whatIfCaption.textContent = 'Доля потерь, которую закроет бот';
  const whatIfControl = document.createElement('div');
  whatIfControl.className = 'segmented-control segmented-control--triple';
  whatIfControl.setAttribute('role', 'group');
  whatIfControl.setAttribute('aria-label', 'Доля потерь, которую закроет бот');
  const coverageButtons = new Map<number, HTMLButtonElement>();
  for (const choice of BOT_COVERAGE_CHOICES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = segmentedButtonClass(botCoverage === choice);
    button.textContent = botShareLabel(choice);
    button.addEventListener('click', () => {
      botCoverage = choice;
      botFromRoutine = false;
      paintWhatIf();
      persistRevenueDraft(wizard.currentStep());
    });
    coverageButtons.set(choice, button);
    whatIfControl.append(button);
  }
  const routineFill = document.createElement('button');
  routineFill.type = 'button';
  routineFill.className = 'action-btn action-btn--secondary what-if__routine';
  paintLabeledButton(routineFill, 'подставить из рутины', ICON_ARROW);
  routineFill.addEventListener('click', () => {
    const share = answersAutomationPercent(bridge.getRoutineResult());
    if (share === null) return;
    botCoverage = share / 100;
    botFromRoutine = true;
    paintWhatIf();
    persistRevenueDraft(wizard.currentStep());
  });
  const whatIfOutcome = document.createElement('p');
  whatIfOutcome.className = 'what-if__outcome';
  const whatIfSource = document.createElement('p');
  whatIfSource.className = 'what-if__source';
  whatIfSource.textContent = 'подставили из вашей рутины, можно менять';
  const whatIfTable = document.createElement('div');
  whatIfTable.className = 'what-if__table';
  const whatIfNow = document.createElement('p');
  const whatIfHours = document.createElement('p');
  whatIfTable.append(whatIfNow, whatIfHours);
  whatIf.append(
    whatIfTitle,
    whatIfCaption,
    whatIfControl,
    routineFill,
    whatIfSource,
    whatIfOutcome,
    whatIfTable,
  );

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
  paintLabeledButton(copyBtn, 'Текст для поста в Threads', ICON_COPY);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.id = 'rr-save-btn';
  paintLabeledButton(saveBtn, 'Сохранить как «до» — сравним через месяц', ICON_PIN);

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
    corridorEl,
    certaintyDetails,
    measureBlock,
    whatIf,
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
  paintDisclosure(howSummary, 'Как посчитано (формула и ваши цифры)');

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

  function activeNiche() {
    return nicheConversionId ? nicheById(nicheConversionId) : null;
  }

  function storedPresetId(): string | null {
    if (mode !== 'preset') return null;
    const niche = activeNiche();
    return niche ? `niche:${niche.id}` : null;
  }

  function paintConversionChoice(): void {
    if (mode === 'preset') {
      nicheConversionId = storedNicheConversionCard(dossier.read().niche);
    }
    const niche = mode === 'preset' ? activeNiche() : null;
    nicheCard.hidden = !niche;
    nicheCard.setAttribute('aria-pressed', niche ? 'true' : 'false');
    if (!niche) return;
    nicheCardTitle.textContent = nicheConversionCardTitle(niche);
    nicheCardConv.textContent = '';
    nicheCardConv.hidden = true;
  }

  function getActiveConversionRaw(): string {
    if (mode === 'preset') {
      const niche = activeNiche();
      if (niche) return String(niche.conversionPercent);
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

  function syncConversionFieldWithMode(): void {
    const storedNicheId = storedNicheConversionCard(dossier.read().niche);
    segmented.hidden = storedNicheId === null;
    if (mode === 'preset' && storedNicheId === null) {
      mode = 'custom';
      nicheConversionId = null;
    }
    const isPreset = mode === 'preset' && storedNicheId !== null;
    modeCustomBtn.className = segmentedButtonClass(!isPreset);
    modePresetBtn.className = segmentedButtonClass(isPreset);
    modeCustomBtn.setAttribute('aria-pressed', String(!isPreset));
    modePresetBtn.setAttribute('aria-pressed', String(isPreset));
    presetsWrap.hidden = !isPreset;
    resultDisclaimerEl.hidden = !isPreset;

    const unitSpan = convLabel.querySelector('#rr-conv-unit');
    if (unitSpan) unitSpan.textContent = '1–95%';
    paintConversionChoice();
    if (isPreset) {
      const niche = activeNiche();
      convInput.value = niche ? String(niche.conversionPercent) : '';
      convInput.readOnly = true;
      convInput.setAttribute('aria-readonly', 'true');
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
    yearValEl.textContent = formatRubles(calcResult.revenueAtRiskPerYear);

    triggerBanner.innerHTML = `Один вовремя отвеченный диалог может принести <span class="trigger-banner__highlight">${formatRubles(calcResult.costPerMissedDialog)}</span>`;

    // Update collapsible "Как посчитано" with live substituted numbers
    const recoveryPercent = recoveryPercentFromLossFactor(normalizedInput.lossFactor);
    const lateLeadsText = formatNumber(Math.round(calcResult.lateLeads * 10) / 10);
    howBody.innerHTML = `
      <p>Шаги расчёта:</p>
      <ol class="formula-list">
        <li>Поздние обращения = ${formatIntegerGrouping(normalizedInput.leadsPerMonth)} × ${formatPercent(normalizedInput.lateSharePercent)} = <strong>${formatCountWithNoun(calcResult.lateLeads, ['обращение', 'обращения', 'обращений'])}/мес</strong></li>
        <li>Выручка под риском в месяц = ${lateLeadsText} × ${formatPercent(normalizedInput.conversionPercent)} × ${formatRubles(normalizedInput.avgCheck)} = <strong>${formatRubles(calcResult.revenueAtRiskMax)}</strong></li>
        <li>Можно вернуть = ${formatRubles(calcResult.revenueAtRiskMax)} × ${formatPercent(recoveryPercent)} = <strong>${formatRubles(calcResult.recoverableRevenue)}/мес</strong></li>
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

    latestResult = calcResult;
    paintCertainty();
    paintNicheNotes();
    refreshSteps();
    return { calcResult, validation };
  }

  let latestResult: ReturnType<typeof calculateRevenueRisk> | null = null;

  function paintCertainty(): void {
    if (!latestResult) return;
    const corridor = computeCorridor(latestResult.normalizedInput, tags);
    corridorEl.textContent = formatCorridorLine(corridor, tags);
    for (const [inputId, buttons] of tagButtons) {
      for (const [tag, button] of buttons) {
        const active = tags[inputId] === tag;
        button.className = segmentedButtonClass(active);
        button.setAttribute('aria-pressed', String(active));
      }
    }
    const showMeasure = shouldShowMeasureFirst(corridor);
    measureBlock.hidden = !showMeasure;
    if (showMeasure) {
      const names = topUncertainInputs(tags).map((id) => UNCERTAINTY_INPUT_ACCUSATIVE[id]);
      measureTargets.textContent = `Сначала уточните ${names.join(' и ')}`;
    }
    paintWhatIf();
  }

  function paintWhatIf(): void {
    const share = answersAutomationPercent(bridge.getRoutineResult());
    routineFill.hidden = share === null;
    for (const [choice, button] of coverageButtons) {
      const active = botCoverage === choice;
      button.className = segmentedButtonClass(active);
      button.setAttribute('aria-pressed', String(active));
    }
    whatIfOutcome.hidden = false;
    whatIfSource.hidden = !botFromRoutine;
    whatIfTable.hidden = false;
    if (!latestResult) return;
    whatIfOutcome.textContent = `Бот закроет ${botShareLabel(botCoverage)} таких потерь`;
    const coverage = botCoverage;
    const outcome = computeWhatIf(
      {
        risk: latestResult.revenueAtRiskMax,
        lossFactor: latestResult.normalizedInput.lossFactor,
      },
      coverage,
    );
    whatIfNow.textContent = `Теряете сейчас: ${formatRubles(outcome.lostNow)}/мес · С ботом: ${formatRubles(outcome.lostWithBot)} · Бот сбережёт: ${formatRubles(outcome.prevented)}`;
    const routine = bridge.getRoutineResult();
    whatIfHours.hidden = routine === null;
    if (routine) {
      whatIfHours.textContent = `Освобождённые часы: ${formatWorkHours(routine.results.savedHoursPerMonth)}`;
    }
  }

  // Event listeners
  modeCustomBtn.addEventListener('click', () => {
    if (mode === 'custom') return;
    const previous = mode;
    mode = 'custom';
    tags = uncertaintyAfterModeChange(tags, previous, mode);
    syncConversionFieldWithMode();
    recalculateAndRender();
  });

  modePresetBtn.addEventListener('click', () => {
    if (mode === 'preset') return;
    const previous = mode;
    mode = 'preset';
    tags = uncertaintyAfterModeChange(tags, previous, mode);
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
    const niche = mode === 'preset' ? activeNiche() : null;

    const text = buildRevenueRiskShareText({
      leadsPerMonth: normalizedInput.leadsPerMonth,
      lateSharePercent: normalizedInput.lateSharePercent,
      conversionPercent: normalizedInput.conversionPercent,
      avgCheck: normalizedInput.avgCheck,
      lossFactorPercent: Math.round(normalizedInput.lossFactor * 100),
      mode,
      ...(niche ? { presetTitle: niche.title } : {}),
      lateLeads: calcResult.lateLeads,
      revenueAtRiskMax: calcResult.revenueAtRiskMax,
      revenueAtRiskPerYear: calcResult.revenueAtRiskPerYear,
      recoverableRevenue: calcResult.recoverableRevenue,
      costPerMissedDialog: calcResult.costPerMissedDialog,
      tags,
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

  let holdConfirmedRevenue = false;

  function persistRevenueDraft(step: number): void {
    const written = dossier.update((current) => ({
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
        presetId: storedPresetId(),
        uncertainty: tags,
        botCoverage,
      },
      ...(!holdConfirmedRevenue && current.revenue
        ? { revenue: { ...current.revenue, uncertainty: tags, botCoverage } }
        : {}),
    }));
    if (!holdConfirmedRevenue && written.dossier.revenue) {
      bridge.saveRevenueRiskResult(written.dossier.revenue);
    }
  }

  function finishRevenue(): void {
    const { calcResult, validation } = recalculateAndRender();
    if (!validation.isValid) return;
    holdConfirmedRevenue = false;
    const bridgeSnapshot = bridge.saveRevenueRiskResult({
      inputs: {
        leadsPerMonth: calcResult.normalizedInput.leadsPerMonth,
        lateSharePercent: calcResult.normalizedInput.lateSharePercent,
        conversionPercent: calcResult.normalizedInput.conversionPercent,
        avgCheck: calcResult.normalizedInput.avgCheck,
        lossFactor: calcResult.normalizedInput.lossFactor,
        mode,
        ...(storedPresetId() ? { presetId: storedPresetId() as string } : {}),
      },
      results: {
        lateLeads: calcResult.lateLeads,
        revenueAtRiskMax: calcResult.revenueAtRiskMax,
        recoverableRevenue: calcResult.recoverableRevenue,
        revenueAtRiskPerYear: calcResult.revenueAtRiskPerYear,
        costPerMissedDialog: calcResult.costPerMissedDialog,
      },
      uncertainty: tags,
      botCoverage,
    });
    dossier.update((current) =>
      recordMetricSnapshot({ ...current, revenue: bridgeSnapshot }, Date.now()),
    );
    bridge.send({
      fromTool: 'revenue-risk',
      toTool: meta.nextToolId,
      label: `${formatRubles(calcResult.revenueAtRiskMax)}/мес под риском`,
      suggestedValue: Math.max(
        15,
        Math.round(calcResult.normalizedInput.leadsPerMonth * 2),
      ),
      note: `${formatCountWithNoun(calcResult.normalizedInput.leadsPerMonth, ['обращение', 'обращения', 'обращений'])} в месяц, из них ${formatCountWithNoun(calcResult.lateLeads, ['позднее обращение', 'поздних обращения', 'поздних обращений'])}`,
      revenueRiskSnapshot: bridgeSnapshot,
    });
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  }

  lastErrors = validateRevenueRiskDraft({
    leadsPerMonthRaw: leadsRaw,
    lateSharePercentRaw: lateShareRaw,
    conversionPercentRaw: getActiveConversionRaw(),
    avgCheckRaw,
    lossFactorPercentRaw: recoveryRaw,
    mode,
  }).errors;

  function nicheNote(): HTMLParagraphElement {
    const note = document.createElement('p');
    note.className = 'field-note';
    note.hidden = true;
    return note;
  }

  interface RevenueUndo {
    readonly leads: string;
    readonly late: string;
    readonly check: string;
    readonly tags: UncertaintyProfile;
    readonly niche: BusinessNicheId | null;
    readonly mode: ConversionInputMode;
    readonly nicheConversionId: BusinessNicheId | null;
    readonly recovery: string;
  }
  let revenueUndo: RevenueUndo | null = null;
  let refreshNicheMenu = (): void => {};

  function paintNicheNotes(): void {
    const preset = nicheById(dossier.read().niche);
    nicheStrip.hidden = preset === null;
    nicheStrip.textContent = preset ? `Ниша: ${preset.title}` : '';
    const rows: readonly [HTMLParagraphElement, string, number | undefined][] = [
      [leadsNote, leadsRaw, preset?.leadsPerMonth],
      [lateNote, lateShareRaw, preset?.lateSharePercent],
      [checkNote, avgCheckRaw, preset?.avgCheck],
    ];
    for (const [note, raw, value] of rows) {
      const show = value !== undefined && nicheCaptionVisible(raw, value);
      note.hidden = !show;
      note.textContent = show ? NICHE_CAPTION : '';
    }
    refreshNicheMenu();
  }

  function applyRevenueNiche(preset: BusinessNichePreset): void {
    revenueUndo = {
      leads: leadsRaw,
      late: lateShareRaw,
      check: avgCheckRaw,
      tags,
      niche: dossier.read().niche,
      mode,
      nicheConversionId,
      recovery: recoveryRaw,
    };
    leadsRaw = String(preset.leadsPerMonth);
    lateShareRaw = String(preset.lateSharePercent);
    avgCheckRaw = String(preset.avgCheck);
    leadsInput.value = leadsRaw;
    lateInput.value = lateShareRaw;
    lateSlider.value = lateShareRaw;
    lateSlider.removeAttribute('aria-valuetext');
    checkInput.value = avgCheckRaw;
    mode = 'preset';
    nicheConversionId = preset.id;
    tags = applyNicheGuess(tags);
    writeRecovery(String(preset.recoveryPercent));
    dossier.update((current) => ({ ...current, niche: preset.id }));
    syncConversionFieldWithMode();
    holdConfirmedRevenue = true;
    recalculateAndRender();
    persistRevenueDraft(wizard.currentStep());
  }

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
    onRecalculate: recalculateAndRender,
  });
  refreshSteps = () => wizard.refresh();
  const nicheMenu = mountNicheMenu({
    dossier,
    prompt: nichePromptKind([leadsRaw, lateShareRaw, avgCheckRaw]),
    readFields: (preset) => revenueNicheFields({ leads: leadsRaw, late: lateShareRaw, check: avgCheckRaw }, preset),
    applyNumbers: applyRevenueNiche,
    applyLabel: (id) => {
      if (id) {
        mode = 'preset';
        nicheConversionId = id;
        const niche = nicheById(id);
        if (niche) writeRecovery(String(niche.recoveryPercent));
      } else {
        mode = 'custom';
        nicheConversionId = null;
      }
      dossier.update((current) => ({ ...current, niche: id }));
      nicheConversionId = storedNicheConversionCard(dossier.read().niche);
      syncConversionFieldWithMode();
      recalculateAndRender();
      persistRevenueDraft(wizard.currentStep());
      paintNicheNotes();
    },
    undo: () => {
      if (!revenueUndo) return;
      const previous = revenueUndo;
      revenueUndo = null;
      leadsRaw = previous.leads;
      lateShareRaw = previous.late;
      avgCheckRaw = previous.check;
      tags = previous.tags;
      mode = previous.mode;
      nicheConversionId = previous.nicheConversionId;
      recoveryRaw = previous.recovery;
      leadsInput.value = leadsRaw;
      lateInput.value = lateShareRaw;
      lateSlider.value = lateShareRaw === '' ? '0' : lateShareRaw;
      if (lateShareRaw.trim() === '') lateSlider.setAttribute('aria-valuetext', 'Не задано');
      checkInput.value = avgCheckRaw;
      lossInput.value = recoveryRaw;
      syncConversionFieldWithMode();
      holdConfirmedRevenue = false;
      dossier.update((current) => ({ ...current, niche: previous.niche }));
      recalculateAndRender();
      persistRevenueDraft(wizard.currentStep());
    },
    hasUndo: () => revenueUndo !== null,
  });
  refreshNicheMenu = () => nicheMenu.refresh();
  leadStep.prepend(nicheMenu.element);
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
