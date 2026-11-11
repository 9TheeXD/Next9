"use client";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

// Drag-and-drop reordering for the admin editors (mouse, touch and keyboard). Items need stable ids
// while the list is on screen; plain values (strings) get generated ones that follow them around.

let seq = 0;
const newId = () => `i${seq++}`;

export function SortableList<T>({
  items,
  onChange,
  layout = "vertical",
  render,
  className,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  layout?: "vertical" | "grid" | "horizontal";
  render: (item: T, index: number, handle: React.HTMLAttributes<HTMLElement>, dragging: boolean) => React.ReactNode;
  className?: string;
}) {
  // Ids follow the items while they are dragged; added items get new ones at the end.
  const [ids, setIds] = useState<string[]>(() => items.map(newId));
  let idList = ids;
  if (ids.length !== items.length) {
    idList = ids.length < items.length ? [...ids, ...Array.from({ length: items.length - ids.length }, newId)] : ids.slice(0, items.length);
    setIds(idList);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const strategy = layout === "grid" ? rectSortingStrategy : layout === "horizontal" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  function onDragEnd(e: DragEndEvent) {
    const from = idList.indexOf(String(e.active.id));
    const to = e.over ? idList.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    setIds(arrayMove(idList, from, to));
    onChange(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={idList} strategy={strategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableItem key={idList[i]} id={idList[i]}>
              {(handle, dragging) => render(item, i, handle, dragging)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, children }: { id: string; children: (handle: React.HTMLAttributes<HTMLElement>, dragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "a-dragging" : undefined}>
      {children({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>, isDragging)}
    </div>
  );
}
