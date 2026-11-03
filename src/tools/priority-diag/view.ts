import { createFieldHeading } from '../../components/field-heading';
import { createResultBanner } from '../../components/result-banner';
import { appendPriorContext } from '../../components/prior-context';
import { releaseHelpTipsWithin } from '../../components/tooltip';
import { createWizard } from '../../components/wizard';
import { showStatusToast } from '../../components/toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import { recordMetricSnapshot } from '../../lib/dossier';
import { resolveInitialStep } from '../../lib/wizard';
import type { PriorityProcessId, PriorityScoreInput, RoutinePresetId } from '../../lib/types';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import { chipBoardModel } from './chips';
import {
  PRIORITY_PROCESSES,
  QUIET_TEXT,
  classifyBoard,
  composePriorityResults,
  rankProcesses,
  resolvePriority,
  scoresFromPain,
  tieQuestion,
  type PriorityBoard,
  type PriorityResolution,
  type RankedProcess,
} from './calc';
import type { PriorityScoreDraft } from '../../lib/dossier';

const PAIN_HELP =
  '1 — почти не болит, 5 — болит сильно. Эта цифра записывается сразу в частоту, время и цену ошибки.';

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
}

export function buildPriorityShareText(
  ranked: readonly RankedProcess[],
  board: PriorityBoard,
  resolution: PriorityResolution,
): string {
  const numbered = board.kind === 'leader';
  const lines = ranked
    .map((item, index) =>
      numbered
        ? `${index + 1}. ${item.title} — ${formatScore(item.score)}`
        : `${item.title} — ${formatScore(item.score)}`,
    )
    .join('\n');
  const lead =
    board.kind === 'quiet'
      ? QUIET_TEXT
      : board.kind === 'tied' && resolution.source === 'open'
        ? tieQuestion(board.peers.length)
        : resolution.reason;
  return [
    lead,
    '',
    lines,
    '',
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/#priority-diag',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

function selectedPain(row: PriorityScoreDraft): number | null {
  const { frequency, time, errorCost } = row;
  if (frequency === null || time === null || errorCost === null) return null;
  if (frequency === time && time === errorCost) return frequency;
  return null;
}

function hasMixedScores(row: PriorityScoreDraft): boolean {
  const { frequency, time, errorCost } = row;
  if (frequency === null || time === null || errorCost === null) return false;
  return frequency !== time || time !== errorCost;
}

export function renderPriorityDiagTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['priority-diag'];
  const { bridge, store, dossier, onNavigateTool, onWizardStep, initialStep } = ctx;
  bridge.consume('priority-diag');
  const saved = bridge.getPriorityResult();
  const draft = dossier.read().priorityDraft;
  const blank: PriorityScoreDraft = { frequency: null, time: null, errorCost: null };
  const sourceScores = draft?.scores ?? saved?.inputs ?? null;
  const scores: Record<PriorityProcessId, PriorityScoreDraft> = {
    inquiries: sourceScores ? { ...sourceScores.inquiries } : { ...blank },
    answers: sourceScores ? { ...sourceScores.answers } : { ...blank },
    booking: sourceScores ? { ...sourceScores.booking } : { ...blank },
    payment: sourceScores ? { ...sourceScores.payment } : { ...blank },
    reminders: sourceScores ? { ...sourceScores.reminders } : { ...blank },
    reports: sourceScores ? { ...sourceScores.reports } : { ...blank },
  };
  const openedStep = resolveInitialStep(1, initialStep, draft?.step ?? null);

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-priority-diag');

  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';
  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.hidden = true;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-priority-diag';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  inputCard.append(header);
  appendPriorContext(
    inputCard,
    {
      revenue: bridge.getRevenueRiskResult(),
      routine: bridge.getRoutineResult(),
      priority: null,
    },
    'priority-diag',
  );

  const stepPanel = document.createElement('div');
  stepPanel.className = 'step-panel';
  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent =
    'Оцените, насколько каждый процесс болит, от 1 до 5. Единица — почти не болит, пятёрка — болит сильно.';
  stepPanel.append(hint);

  for (const process of PRIORITY_PROCESSES) {
    const card = document.createElement('article');
    card.className = 'process-card';
    const heading = document.createElement('h3');
    heading.className = 'process-card__title';
    heading.textContent = process.title;
    const group = document.createElement('div');
    group.className = 'field-group';
    const scale = document.createElement('div');
    scale.className = 'choice-scale';
    scale.setAttribute('role', 'group');
    scale.setAttribute('aria-label', `${process.title}: насколько это больно`);
    const current = selectedPain(scores[process.id]);

    for (let value = 1; value <= 5; value += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-scale__btn';
      button.textContent = String(value);
      button.setAttribute('aria-pressed', String(current === value));
      button.setAttribute('aria-label', `${process.title}, насколько это больно: ${value}`);
      button.addEventListener('click', () => {
        scores[process.id] = scoresFromPain(value);
        for (const child of scale.querySelectorAll('button')) {
          child.setAttribute('aria-pressed', String(child === button));
        }
        const mixed = card.querySelector('.process-card__mixed');
        if (mixed) mixed.remove();
        recalculate();
      });
      scale.append(button);
    }

    const labelId = `pd-${process.id}-pain`;
    scale.id = labelId;
    group.append(
      createFieldHeading(labelId, 'Насколько это больно', '1–5', PAIN_HELP, () => scale).row,
      scale,
    );
    card.append(heading, group);
    if (hasMixedScores(scores[process.id])) {
      const mixed = document.createElement('p');
      mixed.className = 'field-hint process-card__mixed';
      mixed.textContent =
        'Сохранены разные оценки частоты, времени и цены ошибки. Новая цифра заменит все три.';
      card.append(mixed);
    }
    stepPanel.append(card);
  }

  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = '<span>ВАШИ ПРИОРИТЕТЫ</span><span>@_kartuzzz</span>';
  const noteEl = document.createElement('p');
  noteEl.className = 'result-card__note';
  const questionEl = document.createElement('p');
  questionEl.className = 'result-card__note';
  questionEl.hidden = true;
  const chipBox = document.createElement('div');
  chipBox.className = 'priority-chips';
  chipBox.setAttribute('role', 'group');
  chipBox.setAttribute('aria-label', 'Что сгорит первым, если неделю не трогать?');
  chipBox.hidden = true;
  const defaultLineEl = document.createElement('p');
  defaultLineEl.className = 'result-card__note';
  defaultLineEl.hidden = true;
  const list = document.createElement('ul');
  list.className = 'rank-list priority-rank';
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
  const howBody = document.createElement('p');
  howBody.className = 'info-details__body';
  const howBase =
    'Цифра «насколько это больно» записывается сразу в частоту, время и цену ошибки. Балл = частота × 0,4 + время × 0,3 + цена ошибки × 0,3. Равный балл сам лидера не выбирает.';
  howBody.textContent = howBase;
  how.append(howSummary, howBody);

  resultCard.append(
    createResultBanner(),
    eyebrow,
    noteEl,
    questionEl,
    chipBox,
    defaultLineEl,
    list,
    diffBox,
    actions,
    toast,
    how,
  );
  panel.append(inputCard);
  container.append(panel);

  let latestRanked: readonly RankedProcess[] | null = null;
  let latestBoard: PriorityBoard | null = null;
  let latestResolution: PriorityResolution | null = null;
  let pickedProcessId: PriorityProcessId | null = draft?.pickedProcessId ?? null;
  let draftStep = openedStep;

  function moneyContext(): { revenue: number | null; routine: number | null } {
    const revenue = bridge.getRevenueRiskResult();
    const routine = bridge.getRoutineResult();
    return {
      revenue: revenue ? revenue.results.recoverableRevenue : null,
      routine: routine ? routine.results.savedMoneyPerMonth : null,
    };
  }

  function savedRoutinePresets(): readonly RoutinePresetId[] {
    const routine = bridge.getRoutineResult();
    if (!routine) return [];
    const withItems = routine.inputs as typeof routine.inputs & {
      items?: readonly { presetId: RoutinePresetId | null }[];
    };
    if (withItems.items && withItems.items.length > 0) {
      return withItems.items.flatMap((item) => (item.presetId ? [item.presetId] : []));
    }
    return routine.inputs.presetId ? [routine.inputs.presetId] : [];
  }

  function completedScores(): Record<PriorityProcessId, PriorityScoreInput> | null {
    const next = {} as Record<PriorityProcessId, PriorityScoreInput>;
    for (const process of PRIORITY_PROCESSES) {
      const row = scores[process.id];
      if (row.frequency === null || row.time === null || row.errorCost === null) return null;
      next[process.id] = {
        frequency: row.frequency,
        time: row.time,
        errorCost: row.errorCost,
      };
    }
    return next;
  }

  function recalculate(): void {
    const ready = completedScores();
    if (!ready) {
      latestRanked = null;
      latestBoard = null;
      latestResolution = null;
      noteEl.textContent = '';
      questionEl.hidden = true;
      chipBox.hidden = true;
      chipBox.replaceChildren();
      defaultLineEl.hidden = true;
      list.replaceChildren();
      diffBox.hidden = true;
      refreshSteps();
      return;
    }
    const board = classifyBoard(ready);
    if (pickedProcessId && !board.peers.some((item) => item.id === pickedProcessId)) {
      pickedProcessId = null;
    }
    const resolution = resolvePriority(board, pickedProcessId, moneyContext(), savedRoutinePresets());
    const ranked = rankProcesses(ready).ranked;
    latestRanked = ranked;
    latestBoard = board;
    latestResolution = resolution;
    const leader = resolution.processId
      ? (ranked.find((item) => item.id === resolution.processId) ?? null)
      : null;

    if (board.kind === 'quiet') {
      noteEl.textContent = QUIET_TEXT;
      questionEl.hidden = true;
      chipBox.hidden = true;
      chipBox.replaceChildren();
      defaultLineEl.hidden = true;
    } else if (board.kind === 'leader' && leader) {
      noteEl.textContent = `Балл лидера ${formatScore(leader.score)} из 5. ${leader.recommendation}`;
      questionEl.hidden = true;
      chipBox.hidden = true;
      chipBox.replaceChildren();
      defaultLineEl.hidden = true;
    } else {
      const chips = chipBoardModel({
        peers: PRIORITY_PROCESSES.filter((peer) => board.peers.some((item) => item.id === peer.id)),
        source: resolution.source,
        processId: resolution.processId,
        pickedProcessId,
      });
      noteEl.textContent = resolution.reason;
      questionEl.hidden = false;
      questionEl.textContent = tieQuestion(board.peers.length);
      chipBox.hidden = false;
      chipBox.replaceChildren();
      for (const model of chips.chips) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = model.classNames.join(' ');
        chip.textContent = model.label;
        chip.setAttribute('aria-pressed', String(model.pressed));
        chip.addEventListener('click', () => {
          pickedProcessId = model.id;
          recalculate();
          persistPriorityDraft(draftStep);
        });
        chipBox.append(chip);
      }
      defaultLineEl.hidden = chips.defaultLine === null;
      defaultLineEl.textContent = chips.defaultLine ?? '';
    }

    list.classList.toggle('rank-list--ordered', board.kind === 'leader');
    const peerIds = new Set(board.peers.map((item) => item.id));
    list.replaceChildren();
    for (const item of ranked) {
      const row = document.createElement('li');
      row.textContent = `${item.title} — ${formatScore(item.score)}`;
      if (board.kind === 'leader' && item.id === leader?.id) row.className = 'rank-list__top';
      if (board.kind === 'tied' && peerIds.has(item.id)) {
        const badge = document.createElement('span');
        badge.className = 'rank-badge';
        badge.textContent = 'одинаковый балл';
        row.append(badge);
      }
      list.append(row);
    }
    howBody.textContent = `${howBase} ${resolution.reason}`;

    const stored = store.load('priority-diag');
    const nowLabel = leader?.title ?? 'Лидер не назначен';
    if (stored) {
      diffBox.hidden = false;
      diffBox.textContent = `Сравнение «До / После»: было «${stored.label}» → сейчас «${nowLabel}».`;
    } else {
      diffBox.hidden = true;
    }
    refreshSteps();
  }

  copyBtn.addEventListener('click', async () => {
    if (!latestRanked || !latestBoard || !latestResolution) return;
    const copied = await copyTextToClipboard(
      buildPriorityShareText(latestRanked, latestBoard, latestResolution),
      'приоритет для Threads',
    );
    showStatusToast(toast, copied.ok ? 'Скопировано резюме для Threads' : copied.message);
  });

  saveBtn.addEventListener('click', () => {
    if (!latestResolution || !latestRanked) return;
    const leader = latestRanked.find((item) => item.id === latestResolution?.processId) ?? null;
    const label = leader?.title ?? 'Лидер не назначен';
    store.save('priority-diag', {
      label,
      primaryValue: leader?.score ?? 0,
      formattedValue: leader ? `${leader.title} (${formatScore(leader.score)})` : label,
    });
    recalculate();
    showStatusToast(toast, `Сохранено «До»: ${label}.`);
  });

  function persistPriorityDraft(step: number): void {
    dossier.update((current) => ({
      ...current,
      priorityDraft: {
        step,
        scores: {
          inquiries: { ...scores.inquiries },
          answers: { ...scores.answers },
          booking: { ...scores.booking },
          payment: { ...scores.payment },
          reminders: { ...scores.reminders },
          reports: { ...scores.reports },
        },
        pickedProcessId,
      },
    }));
  }

  function finishPriority(): void {
    recalculate();
    const ready = completedScores();
    if (!ready) return;
    const snapshot = bridge.savePriorityResult({
      inputs: ready,
      results: composePriorityResults(ready, pickedProcessId, moneyContext(), savedRoutinePresets()),
    });
    dossier.update((current) =>
      recordMetricSnapshot({ ...current, priority: snapshot }, Date.now()),
    );
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  }

  let refreshSteps = (): void => {};
  const wizard = createWizard({
    toolId: 'priority-diag',
    initialStep: openedStep,
    panels: [stepPanel],
    extras: [resultCard],
    isStepValid: () => completedScores() !== null,
    finishLabel: meta.nextToolCta,
    onStep: (step) => {
      draftStep = step;
      onWizardStep(step);
      persistPriorityDraft(step);
      if (!latestRanked) resultCard.hidden = true;
    },
    onFinish: finishPriority,
  });
  refreshSteps = () => wizard.refresh();
  inputCard.append(wizard.progress, stepPanel, resultCard, wizard.nav, earlyReportBtn);

  earlyReportBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
