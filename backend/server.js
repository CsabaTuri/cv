import express from 'express';
import { Crisp } from 'crisp-api';

const app = express();
app.use(express.json());

// Konfigurációs konstansok
const MAX_QUESTIONS = 15;

const OFF_TOPIC_REPLY =
  'Sajnálom, de csak a portfolio.turicsaba.hu weboldallal és Turi Csaba szakmai portfóliójával kapcsolatos kérdésekben tudok segíteni.';

const LIMIT_REACHED_MESSAGE =
  'Elérted a maximális 15 kérdéses limitet. Átirányítalak egy emberi munkatárshoz.';

const AI_UNAVAILABLE_MESSAGE =
  'Technikai okok miatt az AI asszisztens jelenleg nem elérhető. Átirányítalak egy emberi munkatárshoz.';

const SYSTEM_PROMPT = `You are the official AI assistant for https://portfolio.turicsaba.hu.
You must strictly answer only questions related to Csaba Turi's professional portfolio and services.
Keep responses extremely short (max 2-3 sentences).
If the user asks about ANY other topic, reply exactly with: "${OFF_TOPIC_REPLY}"`;

// Crisp kliens inicializálása
let crisp;
function getCrispClient() {
  if (!crisp) {
    crisp = new Crisp();
    crisp.authenticateTier(
      'website',
      process.env.CRISP_IDENTIFIER,
      process.env.CRISP_KEY,
    );
  }
  return crisp;
}

async function sendOperatorMessage(websiteId, sessionId, content) {
  await getCrispClient().website.sendMessageInConversation(websiteId, sessionId, {
    type: 'text',
    from: 'operator',
    origin: 'chat',
    content,
  });
}

async function transferToHuman(websiteId, sessionId) {
  await getCrispClient().website.changeConversationState(
    websiteId,
    sessionId,
    'unresolved',
  );
}

async function readQuestionCount(websiteId, sessionId) {
  const conversation = await getCrispClient().website.getConversation(
    websiteId,
    sessionId,
  );
  const value = conversation?.meta?.data?.question_count;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

async function saveQuestionCount(websiteId, sessionId, count) {
  await getCrispClient().website.updateConversationMetas(websiteId, sessionId, {
    data: { question_count: count },
  });
}

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

  if (res.status === 402) return { status: 402 };
  if (!res.ok) return { status: res.status };

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) return { status: 500 };

  return { status: 200, reply };
}

// Crisp Webhook Endpoint
app.post('/api/crisp-webhook', async (req, res) => {
  const body = req.body || {};

  if (body.event !== 'message:send') {
    return res.status(200).send('Event ignored');
  }

  const data = body.data || {};
  if (data.type !== 'text' || data.from !== 'user') {
    return res.status(200).send('Message ignored');
  }

  const websiteId = data.website_id || body.website_id;
  const sessionId = data.session_id;

  if (!websiteId || !sessionId) {
    return res.status(400).send('Missing website/session id');
  }

  try {
    let questionCount = await readQuestionCount(websiteId, sessionId);

    if (questionCount >= MAX_QUESTIONS) {
      await sendOperatorMessage(websiteId, sessionId, LIMIT_REACHED_MESSAGE);
      await transferToHuman(websiteId, sessionId);
      return res.status(200).send('Question limit reached');
    }

    questionCount += 1;
    await saveQuestionCount(websiteId, sessionId, questionCount);

    const result = await askDeepSeek(data.content || '');

    if (result.status === 402) {
      await sendOperatorMessage(websiteId, sessionId, AI_UNAVAILABLE_MESSAGE);
      await transferToHuman(websiteId, sessionId);
      return res.status(200).send('AI unavailable');
    }

    if (result.status !== 200) {
      console.error(`[crisp-webhook] DeepSeek error: status ${result.status}`);
      return res.status(200).send('AI error');
    }

    await sendOperatorMessage(websiteId, sessionId, result.reply);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[crisp-webhook] error:', error);
    return res.status(500).send('Internal server error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Crisp-DeepSeek webhook listener running on port ${PORT}`);
});