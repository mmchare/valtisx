import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, X, Send, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

export function SupportChatWidget({ userId }: { userId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversationId } = useQuery({
    queryKey: ["support-conversation-id", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_support_conversation" as never, {} as never);
      if (error) throw error;
      return data as unknown as string;
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["support-conversation", conversationId],
    enabled: !!conversationId,
    refetchInterval: open ? false : 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations" as never)
        .select("*")
        .eq("id", conversationId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { unread_by_user: boolean } | null;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["support-messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages" as never)
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Message[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel("support-" + conversationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["support-messages", conversationId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations", filter: `id=eq.${conversationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["support-conversation", conversationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open && conversationId) {
      void supabase.rpc("mark_support_read" as never, { _conversation_id: conversationId } as never);
    }
  }, [open, conversationId]);

  async function send() {
    if (!draft.trim() || !conversationId) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.rpc("send_support_message" as never, {
      _conversation_id: conversationId,
      _body: body,
    } as never);
    setSending(false);
    if (error) { toast.error(error.message); setDraft(body); return; }
    qc.invalidateQueries({ queryKey: ["support-messages", conversationId] });
  }

  const hasUnread = !open && conversation?.unread_by_user;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(92vw,380px)] h-[min(70vh,520px)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium leading-none">Support Valtis</p>
                <p className="text-[11px] text-muted-foreground mt-1">Réponse sous 24h ouvrées</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {(!messages || messages.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Posez votre question à un conseiller Valtis — nous vous répondons ici même.
                </p>
              )}
              {(messages ?? []).map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.sender_role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-secondary-foreground rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
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
              placeholder="Écrivez votre message…"
              className="flex-1 h-10 rounded-full bg-secondary px-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button type="submit" size="icon" variant="gold" disabled={sending || !draft.trim()} className="rounded-full shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      )}

      <Button
        variant="gold"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full shadow-xl relative"
        title="Support Valtis"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive border-2 border-background" />
        )}
      </Button>
    </div>
  );
}
