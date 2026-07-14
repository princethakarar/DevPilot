import type { Templates } from "@/lib/db/schemas";
import type { SVGProps } from "react";

/**
 * Shared per-template icon set. Originally lived only in
 * template-selecting-modal.tsx; extracted so the dashboard project list can
 * show the same mark next to each project (and so there's exactly one place
 * to add a new template's icon instead of two).
 */
export type IconProps = SVGProps<SVGSVGElement>;

export function ReactIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.3">
        <ellipse cx="12" cy="12" rx="9" ry="3.8" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" />
      </g>
    </svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M8.5 8v8M8.5 8l7 8M15.5 8v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExpressIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M9 8h6M9 8v8h6M9 12h4.2" />
    </svg>
  );
}

export function VueIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      <path d="M3 5h4l5 8 5-8h4l-9 15z" />
      <path d="M7 5h3.2L12 8l1.8-3H17l-5 8.6z" opacity="0.55" />
    </svg>
  );
}

export function AngularIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" {...props}>
      <path d="M12 2.5l8.5 3.1-1.3 11L12 21.5l-7.2-4.9-1.3-11z" />
      <path d="M12 6.8l4 9.7h-1.9l-.85-2.1h-2.5l-.85 2.1H8l4-9.7z" />
      <path d="M12 9.3l-1.35 3.35h2.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function NodeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" {...props}>
      <path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" />
      <path d="M12 2.5v6.1M4 7.1l8 4.6 8-4.6M12 21.5v-6.1" opacity="0.6" />
    </svg>
  );
}

export function HonoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 3v18M4 12h9" />
      <path d="M13 3c3 3 6 5.5 6 9.5S16 21 13 21" opacity="0.6" />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export const TEMPLATE_ICON: Partial<Record<Templates, (props: IconProps) => React.JSX.Element>> = {
  REACT: ReactIcon,
  NEXTJS: NextIcon,
  EXPRESS: ExpressIcon,
  VUE: VueIcon,
  ANGULAR: AngularIcon,
  NODE: NodeIcon,
  HONO: HonoIcon,
};

/** Brand tint applied to each template's icon. */
export const TEMPLATE_ACCENT: Partial<Record<Templates, string>> = {
  REACT: "#61DAFB",
  NEXTJS: "#F1F5F9",
  EXPRESS: "#E2E8F0",
  VUE: "#42B883",
  ANGULAR: "#DD0031",
  NODE: "#83CD29",
  HONO: "#FF6B00",
};

export const TEMPLATE_LABEL: Partial<Record<Templates, string>> = {
  REACT: "React",
  NEXTJS: "Next.js",
  EXPRESS: "Express",
  VUE: "Vue",
  ANGULAR: "Angular",
  NODE: "Node.js",
  HONO: "Hono",
};
