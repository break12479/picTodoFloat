import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Task } from "../types";
import TaskItem from "./TaskItem";

interface Props {
  task: Task;
  onRequestDelete: (task: Task) => void;
}

/** 把 TaskItem 包成可排序项：提供拖拽手柄与 transform。 */
export default function SortableTaskItem({ task, onRequestDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <TaskItem
      task={task}
      onRequestDelete={onRequestDelete}
      rootRef={setNodeRef}
      rootStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      dragging={isDragging}
      handle={{ attributes, listeners }}
    />
  );
}
