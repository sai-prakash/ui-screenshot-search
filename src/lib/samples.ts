export type SampleComponent = {
  id: string;
  label: string;
  category: string;
  description: string;
  tags: string[];
  src: string;
};

export const SAMPLES: SampleComponent[] = [
  {
    id: 'button-primary',
    label: 'Primary Button',
    category: 'Button',
    description:
      'Filled primary call-to-action button with rounded corners and bold label',
    tags: ['button', 'cta', 'primary', 'action'],
    src: '/samples/button-primary.svg',
  },
  {
    id: 'button-ghost',
    label: 'Ghost Button',
    category: 'Button',
    description: 'Subtle outlined ghost button for secondary actions',
    tags: ['button', 'ghost', 'secondary', 'outline'],
    src: '/samples/button-ghost.svg',
  },
  {
    id: 'input-text',
    label: 'Text Input',
    category: 'Input',
    description: 'Single-line text field with label and placeholder for forms',
    tags: ['input', 'text field', 'form', 'label'],
    src: '/samples/input-text.svg',
  },
  {
    id: 'input-search',
    label: 'Search Field',
    category: 'Input',
    description: 'Search input with magnifying glass icon and clear affordance',
    tags: ['search', 'input', 'filter', 'query'],
    src: '/samples/input-search.svg',
  },
  {
    id: 'card-stats',
    label: 'Stats Card',
    category: 'Card',
    description: 'Metric card showing KPI value with trend badge and caption',
    tags: ['card', 'stats', 'metric', 'dashboard', 'kpi'],
    src: '/samples/card-stats.svg',
  },
  {
    id: 'card-profile',
    label: 'Profile Card',
    category: 'Card',
    description: 'User profile card with avatar, name, role, and follow action',
    tags: ['card', 'profile', 'avatar', 'user'],
    src: '/samples/card-profile.svg',
  },
  {
    id: 'table-simple',
    label: 'Data Table',
    category: 'Table',
    description: 'Simple data table with header row and striped cells for lists',
    tags: ['table', 'data', 'grid', 'rows', 'list'],
    src: '/samples/table-simple.svg',
  },
  {
    id: 'modal-confirm',
    label: 'Confirm Modal',
    category: 'Modal',
    description:
      'Confirmation dialog modal with title, body copy, and dual actions',
    tags: ['modal', 'dialog', 'confirm', 'overlay', 'alert'],
    src: '/samples/modal-confirm.svg',
  },
  {
    id: 'empty-state',
    label: 'Empty State',
    category: 'Empty',
    description:
      'Empty state illustration with title, helper text, and create button',
    tags: ['empty', 'blank', 'zero state', 'placeholder', 'onboarding'],
    src: '/samples/empty-state.svg',
  },
  {
    id: 'badge-status',
    label: 'Status Badges',
    category: 'Badge',
    description: 'Colored status badges for success, warning, and error states',
    tags: ['badge', 'chip', 'status', 'pill', 'tag'],
    src: '/samples/badge-status.svg',
  },
  {
    id: 'tabs-underline',
    label: 'Underline Tabs',
    category: 'Tabs',
    description:
      'Horizontal tab list with underline indicator for active section',
    tags: ['tabs', 'navigation', 'underline', 'segment'],
    src: '/samples/tabs-underline.svg',
  },
  {
    id: 'tabs-pills',
    label: 'Pill Tabs',
    category: 'Tabs',
    description: 'Segmented pill tabs for switching between compact views',
    tags: ['tabs', 'pills', 'segmented control', 'toggle'],
    src: '/samples/tabs-pills.svg',
  },
  {
    id: 'toggle-switch',
    label: 'Toggle Switch',
    category: 'Control',
    description: 'On and off toggle switches for boolean settings',
    tags: ['toggle', 'switch', 'settings', 'control', 'boolean'],
    src: '/samples/toggle-switch.svg',
  },
  {
    id: 'navbar-top',
    label: 'Top Navbar',
    category: 'Navigation',
    description:
      'Application top navigation bar with logo links and avatar menu',
    tags: ['navbar', 'header', 'navigation', 'menu', 'app shell'],
    src: '/samples/navbar-top.svg',
  },
  {
    id: 'sidebar-nav',
    label: 'Sidebar Nav',
    category: 'Navigation',
    description:
      'Vertical sidebar navigation with icons and active item highlight',
    tags: ['sidebar', 'navigation', 'menu', 'vertical'],
    src: '/samples/sidebar-nav.svg',
  },
  {
    id: 'alert-banner',
    label: 'Alert Banner',
    category: 'Feedback',
    description: 'Inline alert banner for informational and warning messages',
    tags: ['alert', 'banner', 'notification', 'feedback', 'toast'],
    src: '/samples/alert-banner.svg',
  },
  {
    id: 'progress-bar',
    label: 'Progress Bar',
    category: 'Feedback',
    description: 'Linear progress indicator showing completion percentage',
    tags: ['progress', 'loading', 'bar', 'meter', 'percentage'],
    src: '/samples/progress-bar.svg',
  },
  {
    id: 'dropdown-menu',
    label: 'Dropdown Menu',
    category: 'Menu',
    description: 'Contextual dropdown menu with icons and keyboard shortcuts',
    tags: ['dropdown', 'menu', 'context', 'actions', 'popover'],
    src: '/samples/dropdown-menu.svg',
  },
  {
    id: 'avatar-group',
    label: 'Avatar Group',
    category: 'Avatar',
    description:
      'Overlapping avatar stack showing team members with overflow count',
    tags: ['avatar', 'group', 'team', 'users', 'stack'],
    src: '/samples/avatar-group.svg',
  },
];

/** Document text used when indexing components for text retrieval. */
export function sampleDocumentText(sample: SampleComponent): string {
  const tags = sample.tags.join(', ');
  return `title: ${sample.label} | text: ${sample.category} UI component. ${sample.description}. Tags: ${tags}.`;
}

export function queryText(q: string): string {
  return `task: search result | query: ${q}`;
}
