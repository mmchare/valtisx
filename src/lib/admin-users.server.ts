import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const BANK_SWIFT = "VALTCAM1XXX";
export const BANK_SITE = "https://bankvaltis.com";
export const SUPPORT_WHATSAPP = "+18254185900";

export function buildAccountNumber(userId: string) {
  const digits = userId.replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
  return `CA-VLTS-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

export async function createClientAccount(input: {
  email: string;
  password: string;
  fullName: string;
  sponsorName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const sponsor = (input.sponsorName ?? "").trim();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName, country: "CA" },
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error("Création du compte impossible");

  const accountNumber = buildAccountNumber(user.id);

  const body = [
    `Bonjour ${fullName},`,
    ``,
    sponsor
      ? `Grâce au parrainage de ${sponsor}, vous venez d'être inscrit(e) gratuitement à la banque Valtis.`
      : `Par l'intermédiaire d'un parrain, vous venez d'être inscrit(e) gratuitement à la banque Valtis.`,
    ``,
    `Vos informations de compte :`,
    `• Nom complet : ${fullName}`,
    `• Numéro de compte : ${accountNumber}`,
    `• Code SWIFT / BIC Valtis : ${BANK_SWIFT}`,
    ``,
    `Vos identifiants de connexion :`,
    `• Identifiant (e-mail) : ${email}`,
    `• Mot de passe provisoire : ${input.password}`,
    ``,
    `Connectez-vous dès maintenant sur ${BANK_SITE} et modifiez votre mot de passe depuis vos paramètres.`,
    ``,
    `Service client Valtis (WhatsApp) : ${SUPPORT_WHATSAPP}`,
    `Site officiel : ${BANK_SITE}`,
    ``,
    `Bienvenue chez Valtis — Banque privée nouvelle génération.`,
  ].join("\n");

  await supabaseAdmin.rpc("notify_user", {
    _user_id: user.id,
    _type: "account.created_by_admin",
    _title: "Bienvenue chez Valtis — votre compte a été créé",
    _body: body,
    _meta: { account_number: accountNumber, swift: BANK_SWIFT },
    _email: true,
  });

  await supabaseAdmin.from("profiles").update({ full_name: fullName }).eq("id", user.id);

  return { userId: user.id, email, accountNumber, swift: BANK_SWIFT };
}
