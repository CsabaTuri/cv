// netlify/functions/crisp-webhook.mjs
//
// Crisp chat webhook -> DeepSeek AI assistant middleware.
//
// Runs as a Netlify Function alongside the static export (out/).
// Webhook URL to configure in Crisp:
//   https://portfolio.turicsaba.hu/.netlify/functions/crisp-webhook
//
// Required environment variables (set in the Netlify dashboard):
//   CRISP_IDENTIFIER, CRISP_KEY, CRISP_WEBSITE_ID, DEEPSEEK_API_KEY

import {Crisp} from 'crisp-api';

// Hard limit on the number of AI questions allowed per conversation.
const MAX_QUESTIONS = 15;

// Exact reply used when the user asks about an off-topic subject.
const OFF_TOPIC_REPLY =
  'Sajnálom, de csak a portfolio.turicsaba.hu weboldallal és Turi Csaba szakmai portfóliójával kapcsolatos kérdésekben tudok segíteni.';

// Message shown when the question limit is reached (then transfer to human).
const LIMIT_REACHED_MESSAGE =
  'Elérted a maximális 5 kérdéses limitet. Átirányítalak egy emberi munkatárshoz.';

// Message shown when DeepSeek is unavailable (e.g. HTTP 402 out of credits).
const AI_UNAVAILABLE_MESSAGE =
  'Technikai okok miatt az AI asszisztens jelenleg nem elérhető. Átirányítalak egy emberi munkatárshoz.';

// System prompt for the DeepSeek model.
const SYSTEM_PROMPT = `You are the official AI assistant for https://portfolio.turicsaba.hu.
You must strictly answer only questions related to Csaba Turi's professional portfolio and services.
Keep responses extremely short (max 2-3 sentences).
If the user asks about ANY other topic, reply exactly with: "${OFF_TOPIC_REPLY}"`;

// Lazily-initialised Crisp client (authenticated on first use).
let crisp;

function getCrispClient() {
  if (!crisp) {
    crisp = new Crisp();
    // Authenticate with a Crisp Website Token. The keypair is generated in
    // Crisp: Settings > Workspace Settings > Advanced configuration > API Token.
    // CRISP_IDENTIFIER = token_id, CRISP_KEY = token_key.
    crisp.authenticateTier(
      'website',
      process.env.CRISP_IDENTIFIER,
      process.env.CRISP_KEY,
    );
  }
  return crisp;
}

// Send a text message as an operator inside the conversation.
async function sendOperatorMessage(websiteId, sessionId, content) {
  await getCrispClient().website.sendMessageInConversation(websiteId, sessionId, {
    type: 'text',
    from: 'operator',
    origin: 'chat',
    content,
  });
}

// Transfer the conversation to a human agent (mark as unresolved).
async function transferToHuman(websiteId, sessionId) {
  await getCrispClient().website.changeConversationState(
    websiteId,
    sessionId,
    'unresolved',
  );
}

// Read the current question count from the conversation custom data.
// Custom conversation data lives under `meta.data`.
async function readQuestionCount(websiteId, sessionId) {
  const conversation = await getCrispClient().website.getConversation(
    websiteId,
    sessionId,
  );
  const value = conversation?.meta?.data?.question_count;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

// Persist the new question count in the conversation custom data.
// `updateConversationMetas` writes the custom `meta.data` field and is allowed
// with a website token (unlike the batch data route, which is plugin-only).
async function saveQuestionCount(websiteId, sessionId, count) {
  await getCrispClient().website.updateConversationMetas(websiteId, sessionId, {
    data: { question_count: count },
  });
}

// Ask DeepSeek and return the assistant reply text (or a status code).
async function askDeepSeek(userMessage) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 150,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  // HTTP 402 means the DeepSeek account has run out of credits.
  if (res.status === 402) return { status: 402 };

  if (!res.ok) return { status: res.status };

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) return { status: 500 };

  return { status: 200, reply };
}

// Netlify Function handler (v1 signature).
export async function handler(event) {
  // Parse the JSON webhook payload sent by Crisp.
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  // 1. Webhook filtering: only react to new user text messages.
  if (body.event !== 'message:send') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const data = body.data || {};
  if (data.type !== 'text' || data.from !== 'user') {
    return { statusCode: 200, body: 'Message ignored' };
  }

  const websiteId = data.website_id || body.website_id;
  const sessionId = data.session_id;
  if (!websiteId || !sessionId) {
    return { statusCode: 400, body: 'Missing website/session id' };
  }

  try {
    // 2. Conversation data: read the custom `question_count` variable.
    let questionCount = await readQuestionCount(websiteId, sessionId);

    // 3. Limit handler (max 5 questions): warn, transfer to human, stop.
    if (questionCount >= MAX_QUESTIONS) {
      await sendOperatorMessage(websiteId, sessionId, LIMIT_REACHED_MESSAGE);
      await transferToHuman(websiteId, sessionId);
      return { statusCode: 200, body: 'Question limit reached' };
    }

    // 4. Increment the counter and persist it.
    questionCount += 1;
    await saveQuestionCount(websiteId, sessionId, questionCount);

    // 5 + 6. Call DeepSeek with the guardrail system prompt.
    const result = await askDeepSeek(data.content || '');

    // 7. Error handling (402 out of credits): fallback + transfer to human.
    if (result.status === 402) {
      await sendOperatorMessage(websiteId, sessionId, AI_UNAVAILABLE_MESSAGE);
      await transferToHuman(websiteId, sessionId);
      return { statusCode: 200, body: 'AI unavailable' };
    }

    // Any other DeepSeek error is logged and swallowed (no reply sent).
    if (result.status !== 200) {
      console.error(`[crisp-webhook] DeepSeek error: status ${result.status}`);
      return { statusCode: 200, body: 'AI error' };
    }

    // 8. Message delivery: send the assistant reply to the conversation.
    await sendOperatorMessage(websiteId, sessionId, result.reply);
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('[crisp-webhook] error:', error);
    return { statusCode: 500, body: 'Internal server error' };
  }
}
