export function revealInvalidField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  let section = target.closest("details");
  while (section) {
    section.open = true;
    section = section.parentElement?.closest("details") ?? null;
  }
}
