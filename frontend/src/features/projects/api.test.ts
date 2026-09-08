import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPhaseMember,
  addProjectMember,
  archiveProject,
  createWorkspaceFolder,
  createProject,
  deleteWorkspaceFolder,
  downloadProjectFile,
  getProjectBudget,
  getWorkspaceContents,
  listAttention,
  listMyWork,
  listPhaseMembers,
  listProjectFiles,
  moveWorkspaceFile,
  uploadTaskFile,
  updateWorkspaceFolder,
  updateProjectBudget,
  updateTaskStatus,
} from "./api";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "PRJ-2026-001",
  name: "Inclusive Speech Tech",
  description: "Project description",
  project_lead_id: "22222222-2222-4222-8222-222222222222",
  project_lead: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Project Lead",
    email: "lead@senseshub.com",
  },
  current_phase_id: null,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  status: "Planning",
  health: "Active",
  health_color: "purple",
  health_label: "On track",
  health_reasons: [],
  funder_partner: null,
  project_type: null,
  objectives: null,
  priority: "Medium",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

const member = {
  project_id: project.id,
  user_id: "33333333-3333-4333-8333-333333333333",
  name: "A. Member",
  email: "member@senseshub.com",
  role: "Team Member",
  joined_at: "2026-01-01T00:00:00Z",
};

const phaseId = "44444444-4444-4444-8444-444444444444";

const phaseMember = {
  phase_id: phaseId,
  user_id: member.user_id,
  name: member.name,
  email: member.email,
  added_at: "2026-01-01T00:00:00Z",
};

const myWorkItem = {
  task_id: "55555555-5555-4555-8555-555555555555",
  task_name: "Draft implementation plan",
  project_id: project.id,
  project_name: project.name,
  project_code: project.code,
  phase_id: phaseId,
  phase_name: "Discovery",
  due_date: "2026-09-05",
  status: "In Progress",
  relationship: "owner",
  overdue: false,
  action_label: "Due today",
};

const task = {
  id: myWorkItem.task_id,
  project_id: project.id,
  phase_id: phaseId,
  name: myWorkItem.task_name,
  description: "Draft the implementation plan.",
  owner_id: member.user_id,
  owner: {
    id: member.user_id,
    name: member.name,
    email: member.email,
  },
  priority: "Medium",
  status: "Completed",
  start_date: null,
  due_date: myWorkItem.due_date,
  completed_at: "2026-09-05T12:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-05T12:00:00Z",
};

const attentionItem = {
  type: "task",
  reason: "Draft implementation plan is overdue",
  project_id: project.id,
  project_name: project.name,
  project_code: project.code,
  phase_id: phaseId,
  phase_name: "Discovery",
  task_id: myWorkItem.task_id,
  task_name: myWorkItem.task_name,
  assigned_person: {
    id: member.user_id,
    name: member.name,
    email: member.email,
  },
  due_date: "2026-09-01",
  severity: "Needs attention",
};

const projectBudget = {
  project_id: project.id,
  allocated: 1000,
  spent: 250,
  remaining: 750,
  utilisation: 0.25,
};

const projectFile = {
  id: "77777777-7777-4777-8777-777777777777",
  task_id: myWorkItem.task_id,
  uploaded_by: member.user_id,
  uploader_name: member.name,
  uploader_email: member.email,
  file_name: "finance-report.pdf",
  file_type: "application/pdf",
  file_size: 9,
  file_category: "finance",
  created_at: "2026-09-07T07:03:00Z",
  project_id: project.id,
  phase_id: phaseId,
  phase_name: "Discovery",
  task_name: myWorkItem.task_name,
};

const workspaceFolder = {
  id: "88888888-8888-4888-8888-888888888888",
  project_id: project.id,
  parent_folder_id: null,
  name: "Research",
  created_by: member.user_id,
  created_at: "2026-09-07T07:03:00Z",
  updated_at: "2026-09-07T07:03:00Z",
};

const workspaceFile = {
  ...projectFile,
  folder_id: null,
};

