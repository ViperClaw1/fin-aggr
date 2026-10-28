# Спека этапа 1: фронтенд-прототип финансового агрегатора (моки)

Oct 25, 2026 · @Nikita · Статус: черновик для утверждения

## 1. Задача этапа 1

Этап 1 даёт демонстрируемый фронтенд-прототип на моковых данных: P0-страницы, расчёты в браузере, заменяемый источник данных и автоматические гарантии архитектуры. Оценка: около 45 рабочих дней одним инженером (примерно 9 недель, оценка моя, разбивка в разделе 8).

**Цель.** Каркас, на который на этапе 2 подключаются реальные данные без переписывания UI, плюс работающая демонстрация главных идей продукта: честный расчёт чистой доходности, проверяемые источники, прозрачная надёжность банков.

**Принципы продукта, которые код обязан обеспечивать:**

- Выдача считается математикой, а не рекламой. Реклама отдельно и с пометкой.
- Профиль пользователя не покидает браузер.
- У каждого показанного факта есть источник и дата проверки.
- Деньги считаются без float.

### В объёме (P0)

| Область | Что делаем |
| --- | --- |
| Страницы | `/`, `/compare/[category]` (cd, savings, treasury), `/product/[id]`, `/banks`, `/banks/[id]`, `/tools/fdic-coverage`, `/tools/after-tax-yield`, `/methodology`, `/disclosure`, `/privacy` |
| Сквозные блоки | Панель профиля (drawer), просмотрщик цитат из PDF, баннер DEMO DATA, раскрытие расчёта пошагово |
| Движок | Деньги и ставки, налоги, чистая доходность, правила допуска с трассой, ранжирование, планировщик покрытия |
| Данные | Контракты, детерминированные фикстуры, mock-gateway с задержками и ошибками, заглушка http-gateway |
| Качество | Линтинг и проверки архитектуры, unit, contract, e2e (приватность, доступность) |

**P1 (если останется время):** отдельная страница `/documents/[id]`, сравнение двух продуктов рядом, график истории ставки, список «что изменилось с прошлой проверки».

### Вне объёма

- Реальные ставки и реальный парсинг PDF. В демо только синтетические PDF, написанные нами (без чужих материалов).
- Серверная часть, авторизация, платежи.
- Кредитные карты, ипотека, автокредиты, брокеры, недвижимость, муниципальные облигации.
- Налог города по ZIP (только ручной ввод ставки).
- Сторонние скрипты и аналитика (позже, с правилами CSP).

### Результаты

1. **D1.** Монорепо с гардрейлами: lint, проверки зависимостей, CI.
2. **D2.** `@fa/contracts`: схемы и интерфейс `DataGateway`.
3. **D3.** `@fa/fixtures`: детерминированные моки, проверяемые схемами.
4. **D4.** `@fa/engine`: расчёты с тестами.
5. **D5.** `apps/web`: P0-страницы.
6. **D6.** Mock-gateway и заглушка http-gateway, переключение через env.
7. **D7.** Тесты: unit, contract, e2e (приватность, доступность, дым).
8. **D8.** README: запуск, переключение источника, как добавить категорию продукта.

### Критерии приёмки

| ID | Критерий | Как проверяется |
| --- | --- | --- |
| AC-1 | `typecheck`, `lint` (0 предупреждений), `depcruise`, `knip`, `test`, `build` проходят в CI | CI |
| AC-2 | Движок: не менее 20 «золотых» кейсов, ожидаемые значения посчитаны независимо (таблица), property-тесты, покрытие строк не ниже 90% и ветвлений не ниже 85% | Vitest coverage thresholds |
| AC-3 | У каждого показанного числа (ставка, штраф, лимит, метрика банка) есть `SourceCitation` или метка «assumption» | e2e: `[data-citation]` или `[data-assumption]` на значимых ячейках |
| AC-4 | Значения профиля не попадают ни в один сетевой запрос | Playwright с sentinel-значениями (например, доход 987654) плюс CSP `connect-src 'self'` |
| AC-5 | Моки не выдаются за данные: баннер DEMO DATA на всех страницах, `isMock: true` везде, кроме справочных констант со статусом `unverified` | Contract-тест фикстур, e2e |
| AC-6 | Реклама изолирована: в органических контрактах нет коммерческих полей, `SponsoredSlot` не рендерится внутри таблиц | Contract-тест схем, depcruise |
| AC-7 | Доступность: axe без serious/critical на P0-страницах, таблица и drawer управляются с клавиатуры | Playwright + axe |
| AC-8 | Цели по производительности (подтвердить замером): Lighthouse mobile Performance не ниже 85 на `/compare/cd` со 120 продуктами, JS первой загрузки не больше 200 KB gzip без PDF-модуля | Lighthouse CI, bundle analyzer |
| AC-9 | `NEXT_PUBLIC_DATA_SOURCE=mock` или `http`: http-gateway отвечает `not_implemented`, контрактные тесты гоняются против любой реализации | Contract-тесты |
| AC-10 | Каждое архитектурное правило линтера имеет файл-«канарейку», на котором линтер обязан падать | `pnpm lint:canaries` |

### Ограничения

- TypeScript strict, без `any`. Node LTS, pnpm. Точные версии зависимостей закреплены в ADR-014 (`docs/adr/`).
- Стили: Tailwind 4 (CSS-first). Минимум браузеров из-за него: Safari 16.4+, Chrome 111+ (ADR-014).
- Интерфейс на английском (рынок США). Браузеры: две последние версии Chrome, Safari, Firefox, Edge (допущение).
- Шрифты self-hosted (`next/font`), никаких сторонних скриптов на этапе 1.

## 2. Структура репозитория и правила зависимостей

Четыре единицы сборки и пять слоёв, зависимости только вниз; каждое правило ниже проверяется линтером или графом зависимостей.

&#91;embedded content: архитектура · 5 слоёв приложения и 3 пакета\]

Расчёты (`engine`) доступны всем слоям, кроме `shared`. Контракты доступны всем. Фикстуры видит только `shared/api`.

### Дерево репозитория

```
fa/
  apps/web/
    src/
      app/         маршруты Next.js, layouts, метаданные (композиция, без логики)
      widgets/     блоки страниц
      features/    действия пользователя
      entities/    product, institution, rule, fact (+ реестр источников), document, reference (налоговые таблицы, лимиты страхования), profile, sponsored
        <entity>/
          index.ts     публичный API: типы, селекторы, UI
          queries.ts   вторая публичная точка: query-хуки (реэкспорт из ./api)
          api/         вызовы gateway (единственное место getGateway())
          model/       типы, селекторы, сторы
          ui/          представления сущности
      shared/
        ui/  lib/  config/
        api/       http.ts, gateway.mock.ts, gateway.http.ts, index.ts
    e2e/           Playwright
  packages/
    contracts/     zod-схемы, типы, DataGateway (зависит только от zod)
    engine/        чистые расчёты (contracts и decimal.js)
    fixtures/      детерминированные моки (contracts)
  tools/           lint:canaries и скрипты проверок
```

Алиас `@/` указывает на `apps/web/src`, пакеты импортируются как `@fa/*`.

### Пакеты

| Пакет | Зависит от | Кто использует | Запрещено |
| --- | --- | --- | --- |
| `@fa/contracts` | только `zod` | Все | Любые другие зависимости; импорт `profile` из gateway-типов |
| `@fa/engine` | `contracts`, `decimal.js` | `entities`, `features`, `widgets`, `app` (но не `shared`) | `react`, `next`, DOM, время и случайность без параметров |
| `@fa/fixtures` | `contracts` | `shared/api` (mock-gateway), тесты, e2e | Использование в production-коде вне `shared/api` |
| `apps/web` | Все три пакета | Конечный продукт | Дублировать расчёты и схемы |

### Кто что может вызывать

| Что | Где определено | Кто может вызывать | Чем обеспечено |
| --- | --- | --- | --- |
| `getGateway()` | `shared/api` | Только `entities/*/api` | ESLint `GATEWAY` |
| Query-хуки (`useProducts` и др.) | `entities/*/queries` | `widgets`, `app` (включая префетч) | ESLint `QUERIES_BAN` для `features`, правила слоёв |
| `engine` | `packages/engine` | `entities`, `features`, `widgets`, `app` | ESLint `ENGINE_BAN` для `shared`, depcruise |
| Чтение профиля (`useProfile`, селекторы) | `entities/profile` | `features`, `widgets`, `app` | Правила слоёв |
| Запись профиля (`useProfileActions`) | `entities/profile` | Только `features/edit-profile` | ESLint `PROFILE_WRITE` |
| Сеть (`fetch`) | `shared/api/http.ts` | Только `http.ts` | `no-restricted-globals` |
| `localStorage` | `entities/profile/model/persist.ts` | Только `persist.ts` | `no-restricted-globals` |
| Фикстуры | `packages/fixtures` | Только `shared/api`, тесты | `FIXTURES_BAN`, depcruise |
| Реклама (`@fa/contracts/ads`, `SponsoredSlot`) | `contracts/ads`, `widgets/sponsored-slot` | gateway, виджет, монтаж в `app` | depcruise `ads-contract-isolated` |
| Время | `shared/lib/clock` | Любой код `apps/web` | `no-restricted-properties`, `NO_AMBIENT_TIME` |

### Композиция страниц

Страница в `app` только собирает виджеты, задаёт метаданные и префетчит данные через query-хуки. Логики в `page.tsx` нет, файл не длиннее 80 строк (ESLint).

