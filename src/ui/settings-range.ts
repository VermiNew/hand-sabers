export function updateRangeProgress(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const percentage = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, percentage))}%`);
}

export function updateSettingsSliderValue(input: HTMLInputElement): void {
  if (!input.id) return;
  const valueElement = document.querySelector<HTMLElement>(`.sp-value[data-for="${input.id}"]`);
  if (!valueElement) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const percentage = max === min ? 0 : ((value - min) / (max - min)) * 100;
  valueElement.textContent = `${Math.round(Math.max(0, Math.min(100, percentage)))}%`;
}

export function bindStyledRange(input: HTMLInputElement | null): void {
  if (!input) return;
  const update = () => {
    updateRangeProgress(input);
    updateSettingsSliderValue(input);
  };
  update();
  input.addEventListener('input', update);
}
