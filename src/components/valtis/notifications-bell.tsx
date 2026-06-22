import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell({ userId }: { userId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifs } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as never)
        .select("id, type, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return ((data ?? []) as unknown) as Notif[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("notif-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  const unread = (notifs ?? []).filter((n) => !n.read_at).length;

  async function markAllRead() {
    const ids = (notifs ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.rpc("mark_notifications_read" as never, { _ids: ids } as never);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border/40">
          <p className="text-sm font-medium">Notifications</p>
          <p className="text-[11px] text-muted-foreground">
            {unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "À jour"}
          </p>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
          {(notifs ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Aucune notification pour le moment.
            </p>
          )}
          {(notifs ?? []).map((n) => (
            <div key={n.id} className={`px-4 py-3 ${n.read_at ? "opacity-70" : ""}`}>
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>}
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                {new Date(n.created_at).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}