| Маршрут | Рендеринг | Виджеты | Префетч |
| --- | --- | --- | --- |
| `/` | SSG | `landing` | нет |
| `/compare/[category]` | SSG-оболочка (`generateStaticParams`: cd, savings, treasury), расчёты на клиенте | `compare-table`; рядом `sponsored-slot` (`compare_top`) | products, tax tables, sources |
| `/product/[id]` | SSG-оболочка, расчёты на клиенте | `product-breakdown`, `fine-print`; рядом `sponsored-slot` (`product_aside`) | product, facts, tax tables |
| `/banks` | ISR | `bank-search` | institutions |
| `/banks/[id]` | ISR | `bank-health` | institution, metrics |
| `/tools/fdic-coverage` | Клиент | `coverage-planner` | insurance rules, institutions |
| `/tools/after-tax-yield` | Клиент | `yield-comparator` | products, tax tables |
| `/documents/[id]` (P1) | Клиент | `citation-viewer` в режиме страницы | document |
| `/methodology`, `/disclosure`, `/privacy` | SSG | Статичный контент | sources |
| Корневой `layout.tsx` |  | `profile-drawer`, `CitationViewerHost` (из `citation-viewer`), `DemoDataBanner`, провайдеры (QueryClient, nuqs) | нет |

**Паттерн `CitationViewerHost`.** Виджеты не импортируют друг друга, поэтому открытие просмотрщика цитат устроено через URL: `SourceCitation` вызывает колбэк `onOpen`, фича `open-citation` пишет `?doc=&page=&q=` в адрес, а `CitationViewerHost` в корневом `layout` читает адрес и показывает панель с PDF. Никто, кроме `layout`, виджет `citation-viewer` не монтирует.

### Правила публичного API слайса

1. Корень слайса отдаёт наружу только то, что экспортирует `index.ts`. У `entities/*` есть вторая точка входа `queries.ts`.
2. Внутри слайса только относительные импорты. Между слайсами только алиас `@/` на публичный API.
3. Слайсы одного слоя друг друга не импортируют: общее переносится в слой ниже или собирается слоем выше.
4. Новый слайс заводится вместе со строкой в реестре компонентов (раздел 6).

## 3. Архитектурные решения (ADR)

Двенадцать решений, все со статусом «принято для этапа 1». Любое изменение оформляется новым ADR, а не правкой старого.

### ADR-001. Монорепо на pnpm workspaces

- **Контекст.** Расчёты и контракты должны работать в браузере сейчас и на сервере позже, и их нельзя случайно связать с UI.
- **Решение.** `apps/web` и три пакета: `@fa/contracts` (zod-схемы, типы, интерфейс `DataGateway`), `@fa/engine` (чистые расчёты), `@fa/fixtures` (моки). Зависимости: `engine` и `fixtures` зависят от `contracts`, `contracts` только от zod.
- **Последствия.** Границы держатся физически (у пакета нет `react` в зависимостях). Минус: один-два дня на настройку.
- **Отвергнуто.** Один пакет с алиасами и линтом: границы держались бы только дисциплиной.

### ADR-002. FSD-lite внутри `apps/web/src`

- **Контекст.** Нужны правила «кто что может импортировать», понятные и проверяемые автоматически.
- **Решение.** Слои `app`, `widgets`, `features`, `entities`, `shared`. Каталог `app` это маршруты Next.js, и он остаётся тонким: композиция виджетов, метаданные, префетч. Отдельного слоя `pages` нет. Импорт только вниз по слоям. Слайсы одного слоя друг друга не импортируют. У слайса публичный API через `index.ts`. Внутри слайса только относительные импорты.
- **Последствия.** Композиция всегда выше слайсов (см. паттерн `CitationViewerHost`, раздел 2). Минус: иногда приходится поднимать код на слой вверх.

### ADR-003. Деньги и ставки

- **Решение.** Деньги это `Cents`: целое число центов (brand-тип). Ставки это `Rate`: десятичная строка (`"0.0435"` значит 4,35%). Вся арифметика через `decimal.js` (изолированный клон `Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })`). Округление до цента только на выходе функции, промежуточные значения не округляются. Запрещены `toFixed`, `parseFloat` и умножение денег на `number`.
- **Последствия.** Результаты воспроизводимы и объяснимы. Расчёты это оценки, и интерфейс так и подписывает. Реальные банки округляют по своим правилам.
- **Изменено ADR-013** (`docs/adr/013-money-primitives-in-contracts.md`): брендирование, разбор и форматирование `Cents` и `Rate` живут в `@fa/contracts/src/money/`, арифметика остаётся в `engine`.

### ADR-004. Профиль пользователя не покидает браузер

- **Решение.** Профиль хранится в localStorage через Zustand `persist` (версионированная схема, миграции, экспорт и импорт JSON, кнопка «стереть всё»). Методы `DataGateway` не принимают профиль: схемы запросов `.strict()` и не содержат его полей. Заголовок CSP: `connect-src 'self'` плюс явный список разрешённых адресов. На этапе 1 сторонних адресов нет.
- **Проверка.** Правило depcruise `profile-stays-local`, e2e-тест с sentinel-значениями, контрактный тест на схемы запросов.
- **Последствия.** Нет серверной персонализации. Ссылками делятся без профиля. Пользователь может потерять профиль при очистке браузера, поэтому нужен экспорт.

### ADR-005. Data gateway и in-process mock

- **Контекст.** Моки должны работать и в Server Components, и в браузере, и при сборке (SSG).
- **Решение.** Интерфейс `DataGateway` живёт в `@fa/contracts`. Две реализации в `shared/api`: `gateway.mock` (фикстуры в процессе, ответы проходят через zod, детерминированные задержки 150–600 мс, переключаемая инъекция ошибок) и `gateway.http` (заглушка с `not_implemented`). Выбор по `NEXT_PUBLIC_DATA_SOURCE`, значение вшивается при сборке, неиспользуемая ветка отбрасывается. Получить gateway можно только через `getGateway()`, вызывать его можно только в `entities/*/api`.
- **Последствия.** Один код работает в RSC, клиенте и тестах. REST-контракт (раздел 4) подключается позже без правки UI.
- **Отвергнуто.** MSW (сложно с RSC и SSG), собственные route handlers как мок (при сборке приложение запрашивает само себя).

### ADR-006. Органическая выдача и реклама разделены на уровне контракта

- **Решение.** У `Product`, `Institution`, `Rate` нет полей о комиссиях и спонсорстве. Реклама приходит отдельным методом `listSponsored()` и отдельным подпакетом контракта `@fa/contracts/ads`. Функции ранжирования в `engine` не принимают рекламных данных. `SponsoredSlot` монтируется только в `app/**` и никогда внутри таблицы или списка выдачи. Подпакет `ads` импортируют только gateway и виджет `sponsored-slot`.
- **Последствия.** «Спонсорская позиция внутри таблицы» технически невозможна. Это сознательная цена честности.

### ADR-007. Provenance-first

- **Решение.** Показываемые факты (ставка, штраф, лимит, метрика) приходят как `Fact<T>` с обязательным `Provenance` (источник, URL, дата получения, документ, страница, цитата, статус проверки, `isMock`). Компонент `SourceCitation` обязателен рядом с каждым фактом. `isMock` управляет баннером DEMO DATA.
- **Последствия.** Данные тяжелее, зато проверяемость встроена. Тест AC-3 это проверяет.

### ADR-008. Рендеринг

- **Решение.** Каталог и страницы банков: SSG/ISR с префетчем и гидратацией TanStack Query. Персональные расчёты только на клиенте после гидратации. До ввода профиля выдача отсортирована по APY брутто с подписью «Add your profile for after-tax ranking». Server Components по умолчанию, `"use client"` на листьях. Тяжёлое (pdf.js, графики) через `next/dynamic`.

### ADR-009. Состояние

- **Решение.** Четыре места состояния и больше никаких: URL (nuqs) для фильтров, которыми делятся; Zustand только для профиля; TanStack Query для удалённых данных; локальное состояние компонента. Формы через react-hook-form и zod. Redux, Jotai, Recoil, MobX запрещены линтером.

### ADR-010. Правила допуска как JSON-AST

- **Решение.** Правила хранятся данными (`and`, `or`, `not`, `eq`, `neq`, `gte`, `lte`, `in`) над перечислением полей профиля. Вычисление трёхзначное (`true`, `false`, `unknown`), результат содержит трассу. Никакого `eval`.
- **Последствия.** Интерфейс объясняет причину блокировки и подсвечивает, какое поле профиля не заполнено. Новые поля требуют новой версии перечисления.

### ADR-011. Детерминизм

- **Решение.** `engine` и `contracts` чистые: время приходит параметром `asOf`, случайность в фикстурах только через seed. В приложении время берётся из `shared/lib/clock` (подменяется в тестах). `Date.now()`, `new Date()` без аргументов и `Math.random()` запрещены линтером в `engine` и вне `clock`.

### ADR-012. Качество как часть архитектуры

- **Решение.** Строгий TypeScript, ESLint с нулём предупреждений, dependency-cruiser, knip (неиспользуемое), пороги покрытия, файлы-«канарейки» для проверки самих правил. Исключения только через `eslint-disable-next-line` с описанием не короче 10 символов и со ссылкой на задачу, неиспользуемые disable-директивы считаются ошибкой.
- **Последствия.** Нарушение границы ловится при коммите, а не на ревью.

## 4. API-контракты

Контракт живёт в `@fa/contracts` как zod-схемы, типы выводятся из схем. Mock-gateway и будущий HTTP-бэкенд обязаны отвечать этим схемам. Код ниже это эталон структуры; перед использованием проверить на выбранной версии zod.

### Конвенции

- **Деньги:** целые центы USD (`Cents`). **Ставки:** десятичная строка-доля (`Rate`, `"0.0435"` значит 4,35%). **Даты:** ISO (`YYYY-MM-DD`, время с offset). **Идентификаторы:** непрозрачные строки (`fdic:628`, `prod_cd_0042`).
- **Пагинация:** курсорная, `{ items, nextCursor }`.
- **Версионирование:** `/v1`, только аддитивные изменения, ломающее изменение это `/v2` и новая мажорная версия пакета.
- **Ошибки:** `GatewayError` с кодом `not_found`, `validation_failed`, `rate_limited`, `unavailable`, `not_implemented`.
- **Валидация:** ответ любого gateway парсится схемой на границе. Ошибка парсинга в dev падает громко, в prod логируется и превращается в `unavailable`.
- **Строгость:** все объектные схемы (сущности, справочники, `Provenance`, узлы `Rule`, `fact()`, профиль, запросы) объявлены через `z.strictObject`: лишний ключ на любом уровне даёт ошибку, а не молча отбрасывается. В примерах кода ниже `z.object` читать как `z.strictObject`.
- **Инварианты `Product`** (`superRefine`): тиры упорядочены по `minBalance` и не пересекаются, открытым (`maxBalance: null`) может быть только последний; `validTo >= validFrom`; `maxDeposit >= minOpening`; у `cd` и `treasury` `termMonths` обязателен, у `savings` равен `null`. Суммы тиров, `minOpening` и `maxDeposit` неотрицательны. Глубина `Rule` не больше 8 (`MAX_RULE_DEPTH`).
- **Нет полей профиля** ни в одном запросе (ADR-004). **Нет коммерческих полей** в органических сущностях (ADR-006).

