import { z } from "zod";

export const userLookupResultSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
});

export const userLookupResultsSchema = z.array(userLookupResultSchema);
