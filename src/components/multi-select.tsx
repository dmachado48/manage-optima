"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
  count?: number;
};

const PANEL_WIDTH_PX = 256;

/**
 * Filtro de seleção múltipla.
 * `selected` vazio significa «sem filtro» (todas as opções).
 * O botão mostra sempre um rótulo curto; o painel tem largura fixa e abre
 * por cima do conteúdo sem o empurrar.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyLabel = "Todos",
  align = "auto",
}: {
  label: string;
  options: MultiSelectOption[];
  /** Empty means every option. */
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  align?: "auto" | "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const focusOnOpen = useRef(false);

  const showingAll =
    selected.length === 0 || selected.length === options.length;

  // Decide o lado do painel no momento de abrir, para não sair do ecrã.
  function openPanel() {
    if (align === "auto") {
      const rect = triggerRef.current?.getBoundingClientRect();
      setFlip(
        !!rect &&
          rect.left + PANEL_WIDTH_PX > window.innerWidth - 8 &&
          rect.right - PANEL_WIDTH_PX >= 8,
      );
    } else {
      setFlip(align === "end");
    }
    setOpen(true);
  }

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Fecha com clique fora, Escape ou quando o foco sai do componente.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Abertura por teclado: passa o foco para a primeira opção.
  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      focusItem(1);
    }
  });

  const selectedOptions = options.filter((option) =>
    selected.includes(option.value),
  );
  const summary = showingAll
    ? emptyLabel
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(", ")
      : `${selectedOptions.length} de ${options.length}`;

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(next);
  }

  function focusItem(delta: number) {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-ms-item]:not(:disabled)",
      ) ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      index === -1
        ? delta > 0
          ? 0
          : items.length - 1
        : (index + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function onPanelKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : openPanel())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) focusItem(1);
            else {
              focusOnOpen.current = true;
              openPanel();
            }
          }
        }}
        className="flex h-9 w-full min-w-[12rem] max-w-full items-center gap-2 rounded-lg! border border-border bg-surface px-3! py-0! text-left text-sm! font-normal! normal-case! tracking-normal! leading-normal! hover:bg-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="shrink-0 text-xs text-muted">{label}</span>
        <span
          className={
            showingAll
              ? "min-w-0 flex-1 truncate text-muted"
              : "min-w-0 flex-1 truncate font-medium"
          }
        >
          {summary}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`size-3 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          style={{ width: PANEL_WIDTH_PX }}
          className={`absolute top-full z-40 mt-1 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-surface p-1 shadow-lg ${flip ? "right-0" : "left-0"}`}
        >
          <ul className="m-0 list-none p-0">
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    data-ms-item
                    onClick={() => toggle(option.value)}
                    className="flex min-h-9 w-full items-center gap-2.5 rounded-md! px-2! py-1.5! text-left text-sm! font-normal! normal-case! tracking-normal! leading-normal! hover:bg-default focus-visible:bg-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-accent bg-accent text-white" : "border-border bg-surface"}`}
                    >
                      {checked ? (
                        <svg viewBox="0 0 12 12" className="size-3" fill="none">
                          <path
                            d="m2.5 6.2 2.2 2.2 4.8-4.8"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.count != null ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {option.count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-border px-2 pt-1.5 pb-0.5">
            <button
              type="button"
              data-ms-item
              disabled={selected.length === 0}
              onClick={() => onChange([])}
              className="rounded! px-1! py-1! text-xs! font-normal! normal-case! tracking-normal! text-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:no-underline disabled:opacity-50"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              data-ms-item
              onClick={() => close(true)}
              className="rounded! px-1! py-1! text-xs! font-medium! normal-case! tracking-normal! underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