### Примитивы и источник

```ts
// packages/contracts/src/money/  (ADR-013; zod v4)
import { z } from 'zod';

export const Cents = z.int().brand<'Cents'>();                      // safe integer
export type Cents = z.infer<typeof Cents>;

// доля 0 ≤ r ≤ 1; значения > 100% (множители) это отдельный тип, не Rate
export const Rate = z.string().regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/).brand<'Rate'>();
export type Rate = z.infer<typeof Rate>;

// packages/contracts/src/primitives.ts

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).brand<'IsoDate'>();
export type IsoDate = z.infer<typeof IsoDate>;

export const IsoDateTime = z.iso.datetime({ offset: true }).brand<'IsoDateTime'>();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Id = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,63}$/i);
export type Id = z.infer<typeof Id>;

// packages/contracts/src/provenance.ts
export const Provenance = z.object({
  sourceId: Id,
  sourceUrl: z.url(),
  retrievedAt: IsoDateTime,
  document: z
    .object({ id: Id, page: z.number().int().positive(), quote: z.string().min(1).max(400) })
    .optional(),
  verification: z.discriminatedUnion('status', [
    z.object({ status: z.literal('verified'), verifiedAt: IsoDate, by: z.enum(['human', 'official_api']) }),
    z.object({ status: z.literal('unverified') }),
  ]),
  isMock: z.boolean(),
});
export type Provenance = z.infer<typeof Provenance>;

export const fact = <S extends z.ZodType>(value: S) => z.object({ value, provenance: Provenance });
export interface Fact<T> { readonly value: T; readonly provenance: Provenance }
```

### Правила допуска (AST)

Пустой `and` означает «без ограничений», пустой `or` означает «никогда». Поле `label` это текст причины для интерфейса.

```ts
// packages/contracts/src/rules.ts
export const ProfileField = z.enum(['residency', 'stateOfResidence', 'age', 'filingStatus', 'depositAmount']);
export type ProfileField = z.infer<typeof ProfileField>;
// Имена полей правил не совпадают с Profile (stateOfResidence ← stateCode, depositAmount ← scenario.principal).
// toEligibilityContext сопоставляет их явным allowlist, без spread профиля.

type Label = { label?: string | undefined };
export type Rule =
  | (Label & { op: 'and' | 'or'; args: Rule[] })
  | (Label & { op: 'not'; arg: Rule })
  | (Label & { op: 'eq' | 'neq'; field: ProfileField; value: string | number })
  | (Label & { op: 'gte' | 'lte'; field: ProfileField; value: number })
  | (Label & { op: 'in'; field: ProfileField; values: (string | number)[] });

const label = z.string().optional();
export const Rule: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({ op: z.enum(['and', 'or']), args: z.array(Rule), label }),
    z.object({ op: z.literal('not'), arg: Rule, label }),
    z.object({ op: z.enum(['eq', 'neq']), field: ProfileField, value: z.union([z.string(), z.number()]), label }),
    z.object({ op: z.enum(['gte', 'lte']), field: ProfileField, value: z.number(), label }),
    z.object({ op: z.literal('in'), field: ProfileField, values: z.array(z.union([z.string(), z.number()])).min(1), label }),
  ]),
);
```

Если `exactOptionalPropertyTypes` конфликтует с `z.optional()`, оставить `label?: string | undefined` в типе (так и написано).

### Сущности

```ts
// packages/contracts/src/entities.ts
export const Regulator = z.enum(['FDIC', 'NCUA']);
export const InstitutionKind = z.enum(['direct_bank', 'credit_union', 'fintech_partner']);

export const Institution = z.object({
  id: Id,                                  // 'fdic:<cert>' или 'ncua:<charter>'
  name: z.string(),
  regulator: Regulator,
  kind: InstitutionKind,
  partnerInstitutionIds: z.array(Id),      // для fintech_partner: банки программы; иначе []
  hqState: z.string().length(2),
  website: z.url().nullable(),
  provenance: Provenance,
});

export const MetricKey = z.enum([
  'tier1LeverageRatio', 'totalRiskBasedCapitalRatio', 'allowanceToLoans',
  'loansToDeposits', 'liquidAssetsToAssets', 'noncurrentLoansRatio', 'returnOnAssets',
]);
export const MetricValue = z.object({
  value: z.number(), marketMedian: z.number(), marketMean: z.number(),
  percentile: z.number().min(0).max(100),
});
export const BankMetrics = z.object({
  institutionId: Id,
  asOf: IsoDate,
  totalAssetsUsdThousands: z.number().int().nonnegative(),
  metrics: z.partialRecord(MetricKey, fact(MetricValue)),  // проценты, без денежной арифметики; нет метрики → «n/a», не выдумываем
  balanceSheetMix: z.array(z.object({ label: z.string(), share: z.number().min(0).max(1) })),
  provenance: Provenance,
});

export const ProductCategory = z.enum([
  'cd', 'savings', 'money_market', 'treasury', 'muni',
  'credit_card', 'mortgage', 'auto_loan', 'personal_loan', 'refinance',
]);
export const STAGE1_CATEGORIES = ['cd', 'savings', 'treasury'] as const;

export const RateTier = z.object({ minBalance: Cents, maxBalance: Cents.nullable(), apy: Rate });
export const EarlyWithdrawal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('days_of_interest'), days: z.number().int().positive() }),
  z.object({ kind: z.literal('months_of_interest'), months: z.number().int().positive() }),
  z.object({ kind: z.literal('percent_of_principal'), rate: Rate }),
]);

export const Product = z.object({
  id: Id,
  institutionId: Id,
  category: ProductCategory,
  name: z.string(),
  termMonths: z.number().int().positive().nullable(),     // null: счёт без срока
  tierMode: z.enum(['whole_balance', 'marginal']),
  tiers: z.array(RateTier).min(1),
  compounding: z.enum(['daily', 'monthly', 'quarterly', 'semiannual', 'annual', 'at_maturity']),
  minOpening: Cents,
  maxDeposit: Cents.nullable(),
  earlyWithdrawal: fact(EarlyWithdrawal),                 // со ссылкой на документ, страницу, цитату
  eligibility: Rule,
  taxTreatment: z.enum(['taxable', 'state_local_exempt', 'federal_exempt']),
  validFrom: IsoDate,
  validTo: IsoDate.nullable(),
  provenance: Provenance,
});

export const DocumentMeta = z.object({
  id: Id, title: z.string(), publisherInstitutionId: Id.nullable(),
  pages: z.number().int().positive(), fileUrl: z.string(),
  publishedAt: IsoDate.nullable(), isSynthetic: z.boolean(),
});
export const FactRecord = z.object({
  id: Id, productId: Id.nullable(), documentId: Id,
  key: z.enum(['earlyWithdrawalPenalty', 'achWithdrawalLimit', 'monthlyFee', 'minBalanceForApy', 'rateChangePolicy']),
  humanLabel: z.string(), valueText: z.string(),
  page: z.number().int().positive(), quote: z.string().min(1).max(400),
  status: z.enum(['verified', 'unverified']), isMock: z.boolean(),
});
```

### Справочные данные и профиль

```ts
// packages/contracts/src/reference.ts
export const FilingStatus = z.enum(['single', 'married_joint', 'married_separate', 'head_of_household']);
export const TaxBracket = z.object({ upTo: Cents.nullable(), rate: Rate });   // upTo включительно, null у последней
export const TaxTables = z.object({
  taxYear: z.number().int(),
  federal: z.record(FilingStatus, z.array(TaxBracket).min(1)),               // по налогооблагаемому доходу; zod 4: все статусы обязательны
  states: z.record(z.string().length(2), z.object({ assumedMarginalRate: Rate })),
  provenance: Provenance,
});
export const InsuranceRules = z.object({
  asOf: IsoDate,
  byRegulator: z.record(Regulator, z.object({ limitPerOwnerPerInstitutionPerCategory: Cents })),
  supportedCategories: z.array(z.enum(['single', 'joint'])).min(1),
  jointOwnersAssumed: z.literal(2),
  accruedInterestCountsTowardLimit: z.literal(true),
  provenance: Provenance,
});
export const SourceRegistryEntry = z.object({
  id: Id, name: z.string(), url: z.url(),
  kind: z.enum(['official_api', 'official_document', 'issuer_document', 'partner_feed', 'manual']),
  license: z.string(), lastUpdatedAt: IsoDateTime.nullable(), notes: z.string().optional(),
});

// packages/contracts/src/profile.ts  (клиентский; НЕ импортируется из gateway.ts и queries.ts)
export const Profile = z.strictObject({
  version: z.literal(1),
  taxYear: z.number().int(),
  filingStatus: FilingStatus,
  stateCode: z.string().length(2),
  taxableIncome: Cents,                                   // до этих процентов
  cityMarginalRate: Rate.nullable(),                      // ручной ввод
  residency: z.enum(['us_citizen', 'us_resident', 'nonresident']),
  age: z.number().int().min(0).max(120).nullable(),
  scenario: z.object({ principal: Cents, holdingMonths: z.number().int().min(1).max(120) }),
});

// packages/contracts/src/calc.ts  (общие типы вывода движка, чтобы UI рендерил их)
export const CalcStep = z.object({
  id: z.string(), label: z.string(), formula: z.string(),
  inputs: z.record(z.string(), z.string()), result: z.string(),
});
export const Assumption = z.object({ id: z.string(), text: z.string(), editable: z.boolean() });
```

