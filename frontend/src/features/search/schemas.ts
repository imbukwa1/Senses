import { z } from "zod";

export const searchResultSchema = z.object({
  result_type: z.enum(["project", "phase", "task"]),
  project_id: z.uuid(),
  project_code: z.string().min(1),
  project_name: z.string().min(1),
  phase_id: z.uuid().nullable(),
  phase_name: z.string().nullable(),
  task_id: z.uuid().nullable(),
  task_name: z.string().nullable(),
  status: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const searchResultsSchema = z.array(searchResultSchema);
