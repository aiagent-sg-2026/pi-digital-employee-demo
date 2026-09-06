import type { EmployeeTask, TaskState } from "./contracts";

const transitions: Record<TaskState, readonly TaskState[]> = {
  CREATED: ["RUNNING", "FAILED"],
  RUNNING: ["VERIFYING", "FAILED"],
  VERIFYING: ["COMPLETED", "NEEDS_REVIEW", "FAILED"],
  COMPLETED: [],
  NEEDS_REVIEW: [],
  FAILED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return transitions[from].includes(to);
}

export function transitionTask(task: EmployeeTask, to: TaskState): EmployeeTask {
  if (!canTransition(task.state, to)) {
    throw new Error(`Invalid task transition: ${task.state} -> ${to}`);
  }
  return { ...task, state: to };
}