Значения справочников в моках (налоговые скобки, ставки штатов, лимит страхования) не считаются фактами: в фикстурах они помечены `unverified`. Перед публичным запуском их заменяют проверенными данными по официальным источникам.

### Запросы, gateway, реклама

```ts
// packages/contracts/src/queries.ts
export const Page = <S extends z.ZodType>(item: S) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export interface PageOf<T> { items: T[]; nextCursor: string | null }

const Limit = z.number().int().min(1).max(100);
export const InstitutionQuery = z.strictObject({
  q: z.string().max(80).optional(), kind: InstitutionKind.optional(),
  limit: Limit.default(25), cursor: z.string().optional(),
});
export const ProductQuery = z.strictObject({
  category: ProductCategory, institutionId: Id.optional(),
  limit: Limit.default(100), cursor: z.string().optional(),
});
export const FactQuery = z.strictObject({ documentId: Id.optional(), productId: Id.optional() })
  .refine((q) => q.documentId !== undefined || q.productId !== undefined, 'documentId or productId required');

// packages/contracts/src/gateway.ts
export class GatewayError extends Error {
  constructor(
    readonly code: 'not_found' | 'validation_failed' | 'rate_limited' | 'unavailable' | 'not_implemented',
    message: string,
    readonly retryable: boolean,
  ) { super(message); this.name = 'GatewayError'; }
}

export interface DataGateway {
  listInstitutions(q: z.input<typeof InstitutionQuery>): Promise<PageOf<Institution>>;
  getInstitution(id: Id): Promise<Institution>;
  getBankMetrics(id: Id, asOf?: IsoDate): Promise<BankMetrics>;
  listProducts(q: z.input<typeof ProductQuery>): Promise<PageOf<Product>>;
  getProduct(id: Id): Promise<Product>;
  getDocument(id: Id): Promise<DocumentMeta>;
  listFacts(q: z.input<typeof FactQuery>): Promise<FactRecord[]>;
  getTaxTables(taxYear: number): Promise<TaxTables>;
  getInsuranceRules(asOf?: IsoDate): Promise<InsuranceRules>;
  listSources(): Promise<SourceRegistryEntry[]>;
  listSponsored(placement: SponsoredPlacement): Promise<SponsoredItem[]>;   // из '@fa/contracts/ads'
}

// packages/contracts/src/ads.ts  (подпакет '@fa/contracts/ads')
export const SponsoredPlacement = z.enum(['compare_top', 'compare_sidebar', 'product_aside']);
export const SponsoredItem = z.object({
  id: Id, placement: SponsoredPlacement, advertiser: z.string(),
  headline: z.string().max(90), body: z.string().max(200),
  ctaLabel: z.string(), ctaUrl: z.url(),
  disclosure: z.string().min(10),
  compensationType: z.enum(['cpa', 'cpc', 'flat_fee']),
});
```

### Будущий REST (соответствие методам gateway)

Пути и кэш это предложение для этапа 2, заголовки подобрать по реальной нагрузке.

| Метод и путь | Метод gateway | Ответ | Кэш (предложение) |
| --- | --- | --- | --- |
| `GET /v1/institutions` | `listInstitutions` | `Page<Institution>` | `s-maxage=3600` |
| `GET /v1/institutions/{id}` | `getInstitution` | `Institution` | `s-maxage=3600` |
| `GET /v1/institutions/{id}/metrics?asOf=` | `getBankMetrics` | `BankMetrics` | `s-maxage=86400` |
| `GET /v1/products?category=` | `listProducts` | `Page<Product>` | `s-maxage=900` |
| `GET /v1/products/{id}` | `getProduct` | `Product` | `s-maxage=900` |
| `GET /v1/documents/{id}` | `getDocument` | `DocumentMeta` | `s-maxage=86400` |
| `GET /v1/facts?documentId=&productId=` | `listFacts` | `FactRecord[]` | `s-maxage=900` |
| `GET /v1/reference/tax-tables/{year}` | `getTaxTables` | `TaxTables` | `s-maxage=604800` |
| `GET /v1/reference/insurance-rules` | `getInsuranceRules` | `InsuranceRules` | `s-maxage=86400` |
| `GET /v1/meta/sources` | `listSources` | `SourceRegistryEntry[]` | `s-maxage=3600` |
| `GET /v1/ads?placement=` | `listSponsored` | `SponsoredItem[]` | `s-maxage=60` |

### Поведение mock-gateway

| Параметр | Значение |
| --- | --- |
| Объём фикстур | около 40 организаций (включая кредитные союзы и fintech-прослойки), 120 продуктов (60 CD, 40 savings, 20 treasury), 8 синтетических PDF, около 40 фактов |
| Детерминизм | `generateFixtures(seed)` чистая функция; seed из `NEXT_PUBLIC_FA_SEED` (по умолчанию `20261025`), публичная переменная, чтобы сервер и браузер строили одни и те же данные. Переменные читает только `shared/config/env.ts`, неверное значение падает при старте |
| Задержка | В браузере 150–600 мс, детерминированно по хэшу запроса (FNV-1a). На сервере, при сборке и в тестах задержки нет |
| Ошибки | Доля сбоев `NEXT_PUBLIC_MOCK_FAILURE_RATE` (по умолчанию 0), точечные сценарии в тестах |
| Пометки | `isMock: true` везде, кроме справочных констант со статусом `unverified` |
| Документы | Только синтетические PDF нашего авторства |

### Контрактные тесты

1. Каждая фикстура разбирается своей схемой без лишних ключей.
2. Во всех органических схемах нет ключей, подходящих под `/sponsor|commission|payout|affiliate|cpa|cpc/i`.
3. Ни одна схема запроса не содержит ключей `Profile`: тест сверяет `Object.keys(Profile.shape)` с формами всех схем запросов.
4. Mock-gateway возвращает ответы, которые проходят схемы ответов. Курсорная пагинация обходит все элементы без дублей.
5. http-gateway бросает `GatewayError('not_implemented')` на каждом методе.
6. Любая новая реализация gateway проходит тот же набор тестов.

## 5. Контракты движка (`@fa/engine`)

Движок это чистые функции без побочных эффектов, одинаково работающие в браузере и на сервере. Зависимости: `@fa/contracts` и `decimal.js`. Публичный API это `src/index.ts`, всё остальное приватно. Любая функция при неверном входе бросает `EngineError` с кодом, а не возвращает `NaN`.

### Публичный API

```ts
// Разбор и форматирование (ADR-013) живут в @fa/contracts/src/money/, без decimal.js и float:
//   parseCents(input: string): Cents          "1,234.56" -> 123456; больше двух знаков -> MoneyParseError
//   parseRate(fraction: string): Rate         "0.0435"
//   rateFromPercent(percent: string): Rate    "4.35" -> "0.0435", сдвиг точки на строке
//   formatUsd(value: Cents): string           "$1,234.56"
//   formatRate(rate: Rate): string             "0.0435" -> "4.35%"
//   centsFromInteger(digits: string): Cents   "-150" -> -150; выход engine из Decimal, без float
//   SignedRate                                знаковая доля без границ, до 8 знаков, без "-0"
// MoneyParseError { code }; формы используют safeParse схем.

// money.ts — арифметика; Rate вне [0, 1] -> EngineError
export function sumCents(values: readonly Cents[]): Cents;
export function mulRate(amount: Cents, rate: Rate): Cents;     // half-up до цента, только на выходе

// yield.ts
// SignedRate импортируется из @fa/contracts (ADR-013): engine не зависит от zod
export interface YieldProduct {
  category: ProductCategory; termMonths: number | null;
  tierMode: 'whole_balance' | 'marginal'; tiers: readonly RateTier[];
  earlyWithdrawal: EarlyWithdrawal; taxTreatment: Product['taxTreatment'];
}
export interface NetYieldInput {
  product: YieldProduct;
  principal: Cents;
  holdingMonths: number;                       // меньше termMonths = досрочное закрытие
  profile: Pick<Profile, 'filingStatus' | 'stateCode' | 'taxableIncome' | 'cityMarginalRate'>;
  tables: TaxTables;
}
export interface NetYieldResult {
  grossInterest: Cents; earlyWithdrawalPenalty: Cents; taxableInterest: Cents;
  federalTax: Cents; stateTax: Cents; localTax: Cents;
  netInterest: Cents;                          // может быть отрицательным (штраф больше процентов)
  netSimpleAnnualYield: SignedRate;            // netInterest / principal * 12 / holdingMonths
  steps: readonly CalcStep[];                  // для ExplainMath
  assumptions: readonly Assumption[];
  warnings: readonly string[];
}
export function computeNetYield(input: NetYieldInput): NetYieldResult;

// rules.ts
export type Tri = true | false | 'unknown';
export interface EligibilityContext {
  residency?: string; stateOfResidence?: string; age?: number;
  filingStatus?: string; depositAmount?: number;          // depositAmount сравнивается в центах
}
export interface RuleTraceNode {
  path: string; label?: string; op: Rule['op']; result: Tri;
  actual?: string | number; expected?: string | number | readonly (string | number)[];
  children?: readonly RuleTraceNode[];
}
export interface EligibilityResult {
  status: 'eligible' | 'ineligible' | 'needs_profile';
  missingFields: readonly ProfileField[];
  trace: RuleTraceNode;
}
export function toEligibilityContext(profile: Partial<Profile>): EligibilityContext;
export function evaluateEligibility(rule: Rule, ctx: EligibilityContext): EligibilityResult;

// rank.ts
export interface RankedProduct {
  productId: Id;
  group: 'eligible' | 'needs_profile' | 'ineligible';
  rank: number | null;                         // только у eligible
  eligibility: EligibilityResult;
  netYield: NetYieldResult | null;             // null у ineligible
}
export function rankProducts(products: readonly Product[], profile: Profile, tables: TaxTables): RankedProduct[];

// coverage.ts
export type OwnershipCategory = 'single' | 'joint';
export interface CoverageCandidate {
  institutionId: Id; regulator: Regulator; kind: InstitutionKind;
  preference: number;                          // меньше значит раньше
}
export interface CoverageInput {
  accounts: readonly { category: OwnershipCategory; amount: Cents }[];
  candidates: readonly CoverageCandidate[];
  rules: InsuranceRules;
  interestReservePerAllocation: Cents;         // запас под начисленные проценты внутри лимита
  maxInstitutions?: number;
}
export interface CoveragePlan {
  allocations: readonly { institutionId: Id; category: OwnershipCategory; amount: Cents }[];
  insuredTotal: Cents; uninsuredTotal: Cents; institutionsUsed: number;
  steps: readonly CalcStep[]; assumptions: readonly Assumption[]; warnings: readonly string[];
}
export function planCoverage(input: CoverageInput): CoveragePlan;
```

