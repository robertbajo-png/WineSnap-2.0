-- Ask WineSnap: private conversation history with server-controlled writes.

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 4000),
  last_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_context) = 'object'),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_recent_idx
  ON public.ai_conversations(user_id, last_message_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_conversations FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

CREATE POLICY "Users read own AI conversations"
  ON public.ai_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own AI conversations"
  ON public.ai_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  model text,
  token_usage jsonb CHECK (token_usage IS NULL OR jsonb_typeof(token_usage) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_messages_conversation_created_idx
  ON public.ai_messages(conversation_id, created_at ASC);
CREATE INDEX ai_messages_user_created_idx
  ON public.ai_messages(user_id, created_at DESC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;

CREATE POLICY "Users read own AI messages"
  ON public.ai_messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.ai_conversations conversation
      WHERE conversation.id = conversation_id
        AND conversation.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.store_ai_exchange(
  _user_id uuid,
  _conversation_id uuid,
  _title text,
  _user_content text,
  _assistant_content text,
  _context jsonb,
  _model text,
  _token_usage jsonb
)
RETURNS TABLE (
  conversation_id uuid,
  user_message_id uuid,
  user_created_at timestamptz,
  assistant_message_id uuid,
  assistant_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_conversation_id uuid;
BEGIN
  IF _conversation_id IS NULL THEN
    INSERT INTO public.ai_conversations (user_id, title, last_context)
    VALUES (_user_id, left(trim(_title), 120), coalesce(_context, '{}'::jsonb))
    RETURNING id INTO resolved_conversation_id;
  ELSE
    SELECT c.id INTO resolved_conversation_id
    FROM public.ai_conversations c
    WHERE c.id = _conversation_id AND c.user_id = _user_id;

    IF resolved_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Conversation not found';
    END IF;
  END IF;

  INSERT INTO public.ai_messages (
    conversation_id, user_id, role, content, context
  ) VALUES (
    resolved_conversation_id, _user_id, 'user', _user_content, coalesce(_context, '{}'::jsonb)
  )
  RETURNING id, created_at INTO user_message_id, user_created_at;

  INSERT INTO public.ai_messages (
    conversation_id, user_id, role, content, context, model, token_usage
  ) VALUES (
    resolved_conversation_id,
    _user_id,
    'assistant',
    _assistant_content,
    jsonb_build_object('source', 'ask-winesnap', 'request_message_id', user_message_id),
    _model,
    _token_usage
  )
  RETURNING id, created_at INTO assistant_message_id, assistant_created_at;

  UPDATE public.ai_conversations
  SET last_context = coalesce(_context, '{}'::jsonb),
      last_message_at = assistant_created_at
  WHERE id = resolved_conversation_id;

  conversation_id := resolved_conversation_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.store_ai_exchange(
  uuid, uuid, text, text, text, jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_ai_exchange(
  uuid, uuid, text, text, text, jsonb, text, jsonb
) TO service_role;
