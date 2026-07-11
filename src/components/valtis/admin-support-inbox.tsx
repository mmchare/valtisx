import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type Conversation = {
  id: string;
  user_id: string;
  status: string;
  unread_by_admin: boolean;
  updated_at: string;
  profiles: { full_name: string | null; email: string } | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

export function AdminSupportInbox() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["admin-support-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations" as never)
        .select("id, user_id, status, unread_by_admin, updated_at, profiles(full_name, email)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
    refetchInterval: 20_000,
  });

  const { data: messages } = useQuery({
    queryKey: ["admin-support-messages", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages" as never)
        .select("*")
        .eq("conversation_id", selected!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-support-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
        if (selected) qc.invalidateQueries({ queryKey: ["admin-support-messages", selected] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openConversation(id: string) {
    setSelected(id);
    void supabase.rpc("mark_support_read" as never, { _conversation_id: id } as never);
    qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
  }

  async function send() {
    if (!draft.trim() || !selected) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.rpc("send_support_message" as never, {
      _conversation_id: selected,
      _body: body,
    } as never);
    setSending(false);
    if (error) { toast.error(error.message); setDraft(body); return; }
    qc.invalidateQueries({ queryKey: ["admin-support-messages", selected] });
  }

  const selectedConv = (conversations ?? []).find((c) => c.id === selected);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h2 className="font-display text-xl">Messagerie client</h2>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4 rounded-2xl border border-border overflow-hidden" style={{ height: 520 }}>
        <div className="border-r border-border/60 overflow-y-auto">
          {(conversations ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground p-4">Aucune conversation pour l'instant.</p>
          )}
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-border/40 hover:bg-secondary transition-colors ${selected === c.id ? "bg-secondary" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{c.profiles?.full_name || c.profiles?.email || "Client"}</p>
                {c.unread_by_admin && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{c.profiles?.email}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(c.updated_at).toLocaleString("fr-CA")}
              </p>
            </button>
          ))}
        </div>

        <div className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <div className="text-center space-y-2">
                <User className="w-6 h-6 mx-auto" />
                <p>Sélectionnez une conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 h-12 flex items-center border-b border-border/60 shrink-0">
                <p className="text-sm font-medium">{selectedConv?.profiles?.full_name || selectedConv?.profiles?.email}</p>
              </div>
              <ScrollArea className="flex-1 px-4 py-3">
                <div className="space-y-3">
                  {(messages ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.sender_role === "admin"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-secondary text-secondary-foreground rounded-bl-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[10px] mt-1 ${m.sender_role === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form
                onSubmit={(e) => { e.preventDefault(); void send(); }}
                className="flex items-center gap-2 p-3 border-t border-border/60 shrink-0"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Répondre au client…"
                  className="flex-1 h-10 rounded-full bg-secondary px-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                <Button type="submit" size="icon" variant="gold" disabled={sending || !draft.trim()} className="rounded-full shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
