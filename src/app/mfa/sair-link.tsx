import { Button } from "@/components/ui/button";

import { logout } from "../login/actions";

/** Escape hatch nas telas de MFA — fora do layout (app), não tem o botão "Sair" do header. */
export function SairLink() {
  return (
    <form action={logout}>
      <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-muted-foreground">
        Sair
      </Button>
    </form>
  );
}