describe("project API mutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("archives a project through the backend archive endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ...project, archived_at: "2026-02-01T00:00:00Z" }));

    const archived = await archiveProject("token", project.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/archive`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(archived.archived_at).toBe("2026-02-01T00:00:00Z");
  });

  it("creates a project without sending project lead, code, or role fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(project));
    const payload = {
      name: "Inclusive Speech Tech",
      description: "Project description",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "Planning" as const,
      funder_partner: null,
      project_type: null,
      objectives: null,
      priority: "Medium" as const,
    };

    await createProject("token", payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("adds a project member with only the registered user id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(member));

    const added = await addProjectMember("token", project.id, member.user_id);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/members`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: member.user_id, role: "Team Member" }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(added).toEqual(member);
  });

  it("lists and adds phase members through phase-scoped endpoints", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([phaseMember]))
      .mockResolvedValueOnce(jsonResponse(phaseMember));

    const listed = await listPhaseMembers("token", project.id, phaseId);
    const added = await addPhaseMember("token", project.id, phaseId, member.user_id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:8000/projects/${project.id}/phases/${phaseId}/members`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:8000/projects/${project.id}/phases/${phaseId}/members`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: member.user_id }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(listed).toEqual([phaseMember]);
    expect(added).toEqual(phaseMember);
  });

  it("lists My Work through the current-user endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([myWorkItem]));

    const items = await listMyWork("token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/my-work",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(items).toEqual([myWorkItem]);
  });

  it("lists Attention through the current-user endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([attentionItem]));

    const items = await listAttention("token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/attention",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(items).toEqual([attentionItem]);
  });

  it("gets and updates project budget through project-scoped endpoints", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(projectBudget))
      .mockResolvedValueOnce(jsonResponse({ ...projectBudget, allocated: 1200, remaining: 950, utilisation: 0.2083333333 }));

    const fetched = await getProjectBudget("token", project.id);
    const updated = await updateProjectBudget("token", project.id, { allocated: 1200 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:8000/projects/${project.id}/budget`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:8000/projects/${project.id}/budget`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ allocated: 1200 }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetched).toEqual(projectBudget);
    expect(updated.allocated).toBe(1200);
  });

  it("lists project files with task and phase context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([projectFile]));

    const files = await listProjectFiles("token", project.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/files`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(files).toEqual([projectFile]);
  });

  it("downloads project files through the aggregate download endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("content", {
        status: 200,
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''finance-report.pdf",
        },
      }),
    );

    const downloaded = await downloadProjectFile("token", project.id, projectFile.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/files/${projectFile.id}/download`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(downloaded.fileName).toBe("finance-report.pdf");
  });

  it("uploads reference files through the existing task file endpoint", async () => {
    const file = new File(["brief"], "brief.pdf", { type: "application/pdf" });
    const uploaded = {
      id: "66666666-6666-4666-8666-666666666666",
      task_id: myWorkItem.task_id,
      file_name: "brief.pdf",
      file_type: "application/pdf",
      file_size: 5,
      file_category: "reference",
      uploaded_by: member.user_id,
      uploader_name: member.name,
      uploader_email: member.email,
      created_at: "2026-01-01T00:00:00Z",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(uploaded));

    const result = await uploadTaskFile("token", project.id, phaseId, myWorkItem.task_id, file, "reference");
    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/phases/${phaseId}/tasks/${myWorkItem.task_id}/files`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(body.get("file_category")).toBe("reference");
    expect(body.get("file")).toBe(file);
    expect(result.file_category).toBe("reference");
  });

  it("updates task status through the narrow status endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(task));

    const result = await updateTaskStatus("token", project.id, phaseId, task.id, "Completed");

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/projects/${project.id}/phases/${phaseId}/tasks/${task.id}/status`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "Completed" }),
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(result.status).toBe("Completed");
  });

  it("uses project workspace routes for contents and folder operations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ folders: [workspaceFolder], files: [workspaceFile] }))
      .mockResolvedValueOnce(jsonResponse({ folders: [], files: [] }))
      .mockResolvedValueOnce(jsonResponse(workspaceFolder))
      .mockResolvedValueOnce(jsonResponse({ ...workspaceFolder, name: "Participant Data" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const root = await getWorkspaceContents("token", project.id);
    const folderContents = await getWorkspaceContents("token", project.id, workspaceFolder.id);
    const created = await createWorkspaceFolder("token", project.id, { name: "Research", parent_folder_id: null });
    const renamed = await updateWorkspaceFolder("token", project.id, workspaceFolder.id, { name: "Participant Data" });
    await deleteWorkspaceFolder("token", project.id, workspaceFolder.id);

    expect(fetchMock).toHaveBeenNthCalledWith(1, `http://localhost:8000/projects/${project.id}/workspace`, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `http://localhost:8000/projects/${project.id}/workspace/folders/${workspaceFolder.id}`, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `http://localhost:8000/projects/${project.id}/workspace/folders`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Research", parent_folder_id: null }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `http://localhost:8000/projects/${project.id}/workspace/folders/${workspaceFolder.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Participant Data" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `http://localhost:8000/projects/${project.id}/workspace/folders/${workspaceFolder.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(root.files[0]?.id).toBe(projectFile.id);
    expect(folderContents.folders).toEqual([]);
    expect(created.name).toBe("Research");
    expect(renamed.name).toBe("Participant Data");
  });

  it("moves existing project files through the workspace organization endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ ...workspaceFile, folder_id: workspaceFolder.id }))
      .mockResolvedValueOnce(jsonResponse(workspaceFile));

    const movedToFolder = await moveWorkspaceFile("token", project.id, projectFile.id, { folder_id: workspaceFolder.id });
    const movedToRoot = await moveWorkspaceFile("token", project.id, projectFile.id, { folder_id: null });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:8000/projects/${project.id}/workspace/files/${projectFile.id}/folder`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ folder_id: workspaceFolder.id }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://localhost:8000/projects/${project.id}/workspace/files/${projectFile.id}/folder`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ folder_id: null }),
      }),
    );
    expect(movedToFolder.folder_id).toBe(workspaceFolder.id);
    expect(movedToRoot.folder_id).toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
