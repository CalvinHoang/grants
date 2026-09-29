// Small line icons (spec 03 §5): controls only, stroke in currentColor, hidden from screen readers.
import type { ReactNode } from "react";

function Icon({ size, viewBox, width = 1.5, children }: { size: number; viewBox: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const MenuIcon = () => (
  <Icon size={18} viewBox={18}>
    <path d="M3 5h12M3 9h12M3 13h12" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon size={16} viewBox={16}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon size={16} viewBox={16}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const PanelLeftIcon = () => (
  <Icon size={18} viewBox={18}>
    <rect x="2.5" y="3.5" width="13" height="11" rx="2" />
    <path d="M7 3.5v11" />
  </Icon>
);

export const PanelRightIcon = () => (
  <Icon size={18} viewBox={18}>
    <rect x="2.5" y="3.5" width="13" height="11" rx="2" />
    <path d="M11 3.5v11" />
  </Icon>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <span className="chevron" data-open={open}>
    <Icon size={12} viewBox={12}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </Icon>
  </span>
);

export const ChevronDownIcon = () => (
  <Icon size={12} viewBox={12}>
    <path d="M3 4.5 6 7.5l3-3" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon size={16} viewBox={16} width={1.4}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3" />
  </Icon>
);

export const CloudIcon = () => (
  <Icon size={14} viewBox={16} width={1.4}>
    <path d="M4.5 12.5h7a3 3 0 0 0 .4-6 4 4 0 0 0-7.7.9A2.6 2.6 0 0 0 4.5 12.5z" />
  </Icon>
);

export const FolderIcon = () => (
  <Icon size={13} viewBox={14} width={1.4}>
    <path d="M1.5 3.5h4l1.5 1.5h5.5v6.5h-11z" />
  </Icon>
);

export const RedraftIcon = () => (
  <Icon size={14} viewBox={14}>
    <path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2" />
    <path d="M11.5 2.5v2.3H9.2" />
  </Icon>
);

export const SendIcon = () => (
  <Icon size={16} viewBox={16} width={1.75}>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Icon>
);
