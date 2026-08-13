import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PurposeRiskDoc = { code: string; label: string };
export type PurposeRiskResult = {
  flagged: boolean;
  category: string;
  reason: string;
  documents: PurposeRiskDoc[];
};

const SYSTEM_PROMPT = `Tu es l'analyste conformité (AML/CFT, EDD) de la banque privée Valtis.
On te transmet le motif LIBRE d'un virement saisi par le donneur d'ordre.
Tu dois déterminer si le bien ou le service décrit relève d'une catégorie sensible ou réglementée :
objets de collection, minéraux/pierres/spectres/cristaux, œuvres d'art, antiquités, armes,
métaux précieux, or, crypto-actifs, biens culturels, espèces protégées, biens à double usage,
matériel médical ou tout bien nécessitant licence, certificat ou autorisation d'exportation.

Réponds UNIQUEMENT en JSON valide, sans texte autour, au format :
{"flagged": true|false, "category": "courte catégorie", "reason": "phrase claire en français expliquant au BÉNÉFICIAIRE pourquoi les fonds sont retenus à 63%",
 "documents": [{"code":"snake_case_ascii","label":"Nom précis du document en français"}]}

Règles :
- flagged=true dès qu'un doute réglementaire existe. Sinon flagged=false et documents=[].
- Si flagged=true, exige entre 2 et 4 documents concrets et vérifiables (ex : carte de collectionneur,
  licence d'exportation internationale, certificat d'authenticité, facture d'achat, attestation d'origine).
- Les libellés doivent mentionner que le document est attendu au format PDF si pertinent.`;

export const analyzeTransferPurpose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { description: string; amount: number; currency: string }) => {
    const description = String(input?.description ?? "").trim().slice(0, 800);
    if (description.length < 3) throw new Error("Description du motif trop courte");
    return {
      description,
      amount: Number(input?.amount ?? 0),
      currency: String(input?.currency ?? "CAD").slice(0, 3),
    };
  })
  .handler(async ({ data }): Promise<PurposeRiskResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    const fallback: PurposeRiskResult = { flagged: false, category: "", reason: "", documents: [] };
    if (!apiKey) return fallback;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Motif déclaré : "${data.description}"\nMontant : ${data.amount} ${data.currency}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        return fallback;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return fallback;
      const parsed = JSON.parse(match[0]) as Partial<PurposeRiskResult>;
      const documents = (Array.isArray(parsed.documents) ? parsed.documents : [])
        .filter((d) => d && typeof d.label === "string")
        .slice(0, 4)
        .map((d, i) => ({
          code: (typeof d.code === "string" && d.code ? d.code : `ai_doc_${i + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .slice(0, 40),
          label: String(d.label).slice(0, 160),
        }));
      if (!parsed.flagged || documents.length === 0) return fallback;
      return {
        flagged: true,
        category: String(parsed.category ?? "Bien réglementé").slice(0, 80),
        reason: String(parsed.reason ?? "Le motif déclaré porte sur un bien réglementé.").slice(0, 600),
        documents,
      };
    } catch (err) {
      console.error("analyzeTransferPurpose failed", err);
      return fallback;
    }
  });
