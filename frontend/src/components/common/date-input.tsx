import type * as React from "react";

import { Input } from "@/components/ui/input";

export function DateInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return <Input type="date" {...props} />;
}
