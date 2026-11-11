# Kanban — реализация ТЗ-001

Канбан-доска для небольших команд: React SPA (PWA) + Cloudflare Worker (Hono, D1, KV, Durable Object).

**Сайт:** https://dronov-dmitry.github.io/kanban/

Документ-основание: `ТЗ-001-KANBAN.md` (v1.3).

## Что уже работает

### Аккаунт и доступ

- Вход только через Google OAuth. Парольной формы нет — аккаунт создаётся при первом входе, e-mail считается подтверждённым провайдером.
- Привязка и отвязка дополнительного провайдера в профиле; отвязать последний способ входа нельзя.
- Access-token (JWT, 15 минут) + refresh-token (30 дней, ротация, reuse detection: повторное использование отозванного токена отзывает всю семью).
- Выход, «выйти на всех устройствах», список активных сессий и отзыв каждой.
- Google OAuth 2.0 / OIDC: Authorization Code + PKCE, state в KV + HttpOnly cookie, серверный обмен кода, проверка подписи `id_token` по JWKS, одноразовый exchange-code на 60 секунд.
- Dev-only `POST /v1/auth/dev-login` — выдаёт сессию по e-mail без каких-либо секретов, работает только когда `APP_ENV` не `production` (нужен e2e и демо-данным).
- Защита от перебора: rate limit на эндпоинтах входа и обмена кодом; в development лимит ×20 для E2E.
- Удаление аккаунта (soft-delete 30 дней, затем анонимизация cron-задачей), экспорт данных.

### Администрирование сервиса

- Отдельная админ-панель `/app/admin`: список пользователей с поиском по e-mail и имени, количество пространств у каждого.
- Администратор сервиса задаётся переменной Worker `ADMIN_EMAIL` (можно несколько через запятую) и получает `is_staff` автоматически при входе.
- Блокировка пользователей по e-mail: глобальные баны сервиса и локальные баны в пространстве. При блокировке отзываются refresh-токены, вход и обновление сессии запрещены, активные access-токены перестают работать.
- В панели видны причина и срок блокировки; блокировка снимается разблокировкой. Администраторов и самого себя заблокировать нельзя.

### Workspace, доски, карточки

- Рабочие пространства: создание, переключение, роли `owner/admin/member/viewer`, приглашения по ссылке (7 дней, отзыв), передача владения, выход.
- Аудит-лог действий (кто/что/когда, фильтры через API, хранение 90 дней).
- Доски: шаблоны (пустая, разработка, контент, личное, найм, спринт), обложка, избранное, переименование, архив, корзина на 30 дней, восстановление, дублирование.
- Колонки: CRUD, порядок drag & drop, WIP-лимиты с диалогом подтверждения, цвет, сворачивание.
- Карточки: создание, drag & drop между колонками, оптимистичный UI, перемещение клавиатурой (Space/стрелки), заголовок, Markdown-описание с предпросмотром, метки (10 цветов), несколько исполнителей, дедлайн, приоритет, «заблокировано», чек-листы с прогрессом, вложения до 10 МБ, комментарии с `@email`-упоминаниями, лента активности, копирование ссылки, дублирование, архив и корзина.
- Undo в тостах для удаления/архивации карточки, перемещения и удаления доски.
- Version-конфликты (`If-Match`, `409` + актуальная карточка).

### Поиск, фильтры, представления

- FTS5-поиск по заголовку и описанию + поиск по комментариям, подсветка совпадений, фильтр по workspace/доске.
- Фильтры: текст, исполнитель, метки (OR внутри группы), приоритет, дедлайн (просрочено/сегодня/неделя/без даты), «только мои», «без исполнителя», архив, скрыть пустые. Все фильтры сериализуются в `?f=`.
- Сохранённые представления (личные и общие).
- Представления «Доска» и «Список», агрегированная лента «Мои задачи».

### Realtime, офлайн, PWA

- Durable Object `BoardRoom` на доску: WebSocket hibernation, `seq` событий, буфер последних 500 событий, `since_seq`-догон или `resync_required`.
- Presence: кто на доске, heartbeat 20 с, автоудаление через 30 с.
- Трансляция всех доменных событий, дедупликация по `client_mutation_id`, переподключение с экспоненциальной задержкой и jitter.
- Офлайн: IndexedDB (Dexie) хранит снапшот доски и очередь мутаций, идемпотентность через `Idempotency-Key`, повторная отправка по порядку при возврате сети, индикатор очереди, обработка конфликтов.
- PWA: manifest, service worker (Workbox), установка, офлайн-оболочка.

