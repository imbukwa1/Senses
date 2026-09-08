const DOCUMENT_ROOM_PATTERN = /^project:([0-9a-fA-F-]{36}):documents:([0-9a-fA-F-]{36})$/;

export function parseDocumentRoom(documentName) {
  const match = DOCUMENT_ROOM_PATTERN.exec(documentName);
  if (!match) {
    throw new Error("Invalid document collaboration room");
  }

  return {
    projectId: match[1].toLowerCase(),
    resourceId: match[2].toLowerCase(),
    resourceType: "document",
  };
}

export function documentRoomName(projectId, documentId) {
  return `project:${projectId}:documents:${documentId}`;
}
