# vk-utils

Набор утилит, связанных с анализом участников групп аконтакте.
Работает, но это черновая версия, не гарантируется совместимость со старыми версиями и чистота кода.
Для работы требуется `ardb` или `redis`.


## Поиск альтернативных страниц
_*Выдает каким-либо образом тесно связанные страницы __людей__, в том числе альтернативные страницы (фейки)._  

```
node src/similiar-users.js ID_Страницы
```

## Поиск людей по интересам

1. Изменить `data/tags.txt` по образцу на свой вкус
2. Получить список групп: `node src/tags-to-groups.js`
3. Получить список участников: `node src/groups-to-members.js`
4. Обработать списки участников: `node src/members-to-amounts.js`
5. Веса из `tags.txt` учитываются только на следующем шаге, дабы можно было действовать
методом проб и ошибок.
6. Отсортировать участников: `node src/amounts-to-weights.js`
7. Настроить в правила фильтрации в `src/weights-to-report.js`
8. Составить отчет: `node src/weights-to-report.js`
9. Открыть в браузере `result/index.html`

## Поиск скрытых групп

Скрипт для определения групп человека, даже если они скрыты:   
```
node src/rev-get-groups.js ID_Страницы
```

Но определяет он только те группы что были ранее загружены, поэтому
рекомендуется составить вероятные тематики групп, следовать пунктам 1-3 поиска по интересам,
 а затем запускать сам скрипт.