### Правила расчёта

**Чистая доходность (`computeNetYield`):**

1. **Ставка.** `whole_balance`: берётся тир, где `minBalance ≤ principal ≤ maxBalance`. `marginal`: тир `i` получает `clamp(principal, min_i, min_{i+1}) − min_i`, последний тир берёт остаток; `maxBalance` в `marginal` не участвует (тиры вплотную не дают зазора). Сумма вне тиров: `EngineError('no_tier')`.
2. **Проценты брутто.** `principal * ((1 + apy)^(months / 12) - 1)`. APY уже эффективная годовая ставка, поэтому частота капитализации влияет только на пояснение, а не на число. Для treasury принимается эквивалентная эффективная доходность (допущение, показывается в `assumptions`).
3. **Срок.** Если `holdingMonths` больше `termMonths`, расчёт ограничивается сроком, добавляется предупреждение «ставка после срока не продлевается».
4. **Досрочное закрытие.** Штраф по правилу продукта: `days_of_interest` это простой процент `principal × apy × days / 365` (допущение `day_count_365`), `months_of_interest` это проценты за `months / 12` года по формуле пункта 2, `percent_of_principal` это доля основной суммы. Штраф не ограничивается начисленными процентами.
5. **База налога.** `max(0, проценты - штраф)` (допущение «штраф уменьшает налогооблагаемую базу», редактируемое, проверить у налогового эксперта).
6. **Федеральный налог.** Разность налога по скобкам с процентами и без них: `tax(income + interest) - tax(income)`. NIIT, AMT, фазаут вычетов не учитываются, это явно указано в `assumptions`.
7. **Штат и город.** `assumedMarginalRate` штата и ручная ставка города на ту же базу. `state_local_exempt` обнуляет штат и город, `federal_exempt` обнуляет федеральный налог.
8. **Округление.** Каждая строка (проценты, штраф, база, налоги) округляется half-up до цента один раз на выходе; `netInterest` это точная разность округлённых строк, поэтому показанные строки сходятся. Налоги считаются от неокруглённой базы, поэтому строка налога может отличаться на цент от «показанная база × ставка» (допущение `rounding_per_line`).
9. **Доходность.** Простая годовая: `netInterest / principal * 12 / holdingMonths`, без капитализации (так объяснимо одной строкой). Half-up до 8 знаков, трейлинг-нули срезаются, без `-0`.

**Допуск (`evaluateEligibility`).** Трёхзначная логика Клини. `and`: хоть одно `false` даёт `false`, иначе хоть одно `unknown` даёт `unknown`, иначе `true`. `or`: хоть одно `true` даёт `true`, иначе хоть одно `unknown` даёт `unknown`, иначе `false`. `not` сохраняет `unknown`. Лист с незаполненным полем профиля даёт `unknown` и добавляет поле в `missingFields`. Ограничения продукта (`minOpening`, `maxDeposit`) добавляются в трассу неявными узлами с подписями «Minimum opening deposit» и «Maximum deposit» (`productEligibilityRule(product)` оборачивает правило в `and`). Тип значения в листе не совпал с типом поля (например, `eq` для `age` со строкой): `EngineError('invalid_rule')`, а не `false`. `missingFields` идут в порядке `ProfileField`.

**Ранжирование (`rankProducts`).** Группы: `eligible`, затем `needs_profile`, затем `ineligible`. Внутри группы по `netInterest` по убыванию, при равенстве по `product.id` (детерминизм). Ранг присваивается только `eligible`. Сигнатура не принимает никаких рекламных данных (ADR-006).

**Покрытие (`planCoverage`).**

1. Кандидаты `fintech_partner` исключаются с предупреждением (сквозное страхование через программу не моделируется на этапе 1). Дубликаты по `institutionId` сливаются. Порядок: `preference`, затем `id`.
2. Для категории `single` лимит равен `limitPerOwnerPerInstitutionPerCategory` регулятора организации. Для `joint` он умножается на `jointOwnersAssumed`.
3. Порция на организацию равна `лимит - interestReservePerAllocation` (не меньше нуля): начисленные проценты тоже входят в лимит.
4. Суммы счетов одной категории объединяются, затем по очереди раскладываются по кандидатам. Одна организация даёт отдельный лимит на каждую категорию. `maxInstitutions` считает уникальные организации.
5. Остаток, который не поместился, это `uninsuredTotal`. Счёт категории, которой нет в `InsuranceRules.supportedCategories`, это `EngineError('invalid_input')`.
6. Допущения (в `assumptions`): других вкладов в этих организациях у клиента нет, совладельцев ровно двое, лимиты взяты из `InsuranceRules` (в моках `unverified`). Результат это расчёт, а не юридическое заключение, интерфейс отправляет к официальному калькулятору FDIC.

### Тесты

**Золотые кейсы** (не менее 20 вариантов в сумме, ожидаемые значения считаются независимо в таблице или скрипте и вносятся константами со ссылкой на расчёт; копировать вывод движка в ожидаемое значение запрещено):

- CD на 12 месяцев с одним тиром в нижней скобке; то же, но проценты пересекают границу скобки.
- Savings: `whole_balance` и `marginal`, сумма на границе тира и на цент выше.
- Treasury: штат и город равны нулю.
- Досрочное закрытие по каждому из трёх видов штрафа, включая штраф больше процентов (отрицательный итог).
- Срок равен и больше `termMonths`. Штат без налога.
- Покрытие: сумма ровно на лимит и на цент выше, резерв под проценты, `joint` с двойным лимитом, `maxInstitutions`, исключение fintech.
- Допуск: все ветви `and`, `or`, `not` с `unknown`.
- Ранжирование: перестановка входа не меняет результат, равенство разрешается по `id`.

**Property-тесты (fast-check):**

- `netInterest` не больше `grossInterest`; при нулевых ставках налога равен `gross - penalty`.
- Итог монотонен по `principal` при фиксированных остальных входах (без тирных границ) с допуском в 1 цент на каждую округляемую налоговую строку.
- `insuredTotal + uninsuredTotal` равно сумме счетов.
- Ни одно размещение не превышает `лимит - резерв`.
- Добавление кандидата не уменьшает `insuredTotal`.
- Перестановка входного массива не меняет вывод `rankProducts`.

**Производительность (цель).** `rankProducts` на 120 продуктах не дольше 50 мс на обычном ноутбуке. Если замер хуже, вычисление выносится в Web Worker (Comlink) без изменения сигнатур.

## 6. Реестр компонентов и модулей

Каждый компонент живёт ровно в одном слое. Новый компонент сначала ищется в реестре, а при добавлении получает строку здесь (пункт чек-листа PR). Пути указаны от `apps/web/src`.

### shared/ui: универсальные, без доменных знаний

Импортируют только `@fa/contracts` (для типов `Cents`, `Rate`, `CalcStep`). Не знают про `engine`, `entities`, `features`.

| Компонент | Путь | Что делает | Где можно использовать |
| --- | --- | --- | --- |
| `DataTable` | `shared/ui/data-table` | Своя таблица на нативном `<table>` (TanStack снят, ADR-014): сортировка, скрытие колонок, закреплённая шапка и первая колонка, раскрытие строки, состояния. `caption` обязателен | Везде выше `shared` |
| `MetricCard` | `shared/ui/metric-card` | Значение, подпись, подсказка | Везде |
| `RateValue` | `shared/ui/rate-value` | Показ `Rate` с поповером «как посчитано» | Везде |
| `MoneyInput`, `PercentInput` | `shared/ui/inputs` | Ввод в `Cents` и `Rate`, без float | `features`, `widgets` |
| `StateSelect` | `shared/ui/inputs` | Выбор штата | `features`, `widgets` |
| `ExplainMath` | `shared/ui/explain-math` | Показывает `CalcStep[]` и `Assumption[]` пошагово | `features`, `widgets`, `app` |
| `LineChart`, `BulletChart` | `shared/ui/charts` | `BulletChart` (P0): SVG без библиотеки, грузится обычно. `LineChart` (P1): обёртка над библиотекой графиков (выбор через ADR), грузится лениво | `widgets` |
| `FreshnessLabel` | `shared/ui/freshness` | «Обновлено N дней назад», `now` приходит пропом | Везде |
| `DemoDataBanner` | `shared/ui/demo-banner` | Баннер DEMO DATA | `app/layout` |
| `Skeleton`, `EmptyState`, `ErrorState` | `shared/ui/states` | Состояния загрузки, пусто, ошибка | Везде |

### entities/\*/ui: представления доменных сущностей

| Компонент | Путь | Что делает | Где можно использовать |
| --- | --- | --- | --- |
| `FactValue` | `entities/fact/ui` | Значение факта, которое нельзя показать без `SourceCitation` | `features`, `widgets`, `app` |
| `SourceCitation` | `entities/fact/ui` | Чип источника: документ, страница, цитата, статус проверки. Открытие просмотрщика идёт колбэком `onOpen` | `features`, `widgets`, `app` |
| `CompatibilityBadge` | `entities/rule/ui` | Результат допуска с причиной из трассы | `features`, `widgets`, `app` |
| `SafetyBadge` | `entities/institution/ui` | «Прямой банк» или «fintech-прослойка» с пояснением | `features`, `widgets`, `app` |

### features: действия пользователя

Получают данные аргументами, сами в gateway не ходят, друг друга не импортируют.

