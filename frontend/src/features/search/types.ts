export type SearchResultType = "project" | "phase" | "task";

export type SearchResult = {
  result_type: SearchResultType;
  project_id: string;
  project_code: string;
  project_name: string;
  phase_id: string | null;
  phase_name: string | null;
  task_id: string | null;
  task_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
