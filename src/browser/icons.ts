export type IconName =
  | "home" | "work" | "mail" | "approval" | "users" | "tasks" | "history"
  | "skills" | "link" | "settings" | "search" | "bell" | "plus" | "sparkle"
  | "send" | "file" | "chart" | "alert" | "chevron-down" | "arrow-right"
  | "circle" | "circle-dot" | "status-dot" | "check" | "x" | "shield" | "code";

const paths: Record<IconName, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
  work: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  approval: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3h6v4H9zM8 13l2.5 2.5L16 10"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.5.5 3.8 2.2 4 5"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l2 2 5-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  skills: '<path d="m12 2 1.4 4.1L17.5 7.5l-4.1 1.4L12 13l-1.4-4.1-4.1-1.4 4.1-1.4zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21h-4v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H3v-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1L7 4.1l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3h4a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1L19.9 7l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21v4h-.1a1.8 1.8 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  send: '<path d="m3 3 18 9-18 9 4-9zM7 12h14"/>',
  file: '<path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/>',
  "chevron-down": '<path d="m7 10 5 5 5-5"/>',
  "arrow-right": '<path d="M5 12h14M14 7l5 5-5 5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  "circle-dot": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  "status-dot": '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m8 12 2.5 2.5L16 9"/>',
  code: '<path d="m9 7-5 5 5 5M15 7l5 5-5 5M13 5l-2 14"/>',
};

export function svgIcon(name: IconName, className = "icon-svg", label?: string): string {
  const aria = label ? ` role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : ' aria-hidden="true"';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${aria}>${paths[name]}</svg>`;
}

export function hydrateSvgIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
    const name = node.dataset.icon as IconName | undefined;
    if (!name || !(name in paths)) return;
    node.innerHTML = svgIcon(name);
  });
}
