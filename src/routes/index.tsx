import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Lock, Gauge, Globe2 } from "lucide-react";
import { ValtisLogo } from "@/components/valtis/logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Valtis — Gestion de fortune. Conformité bancaire." },
      { name: "description", content: "Plateforme bancaire haute performance pour clients fortunés au Canada et en Europe. Transferts sécurisés, conformité EDD, traçabilité absolue." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      {/* NAV */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/70">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <ValtisLogo />
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#offre" className="hover:text-foreground transition">Offre</a>
            <a href="#securite" className="hover:text-foreground transition">Sécurité</a>
            <a href="#conformite" className="hover:text-foreground transition">Conformité</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth"><Button variant="ghost" size="sm">Se connecter</Button></Link>
            <Link to="/auth"><Button variant="gold" size="sm">Ouvrir un compte</Button></Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/40 bg-primary/5 text-xs tracking-[0.2em] uppercase text-primary mb-8 animate-fade-in-up">
          <ShieldCheck className="w-3.5 h-3.5" />
          Canada · Europe · Conformité EDD
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-semibold tracking-tighter mb-6 animate-fade-in-up">
          La banque privée,<br />
          <span className="text-gold-gradient">repensée pour la fortune.</span>
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10 animate-fade-in-up">
          Transferts haute performance, traçabilité absolue, conformité bancaire EDD intégrée.
          Conçu pour les patrimoines de 100 millions et plus.
        </p>
        <div className="flex flex-wrap justify-center gap-3 animate-fade-in-up">
          <Link to="/auth">
            <Button variant="gold" size="lg" className="h-12 px-8 text-base">
              Ouvrir un compte Valtis
              <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
          </Link>
          <a href="#offre">
            <Button variant="ghost-gold" size="lg" className="h-12 px-8 text-base">
              Découvrir l'offre
            </Button>
          </a>
        </div>

        {/* Carte premium showcase */}
        <div className="mt-24 max-w-md mx-auto">
          <div className="card-premium shimmer-gold rounded-2xl p-8 aspect-[1.586/1] flex flex-col justify-between text-left">
            <div className="flex justify-between items-start">
              <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">Valtis Gold Plus</span>
              <ValtisLogo className="scale-75 -mt-1" />
            </div>
            <div>
              <div className="font-display text-2xl tracking-widest text-foreground/90 mb-3">
                •••• •••• •••• 8423
              </div>
              <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider">
                <span>Titulaire privé</span>
                <span>12 / 32</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="offre" className="mx-auto max-w-7xl px-6 py-24 border-t border-border/40">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Gauge, title: "Transferts haute performance", desc: "Virements P2P en temps réel avec jauge de progression et notifications instantanées, jusqu'aux volumes massifs." },
            { icon: ShieldCheck, title: "Conformité EDD intégrée", desc: "Vérification renforcée automatique au-delà de 100 millions. Documents Gold Plus, audit trail immuable." },
            { icon: Lock, title: "Sécurité bancaire absolue", desc: "Chiffrement AES-256, authentification biométrique, Ghost Mode pour masquer vos soldes en public." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-8 rounded-2xl border border-border bg-surface/50 hover:border-gold transition-all">
              <Icon className="w-6 h-6 text-primary mb-5" />
              <h3 className="font-display text-xl font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BAND */}
      <section id="conformite" className="mx-auto max-w-7xl px-6 py-24 border-t border-border/40">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <Globe2 className="w-6 h-6 text-primary mb-5" />
            <h2 className="font-display text-4xl font-semibold tracking-tight mb-4">
              Une infrastructure conforme,<br/>de Montréal à Zurich.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Chaque transaction génère un journal inaltérable : initiateur, validateur, documents consultés, messages échangés. La traçabilité Valtis répond aux exigences AMF, FINTRAC et MiCA.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "100M+", v: "Seuil EDD" },
              { k: "AES-256", v: "Chiffrement" },
              { k: "24/7", v: "Conformité" },
              { k: "T+0", v: "Settlement" },
            ].map((s) => (
              <div key={s.k} className="p-6 rounded-xl border border-border bg-surface/30">
                <div className="font-display text-3xl text-gold-gradient font-semibold">{s.k}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="securite" className="border-t border-border/40 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-wrap items-center justify-between gap-4">
          <ValtisLogo />
          <p className="text-xs text-muted-foreground">© 2026 Valtis Private Banking. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
