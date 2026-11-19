export function mobileControlIssues(viewport, controls) {
  const issues = [];
  for (const control of controls) {
    const box = control.box;
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) {
      issues.push(`${control.name}:missing`);
      continue;
    }
    if (Math.round(box.width) < 44 || Math.round(box.height) < 44) {
      issues.push(`${control.name}:small`);
    }
    if (
      box.x < -1 ||
      box.y < -1 ||
      box.x + box.width > viewport.width + 1 ||
      box.y + box.height > viewport.height + 1
    ) {
      issues.push(`${control.name}:outside`);
    }
    for (const other of controls) {
      if (other === control || !other.box || other.name <= control.name) continue;
      const overlapX =
        Math.min(box.x + box.width, other.box.x + other.box.width) - Math.max(box.x, other.box.x);
      const overlapY =
        Math.min(box.y + box.height, other.box.y + other.box.height) - Math.max(box.y, other.box.y);
      if (overlapX > 1 && overlapY > 1) issues.push(`${control.name}:${other.name}:overlap`);
    }
  }
  return issues;
}
