# handoff.md

# Handoff: MVP AI Job Hunter для рынка РФ
## 0\. Контекст и цель
Ты работаешь как senior full-stack инженер и должен собрать запускаемый MVP утилиты для поиска работы разработчика 18 лет со стеком React, Vite, Next.js, Node.js, TypeScript, JavaScript, AI/API-интеграции.

Цель MVP: раз в неделю собирать новые вакансии, фильтровать их по профилю кандидата, оценивать перспективность LLM, генерировать честное персонализированное сопроводительное письмо и либо отправлять отклик, либо ставить его в очередь на подтверждение. Главный источник: [hh.ru](http://hh.ru). Дополнительные: Habr Career и [FL.ru](http://FL.ru) через поддерживаемые публичные каналы. Avito подключать только если найден легальный и доступный для соискателя способ.

Не строй красивый интерфейс. Нужны CLI, SQLite, структурированные логи, JSON/Markdown-отчёт и cron-совместимый запуск. Приоритет: рабочий вертикальный срез, безопасность аккаунта, повторяемость и тестируемость.
## 1\. Результат, который должен быть готов
Сделай репозиторий, который запускается локально одной командой после настройки `.env` и умеет:

1. Прочитать профиль кандидата из `config/profile.yaml` и резюме из Markdown/PDF или текстового файла.
2. Выполнить поиск по нескольким поисковым профилям: `frontend`, `fullstack`, `ai-integrations`.
3. Сохранить вакансии в SQLite с дедупликацией по canonical URL и external ID.
4. Нормализовать вакансию: название, компания, зарплата, локация, remote, формат занятости, дата, URL, описание, источник.
5. Применить жёсткие фильтры: стоп-слова, seniority, зарплата, география, формат, стек, юридические ограничения.
6. Передать подходящие вакансии LLM на structured scoring от 0 до 100 с объяснением, рисками и missing requirements.
7. Генерировать письмо только на основе фактов из профиля. Нельзя придумывать опыт, проекты, образование, зарплату, доступность или ссылки.
8. Сформировать очередь `recommended`, `needs_review`, `rejected`, `applied`, `failed`.
9. Для [hh.ru](http://hh.ru) открыть сессию браузера через Playwright и поддержать режимы:
    *   `dry-run`: только показывает, что будет заполнено;
    *   `review`: заполняет форму, делает screenshot, ждёт подтверждение пользователя;
    *   `auto`: отправляет только вакансии выше порога и внутри дневного лимита, если пользователь явно включил режим.
10. После каждого действия сохранить результат, timestamp, URL, текст письма, выбранное резюме, screenshot при наличии и ошибку.
11. Сформировать отчёт `reports/YYYY-MM-DD.md` и опционально отправить его в Telegram через webhook/bot adapter.
12. Запускать пайплайн вручную и по cron: `npm run scan`, `npm run review`, `npm run apply`, `npm run report`, `npm run weekly`.
## 2\. Технические решения
*   Node.js 22+, TypeScript strict mode, ESM.
*   CLI: `commander` или `yargs`.
*   HTTP: `undici`/`fetch` с retry, timeout, rate limit и User-Agent.
*   Browser automation: Playwright с persistent browser profile. Не хранить логины и cookies в git.
*   DB: SQLite через Drizzle ORM или better-sqlite3.
*   Validation: Zod.
*   Scheduling: cron-compatible CLI, без обязательного облака.
*   LLM: OpenAI-compatible adapter, configurable provider через `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`; поддержать локальный Ollama как опцию.
*   Парсинг PDF: `pdf-parse` или эквивалент.
*   Тесты: Vitest; fixtures для HTML/JSON страниц, без реальных откликов в CI.
*   Форматирование: ESLint + Prettier.

Предпочтение: простая модульная архитектура, никаких LangChain/LangGraph без реальной необходимости. Не тащи Next.js в MVP, интерфейс будет позже.
## 3\. Архитектура каталогов

```plain
src/
  cli.ts
  config.ts
  db/
    schema.ts
    client.ts
    repositories.ts
  domain/
    types.ts
    scoring.ts
    dedupe.ts
  sources/
    source.ts
    hh/
      hh.search.ts
      hh.apply.ts
      hh.mapper.ts
    habr/
      habr.search.ts
    fl/
      fl.rss.ts
    avito/
      avito.search.ts
  ai/
    llm.ts
    prompts.ts
    scorer.ts
    cover-letter.ts
  application/
    scan.ts
    review.ts
    apply.ts
    report.ts
  safety/
    limits.ts
    approval.ts
    audit.ts
config/
  profile.yaml
  searches.yaml
  policy.yaml
fixtures/
reports/
data/
```

Каждый источник реализует интерфейс:

```plain
interface JobSource {
  name: string;
  search(query: SearchQuery): Promise<RawJob[]>;
  getDetails(job: RawJob): Promise<JobDetails>;
  capabilities(): { search: boolean; details: boolean; apply: boolean };
}
```

## 4\. Источники и правила интеграции
### [hh.ru](http://hh.ru), P0
Сначала проверить актуальные официальные API и условия использования. Если API даёт поиск, использовать его для harvest. Для пользовательского отклика использовать только поддерживаемый и доступный поток; если для текущего аккаунта/API отклик недоступен, использовать Playwright persistent context и обычный пользовательский flow без обхода CAPTCHA, антибота, лимитов или защиты.

В MVP обязательны `login` с ручным входом, сохранение session profile локально, поиск, детализация, scoring, review и audit. Автоматическая отправка должна быть feature flag и по умолчанию выключена.
### Habr Career, P1
Проверить официальную документацию API и правила. Реализовать поиск вакансий, если доступен ключ/токен. Если доступен только публичный список, использовать аккуратный rate-limited adapter и явно отметить в README правовой/операционный риск. Отклик сначала вести на страницу вакансии, не обещать API-отправку без подтверждённого endpoint.
### [FL.ru](http://FL.ru), P1
Использовать RSS-фиды вакансий/категорий как основной MVP-канал, если они доступны. Сохранять оригинальную ссылку. Автоставки/автоотклики не реализовывать в первой версии: только подготовка персонального ответа и открытие страницы для ручной отправки.
### Avito, P2
Не скрейпить и не автоматизировать личный аккаунт вслепую. Проверить Avito Business API: найденная документация в основном ориентирована на бизнес, объявления, сообщения и найм работодателем, а не на поиск вакансий соискателем. Подключать только после подтверждения нужного endpoint и прав доступа. Иначе оставить источник выключенным с понятным статусом `unsupported`.
## 5\. Профиль и конфигурация
Сгенерируй пример `config/profile.yaml`:

```yaml
candidate:
  name: "YOUR_NAME"
  age: 18
  location: "YOUR_CITY"
  remote_only: true
  employment: ["full-time", "part-time", "contract", "internship"]
  experience_years: 0
  github: "https://github.com/YOUR_HANDLE"
  portfolio: ""
  truthful_facts:
    - "React, TypeScript, JavaScript"
    - "Vite, Next.js, Node.js"
    - "AI and API integrations"
  target_roles:
    - "Junior Frontend Developer"
    - "Junior Fullstack Developer"
    - "React Developer"
    - "AI Integration Developer"
  target_salary_rub: 80000
  languages:
    russian: native
    english: "YOUR_LEVEL"
  no_go:
    - "unpaid full-time internship"
    - "sales"
    - "mandatory office relocation"

policy:
  min_score: 70
  review_score: 55
  max_applications_per_run: 8
  max_applications_per_day: 12
  auto_apply: false
  require_confirmation_for_first_run: true
  never_answer_unknown_questions: true
  never_invent_facts: true
  never_bypass_captcha: true
```

## 6\. Scoring contract
LLM обязан возвращать только JSON по Zod-схеме:

```json
{
  "score": 0,
  "recommendation": "apply|review|reject",
  "skill_match": 0,
  "seniority_match": 0,
  "format_match": 0,
  "salary_match": 0,
  "growth_signal": 0,
  "reasons": [],
  "missing_requirements": [],
  "red_flags": [],
  "questions_to_verify": []
}
```

Scoring prompt должен требовать:
*   не считать название вакансии доказательством соответствия;
*   штрафовать за senior/middle требования, если кандидат junior;
*   выявлять скрытые продажи, неоплачиваемую занятость, сомнительную зарплату, обязательный офис;
*   отдельно учитывать сильный GitHub/портфолио как компенсатор отсутствия коммерческого опыта;
*   возвращать `review`, если вакансия перспективная, но есть неизвестный критический параметр.

Письмо: 500-900 знаков на русском или языке вакансии, 1-2 конкретных совпадения с вакансией, ссылка на GitHub/портфолио, честное обозначение junior-уровня, без канцелярита и массового шаблона. Сделать 3 варианта тона: neutral, direct, warm.
## 7\. Human-in-the-loop и безопасность
Это не спам-машина. Нужны обязательные предохранители:
*   default `auto_apply=false`;
*   `dry-run` и `review` должны работать без отправки;
*   перед первым apply показать список вакансий, письма и лимиты;
*   неизвестные вопросы формы не заполнять догадками, переводить в review;
*   CAPTCHA, 2FA и антибот не обходить;
*   exponential backoff, случайные интервалы и низкий лимит, но не stealth/evasion;
*   stop при 403/429, изменении DOM или подозрительной активности;
*   не хранить пароли, CV и cookies в логах;
*   `.gitignore` для `data/`, `.env`, browser profile, screenshots и личных файлов;
*   команда `panic-stop` выключает apply режим и удаляет очередь к отправке;
*   всё, что ушло от имени пользователя, должно быть записано в audit log.
## 8\. CLI и критерии приёмки
Реализуй команды:

```plain
npm run setup
npm run login -- --source hh
npm run scan -- --source hh,habr,fl
npm run score
npm run review
npm run apply -- --mode review
npm run apply -- --mode auto --limit 3
npm run report
npm run weekly
npm run panic-stop
```

Критерии приёмки MVP:

1. На fixture-данных пайплайн от поиска до отчёта проходит без сети.
2. Повторный scan не создаёт дубли.
3. Неизвестные обязательные вопросы переводят вакансию в `needs_review`.
4. LLM-ответ с лишним текстом, невалидным JSON или выдуманным фактом отклоняется и логируется.
5. `dry-run` не может вызвать submit.
6. `auto` физически ограничен дневным лимитом из policy.
7. В отчёте видны: найдено, отфильтровано, рекомендовано, на проверке, отправлено, ошибки и причины.
8. Unit-тесты покрывают дедупликацию, scoring normalization, лимиты, prompt output validation и source mappers.
9. README содержит установку, `.env.example`, ручной логин, cron example, threat model, ограничения источников и rollback.
10. Добавление нового источника требует только нового adapter и регистрации в container.
## 9\. План реализации, не распыляйся
Сделай по порядку:
### Phase 1: vertical slice [hh.ru](http://hh.ru)
Config/profile, SQLite, fixture source, LLM scorer, cover letter, report, CLI, tests.
### Phase 2: реальный harvest
hh search/details, persistent Playwright login, dedupe, screenshots, review flow.
### Phase 3: дополнительные источники
Habr API adapter, FL RSS adapter, единый normalizer, capability matrix. Avito оставить disabled, если нет подтверждённого соискательского API.
### Phase 4: weekly automation
cron docs, idempotent run, Telegram report adapter, cleanup, metrics.

Не переходи к следующей фазе, пока предыдущая не запускается и не покрыта тестами.
## 10\. Что считать успехом
Успешный MVP не тот, который отправил 200 шаблонных откликов. Успех: раз в неделю он находит 30-100 свежих вакансий, отбрасывает мусор, выдаёт 5-15 реально подходящих, пишет правдоподобные письма, помогает отправить первые 3-8 откликов без выдумок и сохраняет полный журнал. Качество и релевантность важнее объёма.
## 11\. Исследовательские ориентиры
Проверь ссылки непосредственно перед реализацией, потому что состояние репозиториев и API меняется:
*   hhru/api: [https://github.com/hhru/api](https://github.com/hhru/api)
*   HeadHunter API: [https://api.hh.ru/](https://api.hh.ru/) и [https://dev.hh.ru/](https://dev.hh.ru/)
*   Steev193/hh-ru-apply: [https://github.com/Steev193/hh-ru-apply](https://github.com/Steev193/hh-ru-apply)
*   fikstt2/hh-ai-agent: [https://github.com/fikstt2/hh-ai-agent](https://github.com/fikstt2/hh-ai-agent)
*   AgentShekel/hh-bot: [https://github.com/AgentShekel/hh-bot](https://github.com/AgentShekel/hh-bot)
*   jointime1/n8n-hh.ru: [https://github.com/jointime1/n8n-hh.ru](https://github.com/jointime1/n8n-hh.ru)
*   Vlad9572324/hh.ru-clicker: [https://github.com/Vlad9572324/hh.ru-clicker](https://github.com/Vlad9572324/hh.ru-clicker)
*   konard/hh-job-application-automation: [https://github.com/konard/hh-job-application-automation](https://github.com/konard/hh-job-application-automation)
*   career-ops: [https://github.com/santifer/career-ops](https://github.com/santifer/career-ops)
*   [MR.Jobs](http://MR.Jobs): [https://github.com/humancto/mr-jobs](https://github.com/humancto/mr-jobs)
*   Habr Career API: [https://career.habr.com/info/api](https://career.habr.com/info/api)
*   Habr Career API rules: [https://career.habr.com/info/legal/api\_rules](https://career.habr.com/info/legal/api_rules)
*   [FL.ru](http://FL.ru) RSS parser example: [https://github.com/connectoid/fl-bot](https://github.com/connectoid/fl-bot)
*   Avito developer portal: [https://developers.avito.ru/api-catalog](https://developers.avito.ru/api-catalog)
*   Avito API: [https://avito.ru/business/tools/api](https://avito.ru/business/tools/api)
## 12\. Финальная инструкция кодеру
Начни с короткого `RESEARCH.md`: какие endpoints реально работают на дату запуска, где нужен OAuth, где только browser/RSS, какие действия не поддерживаются. Затем создай проект, реализуй Phase 1, запусти тесты, исправь ошибки и только после этого добавляй реальные adapters. Не симулируй успешный отклик: если отправка не подтверждена фактическим результатом страницы/API, статус должен быть `unknown` или `failed`, а не `applied`.