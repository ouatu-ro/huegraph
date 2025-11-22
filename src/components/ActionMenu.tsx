import { Show, createSignal, onCleanup, onMount } from "solid-js";

export type ActionMenuProps = {
  onSelect: (value: string) => void;
};

export default function ActionMenu(props: ActionMenuProps) {
  const [open, setOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const close = () => setOpen(false);

  const handleOutside = (ev: MouseEvent) => {
    if (!menuRef) return;
    if (ev.target instanceof Node && menuRef.contains(ev.target)) return;
    close();
  };

  onMount(() => {
    document.addEventListener("mousedown", handleOutside);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleOutside);
  });

  const triggerLabel = () => (open() ? "Actions ▲" : "Actions ▾");

  const fire = (value: string) => {
    props.onSelect(value);
    close();
  };

  return (
    <div class="action-menu" ref={menuRef}>
      <button class="action-menu__trigger" type="button" onClick={() => setOpen((v) => !v)}>
        {triggerLabel()}
      </button>
      <Show when={open()}>
        <div class="action-menu__list">
          <button class="action-menu__item" type="button" onClick={() => fire("focus")}>
            Bring into view
          </button>
          <button class="action-menu__item" type="button" onClick={() => fire("chart")}>
            Color families pie
          </button>
        </div>
      </Show>
    </div>
  );
}