### UX и доступность

- Светлая/тёмная/системная тема, комфортная/компактная плотность, `prefers-reduced-motion` + ручной переключатель.
- RU/EN, даты и относительное время через `Intl`/`date-fns`.
- Клавиатура: `N`, `/`, `F`, `?`, `Cmd/Ctrl+K`, `J/K`, `E`, `A`, `D`, `Space`+стрелки в DnD, `Esc`.
- ARIA-роли, `aria-live` для тостов и сохранения, focus-ring, модальные окна с focus trap, зоны ≥ 24 px (на touch ≥ 44 px).
- Командная палитра, шпаргалка по клавишам, уведомления в приложении.

## Структура

```
apps/
  api/                 Cloudflare Worker (Hono)
    src/routes/        auth, me, workspaces, boards, cards, search, notifications
    src/durable/       BoardRoom (WebSocket + seq + presence)
    src/lib/           доступ, безопасность, D1, шаблоны, OAuth (Google)
    migrations/        D1-схема + FTS5-триггеры
    seed.sql           демо-данные
  web/                 React SPA (Vite, TanStack Query/Router, dnd-kit, Dexie)
    src/features/      auth, landing, workspaces, board, card, search, archive, settings, profile
    src/components/    UI-кит, каркас, палитра
    src/lib/           API-клиент, офлайн-очередь, realtime, запросы, утилиты
    e2e/               Playwright-сценарии
packages/
  shared/              Zod-схемы, типы, fractional indexing, фильтры, ULID
.github/workflows/     ci, deploy-web, deploy-api
```

## Быстрый старт

Требования: Node.js 22+, pnpm 11+.

```bash
pnpm install

# локальная D1 + демо-данные
pnpm db:migrate:local
pnpm db:seed:local

# секреты локального Worker
cp apps/api/.dev.vars.example apps/api/.dev.vars

# при необходимости переопределите адрес API
cp apps/web/.env.example apps/web/.env

# web (5173) + api (8787)
pnpm dev
```

Откройте http://localhost:5173.

Демо-пользователи:

| E-mail | Роль |
|---|---|
| `demo@kanban.local` | owner «Acme Studio» |
| `anna@kanban.local` | member «Acme Studio» |

Паролей у демо-пользователей нет. В development вход для E2E и демо выполняется через `POST /v1/auth/dev-login {"email": "anna@kanban.local"}` — в production этот эндпоинт отдаёт `404`.

Письма проект не отправляет: приглашение создаётся как ссылка, её нужно передать участнику вручную (ссылка возвращается в ответе API и показывается в интерфейсе). Демо-доска «Product» содержит колонки, карточки, метки, чек-лист и комментарий.

## Команды

```bash
pnpm dev                 # web + api
pnpm build               # production-сборка web и dry-run Worker
pnpm typecheck           # tsc во всех пакетах
pnpm test                # unit-тесты (shared, api, web)
pnpm lint                # Biome
pnpm e2e                 # Playwright (нужны запущенные dev-серверы)

pnpm db:migrate:local
pnpm db:seed:local
```

E2E-сценарии:

- `apps/web/e2e/smoke.mjs` — вход, доска, карточка, список, «Мои задачи», поиск, фильтры.
- `apps/web/e2e/interactions.mjs` — drag & drop, автосохранение заголовка, комментарий, чек-лист, вложение.
- `apps/web/e2e/offline.mjs` — создание карточки без сети и синхронизация очереди после возврата соединения.

## Переменные окружения

