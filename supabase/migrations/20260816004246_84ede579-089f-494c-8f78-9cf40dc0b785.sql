CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _type text, _title text, _body text, _meta jsonb DEFAULT '{}'::jsonb, _email boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_to text; v_key text; v_title_html text; v_body_html text;
BEGIN
  INSERT INTO public.notifications(user_id,type,title,body,metadata)
  VALUES (_user_id,_type,_title,_body,COALESCE(_meta,'{}'::jsonb))
  RETURNING id INTO v_id;

  IF _email THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;
    IF v_key IS NOT NULL THEN
      SELECT email INTO v_to FROM public.profiles WHERE id = _user_id;
      IF v_to IS NOT NULL THEN
        v_title_html := replace(replace(replace(COALESCE(_title,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
        v_body_html  := replace(replace(replace(COALESCE(_body,''),'&','&amp;'),'<','&lt;'),'>','&gt;');
        PERFORM net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
          body := jsonb_build_object(
            'from','Valtis <onboarding@resend.dev>',
            'to', v_to,
            'reply_to', 'bankvaltis@hotmail.com',
            'subject', _title,
            'text', COALESCE(_title,'') || E'\n\n' || COALESCE(_body,'') || E'\n\n--\nValtis — Banque privée nouvelle génération',
            'html', '<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;padding:8px">'
                     || '<h2 style="color:#0A0A0A;margin:0 0 16px">' || v_title_html || '</h2>'
                     || '<div style="color:#333;line-height:1.6;font-size:15px;white-space:pre-wrap;word-break:break-word">' || v_body_html || '</div>'
                     || '<p style="color:#999;font-size:12px;margin-top:24px">Valtis — Banque privée nouvelle génération</p>'
                     || '</div>'
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.send_support_message(_conversation_id uuid, _body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_conv public.support_conversations; v_role text; v_msg_id uuid; v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  v_clean := btrim(_body, E' \t\r\n');
  IF length(v_clean) = 0 THEN RAISE EXCEPTION 'Message vide'; END IF;

  SELECT * INTO v_conv FROM public.support_conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation introuvable'; END IF;

  IF v_conv.user_id = auth.uid() THEN
    v_role := 'user';
  ELSIF public.has_role(auth.uid(), 'admin') THEN
    v_role := 'admin';
  ELSE
    RAISE EXCEPTION 'Acces refuse';
  END IF;

  INSERT INTO public.support_messages(conversation_id, sender_id, sender_role, body)
  VALUES (_conversation_id, auth.uid(), v_role, v_clean)
  RETURNING id INTO v_msg_id;

  UPDATE public.support_conversations
    SET updated_at = now(),
        status = 'open',
        unread_by_admin = (v_role = 'user'),
        unread_by_user = (v_role = 'admin')
    WHERE id = _conversation_id;

  IF v_role = 'user' THEN
    PERFORM public.notify_user(u.user_id, 'support.new_message', 'Nouveau message client',
      v_clean, jsonb_build_object('conversation_id', _conversation_id, 'message_id', v_msg_id))
    FROM public.user_roles u WHERE u.role = 'admin';
  ELSE
    PERFORM public.notify_user(v_conv.user_id, 'support.new_message', 'Reponse du support Valtis',
      v_clean, jsonb_build_object('conversation_id', _conversation_id, 'message_id', v_msg_id));
  END IF;

  RETURN v_msg_id;
END; $function$;