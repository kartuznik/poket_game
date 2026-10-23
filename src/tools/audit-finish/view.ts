import { copyTextToClipboard } from '../../lib/clipboard';
import { downloadTextFile } from '../../lib/csv';
import { validateContacts } from '../../lib/dossier';
import { JOURNEY_LENGTH, globalProgressPercent } from '../../lib/wizard';
import { TOOLS_CATALOG } from '../catalog';
import { REPORT_CSV_FILENAME, buildReportCsv } from '../final-report/export';
import { collectReportSources } from '../final-report/view';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from '../final-report/summary';
import type { ToolStubRenderContext } from '../stub-factory';
import { THREADS_PROFILE_URL, buildAuditHandoff, buildRecommendations } from './report';

export function renderAuditFinish(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['audit-finish'];
  const { bridge, dossier, onNavigateTool } = ctx;
  const sources = collectReportSources(bridge);
  const summary = buildFinalSummary(sources);
  const recommendations = buildRecommendations(sources);
  const storedContacts = dossier.read().contacts;

  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-audit-finish');

  const card = document.createElement('div');
  card.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-audit-finish';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = summary.hasData
    ? meta.subtitle
    : EMPTY_REPORT_TEXT;
  header.append(title, subtitle);

  const progress = document.createElement('div');
  progress.className = 'journey-progress';
  const progressLabel = document.createElement('span');
  progressLabel.className = 'journey-progress__label';
  progressLabel.id = 'progress-audit-finish-tool';
  progressLabel.textContent = `Инструмент ${JOURNEY_LENGTH} из ${JOURNEY_LENGTH}`;
  const track = document.createElement('div');
  track.className = 'journey-progress__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-labelledby', progressLabel.id);
  track.setAttribute('aria-valuemin', '1');
  track.setAttribute('aria-valuemax', String(JOURNEY_LENGTH));
  track.setAttribute('aria-valuenow', String(JOURNEY_LENGTH));
  track.setAttribute('aria-valuetext', 'Все четыре инструмента пройдены');
  const fill = document.createElement('span');
  fill.className = 'journey-progress__fill';
  fill.style.width = `${globalProgressPercent(JOURNEY_LENGTH)}%`;
  track.append(fill);
  const row = document.createElement('div');
  row.className = 'journey-progress__row';
  row.append(progressLabel, track);
  progress.append(row);

  card.append(header, progress);

  if (summary.hasData) {
    const lead = document.createElement('p');
    lead.className = 'result-card__note';
    lead.textContent = summary.lead;
    card.append(lead);

    const blocks = document.createElement('div');
    blocks.className = 'report-blocks';
    for (const block of summary.blocks) {
      const item = document.createElement('article');
      item.className = 'metric-box';
      const label = document.createElement('h3');
      label.className = 'metric-box__label';
      label.textContent = block.title;
      const text = document.createElement('p');
      text.className = 'report-block__text';
      text.textContent = block.text;
      item.append(label, text);
      if (block.lines && block.lines.length > 0) {
        const list = document.createElement('ul');
        list.className = 'rank-list';
        for (const line of block.lines) {
          const lineItem = document.createElement('li');
          lineItem.textContent = line;
          list.append(lineItem);
        }
        item.append(list);
      }
      if (block.sourceToolId && block.editStep) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'action-btn action-btn--secondary summary-block__edit';
        edit.textContent = 'Изменить';
        const toolId = block.sourceToolId;
        const step = block.editStep;
        edit.addEventListener('click', () => onNavigateTool(toolId, step));
        item.append(edit);
      }
      blocks.append(item);
    }
    card.append(blocks);
  }

  if (recommendations.length > 0) {
    const recTitle = document.createElement('h3');
    recTitle.className = 'check-group';
    recTitle.textContent = 'Что сделать дальше';
    const recList = document.createElement('ul');
    recList.className = 'rank-list';
    for (const item of recommendations) {
      const rowItem = document.createElement('li');
      rowItem.textContent = item;
      recList.append(rowItem);
    }
    card.append(recTitle, recList);
  }

  const formTitle = document.createElement('h3');
  formTitle.className = 'check-group';
  formTitle.textContent = 'Как с вами связаться';
  const formNote = document.createElement('p');
  formNote.className = 'field-hint';
  formNote.textContent =
    'Имя и Telegram или телефон. Описание бизнеса можно не заполнять. Текст останется у вас в буфере, пока вы сами не отправите его.';

  const contacts = {
    name: storedContacts.name,
    telegram: storedContacts.telegram,
    phone: storedContacts.phone,
    business: storedContacts.business,
  };
  let attempted = false;

  const nameError = document.createElement('p');
  nameError.className = 'field-error';
  nameError.hidden = true;
  const contactError = document.createElement('p');
  contactError.className = 'field-error';
  contactError.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.className = 'field-input';
  nameInput.id = 'audit-name';
  nameInput.type = 'text';
  nameInput.autocomplete = 'name';
  nameInput.value = contacts.name;
  nameInput.setAttribute('aria-describedby', 'audit-name-error');
  nameError.id = 'audit-name-error';

  const telegramInput = document.createElement('input');
  telegramInput.className = 'field-input';
  telegramInput.id = 'audit-telegram';
  telegramInput.type = 'text';
  telegramInput.autocomplete = 'username';
  telegramInput.placeholder = '@name';
  telegramInput.value = contacts.telegram;
  telegramInput.setAttribute('aria-describedby', 'audit-contact-error');

  const phoneInput = document.createElement('input');
  phoneInput.className = 'field-input';
  phoneInput.id = 'audit-phone';
  phoneInput.type = 'tel';
  phoneInput.autocomplete = 'tel';
  phoneInput.inputMode = 'tel';
  phoneInput.value = contacts.phone;
  phoneInput.setAttribute('aria-describedby', 'audit-contact-error');
  contactError.id = 'audit-contact-error';

  const businessInput = document.createElement('textarea');
  businessInput.className = 'field-input field-textarea';
  businessInput.id = 'audit-business';
  businessInput.rows = 3;
  businessInput.value = contacts.business;

  function remember(): void {
    contacts.name = nameInput.value;
    contacts.telegram = telegramInput.value;
    contacts.phone = phoneInput.value;
    contacts.business = businessInput.value;
    dossier.update((current) => ({ ...current, contacts: { ...contacts } }));
    refreshCsvState();
    if (attempted) showErrors();
  }

  function showErrors(): void {
    const result = validateContacts(contacts);
    nameError.hidden = !attempted || result.errors.name === null;
    nameError.textContent = result.errors.name ?? '';
    nameInput.setAttribute('aria-invalid', String(attempted && result.errors.name !== null));
    contactError.hidden = !attempted || result.errors.contact === null;
    contactError.textContent = result.errors.contact ?? '';
    const contactInvalid = attempted && result.errors.contact !== null;
    telegramInput.setAttribute('aria-invalid', String(contactInvalid));
    phoneInput.setAttribute('aria-invalid', String(contactInvalid));
  }

  function field(id: string, label: string, control: HTMLElement, error?: HTMLElement): HTMLElement {
    const group = document.createElement('div');
    group.className = 'field-group';
    const labelEl = document.createElement('label');
    labelEl.className = 'field-label';
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    group.append(labelEl, control);
    if (error) group.append(error);
    return group;
  }

  const form = document.createElement('form');
  form.className = 'contact-form';
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  for (const input of [nameInput, telegramInput, phoneInput, businessInput]) {
    input.addEventListener('input', remember);
  }
  form.append(
    field('audit-name', 'Имя', nameInput, nameError),
    field('audit-telegram', 'Telegram', telegramInput),
    field('audit-phone', 'Телефон', phoneInput, contactError),
    field('audit-business', 'Чем занимается бизнес', businessInput),
  );

  const actions = document.createElement('div');
  actions.className = 'audit-actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--primary';
  copyBtn.textContent = 'Скопировать отчёт для Ефима';
  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'action-btn action-btn--secondary';
  csvBtn.textContent = 'Скачать таблицу (.csv)';
  const threads = document.createElement('a');
  threads.className = 'action-btn action-btn--quiet';
  threads.href = THREADS_PROFILE_URL;
  threads.target = '_blank';
  threads.rel = 'noopener noreferrer';
  threads.textContent = 'Открыть Threads';
  actions.append(copyBtn, csvBtn, threads);

  function refreshCsvState(): void {
    const sources = collectReportSources(bridge);
    const hasTools = buildFinalSummary(sources).hasData;
    const hasContacts = [contacts.name, contacts.telegram, contacts.phone, contacts.business].some(
      (value) => value.trim().length > 0,
    );
    csvBtn.disabled = !hasTools && !hasContacts;
  }
  refreshCsvState();

  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  csvBtn.addEventListener('click', () => {
    remember();
    if (csvBtn.disabled) return;
    downloadTextFile(
      REPORT_CSV_FILENAME,
      buildReportCsv(collectReportSources(bridge), contacts),
      'text/csv;charset=utf-8',
    );
    toast.hidden = false;
    toast.textContent = 'Таблица скачана: business-game-report.csv.';
  });

  copyBtn.addEventListener('click', async () => {
    remember();
    attempted = true;
    showErrors();
    const result = validateContacts(contacts);
    if (!result.ok) {
      toast.hidden = false;
      toast.textContent = 'Заполните имя и Telegram или телефон.';
      if (result.errors.name) nameInput.focus();
      else telegramInput.focus();
      return;
    }
    const copied = await copyTextToClipboard(
      buildAuditHandoff(collectReportSources(bridge), contacts),
      'отчёт для Ефима',
    );
    toast.hidden = false;
    toast.textContent = copied.ok
      ? 'Отчёт скопирован. Откройте Threads и вставьте его в сообщение.'
      : copied.message;
  });

  form.append(actions, toast);
  card.append(formTitle, formNote, form);
  panel.append(card);
  container.append(panel);
}