| Фича | Путь | Что делает | Кто использует |
| --- | --- | --- | --- |
| `edit-profile` | `features/edit-profile` | Форма профиля, единственное место записи в store профиля. Пока `hydrated === false`, форма неактивна (`<fieldset disabled>`, `aria-busy`): стор до гидрации отклоняет правки (ADR-016 D5). `loadError` показывается как ошибка загрузки | `widgets/profile-drawer` |
| `edit-assumptions` | `features/edit-assumptions` | Правка допущений (ставка города, ставка штата) | `widgets/product-breakdown`, `widgets/yield-comparator` |
| `filter-products` | `features/filter-products` | Состояние фильтров в URL и чистая функция фильтрации | `widgets/compare-table` |
| `compute-net-yield` | `features/compute-net-yield` | Хук `useNetYield`: вызывает `engine`, возвращает результат и состояние расчёта | `widgets/*` |
| `plan-coverage` | `features/plan-coverage` | Форма счетов и вызов `planCoverage` | `widgets/coverage-planner` |
| `open-citation` | `features/open-citation` | Хук `useOpenCitation`: пишет `?doc=&page=&q=` в URL | `widgets/*`, `app` |

### widgets: самостоятельные блоки страниц

Пользуются запросами из `entities/*/queries`, фичами и UI. Друг друга не импортируют. Собираются на уровне `app`.

| Виджет | Путь | Что делает |
| --- | --- | --- |
| `landing` | `widgets/landing` | Главная: ценность, три входа, блок «как мы зарабатываем» |
| `compare-table` | `widgets/compare-table` | Таблица сравнения с фильтрами, строки раскрываются краткой сводкой |
| `product-breakdown` | `widgets/product-breakdown` | Разбор чистой доходности по шагам, условия, допуск |
| `fine-print` | `widgets/fine-print` | Факты из документов с цитатами |
| `bank-search`, `bank-health` | `widgets/bank-search`, `widgets/bank-health` | Поиск банка; панель метрик против рынка |
| `coverage-planner` | `widgets/coverage-planner` | Калькулятор распределения под страхование |
| `yield-comparator` | `widgets/yield-comparator` | Сравнение CD, savings, treasury после налогов |
| `profile-drawer` | `widgets/profile-drawer` | Панель профиля |
| `citation-viewer` | `widgets/citation-viewer` | PDF-просмотрщик (ленивый), экспортирует `CitationViewerHost` |
| `sponsored-slot` | `widgets/sponsored-slot` | Рекламный блок с пометкой и раскрытием |

### Контракты пропсов ключевых компонентов

```ts
// shared/ui/data-table
export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  compare?: (a: T, b: T) => number;                  // по возрастанию; Cents как целые, Rate через compareRate
  align?: 'start' | 'end';
}
export interface SortState { columnId: string; direction: 'asc' | 'desc' }
export interface DataTableProps<T> {
  caption: string;                                   // обязателен (доступность)
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  status?: 'ready' | 'loading' | 'empty' | 'error';
  error?: unknown; onRetry?: () => void; emptyTitle?: string;
  defaultSort?: SortState | null;                    // своя сортировка и откат, если колонку скрыли
  sort?: SortState | null;                           // управляемая сортировка (URL в E5)
  onSortChange?: (sort: SortState | null) => void;
  hiddenColumnIds?: readonly string[];               // скрытые колонки не попадают в DOM
  renderExpanded?: (row: T) => ReactNode;
  expandLabel?: (row: T) => string;                  // имя строки в подписи кнопки раскрытия
  expandedIds?: ReadonlySet<string>;                 // управляемое раскрытие
  onExpandedChange?: (ids: ReadonlySet<string>) => void;
}

// entities/fact/ui
export interface SourceCitationProps {
  provenance: Provenance;
  variant?: 'chip' | 'inline';
  onOpen?: (ref: { documentId: Id; page: number; quote: string }) => void;
}
export interface FactValueProps<T> {
  fact: Fact<T>;
  render: (value: T) => ReactNode;
  onOpenCitation?: SourceCitationProps['onOpen'];
}

// entities/rule/ui
export interface CompatibilityBadgeProps { result: EligibilityResult; compact?: boolean }

// shared/ui/explain-math
export interface ExplainMathProps {
  steps: readonly CalcStep[];                        // тексты шагов готовит движок, UI выводит как есть
  assumptions: readonly Assumption[];
  onEditAssumption?: (id: string) => void;
  title?: string;
  headingLevel?: 2 | 3 | 4;
}

// shared/ui/rate-value: только форматирует; ставка банка идёт через FactValue
export interface RateValueProps { rate: Rate | SignedRate; explain?: ReactNode; explainLabel?: string }

// shared/ui/metric-card: value уже отформатирован; warn и danger требуют toneLabel
export type MetricCardProps = {
  label: string; value: ReactNode; hint?: string;
} & ({ tone?: 'neutral' | 'ok'; toneLabel?: string } | { tone: 'warn' | 'danger'; toneLabel: string });

// shared/ui/charts: SVG без библиотеки; числа для геометрии только в charts/scale.ts (ADR-013)
type BulletScale<K, V> = { kind: K; max: V; value: V; marker?: { value: V; label: string };
  bands?: readonly { upTo: V; label: string }[] };
export type BulletChartProps = { label: string; overflowText?: string }
  & (BulletScale<'usd', Cents> | BulletScale<'rate', Rate>);

// shared/ui/freshness: now приходит пропом; на SSG-страницах рендерить на клиенте через clock
export interface FreshnessLabelProps { at: IsoDateTime | IsoDate; now: Date; staleAfterDays?: number }

// widgets/sponsored-slot: монтируется только в app/**
export interface SponsoredSlotProps { placement: SponsoredPlacement }
```

### Правила использования

1. **Нет голых чисел.** Любая ставка, штраф, лимит или метрика банка выводится через `FactValue` или с `SourceCitation` рядом. Исключение: результат расчёта, у него `ExplainMath` и `assumptions`.
2. **Просмотрщик цитат без связей между виджетами.** `SourceCitation` вызывает `onOpen`, фича `open-citation` пишет параметры в URL, а `CitationViewerHost` смонтирован в корневом `layout` и читает URL. Так виджеты не импортируют друг друга.
3. **Реклама только в `app`.** `SponsoredSlot` рендерится только в `page.tsx` и `layout.tsx` рядом с виджетами, никогда внутри таблицы, списка или карточки выдачи.
4. **`use client` только на листьях.** Серверные оболочки остаются серверными.
5. **Тяжёлое грузится лениво:** `PdfViewer` и `LineChart` через `next/dynamic`, основной бандл остаётся в бюджете AC-8.
6. **Доступность по умолчанию.** `DataTable` требует `caption`, формы связывают подписи с полями, смысл не передаётся одним цветом.
7. **Стенд компонентов** `/dev/components` существует только в development (в production-сборке отдаёт 404).

## 7. Правила линтинга и автопроверок

Проверки идут тремя слоями: компилятор (tsconfig), ESLint (файл, импорты, опасные конструкции) и dependency-cruiser (граф: слои, циклы, границы пакетов). Нарушение ловится при коммите. Конфиги ниже написаны по моему знанию API плагинов и в этой сессии не запускались: при установке закрепить версии пакетов и прогнать канарейки (AC-10).

### 7.1 TypeScript

Движок и контракты собираются без DOM-типов: `window` и `document` не пройдут `typecheck`, даже если линтер пропустит.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],                       // apps/web добавляет "DOM", "DOM.Iterable"
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

### 7.2 ESLint (flat config)

```js
// eslint.config.mjs  (ESLint 9, версии в ADR-014)
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importX from 'eslint-plugin-import-x';
import nextPlugin from '@next/eslint-plugin-next';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';

const WEB = 'apps/web/src';

/* ---------- ограничения импортов (ADR-002, 004, 005, 009) ---------- */
const DEEP_IMPORTS = {
  group: ['@/entities/*/*', '!@/entities/*/queries', '@/features/*/*', '@/widgets/*/*'],
  message: 'Импорт только через публичный API слайса (index.ts); у entities есть ещё queries.',
};
const UPWARD = (layers) => ({
  group: layers.map((l) => `@/${l}/**`),
  message: 'Импорт вверх по слоям запрещён: app, widgets, features, entities, shared.',
});
const SAME_LAYER = (layer) => ({
  group: [`@/${layer}/**`],
  message: `Слайсы слоя ${layer} не импортируют друг друга по алиасу (внутри слайса относительные пути). Поднимите композицию выше.`,
});
const ENGINE_BAN = { group: ['@fa/engine', '@fa/engine/*'], message: 'shared не зависит от движка.' };
const FIXTURES_BAN = { group: ['@fa/fixtures', '@fa/fixtures/*'], message: 'Фикстуры подключает только shared/api (mock-gateway).' };
const QUERIES_BAN = { group: ['@/entities/*/queries'], message: 'features получают данные аргументами; запросы только в widgets и app.' };

const GATEWAY = { name: '@/shared/api', importNames: ['getGateway'], message: 'getGateway() только в entities/*/api.' };
const PROFILE_WRITE = { name: '@/entities/profile', importNames: ['useProfileActions'], message: 'Менять профиль может только features/edit-profile.' };
const OUT_OF_STACK = ['axios', 'redux', '@reduxjs/toolkit', 'jotai', 'recoil', 'mobx', 'moment', 'lodash']
  .map((name) => ({ name, message: 'Не входит в утверждённый стек (ADR-009).' }));
const BASE_PATHS = [GATEWAY, PROFILE_WRITE, ...OUT_OF_STACK];

const LAYER_PATTERNS = {
  shared: [UPWARD(['entities', 'features', 'widgets', 'app']), ENGINE_BAN, FIXTURES_BAN],
  entities: [UPWARD(['features', 'widgets', 'app']), SAME_LAYER('entities'), FIXTURES_BAN],
  features: [UPWARD(['widgets', 'app']), SAME_LAYER('features'), QUERIES_BAN, FIXTURES_BAN],
  widgets: [UPWARD(['app']), SAME_LAYER('widgets'), FIXTURES_BAN],
  app: [FIXTURES_BAN],
};
const restrict = (layer, { paths = BASE_PATHS, patterns = LAYER_PATTERNS[layer] } = {}) =>
  ['error', { paths, patterns: [DEEP_IMPORTS, ...patterns] }];

