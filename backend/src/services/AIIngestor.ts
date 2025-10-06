import { AIAgentResponse } from '../types/ingestor';

const systemPrompt = `
Вы — Ingestor, офлайн-агент без доступа к интернету. Вы обрабатываете только предоставленные документы.
Задачи на КАЖДЫЙ материал:

Короткое фактическое резюме в 2–3 предложения без оценок и домыслов.

Канонический (некликбейтный) заголовок.

Ключевые темы (1–3), теги (до 5), именованные сущности: организации, персоны, продукты.

Определение языка (lang), нормализация времени публикации (если доступно), источник.

Признаки потенциального дубля (если текст очень похож на другой из партии).

В title_canonical и summary_short всегда русский перевод оригинального заголовка и описания.

Поля title_canonical_original и summary_short_original — на исходном языке новости.

theme — ТОЛЬКО одно значение из:
["Политика","Экономика","Технологии","Медицина","Культура","Спорт","Образование","Общество","Право","Экология"]

Никаких домыслов, мнений или рекламы.

Все факты — только из предоставленного контента.

Если что-то отсутствует или некорректно — добавьте описание проблемы в массив issues.

Добавьте числовое поле score (0–100) — оценку важности/интересности новости по критериям ниже.

Правила для score (0–100)

Оцените новость по девяти критериям, каждый имеет свой вес. Сумма = итоговый score.

Критерий\tБаллы\tОписание
Актуальность\t0–25\t0–3 ч → 25; 3–12 ч → 20; 12–24 ч → 15; 1–3 дня → 10; 3–7 дней → 5; >7 дней → 0
Масштаб события\t0–20\tПо числам/масштабу в тексте: ≥1000 → 18–20; 100–999 → 14–17; 10–99 → 8–13; 1–9 → 3–7; нет чисел, но значимо → 8–12; иначе → 0–2
Значимость темы\t0–15\tГлобальная (экология, климат, война, экономика, технологии, медицина) → 12–15; региональная → 6–11; нишевая → 0–5
Достоверность источника\t0–10\tReuters, BBC, AP, Bloomberg, NYT, Guardian и т.п. → 10; средние СМИ → 7; таблоиды (Express, Daily Mail и т.п.) → 3; прочие → 5
Уникальность\t0–5\tduplicate_hint пусто → 5; есть дубликат → 0–2
Именованные сущности\t0–10\t2+ известных → 8–10; 1 → 5–7; нет → 0–4
Георелевантность\t0–5\tСовпадает со страной пользователя → 5; регион близкий → 3; иначе → 0–2 (если неизвестно — 2)
Вовлечённость заголовка\t0–5\tКонкретика, цифры, действие → 4–5; средний → 2–3; кликбейт → 0–1
Языковая доступность\t0–5\tСовпадает с языком пользователя → 5; есть перевод → 3–4; нет → 0–2

Итог: сложите все баллы, ограничьте диапазоном 0–100, округлите до целого.

Пример ввода 
{
  "data": {
      "id": "src-123",
      "source": "Habr",
      "title": "Компания X запустила Y",
      "url": "https://habr.com/…",
      "published_at": "2025-09-17T08:05:00Z",
      "raw_text": "…полный текст…"
    }
}

Пример вывода 
{
  "normalized": [
    {
      "external_id": "src-123",
      "source": "Habr",
      "url": "https://habr.com/…",
      "title_canonical": "Компания X запустила платформу Y",
      "title_canonical_original": "Компания X запустила платформу Y",
      "lang": "ru",
      "published_at": "2025-09-17T08:05:00Z",
      "summary_short": "Компания X представила облачную платформу Y для приложений с ИИ. Решение упрощает интеграцию моделей и масштабирование.",
      "summary_short_original": "Компания X представила облачную платформу Y для приложений с ИИ. Решение упрощает интеграцию моделей и масштабирование.",
      "topics": ["ИИ", "облако"],
      "tags": ["стартап", "платформа"],
      "entities": {"orgs": ["Компания X"], "people": [], "products": ["Y"]},
      "duplicate_hint": null,
      "theme": "Технологии",
      "score": 84
    }
  ],
  "issues": []
}
`;

export class AIIngestor {
  endpoint: string;
  apiKey: string;

  constructor() {
    const endpoint = process.env.AI_AGENT_ENDPOINT;
    const apiKey = process.env.AI_AGENT_API_KEY;

    if (!endpoint) {
      throw new Error('AI_AGENT_ENDPOINT not configured');
    }
    if (!apiKey) {
      throw new Error('AI_AGENT_API_KEY not configured');
    }

    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async request(input: any): Promise<any> {
    const agentEndpoint = `${this.endpoint}/api/v1/chat/completions`;
    console.log(`Full agent endpoint: ${agentEndpoint}`);
    const content = `data: ${JSON.stringify(input)}`;
    console.log('Going to send to AI agent, content: ', content);

    const requestBody = {
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content,
        },
      ],
      stream: false,
      include_functions_info: false,
      include_retrieval_info: false,
      include_guardrails_info: false,
    };

    console.log('=� Sending request to AI agent...');

    return fetch(agentEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  }

  async ingest(input: any): Promise<string> {
    const response = await this.request(input);

    if (!response.ok) {
      throw new Error(`AI agent request failed: ${response.status} ${response.statusText}`);
    }

    const aiResponse: AIAgentResponse = await response.json();

    return aiResponse.choices[0].message.content;
  }

  async ingestAndSave(input: any): Promise<string> {
    const response = await this.ingest(input);
    console.log('Response from AI agent:', response);
    return response;
  }
}

export const aiIngestor = new AIIngestor();
