# Reconciliation — знайдені розбіжності

Перевірено:

- Stripe export: 12 рядків / 12 унікальних `charge_id`;
- Merchant DB: 13 рядків / 12 унікальних `charge_id`;
- ключ звірки: Stripe `id` ↔ Merchant DB `charge_id`;
- суми нормалізовано до центів;
- часові значення інтерпретовано як UTC;
- еквівалентні статуси нормалізовано: `Paid → succeeded`, `Failed → failed`,
  `Refunded → refunded`.

## Таблиця розбіжностей

| # | pi_id | Тип | Опис | Можлива причина | Severity |
|---:|---|---|---|---|---|
| 1 | `ch_3RmK102QpcYDzu4Ef` | Amount mismatch | Stripe: 65.00 USD (6500 cents); Merchant DB: 5500 cents. Різниця: 1000 cents / 10.00 USD. | Помилка конвертації або ручного запису суми; Merchant DB міг отримати застаріле значення. | High |
| 2 | `ch_3RmK103QpcYDzu4Ef` | Duplicate | У Merchant DB є два рядки з однаковими `charge_id`, `order_id` і сумою; timestamps відрізняються на 15 секунд. | Повторна обробка webhook без idempotency/unique constraint або retry після timeout. | High |
| 3 | `ch_3RmK105QpcYDzu4Ef` | Status mismatch | Stripe: `Refunded` (повернуто 89.00 USD); Merchant DB: `succeeded`. | Refund webhook не отримано, не оброблено або не оновив стан транзакції. | High |
| 4 | `ch_3RmK107QpcYDzu4Ef` | Missing in Merchant DB | У Stripe є успішний платіж 42.00 USD, але запису в Merchant DB немає. | Втрата webhook, збій consumer/DB або відсутній retry. | High |
| 5 | `ch_3RmK109QpcYDzu4Ef` | Timestamp | Stripe: `2024-02-07 12:45:00 UTC`; Merchant DB: `2024-02-09T12:45:00Z`. Різниця: 48 годин. | Некоректне значення дати, повторне створення запису або переплутано `created_at` та `updated_at`. | Low |
| 6 | `ch_3RmK111QpcYDzu4Ef` | Status mismatch | Stripe: `Paid` → `succeeded`; Merchant DB: `authorized`. | Capture webhook не оброблено або Merchant DB залишилася на попередньому етапі payment lifecycle. | High |
| 7 | `ch_3RmK113QpcYDzu4Ef` | Missing in Stripe | Запис на 75.00 USD є в Merchant DB, але відсутній у Stripe export. | Фантомний/тестовий запис, неправильний Stripe account або export window, локальний запис створено до підтвердження PSP. | High |

Разом: **7 розбіжностей** — 2 Missing, 1 Amount mismatch, 2 Status mismatch,
1 Duplicate і 1 Timestamp.

## Додаткове обмеження даних

Для `ch_3RmK104QpcYDzu4Ef` Stripe показує часткове повернення 25.00 USD, але
Merchant DB не має поля `amount_refunded` або окремого refund-реєстру в наданому
CSV. Тому підтвердити коректність часткового refund через ці два файли неможливо.
Це не включено до семи підтверджених розбіжностей, але є прогалиною reconciliation.

## Автоматизація перевірки

```text
function reconcile(stripeCsv, merchantCsv):
    validate required columns in both files

    stripeRows = parse CSV(stripeCsv)
    merchantRows = parse CSV(merchantCsv)

    normalize Stripe rows:
        id = trim(id)
        amountCents = parse decimal Amount exactly and convert to integer cents
        status = map Paid->succeeded, Failed->failed, Refunded->refunded
        createdAt = parse "Created date (UTC)" explicitly as UTC

    normalize Merchant rows:
        id = trim(charge_id)
        amountCents = parse integer amount_cents
        status = lowercase(status)
        createdAt = parse ISO-8601 timestamp explicitly as UTC

    discrepancies = []

    # Check duplicates before building lookup maps, otherwise Map overwrites them.
    report every id occurring more than once in either source as Duplicate

    stripeById = group Stripe rows by id
    merchantById = group Merchant rows by id

    for id in stripeIds - merchantIds:
        report Missing in Merchant DB

    for id in merchantIds - stripeIds:
        report Missing in Stripe

    for id in stripeIds intersect merchantIds:
        if either group is duplicated:
            skip field comparison until duplicate is resolved
        else:
            if stripe.amountCents != merchant.amountCents:
                report Amount mismatch
            if stripe.status != merchant.status:
                report Status mismatch
            if abs(stripe.createdAt - merchant.createdAt) > 24 hours:
                report Timestamp

    save discrepancies as CSV/JSON
    publish counts by type and severity as monitoring metrics
    return non-zero exit code when High discrepancies exist
```

### Запуск і алерти

- Запускати після завершення щоденного Stripe export; для більш оперативного
  контролю — інкрементально щогодини з невеликим grace period для затриманих
  webhook-подій.
- Джерела: Stripe API/звіт і read-only replica Merchant DB. Фіксувати однакове
  UTC-вікно та Stripe account, щоб не отримувати хибні Missing.
- High: повідомлення в `#payments-alerts` і створення incident/ticket для Payment
  Operations; Amount mismatch та Missing повинні робити CI/batch job failed.
- Medium: ticket у backlog із добовим SLA.
- Low: додавати до щоденного reconciliation report; алертити при перевищенні
  порогу або повторенні.
- Зберігати audit trail: run id, часове вікно, source checksum, кількість рядків,
  знайдені розбіжності та результат повторного запуску.

### Мінімальний набір автотестів

1. Валідний запис після нормалізації статусу не створює discrepancy.
2. Missing у кожному з двох напрямків.
3. Різниця суми, включно з decimal-to-cents і округленням.
4. Status mismatch та всі дозволені status mappings.
5. Duplicate в кожному джерелі — до побудови lookup map.
6. Timestamp: 24 години рівно не падає; більше 24 годин падає.
7. UTC parsing не залежить від timezone машини або DST.
8. Порожній файл, відсутня колонка, невалідна сума/дата — контрольована помилка,
   а не частковий «успішний» звіт.