const SYNTAX_COMMON = [
  { selector: 'TSEnumDeclaration', message: 'Вместо enum используйте union-типы.' },
  { selector: "TSAsExpression[typeAnnotation.typeName.name=/^(Cents|Rate)$/]", message: 'Cents и Rate создаются только функциями и схемами @fa/contracts (ADR-013).' },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Запрещено (XSS).' },
];
const NO_AMBIENT_TIME = { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Время только через shared/lib/clock или параметр asOf (ADR-011).' };
// ADR-013: без float в деньгах; Number.isSafeInteger и прочие статические методы Number разрешены
const MONEY_FLOAT = [
  { selector: "CallExpression[callee.name='Number']", message: 'Number() запрещён: parseCents/parseRate из @fa/contracts.' },
  { selector: "CallExpression[callee.name=/^parse(Float|Int)$/]", message: 'parseFloat/parseInt запрещены: @fa/contracts или decimal.js.' },
  { selector: "CallExpression[callee.object.name='Number'][callee.property.name=/^parse(Float|Int)$/]", message: 'parseFloat/parseInt запрещены: @fa/contracts или decimal.js.' },
];
const NO_LOCAL_MONEY_FORMAT = { selector: "MemberExpression[object.name='Intl'][property.name='NumberFormat']", message: 'Деньги и ставки форматирует только @fa/contracts (ADR-013).' };

export default defineConfig(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/*.generated.*'] },
  // файлы-канарейки проверяются отдельно: LINT_CANARIES=1 pnpm lint:canaries
  ...(process.env.LINT_CANARIES ? [] : [{ ignores: ['**/*.canary.ts'] }]),

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,

  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'import-x': importX },
    // settings: подключить TS-резолвер (eslint-import-resolver-typescript) для import-x
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-eval': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { allowDefaultCaseForExhaustiveSwitch: false, requireDefaultForNonUnion: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true, minimumDescriptionLength: 10 }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-extraneous-dependencies': 'error',
    },
  },

  /* ---------- apps/web: React, a11y, Next, сеть, хранилище ---------- */
  {
    files: [`${WEB}/**/*.{ts,tsx}`],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, '@next/next': nextPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      ...jsxA11y.flatConfigs.strict.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,   // проверить по версии Next
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'error',
      'react/no-danger': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      'react/hook-use-state': 'error',

      'no-restricted-globals': ['error',
        { name: 'fetch', message: 'fetch только в shared/api/http.ts.' },
        { name: 'XMLHttpRequest', message: 'Сеть только через shared/api/http.ts.' },
        { name: 'localStorage', message: 'Только entities/profile/model/persist.ts (ADR-004).' },
        { name: 'sessionStorage', message: 'Только entities/profile/model/persist.ts (ADR-004).' },
      ],
      'no-restricted-properties': ['error',
        { property: 'toFixed', message: 'Форматирование только через shared/lib/format (ADR-003).' },
        { object: 'navigator', property: 'sendBeacon', message: 'Запрещено: данные пользователя не отправляем (ADR-004).' },
        { object: 'document', property: 'cookie', message: 'Запрещено.' },
        { object: 'Date', property: 'now', message: 'Время только через shared/lib/clock.' },
        { property: 'toLocaleString', message: 'Деньги и ставки форматирует только @fa/contracts (ADR-013).' },
      ],
      'no-restricted-syntax': ['error', ...SYNTAX_COMMON, NO_AMBIENT_TIME, NO_LOCAL_MONEY_FORMAT],
    },
  },

  /* ---------- границы слоёв ---------- */
  ...['shared', 'entities', 'features', 'widgets', 'app'].map((layer) => ({
    files: [`${WEB}/${layer}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restrict(layer) },
  })),

  /* ---------- точечные исключения (после общих блоков) ---------- */
  {
    files: [`${WEB}/shared/api/**/*.ts`],     // mock-gateway подключает фикстуры
    rules: { 'no-restricted-imports': restrict('shared', { paths: BASE_PATHS.filter((p) => p !== GATEWAY), patterns: LAYER_PATTERNS.shared.filter((p) => p !== FIXTURES_BAN) }) },
  },
  {
    files: [`${WEB}/entities/*/api/**/*.ts`],  // единственное место вызова getGateway()
    rules: { 'no-restricted-imports': restrict('entities', { paths: BASE_PATHS.filter((p) => p !== GATEWAY) }) },
  },
  {
    files: [`${WEB}/features/edit-profile/**/*.{ts,tsx}`],   // единственная запись профиля
    rules: { 'no-restricted-imports': restrict('features', { paths: BASE_PATHS.filter((p) => p !== PROFILE_WRITE) }) },
  },
  { files: [`${WEB}/shared/api/http.ts`], rules: { 'no-restricted-globals': 'off' } },
  {
    files: [`${WEB}/entities/profile/model/persist.ts`],
    rules: { 'no-restricted-globals': ['error', { name: 'fetch', message: 'Сеть запрещена.' }, { name: 'XMLHttpRequest', message: 'Сеть запрещена.' }] },
  },
  // shared/lib/clock.ts и shared/lib/format.ts: аналогично снимаются Date.now / toFixed

  /* ---------- чистые пакеты ---------- */
  {
    files: ['packages/engine/**/*.ts', 'packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-dom', 'next', 'next/*', 'zustand', '@tanstack/*', '@/*'], message: 'engine и contracts: чистый TypeScript без UI и приложения.' }] }],
      'no-restricted-globals': ['error', ...['window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator', 'XMLHttpRequest']
        .map((name) => ({ name, message: 'Окружение недоступно в чистых пакетах.' }))],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Случайность только через seed (ADR-011).' },
        { object: 'Date', property: 'now', message: 'Время параметром asOf (ADR-011).' },
        { property: 'toFixed', message: 'Деньги не форматируем через float.' },
        { property: 'toNumber', message: 'Decimal не превращаем в float (ADR-013).' },
      ],
      'no-restricted-syntax': ['error', ...SYNTAX_COMMON, NO_AMBIENT_TIME, ...MONEY_FLOAT],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      'no-param-reassign': ['error', { props: true }],
    },
  },
  {   // только здесь разрешено приводить значения к Cents и Rate
    files: ['packages/contracts/src/money/**/*.ts'],   // ADR-013
    rules: { 'no-restricted-syntax': ['error', { selector: 'TSEnumDeclaration', message: 'Вместо enum используйте union-типы.' }, NO_AMBIENT_TIME, ...MONEY_FLOAT] },
  },

  /* ---------- страницы тонкие, default export только там, где требует Next ---------- */
  {
    files: [`${WEB}/app/**/page.tsx`],
    rules: {
      'max-lines': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: [`${WEB}/app/**/{page,layout,loading,error,not-found,template,default}.tsx`, `${WEB}/app/**/{route,sitemap,robots}.ts`, '**/*.config.{js,mjs,cjs,ts}'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  /* ---------- тесты ---------- */
  {
    files: ['**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
      'vitest/no-identical-title': 'error',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
```

### 7.3 dependency-cruiser

ESLint видит один файл, dependency-cruiser видит граф. Здесь правила, которые ESLint выразить не может: циклы, изоляция слайсов, границы пакетов, «профиль остаётся локальным».

```js
// .dependency-cruiser.cjs
const WEB = '^apps/web/src';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },

    // слои: только вниз
    { name: 'layer-shared-is-lowest', severity: 'error', from: { path: `${WEB}/shared/` }, to: { path: `${WEB}/(entities|features|widgets|app)/` } },
    { name: 'layer-entities-no-up', severity: 'error', from: { path: `${WEB}/entities/` }, to: { path: `${WEB}/(features|widgets|app)/` } },
    { name: 'layer-features-no-up', severity: 'error', from: { path: `${WEB}/features/` }, to: { path: `${WEB}/(widgets|app)/` } },
    { name: 'layer-widgets-no-up', severity: 'error', from: { path: `${WEB}/widgets/` }, to: { path: `${WEB}/app/` } },

    // слайсы одного слоя изолированы
    {
      name: 'no-cross-slice', severity: 'error',
      from: { path: `${WEB}/(entities|features|widgets)/([^/]+)/` },
      to: { path: `${WEB}/$1/[^/]+/`, pathNot: `${WEB}/$1/$2/` },
    },

    // чистые пакеты
    { name: 'engine-is-pure', severity: 'error', from: { path: '^packages/engine/src' }, to: { path: ['^apps/', '^packages/fixtures/', 'node_modules/(react|react-dom|next|zustand|@tanstack)/'] } },
    { name: 'contracts-depend-on-zod-only', severity: 'error', from: { path: '^packages/contracts/src' }, to: { dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'], pathNot: 'node_modules/zod/' } },
    { name: 'profile-never-in-gateway-types', severity: 'error', from: { path: '^packages/contracts/src/(gateway|queries)' }, to: { path: '^packages/contracts/src/profile' } },

    // данные и приватность
    { name: 'fixtures-only-via-gateway', severity: 'error', from: { pathNot: [`${WEB}/shared/api/`, '\\.test\\.', '^apps/web/e2e/', '^packages/fixtures/'] }, to: { path: '^packages/fixtures/' } },
    { name: 'ads-contract-isolated', severity: 'error', from: { pathNot: [`${WEB}/(widgets/sponsored-slot|entities/sponsored|shared/api)/`, '^packages/(contracts|fixtures)/', '\\.test\\.'] }, to: { path: '^packages/contracts/src/ads' } },
    { name: 'profile-stays-local', severity: 'error', from: { path: `${WEB}/(entities/profile|features/(edit-profile|compute-net-yield|plan-coverage|filter-products))/` }, to: { path: `${WEB}/shared/api/` } },

    // гигиена
    { name: 'prod-not-to-test', severity: 'error', from: { pathNot: '\\.(test|spec)\\.' }, to: { path: '\\.(test|spec)\\.' } },
    { name: 'no-orphans', severity: 'error', from: { orphan: true, pathNot: [`${WEB}/app/`, '\\.d\\.ts$', '\\.config\\.', '\\.test\\.', '\\.canary\\.ts$'] }, to: {} },
  ],
  options: {
    tsConfig: { fileName: 'apps/web/tsconfig.json' },   // корневой tsconfig без paths: импорты @/… не резолвились бы
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
```

После настройки workspace проверить, что пути в отчёте начинаются с `apps/` и `packages/` (при работе через symlink пути могут отличаться), и поправить регулярные выражения.

### 7.4 Что ловится чем

| Ошибка | Чем ловится | Пример |
| --- | --- | --- |
| Деньги через float | `toFixed`, `parseFloat`, `as Cents`, типы `Cents`/`Rate` | `price.toFixed(2)` |
| Профиль уходит в сеть | `profile-stays-local`, схемы запросов `.strict()`, CSP, e2e с sentinel-значениями | передать профиль в запрос к gateway |
| Импорт вверх или между слайсами | `no-restricted-imports`, `layer-*`, `no-cross-slice` | `features` импортирует `widgets` |
| Импорт во внутренности слайса | `DEEP_IMPORTS` | `@/entities/product/model/types` |
| Прямой доступ к данным | `no-restricted-globals` (`fetch`), `GATEWAY` | `fetch` в компоненте |
| Недетерминизм в расчётах | `no-restricted-properties`, `NO_AMBIENT_TIME` | `Date.now()` в `engine` |
| Забытый `await` | `no-floating-promises`, `no-misused-promises` | вызов async-функции без `await` |
| Не покрыта новая категория | `switch-exhaustiveness-check` | добавили `mortgage`, забыли ветку |
| Опасные приведения | `no-non-null-assertion`, `no-explicit-any`, `ban-ts-comment` | `value!`, `as any` |
| Ошибки хуков | `react-hooks/*` | условный вызов хука |
| Доступность | `jsx-a11y/strict`, axe в e2e | `div` вместо `button` |
| XSS | `react/no-danger`, селектор `dangerouslySetInnerHTML` | вставка HTML |
| Циклы | `import-x/no-cycle`, `no-circular` | A импортирует B, B импортирует A |
| Мёртвый код, лишние зависимости | knip, `no-orphans` | неиспользуемый экспорт |
| Реклама внутри выдачи | `ads-contract-isolated`, запрет `widgets` → `widgets`, контрактный тест | `SponsoredSlot` в таблице |
| Фикстуры в production-коде | `fixtures-only-via-gateway`, `FIXTURES_BAN` | импорт моков в компоненте |
| Лишние отключения правил | `reportUnusedDisableDirectives` | устаревший `eslint-disable` |

### 7.5 Канарейки и гейты

**Канарейки (AC-10).** Для каждого архитектурного правила лежит файл `*.canary.ts` в той папке, где правило должно сработать (например, `apps/web/src/features/x/bad-import.canary.ts`). В первой строке комментарий `// expect: no-restricted-imports`. Обычный `lint` их игнорирует. Скрипт `pnpm lint:canaries` запускает ESLint (`LINT_CANARIES=1`) через API и падает, если у канарейки нет ожидаемого правила в результате. Так сломанный конфиг не пройдёт незамеченным. Для правил depcruise аналогично: каталог `tools/depcruise-canaries/` и ожидаемое имя правила в выводе.

**Гейты CI** (все обязательны, нулевые предупреждения):

1. `pnpm format:check` (Prettier)
2. `pnpm typecheck` (`tsc -b`)
3. `pnpm lint --max-warnings 0`
4. `pnpm lint:canaries`
5. `pnpm depcruise`
6. `pnpm knip`
7. `pnpm test` с порогами покрытия: `engine` строки не ниже 90%, ветвления не ниже 85%; `contracts` и фикстуры проходят все контрактные тесты
8. `pnpm build`
9. `pnpm e2e` (Playwright: дым, приватность, axe)

**Хуки.** pre-commit: `lint-staged` (ESLint с `--fix --max-warnings 0`, Prettier). pre-push: `typecheck` и `depcruise`.

**Исключения.** Только `// eslint-disable-next-line <правило> -- <причина не короче 10 символов>, <ссылка на задачу>`. Число таких директив печатается в CI, рост считается замечанием на ревью.

**Чек-лист PR.** Новая строка в реестре компонентов (раздел 6). ADR, если меняется архитектурное решение. Тесты на каждую новую функцию `engine`. Для нового правила линтера есть канарейка.

## 8. План работ, риски, открытые вопросы

Приёмка на 46,5-й рабочий день (около 9,5 недели) при одном инженере и последовательной работе. Это моя оценка, её стоит уточнить по факту после M1.

Сдвиг с 45 на 46,5 дня (решено в E4, 2026-10-27): форма профиля, drawer и `useProductFilters` перенесены из E4 в E5 (+1,5 дня). Запас E7 не трогаем, он целиком уходит на проверки AC-1…AC-10. Если дедлайн жёсткий на день 45, режем P1 или объём E6, а не качество.

&#91;embedded content: план · 8 эпиков и 5 вех на 45 рабочих дней\]

### Вехи и критерии выхода

| Веха | День | Критерий выхода |
| --- | --- | --- |
| M1 | 7 | Пустое приложение проходит все гейты CI, канарейки падают как должны. Контракты и фикстуры проходят контрактные тесты |
| M2 | 17 | Движок покрыт тестами по порогам AC-2, золотые кейсы сверены с независимым расчётом |
| M3 | 25 | Mock-gateway и query-хуки работают, профиль сохраняется и мигрирует, UI-кит и стенд компонентов готовы |
| M4 | 38,5 | Все P0-страницы работают на моках, каждое число с источником или меткой допущения (AC-3) |
| M5 | 46,5 | AC-1 … AC-10 зелёные, README написан, прототип показан |

### Эпики и задачи

| Эпик | Задачи | Дни | Готово, когда |
| --- | --- | --- | --- |
| E0 Каркас и гардрейлы | workspace и tsconfig; ESLint, Prettier, lint-staged; depcruise, knip; CI; Vitest, Playwright, axe; CSP и заголовки; канарейки | 3 | Пустое приложение проходит все гейты, у каждого правила есть канарейка |
| E1 Контракты и моки | примитивы и Provenance; сущности и правила; `DataGateway` и схемы запросов; генератор фикстур с seed; контрактные тесты; mock- и http-gateway | 4 | AC-5 и AC-9, контрактные тесты зелёные |
| E2 Движок | money и rate (1); налоги и таблицы (1,5); проценты и тиры (2); чистая доходность, шаги, допущения (1,5); правила допуска с трассой (1,5); ранжирование (1); покрытие (1,5) | 10 | AC-2 |
| E3 Данные и состояние | `entities/*/api` и queries; профиль (store, persist, миграции, экспорт и импорт); URL-состояние; clock | 3 | Профиль переживает перезагрузку и миграцию версии |
| E4 UI-кит | `DataTable`, `MetricCard`, поля ввода, `ExplainMath`, графики, баннер, состояния; стенд `/dev/components` | 5 | Компоненты из реестра (раздел 6), проверки доступности |
| E5 Страницы | профиль: `edit-profile`, `profile-drawer`, `useProductFilters`, e2e «профиль переживает перезагрузку» (1,5, перенесено из E4 и E3); главная (1); compare (3); product (2,5); банки, список и карточка (2,5); coverage (1,5); after-tax yield (1); статические (0,5) | 13,5 | AC-3 и AC-6, все P0-маршруты |
| E6 PDF и цитаты | синтетические PDF нашего авторства; `CitationViewerHost` и просмотрщик с подсветкой; виджет `fine-print` | 4 | Цитата открывает нужную страницу и подсвечивает текст |
| E7 Качество | e2e (дым, приватность, доступность); замеры и бюджет бандла; README; шлифовка | 4 | AC-1 … AC-10 |

### Риски

| Риск | Что делаем |
| --- | --- |
| Ошибки в налоговой модели и правилах страхования | Золотые кейсы из независимого расчёта, пометка `unverified`, проверка экспертом до публичного запуска |
| Расползание объёма | Жёсткий P0, остальное это P1 или этап 2, новые категории продуктов только после M4 |
| Накладные расходы на монорепо и гардрейлы | На них заложены 3 дня (E0). Если не укладываемся, упрощаем канарейки, но не сами правила |
| Несовместимость версий (ESLint flat config, zod, Next) | Закрепить версии на M1, обновления отдельными PR |
| Размер бандла (pdf.js, графики) | Ленивая загрузка, бюджет в CI |
| Скорость ранжирования на клиенте | Замер на M2, Web Worker при превышении 50 мс |
| Трение FSD и Next (серверные компоненты и query-хуки) | Тонкие `page.tsx`, префетч в `app`, клиентские листья |
| Моки принимают за реальные данные | Баннер DEMO DATA на каждой странице, `isMock` в данных, AC-5 |

### Открытые вопросы

У каждого вопроса указано значение по умолчанию, с которым я бы начал.

1. **Налог города.** Достаточно ручного ввода ставки? По умолчанию да.
2. **Приоритет устройств.** Десктоп или мобильный? Таблица сравнения на телефоне это отдельная работа, при mobile-first E4 и E5 растут на 3–5 дней (оценка моя). По умолчанию десктоп-first с прокруткой таблицы.
3. **Штаты в моках.** Сколько штатов в налоговых таблицах? По умолчанию пять, с разным уровнем налога.
4. **Шаринг результата.** Нужен ли? По умолчанию делимся только фильтрами, без профиля.
5. **Название, домен, бренд.** Пока заглушки.
6. **Аналитика.** Допускается ли на этапе 1? По умолчанию нет (CSP и приватность).
7. **Юридические тексты.** `/methodology`, `/disclosure`, `/privacy`: стартовые черновики пишем сами, финальные формулировки после проверки юристом.
8. **Версии.** Node, Next, React, zod фиксируем на M1.
