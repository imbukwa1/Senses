import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";

import { verifyAccessToken } from "./auth.js";
import { parseDocumentRoom } from "./rooms.js";
import { fetchDocumentState, fetchUser, pingDatabase, storeDocumentState, userCanAccessDocument } from "./store.js";

export function createDocumentCollaborationServer({ config, pool }) {
  return new Server({
    address: config.host,
    port: config.documentPort,
    name: "senses-document-collaboration",
    path: config.documentPath,
    debounce: 1000,
    maxDebounce: 5000,
    async onAuthenticate({ documentName, token }) {
      const room = parseDocumentRoom(documentName);
      const userId = verifyAccessToken(token, config.authTokenSecret);
      const user = await fetchUser(pool, userId);
      if (!user) {
        throw new Error("Invalid or expired credentials");
      }
      const canAccess = await userCanAccessDocument(pool, userId, room.projectId, room.resourceId);
      if (!canAccess) {
        throw new Error("Project access denied");
      }
      return {
        room,
        user: {
          id: String(user.id),
          name: user.name,
          email: user.email,
        },
      };
    },
    extensions: [
      new Database({
        fetch: async ({ documentName }) => {
          const room = parseDocumentRoom(documentName);
          return fetchDocumentState(pool, room.resourceId);
        },
        store: async ({ documentName, state }) => {
          const room = parseDocumentRoom(documentName);
          await storeDocumentState(pool, room.resourceId, state);
        },
      }),
    ],
  });
}

export async function documentReadiness(pool) {
  await pingDatabase(pool);
}