Обязательны для развёртывания: `APP_ENV`, `WEB_ORIGIN`, `VITE_API_URL`, `JWT_SECRET` и пара Google OAuth (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`). `scripts/install.sh` не даст сохранить пустое значение — завершится с ошибкой сразу на вводе. При `APP_ENV=production` `WEB_ORIGIN` и `VITE_API_URL` не могут указывать на `localhost`.

Web (`apps/web/.env` или build-time):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8787` | База API |
| `VITE_WS_URL` | выводится из API | WebSocket |
| `VITE_BASE_PATH` | `/` | Base path GitHub Pages (`/<repo>/`) |
| `VITE_GOOGLE_CLIENT_ID` | — | Публичный Google Client ID (показывает кнопку) |
| `VITE_TURNSTILE_SITE_KEY` | — | Site key Turnstile (виджет пока не встроен, см. ограничения) |

Worker (`apps/api/.dev.vars` локально, `wrangler secret put` в production):

| Переменная | Обязательна | Назначение |
|---|---|---|
| `JWT_SECRET` | да | Подпись access-токенов (HS256) |
| `WEB_ORIGIN` | да | Allowlist origin SPA (можно несколько через запятую) |
| `APP_ENV` | да | `development` / `production` |
| `IP_HASH_SALT` | желательно | Хеш IP в сессиях |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | для Google | OAuth |
| `TURNSTILE_SECRET` | опционально | Серверная проверка Turnstile |
| `ADMIN_EMAIL` | опционально | E-mail администратора сервиса (админ-панель, баны) |
| `SENTRY_DSN` | опционально | Зарезервировано |

## API (кратко)

Базовый путь `/v1`. Ошибки — `application/problem+json` (RFC 9457) с `request_id`; мутации идемпотентны по `Idempotency-Key`/`X-Client-Mutation-Id`; карточки поддерживают `If-Match: "<version>"`.

- `POST /v1/auth/refresh|logout|logout-all|oauth/exchange|dev-login` (dev-login недоступен в production)
- `GET /v1/auth/google/start|callback`
- `GET/PATCH/DELETE /v1/me`, `/v1/me/settings`, `/v1/me/sessions`, `/v1/me/identities`, `/v1/me/export`
- `GET/POST /v1/workspaces`, `PATCH/DELETE /v1/workspaces/:id`
- `GET/POST /v1/workspaces/:id/members|invitations|boards|views`, `…/my-cards`, `…/archive`, `…/audit`
- `POST /v1/invitations/:token/accept`, `DELETE /v1/invitations/:id`
- `GET/PATCH/DELETE /v1/boards/:id`, `POST /v1/boards/:id/restore|duplicate`, `GET /v1/boards/:id/export?format=json|csv|md`
- `POST /v1/boards/:id/lists`, `PATCH/DELETE /v1/lists/:id`, `POST /v1/lists/:id/cards`
- `GET/PATCH/DELETE /v1/cards/:id`, `POST /v1/cards/:id/move|restore|duplicate`, `DELETE /v1/cards/:id/permanent`
- `GET/POST /v1/cards/:id/comments`, `PATCH/DELETE /v1/comments/:id`
- `POST /v1/cards/:id/checklists`, `POST /v1/checklists/:id/items`, `PATCH/DELETE /v1/checklist-items/:id`
- `POST /v1/cards/:id/attachments/upload|register`, `GET /v1/attachments/:id/download`
- `GET/POST /v1/boards/:id/labels`, `PATCH/DELETE /v1/labels/:id`
- `GET /v1/search?q=&workspace=&board=`
- `GET /v1/notifications`, `GET /v1/notifications/count`, `POST /v1/notifications/read`
- `POST /v1/boards/:id/ws-ticket`, `GET /v1/boards/:id/ws?ticket=`
- `GET /v1/health`

## Realtime-протокол

Сообщения — JSON. Клиент: `hello {since_seq}`, `presence.ping`. Сервер: `hello.ok`, `presence.state`, доменные события (`card.created/updated/moved/deleted`, `list.*`, `comment.*`, `attachment.added`, `board.updated`). У каждого события есть `seq` на доску; при пропуске — `resync_required`, клиент перезапрашивает снапшот.

## Безопасность

- Проверка ролей и членства — на сервере в каждом запросе; роль берётся только из БД.
- Паролей в системе нет: аккаунты создаёт OAuth-провайдер, refresh-токены хранятся только SHA-256-хешем.
- JWT access 15 минут; refresh 30 дней с ротацией и reuse detection.
- Markdown санитайзится через DOMPurify (белый список тегов), внешние ссылки получают `rel="noopener noreferrer nofollow"`.
- Загрузки: ограничение 10 МБ, запрет SVG/HTML, случайные ключи в KV (`file:` + ULID), проверка владельца при скачивании, `X-Content-Type-Options: nosniff`.
- CORS с точным allowlist, `Cache-Control: no-store` для приватных данных, `X-Request-Id`.
- В production-сборку web инжектируется CSP (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`).
- Rate limit на dev-login, обмене кодом OAuth и приглашениях; в development лимит ×20 для E2E.
- `POST /v1/auth/dev-login` отдаёт `404` при `APP_ENV=production` — в проде точка входа только через OAuth.

## Деплой

### API

1. Создайте ресурсы Cloudflare: D1 и KV (R2 не используется).
2. Пропишите их ID в `apps/api/wrangler.jsonc` (сейчас там dev-значения) и укажите production-домен в `WEB_ORIGIN`.
3. Задайте секреты:

```bash
cd apps/api
wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_CLIENT_SECRET   # Google OAuth
wrangler secret put TURNSTILE_SECRET      # опционально
wrangler d1 migrations apply DB --remote
wrangler deploy
```

4. Google Cloud Console → OAuth client (Web application):
   - Authorized JavaScript origins: `https://app.example.com`, `http://localhost:5173`
   - Redirect URIs: `https://api.example.com/v1/auth/google/callback`, `https://kanban-api-staging.<subdomain>.workers.dev/v1/auth/google/callback`, `http://localhost:8787/v1/auth/google/callback`
   - `GOOGLE_CLIENT_ID` должен совпадать в web-бандле (`VITE_GOOGLE_CLIENT_ID`) и Worker vars.

### Web (GitHub Pages)

Соберите с `VITE_API_URL`, `VITE_WS_URL`, `VITE_BASE_PATH` (`/<repo>/` для project site), `VITE_GOOGLE_CLIENT_ID`. `pnpm build` создаёт `dist/index.html` и `dist/404.html` для SPA-fallback. Workflow `.github/workflows/deploy-web.yml` публикует артефакт; при необходимости включите GitHub Pages в настройках репозитория.

### Фоновые задачи

Cron trigger (`0 * * * *`) настроен в `wrangler.jsonc`:

- очистка корзины старше 30 дней, файлов вложений из KV, просроченных токенов, логов мутаций (24 ч), аудита (90 дней);
- анонимизация удалённых аккаунтов через 30 дней.

## Тестирование

- `packages/shared` — fractional indexing, парсер фильтров и фильтрация, URL-DSL.
- `apps/api` — подпись/проверка JWT, подмена подписи и чужой секрет.
- `apps/web` — утилиты (инициалы, даты, плюрализация).
- Playwright — сквозные сценарии, включая drag & drop, автосохранение и вложения.

## Осознанные отличия и ограничения

- **JWT HS256 вместо EdDSA**: подпись использует `JWT_SECRET`, а не пару ключей. Проще в эксплуатации; контракт токена и TTL совпадают с ТЗ.
- **Загрузка файлов через Worker в KV** (namespace `CACHE`, префикс `file:`): нет лишней зависимости, проверки MIME/владельца остаются на сервере; лимит KV на значение 25 МБ покрывает наш лимит 10 МБ.
- **Service Worker не кеширует API**: API помечен NetworkOnly, офлайн-чтение идёт из Dexie-снапшота. Это безопаснее для токенов в заголовках, чем SWR с общим кешем.
- **Turnstile**: серверная функция `verifyTurnstile` осталась в коде, но парольных форм больше нет и она нигде не вызывается; `TURNSTILE_SECRET` можно не задавать.
- **UI-стек**: вместо Tailwind/shadcn — собственный CSS-дизайн-система на токенах раздела 5.5 и собственные доступные компоненты. Визуально и функционально соответствует ТЗ, меньше зависимостей.
- **Шрифт**: Inter не забандлен, используется системный стек с Inter в приоритете (self-hosted `woff2` можно добавить без изменения разметки).
- Нет виртуализации списка карточек, импорта CSV/Trello, GitHub OAuth, 2FA, web-push, реакций, пользовательских полей, связей карточек, публичных ссылок, биллинга и AI — это P1/P2 из ТЗ.
- Комментарии отдаются порцией до 300; пагинация «Показать ещё» в UI не реализована.

## Проверено

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — зелёные.
- E2E в Chromium: вход → доска → карточка → создание → список → поиск → фильтры; DnD, автосохранение, комментарий, чек-лист, вложение; офлайн-очередь и синхронизация. Ошибок страницы нет.
- Первый JS лендинга ≈ 174 КБ gzip (бюджет 180 КБ), маршруты и тяжёлые библиотеки вынесены в отдельные чанки.

Подробности по деплою — в `docs/DEPLOY.md`.
