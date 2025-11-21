import { createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";

type HandleSize = { width: number; height: number };

type DrawerClassNames = {
  root?: string;
  panel?: string;
  handle?: string;
  body?: string;
};

export type SideDrawerProps = {
  width?: number;
  defaultOpen?: boolean;
  handleSize?: HandleSize;
  handleAngle?: number;
  classNames?: DrawerClassNames;
  style?: JSX.CSSProperties;
  children: JSX.Element;
};

export default function SideDrawer(props: SideDrawerProps) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  const panelWidth = () => props.width ?? 360;
  const handle = createMemo<HandleSize>(() => {
    const fallback: HandleSize = { width: 60, height: 120 };
    const size = props.handleSize ?? fallback;
    return {
      width: size.width || fallback.width,
      height: size.height || fallback.height,
    };
  });

  const clipPath = createMemo(() => {
    const { width, height } = handle();
    const angle = props.handleAngle ?? 14;
    const taperPx = Math.tan((angle * Math.PI) / 180) * height;
    const clamped = Math.min(width * 0.8, Math.max(0, taperPx));
    const bottomInsetPct = Math.max(0, (clamped / width) * 100);
    return `polygon(0 0, 100% 0, 100% 100%, ${bottomInsetPct}% 100%)`;
  });

  const closedOffset = () => `${panelWidth() - handle().width * 0.35}px`;
  const toggle = () => setOpen((v) => !v);

  return (
    <div
      class={`side-drawer ${open() ? "open" : "closed"} ${props.classNames?.root ?? ""}`}
      style={{
        "--drawer-handle-width": `${handle().width}px`,
        "--drawer-handle-height": `${handle().height}px`,
        ...props.style,
      }}
    >
      <div
        class="side-drawer__track"
        style={{
          transform: open() ? "translate3d(0, 0, 0)" : `translate3d(${closedOffset()}, 0, 0)`,
        }}
      >
        <div
          class={`side-drawer__panel ${props.classNames?.panel ?? ""}`}
          style={{
            width: `${panelWidth()}px`,
          }}
        >
          <div class={`side-drawer__body ${props.classNames?.body ?? ""}`}>
            {props.children}
          </div>
        </div>
        <button
          type="button"
          class={`side-drawer__handle ${open() ? "open" : "closed"} ${props.classNames?.handle ?? ""}`}
          style={{
            width: `${handle().width}px`,
            height: `${handle().height}px`,
            "clip-path": clipPath(),
          }}
          aria-label={open() ? "Collapse controls" : "Expand controls"}
          aria-expanded={open()}
          onClick={toggle}
        >
          <span class={`side-drawer__chevron ${open() ? "open" : ""}`}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3.5 5 8l5 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
