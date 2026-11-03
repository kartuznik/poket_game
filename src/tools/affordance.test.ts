import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`missing ${selector}`);
  return match[1];
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`missing ${name}`);
  return match[1].trim();
}

describe('edit button and chip rest', () => {
  it('keeps the edit control on the current step and styles it as a button', () => {
    const wizard = readFileSync(resolve(root, 'src/components/wizard.ts'), 'utf8');
    expect(wizard).toContain("editBtn.className = 'wizard-edit'");
    expect(wizard).toContain("editBtn.textContent = 'Изменить цифры'");
    expect(wizard).toContain('answer.prepend(editBtn)');
    const listener = wizard.slice(
      wizard.indexOf('editBtn.addEventListener'),
      wizard.indexOf('function showResult'),
    );
    expect(listener).toContain('inputsOpen = true');
    expect(listener).toContain('holdFields = true');
    expect(listener).toContain('revealResult = false');
    expect(listener).not.toContain('step -=');
    expect(listener).not.toContain('step = 1');

    const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8');
    const edit = rule(css, '.wizard-edit');
    expect(edit).toContain('width: 100%');
    expect(edit).toContain('max-width: 100%');
    expect(edit).toContain('min-height: 44px');
    expect(edit).toContain('box-sizing: border-box');
    expect(edit).toContain('background: var(--bg-surface)');
    expect(edit).toContain('border: var(--border-width) solid var(--border-strong)');
    expect(edit).toContain('box-shadow: var(--shadow-button)');

    const chip = rule(css, '.priority-chip');
    expect(chip).toContain('min-height: 44px');
    expect(chip).toContain('background: var(--bg-surface)');
    expect(chip).toContain('border: var(--border-width) solid var(--border-strong)');
    expect(chip).toContain('box-shadow: var(--shadow-button)');
    expect(rule(css, '.priority-chip:hover')).toContain(
      'background: color-mix(in srgb, var(--accent-primary) 8%, transparent)',
    );
    expect(rule(css, ".priority-chip[aria-pressed='true']")).toContain(
      'background: color-mix(in srgb, var(--accent-primary) 18%, transparent)',
    );

    const tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');
    const light = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(':root[data-color-scheme="dark"]'));
    const dark = tokens.slice(tokens.indexOf(':root[data-color-scheme="dark"]'));
    expect(token(light, '--bg-surface')).not.toBe(token(light, '--bg-page'));
    expect(token(dark, '--bg-surface')).not.toBe(token(dark, '--bg-page'));
  });
});
