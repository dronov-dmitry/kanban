import { createContext, useContext } from 'react';
import type { BoardSummary, WorkspaceSummary } from '../lib/api-types';

export interface WorkspaceContextValue {
  workspace: WorkspaceSummary | null;
  role: string;
  boards: BoardSummary[];
  loading: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  role: 'viewer',
  boards: [],
  loading: false,
});

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
