"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateRequestStatus } from "@/app/actions/requests";
import { NewRequestPanel } from "@/components/maintenance/new-request-panel";
import { RequestDetailModal } from "@/components/pipeline/request-detail-modal";

export type KanbanRequest = {
  id: string;
  title: string;
  description: string | null;
  status: "requested" | "in_progress" | "waiting_on_client" | "done";
  source: string;
  updatedAt: string;
  client: { id: string; name: string };
  messageCount?: number;
};

type ClientOption = { id: string; name: string };

const COLUMNS: {
  key: KanbanRequest["status"];
  label: string;
}[] = [
  { key: "requested", label: "Pedidos" },
  { key: "in_progress", label: "Em curso" },
  { key: "waiting_on_client", label: "À espera" },
  { key: "done", label: "Concluído" },
];

const FLOW = COLUMNS.map((c) => c.key);
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function RequestCard({
  request,
  showClient,
  interactive,
  onNudge,
  onOpen,
}: {
  request: KanbanRequest;
  showClient: boolean;
  interactive: boolean;
  onNudge: (dir: -1 | 1) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: request.id,
    data: { status: request.status },
    disabled: !interactive,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  const idx = FLOW.indexOf(request.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-surface p-3 shadow-sm"
    >
      <div className="flex items-start gap-2">
        {interactive ? (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none rounded px-0.5 text-muted hover:bg-default active:cursor-grabbing"
            aria-label="Arrastar"
            {...listeners}
            {...attributes}
          >
            ⋮⋮
          </button>
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
        >
          <p className="text-sm font-medium leading-snug">{request.title}</p>
          <p className="mt-1 text-xs text-muted">
            {showClient ? `${request.client.name} · ` : ""}
            {request.source}
            {request.messageCount ? ` · ${request.messageCount} msg` : ""}
          </p>
        </button>
      </div>
      {interactive ? (
        <div className="mt-2 flex gap-1 pl-6">
          <button
            type="button"
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted disabled:opacity-30"
            disabled={idx <= 0}
            onClick={(e) => {
              e.stopPropagation();
              onNudge(-1);
            }}
            aria-label="Mover para a esquerda"
          >
            ←
          </button>
          <button
            type="button"
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted disabled:opacity-30"
            disabled={idx >= FLOW.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onNudge(1);
            }}
            aria-label="Mover para a direita"
          >
            →
          </button>
          <button
            type="button"
            className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted"
            onClick={onOpen}
          >
            Abrir
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted"
            onClick={onOpen}
          >
            Abrir / responder
          </button>
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  label,
  items,
  showClient,
  interactive,
  onNudge,
  onOpen,
}: {
  status: KanbanRequest["status"];
  label: string;
  items: KanbanRequest[];
  showClient: boolean;
  interactive: boolean;
  onNudge: (id: string, dir: -1 | 1) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !interactive,
  });

  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? "flex min-h-48 flex-col rounded-xl bg-accent/15 p-2 ring-2 ring-accent/30"
          : "flex min-h-48 flex-col rounded-xl bg-default p-2"
      }
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </h3>
        <span className="text-xs text-muted">{items.length}</span>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {items.map((r) => (
          <li key={r.id}>
            <RequestCard
              request={r}
              showClient={showClient}
              interactive={interactive}
              onNudge={(dir) => onNudge(r.id, dir)}
              onOpen={() => onOpen(r.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClientWorkBoard({
  clients,
  requests,
  lockedClientId,
  readOnly = false,
  title,
  portalToken,
}: {
  clients: ClientOption[];
  requests: KanbanRequest[];
  lockedClientId: string;
  readOnly?: boolean;
  title?: string;
  portalToken?: string;
}) {
  const router = useRouter();
  const [showOldDone, setShowOldDone] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const interactive = !readOnly;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    return requests.filter((r) => {
      if (r.client.id !== lockedClientId) return false;
      if (r.status === "done" && !showOldDone) {
        return now - new Date(r.updatedAt).getTime() <= FOURTEEN_DAYS_MS;
      }
      return true;
    });
  }, [requests, lockedClientId, showOldDone]);

  const byStatus = useMemo(() => {
    const map: Record<KanbanRequest["status"], KanbanRequest[]> = {
      requested: [],
      in_progress: [],
      waiting_on_client: [],
      done: [],
    };
    for (const r of filtered) map[r.status].push(r);
    return map;
  }, [filtered]);

  const activeRequest = activeId
    ? (requests.find((r) => r.id === activeId) ?? null)
    : null;

  function moveTo(id: string, status: KanbanRequest["status"]) {
    if (!interactive) return;
    startTransition(async () => {
      await updateRequestStatus(id, status);
      router.refresh();
    });
  }

  function onNudge(id: string, dir: -1 | 1) {
    const item = requests.find((r) => r.id === id);
    if (!item) return;
    const next = FLOW[FLOW.indexOf(item.status) + dir];
    if (next) moveTo(id, next);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const nextStatus = FLOW.includes(overId as KanbanRequest["status"])
      ? (overId as KanbanRequest["status"])
      : requests.find((r) => r.id === overId)?.status;
    if (!nextStatus) return;
    const current = requests.find((r) => r.id === String(active.id));
    if (!current || current.status === nextStatus) return;
    moveTo(String(active.id), nextStatus);
  }

  const board = (
    <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => (
        <Column
          key={col.key}
          status={col.key}
          label={col.label}
          items={byStatus[col.key]}
          showClient={false}
          interactive={interactive}
          onNudge={onNudge}
          onOpen={setOpenRequestId}
        />
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {title ? (
            <h2 className="mr-auto text-lg font-medium">{title}</h2>
          ) : (
            <span className="mr-auto" />
          )}
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showOldDone}
              onChange={(e) => setShowOldDone(e.target.checked)}
            />
            Mostrar concluídos antigos
          </label>
          {interactive ? (
            <button
              type="button"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white xl:hidden"
              onClick={() => setMobilePanel(true)}
            >
              Novo pedido
            </button>
          ) : null}
        </div>

        {interactive ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            {board}
            <DragOverlay>
              {activeRequest ? (
                <div className="rounded-lg border border-accent/40 bg-surface p-3 shadow-lg">
                  <p className="text-sm font-medium">{activeRequest.title}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          board
        )}
      </div>

      {interactive ? (
        <NewRequestPanel
          clients={clients}
          defaultClientId={lockedClientId}
          lockClient
          mobileOpen={mobilePanel}
          onMobileOpenChange={setMobilePanel}
        />
      ) : null}

      {openRequestId ? (
        <RequestDetailModal
          requestId={openRequestId}
          mode={portalToken ? "portal" : "admin"}
          portalToken={portalToken}
          onClose={() => setOpenRequestId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
