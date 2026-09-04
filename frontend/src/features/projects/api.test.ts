import { afterEach, describe, expect, it, vi } from "vitest";

import { addPhaseMember, addProjectMember, archiveProject, listPhaseMembers } from "./api";

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
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
