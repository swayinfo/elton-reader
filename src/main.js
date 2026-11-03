/*
 * Book Reader for Obsidian — plugin source.
 *
 * Read EPUB, FB2 and PDF books inside Obsidian, highlight passages and turn them
 * into notes. Everything below is the plugin's own code; the libraries it uses
 * (pdf.js, epub.js, JSZip, localForage) come from npm and are bundled at build
 * time by esbuild — see esbuild.config.mjs.
 */
import { AbstractInputSuggest, Component, FuzzySuggestModal, ItemView, MarkdownRenderer, Menu, Modal, Notice, Platform, Plugin, PluginSettingTab, Scope, Setting, TFile, TFolder, getLanguage, normalizePath, requestUrl, setIcon } from "obsidian";
// The legacy build, not the modern one. pdf.js 6 calls Promise.withResolvers,
// URL.parse, Promise.try, Uint8Array.fromBase64 and the new Set methods; the
// modern build assumes the engine has them. Android System WebView on many
// phones is far older (Chrome 113 in the test emulator) and failed on the very
// first line with "Promise.withResolvers is not a function" — the "PDF does not
// open on Android" reports. The legacy build carries core-js polyfills for all
// of it; the worker was already the legacy one.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import ePub from "epubjs";

// ---- i18n (RU default / EN) ----
const __erEN = {"Пункт «В словарь» в меню выделения: слово с переводом (или с предложением из книги) становится карточкой для повторения.":"An “Add to vocabulary” item in the selection menu: the word with its translation (or the sentence from the book) becomes a review card.","Куда класть карточки":"Where cards go","Авто — в FSRS, если он есть в хранилище, иначе в заметку-словарь для Spaced Repetition.":"Auto — into FSRS if it is in the vault, otherwise into a vocabulary note for Spaced Repetition.","Авто":"Auto","Заметка-словарь (Spaced Repetition)":"Vocabulary note (Spaced Repetition)","FSRS":"FSRS","Пусто — «Словарь» в корне хранилища.":"Empty — “Vocabulary” in the vault root.","файл FSRS не найден":"FSRS file not found","блок данных FSRS повреждён — откройте FSRS, он его починит":"the FSRS data block is damaged — open FSRS, it will repair it","Уже в FSRS: {0}":"Already in FSRS: {0}","В FSRS: {0}":"Added to FSRS: {0}","Уже в словаре: {0}":"Already in the vocabulary: {0}","Пожелания и ошибки — в телеграм-бота":"Feedback and bugs — in the Telegram bot","Всё, что хочется поменять или починить, теперь собирается в одном месте — в телеграм-боте @book_in_obsidian_bot.":"Everything you would like changed or fixed is now collected in one place — the Telegram bot @book_in_obsidian_bot.","Ни аккаунта на GitHub, ни формы не нужно: заметили ошибку, не хватает возможности, неудобно на телефоне — просто отправьте боту обычное сообщение.":"No GitHub account and no form needed: found a bug, missing a feature, something awkward on the phone — just send the bot an ordinary message.","Читаю всё подряд; из этих сообщений и складывается список того, что делать дальше.":"I read every one of them, and that is what the plan for the next versions is made of.","Пожелания и ошибки":"Feedback and bugs","Всё, что хочется поменять или починить, собирается в телеграм-боте @book_in_obsidian_bot. Напишите ему обычным сообщением — ни аккаунта на GitHub, ни формы не нужно.":"Everything you would like changed or fixed is collected in the Telegram bot @book_in_obsidian_bot. Send it an ordinary message — no GitHub account and no form needed.","Написать в бота":"Message the bot","Обратная связь: ":"Feedback: "," — версия {0}. Автор: Elton.":" — version {0}. Author: Elton.","Пожелания и ошибки теперь собираются в телеграм-боте @book_in_obsidian_bot — просто напишите ему сообщение":"Feedback and bugs are now collected in the Telegram bot @book_in_obsidian_bot — just send it a message","Разбор фрагмента стал диалогом: свой вопрос, свой системный промпт, название книги уходит фоном":"Explaining a passage is a conversation now: your own question, your own system prompt, and the book's title is sent as background context","Читалка подстраивается под устройство: у телефона, планшета и компьютера своя раскладка":"The reader adapts to the device: phone, tablet and desktop each get their own layout","Тема читалки и библиотеки меняется мгновенно, появилась подстройка под тему Obsidian":"Reader and library themes switch instantly, and can follow your Obsidian theme","Движок PDF обновлён — открытие книг стало надёжнее":"The PDF engine has been updated — opening books is more reliable","стр. {0}":"p. {0}","разв. {0}":"spr. {0}","Введите хотя бы два символа":"Type at least two characters","Что найти в книге…":"What to find in the book…","Фильтр по названию…":"Filter by title…","В этой книге не нашлось ни оглавления, ни заголовков.":"No contents and no headings were found in this book.","Каким цветом подсветить фрагмент, если вы написали к нему комментарий, не выбрав цвет вручную. Комментарий может храниться только при выделении, поэтому оно создаётся само.":"Which colour to use when you comment on a passage without picking a colour first. A comment can only be stored on a highlight, so one is created for you.","Цвет выделения по умолчанию":"Default highlight colour","Не удалось сохранить комментарий":"Could not save the comment","Найдено: {0}. Слово подсвечено в тексте.":"Found: {0}. The word is highlighted in the text.","Снять подсветку":"Clear highlight","Эта страница слишком тяжёлая, чтобы нарисовать её":"This page is too heavy to draw","Найденное слово подсвечивается прямо в тексте, чтобы не искать его глазами в абзаце":"The matched word is painted right in the text, so you don't have to hunt for it in the paragraph","Найденное слово подсвечивается жёлтым прямо в тексте книги, поэтому искать его глазами в абзаце не нужно. Через несколько секунд подсветка гаснет сама, чтобы не мешать чтению; убрать сразу — «Снять подсветку» в панели поиска.":"The matched word is painted yellow right in the book's text — and stays painted after you close the panel, so you don't have to hunt for it in the paragraph. Turn it off with \"Clear highlight\" in the search panel.","Поиск по всему тексту книги — список совпадений с фрагментом вокруг каждого, клик переходит к месту.":"Search across the whole book's text — a list of matches with context around each, click to jump to that spot.","Поиск":"Search","Экспорт цитат группирует их по главам и подписывает номер страницы":"Quote export now groups by chapter and labels the page number","Оглавление наконец работает — брало данные, но не показывало их; починил, добавил номер страницы, живой номер разворота и фильтр для длинных списков":"Contents finally works — it had the data but never showed it; fixed, plus page numbers, a live spread number and a filter for long lists","Комментарий к выделению — короткая мысль остаётся при цитате, а не улетает в отдельный файл":"Comment on a highlight — a short thought stays with the quote instead of flying into a separate file","Поиск по всей книге — значок лупы вверху читалки, со списком совпадений и переходом к месту":"Search the whole book — magnifier icon at the top, with a match list and jump-to-spot","Если пунктов много (в технических книгах бывает 300–400), сверху появляется поле фильтра — начните печатать название главы.":"When there are many entries (technical books can have 300–400), a filter field appears at the top — start typing a chapter name.","У каждого пункта — номер страницы книги и номер текущего разворота, который пересчитывается на лету: он меняется при изменении ширины окна или открытии боковых панелей, поэтому его нельзя один раз сохранить.":"Each entry shows the book's own page number and the current spread number, recomputed live — it changes with window width or a sidebar opening, so it can't be stored once and reused.","Плагин ищет оглавление в таком порядке: сначала настоящие закладки из PDF, потом заголовки в тексте, потом печатное содержание книги (та страница со списком глав и точками), и в последнюю очередь — жирные абзацы, если больше зацепиться не за что.":"The plugin looks for a contents source in this order: real PDF bookmarks first, then headings in the text, then the book's own printed contents page (the one with the dotted leaders), and as a last resort, bold paragraphs if nothing else is there to go on.","Оглавление: откуда оно берётся":"Contents: where it comes from","Ищет по части слова: запрос «систем» найдёт и «система», и «системы», и «системный».":"Matches partial words: searching \"system\" finds \"system\", \"systems\" and \"systemic\".","Клик по результату — переход прямо к этому месту, на любом устройстве и при любой ширине окна.":"Click a result to jump straight to that spot, on any device and at any window width.","Значок лупы вверху читалки (или команда «Поиск по книге») открывает поиск по всему тексту — со списком совпадений и фрагментом текста вокруг каждого.":"The magnifier icon at the top of the reader (or the \"Search the book\" command) opens full-text search, with a list of matches and surrounding context for each.","Поиск по книге":"Search the book","Сохраняется по кнопке или Ctrl+Enter. Если очистить поле — комментарий удаляется, сама цитата остаётся.":"Saved with the button or Ctrl+Enter. Clearing the field removes the comment; the quote itself stays.","Пример: подчеркнули спорный тезис и приписали «а вот тут он сам себе противоречит» — эта строка видна в панели «Выделения» под цитатой и попадает в заметку книги при экспорте.":"Example: you highlight a shaky claim and jot \"he contradicts himself right here\" — it shows under the quote in the Highlights panel and travels with it on export.","У выделенного текста, кроме «Создать заметку», есть значок комментария — короткая мысль, которая остаётся ПРИ выделении, а не улетает в отдельный файл.":"Highlighted text has a comment icon besides \"Create a note\" — a short thought that stays WITH the highlight instead of flying off into a separate file.","Комментарий к выделению":"Comment on a highlight","В заметке цитаты собраны по главам, у каждой — номер страницы книги, а комментарий (если вы его оставили) идёт прямо под цитатой.":"In the note, quotes are grouped by chapter, each carries the book's page number, and your comment (if you left one) sits right under the quote.","Инструкция выросла до 21 экрана — теперь разбирает каждую настройку с примерами":"The guide has grown — it now walks through every setting with examples","Режим для e-ink читалок: без анимаций и теней, чистый чёрный на белом, крупнее кнопки":"E-ink reader mode: no animations or shadows, pure black on white, bigger buttons","Выделения переносятся выборочно: галочки, «выделить все», «только новые» — уже перенесённое не задваивается":"Highlights are exported selectively: tick boxes, \"select all\", \"new only\" — nothing already copied gets duplicated","Заметку из выделения можно сразу положить в нужную папку и проставить теги":"A note made from a highlight can go straight into the folder you want, with tags","Картинки из книг теперь показываются сразу — раньше их приходилось искать в другой читалке":"Pictures now show up straight away — previously you had to open another reader to find them","Картинки в книгах":"Pictures in books","Заметка из выделения: название, папка, теги":"A note from a highlight: title, folder, tags","Папка и теги запомнятся для следующей заметки. Сам фрагмент попадёт в текст целиком — название на это не влияет.":"The folder and tags are remembered for the next note. The passage itself goes into the note in full — the title does not affect that.","Например: идеи, психология":"For example: ideas, psychology","Теги":"Tags","Название":"Title","Новая заметка из выделения":"New note from a highlight","Для Obsidian на Android-читалке с электронными чернилами. Убирает анимации, плавные переходы, тени и размытие — они оставляют на таком экране следы. Чистый чёрный на белом, жёсткие рамки, крупнее кнопки, листание без скольжения.":"For Obsidian on an Android e-ink reader. Removes animations, fades, shadows and blur — they leave ghosting on such a screen. Pure black on white, hard borders, bigger buttons, page turns that jump instead of sliding.","Режим для e-ink читалок":"E-ink reader mode","Перенести выделения в заметки":"Move highlights into notes","Инструкция по плагину":"Plugin guide","Инструкция: разбор всех настроек по шагам":"Guide: every setting, step by step","Команды и горячие клавиши":"Commands and hotkeys","Как перенести выделения в заметки":"Moving highlights into notes","Вкладка «Данные»: где что лежит":"The Data tab: where things live","Вкладка «Перевод»":"The Translate tab","Заметка книги и шаблон":"The book note and the template","Куда складывать заметки":"Where notes are filed","Вкладка «Заметки»: название заметки":"The Notes tab: note titles","«Погружение» и цель чтения":"Immersive mode and the reading goal","«Выравнивание» и «Положение текста»":"Alignment and text position","Настройка «Листание страниц»":"The \"Turning pages\" setting","Вкладка «Чтение»: статистика":"The Reading tab: statistics","Дальше — разбор настроек":"Next: a tour of the settings","Что перенести в заметку":"What to copy into the note","Заметка «{0}» — {1} уже перенесено, отмечено {2} новых":"Note \"{0}\" — {1} already there, {2} new ones ticked","Заметка «{0}» — все {1} ещё не перенесены":"Note \"{0}\" — none of the {1} are there yet","Заметка книги не привязана — доступны только отдельные заметки":"No book note linked — separate notes only","Выделить все":"Select all","Снять все":"Clear all","Только новые":"New only","уже в заметке":"already in the note","Отмечено: {0} из {1}":"Ticked: {0} of {1}","В заметку книги":"Into the book note","Отдельными заметками":"As separate notes","Эта цитата уже есть в «{0}»":"That quote is already in \"{0}\"","Все выбранные цитаты уже есть в «{0}»":"All the selected quotes are already in \"{0}\"","Добавлено в «{0}»: {1}, пропущено уже имевшихся: {2}":"Added to \"{0}\": {1}; skipped as already present: {2}","Название подбирается автоматически: первое предложение фрагмента или его начало по границе слова. Выключено — в имя файла идёт весь фрагмент, как раньше.":"The title is chosen automatically: the passage's first sentence, or its opening cut on a word boundary. Off — the whole passage goes into the filename, as before.","Короткие названия без вопросов":"Short titles, no questions","Перед созданием заметки из выделения появится окно с коротким названием — его можно исправить или одной кнопкой вставить фрагмент целиком. Без этого имя файла берётся из самого фрагмента и выходит очень длинным.":"Before a note is created from a highlight, a dialog offers a short title you can edit, or insert the whole passage with one click. Without it the filename is taken from the passage itself and comes out very long.","Спрашивать название заметки":"Ask for the note title","Отмена":"Cancel","Сам фрагмент попадёт в текст заметки целиком — название на это не влияет.":"The passage itself goes into the note in full — the title does not affect that.","Взять весь фрагмент как название":"Use the whole passage as the title","Какую книгу открыть?":"Which book do you want to open?","Книга не найдена: {0}":"Book not found: {0}","Открыть книгу: {0}":"Open book: {0}","Открыть книгу…":"Open a book…","Продолжить чтение (последняя книга)":"Continue reading (last book)","Перестроение при сворачивании панелей стало плавным, а не рывком":"Re-layout when sidebars open or close now fades instead of jumping","Строки заполняют страницу до конца — больше нет пустых мест внизу колонки":"Lines fill the page to the bottom — no more blank gaps at the foot of a column","Листание строго вправо, без съезжания в угол, и текст стал чётким":"Page turns go straight sideways instead of drifting into the corner, and text is sharp","Статистика чтения: сколько всего прочитано, серия дней и график за две недели":"Reading stats: all-time total, day streak and a two-week chart","Книгу можно открыть командой — своя команда и горячая клавиша на каждую книгу":"Open a book by command — each book gets its own command and hotkey","Сколько минут в день вы хотите читать. Прогресс за сегодня — в карточке вверху этой вкладки.":"How many minutes a day you want to read. Today's progress is in the card at the top of this tab.","Откройте книгу и включите таймер ▶ — здесь появится история чтения.":"Open a book and start the timer ▶ — your reading history will appear here.","14 дней назад":"14 days ago","лучший день":"best day","в среднем за день":"daily average","дней с книгой":"days with a book","сегодня":"today","{0} дн. подряд":"{0}-day streak","за всё время с книгами":"all-time with books","{0} д":"{0} d","{0} д {1} ч":"{0} d {1} h","{0} ч":"{0} h","меньше минуты":"less than a minute","Положение на странице":"Position on the page","Положение текста на странице":"Text position on the page","Сверху":"Top","Снизу":"Bottom","Куда прижимать текст, если страница заполнена не до конца — например, в конце главы.":"Where to place the text when a page isn't filled — at the end of a chapter, for instance.","Если страница заполнена не до конца (например, в конце главы), текст можно не оставлять прижатым к верху. Меняется и на лету — в панели настроек чтения.":"When a page isn't filled (at the end of a chapter, for instance), the text needn't stay pinned to the top. Can also be changed on the fly from the reading-settings panel.","Чтение":"Reading","Заметки":"Notes","Данные":"Data","О плагине":"About","Очистка":"Cleanup","Шаблон":"Template","Цель чтения":"Reading goal","Что нового":"What's new","Показать":"Show","Список изменений последних версий.":"Changes from recent versions.","<b>Book Reader</b> — версия {0}. Автор: Elton Labs.":"<b>Book Reader</b> — version {0}. By Elton Labs.","Шрифт, размер и межстрочный интервал настраиваются прямо в книге — иконка ползунков вверху читалки.":"Font, size and line spacing are set inside the book — the sliders icon at the top of the reader.","Доп. настройки":"More settings","Память о книгах":"What the reader remembers","Забыть все книги":"Forget all books","Точно забыть?":"Really forget?","Готово — читалка снова спросит про заметку при открытии книги":"Done — the reader will ask about a note again when you open a book","Забыть настройки этой книги":"Forget this book's settings","Настройки книги сброшены — окно появится при следующем открытии":"Book settings cleared — the setup screen will appear next time you open it","Книг: {0}. Привязанные заметки, категории, шаблоны отдельных книг и отметки «про заметку уже спрашивали». Сами заметки НЕ удаляются — читалка просто забывает связи и спросит про заметку заново при открытии каждой книги.":"Books: {0}. Linked notes, categories, per-book templates and the \"already asked about a note\" marks. The notes themselves are NOT deleted — the reader just forgets the links and will ask about a note again when you open each book.","Заметка книги для ссылок":"Book note for links","Шаблон для этой книги":"Template for this book","Book Reader обновлён до {0}":"Book Reader updated to {0}","Понятно":"Got it","Открыть инструкцию":"Open the guide","Расширенные":"Advanced","Категория":"Category","Например: Психология, Бизнес":"e.g. Psychology, Business","Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Можно оставить пустым.":"Genre or topic — books are grouped by it in the library. Separate several with commas. Can be left empty.","Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Пусто — без категории.":"Genre or topic — books are grouped by it in the library. Separate several with commas. Empty means no category.","Цитаты и мысли из книги будут ссылаться на эту заметку.":"Quotes and thoughts from this book will link to this note.","Поиск заметки…":"Search notes…","Создать заметку…":"Create a note…","Создать заметку":"Create note","← Назад":"← Back","В хранилище пока нет заметок — создайте новую ниже":"No notes in the vault yet — create one below","Ничего не найдено":"Nothing found","Все":"All","Читаю":"Reading","Не начатые":"Not started","Прочитано":"Finished","Без папки":"No folder","Заметка для книги":"A note for this book","Куда собирать цитаты и мысли из этой книги? Выделенные фрагменты будут ссылаться на эту заметку.":"Where should quotes and thoughts from this book go? Highlights will link back to this note.","Создать заметку для книги":"Create a note for this book","Название заметки":"Note name","Папка":"Folder","Корень хранилища":"Vault root","Создать и начать читать":"Create and start reading","или":"or","Выбрать существующую заметку":"Pick an existing note","Читать без заметки":"Read without a note","В хранилище пока нет заметок — создайте новую":"There are no notes in the vault yet — create one","Больше не спрашивать — создавать заметку для каждой книги автоматически":"Don't ask again — create a note for every book automatically","Это всегда можно поменять потом — кнопка (i) вверху читалки или настройки плагина.":"You can change this later — the (i) button at the top of the reader, or the plugin settings.","+ Создать новую":"+ Create new","Заметка с этой страницы":"Note from this page","{0} — стр. {1}":"{0} — p. {1}","— из [[{0}]], стр. {1}":"— from [[{0}]], p. {1}","> *(страница-скан — текста для цитаты нет, впишите своими словами)*":"> *(scanned page — no text to quote, write it in your own words)*","Заметка создана: {0}":"Note created: {0}","Показывать картинки из книги":"Show pictures from the book","По умолчанию ВЫКЛ: если из страницы извлекается текст — показывается только чистый текст. Включите, чтобы над текстом показывались иллюстрации, схемы и графики: вырезаются сами картинки, а не скриншот всей страницы. На сканах (где текст извлечь нельзя) страница по-прежнему показывается целиком. Откройте книгу заново, чтобы применить.":"Off by default: when a page yields text, only the clean text is shown. Turn this on to also show the book's illustrations, diagrams and charts above the text — the pictures themselves are cropped out, not a screenshot of the whole page. Scanned pages (where no text can be extracted) are still shown in full. Reopen the book to apply.","Перевод":"Translation","Перевод выделенного":"Translating a selection","Оригинал":"Original","Переводим…":"Translating…","Перевести":"Translate","Копировать перевод":"Copy translation","В заметку":"To a note","Пустой ответ переводчика":"The translator returned nothing","Не удалось перевести. Нужен интернет — перевод идёт через Google Translate, и у него есть лимиты на частые запросы.":"Could not translate. An internet connection is required — translation goes through Google Translate, which rate-limits frequent requests.","Кнопка перевода в выделении":"Translate button in the selection popup","Добавляет кнопку перевода в панельку, которая появляется при выделении текста. Перевод открывается рядом с оригиналом, его можно скопировать или сохранить в заметку под цитатой. Откройте книгу заново, чтобы кнопка появилась.":"Adds a translate button to the popup that appears when you select text. The translation is shown next to the original; you can copy it or save it into a note under the quote. Reopen the book for the button to appear.","Это первая версия функции. Перевод идёт через бесплатный Google Translate: нужен интернет, есть лимиты на частые запросы, а выделенный фрагмент уходит на серверы Google. Для больших объёмов пока не рассчитано.":"This is an early version of the feature. Translation uses the free Google Translate: it needs internet, is rate-limited, and the selected fragment is sent to Google's servers. Not intended for large volumes yet.","Переводить на язык":"Translate into","Язык, на который переводить выделенный фрагмент. Исходный язык определяется автоматически.":"The language to translate the selected fragment into. The source language is detected automatically.","Русский":"Russian","Перевод — это отдельный сетевой запрос к Google. Если вам важно, чтобы текст книги никуда не уходил, оставьте функцию выключенной: всё остальное в читалке работает полностью офлайн.":"Translation is a separate network request to Google. If you need the book's text to stay on your device, leave this off: everything else in the reader works fully offline.","\n\n**Перевод:**\n{0}":"\n\n**Translation:**\n{0}","Читалка открывает три формата: EPUB (.epub), FB2 (.fb2) и PDF (.pdf).":"The reader opens three formats: EPUB (.epub), FB2 (.fb2) and PDF (.pdf).","1. Кладёте файл книги (.epub, .fb2 или .pdf) в хранилище и открываете его кликом.":"1. Put the book file (.epub, .fb2 or .pdf) in your vault and open it with a click.","Этот FB2 упакован в ZIP. Распакуйте архив и положите в хранилище сам файл .fb2.":"This FB2 is packed in a ZIP. Unpack the archive and put the .fb2 file itself into your vault.","Выравнивание текста":"Text alignment","Слева":"Left","По ширине":"Justify","По центру":"Center","Справа":"Right","{0} ч {1} мин":"{0} h {1} min","{0} мин":"{0} min","Своя заметка на каждую книгу":"A separate note per book","При первом открытии книги автоматически создаётся отдельная заметка с названием книги (в «Папке заметок-книг», иначе в «Папке для новых заметок») и привязывается к ней. Дальше все выделения из этой книги идут в её заметку. Выключено по умолчанию.":"On a book's first open, a dedicated note titled after the book is created (in the \"Book notes folder\", otherwise the \"New notes folder\") and linked to it. From then on every highlight from this book goes into its note. Off by default.","Заметка книги создана: {0}":"Book note created: {0}","Это первая версия функции — проверьте результат на паре книг. Заметка создаётся один раз при первом открытии книги.":"This is an early version of the feature — check the result on a couple of books first. The note is created once, on a book's first open.","Как выравнивается текст в колонке чтения. Можно менять и на лету — в панели настроек чтения (иконка ползунков) в самой книге. Откройте книгу заново, чтобы применить.":"How text is aligned in the reading column. You can also change it on the fly from the reading-settings panel (sliders icon) inside a book. Reopen the book to apply.","Сегодня прочитано: {0} мин. Всего за всё время: {1}. Кнопка ▶ вверху запускает обратный отсчёт до цели (пауза — ⏸).":"Read today: {0} min. All-time total: {1}. The ▶ button at the top starts the countdown toward the goal (pause — ⏸).","Сегодня прочитано: {0} мин. Всего за всё время: {1} мин.":"Read today: {0} min. All-time total: {1} min.","Жёлтый":"Yellow","Зелёный":"Green","Голубой":"Blue","Розовый":"Pink","Цель чтения на сегодня достигнута 🎉":"Today's reading goal reached 🎉","Таймер выключен — включите его в настройках чтения":"Timer is off — enable it in reading settings","Таймер сброшен":"Timer reset","Листание":"Page turning","Кнопками":"Buttons","По клику":"By click","«По клику»: клик по левой части страницы — назад, по правой — вперёд. Центр свободен для выделения текста.":"\"By click\": clicking the left part of the page goes back, the right part goes forward. The center stays free for selecting text.","Вкл":"On","Выкл":"Off","Тап по картинке — увеличить · фон или ✕ — закрыть":"Tap the image to zoom · background or ✕ to close","Elton Reader: используем pdf.worker.js из CDN (нужен интернет). Причина:":"Elton Reader: using pdf.worker.js from the CDN (internet required). Reason:","Elton Reader: could not register .pdf, use right-click → Открыть в Elton Reader":"Elton Reader: could not register .pdf, use right-click → Open in Elton Reader","Book Reader — Библиотека":"Book Reader — Library","Открыть библиотеку":"Open library","Открыть PDF в Book Reader":"Open PDF in Book Reader","Сохранить позицию чтения":"Save reading position","Экспортировать выделения в заметки":"Export highlights to notes","📖 Открыть в Book Reader":"📖 Open in Book Reader","Показать приветствие (онбординг)":"Show welcome (onboarding)","Заметка книги для ссылок — начните вводить название…":"Book note for links — start typing a name…","Шаблон заметки — начните вводить путь…":"Note template — start typing a path…","## Заметки из выделений":"## Notes from highlights","Заметка":"Note","Пустое выделение":"Empty highlight","Заметка создана":"Note created","Не удалось создать заметку":"Could not create the note","Нет выделений для экспорта":"No highlights to export","Книга":"Book","Не удалось экспортировать выделения":"Could not export highlights","Нет":"No","Да":"Yes","Для книги не привязана заметка — задайте её в настройках":"No note is linked to this book — set it in settings","## Цитаты":"## Quotes","Цитаты добавлены":"Quotes added","Да, открыть":"Yes, open","Не удалось добавить цитаты в заметку книги":"Could not add quotes to the book note","Как пользоваться Book Reader":"How to use Book Reader","Что делает каждая кнопка и зачем":"What each button does and why","Верхняя панель":"Top bar","Сохранить позицию":"Save position","Запоминает, где вы остановились, и ставит точку возврата (помечена 💾 в «Настройки → Вернуться к месту»). Это как «сохранение» в игре — нажмите перед закрытием книги, если хотите быть точно уверены, что место не потеряется.":"Remembers where you left off and drops a restore point (marked 💾 in \"Settings → Jump back\"). It's like a \"save\" in a game — press it before closing the book if you want to be completely sure your spot won't be lost.","Обновить":"Refresh","Перестраивает страницу заново, если вёрстка «поехала» — например, после смены размера окна или открытия/закрытия боковой панели или вкладки (текст может отобразиться криво). Текущую позицию при этом сохраняет.":"Rebuilds the page if the layout breaks — for example, after resizing the window or opening/closing a sidebar panel or tab (the text may look misaligned). Your current position is preserved.","Выделения":"Highlights","Открывает список всех ваших выделений в этой книге. Клик по строке — переход к этому месту. Сверху списка — кнопка экспорта в заметки.":"Opens the list of all your highlights in this book. Click a row to jump to that spot. Above the list is the export-to-notes button.","Содержание":"Contents","Оглавление книги — быстрый переход по главам.":"The book's table of contents — quickly jump between chapters.","Настройки":"Settings","Тема, шрифт, размер текста, число колонок и блок «Вернуться к месту» — список точек, к которым можно откатиться.":"Theme, font, text size, column count and the \"Jump back\" block — a list of points you can roll back to.","Справка":"Help","Это окно.":"This window.","Чтение и навигация":"Reading and navigation","Листать страницы":"Turn pages","Стрелки внизу экрана, клавиши ← → ↑ ↓ и пробел, либо свайп пальцем на телефоне. Каждое перелистывание автоматически сохраняет позицию — отдельно жать «Сохранить» не обязательно.":"The arrows at the bottom of the screen, the ← → ↑ ↓ keys and space, or a finger swipe on mobile. Every page turn saves your position automatically — you don't need to press \"Save\" separately.","Выделения и заметки":"Highlights and notes","Выделить текст":"Highlight text","Выделите фрагмент мышью или пальцем — всплывёт палитра цветов. Клик по уже готовому выделению — сменить цвет или удалить его.":"Select a fragment with the mouse or a finger — a color palette pops up. Click an existing highlight to change its color or remove it.","Создать заметку из выделения":"Create a note from a highlight","Правый клик по выделенному тексту → «Создать новую заметку». Заметка создаётся по вашему шаблону в выбранной папке, с цитатой и ссылкой на книгу.":"Right-click the highlighted text → \"Create new note\". The note is created from your template in the chosen folder, with the quote and a link to the book.","Экспортировать все выделения":"Export all highlights","Кнопка вверху панели «Выделения». Собирает все выделения книги разом. Спросит формат: одна общая заметка со всеми цитатами, отдельный файл на каждое выделение, либо вставить все цитаты текстом прямо в привязанную заметку книги.":"The button at the top of the \"Highlights\" panel. Collects all of the book's highlights at once. It asks for a format: one shared note with all quotes, a separate file per highlight, or inserting all quotes as text straight into the linked book note.","Куда вести ссылку «— из [[…]]» в заметках из выделений. Пусто — имя файла книги.":"Where the \"— from [[…]]\" link in highlight notes points. Empty — the book's file name.","Сначала откройте книгу…":"Open a book first…","Выбрать из списка…":"Choose from the list…","В хранилище нет заметок":"No notes in the vault","Свой шаблон только для этой книги (например, под жанр). Пусто — используется общий шаблон из настроек плагина.":"A template just for this book (for example, per genre). Empty — the shared template from the plugin settings is used.","Templates/Шаблон.md":"Templates/Template.md","Про автосохранение":"About autosave","Позиция сохраняется сама при каждом перелистывании и хранится в общем файле, который синхронизируется между устройствами (Obsidian Sync). Перестроение страницы (смена размера окна, панелей, масштаба) больше НЕ двигает и не пересохраняет прогресс — поэтому он не «уезжает» сам по себе.":"Your position is saved automatically on every page turn and kept in a shared file that syncs across devices (Obsidian Sync). Rebuilding the page (resizing the window, panels, zoom) no longer moves or re-saves progress — so it won't \"drift\" on its own.","Добро пожаловать в Book Reader!":"Welcome to Book Reader!","Это уютная читалка книг прямо внутри Obsidian. Читаете, выделяете важное и превращаете выделения в заметки — не выходя из хранилища.":"It's a cozy book reader right inside Obsidian. Read, highlight what matters and turn highlights into notes — without leaving your vault.","Пролистайте несколько экранов стрелкой → (или кнопкой «Далее»). Это займёт минуту, зато потом всё будет понятно.":"Flip through a few screens with the → arrow (or the \"Next\" button). It takes a minute, but then everything will be clear.","Какие форматы и как открыть книгу":"Which formats, and how to open a book","Читалка открывает два формата: EPUB (файлы .epub) и PDF (файлы .pdf).":"The reader opens two formats: EPUB (.epub files) and PDF (.pdf files).","Чтобы читать книгу, положите её файл в своё хранилище Obsidian и просто кликните по нему — она откроется в читалке.":"To read a book, put its file into your Obsidian vault and just click it — it opens in the reader.","На левой панели есть значок 📖 «Библиотека» — там все ваши книги с обложками в одном месте.":"In the left sidebar there's a 📖 \"Library\" icon — all your books with covers in one place.","Это самая первая версия":"This is the very first version","Пожалуйста, не загружайте сразу много книг. Начните с двух-трёх и проверьте, что всё работает стабильно именно на вашем устройстве.":"Please don't load a lot of books at once. Start with two or three and check that everything works reliably on your device.","Особенно аккуратно с очень большими PDF (сотни страниц или сканы картинок) — они тяжёлые и могут подтормаживать.":"Be especially careful with very large PDFs (hundreds of pages or scanned images) — they're heavy and may lag.","Плагин будет становиться лучше. А пока — по чуть-чуть и бережно 🙂":"The plugin will keep getting better. For now — little by little and gently 🙂","Выделения: цвета и действия":"Highlights: colors and actions","Выделите текст пальцем или мышью — появится палитра. Выберите цвет, и выделение сохранится.":"Select text with a finger or the mouse — a palette appears. Pick a color and the highlight is saved.","Нажмите на уже готовое выделение — откроется то же меню: сменить цвет, скопировать, поставить закладку «остановился здесь», создать заметку, отправить в заметку книги или удалить.":"Tap an existing highlight — the same menu opens: change color, copy, set a \"stopped here\" bookmark, create a note, send it to the book note, or delete.","Все выделения книги собраны в панели 🖍️ наверху — оттуда можно перейти к любому или экспортировать все сразу.":"All of the book's highlights are gathered in the 🖍️ panel at the top — from there you can jump to any of them or export them all at once.","Что такое «заметка книги»":"What a \"book note\" is","У каждой книги можно завести одну обычную заметку Obsidian — её «главную страницу», например «Мастер и Маргарита.md».":"For each book you can keep one ordinary Obsidian note — its \"home page\", for example \"The Master and Margarita.md\".","Когда вы создаёте заметку из выделения, в ней ставится ссылка на эту заметку книги. А ещё цитаты можно отправлять прямо в неё — так все мысли по книге собираются в одном месте.":"When you create a note from a highlight, it links back to this book note. You can also send quotes straight into it — so all your thoughts on the book gather in one place.","Это не обязательно настраивать прямо сейчас — привязать заметку книги можно в любой момент позже. Откройте книгу, нажмите значок ⓘ (справка) вверху читалки и заполните поле «Заметка книги для ссылок». Пока ничего не привязано, ссылки просто ведут на имя файла книги.":"You don't have to set this up right now — you can link a book note at any time later. Open the book, press the ⓘ (help) icon at the top of the reader and fill in the \"Book note for links\" field. Until something is linked, links simply point to the book's file name.","Где всё хранится":"Where everything is stored","Ваш прогресс чтения и выделения хранятся файлами прямо в хранилище (рядом с книгами или в отдельной папке — это настраивается). Ничего не спрятано «внутри плагина» — всё лежит у вас.":"Your reading progress and highlights are stored as files right in the vault (next to the books or in a separate folder — it's configurable). Nothing is hidden \"inside the plugin\" — it's all yours.","Заметки из выделений и заметки книги — это самые обычные .md заметки в вашей папке. Открывайте, редактируйте и связывайте их, как любые другие.":"Highlight notes and book notes are ordinary .md notes in your folder. Open, edit and link them like any others.","Про синхронизацию":"About syncing","Раз прогресс и выделения — это файлы в хранилище, они синхронизируются вместе с ним (Obsidian Sync, iCloud и т.п.).":"Since progress and highlights are files in the vault, they sync along with it (Obsidian Sync, iCloud, etc.).","Дайте синхронизации закончиться, прежде чем открывать ту же книгу на другом устройстве, и не читайте одну книгу на двух устройствах сразу — иначе позиция может «поспорить сама с собой».":"Let syncing finish before opening the same book on another device, and don't read one book on two devices at once — otherwise the position may \"argue with itself\".","На разных устройствах путь к папке с книгами бывает разным — проверьте папки в настройках плагина.":"The path to the books folder can differ across devices — check the folders in the plugin settings.","Пример: как это всё работает":"Example: how it all works","1. Кладёте файл книги (.epub или .pdf) в хранилище и открываете его кликом.":"1. Put a book file (.epub or .pdf) into the vault and open it with a click.","2. Читаете. Позиция сохраняется сама при каждом перелистывании — ничего нажимать не нужно.":"2. Read. Your position saves itself on every page turn — nothing to press.","3. Понравилась мысль — выделяете её и выбираете цвет. Выделение сохранилось.":"3. Like a thought — highlight it and pick a color. The highlight is saved.","4. (по желанию) Нажимаете ⓘ вверху и привязываете «заметку книги» — свою страницу для этой книги. Это можно сделать и потом.":"4. (optional) Press ⓘ at the top and link a \"book note\" — your page for this book. You can do this later too.","5. Нажимаете на выделение → «в заметку книги» — цитата улетает в эту страницу, и плагин предложит открыть её. Готово: все ваши цитаты в одном месте.":"5. Tap a highlight → \"to book note\" — the quote flies into that page, and the plugin offers to open it. Done: all your quotes in one place.","Готово — приятного чтения!":"All set — enjoy your reading!","Что настроить по желанию (не обязательно сразу): папку для книг и папку для заметок — в настройках плагина. Заметку книги — под значком ⓘ прямо во время чтения.":"What to set up if you like (not required right away): the books folder and the notes folder — in the plugin settings. The book note — under the ⓘ icon while reading.","Что можно вообще не трогать: прогресс и выделения работают сразу и сохраняются сами.":"What you can leave alone entirely: progress and highlights work right away and save themselves.","Полная справка по каждой кнопке — значок ⓘ в читалке. Этот экран приветствия можно снова открыть в настройках плагина.":"Full help for every button — the ⓘ icon in the reader. You can reopen this welcome screen in the plugin settings.","Нажмите «Начать читать» и откройте свою первую книгу 📖":"Press \"Start reading\" and open your first book 📖","‹ Назад":"‹ Back","Начать читать":"Start reading","Далее ›":"Next ›","Пропустить":"Skip","Загружаем книгу…":"Loading the book…","Ошибка при открытии файла":"Error opening the file","Сбросить таймер":"Reset timer","Таймер: сколько осталось до цели — старт/пауза":"Timer: time left to the goal — start/pause","Обновить (перерисовать вид)":"Refresh (redraw the view)","Оглавление":"Table of contents","Настройки чтения":"Reading settings","Создать новую заметку":"Create new note","Текстом в заметку книги":"As text into the book note","Нечего сохранять":"Nothing to save","Книга не открыта":"No book is open","Тема":"Theme","Тёмная":"Dark","Светлая":"Light","Сепия":"Sepia","Размер шрифта":"Font size","Шрифт":"Font","Межстрочный":"Line spacing","Страниц рядом":"Pages side by side","1 страница":"1 page","2 страницы":"2 pages","Вернуться к месту":"Jump back","Действия":"Actions","Точек пока нет":"No points yet","Недоступно":"Unavailable","Нечего обновлять":"Nothing to refresh","Обновлено":"Refreshed","Копировать текст":"Copy text","Скопировано ✓":"Copied ✓","Не удалось скопировать":"Could not copy","Остановился здесь":"Stopped here","Экспортировать в заметку книги":"Export to the book note","Выделение не найдено":"Highlight not found","Пока нет выделений.\nВыделите текст и выберите цвет.":"No highlights yet.\nSelect text and pick a color.","Удалить":"Delete","Закрыть":"Close","Библиотека":"Library","Поиск книги…":"Search a book…","Меньше обложки":"Smaller covers","Больше обложки":"Larger covers","Нет книг":"No books","Все папки vault":"All vault folders","книг":"books","книги":"books","книга":"book","Вид обложки":"Cover fit","Не читалась":"Not started","Ещё":"More","Перейти к странице":"Go to page","Перейти":"Go","Приветствие и инструкция":"Welcome and guide","Показать вводный экран с объяснением форматов, заметки книги, хранения данных и синхронизации.":"Show the intro screen explaining formats, the book note, data storage and syncing.","Открыть приветствие":"Open welcome","Папка с книгами":"Books folder","Пусто = весь vault":"Empty = the whole vault","Папка данных чтения":"Reading-data folder","Где хранятся прогресс чтения, выделения и резервные копии (reading-progress.json, reading-highlights.json). Пусто — рядом с книгами (в «Папке с книгами»). Файлы синхронизируются вместе с хранилищем.":"Where reading progress, highlights and rescue backups are kept (reading-progress.json, reading-highlights.json). Empty — next to the books (in the \"Books folder\"). The files sync along with the vault.","Рядом с книгами":"Next to the books","Заметки из выделений":"Notes from highlights","Шаблон заметки":"Note template","Путь к вашему шаблону (Templater), который применяется к новой заметке из выделения. Пусто — заметка создаётся без шаблона, только с цитатой. Пример: 0. Files/4. Templates/Шаблон стандартный.md":"Path to your (Templater) template applied to each new highlight note. Empty — the note is created without a template, with just the quote. Example: 0. Files/4. Templates/Default template.md","Папка для новых заметок":"Folder for new notes","Куда сохранять заметки, создаваемые из выделений. Пусто — корень хранилища.":"Where to save notes created from highlights. Empty — the vault root.","Папка заметок-книг (для ссылок)":"Book-notes folder (for links)","Из этой папки берётся список при выборе заметки книги, куда ведёт ссылка «— из [[…]]». Пусто — можно выбрать любую заметку хранилища.":"The list for choosing a book note (where the \"— from [[…]]\" link points) is taken from this folder. Empty — you can pick any note in the vault.","3. Resources/База книг":"3. Resources/Book base","Совет: шаблон можно переопределить для отдельной книги — откройте книгу, нажмите (i) вверху и укажите свой шаблон в поле «Шаблон для этой книги» (удобно, если у разных жанров разное оформление).":"Tip: the template can be overridden per book — open the book, press (i) at the top and set your template in the \"Template for this book\" field (handy if different genres need different formatting).","Сохранять цвет выделений при экспорте":"Keep highlight color on export","Каждая цитата оборачивается в цветной <mark> — цвет выделения виден в готовой заметке (в режиме чтения и live preview, без плагинов). Выключите, если хотите обычные цитаты без HTML.":"Each quote is wrapped in a colored <mark> — the highlight color shows in the finished note (in reading mode and live preview, no plugins needed). Turn it off if you want plain quotes without HTML.","Дублировать страницу картинкой, если есть текст":"Duplicate the page as an image when text exists","По умолчанию ВЫКЛ: если из страницы извлекается текст — показывается только чистый текст, без скриншота. Картинка показывается лишь когда текст извлечь нельзя (сканы, схемы, обложки). Включите, если хотите ВИДЕТЬ оригинальный рисунок страницы над текстом (например, для книг-скетчноутов). Откройте книгу заново, чтобы применить.":"OFF by default: if text can be extracted from the page, only the clean text is shown, without a screenshot. The image is shown only when text can't be extracted (scans, diagrams, covers). Turn it on if you want to SEE the original page image above the text (for example, for sketchnote books). Reopen the book to apply.","Листание страниц":"Page turning","«Кнопками» — стрелки/клавиши/свайп. «По клику» — клик по левой/правой части страницы листает назад/вперёд (центр свободен для выделения текста).":"\"Buttons\" — arrows/keys/swipe. \"By click\" — clicking the left/right part of the page turns back/forward (the center stays free for selecting text).","По клику мышкой":"By mouse click","Таймер цели чтения":"Reading-goal timer","Обратный отсчёт до дневной цели (например, 15 минут) — сколько ещё осталось прочитать. Запускается ВРУЧНУЮ кнопкой ▶ вверху читалки, рядом с «Сохранить» (пауза — ⏸).":"A countdown to your daily goal (for example, 15 minutes) — how much is left to read. Started MANUALLY with the ▶ button at the top of the reader, next to \"Save\" (pause — ⏸).","Цель на день, минут":"Daily goal, minutes","Погружение (Immersive)":"Immersive","Панели сверху и снизу мягко притухают через пару секунд без движения мыши и мгновенно возвращаются при движении — чтобы ничто не отвлекало от текста.":"The top and bottom bars gently dim after a couple of seconds without mouse movement and instantly return when you move — so nothing distracts from the text.","Кэш обложек":"Cover cache","Очистить":"Clear","Кэш очищен":"Cache cleared","Прогресс":"Progress","Прогресс очищен":"Progress cleared","Очистить все":"Clear all","Выделения очищены":"Highlights cleared","Синхронизация между устройствами":"Syncing across devices","Способ синхронизации":"Sync method","Подсказывает плагину, насколько свежо перечитывать файлы прогресса при открытии книги.":"Tells the plugin how eagerly to re-read the progress files when opening a book.","Авто (рекомендуется)":"Auto (recommended)","iCloud / Google Drive / папка":"iCloud / Google Drive / folder","Без синхронизации":"No syncing","Облачные папки (iCloud/Drive) обновляются с задержкой. Если на одном устройстве вы только читаете — конфликтов не будет: плагин перечитывает прогресс при каждом открытии книги и аккуратно сливает выделения.":"Cloud folders (iCloud/Drive) update with a delay. If you only read on one device there will be no conflicts: the plugin re-reads progress every time a book is opened and carefully merges highlights.","✓ Цель достигнута — {0} мин сегодня":"✓ Goal reached — {0} min today","⏱ {0} из {1} мин · {2}%":"⏱ {0} of {1} min · {2}%","{0} мин/день":"{0} min/day","Сегодня прочитано: {0} мин. Кнопка ▶ вверху запускает обратный отсчёт до цели (пауза — ⏸).":"Read today: {0} min. The ▶ button at the top starts the countdown to the goal (pause — ⏸).","\n\n— из [[{0}]]":"\n\n— from [[{0}]]","Выделения — {0}":"Highlights — {0}","---\ncreated: {0}\nsource: \"[[{1}]]\"\ntags: [выделения]\n---\n\n# {2}\n\n{3}\n\n— из [[{4}]]\n":"---\ncreated: {0}\nsource: \"[[{1}]]\"\ntags: [highlights]\n---\n\n# {2}\n\n{3}\n\n— from [[{4}]]\n","Экспортировано выделений: {0}":"Highlights exported: {0}","Создаю заметки: {0}…":"Creating notes: {0}…","Создано заметок: {0}, ошибок: {1}":"Notes created: {0}, errors: {1}","Создано заметок: {0}":"Notes created: {0}","Заметка книги не найдена: {0}":"Book note not found: {0}","Добавлено цитат в «{0}»: {1}":"Quotes added to \"{0}\": {1}","Открыть заметку «{0}» в отдельной вкладке?":"Open the note \"{0}\" in a separate tab?","Отдельная заметка на каждое ({0})":"A separate note for each ({0})","Текстом в заметку книги ({0})":"As text into the book note ({0})","Нет заметок в «{0}»":"No notes in \"{0}\"","Заметка книги: {0}":"Book note: {0}","Шаблон книги: {0}":"Book template: {0}","Экран {0}":"Screen {0}","Готовим книгу… {0}%":"Preparing the book… {0}%","Выделить: {0}":"Highlight: {0}","Сохранено ✓ — {0}%":"Saved ✓ — {0}%","Разворот {0} из {1}":"Spread {0} of {1}","Вернулись к {0}%":"Jumped back to {0}%","Закладка «остановился здесь» — {0}%":"\"Stopped here\" bookmark — {0}%","{0}<span>Экспортировать в заметки ({1})</span>":"{0}<span>Export to notes ({1})</span>","<p style=\"padding:40px;color:var(--er-muted);margin:auto;\">Ошибка: {0}</p>":"<p style=\"padding:40px;color:var(--er-muted);margin:auto;\">Error: {0}</p>","{0}<span>Справка</span>":"{0}<span>Help</span>","Сегодня прочитано: {0} мин.":"Read today: {0} min.","Сохранено: {0}":"Saved: {0}","Книг: {0}":"Books: {0}","Всего: {0}":"Total: {0}","Прогресс чтения и выделения хранятся <b>файлами прямо в хранилище</b>, рядом с книгами:":"Reading progress and highlights are stored <b>as files right in the vault</b>, next to the books:","Поэтому они переезжают между ПК и телефоном <b>любым</b> способом, которым вы синхронизируете само хранилище ":"So they travel between PC and phone by <b>any</b> means you use to sync the vault itself ","(Obsidian Sync, iCloud, Google Drive, Remotely Save и т.п.). Привязка к месту — по номеру абзаца, ":"(Obsidian Sync, iCloud, Google Drive, Remotely Save, etc.). The position is anchored by paragraph number, ","так что ПК и телефон находят одну и ту же точку при любом размере экрана.<br>":"so PC and phone find the same spot at any screen size.<br>","Настройки оформления и кэш обложек — локальные (в <code>data.json</code> плагина) и намеренно не синхронизируются.":"Appearance settings and the cover cache are local (in the plugin's <code>data.json</code>) and are intentionally not synced.","Добавить книгу":"Add a book","Отпустите файлы, чтобы добавить их в библиотеку":"Drop the files to add them to your library","Поддерживаются только файлы PDF, EPUB и FB2":"Only PDF, EPUB and FB2 files are supported","Файлы не выбраны":"No files selected","Добавлено книг: {0}":"Books added: {0}","пропущено: {0}":"skipped: {0}","Не удалось добавить: {0}":"Could not add: {0}","Абзацы в PDF сохраняются как в оригинале — текст больше не склеивается в сплошную стену":"PDF paragraphs are kept as in the original — the text no longer glues into one solid wall","Библиотека: кнопка «Добавить книгу» и перетаскивание файлов (PDF, EPUB, FB2) прямо в окно":"Library: an \"Add a book\" button and drag-and-drop of files (PDF, EPUB, FB2) straight into the window","PDF-движок встроен в плагин — книги открываются офлайн, ничего не подгружается из интернета":"The PDF engine is now bundled in — books open offline, nothing is fetched from the internet","В списке выделений комментарий больше не ломает цитату — он аккуратно встаёт под ней":"In the highlights list a comment no longer breaks the quote — it sits neatly underneath it"};
// New translations go HERE, not into the literal above: that one is a single
// generated line thousands of entries long, and anything added inside it is
// unreviewable and easy to lose. Same table, readable diff.
Object.assign(__erEN, {
  "Закрыть книгу": "Close the book",
  "Перерисовать книгу": "Re-flow the book",
  "Книга перерисована": "The book has been re-flowed",
  "Цитаты сразу в заметку книги": "Quotes straight into the book note",
  "Каждое новое выделение тут же дописывается в заметку этой книги — с главой, номером страницы и ссылкой обратно на место в тексте. Отдельные файлы на каждую цитату при этом не создаются. Заметка должна быть привязана к книге: либо настройкой выше, либо вручную через «⋯» → «Заметка книги». Выключено по умолчанию.":
    "Every new highlight is appended to this book's note as you make it — with the chapter, the page number and a link back to the spot in the text. No separate file per quote. The book needs a note linked to it: either by the setting above, or by hand through \"⋯\" → \"Book note\". Off by default.",
  "При первом открытии книги автоматически создаётся отдельная заметка с названием книги (в «Папке заметок-книг», иначе в «Папке для новых заметок») и привязывается к ней. Выключено по умолчанию. Куда попадают цитаты — отдельная настройка ниже.":
    "On a book's first open, a note named after the book is created (in the book-notes folder, else in the notes folder) and linked to it. Off by default. Where quotes go is a separate setting below.",
  "Куда кладутся ОТДЕЛЬНЫЕ заметки, которые вы создаёте из выделенного фрагмента («Создать заметку»). Одно выделение — один файл. Пусто — корень хранилища. Не путать с «Папкой заметок-книг» ниже: та отвечает за одну общую заметку на книгу.":
    "Where SEPARATE notes go — the ones you make from a passage with \"Create note\". One highlight, one file. Empty means the vault root. Not the same as the book-notes folder below, which holds one shared note per book.",
  "Где лежат заметки-КНИГИ — по одной на книгу, куда собираются все цитаты из неё. Из этой папки берётся список, когда вы привязываете заметку к книге, и она же используется при автосоздании. Пусто — можно выбрать любую заметку хранилища.":
    "Where BOOK notes live — one per book, collecting every quote from it. This folder fills the picker when you link a note to a book, and is where an automatically created one goes. Empty means any note in the vault can be picked.",
  "Куда попадают заметки": "Where notes go",
  "Цитаты и выделения": "Quotes and highlights",
  "Заметка книги": "The book note",
  "Текст на странице": "Text on the page",
  "Режимы": "Modes",
  "Оформление": "Appearance",
  "Как выглядит страница — во вкладке «Оформление». Шрифт, размер и межстрочный интервал настраиваются прямо в книге — иконка ползунков вверху читалки.":
    "How the page looks lives in the Appearance tab. Font, size and line height are set in the book itself — the sliders icon at the top of the reader.",
  "«Страницами» — текст разбит на развороты, листается как книга. «Прокруткой» — одна длинная колонка, которую листаешь пальцем или колесом, как сайт; многие так читают дольше, потому что текст не останавливается на краю страницы. В прокрутке место запоминается по абзацу у ВЕРХНЕГО края экрана, и надёжнее всего отметить его самому: «⋯» → «Сохранить позицию». Откройте книгу заново, чтобы применить.":
    "\"Pages\" splits the text into spreads you turn like a book. \"Scrolling\" is one long column you move with a finger or the wheel, like a web page; many people read for longer that way, because the text does not stop at the edge of a page. While scrolling, your place is remembered by the paragraph at the TOP edge of the screen — and the surest way is to mark it yourself: \"⋯\" → \"Save position\". Reopen the book to apply.",
  "Google ограничил частые переводы. Подождите минуту и попробуйте снова — это ограничение бесплатного Google Translate, а не вашего интернета.":
    "Google is rate-limiting translations. Wait a minute and try again — this is a limit of the free Google Translate, not of your connection.",
  "Переводчик ответил ошибкой {0}. Интернет при этом работает — попробуйте позже.":
    "The translator answered with error {0}. Your connection is fine — try again later.",
  "Не удалось связаться с переводчиком. Похоже, нет интернета.":
    "Could not reach the translator. It looks like there is no internet connection.",
  "Свой вид на каждом устройстве": "A separate look on each device",
  "Размер шрифта, тема, шрифт, интервал, число колонок и выравнивание запоминаются отдельно для компьютера, планшета и телефона. Настройки хранятся в одном файле и синхронизируются, но каждое устройство читает свою часть, поэтому крупный шрифт на телефоне больше не делает его огромным на компьютере. Папки, шаблоны и прогресс чтения остаются общими. Это устройство: {0}.":
    "Font size, theme, typeface, line spacing, column count and alignment are remembered separately for computer, tablet and phone. The settings live in one synced file, but each device reads its own part, so a large size on the phone no longer makes the text enormous on the computer. Folders, templates and reading progress stay shared. This device: {0}.",
  "Экспортировать в заметки ({0})": "Export to notes ({0})",
  "Показать в списке файлов": "Reveal in file explorer",
  "Готово": "Done",
  "Анимация листания": "Page-turn animation",
  "Страница плавно уезжает в сторону при перелистывании — по этому движению видно, что книга сдвинулась и в какую сторону. Не зависит от системной настройки «уменьшить анимацию»: та убирает украшения, а это обратная связь. Выключите, если предпочитаете мгновенное переключение.":
    "The page slides sideways as it turns — that movement is what shows the book moved, and which way. Independent of the system's \"reduce motion\" setting: that one drops decoration, this is feedback. Turn it off if you prefer pages to switch instantly.",
  "Открыть библиотеку в отдельном окне": "Open the library in a separate window",
  "Скопировать как цитату": "Copy as a quote",
  "Цитата скопирована ✓ — вставьте в любую заметку": "Quote copied ✓ — paste it into any note",
  ", стр. {0}": ", p. {0}",
  "Формат скопированной цитаты": "Shape of a copied quote",
  "Что попадает в буфер по кнопке «Скопировать как цитату». Доступны {text}, {book}, {page}, {link}, {comment}. Пусто — вид по умолчанию.": "What the \"Copy as a quote\" button puts on the clipboard. Available: {text}, {book}, {page}, {link}, {comment}. Empty means the default shape.",
  "Не подошли ({0}): {1}. Поддерживаются PDF, EPUB и FB2.":
    "Not accepted ({0}): {1}. PDF, EPUB and FB2 are supported.",
  "Папки пропущены — перетащите сами файлы книг ({0})":
    "Folders were skipped — drop the book files themselves ({0})",
  "Прогресс в свойствах заметки книги": "Progress in the book note's properties",
  "Дописывает в заметку книги свойства reading-progress (процент) и reading-updated (дата). Это те же цифры, что и в файле прогресса, — просто в виде, который понимают Bases: по ним можно строить таблицы и сортировать. Сама заметка больше ничем не трогается.":
    "Adds reading-progress (a percentage) and reading-updated (a date) to the book note's properties. Same numbers as the progress file, in a form Bases understands, so you can build tables and sort by them. Nothing else in the note is touched.",
  "Открыть PDF в читалке": "Open a PDF in the reader",
  "Язык интерфейса плагина. Откройте книгу заново, чтобы применить.":
    "The plugin's interface language. Reopen the book to apply.",
  "Комментарий хранится вместе с выделением и попадает в заметку при переносе. Очистите поле, чтобы удалить его.":
    "The comment is kept with the highlight and travels with it into your notes. Clear the field to remove it.",
  "Открывает список всех ваших выделений в этой книге. Клик по строке — переход к этому месту. У каждого выделения есть значок комментария — короткая мысль, которая остаётся при цитате. Сверху списка — кнопка экспорта в заметки.":
    "Opens every highlight you have made in this book. Click a row to jump to that spot. Each highlight has a comment icon — a short thought that stays with the quote. The export-to-notes button sits above the list.",
  "Оглавление книги: закладки PDF, заголовки, печатное содержание или жирные абзацы — что нашлось первым. У каждого пункта — номер страницы и текущий разворот. Много пунктов — сверху появится фильтр.":
    "The book's contents: PDF bookmarks, headings, the book's own printed contents page or bold paragraphs — whichever turns up first. Each entry shows a page number and the current spread. When there are many entries, a filter appears at the top.",
  "Кнопка вверху панели «Выделения». Откроется список, где можно отметить нужные фрагменты — по одному, «Выделить все» или «Только новые». То, что уже перенесено в заметку книги, помечено и снято с отметки, поэтому повторный экспорт ничего не задваивает. Дальше на выбор: вставить текстом в заметку книги или создать отдельную заметку на каждый фрагмент.":
    "The button at the top of the Highlights panel. It opens a list where you tick what you want — one by one, \"Select all\" or \"New only\". Anything already copied into the book note is marked and left unticked, so exporting again never duplicates it. Then choose: paste them as text into the book note, or make a separate note for each passage.",
  "Следующие экраны проходят по настройкам плагина: что делает каждая, что выбрать и что будет, если ничего не менять.":
    "The next few screens walk through the plugin's settings: what each one does, what to pick, and what happens if you change nothing.",
  "Открыть настройки: шестерёнка Obsidian → «Плагины сообщества» → Book Reader. Вверху пять вкладок: Чтение, Заметки, Перевод, Данные, О плагине.":
    "To open the settings: Obsidian's gear icon → Community plugins → Book Reader. There are five tabs at the top: Reading, Notes, Translation, Data and About.",
  "Ни одну из них не обязательно настраивать сразу — плагин работает и так. Этот разбор нужен, чтобы вы знали, что вообще можно поменять.":
    "None of this has to be set up now — the plugin works as it is. This tour is here so you know what can be changed at all.",
  "Вверху вкладки — карточка со статистикой: сколько прочитано за всё время, серия дней подряд, среднее за день, лучший день и график за две недели.":
    "At the top of the tab there is a stats card: your all-time reading total, your current day streak, the daily average, your best day and a two-week chart.",
  "Она заполняется сама, когда вы читаете с включённым таймером ▶ (кнопка вверху читалки). Настраивать нечего — просто смотрите.":
    "It fills itself in as you read with the timer running (the ▶ button at the top of the reader). Nothing to configure — just look at it.",
  "Пример: «12 ч 30 мин за всё время · 🔥 5 дн. подряд». Если таймер не включать, время не считается.":
    "For example: \"12 h 30 min all-time · 🔥 5-day streak\". If you never start the timer, no time is counted.",
  "«Кнопками» — листаете стрелками внизу, клавишами ← → ↑ ↓ и пробелом, на телефоне свайпом. Центр страницы свободен: выделять текст удобно.":
    "\"Buttons\" — turn pages with the arrows at the bottom, the ← → ↑ ↓ keys and space, or a swipe on a phone. The middle of the page stays free, so selecting text is easy.",
  "«По клику мышкой» — клик по левой половине страницы листает назад, по правой вперёд. Быстрее, но случайный клик может перелистнуть, когда вы хотели выделить фразу.":
    "\"By mouse click\" — clicking the left half of the page goes back, the right half forward. Faster, but a stray click can turn the page when you meant to select a phrase.",
  "Что выбрать: начните с «Кнопками». Переключите на «По клику», если читаете подряд и мало выделяете.":
    "What to pick: start with \"Buttons\". Switch to \"By click\" if you read straight through and highlight little.",
  "Выравнивание — как текст прижат в колонке: слева (рваный правый край, как в браузере), по ширине (ровные оба края, как в бумажной книге), по центру или справа.":
    "Alignment — how the text sits in the column: left (ragged right edge, as in a browser), justified (both edges even, as in a printed book), centred or right.",
  "Положение на странице — что делать, если страница заполнена не до конца, например в конце главы: оставить текст сверху, поставить по центру или прижать вниз.":
    "Position on the page — what to do when a page isn't full, at the end of a chapter for instance: leave the text at the top, centre it, or push it to the bottom.",
  "Что выбрать: «По ширине» + «Сверху» — самый привычный книжный вид. «По центру» имеет смысл, только если вас раздражают полупустые страницы в конце глав.":
    "What to pick: justified + top is the most book-like. Centring is only worth it if half-empty pages at the end of chapters bother you.",
  "Погружение: панели сверху и снизу мягко притухают через пару секунд без движения мыши и возвращаются при первом движении. Ничто не отвлекает от текста.":
    "Immersive: the top and bottom bars gently dim after a couple of seconds without mouse movement and come back the instant you move. Nothing distracts from the text.",
  "Цель на день: ползунок от 5 до 120 минут. Таймер ▶ вверху читалки запускается ВРУЧНУЮ и считает обратный отсчёт до цели, ⏸ ставит на паузу.":
    "Daily goal: a slider from 5 to 120 minutes. The ▶ timer at the top of the reader is started BY HAND and counts down to the goal; ⏸ pauses it.",
  "Важно: таймер не запускается сам. Если забыть нажать ▶, время чтения и статистика не наберутся.":
    "Note: the timer never starts on its own. Forget to press ▶ and neither your reading time nor the statistics will add up.",
  "Выделили фрагмент → «Создать заметку». Откроется окно с тремя полями: название (подставляется короткое, можно поправить или одной кнопкой взять фрагмент целиком), папка и теги.":
    "Highlight a passage → \"Create note\". A dialog opens with three fields: the title (a short one is suggested; edit it, or take the whole passage with one click), the folder and the tags.",
  "Папка выбирается из подсказки, теги — через запятую, с подсказкой из уже используемых в хранилище. И то и другое запоминается для следующей заметки, так что вводить каждый раз не нужно.":
    "The folder is picked from a suggestion list; tags are comma-separated and suggested from the ones already used in your vault. Both are remembered for the next note, so you don't retype them each time.",
  "Пример: выделили абзац про PEP 8 → название «Стиль кода PEP 8», папка «0. Files/5. Inbox», теги «python, стиль». Окно можно отключить в настройках → Заметки.":
    "For example: highlight a paragraph about PEP 8 → title \"PEP 8 code style\", folder \"0. Files/5. Inbox\", tags \"python, style\". The dialog can be turned off in Settings → Notes.",
  "Если Obsidian стоит на Android-читалке с электронными чернилами, включите «Режим для e-ink» в настройках → Чтение.":
    "If Obsidian is running on an Android e-ink reader, turn on \"E-ink reader mode\" in Settings → Reading.",
  "Он убирает всё, что на таком экране оставляет следы: анимации, плавные переходы, тени, размытие и полупрозрачность. Цвета — чистый чёрный на белом, рамки жёсткие, кнопки крупнее под палец.":
    "It removes everything that leaves ghosting on such a screen: animations, fades, shadows, blur and transparency. Colours become pure black on white, borders are hard, and buttons are bigger for a thumb.",
  "Отдельно в списке тем появляется «E-ink» — максимальный контраст без оттенков.":
    "An extra \"E-ink\" theme also appears in the theme list — maximum contrast, no tinting.",
  "«Папка для новых заметок» — куда попадают заметки, созданные из выделений. Пусто — в корень хранилища. Пример: 0. Files/5. Inbox":
    "\"Folder for new notes\" — where notes made from highlights are filed. Empty means the vault root. For example: 0. Files/5. Inbox",
  "«Папка заметок-книг» — откуда берётся список, когда вы выбираете заметку книги. Пусто — можно выбрать любую заметку хранилища. Пример: 3. Resources/База книг":
    "\"Book-notes folder\" — where the list comes from when you pick a book's note. Empty means you can choose any note in the vault. For example: 3. Resources/Book base",
  "Путь пишется от корня хранилища, через косую черту. Папку можно выбрать из подсказки — начните печатать, и появится список.":
    "Paths are written from the vault root, with forward slashes. You can pick a folder from the suggestions — start typing and a list appears.",
  "У каждой книги может быть своя заметка — в неё складываются цитаты и на неё ведут ссылки «— из [[…]]» из всех заметок по этой книге.":
    "Each book can have a note of its own — quotes are collected there, and the \"— from [[…]]\" links in every note about that book point to it.",
  "«Своя заметка на каждую книгу» — создавать её автоматически при первом открытии, не спрашивая. Иначе плагин спросит один раз сам.":
    "\"A separate note per book\" — create it automatically on a book's first open, without asking. Otherwise the plugin asks you once.",
  "«Шаблон заметки» — файл, по которому создаются заметки из выделений. Работает и с Templater, если он у вас стоит. Пусто — заметка будет просто с цитатой и ссылкой.":
    "\"Note template\" — the file new highlight notes are built from. Works with Templater too, if you have it. Empty means the note is just the quote and a link.",
  "Выключено по умолчанию. Если включить, у выделенного текста появится кнопка перевода — удобно для книг на английском.":
    "Off by default. Turn it on and a translate button appears on selected text — handy for books in another language.",
  "Это единственное место, где плагин выходит в интернет: выделенный фрагмент уходит в бесплатный переводчик Google. Больше никуда и ничего не отправляется.":
    "This is the only place the plugin reaches the internet: the selected passage goes to the free Google translator. Nothing else is sent anywhere.",
  "Язык перевода выбирается там же. Перевод можно сохранить в заметку под оригиналом.":
    "The target language is chosen in the same place. A translation can be saved into a note underneath the original.",
  "«Папка с книгами» — где плагин ищет книги для библиотеки. Пусто — ищет по всему хранилищу.":
    "\"Books folder\" — where the plugin looks for books to fill the library. Empty means it searches the whole vault.",
  "«Папка для данных» — где лежат файлы прогресса и выделений. Пусто — рядом с книгами. Эти файлы синхронизируются между устройствами, поэтому чтение продолжается с того же места на телефоне.":
    "\"Data folder\" — where the progress and highlight files live. Empty means next to the books. These files sync between devices, which is how reading carries on from the same spot on your phone.",
  "«Память о книгах» — кнопка «Забыть все книги» сбрасывает привязки заметок и категорий, но сами заметки не удаляет. Нужна, если хотите настроить всё заново.":
    "\"What the reader remembers\" — the \"Forget all books\" button clears the note links and categories without deleting any notes. Use it if you want to set everything up again from scratch.",
  "Кнопка экспорта вверху панели «Выделения» открывает список всех выделений книги с галочками.":
    "The export button at the top of the Highlights panel opens a tick-list of every highlight in the book.",
  "Можно отметить нужные по одному, нажать «Выделить все» или «Только новые». То, что уже перенесено в заметку книги, помечено и снято с отметки — повторный экспорт ничего не задваивает.":
    "Tick them one by one, or use \"Select all\" or \"New only\". Anything already in the book note is marked and left unticked — exporting again never duplicates it.",
  "Дальше на выбор: вставить текстом в заметку книги (всё в одном месте) или создать отдельную заметку на каждый фрагмент (для связей между заметками).":
    "Then choose: paste them as text into the book note (everything in one place), or create a separate note per passage (for linking between notes).",
  "Иллюстрации из PDF показываются прямо в тексте. Страницы-сканы рисуются целиком, а на обычных страницах вырезается сама картинка, а не скриншот всей страницы.":
    "Pictures from a PDF are shown right in the text. Scanned pages are drawn whole, while on ordinary pages the picture itself is cropped out rather than a screenshot of the entire page.",
  "Грузятся они по мере чтения и выгружаются, когда далеко — поэтому книга на 500 страниц с иллюстрациями не съедает память.":
    "They load as you read and are released once they are far behind, so a 500-page illustrated book doesn't eat your memory.",
  "Если картинки мешают и нужен только текст, их можно выключить: настройки → Чтение → «Показывать картинки из книги».":
    "If the pictures get in the way and you only want text, turn them off: Settings → Reading → \"Show pictures from the book\".",
  "В палитре команд (Ctrl+P) есть «Открыть книгу: …» на каждую вашу книгу — можно повесить горячую клавишу и открывать нужную книгу одним нажатием.":
    "The command palette (Ctrl+P) has an \"Open book: …\" entry for every book you have — assign a hotkey and a particular book is one keystroke away.",
  "Ещё есть «Продолжить чтение» — открывает последнюю книгу с того места, где вы остановились, и «Открыть книгу…» — список с поиском.":
    "There is also \"Continue reading\", which opens your last book where you left off, and \"Open a book…\", a searchable list.",
  "Горячая клавиша назначается в настройках Obsidian → «Горячие клавиши», поиск по слову Reader.":
    "Hotkeys are assigned in Obsidian's settings → Hotkeys; search for Reader.",
  "Новый формат: FB2 (в том числе старые файлы в кодировке windows-1251)":
    "New format: FB2, including older files in windows-1251 encoding",
  "Технические книги читаются нормально: код, таблицы и формулы больше не разваливаются":
    "Technical books read properly: code, tables and formulas no longer fall apart",
  "Листинги распознаются даже там, где в книге не указан шрифт кода":
    "Code listings are recognised even where the book declares no monospaced font",
  "Пояснения на полях больше не вклеиваются в строки кода":
    "Margin notes are no longer glued into the middle of code lines",
  "Страницы оглавления с точками отображаются как аккуратный список":
    "Contents pages with dot leaders come out as a tidy list",
  "Короткую страницу можно центрировать по вертикали, а не прижимать к верху":
    "A short page can be centred vertically instead of pinned to the top",
  "Оглавление берётся из самого PDF, а на компьютере оно наконец работает":
    "Contents are taken from the PDF itself, and on desktop it finally works",
  "Из PDF показываются сами иллюстрации, а не скриншот всей страницы":
    "PDFs show the illustrations themselves rather than a screenshot of the page",
  "Перевод выделенного фрагмента — включается в настройках":
    "Translation of a selected passage — switched on in the settings",
  "Библиотека: категории по жанрам и папкам, фильтр «читаю / прочитано»":
    "Library: categories by genre and folder, plus a reading / finished filter",
  "При первом открытии книги можно СОЗДАТЬ для неё заметку, а не только выбрать":
    "On a book's first open you can now CREATE its note, not only pick an existing one",
  "Настройки разложены по вкладкам, редкое убрано в «Доп. настройки»":
    "Settings are split across tabs, with the rarely used ones tucked away",
  "Текст сам перевёрстывается при открытии панелей и не теряет место":
    "The text re-flows by itself when panels open, without losing your place",
  "Исправлено: ввод пути в настройках создавал папку на каждый символ":
    "Fixed: typing a path in the settings created a folder per keystroke",
  "21 экран с объяснением: форматы, выделения, заметка книги, синхронизация, а затем разбор каждой настройки — что делает, что выбрать и что будет, если не трогать.":
    "21 screens of explanation: formats, highlights, the book note, syncing, and then a tour of every setting — what it does, what to pick, and what happens if you leave it alone.",
  "Как читать": "How to read",
  "Страницами": "In pages",
  "Прокруткой": "By scrolling",
  "«Страницами» — текст разбит на развороты, листается как книга. «Прокруткой» — одна длинная колонка, привычная по сайтам; многие так читают дольше, потому что текст не останавливается на краю страницы. Откройте книгу заново, чтобы применить.": "\"In pages\" splits the text into spreads you turn like a book. \"By scrolling\" is one long column, the way a web page reads; many people keep going for longer that way because the text never stops at a page edge. Reopen the book to apply.",
  "↪ к месту в книге": "↪ to this spot in the book",
  "Ссылка на место в книге под цитатой": "Link back to the book under each quote",
  "К каждой выгруженной цитате добавляется ссылка, которая открывает книгу ровно на том абзаце, откуда цитата взята. Работает из любой заметки.": "Every exported quote gets a link that opens the book at the exact paragraph the quote came from. Works from any note.",
  "Вернуться к тексту": "Back to the text",
  "Разобрать фрагмент": "Break this passage down",
  "Разговор о фрагменте": "Talking about the passage",
  "Не удалось подготовить чтение PDF. Переустановите плагин.": "Could not prepare PDF reading. Please reinstall the plugin.",
  "Закрыть": "Close",
  "Раскладываем страницы…": "Laying out the pages…",
  "Как в Obsidian": "Match Obsidian",
  "Сообщение…": "Message…",
  "О чём спросить?": "What would you like to ask?",
  "Спросите что угодно об этом фрагменте — или начните с разбора.":
    "Ask anything about this passage — or start with a breakdown.",
  "Разбери фрагмент": "Break this passage down",
  "Отправить": "Send",
  "Думаю…": "Thinking…",
  "Свой системный промпт": "Your own system prompt",
  "Что именно делать с фрагментом. Пусто — встроенный разбор: перевод, трудные слова, обороты, этимология. Свой текст заменяет его целиком — и для разбора, и для ваших вопросов в окне разбора.":
    "What exactly to do with the passage. Empty — the built-in breakdown: translation, hard words, phrasing, etymology. Your own text replaces it entirely, both for the breakdown and for the questions you type in the breakdown window.",
  "Например: объясни простыми словами и дай два примера из жизни.":
    "For example: explain it in plain words and give two examples from real life.",
  "Разбор фрагмента через ИИ": "AI passage breakdown",
  "Добавляет к выделению кнопку ✨: открывает разговор о выделенном куске. Одним тапом можно попросить разбор — перевод, трудные слова, обороты, этимология, — а можно просто спросить своими словами и продолжить расспрашивать. Сам ничего не спрашивает: фрагмент уходит на выбранный вами сервис только по вашему сообщению. Выключено, пока вы это не настроите.":
    "Adds a ✨ button to the selection popup: it opens a conversation about the passage. One tap asks for a breakdown — translation, hard words, phrasing, etymology — or you can simply ask in your own words and keep asking. It never asks on its own: the passage is sent to the service you choose only when you send a message. Off until you set that up.",
  "Куда обращаться за разбором": "Where breakdowns come from",
  "Сервис, ключ и модель. Локальная модель работает без ключа и не отправляет текст в интернет.":
    "Service, key and model. A local model needs no key and sends nothing to the internet.",
  "Сервис": "Service",
  "Ключ": "Key",
  "Хранится в настройках плагина, внутри вашего хранилища. Если хранилище синхронизируется, ключ едет вместе с ним — держите это в уме.":
    "Kept in the plugin's settings, inside your vault. If the vault syncs, the key travels with it — worth knowing.",
  "Модель": "Model",
  "Пусто — модель по умолчанию для этого сервиса: {0}": "Empty — this service's default model: {0}",
  "Отвечать на языке": "Answer in",
  "На каком языке писать разбор. Язык самой книги определяется сам.":
    "Which language to write the breakdown in. The book's own language is detected.",
  "русском": "English",
  "Локальная модель: текст никуда не уходит, но нужен запущенный Ollama или LM Studio на этом же компьютере.":
    "Local model: nothing leaves the device, but Ollama or LM Studio has to be running on this machine.",
  "Выделенный фрагмент отправляется на {0}. Всё остальное в читалке работает офлайн.":
    "The selected passage is sent to {0}. Everything else in the reader works offline.",
  "Не задан ключ. Откройте настройки плагина → «Разбор ИИ» и вставьте ключ выбранного сервиса.":
    "No key set. Open the plugin settings → AI breakdown and paste the key for your service.",
  "Сервис не принял ключ. Проверьте его в настройках плагина.":
    "The service rejected the key. Check it in the plugin settings.",
  "Сервис ограничил частые запросы. Подождите минуту и попробуйте снова.":
    "The service is rate-limiting. Wait a minute and try again.",
  "Локальная модель не отвечает. Проверьте, запущен ли Ollama или LM Studio.":
    "The local model is not answering. Check that Ollama or LM Studio is running.",
  "Пустой ответ от модели.": "The model returned nothing.",
  "Сервис ответил ошибкой {0}.": "The service answered with error {0}.",
  "Не удалось связаться с сервисом. Похоже, нет интернета.":
    "Could not reach the service. It looks like there is no internet connection.",
  "Копировать": "Copy",
  "Настроить": "Configure",
  "Оформление текста": "Text appearance",
  "Выравнивание, положение на странице, картинки, погружение, режим для e-ink и раздельные настройки вида для компьютера, планшета и телефона.":
    "Alignment, position on the page, pictures, immersive mode, e-ink mode, and a separate look for computer, tablet and phone.",
  "Сначала выделите фрагмент цветом": "Highlight a passage with a colour first",
  "Комментарий сохранён": "Comment saved",
  "Комментарий удалён": "Comment removed",
  "Изменить комментарий": "Edit comment",
  "Ваша мысль об этом фрагменте…": "Your thought about this passage…",
  "Сохранить": "Save",
  " *(стр. {0})*": " *(p. {0})*",
  "Ошибка: {0}": "Error: {0}",
  "Плагин стал легче почти на 4 МБ": "The plugin is nearly 4 MB lighter",
  "Ширина строки": "Line width",
  "Максимальная длина строки в символах. На широком мониторе строка во весь экран уходит за 150 символов, и глаз теряет начало следующей — привычный удобный диапазон 60–90. Лишняя ширина уходит в поля, разбивка книги на страницы от этого не меняется.":
    "Longest line, in characters. On a wide monitor a full-width line runs past 150 characters and the eye loses its place returning to the next one — the comfortable range is 60-90. The spare width becomes margin; how the book is split into pages does not change.",
  "Во всю ширину": "Full width",
  "Класть заметки рядом с книгой": "Keep notes next to the book",
  "Заметка из выделения создаётся в той же папке, где лежит книга, а не в общей папке заметок. Если вы выбрали папку вручную в окне создания, побеждает ваш выбор. Для книги в корне хранилища используется папка из настройки выше.":
    "A note made from a highlight is created in the same folder as the book, instead of the shared notes folder. If you picked a folder by hand in the create dialog, your choice wins. A book in the vault root falls back to the folder set above.",
  "Куда открывать новую заметку": "Where a new note opens",
  "«Рядом с книгой» делит окно пополам, чтобы книга осталась на виду. «В новой вкладке» открывает поверх — книга останется открытой, но уйдёт с экрана.":
    "\"Beside the book\" splits the pane so the book stays in view. \"In a new tab\" opens on top — the book stays open but leaves the screen.",
  "Рядом с книгой": "Beside the book",
  "В новой вкладке": "In a new tab",
  "Не открывать": "Don't open it",
  "Прогресс чтения и выделения хранятся ": "Reading progress and highlights are stored ",
  "файлами прямо в хранилище": "as files right in the vault",
  ", рядом с книгами:": ", next to the books:",
  "Поэтому они переезжают между ПК и телефоном ": "So they travel between PC and phone by ",
  "любым": "any",
  " способом, которым вы синхронизируете само хранилище (Obsidian Sync, iCloud, Google Drive, Remotely Save и т.п.). Привязка к месту — по номеру абзаца, так что ПК и телефон находят одну и ту же точку при любом размере экрана.":
    " means you use to sync the vault itself (Obsidian Sync, iCloud, Google Drive, Remotely Save and so on). The position is anchored by paragraph number, so PC and phone find the same spot at any screen size.",
  "Настройки оформления и кэш обложек — локальные (в ": "Appearance settings and the cover cache are local (in the plugin's ",
  " плагина) и намеренно не синхронизируются.": ") and are intentionally not synced.",
  " — версия {0}. Автор: Elton Labs.": " — version {0}. By Elton Labs.",
  "компьютер": "computer",
  "планшет": "tablet",
  "телефон": "phone",
});
// 3.1.0
Object.assign(__erEN, {
  "Подпись этой ссылки": "Wording of that link",
  "Текст, которым ссылка подписана в заметке. Пусто — стандартная подпись «{0}».":
    "The text the link is labelled with in the note. Empty means the standard «{0}».",
  "В заметку книги": "Into the book's note",
  "Дописать цитату в «{0}» вместо отдельной заметки":
    "Append the quote to «{0}» instead of making a separate note",
  "Отступ сверху на телефоне": "Top inset on mobile",
  "Обычно система сама сообщает высоту «шторки» с часами, и верхняя панель встаёт под ней. На части Android-оболочек (например, Samsung One UI) она этого не делает — панель заезжает под часы. Тогда впишите здесь высоту в пикселях, обычно 24–48. Ноль — доверять системе. Откройте книгу заново, чтобы применить.":
    "Normally the system reports the height of the status bar and the reader's top bar starts below it. Some Android skins (Samsung One UI, for one) do not, and the bar slides under the clock. Then type the height here in pixels, usually 24-48. Zero means trust the system. Reopen the book to apply.",
  "Сохранять «Что нового» заметкой": "Keep «What's new» as a note",
  "После обновления плагина в хранилище появляется заметка со списком изменений — рядом с остальными заметками читалки. Окно «Что нового» показывается один раз, а заметка остаётся.":
    "After the plugin updates, a note listing the changes appears in your vault, next to the reader's other notes. The «What's new» window shows once; the note stays.",
  "Book Reader {0} — что нового": "Book Reader {0} - what's new",
  "Книжная читалка обновилась до версии {0}. Что изменилось:":
    "Book Reader has been updated to {0}. Here is what changed:",
  "Список сохранён заметкой «{0}» — открыть": "Saved as the note «{0}» - open it",
  "Плагин снова открывается там, где раньше писал «Не удалось загрузить»: на Obsidian постарше, на планшетах Huawei и на части Windows-сборок":
    "The plugin loads again where it used to say «Failed to load»: older Obsidian builds, Huawei tablets and some Windows installs",
  "Цитаты можно складывать в одну заметку книги: в окне названия появилась кнопка «В заметку книги», а в меню выделения — «Текстом в заметку книги»":
    "Quotes can pile up in one book note: the title dialog now has an «Into the book's note» button, and the selection menu has «As text into the book's note»",
  "Подпись ссылки «↪ к месту в книге» теперь своя — задаётся в настройках":
    "The wording of the «↪ to this spot in the book» link is yours now - set it in the settings",
  "Клик по выделению в списке ведёт к месту в книге даже там, где страница ещё не отрисована":
    "Tapping a highlight in the list takes you to its place in the book even when that page has not been drawn yet",
  "Панель выделения больше не убегает на пустое место в начале абзаца и на границе страниц":
    "The selection bar no longer jumps to empty space at the start of a paragraph or across a page break",
  "Верхняя панель на Android больше не заезжает под часы; если оболочка телефона молчит о высоте шторки, отступ можно задать руками":
    "On Android the top bar no longer slides under the clock; if the phone's skin keeps the status-bar height to itself, the inset can be set by hand",
  "Что нового теперь сохраняется заметкой в хранилище — не нужно запоминать окно":
    "What's new is saved as a note in your vault, so there is nothing to memorise from a window",
});
// 3.1.1
Object.assign(__erEN, {
  "Обложки книг в библиотеке снова строятся: PDF рисовался в картинку через возможности браузера, которых в Obsidian ещё нет":
    "Book covers are built again: drawing a PDF to an image used browser features Obsidian does not have yet",
  "Это же чинит картинки и страницы-сканы внутри PDF — они рисуются тем же способом":
    "The same fix covers pictures and scanned pages inside a PDF, which are drawn the same way",
});
// 3.1.2
Object.assign(__erEN, {
  "PDF, у которых шрифт не приносит таблицу букв, больше не показываются кашей: текст восстанавливается и его снова можно выделять и искать":
    "PDFs whose font brings no character table are no longer shown as gibberish: the text is restored, and it can be selected and searched again",
  "Если восстановить текст нельзя — страница показывается картинкой, как в самом Obsidian, а не набором значков":
    "When the text cannot be restored, the page is shown as a picture, the way Obsidian itself shows it, instead of a row of odd symbols",
  "На iPhone и iPad снова открываются PDF — раньше вместо книги была ошибка про readableStream":
    "PDFs open again on iPhone and iPad, where the book used to be replaced by a readableStream error",
  "На Android подсветка зон нажатия больше не залипает на экране после тапа":
    "On Android the tap-zone tint no longer stays burned on the screen after a tap",
  "Ползунок прокрутки виден на светлых темах, а не только на тёмных":
    "The scrollbar is visible on light themes, not only on dark ones",
  "Переход по сноске в режиме «прокруткой» ведёт к сноске, а не в начало книги":
    "In scrolling mode a footnote link now leads to the footnote instead of the start of the book",
  "Заголовок главы над цитатами":
    "Chapter heading above quotes",
  "При выгрузке цитаты группируются по главе книги, и над группой пишется её название. Выключите, если главы короткие и совпадают почти у каждой цитаты.":
    "Exported quotes are grouped by the book's chapter, with the chapter name printed above the group. Turn off if chapters are short and keep coinciding on almost every quote.",
});

// 3.2.0
Object.assign(__erEN, {
  "Фиолетовый": "Purple",
  "Оранжевый": "Orange",
  "Медленнее": "Slower",
  "Быстрее": "Faster",
  "Остановить автопрокрутку": "Stop auto-scroll",
  "{0} пикс/с": "{0} px/s",
  "стр. каждые {0} с": "page every {0} s",
  "PDF: показывать текст": "PDF: show as text",
  "PDF: страницы как в оригинале": "PDF: original pages",
  "Книга снова показывается текстом": "The book is shown as text again",
  "Страницы показываются как в оригинале. Заметку со страницы — кнопкой в её углу.": "Pages are shown as in the original. To make a note from a page, use the button in its corner.",
  "Автопрокрутка: включить или остановить": "Auto-scroll: start or stop",
  "Продолжить выделение на следующей странице": "Continue the selection on the next page",
  "«{0}» собирается в «{1}» — изменить": "“{0}” goes to “{1}” — change",
  "Собирать «{0}» в свою заметку…": "Collect “{0}” in its own note…",
  "Удалить выделение": "Delete highlight",
  "Так будет выглядеть текст книги": "This is how the book's text will look",
  "Вид": "Look",
  "Страница": "Page",
  "Одна": "One",
  "Две": "Two",
  "Две страницы разворачиваются только на широком экране.": "Two pages side by side only on a wide screen.",
  "Как листать": "How to turn pages",
  "Страницы": "Pages",
  "Прокрутка": "Scrolling",
  "Авто": "Auto",
  "Сколько знаков помещается в строку. Короткая строка читается легче.": "How many characters fit on a line. A shorter line is easier to read.",
  "Удалить книгу?": "Delete the book?",
  "«{0}» будет удалена из хранилища вместе с прогрессом чтения и выделениями. Заметка книги останется на месте.": "“{0}” will be deleted from the vault along with its reading progress and highlights. The book's note stays where it is.",
  "Книга удалена: {0}": "Book deleted: {0}",
  "Не удалось удалить книгу": "Could not delete the book",
  "Цитата добавлена в «{0}»": "Quote added to “{0}”",
  "Выберите заметку или введите название новой…": "Pick a note or type the name of a new one…",
  "➕ Новая заметка «{0}»": "➕ New note “{0}”",
  "Цитаты цвета «{0}» из книги [[{1}]]": "“{0}” quotes from [[{1}]]",
  "«{0}» теперь собирается в «{1}»": "“{0}” is now collected in “{1}”",
  "перенесено: {0}": "moved: {0}",
  "Автопрокрутка": "Auto-scroll",
  "Не удалось открыть книгу.": "Could not open the book.",
  "Папка с книгами…": "Books folder…",
  "Показаны все PDF, EPUB и FB2 из хранилища ({0}). Выберите папку с книгами — библиотека станет быстрее, а лишние файлы пропадут.": "Showing every PDF, EPUB and FB2 in the vault ({0}). Pick your books folder — the library gets faster and stray files disappear.",
  "Выбрать папку": "Pick a folder",
  "Оставить все": "Keep all",
  "Закреплена": "Pinned",
  "Открепить": "Unpin",
  "Закрепить вверху": "Pin to the top",
  "Удалить книгу": "Delete book",
  "Действия с книгой": "Book actions",
  "Обычный режим (панели на месте)": "Normal mode (bars stay)",
  "Полноэкранное чтение": "Full-screen reading",
  "Шрифт и бумага": "Font and paper",
  "Свой шрифт: название": "Your own font: name",
  "Название любого шрифта, установленного на этом устройстве, — например «PT Serif» или «Literata». Появится в выборе шрифта в книге как отдельная кнопка.": "The name of any font installed on this device — e.g. “PT Serif” or “Literata”. It appears as its own button in the book's font choice.",
  "Свой шрифт: файл в хранилище": "Your own font: file in the vault",
  "Путь к файлу шрифта внутри хранилища (.ttf, .otf, .woff, .woff2). Работает и на телефоне: шрифт едет вместе с хранилищем. Если задан, важнее названия выше.": "Path to a font file inside the vault (.ttf, .otf, .woff, .woff2). Works on phones too: the font travels with the vault. When set, it wins over the name above.",
  "Шрифт книги": "Book font",
  "То же, что кнопки шрифта в самой книге.": "The same as the font buttons in the book itself.",
  "Отступ первой строки": "First-line indent",
  "Красная строка у каждого абзаца, как в бумажной книге: глазу проще найти начало абзаца.": "An indent at the start of every paragraph, as in a printed book: the eye finds where a paragraph begins more easily.",
  "Без отступа": "No indent",
  "Подложка страницы": "Page background",
  "Фон под текстом: цвет темы, лёгкая фактура бумаги или своя картинка из хранилища.": "What lies under the text: the theme colour, a light paper grain, or your own picture from the vault.",
  "Цвет темы": "Theme colour",
  "Фактура бумаги": "Paper grain",
  "Своя картинка": "Your own picture",
  "Картинка подложки": "Background picture",
  "Путь к картинке в хранилище, например «Files/paper.jpg».": "Path to the picture in the vault, e.g. “Files/paper.jpg”.",
  "Как класть картинку": "How to lay the picture",
  "Растянуть на страницу": "Stretch over the page",
  "Плиткой": "Tile",
  "Открывать книгу снова после перезапуска": "Reopen the book after a restart",
  "Если приложение закрылось, когда книга была открыта, при следующем запуске она откроется на том же месте. Закрытая книга не открывается.": "If the app was closed while a book was open, the next start opens it again at the same place. A book you closed stays closed.",
  "Обычно система сама сообщает высоту «шторки» с часами, и верхняя панель встаёт под ней. На части Android-оболочек (например, Samsung One UI) она этого не делает — панель заезжает под часы. Тогда впишите здесь высоту в пикселях, обычно 24–48. Ноль — доверять системе.": "Normally the system reports the height of the status bar and the top bar sits below it. Some Android skins (Samsung One UI, for example) do not, and the bar slides under the clock. Then enter the height in pixels here, usually 24–48. Zero trusts the system.",
  "Кнопка комментария у выделения": "Comment button on the highlight bar",
  "Значок комментария прямо в панели, которая появляется над выделенным текстом, — без захода в меню «⋯». Выключите, если не пишете комментарии и кнопка мешает.": "A comment button right in the bar that appears over selected text — no trip into the “⋯” menu. Turn off if you do not write comments and the button gets in the way.",
  "Ежедневная резервная копия": "Daily backup",
  "Раз в день читалка копирует прогресс и выделения в папку _reader-rescue рядом с данными чтения и хранит последние 7 дней. Выключите, если хранилище и так копируется (Syncthing, Git, облако).": "Once a day the reader copies progress and highlights into the _reader-rescue folder next to the reading data and keeps the last 7 days. Turn off if your vault is backed up anyway (Syncthing, Git, cloud).",
  "Изменить комментарий": "Edit comment",
});

// 3.2.0 — what's new
Object.assign(__erEN, {
  "Телефон: выделение больше не «убегает» до конца книги и не прыгает на последнюю страницу — оно держится в пределах страницы, а цитату через границу страницы продолжает кнопка «›»": "Phone: a selection no longer runs to the end of the book or jumps to the last page — it stays on the page, and the “›” button carries a quote over the page edge",
  "Цитата из нескольких абзацев — одна цитата: в списке, при экспорте и в заметке абзацы сохраняются": "A quote over several paragraphs is one quote: in the list, in export and in the note, with its paragraphs kept",
  "Android: PDF снова открываются на телефонах со старым движком WebView, строятся обложки PDF": "Android: PDFs open again on phones with an older WebView, and PDF covers are built",
  "Телефон: верхняя панель встаёт под часы на Samsung и других оболочках; ручной отступ сверху применяется сразу": "Phone: the top bar sits below the clock on Samsung and other skins; the manual top inset applies at once",
  "Убрать отметку «остановился здесь»": "Remove the “stopped here” mark",
  "Текст": "Text",
  "Две — только на широком экране.": "Two only on a wide screen.",
  "Знаков в строке. Короткая строка читается легче.": "Characters per line. A short line is easier to read.",
  "Точки сохраняются сами по ходу чтения; 💾 — те, что вы отметили сами.": "Points are saved as you read; 💾 marks the ones you saved yourself.",
  "Все настройки плагина": "All plugin settings",
  "Настройки чтения разложены по вкладкам «Текст», «Страница», «Чтение», «Книга» — без прокрутки": "Reading settings are split into tabs — Text, Page, Reading, Book — no scrolling",
  "«Остановился здесь» подсвечивает место в тексте; на компьютере панель и выделение не пропадают, пока открыто меню «⋯»": "“Stopped here” marks the passage in the text; on a computer the bar and the selection stay while the “⋯” menu is open",
  "Телефон: книга из списка файлов открывается окном читалки, а после перезапуска Obsidian возвращается сама; поиск по книге и ссылки «к месту в книге» работают": "Phone: a book opened from the file list opens in the reader window and comes back after a restart; search and “to the place in the book” links work",
  "Полноэкранное чтение на телефоне: панели прячутся, тап по центру страницы их показывает": "Full-screen reading on the phone: the bars hide, a tap in the middle of the page brings them back",
  "На телефоне в панели выделения снова есть цвета, а цветов теперь шесть; рядом кнопка комментария": "On the phone the highlight bar has the colours again, and there are six of them now; a comment button sits next to them",
  "Выделение с комментарием помечено в тексте; нажатие показывает комментарий и даёт его изменить": "A highlight with a comment is marked in the text; tapping it shows the comment and lets you edit it",
  "Свой цвет — своя заметка: например, всё жёлтое собирается в «Размышления», зелёное — в «Применение»": "A colour can have its own note: everything yellow goes to “Reflections”, green to “To try”",
  "Новый цвет или комментарий у выделения обновляет цитату и в заметке книги": "A new colour or comment on a highlight updates the quote in the book note too",
  "EPUB: картинки, обложки, сноски и ссылки внутри книги, оглавление из самой книги": "EPUB: pictures, covers, footnotes and links inside the book, contents taken from the book itself",
  "FB2 с «неидеальной» разметкой открываются, ссылки на вложенные разделы работают": "FB2 files with imperfect markup open, links to nested sections work",
  "PDF: режим «страницы как в оригинале» для формул, схем и сложной вёрстки; колонтитулы и номера страниц больше не мешают тексту; нумерованные заголовки попадают в оглавление": "PDF: an “original pages” mode for formulas, diagrams and complex layouts; running heads and page numbers no longer get in the way; numbered headings reach the contents",
  "Свои шрифты (по названию или файлом из хранилища), шрифт Obsidian, красная строка, фактура бумаги или своя картинка под текстом": "Your own fonts (by name or as a file in the vault), the Obsidian font, first-line indent, paper grain or your own picture under the text",
  "Автопрокрутка, стрелки и j/k в режиме прокрутки": "Auto-scroll, arrow keys and j/k in scrolling mode",
  "Библиотека: закрепить книгу вверху, обложки строятся по мере прокрутки, подсказка выбрать папку с книгами, без мигания обложек на Mac": "Library: pin a book to the top, covers are built as you scroll, a hint to pick your books folder, no cover flicker on Macs",
  "Переименованная или перенесённая книга сохраняет прогресс, выделения и ссылки": "A renamed or moved book keeps its progress, highlights and links",
  "Резервные копии хранятся неделю и выключаются; заметка «Что нового» больше не создаётся сама": "Backups are kept for a week and can be turned off; the “What's new” note is no longer created on its own",
  "Безопасность: книга больше не может выполнить свой код через разметку": "Security: a book can no longer run its own code through its markup"
});

// 3.2.0 (2)
Object.assign(__erEN, {
  "Открыть библиотеку в правой панели": "Open the library in the right sidebar",
  "Это приветствие можно открыть снова в любой момент: Настройки → Book Reader → «О плагине» или команда «Показать приветствие».": "You can open this welcome again at any time: Settings → Book Reader → “About”, or the “Show the welcome” command.",
  "Все книги хранилища с обложками. Ещё её открывает значок книги на боковой панели (на телефоне — в меню слева) и команда «Открыть библиотеку».": "Every book in the vault, with covers. It also opens from the book icon in the sidebar (on a phone — in the left menu) and from the “Open library” command.",
  "Главы с новой страницы": "Chapters start on a new page",
  "В EPUB каждая глава и обложка начинаются с чистой страницы, как в бумажной книге. Выключите, чтобы текст шёл без разрывов.": "In EPUB every chapter and the cover start on a fresh page, as in a printed book. Turn off for continuous text."
});
// Module-scope, not a global. It was on globalThis/window, which the popout
// guidance rightly flags — but the honest fix is that a module's own setting
// has no business on the window object at all. One value, one place.
// Simplified Chinese. The base of it comes from wisonic's fork (MIT,
// github.com/wisonic/elton-reader); the rest was translated for 4.0. A string
// not in it falls back to English, never to Russian.
const __erZH = {"Пункт «В словарь» в меню выделения: слово с переводом (или с предложением из книги) становится карточкой для повторения.":"在选区菜单中加入“加入词汇”：单词连同译文（或书中的原句）成为复习卡片。","Куда класть карточки":"卡片保存位置","Авто — в FSRS, если он есть в хранилище, иначе в заметку-словарь для Spaced Repetition.":"自动：仓库中有 FSRS 时存入 FSRS，否则存入供 Spaced Repetition 使用的词汇笔记。","Заметка-словарь (Spaced Repetition)":"词汇笔记（Spaced Repetition）","FSRS":"FSRS","Пусто — «Словарь» в корне хранилища.":"留空则为仓库根目录中的“词汇”。","файл FSRS не найден":"未找到 FSRS 文件","блок данных FSRS повреждён — откройте FSRS, он его починит":"FSRS 数据块已损坏，请打开 FSRS 进行修复","Уже в FSRS: {0}":"已在 FSRS 中：{0}","В FSRS: {0}":"已加入 FSRS：{0}","Уже в словаре: {0}":"已在词汇中：{0}","Жёлтый":"黄色","Зелёный":"绿色","Голубой":"蓝色","Розовый":"粉色","Цель чтения на сегодня достигнута 🎉":"今日阅读目标已达成 🎉","Таймер выключен — включите его в настройках чтения":"计时器已关闭，请在阅读设置中启用","Таймер сброшен":"计时器已重置","Перейти к странице":"跳转到页面","Заметка книги для ссылок":"用于链接的书籍笔记","Куда вести ссылку «— из [[…]]» в заметках из выделений. Пусто — имя файла книги.":"设置从高亮笔记返回书籍的链接名称。留空则使用书籍文件名。","Сначала откройте книгу…":"请先打开一本书…","+ Создать новую":"+ 新建笔记","Заметка книги создана: {0}":"书籍笔记已创建：{0}","Выбрать из списка…":"从列表中选择…","В хранилище нет заметок":"仓库中没有笔记","Категория":"分类","Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Пусто — без категории.":"设置书籍的类型或主题，书库会据此分类。多个类别请用逗号分隔；留空则不分类。","Например: Психология, Бизнес":"例如：心理学、商业","Шаблон для этой книги":"此书籍的模板","Свой шаблон только для этой книги (например, под жанр). Пусто — используется общий шаблон из настроек плагина.":"为这本书单独指定模板（例如按类型设置）。留空则使用插件设置中的通用模板。","Templates/Шаблон.md":"Templates/模板.md","Забыть настройки этой книги":"清除此书籍的设置","Настройки книги сброшены — окно появится при следующем открытии":"书籍设置已清除，下次打开时会重新显示设置窗口","Листание":"翻页","Кнопками":"按钮","По клику":"点击翻页","«По клику»: клик по левой части страницы — назад, по правой — вперёд. Центр свободен для выделения текста.":"点击页面左侧向前翻页、右侧向后翻页；页面中央可用于选择文字。","Выравнивание текста":"文本对齐","Слева":"左对齐","По ширине":"两端对齐","По центру":"居中","Справа":"右对齐","Положение на странице":"页面中的文字位置","Сверху":"顶部","Снизу":"底部","Цель чтения":"阅读目标","Вкл":"开","Выкл":"关","{0} мин/день":"每天 {0} 分钟","Сегодня прочитано: {0} мин. Всего за всё время: {1}. Кнопка ▶ вверху запускает обратный отсчёт до цели (пауза — ⏸).":"今日已阅读 {0} 分钟，累计阅读 {1}。点击顶部 ▶ 开始每日目标倒计时，点击 ⏸ 暂停。","Тап по картинке — увеличить · фон или ✕ — закрыть":"点击图片放大；点击背景或 ✕ 关闭","Book Reader — Библиотека":"Book Reader — 书库","Открыть библиотеку":"打开书库","Поиск по книге":"搜索本书","Сохранить позицию чтения":"添加书签","Экспортировать выделения в заметки":"将高亮导出到笔记","Показать приветствие (онбординг)":"显示欢迎引导","Продолжить чтение (последняя книга)":"继续阅读（上次打开的书）","Открыть книгу…":"打开书籍…","Книга не найдена: {0}":"找不到书籍：{0}","Открыть книгу: {0}":"打开书籍：{0}","Не удалось создать заметку":"创建笔记失败","Перевод":"翻译","Оригинал":"原文","Переводим…":"正在翻译…","Пустой ответ переводчика":"翻译服务未返回内容","Копировать перевод":"复制译文","Скопировано ✓":"已复制 ✓","Не удалось скопировать":"复制失败","В заметку":"添加到笔记","Заметка создана: {0}":"笔记已创建：{0}","Не удалось сохранить комментарий":"保存批注失败","Комментарий к выделению":"选区批注","Копировать текст":"复制文本","Создать заметку":"创建笔记","Ещё":"更多","Текстом в заметку книги":"添加到书籍笔记","Выделить: {0}":"高亮：{0}","Скопировать как цитату":"复制为引文","Остановился здесь":"在此处添加书签","Перевести":"翻译","Экспортировать в заметку книги":"导出到书籍笔记","Что найти в книге…":"在书中查找…","Снять подсветку":"取消标记","Введите хотя бы два символа":"请至少输入两个字符","Ничего не найдено":"没有找到匹配项","Найдено: {0}. Слово подсвечено в тексте.":"找到 {0} 处，已在正文中标出。","разв. {0}":"第 {0} 跨页","Содержание":"目录","В этой книге не нашлось ни оглавления, ни заголовков.":"这本书没有可用的目录或章节标题。","Фильтр по названию…":"按标题筛选…","стр. {0}":"第 {0} 页","Эта страница слишком тяжёлая, чтобы нарисовать её":"页面内容过于复杂，无法渲染","Заметка с этой страницы":"此页的笔记","Изменить комментарий":"编辑批注","Какую книгу открыть?":"要打开哪本书？","Заметка":"笔记","Настройки чтения":"阅读设置","Страница":"单页","Чтение":"阅读","Книга":"书籍","Так будет выглядеть текст книги":"书籍正文预览","Тема":"主题","Как в Obsidian":"跟随 Obsidian","Светлая":"浅色","Тёмная":"深色","Размер шрифта":"字体大小","Шрифт":"字体","Межстрочный":"行距","Страниц рядом":"并排页面","Одна":"单页","Две":"双页","Как листать":"翻页方式","Страницы":"分页","Прокрутка":"滚动","Ширина строки":"行宽","Авто":"自动","Вернуться к месту":"返回阅读位置","Справка":"说明","Ваша мысль об этом фрагменте…":"写下你对这段文字的想法…","Комментарий хранится вместе с выделением и попадает в заметку при переносе. Очистите поле, чтобы удалить его.":"批注会与高亮一起保存，导出时也会写入笔记。清空输入框即可删除批注。","Сохранить":"保存","Отмена":"取消","Новая заметка из выделения":"根据选区新建笔记","Название":"名称","Папка":"文件夹","Корень хранилища":"仓库根目录","Теги":"标签","Например: идеи, психология":"例如：灵感、心理学","Папка и теги запомнятся для следующей заметки. Сам фрагмент попадёт в текст целиком — название на это не влияет.":"文件夹和标签会记住并用于下一条笔记。选中的整段文字都会写入笔记，标题不会影响正文。","В заметку книги":"添加到书籍笔记","Пустое выделение":"选区为空","↪ к месту в книге":"↪ 返回书中位置","Нет выделений для экспорта":"没有可导出的高亮","Нет":"否","Да":"是","Перейти":"跳转","Цитаты добавлены":"引文已添加","Открыть заметку «{0}» в отдельной вкладке?":"要在新标签页中打开笔记“{0}”吗？","Да, открыть":"是，打开","Не удалось добавить цитаты в заметку книги":"无法将引文添加到书籍笔记","Выделить все":"全选","Снять все":"取消全选","Только новые":"仅新内容","уже в заметке":"已在笔记中","Отмечено: {0} из {1}":"已选 {0}/{1}","Отдельными заметками":"分别创建笔记","Как пользоваться Book Reader":"Book Reader 使用指南","Что делает каждая кнопка и зачем":"各个按钮的作用","Верхняя панель":"顶部工具栏","Сохранить позицию":"添加书签","Обновить":"刷新","Поиск":"搜索","Выделения":"高亮","Настройки":"设置","Это окно.":"此窗口。","Чтение и навигация":"阅读与导航","Листать страницы":"翻页","Выделения и заметки":"高亮与笔记","Выделить текст":"选中文本","Создать заметку из выделения":"根据选区创建笔记","Про автосохранение":"关于自动保存","Добро пожаловать в Book Reader!":"欢迎使用 Book Reader！","Режим для e-ink читалок":"电子墨水屏模式","Сохраняется по кнопке или Ctrl+Enter. Если очистить поле — комментарий удаляется, сама цитата остаётся.":"点击按钮或按 Ctrl+Enter 保存。清空输入框会删除批注，但保留引文。","Оглавление: откуда оно берётся":"目录来源","Что нового":"更新内容","Book Reader обновлён до {0}":"Book Reader 已更新至 {0}","Понятно":"知道了","Поиск заметки…":"搜索笔记…","Создать заметку…":"创建笔记…","Читать без заметки":"不创建笔记，直接阅读","← Назад":"← 返回","Название заметки":"笔记名称","Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Можно оставить пустым.":"设置书籍的类型或主题，书库会据此分类。多个类别请用逗号分隔；也可以留空。","Создать и начать читать":"创建并开始阅读","‹ Назад":"‹ 上一步","Начать читать":"开始阅读","Далее ›":"下一步 ›","Пропустить":"跳过","Загружаем книгу…":"正在加载书籍…","Ошибка при открытии файла":"打开文件时出错","Сбросить таймер":"重置计时器","Обновить (перерисовать вид)":"刷新（重新绘制界面）","Оглавление":"目录","Создать новую заметку":"创建新笔记","Нечего сохранять":"没有可保存的内容","Книга не открыта":"未打开书籍","Сепия":"复古色","Доп. настройки":"更多设置","1 страница":"单页","2 страницы":"双页","Действия":"操作","Точек пока нет":"暂时没有书签","Нечего обновлять":"没有可刷新的内容","Обновлено":"已刷新","Выделение не найдено":"找不到选区","Экспортировать все выделения":"导出全部高亮","Все":"全部","Читаю":"在读","Не начатые":"未开始","Прочитано":"已读完","Без папки":"未分类","Библиотека":"书库","Добавить книгу":"添加书籍","Поиск книги…":"搜索书籍…","Нет книг":"暂无书籍","Все папки vault":"仓库中的所有文件夹","книг":"本书","книги":"本书","книга":"本书","Отпустите файлы, чтобы добавить их в библиотеку":"松开文件即可将其添加到书库","Файлы не выбраны":"未选择文件","Добавлено книг: {0}":"已添加书籍：{0}","пропущено: {0}":"已跳过：{0}","Не удалось добавить: {0}":"添加失败：{0}","Не читалась":"尚未阅读","Готово":"完成","Настроить":"设置","Вид":"显示","Заметки":"笔记","Данные":"数据","О плагине":"关于插件","Откройте книгу и включите таймер ▶ — здесь появится история чтения.":"打开书籍并启动 ▶ 计时器，阅读记录将显示在这里。","за всё время с книгами":"累计阅读","{0} дн. подряд":"连续 {0} 天","сегодня":"今天","дней с книгой":"阅读天数","в среднем за день":"日均阅读","лучший день":"最长阅读","14 дней назад":"14 天前","Как читать":"阅读方式","Страницами":"分页","Прокруткой":"滚动","Листание страниц":"翻页方式","По клику мышкой":"点击页面","Таймер цели чтения":"阅读目标计时器","Цель на день, минут":"每日阅读目标（分钟）","Во всю ширину":"占满整行","Анимация листания":"翻页动画","Погружение (Immersive)":"沉浸模式","Отступ сверху на телефоне":"手机顶部偏移","Положение текста на странице":"页面文字位置","Свой вид на каждом устройстве":"为每台设备单独设置外观","Папка для новых заметок":"新建笔记文件夹","Шаблон заметки":"笔记模板","Своя заметка на каждую книгу":"为每本书创建专属笔记","Это первая версия функции — проверьте результат на паре книг. Заметка создаётся один раз при первом открытии книги.":"此功能为首个版本，建议先在几本书上确认效果。每本书只会在首次打开时创建笔记。","Цитаты сразу в заметку книги":"将引文直接添加到书籍笔记","Папка заметок-книг (для ссылок)":"书籍笔记文件夹","3. Resources/База книг":"3. Resources/书籍库","Класть заметки рядом с книгой":"将笔记保存到书籍旁","Куда открывать новую заметку":"新笔记打开方式","Рядом с книгой":"书籍旁边","В новой вкладке":"新标签页","Не открывать":"不打开","Спрашивать название заметки":"询问笔记标题","Короткие названия без вопросов":"自动生成简短标题","Цвет выделения по умолчанию":"默认高亮颜色","Формат скопированной цитаты":"复制引文格式","Ссылка на место в книге под цитатой":"在引文下添加书中位置链接","Подпись этой ссылки":"链接文字","Заголовок главы над цитатами":"在引文上方显示章节标题","Сохранять цвет выделений при экспорте":"导出时保留高亮颜色","Прогресс в свойствах заметки книги":"将阅读进度写入书籍笔记属性","Сохранять «Что нового» заметкой":"将“更新内容”保存为笔记","Разбор фрагмента через ИИ":"使用 AI 分析选区","Сервис":"服务","Ключ":"密钥","Кнопка перевода в выделении":"选区翻译按钮","Это первая версия функции. Перевод идёт через бесплатный Google Translate: нужен интернет, есть лимиты на частые запросы, а выделенный фрагмент уходит на серверы Google. Для больших объёмов пока не рассчитано.":"此功能为首个版本，使用免费的 Google 翻译服务，需要联网且频繁请求会受限。选中的文本会发送到 Google 服务器，目前不适用于大量翻译。","Переводить на язык":"翻译目标语言","Русский":"俄语","Модель":"模型","Пусто — модель по умолчанию для этого сервиса: {0}":"留空则使用此服务的默认模型：{0}","Свой системный промпт":"自定义系统提示词","Например: объясни простыми словами и дай два примера из жизни.":"例如：用简单的语言解释，并举两个生活中的例子。","Отвечать на языке":"回复语言","Папка с книгами":"书籍文件夹","Папка данных чтения":"阅读数据文件夹","Рядом с книгами":"书籍旁边","Способ синхронизации":"同步方式","Авто (рекомендуется)":"自动（推荐）","iCloud / Google Drive / папка":"iCloud / Google Drive / 文件夹","Без синхронизации":"不同步","Очистить":"清除","Кэш обложек":"封面缓存","Сохранено: {0}":"已保存：{0}","Кэш очищен":"缓存已清除","Прогресс":"阅读进度","Книг: {0}":"{0} 本书","Прогресс очищен":"阅读进度已清除","Всего: {0}":"共 {0} 项","Очистить все":"全部清除","Выделения очищены":"高亮已清除","Память о книгах":"书籍关联记录","Забыть все книги":"清除所有书籍记录","Точно забыть?":"确定清除？","Готово — читалка снова спросит про заметку при открытии книги":"完成。下次打开书籍时，阅读器会再次询问是否创建笔记。","Пожелания и ошибки":"反馈与问题","Написать в бота":"联系机器人","Инструкция по плагину":"插件使用指南","Открыть инструкцию":"打开指南","Показать":"显示","Фиолетовый":"紫色","Оранжевый":"橙色","меньше минуты":"少于一分钟","{0} мин":"{0} 分钟","{0} ч {1} мин":"{0} 小时 {1} 分钟","{0} ч":"{0} 小时","{0} д {1} ч":"{0} 天 {1} 小时","{0} д":"{0} 天","✓ Цель достигнута — {0} мин сегодня":"✓ 已达成目标 — 今日 {0} 分钟","⏱ {0} из {1} мин · {2}%":"⏱ {0}/{1} 分钟 · {2}%","Ключ Elton AI не подошёл":"Elton AI 密钥无效","Озвучить: выделенное или с этой страницы":"朗读:选中内容或从当前页开始","Скорость озвучки":"朗读速度","Остановить озвучку":"停止朗读","Готовлю озвучку…":"正在准备朗读…","Загружаю продолжение…":"正在加载后续内容…","Ещё пара секунд…":"再等几秒…","Для озвучки нужен ключ Elton AI: Настройки → Функции → «ИИ, голос и перевод».":"朗读功能需要 Elton AI 密钥：设置 → 功能 → “AI、语音和翻译”。","{0} пикс/с":"{0} 像素/秒","стр. каждые {0} с":"每 {0} 秒翻页","PDF: показывать текст":"PDF: 显示为文本","PDF: страницы как в оригинале":"PDF: 原始页面","Книга снова показывается текстом":"书籍再次显示为文本","Не удалось подготовить чтение PDF. Переустановите плагин.":"无法准备 PDF 阅读。请重新安装插件。","Elton Reader: could not register .pdf, use right-click → Открыть в Elton Reader":"Elton Reader: 无法注册 .pdf,请使用右键 → Open in Elton Reader","Открыть библиотеку в правой панели":"在右侧边栏打开库","Открыть библиотеку в отдельном окне":"在单独窗口打开库","Открыть PDF в читалке":"在阅读器中打开 PDF","Строки заполняют страницу до конца — больше нет пустых мест внизу колонки":"文本行填充至页面底部——列底不再留空白","Перестроение при сворачивании панелей стало плавным, а не рывком":"侧边栏打开或关闭时重新布局现在平滑过渡而非跳动","Новый формат: FB2 (в том числе старые файлы в кодировке windows-1251)":"新格式:FB2,包括 windows-1251 编码的旧文件","Технические книги читаются нормально: код, таблицы и формулы больше не разваливаются":"技术书籍正常阅读:代码、表格和公式不再错乱","Листинги распознаются даже там, где в книге не указан шрифт кода":"即使书籍未声明等宽字体,代码清单也能被识别","Пояснения на полях больше не вклеиваются в строки кода":"边注不再粘贴到代码行中间","Страницы оглавления с точками отображаются как аккуратный список":"带引导点的目录页显示为整洁列表","Короткую страницу можно центрировать по вертикали, а не прижимать к верху":"短页面可垂直居中而非固定在顶部","Оглавление берётся из самого PDF, а на компьютере оно наконец работает":"目录取自 PDF 本身,且在桌面端终于可用","Из PDF показываются сами иллюстрации, а не скриншот всей страницы":"PDF 显示插图本身而非整个页面的截图","Вид обложки":"封面适配","Открепить":"取消置顶","Закрепить вверху":"置顶","Удалить книгу":"删除图书","Действия с книгой":"图书操作","Закрыть книгу":"关闭图书","Обычный режим (панели на месте)":"普通模式(保留工具栏)","Полноэкранное чтение":"全屏阅读","Перерисовать книгу":"重排图书","Книга перерисована":"图书已重排","Ошибка: {0}":"错误：{0}","Главная":"主页","Функции":"功能","Дополнительно":"高级","Доброй ночи":"晚安","Доброе утро":"早上好","Добрый день":"下午好","Добрый вечер":"晚上好","Вы остановились на «{0}» — {1}%.":"您在《{0}》停留在 {1}%。","Что почитаем сегодня?":"今天读什么？","Повторно открываются за секунды.":"几秒内重新打开。","Выделение на телефоне":"手机上的高亮","Больше не убегает до конца книги.":"不再跳到书的末尾。","Простые настройки":"简单设置","Вкладки вместо прокрутки, лишнее выключается.":"翻页而非滚动,多余功能可关闭。","По желанию":"可选","Markdown-заметки, стилус-маркер, пересказ через ИИ.":"Markdown 笔记、手写笔标记、AI 摘要。","Автопрокрутка: включить или остановить":"自动滚动:开始或停止","Читать в Book Reader":"在 Book Reader 中阅读","📖 Открыть в Book Reader":"📖 在 Book Reader 中打开","Читать текущую заметку в Book Reader":"在 Book Reader 中阅读当前笔记","Сначала выделите фрагмент цветом":"请先用颜色高亮一段文本","Комментарий сохранён":"评论已保存","Комментарий удалён":"评论已删除","Google ограничил частые переводы. Подождите минуту и попробуйте снова — это ограничение бесплатного Google Translate, а не вашего интернета.":"Google 限制了翻译频率。请等待一分钟后重试——这是免费 Google Translate 的限制,而非您的网络问题。","Переводчик ответил ошибкой {0}. Интернет при этом работает — попробуйте позже.":"翻译服务返回错误 {0}。您的网络连接正常——请稍后重试。","Не удалось связаться с переводчиком. Похоже, нет интернета.":"无法连接到翻译服务。似乎没有网络连接。","Озвучка остановлена: {0}":"朗读已停止：{0}","< 1 мин":"< 1 分钟","≈ {0} до конца главы":"距本章结束约 {0}","≈ {0} до конца книги":"距全书结束约 {0}","До конца главы ≈ {0}, до конца книги ≈ {1}":"距本章结束约 {0}，距全书结束约 {1}","Словарь":"词典","В словарь: {0}":"已添加到词典：{0}","Не удалось записать в словарь: {0}":"无法写入词典：{0}","📖 Чтение: {0} мин":"📖 阅读：{0} 分钟","📖 Чтение":"📖 阅读","Пока нечего пересказывать — это начало книги.":"暂无内容可总结——这是本书的开头。","Кратко перескажи, что произошло в этом отрывке: главное, кто есть кто, к чему пришли. Не додумывай то, чего в тексте нет, и ничего не говори о том, что будет дальше.":"简要概括这段内容发生了什么：主要情节、人物关系、得出的结论。不要添加文中没有的内容，也不要提及后续情节。","Медленнее":"减速","Быстрее":"加速","Остановить автопрокрутку":"停止自动滚动","Страницы показываются как в оригинале. Заметку со страницы — кнопкой в её углу.":"页面按原样显示。要从页面创建笔记,请使用其角落的按钮。","Куда прижимать текст, если страница заполнена не до конца — например, в конце главы.":"当页面未填满时(例如在章节末尾),文本的放置位置。","Заметка создана":"笔记已创建","Раскладываем страницы…":"正在排版页面…","> *(страница-скан — текста для цитаты нет, впишите своими словами)*":"> *(扫描页面 — 无可引用文本，请自行填写)*","— из [[{0}]], стр. {1}":"— 来自 [[{0}]]，第 {1} 页","Вернуться к тексту":"返回正文","Разобрать фрагмент":"分析此段落","Продолжить выделение на следующей странице":"在下一页继续选择","Озвучить":"朗读","В словарь (карточки)":"添加到词汇表（卡片）","Цитата скопирована ✓ — вставьте в любую заметку":"引用已复制 ✓ — 粘贴到任意笔记","Закладка «остановился здесь» — {0}%":"\"阅读至此\"书签 — {0}%","Убрать отметку «остановился здесь»":"移除\"阅读至此\"标记","«{0}» собирается в «{1}» — изменить":"\"{0}\"将保存到\"{1}\" — 更改","Собирать «{0}» в свою заметку…":"将\"{0}\"收集到独立笔记…","Удалить выделение":"删除高亮","Разговор о фрагменте":"讨论段落","Сообщение…":"消息…","Отправить":"发送","О чём спросить?":"想问什么？","Спросите что угодно об этом фрагменте — или начните с разбора.":"询问关于此段落的任何问题 — 或从分析开始。","Разбери фрагмент":"分析此段落","Копировать":"复制","Думаю…":"思考中…","Не задан ключ. Откройте настройки плагина → «Разбор ИИ» и вставьте ключ выбранного сервиса.":"未设置密钥。打开插件设置 → \"AI 分析\"并粘贴您服务的密钥。","Сервис не принял ключ. Проверьте его в настройках плагина.":"服务拒绝了该密钥。请在插件设置中检查。","Сервис ограничил частые запросы. Подождите минуту и попробуйте снова.":"服务限制了请求频率。请等待一分钟后重试。","Локальная модель не отвечает. Проверьте, запущен ли Ollama или LM Studio.":"本地模型未响应。请检查 Ollama 或 LM Studio 是否正在运行。","Пустой ответ от модели.":"模型未返回任何内容。","Сервис ответил ошибкой {0}.":"服务返回错误 {0}。","Не удалось связаться с сервисом. Похоже, нет интернета.":"无法连接到服务。似乎没有互联网连接。","Этот FB2 упакован в ZIP. Распакуйте архив и положите в хранилище сам файл .fb2.":"此 FB2 文件打包在 ZIP 中。请解压缩并将 .fb2 文件本身放入您的仓库。","Большая книга ещё загружается — оглавление и поиск дополнятся сами":"大型图书仍在加载中——目录和搜索将自动补充","Заметка книги для ссылок — начните вводить название…":"用于链接的图书笔记——开始输入名称…","Шаблон заметки — начните вводить путь…":"笔记模板——开始输入路径…","## Заметки из выделений":"## 高亮摘录的笔记","Текст":"文本","Две — только на широком экране.":"仅在宽屏上显示两列。","Знаков в строке. Короткая строка читается легче.":"每行字符数。短行更易阅读。","Поля страницы":"页面边距","Узкие":"窄","Обычные":"普通","Широкие":"宽","Между абзацами":"段落间距","Плотно":"紧凑","Обычно":"普通","Просторно":"宽松","Точки сохраняются сами по ходу чтения; 💾 — те, что вы отметили сами.":"Points are saved as you read; 💾 marks the ones you saved yourself.","Все настройки плагина":"All plugin settings","Взять весь фрагмент как название":"Use the whole passage as the title","\n\n— из [[{0}]]":"— 来自 [[{0}]]","Показать в списке файлов":"在文件管理器中显示","Удалить книгу?":"删除此书？","«{0}» будет удалена из хранилища вместе с прогрессом чтения и выделениями. Заметка книги останется на месте.":"\"{0}\"将从仓库中删除，包括阅读进度和标注。书籍笔记将保留在原位置。","Удалить":"删除","Книга удалена: {0}":"已删除书籍：{0}","Не удалось удалить книгу":"无法删除书籍",", стр. {0}":"，第 {0} 页","Создаю заметки: {0}…":"正在创建笔记：{0}…","Создано заметок: {0}, ошибок: {1}":"已创建笔记：{0}，错误：{1}","Создано заметок: {0}":"已创建笔记：{0}"," *(стр. {0})*":"*（第 {0} 页）*","Цитата добавлена в «{0}»":"引用已添加到\"{0}\"","Выберите заметку или введите название новой…":"选择笔记或输入新笔记名称…","➕ Новая заметка «{0}»":"➕ 新建笔记\"{0}\"","Цитаты цвета «{0}» из книги [[{1}]]":"来自 [[{1}]] 的\"{0}\"引用","«{0}» теперь собирается в «{1}»":"\"{0}\"现已收集到\"{1}\"","перенесено: {0}":"已移动：{0}","Для книги не привязана заметка — задайте её в настройках":"此书未关联笔记 — 请在设置中指定","Заметка книги не найдена: {0}":"未找到书籍笔记：{0}","Эта цитата уже есть в «{0}»":"该引用已存在于\"{0}\"","Все выбранные цитаты уже есть в «{0}»":"所有选中的引用已存在于\"{0}\"","## Цитаты":"## 引用","Добавлено в «{0}»: {1}, пропущено уже имевшихся: {2}":"已添加到\"{0}\"：{1}；已跳过重复项：{2}","Добавлено цитат в «{0}»: {1}":"已添加到\"{0}\"的引用：{1}","Что перенести в заметку":"复制到笔记的内容","Заметка «{0}» — {1} уже перенесено, отмечено {2} новых":"笔记\"{0}\"——已有 {1} 条，新勾选 {2} 条","Заметка «{0}» — все {1} ещё не перенесены":"笔记\"{0}\"——{1} 条均未转移","Заметка книги не привязана — доступны только отдельные заметки":"未关联图书笔记——仅可创建单独笔记","Запоминает, где вы остановились, и ставит точку возврата (помечена 💾 в «Настройки → Вернуться к месту»). Это как «сохранение» в игре — нажмите перед закрытием книги, если хотите быть точно уверены, что место не потеряется.":"记住您的阅读位置并设置还原点（在\"设置 → 跳回\"中标记为 💾）。这就像游戏中的\"存档\"——如果想完全确保位置不丢失，请在关闭图书前按下此按钮。","Перестраивает страницу заново, если вёрстка «поехала» — например, после смены размера окна или открытия/закрытия боковой панели или вкладки (текст может отобразиться криво). Текущую позицию при этом сохраняет.":"当布局错乱时重建页面——例如调整窗口大小或打开/关闭侧边栏面板或标签页后（文本可能显示错位）。会保留您当前的位置。","Поиск по всему тексту книги — список совпадений с фрагментом вокруг каждого, клик переходит к месту.":"搜索整本书的文本——显示匹配结果列表及其上下文，点击可跳转到该位置。","Открывает список всех ваших выделений в этой книге. Клик по строке — переход к этому месту. У каждого выделения есть значок комментария — короткая мысль, которая остаётся при цитате. Сверху списка — кнопка экспорта в заметки.":"打开您在本书中所做的所有高亮。点击某行可跳转到该位置。每条高亮都有评论图标——可添加与引用相关的简短想法。列表上方有导出到笔记的按钮。","Оглавление книги: закладки PDF, заголовки, печатное содержание или жирные абзацы — что нашлось первым. У каждого пункта — номер страницы и текущий разворот. Много пунктов — сверху появится фильтр.":"图书目录：PDF 书签、标题、图书自带的印刷目录页或粗体段落——以最先找到的为准。每个条目显示页码和当前跨页。条目较多时，顶部会出现筛选框。","Тема, шрифт, размер текста, число колонок и блок «Вернуться к месту» — список точек, к которым можно откатиться.":"主题、字体、文字大小、列数和\"跳回\"区块——可回退到的位置列表。","Стрелки внизу экрана, клавиши ← → ↑ ↓ и пробел, либо свайп пальцем на телефоне. Каждое перелистывание автоматически сохраняет позицию — отдельно жать «Сохранить» не обязательно.":"屏幕底部的箭头、← → ↑ ↓ 键和空格键，或在移动设备上用手指滑动。每次翻页都会自动保存位置——无需单独按\"保存\"。","Выделите фрагмент мышью или пальцем — всплывёт палитра цветов. Клик по уже готовому выделению — сменить цвет или удалить его.":"用鼠标或手指选择一段文字——会弹出调色板。点击已有的高亮可以更改颜色或删除它。","Правый клик по выделенному тексту → «Создать новую заметку». Заметка создаётся по вашему шаблону в выбранной папке, с цитатой и ссылкой на книгу.":"右键点击高亮文字 → \"创建新笔记\"。笔记会根据你的模板在所选文件夹中创建,包含引用和书籍链接。","Перенести выделения в заметки":"将高亮移动到笔记","Кнопка вверху панели «Выделения». Откроется список, где можно отметить нужные фрагменты — по одному, «Выделить все» или «Только новые». То, что уже перенесено в заметку книги, помечено и снято с отметки, поэтому повторный экспорт ничего не задваивает. Дальше на выбор: вставить текстом в заметку книги или создать отдельную заметку на каждый фрагмент.":"高亮面板顶部的按钮。它会打开一个列表,你可以勾选需要的内容——逐个选择、\"全选\"或\"仅新增\"。已复制到书籍笔记的内容会被标记并取消勾选,因此再次导出不会重复。然后选择:将它们作为文本粘贴到书籍笔记中,或为每段内容创建单独的笔记。","Позиция сохраняется сама при каждом перелистывании и хранится в общем файле, который синхронизируется между устройствами (Obsidian Sync). Перестроение страницы (смена размера окна, панелей, масштаба) больше НЕ двигает и не пересохраняет прогресс — поэтому он не «уезжает» сам по себе.":"你的阅读位置会在每次翻页时自动保存,并保存在跨设备同步的共享文件中(Obsidian Sync)。重建页面(调整窗口、面板、缩放)不再移动或重新保存进度——因此它不会自行\"漂移\"。","Это уютная читалка книг прямо внутри Obsidian. Читаете, выделяете важное и превращаете выделения в заметки — не выходя из хранилища.":"这是一个舒适的书籍阅读器,就在 Obsidian 内部。阅读、高亮重要内容并将高亮转换为笔记——无需离开你的仓库。","Пролистайте несколько экранов стрелкой → (или кнопкой «Далее»). Это займёт минуту, зато потом всё будет понятно.":"用 → 箭头(或\"下一步\"按钮)翻阅几个屏幕。只需一分钟,之后一切都会清楚。","Какие форматы и как открыть книгу":"支持哪些格式,以及如何打开书籍","Читалка открывает три формата: EPUB (.epub), FB2 (.fb2) и PDF (.pdf).":"阅读器支持三种格式:EPUB (.epub)、FB2 (.fb2) 和 PDF (.pdf)。","Чтобы читать книгу, положите её файл в своё хранилище Obsidian и просто кликните по нему — она откроется в читалке.":"要阅读书籍,将书籍文件放入你的 Obsidian 仓库,然后直接点击它——它会在阅读器中打开。","На левой панели есть значок 📖 «Библиотека» — там все ваши книги с обложками в одном месте.":"左侧边栏有一个 📖 \"书库\"图标——所有书籍及封面都在一个地方。","Это самая первая версия":"这是第一个版本","Пожалуйста, не загружайте сразу много книг. Начните с двух-трёх и проверьте, что всё работает стабильно именно на вашем устройстве.":"请不要一次加载大量书籍。先从两三本开始，检查在您的设备上一切运行稳定。","Особенно аккуратно с очень большими PDF (сотни страниц или сканы картинок) — они тяжёлые и могут подтормаживать.":"特别注意超大型 PDF（数百页或扫描图像）——它们很占资源，可能会卡顿。","Плагин будет становиться лучше. А пока — по чуть-чуть и бережно 🙂":"插件会不断改进。目前——慢慢来，温柔对待 🙂","Выделения: цвета и действия":"高亮：颜色和操作","Выделите текст пальцем или мышью — появится палитра. Выберите цвет, и выделение сохранится.":"用手指或鼠标选择文本——会出现调色板。选择颜色，高亮就会保存。","Нажмите на уже готовое выделение — откроется то же меню: сменить цвет, скопировать, поставить закладку «остановился здесь», создать заметку, отправить в заметку книги или удалить.":"点击已有的高亮——会打开相同菜单：更改颜色、复制、设置\"读到这里\"书签、创建笔记、发送到书籍笔记或删除。","Все выделения книги собраны в панели 🖍️ наверху — оттуда можно перейти к любому или экспортировать все сразу.":"书籍的所有高亮都汇总在顶部的 🖍️ 面板中——从那里可以跳转到任意高亮或一次性导出全部。","Что такое «заметка книги»":"什么是\"书籍笔记\"","У каждой книги можно завести одну обычную заметку Obsidian — её «главную страницу», например «Мастер и Маргарита.md».":"每本书可以关联一个普通的 Obsidian 笔记——作为它的\"主页\"，例如\"大师与玛格丽特.md\"。","Когда вы создаёте заметку из выделения, в ней ставится ссылка на эту заметку книги. А ещё цитаты можно отправлять прямо в неё — так все мысли по книге собираются в одном месте.":"当您从高亮创建笔记时，会自动链接回这个书籍笔记。您还可以直接将引文发送到其中——这样关于这本书的所有想法都汇集在一处。","Это не обязательно настраивать прямо сейчас — привязать заметку книги можно в любой момент позже. Откройте книгу, нажмите значок ⓘ (справка) вверху читалки и заполните поле «Заметка книги для ссылок». Пока ничего не привязано, ссылки просто ведут на имя файла книги.":"您不必现在就设置——可以随时关联书籍笔记。打开书籍，点击阅读器顶部的 ⓘ（帮助）图标，填写\"用于链接的书籍笔记\"字段。在关联之前，链接只是指向书籍的文件名。","Где всё хранится":"数据存储位置","Ваш прогресс чтения и выделения хранятся файлами прямо в хранилище (рядом с книгами или в отдельной папке — это настраивается). Ничего не спрятано «внутри плагина» — всё лежит у вас.":"您的阅读进度和标注以文件形式直接存储在库中(与书籍放在一起或单独的文件夹中——可配置)。没有任何内容隐藏在\"插件内部\"——一切都属于您。","Заметки из выделений и заметки книги — это самые обычные .md заметки в вашей папке. Открывайте, редактируйте и связывайте их, как любые другие.":"标注笔记和书籍笔记都是文件夹中的普通 .md 笔记。像其他笔记一样打开、编辑和链接它们。","Про синхронизацию":"关于同步","Раз прогресс и выделения — это файлы в хранилище, они синхронизируются вместе с ним (Obsidian Sync, iCloud и т.п.).":"由于进度和标注都是库中的文件,它们会随库一起同步(Obsidian Sync、iCloud 等)。","Дайте синхронизации закончиться, прежде чем открывать ту же книгу на другом устройстве, и не читайте одну книгу на двух устройствах сразу — иначе позиция может «поспорить сама с собой».":"在另一台设备上打开同一本书之前,请等待同步完成,并且不要在两台设备上同时阅读一本书——否则位置可能会\"自相矛盾\"。","На разных устройствах путь к папке с книгами бывает разным — проверьте папки в настройках плагина.":"不同设备上书籍文件夹的路径可能不同——请在插件设置中检查文件夹。","Пример: как это всё работает":"示例:工作原理","1. Кладёте файл книги (.epub, .fb2 или .pdf) в хранилище и открываете его кликом.":"1. 将书籍文件(.epub、.fb2 或 .pdf)放入库中,点击打开。","2. Читаете. Позиция сохраняется сама при каждом перелистывании — ничего нажимать не нужно.":"2. 阅读。每次翻页时位置会自动保存——无需按任何按钮。","3. Понравилась мысль — выделяете её и выбираете цвет. Выделение сохранилось.":"3. 喜欢某个想法——标注它并选择颜色。标注已保存。","4. (по желанию) Нажимаете ⓘ вверху и привязываете «заметку книги» — свою страницу для этой книги. Это можно сделать и потом.":"4.(可选)点击顶部的 ⓘ 并链接一个\"书籍笔记\"——您为这本书创建的页面。也可以稍后再做。","5. Нажимаете на выделение → «в заметку книги» — цитата улетает в эту страницу, и плагин предложит открыть её. Готово: все ваши цитаты в одном месте.":"5. 点击标注 → \"添加到书籍笔记\"——引用会飞入该页面,插件会提示打开它。完成:您的所有引用都在一个地方。","Дальше — разбор настроек":"下一步:设置导览","Следующие экраны проходят по настройкам плагина: что делает каждая, что выбрать и что будет, если ничего не менять.":"接下来几个屏幕将介绍插件的设置:每项设置的作用、如何选择,以及不更改时会发生什么。","Открыть настройки: шестерёнка Obsidian → «Плагины сообщества» → Book Reader. Вверху пять вкладок: Чтение, Заметки, Перевод, Данные, О плагине.":"打开设置:Obsidian 的齿轮图标 → 社区插件 → Book Reader。顶部有五个选项卡:阅读、笔记、翻译、数据和关于。","Ни одну из них не обязательно настраивать сразу — плагин работает и так. Этот разбор нужен, чтобы вы знали, что вообще можно поменять.":"这些都不需要立即设置——插件本身就能正常工作。此导览是为了让您了解可以更改哪些内容。","Вкладка «Чтение»: статистика":"\"阅读\"选项卡:统计","Вверху вкладки — карточка со статистикой: сколько прочитано за всё время, серия дней подряд, среднее за день, лучший день и график за две недели.":"选项卡顶部是统计卡片:您的总阅读时长、当前连续天数、每日平均值、最佳单日记录和两周图表。","Она заполняется сама, когда вы читаете с включённым таймером ▶ (кнопка вверху читалки). Настраивать нечего — просто смотрите.":"当您在计时器运行时阅读(阅读器顶部的 ▶ 按钮),它会自动填充。无需配置——只需查看即可。","Пример: «12 ч 30 мин за всё время · 🔥 5 дн. подряд». Если таймер не включать, время не считается.":"例如:\"总计 12 小时 30 分钟 · 🔥 连续 5 天\"。如果从不启动计时器,则不会计时。","Настройка «Листание страниц»":"\"翻页\"设置","«Кнопками» — листаете стрелками внизу, клавишами ← → ↑ ↓ и пробелом, на телефоне свайпом. Центр страницы свободен: выделять текст удобно.":"\"按钮\"——使用底部箭头、← → ↑ ↓ 键和空格键翻页,在手机上滑动。页面中间保持空白,便于选择文本。","«По клику мышкой» — клик по левой половине страницы листает назад, по правой вперёд. Быстрее, но случайный клик может перелистнуть, когда вы хотели выделить фразу.":"\"鼠标点击\"——点击页面左半部分向后翻,右半部分向前翻。更快,但误触可能会在您想选择文本时翻页。","Что выбрать: начните с «Кнопками». Переключите на «По клику», если читаете подряд и мало выделяете.":"如何选择:从\"按钮\"开始。如果您连续阅读且很少高亮,可切换到\"鼠标点击\"。","«Выравнивание» и «Положение текста»":"\"对齐方式\"和\"文本位置\"","Выравнивание — как текст прижат в колонке: слева (рваный правый край, как в браузере), по ширине (ровные оба края, как в бумажной книге), по центру или справа.":"对齐方式 — 文本在列中的排列方式:左对齐(右边缘不齐,如浏览器中)、两端对齐(两边对齐,如印刷书籍)、居中或右对齐。","Положение на странице — что делать, если страница заполнена не до конца, например в конце главы: оставить текст сверху, поставить по центру или прижать вниз.":"页面位置 — 当页面未满时(例如章节末尾)如何处理:将文本留在顶部、居中或推至底部。","Что выбрать: «По ширине» + «Сверху» — самый привычный книжный вид. «По центру» имеет смысл, только если вас раздражают полупустые страницы в конце глав.":"建议选择:两端对齐 + 顶部是最接近书籍的效果。只有当章节末尾的半空页面困扰你时,居中才有意义。","«Погружение» и цель чтения":"\"沉浸模式\"和阅读目标","Погружение: панели сверху и снизу мягко притухают через пару секунд без движения мыши и возвращаются при первом движении. Ничто не отвлекает от текста.":"沉浸模式:鼠标停止移动几秒后,顶部和底部栏会轻柔淡出,鼠标一动立即恢复。不会分散对文本的注意力。","Цель на день: ползунок от 5 до 120 минут. Таймер ▶ вверху читалки запускается ВРУЧНУЮ и считает обратный отсчёт до цели, ⏸ ставит на паузу.":"每日目标:5 到 120 分钟的滑块。阅读器顶部的 ▶ 计时器需手动启动,倒计时至目标;⏸ 暂停。","Важно: таймер не запускается сам. Если забыть нажать ▶, время чтения и статистика не наберутся.":"注意:计时器不会自动启动。如果忘记按 ▶,阅读时间和统计数据都不会累积。","Заметка из выделения: название, папка, теги":"从高亮创建笔记:标题、文件夹、标签","Выделили фрагмент → «Создать заметку». Откроется окно с тремя полями: название (подставляется короткое, можно поправить или одной кнопкой взять фрагмент целиком), папка и теги.":"高亮一段文字 → \"创建笔记\"。会打开一个对话框,包含三个字段:标题(会建议一个简短标题;可编辑,或一键使用整段文字)、文件夹和标签。","Папка выбирается из подсказки, теги — через запятую, с подсказкой из уже используемых в хранилище. И то и другое запоминается для следующей заметки, так что вводить каждый раз не нужно.":"文件夹从建议列表中选择;标签用逗号分隔,会从库中已使用的标签提供建议。两者都会为下一条笔记记住,无需每次重新输入。","Пример: выделили абзац про PEP 8 → название «Стиль кода PEP 8», папка «0. Files/5. Inbox», теги «python, стиль». Окно можно отключить в настройках → Заметки.":"例如:高亮一段关于 PEP 8 的段落 → 标题\"PEP 8 代码风格\",文件夹\"0. Files/5. Inbox\",标签\"python, style\"。可在设置 → 笔记中关闭此对话框。","Если Obsidian стоит на Android-читалке с электронными чернилами, включите «Режим для e-ink» в настройках → Чтение.":"如果 Obsidian 运行在 Android 电子墨水屏阅读器上，请在\"设置 → 阅读\"中开启\"电子墨水屏模式\"。","Он убирает всё, что на таком экране оставляет следы: анимации, плавные переходы, тени, размытие и полупрозрачность. Цвета — чистый чёрный на белом, рамки жёсткие, кнопки крупнее под палец.":"该模式会移除所有在此类屏幕上留下残影的元素：动画、淡入淡出、阴影、模糊和透明度。颜色变为纯黑白，边框变硬，按钮变大以便拇指操作。","Отдельно в списке тем появляется «E-ink» — максимальный контраст без оттенков.":"主题列表中还会出现一个额外的\"E-ink\"主题——最大对比度，无色调。","Куда складывать заметки":"笔记存放位置","«Папка для новых заметок» — куда попадают заметки, созданные из выделений. Пусто — в корень хранилища. Пример: 0. Files/5. Inbox":"\"新笔记文件夹\"——从高亮创建的笔记存放位置。留空表示仓库根目录。例如：0. Files/5. Inbox","«Папка заметок-книг» — откуда берётся список, когда вы выбираете заметку книги. Пусто — можно выбрать любую заметку хранилища. Пример: 3. Resources/База книг":"\"书籍笔记文件夹\"——选择书籍笔记时列表的来源。留空表示可以选择仓库中的任何笔记。例如：3. Resources/Book base","Путь пишется от корня хранилища, через косую черту. Папку можно выбрать из подсказки — начните печатать, и появится список.":"路径从仓库根目录开始书写，使用正斜杠。可以从建议中选择文件夹——开始输入，列表就会出现。","Заметка книги и шаблон":"书籍笔记和模板","У каждой книги может быть своя заметка — в неё складываются цитаты и на неё ведут ссылки «— из [[…]]» из всех заметок по этой книге.":"每本书都可以有自己的笔记——引用会收集在那里，该书所有笔记中的\"— 来自 [[…]]\"链接都会指向它。","«Своя заметка на каждую книгу» — создавать её автоматически при первом открытии, не спрашивая. Иначе плагин спросит один раз сам.":"\"每本书单独笔记\"——首次打开书籍时自动创建，无需询问。否则插件会询问一次。","«Шаблон заметки» — файл, по которому создаются заметки из выделений. Работает и с Templater, если он у вас стоит. Пусто — заметка будет просто с цитатой и ссылкой.":"\"笔记模板\"——创建高亮笔记所依据的文件。如果安装了 Templater 也可以配合使用。留空表示笔记仅包含引用和链接。","Вкладка «Перевод»":"\"翻译\"选项卡","Выключено по умолчанию. Если включить, у выделенного текста появится кнопка перевода — удобно для книг на английском.":"默认关闭。开启后，选中文本时会出现翻译按钮——方便阅读其他语言的书籍。","Это единственное место, где плагин выходит в интернет: выделенный фрагмент уходит в бесплатный переводчик Google. Больше никуда и ничего не отправляется.":"这是插件唯一访问互联网的地方：选中的段落会发送到免费的 Google 翻译。不会向其他地方发送任何内容。","Язык перевода выбирается там же. Перевод можно сохранить в заметку под оригиналом.":"目标语言在同一位置选择。翻译结果可以保存到原文下方的笔记中。","Вкладка «Данные»: где что лежит":"\"数据\"选项卡：文件存放位置","«Папка с книгами» — где плагин ищет книги для библиотеки. Пусто — ищет по всему хранилищу.":"\"书籍文件夹\"——插件在此查找书籍以填充书库。留空表示搜索整个仓库。","«Папка для данных» — где лежат файлы прогресса и выделений. Пусто — рядом с книгами. Эти файлы синхронизируются между устройствами, поэтому чтение продолжается с того же места на телефоне.":"\"数据文件夹\"——进度和高亮文件的存放位置。留空表示存放在书籍旁边。这些文件会在设备间同步，因此可以在手机上从同一位置继续阅读。","«Память о книгах» — кнопка «Забыть все книги» сбрасывает привязки заметок и категорий, но сами заметки не удаляет. Нужна, если хотите настроить всё заново.":"\"阅读器记忆\"——\"忘记所有书籍\"按钮会清除笔记链接和分类，但不会删除任何笔记。如果想从头重新设置，可以使用此功能。","Как перенести выделения в заметки":"将高亮导出到笔记","Кнопка экспорта вверху панели «Выделения» открывает список всех выделений книги с галочками.":"\"高亮\"面板顶部的导出按钮会打开书中所有高亮的勾选列表。","Можно отметить нужные по одному, нажать «Выделить все» или «Только новые». То, что уже перенесено в заметку книги, помечено и снято с отметки — повторный экспорт ничего не задваивает.":"可以逐个勾选，或使用\"全选\"或\"仅新增\"。已在书籍笔记中的内容会被标记并取消勾选——再次导出不会产生重复。","Дальше на выбор: вставить текстом в заметку книги (всё в одном месте) или создать отдельную заметку на каждый фрагмент (для связей между заметками).":"然后选择：将它们作为文本粘贴到书籍笔记中（集中在一处），或为每段内容创建单独的笔记（用于笔记间链接）。","В заметке цитаты собраны по главам, у каждой — номер страницы книги, а комментарий (если вы его оставили) идёт прямо под цитатой.":"在笔记中，引文按章节分组，每条都带有书籍页码，您的评论（如果留下了）会紧跟在引文下方。","У выделенного текста, кроме «Создать заметку», есть значок комментария — короткая мысль, которая остаётся ПРИ выделении, а не улетает в отдельный файл.":"高亮文本除了\"创建笔记\"外，还有一个评论图标——简短的想法会留在高亮处，而不是飞到单独的文件中。","Пример: подчеркнули спорный тезис и приписали «а вот тут он сам себе противоречит» — эта строка видна в панели «Выделения» под цитатой и попадает в заметку книги при экспорте.":"例如：你高亮了一个可疑的论点并写下\"他在这里自相矛盾\"——这会显示在\"高亮\"面板的引用下方，并在导出时一起保留。","Значок лупы вверху читалки (или команда «Поиск по книге») открывает поиск по всему тексту — со списком совпадений и фрагментом текста вокруг каждого.":"阅读器顶部的放大镜图标（或\"搜索图书\"命令）打开全文搜索，显示匹配列表及每个匹配项的上下文。","Клик по результату — переход прямо к этому месту, на любом устройстве и при любой ширине окна.":"点击结果可直接跳转到该位置，在任何设备和任何窗口宽度下都有效。","Найденное слово подсвечивается жёлтым прямо в тексте книги, поэтому искать его глазами в абзаце не нужно. Через несколько секунд подсветка гаснет сама, чтобы не мешать чтению; убрать сразу — «Снять подсветку» в панели поиска.":"匹配的词会在书中直接用黄色标出——关闭面板后标记仍会保留，无需在段落中寻找。几秒钟后高亮会自动消失以免干扰阅读；立即清除可使用搜索面板中的\"清除高亮\"。","Ищет по части слова: запрос «систем» найдёт и «система», и «системы», и «системный».":"匹配部分单词：搜索\"system\"会找到\"system\"、\"systems\"和\"systemic\"。","Плагин ищет оглавление в таком порядке: сначала настоящие закладки из PDF, потом заголовки в тексте, потом печатное содержание книги (та страница со списком глав и точками), и в последнюю очередь — жирные абзацы, если больше зацепиться не за что.":"插件按以下顺序查找目录来源：首先是真实的 PDF 书签，然后是文本中的标题，接着是书籍自带的印刷目录页（带点线的那页），最后如果实在没有其他依据，则使用粗体段落。","У каждого пункта — номер страницы книги и номер текущего разворота, который пересчитывается на лету: он меняется при изменении ширины окна или открытии боковых панелей, поэтому его нельзя один раз сохранить.":"每个条目显示书籍自身的页码和当前跨页编号，实时重新计算——它会随窗口宽度或侧边栏打开而变化，因此无法一次性存储并重用。","Если пунктов много (в технических книгах бывает 300–400), сверху появляется поле фильтра — начните печатать название главы.":"当条目很多时（技术书籍可能有 300–400 条），顶部会出现过滤字段——开始输入章节名称即可。","Картинки в книгах":"书中的图片","Иллюстрации из PDF показываются прямо в тексте. Страницы-сканы рисуются целиком, а на обычных страницах вырезается сама картинка, а не скриншот всей страницы.":"PDF 中的图片会直接显示在文本中。扫描页面会完整绘制，而普通页面则会裁剪出图片本身，而不是整个页面的截图。","Грузятся они по мере чтения и выгружаются, когда далеко — поэтому книга на 500 страниц с иллюстрациями не съедает память.":"它们会随着阅读加载，远离后会释放，因此一本 500 页的插图书不会占用大量内存。","Если картинки мешают и нужен только текст, их можно выключить: настройки → Чтение → «Показывать картинки из книги».":"如果图片妨碍阅读,只想看文字,可以关闭它们:设置 → 阅读 → \"显示书中的图片\"。","Команды и горячие клавиши":"命令和快捷键","В палитре команд (Ctrl+P) есть «Открыть книгу: …» на каждую вашу книгу — можно повесить горячую клавишу и открывать нужную книгу одним нажатием.":"命令面板(Ctrl+P)中为每本书都有\"打开书籍:…\"条目——分配快捷键后,只需一次按键即可打开特定书籍。","Ещё есть «Продолжить чтение» — открывает последнюю книгу с того места, где вы остановились, и «Открыть книгу…» — список с поиском.":"还有\"继续阅读\",可从上次停止的位置打开最后一本书,以及\"打开书籍…\",一个可搜索的列表。","Горячая клавиша назначается в настройках Obsidian → «Горячие клавиши», поиск по слову Reader.":"快捷键在 Obsidian 的设置 → 快捷键中分配;搜索 Reader。","Пожелания и ошибки — в телеграм-бота":"反馈和错误报告 — 通过 Telegram 机器人","Всё, что хочется поменять или починить, теперь собирается в одном месте — в телеграм-боте @book_in_obsidian_bot.":"所有您希望更改或修复的内容现在都集中在一个地方 — Telegram 机器人 @book_in_obsidian_bot。","Ни аккаунта на GitHub, ни формы не нужно: заметили ошибку, не хватает возможности, неудобно на телефоне — просто отправьте боту обычное сообщение.":"无需 GitHub 账户和表单:发现错误、缺少功能、手机上使用不便 — 只需向机器人发送普通消息即可。","Читаю всё подряд; из этих сообщений и складывается список того, что делать дальше.":"我会阅读每一条消息,这些消息构成了下一版本的计划。","Готово — приятного чтения!":"一切就绪 — 享受阅读吧!","Что настроить по желанию (не обязательно сразу): папку для книг и папку для заметок — в настройках плагина. Заметку книги — под значком ⓘ прямо во время чтения.":"可选设置(无需立即配置):书籍文件夹和笔记文件夹 — 在插件设置中。书籍笔记 — 在阅读时点击 ⓘ 图标。","Что можно вообще не трогать: прогресс и выделения работают сразу и сохраняются сами.":"完全无需操作的部分:进度和高亮会立即生效并自动保存。","Полная справка по каждой кнопке — значок ⓘ в читалке. Этот экран приветствия можно снова открыть в настройках плагина.":"每个按钮的完整帮助——阅读器中的 ⓘ 图标。您可以在插件设置中重新打开此欢迎屏幕。","Нажмите «Начать читать» и откройте свою первую книгу 📖":"点击\"开始阅读\"并打开您的第一本书 📖","Озвучка через Elton AI: кнопка 🔊 рядом с таймером читает выделенное или книгу с текущей страницы":"通过 Elton AI 朗读:计时器旁的 🔊 按钮可朗读选中内容或从当前页开始朗读全书","Настройки плагина стали короче: приветствие на первой вкладке, редкое — в «Дополнительно»":"插件设置变得更简洁:欢迎页在第一个标签页,不常用的在\"高级\"中","Настройки чтения разложены по вкладкам «Текст», «Страница», «Чтение», «Книга» — без прокрутки":"阅读设置分为多个标签页——\"文本\"\"页面\"\"阅读\"\"书籍\"——无需滚动","Вкладка «Функции»: каждую возможность можно выключить; кэш PDF, время до конца главы, заметки со ссылкой на книгу прямо в тексте, комментарии из заметки книги, слова в карточки, чтение в ежедневную заметку, пересказ без спойлеров, поля и отступы между абзацами":"\"功能\"标签页:每项功能都可以关闭;PDF 缓存、章节剩余时间、在文本中直接添加带书籍链接的笔记、来自书籍笔记的评论、单词制卡、记录阅读到每日笔记、无剧透摘要、页边距和段落间距","Опции по желанию в настройках (выключены): заметки Markdown в читалке, номер страницы вверху, стилус как маркер, быстрый старт больших PDF, жирные подзаголовки PDF":"设置中的可选项(默认关闭):阅读器中的 Markdown 笔记、顶部显示页码、触控笔作为标记工具、大型 PDF 快速启动、PDF 粗体子标题","Телефон: выделение больше не «убегает» до конца книги и не прыгает на последнюю страницу — оно держится в пределах страницы, а цитату через границу страницы продолжает кнопка «›»":"手机:选择不再延伸到书籍末尾或跳转到最后一页——它保持在当前页面内,而\"›\"按钮可将引用延续到下一页","Цитата из нескольких абзацев — одна цитата: в списке, при экспорте и в заметке абзацы сохраняются":"跨多个段落的引用是一条引用:在列表、导出和笔记中,段落格式保持不变","Android: PDF снова открываются на телефонах со старым движком WebView, строятся обложки PDF":"Android:在使用旧版 WebView 的手机上 PDF 可以再次打开,并生成 PDF 封面","Телефон: верхняя панель встаёт под часы на Samsung и других оболочках; ручной отступ сверху применяется сразу":"手机:顶部栏位于 Samsung 和其他系统界面的时钟下方;手动顶部边距立即生效","Телефон: книга из списка файлов открывается окном читалки, а после перезапуска Obsidian возвращается сама; поиск по книге и ссылки «к месту в книге» работают":"手机:从文件列表打开的书籍在阅读器窗口中打开,重启 Obsidian 后自动恢复;书内搜索和\"跳转到书中位置\"链接正常工作","Полноэкранное чтение на телефоне: панели прячутся, тап по центру страницы их показывает":"手机全屏阅读：工具栏自动隐藏，点击页面中央可重新显示","На телефоне в панели выделения снова есть цвета, а цветов теперь шесть; рядом кнопка комментария":"手机上的高亮工具栏重新显示颜色，现在有六种颜色；旁边还有评论按钮","Выделение с комментарием помечено в тексте; нажатие показывает комментарий и даёт его изменить":"带评论的高亮在文本中标记；点击可显示评论并进行编辑","Свой цвет — своя заметка: например, всё жёлтое собирается в «Размышления», зелёное — в «Применение»":"每种颜色可对应独立笔记：例如黄色归入\"思考\"，绿色归入\"待尝试\"","Новый цвет или комментарий у выделения обновляет цитату и в заметке книги":"高亮的颜色或评论更新后，图书笔记中的引用也会同步更新","«Остановился здесь» подсвечивает место в тексте; на компьютере панель и выделение не пропадают, пока открыто меню «⋯»":"\"停在这里\"会在文本中标记位置；在电脑上打开\"⋯\"菜单时，工具栏和选区保持显示","EPUB: картинки, обложки, сноски и ссылки внутри книги, оглавление из самой книги":"EPUB：支持图片、封面、脚注和书内链接，目录取自书籍本身","FB2 с «неидеальной» разметкой открываются, ссылки на вложенные разделы работают":"可打开标记不完善的 FB2 文件，嵌套章节链接正常工作","PDF: режим «страницы как в оригинале» для формул, схем и сложной вёрстки; колонтитулы и номера страниц больше не мешают тексту; нумерованные заголовки попадают в оглавление":"PDF：\"原始页面\"模式适用于公式、图表和复杂排版；页眉页脚和页码不再干扰阅读；编号标题会显示在目录中","Свои шрифты (по названию или файлом из хранилища), шрифт Obsidian, красная строка, фактура бумаги или своя картинка под текстом":"自定义字体（按名称或使用库中的文件）、Obsidian 字体、首行缩进、纸张纹理或自定义背景图片","Автопрокрутка, стрелки и j/k в режиме прокрутки":"自动滚动，滚动模式下支持方向键和 j/k 快捷键","Библиотека: закрепить книгу вверху, обложки строятся по мере прокрутки, подсказка выбрать папку с книгами, без мигания обложек на Mac":"书库：置顶图书，滚动时动态加载封面，提示选择图书文件夹，Mac 上封面不再闪烁","Переименованная или перенесённая книга сохраняет прогресс, выделения и ссылки":"重命名或移动的书籍会保留进度、高亮和链接","Резервные копии хранятся неделю и выключаются; заметка «Что нового» больше не создаётся сама":"备份保留一周且可关闭;\"新功能\"笔记不再自动创建","Безопасность: книга больше не может выполнить свой код через разметку":"安全性:书籍无法再通过其标记运行自己的代码","На iPhone и iPad снова открываются PDF — раньше вместо книги была ошибка про readableStream":"PDF 在 iPhone 和 iPad 上可再次打开,之前书籍会被 readableStream 错误替代","PDF, у которых шрифт не приносит таблицу букв, больше не показываются кашей: текст восстанавливается и его снова можно выделять и искать":"字体不包含字符表的 PDF 不再显示为乱码:文本已恢复,可再次选择和搜索","Если восстановить текст нельзя — страница показывается картинкой, как в самом Obsidian, а не набором значков":"当文本无法恢复时,页面会显示为图片(如 Obsidian 本身的显示方式),而非一串奇怪符号","На Android подсветка зон нажатия больше не залипает на экране после тапа":"在 Android 上,点击区域的着色不再在点击后残留在屏幕上","Ползунок прокрутки виден на светлых темах, а не только на тёмных":"滚动条在浅色主题下可见,而非仅在深色主题下可见","Переход по сноске в режиме «прокруткой» ведёт к сноске, а не в начало книги":"在滚动模式下,脚注链接现在会跳转到脚注,而非书籍开头","Обложки книг в библиотеке снова строятся: PDF рисовался в картинку через возможности браузера, которых в Obsidian ещё нет":"书籍封面可再次生成:将 PDF 绘制为图像使用了 Obsidian 尚不具备的浏览器功能","Это же чинит картинки и страницы-сканы внутри PDF — они рисуются тем же способом":"同样的修复涵盖 PDF 内的图片和扫描页面,它们以相同方式绘制","Плагин снова открывается там, где раньше писал «Не удалось загрузить»: на Obsidian постарше, на планшетах Huawei и на части Windows-сборок":"插件在之前显示\"加载失败\"的地方可再次加载:旧版 Obsidian、华为平板和部分 Windows 安装","Цитаты можно складывать в одну заметку книги: в окне названия появилась кнопка «В заметку книги», а в меню выделения — «Текстом в заметку книги»":"引用可以汇总到一本书的笔记中：标题对话框新增了\"添加到书籍笔记\"按钮，选择菜单中新增了\"以文本形式添加到书籍笔记\"","Подпись ссылки «↪ к месту в книге» теперь своя — задаётся в настройках":"\"↪ 到书中此处\"链接的文字现在可以自定义——在设置中配置","Клик по выделению в списке ведёт к месту в книге даже там, где страница ещё не отрисована":"点击列表中的高亮内容会跳转到书中对应位置，即使该页面尚未渲染","Панель выделения больше не убегает на пустое место в начале абзаца и на границе страниц":"选择栏不再跳到段落开头或跨页边界的空白处","Верхняя панель на Android больше не заезжает под часы; если оболочка телефона молчит о высоте шторки, отступ можно задать руками":"Android 上顶部栏不再滑到时钟下方；如果手机系统未提供状态栏高度，可以手动设置偏移量","Что нового теперь сохраняется заметкой в хранилище — не нужно запоминать окно":"更新内容现在保存为库中的笔记——无需记住窗口内容","Пожелания и ошибки теперь собираются в телеграм-боте @book_in_obsidian_bot — просто напишите ему сообщение":"反馈和错误报告现在通过 Telegram 机器人 @book_in_obsidian_bot 收集——直接发送消息即可","Разбор фрагмента стал диалогом: свой вопрос, свой системный промпт, название книги уходит фоном":"解释段落现在是对话形式：你自己的问题、你自己的系统提示词，书名作为背景上下文发送","Читалка подстраивается под устройство: у телефона, планшета и компьютера своя раскладка":"阅读器适配设备：手机、平板和桌面各有专属布局","Тема читалки и библиотеки меняется мгновенно, появилась подстройка под тему Obsidian":"阅读器和书库主题即时切换，可以跟随你的 Obsidian 主题","Движок PDF обновлён — открытие книг стало надёжнее":"PDF 引擎已更新——打开书籍更加可靠","Абзацы в PDF сохраняются как в оригинале — текст больше не склеивается в сплошную стену":"PDF 段落保持原样——文本不再粘连成一整块","Библиотека: кнопка «Добавить книгу» и перетаскивание файлов (PDF, EPUB, FB2) прямо в окно":"图书馆：一个\"添加图书\"按钮，可将文件（PDF、EPUB、FB2）直接拖放到窗口中","PDF-движок встроен в плагин — книги открываются офлайн, ничего не подгружается из интернета":"PDF 引擎现已内置——图书离线打开，无需从互联网获取任何内容","В списке выделений комментарий больше не ломает цитату — он аккуратно встаёт под ней":"在高亮列表中，评论不再打断引文——它整齐地位于引文下方","Поиск по всей книге — значок лупы вверху читалки, со списком совпадений и переходом к месту":"搜索整本书——顶部的放大镜图标，带有匹配列表和跳转功能","Найденное слово подсвечивается прямо в тексте, чтобы не искать его глазами в абзаце":"匹配的词直接在文本中高亮显示，无需在段落中寻找","Комментарий к выделению — короткая мысль остаётся при цитате, а не улетает в отдельный файл":"为高亮添加评论——简短的想法与引文保持在一起，而不是飞到单独的文件中","Оглавление наконец работает — брало данные, но не показывало их; починил, добавил номер страницы, живой номер разворота и фильтр для длинных списков":"目录终于可用了——之前有数据但从未显示；已修复，还添加了页码、实时跨页编号和长列表过滤器","Экспорт цитат группирует их по главам и подписывает номер страницы":"引文导出现在按章节分组并标注页码","Картинки из книг теперь показываются сразу — раньше их приходилось искать в другой читалке":"图片现在可以直接显示——以前必须打开其他阅读器才能找到它们","Заметку из выделения можно сразу положить в нужную папку и проставить теги":"从高亮创建的笔记可以直接放入所需文件夹，并添加标签","Выделения переносятся выборочно: галочки, «выделить все», «только новые» — уже перенесённое не задваивается":"高亮选择性导出：复选框、\"全选\"、\"仅新增\"——已复制的内容不会重复","Режим для e-ink читалок: без анимаций и теней, чистый чёрный на белом, крупнее кнопки":"电子墨水屏阅读模式：无动画或阴影，纯黑白显示，按钮更大","Инструкция выросла до 21 экрана — теперь разбирает каждую настройку с примерами":"指南已扩充——现在逐项讲解每个设置并附带示例","Книгу можно открыть командой — своя команда и горячая клавиша на каждую книгу":"通过命令打开书籍——每本书都有自己的命令和快捷键","Статистика чтения: сколько всего прочитано, серия дней и график за две недели":"阅读统计：总计阅读量、连续天数和两周图表","Листание строго вправо, без съезжания в угол, и текст стал чётким":"翻页严格横向移动不再偏移到角落，文字更清晰","Перевод выделенного фрагмента — включается в настройках":"翻译选中段落——在设置中启用","Библиотека: категории по жанрам и папкам, фильтр «читаю / прочитано»":"书库：按类型和文件夹分类，以及\"在读/已读\"筛选","При первом открытии книги можно СОЗДАТЬ для неё заметку, а не только выбрать":"首次打开书籍时可以创建笔记，而不仅是选择现有笔记","Настройки разложены по вкладкам, редкое убрано в «Доп. настройки»":"设置分布在多个标签页中，不常用的收入\"附加设置\"","Текст сам перевёрстывается при открытии панелей и не теряет место":"打开面板时文本自动重排且不丢失位置","Исправлено: ввод пути в настройках создавал папку на каждый символ":"已修复：在设置中输入路径时每输入一个字符就创建一个文件夹","Плагин стал легче почти на 4 МБ":"插件体积减小近 4 MB","Book Reader {0} — что нового":"Book Reader {0} - 更新内容","Книжная читалка обновилась до версии {0}. Что изменилось:":"Book Reader 已更新至 {0}。更新内容：","Что нового в Book Reader":"Book Reader 新功能","Версия {0}":"版本 {0}","Все изменения":"所有更改","Продолжить":"继续","Дальше":"下一步","Список сохранён заметкой «{0}» — открыть":"已保存为笔记\"{0}\" - 打开","Инструкция: разбор всех настроек по шагам":"指南：逐步了解每项设置","Заметка для книги":"此书的笔记","Цитаты и мысли из книги будут ссылаться на эту заметку.":"来自此书的引用和想法将链接到此笔记。","В хранилище пока нет заметок — создайте новую ниже":"仓库中尚无笔记 — 在下方创建一个","Экран {0}":"屏幕 {0}","Это приветствие можно открыть снова в любой момент: Настройки → Book Reader → «О плагине» или команда «Показать приветствие».":"您可以随时重新打开此欢迎页面：设置 → Book Reader → \"关于\"，或使用\"显示欢迎页面\"命令。","Автопрокрутка":"自动滚动","Напомнить, что было":"回顾之前内容","Готовим книгу… {0}%":"正在准备书籍… {0}%","Не удалось открыть книгу.":"无法打开书籍。","Таймер: сколько осталось до цели — старт/пауза":"计时器：距离目标剩余时间 — 开始/暂停","Сохранено ✓ — {0}%":"已保存 ✓ — {0}%","Разворот {0} из {1}":"第 {0}/{1} 页","Вернулись к {0}%":"已返回至 {0}%","Пока нет выделений.\nВыделите текст и выберите цвет.":"暂无高亮标注。\n选择文本并选择颜色。","Экспортировать в заметки ({0})":"导出到笔记 ({0})","Папка с книгами…":"书籍文件夹…","Меньше обложки":"缩小封面","Больше обложки":"放大封面","Показаны все PDF, EPUB и FB2 из хранилища ({0}). Выберите папку с книгами — библиотека станет быстрее, а лишние файлы пропадут.":"显示库中所有 PDF、EPUB 和 FB2 文件（{0}）。选择图书文件夹——库会更快，多余文件会消失。","Выбрать папку":"选择文件夹","Оставить все":"保留全部","Папки пропущены — перетащите сами файлы книг ({0})":"已跳过文件夹——请拖放图书文件本身（{0}）","Не подошли ({0}): {1}. Поддерживаются PDF, EPUB и FB2.":"不支持（{0}）：{1}。支持 PDF、EPUB 和 FB2。","Закреплена":"已置顶","Продолжить чтение":"继续阅读","Применится при следующем открытии книги.":"将在下次打开图书时应用。","Страницами, как книгу, или одной лентой, как сайт.":"分页显示如书籍，或单列滚动如网站。","«По клику»: левая часть страницы — назад, правая — вперёд.":"\"点击翻页\"：页面左侧——后退，右侧——前进。","Отсчёт до дневной цели, запускается кнопкой ▶ в книге.":"倒计时至每日目标,点击书中的 ▶ 按钮启动。","Шрифт, размер и тема меняются прямо в книге: кнопка ⚙ вверху.":"字体、大小和主题可直接在书中更改:点击顶部的 ⚙ 按钮。","Сколько знаков в строке на широком экране.":"宽屏幕上每行显示的字符数。","Страница плавно уезжает в сторону.":"页面平滑滑向一侧。","Панели притухают, пока мышь не двигается.":"鼠标不动时面板会变暗。","Главы с новой страницы":"Chapters start on a new page","Каждая глава EPUB начинается с чистой страницы.":"每个 EPUB 章节从新页面开始。","Картинки на страницах PDF с текстом":"PDF 文本页面上的图片","Иллюстрации и схемы над текстом. Применится при следующем открытии.":"插图和图表显示在文本上方。下次打开时生效。","Открывать книгу снова после перезапуска":"Reopen the book after a restart","Книга, открытая при закрытии приложения, вернётся на то же место.":"关闭应用时打开的书籍将在重启后返回相同位置。","Если панель заезжает под часы — 24–48. Ноль — как скажет система.":"如果面板遮挡时钟,设为 24–48。设为零则跟随系统。","Шрифт книги":"书籍字体","Отступ первой строки":"首行缩进","Красная строка, как в бумажной книге.":"首行缩进，如同纸质书籍。","Без отступа":"无缩进","Подложка страницы":"页面背景","Цвет темы":"主题颜色","Фактура бумаги":"纸张纹理","Своя картинка":"自定义图片","Картинка подложки":"背景图片","Как класть картинку":"图片铺设方式","Растянуть на страницу":"拉伸至页面","Плиткой":"平铺","Свой шрифт: название":"自定义字体：名称","Шрифт, установленный на устройстве, например PT Serif.":"设备上已安装的字体，例如 PT Serif。","Свой шрифт: файл в хранилище":"自定义字体：仓库中的文件",".ttf, .otf, .woff из хранилища — работает и на телефоне.":"仓库中的 .ttf、.otf、.woff 文件——在手机上也能使用。","Куда прижать текст на неполной странице.":"在未满页面上文本的对齐方式。","Без анимаций и теней, чёрный на белом.":"无动画和阴影，黑白显示。","Шрифт, тема и размер отдельно для компьютера, планшета и телефона. Это устройство: {0}.":"电脑、平板和手机分别设置字体、主题和大小。当前设备：{0}。","Сюда кладутся заметки из выделений. Пусто — корень хранилища.":"高亮摘录的笔记存放位置。留空则为仓库根目录。","Шаблон для заметки из выделения. Пусто — без шаблона.":"摘录笔记的模板。留空则不使用模板。","Создаётся сама при первом открытии книги.":"首次打开书籍时自动创建。","Каждое выделение дописывается в заметку книги.":"每条高亮摘录都会追加到书籍笔记中。","Где лежат заметки книг. Пусто — любая заметка хранилища.":"书籍笔记的存放位置。留空则为仓库中的任意笔记。","Заметку и шаблон для одной книги можно задать в самой книге: ⚙ → «Книга».":"可以在书籍本身中设置单本书的笔记和模板：⚙ → \"书籍\"。","В папку книги, а не в общую.":"保存到书籍文件夹，而非公共文件夹。","Перед созданием можно поправить короткое название.":"创建前可以修改短标题。","Название — первое предложение фрагмента.":"标题为摘录的第一句话。","Для выделения, созданного комментарием.":"用于通过评论创建的高亮。","Кнопка комментария у выделения":"高亮栏上的评论按钮","Значок комментария в панели над выделением.":"高亮上方面板中的评论图标。","Поля: {text}, {book}, {page}, {link}, {comment}. Пусто — по умолчанию.":"字段：{text}、{book}、{page}、{link}、{comment}。留空则使用默认值。","Открывает книгу на абзаце цитаты.":"在引用段落处打开书籍。","При экспорте цитаты группируются по главам.":"导出时引用按章节分组。","Цитата в цветном <mark>.":"彩色 <mark> 中的引用。","Свойства reading-progress и reading-updated — для Bases.":"reading-progress 和 reading-updated 属性用于 Bases。","Список изменений после обновления — отдельной заметкой.":"更新后的变更列表 — 作为单独笔记。","Всё, что читалка умеет сверх чтения. Выключите ненужное — она станет легче. ⚡ — заметно влияет на скорость.":"阅读器除阅读外的所有功能。关闭不需要的功能可以让它更轻快。⚡ — 对速度有明显影响。","Время до конца главы":"距离章节结束的时间","«≈ 6 мин до конца главы» рядом с процентом прочитанного.":"在阅读进度百分比旁显示\"≈ 距章节结束还有 6 分钟\"。","Скорость чтения, слов в минуту":"阅读速度,每分钟字数","Номер страницы вверху":"页码显示在顶部","Счётчик страниц — в верхней панели, нижняя панель убирается. Применится при следующем открытии книги.":"页码计数器显示在顶部栏,底部栏将被隐藏。将在下次打开书籍时生效。","Стилус как маркер":"触控笔作为标记工具","Провёл стилусом (Apple Pencil и др.) по тексту — он выделен цветом по умолчанию. Палец работает как обычно.":"用触控笔(Apple Pencil 等)划过文本 — 文本将以默认颜色高亮显示。手指操作保持正常。","Читать заметки в Book Reader":"在 Book Reader 中阅读笔记","Пункт «Читать в Book Reader» в меню заметки и команда: заметка открывается как книга, с закладкой и выделениями.":"笔记菜单中的\"在 Book Reader 中阅读\"选项和命令:笔记将作为书籍打开,包含书签和高亮。","Заметки и связи":"笔记与链接","Заметки со ссылкой на место в книге ⚡":"带书籍位置链接的笔记 ⚡","Значок у абзаца, на который ссылается ваша заметка: наведите — превью, нажмите — откроется. Один раз в фоне читает заметки хранилища.":"段落旁的图标表示有笔记引用此处：悬停可预览，点击可打开。首次会在后台读取库中的笔记。","Комментарии из заметки книги — в книгу":"书籍笔记中的评论同步到书中","Поправили комментарий под цитатой в заметке книги — он обновится и в читалке.":"在书籍笔记中修改引文下的评论后，阅读器中也会同步更新。","Удалять цитату из заметки книги вместе с выделением":"从书籍笔记中删除引文时一并删除高亮","Удалили выделение в книге — его цитата уйдёт и из заметки книги.":"在书中删除高亮后，其引文也会从书籍笔记中移除。","Слова в карточки":"单词制卡","Пункт «В словарь» в меню выделения: слово с переводом становится карточкой «слово::перевод» для плагинов интервального повторения.":"高亮菜单中的\"添加到词汇表\"：将单词及译文制作成\"单词::译文\"卡片，用于间隔重复插件。","Заметка-словарь":"词汇表笔记","Пусто — «Словарь» в корне хранилища. Перевод подставляется, если включён перевод.":"留空则为库根目录下的\"词汇表\"。启用翻译时会自动填入译文。","Чтение — в ежедневную заметку":"阅读记录到每日笔记","Что и сколько читали сегодня — одним блоком в сегодняшней ежедневной заметке, если она есть (Ежедневные заметки или Periodic Notes).":"今日阅读内容和时长会作为一个区块添加到今日的每日笔记中（如果存在每日笔记或 Periodic Notes）。","Кэш PDF":"PDF 缓存","Разобранный PDF запоминается на этом устройстве: повторно открывается за секунды.":"已解析的 PDF 会记住在此设备上：重新打开只需几秒钟。","Большие PDF — начинать читать сразу":"大型 PDF — 立即开始阅读","PDF больше 300 страниц открывается, как только готова часть до вашего места; остальное догружается само.":"超过 300 页的 PDF 会在您所在位置的部分准备好后立即打开；其余部分会自动加载。","PDF: жирные подзаголовки отдельно ⚡":"PDF：粗体小标题单独显示 ⚡","Жирный заголовок внутри абзаца становится отдельным подзаголовком. PDF открывается дольше; в уже читанных PDF место и выделения могут немного сдвинуться.":"段落内的粗体标题会成为单独的小标题。PDF 打开时间会更长；已阅读 PDF 中的位置和高亮可能会略有偏移。","ИИ, голос и перевод":"AI、语音和翻译","Пересказ прочитанного":"已读内容摘要","«Напомнить, что было» в меню книги: ИИ пересказывает последние страницы до текущей — без спойлеров.":"书籍菜单中的\"提醒我之前的内容\"：AI 会总结当前位置之前的最后几页 — 无剧透。","Ключи — в защищённом хранилище устройства":"密钥存储在设备的安全存储中","Ключи ИИ и озвучки не попадут в файлы настроек. Хранилище устройства не синхронизируется: ключ нужно ввести на каждом устройстве.":"AI 和语音密钥不会出现在设置文件中。设备存储不会同步：需要在每台设备上输入密钥。","Кнопка ✨ у выделения: разбор и вопросы о фрагменте.":"高亮处的 ✨ 按钮：分析和提问选中的片段。","Хранится в хранилище и синхронизируется вместе с ним.":"存储在仓库中并随之同步。","Перевод через Google Translate, нужен интернет.":"通过 Google Translate 翻译，需要联网。","Озвучка текста (Elton AI)":"文本朗读 (Elton AI)","Кнопка 🔊 рядом с таймером: читает выделенное или книгу с текущей страницы.":"计时器旁的 🔊 按钮：朗读选中内容或从当前页开始朗读全书。","Голос":"语音","Скорость":"速度","Ключ Elton AI":"Elton AI 密钥","Для озвучки. Хранится в хранилище и синхронизируется вместе с ним.":"用于朗读。存储在仓库中并随之同步。","Локальная модель: текст никуда не уходит.":"本地模型：文本不会外传。","Без этих функций читалка работает полностью офлайн.":"不使用这些功能时，阅读器完全离线运行。","Что делать с фрагментом. Пусто — встроенный разбор.":"如何处理片段。留空则使用内置解析。","Пусто — всё хранилище.":"空 — 整个存储库。","Прогресс и выделения. Пусто — рядом с книгами.":"进度和标注。空 — 书籍旁边。","Прогресс и выделения едут вместе с хранилищем.":"进度和标注随存储库一起移动。","Ежедневная резервная копия":"Daily backup","Копия прогресса и выделений за последние 7 дней.":"最近 7 天的进度和标注副本。","Файлы данных чтения:":"阅读数据文件：","Разобранные PDF на этом устройстве.":"此设备上已解析的 PDF。","Напишите в телеграм-бот @book_in_obsidian_bot.":"请在 Telegram 机器人 @book_in_obsidian_bot 中留言。","Как всё устроено и что делает каждая настройка.":"工作原理及各项设置的作用。","Чтение вслух":"朗读","Живой голос Elton AI, звучащее слово подсвечено.":"Elton AI 真人语音，朗读词语高亮显示。","Связь с заметками":"关联笔记","Заметки со ссылкой на абзац видны прямо в тексте.":"链接到段落的笔记直接显示在文本中。","Слова и дневник":"生词与日记","Карточки для повторения и чтение в ежедневной заметке.":"复习卡片和阅读记录在每日笔记中。","Сколько осталось":"剩余时间","Минуты до конца главы и книги, на виду.":"章节和全书剩余分钟数，一目了然。","Быстрые PDF":"快速 PDF","Нет заметок в «{0}»":"\"{0}\"中没有笔记","Заметка книги: {0}":"书籍笔记：{0}","Шаблон книги: {0}":"书籍模板：{0}","\n\n**Перевод:**\n{0}":"**翻译：**\n{0}","{0} — стр. {1}":"{0} — 第 {1} 页","Дописать цитату в «{0}» вместо отдельной заметки":"将引用追加到\"{0}\"而不是创建单独的笔记","Фрагмент уходит на {0} только по вашему сообщению. Остальное работает офлайн.":"片段仅在您发送消息时发送到 {0}。其余功能离线工作。","Кэш PDF очищен: {0}":"PDF 缓存已清除：{0}","Книг: {0}. Привязки заметок, категории, шаблоны. Сами заметки не удаляются.":"书籍数：{0}。笔记关联、分类、模板。笔记本身不会被删除。","ИИ о книге":"关于本书的 AI","Спросить о книге":"询问这本书","Разобрать выделенное":"解析所选内容","Показать панели":"显示工具栏","Без панелей":"隐藏工具栏","Без панелей / показать панели":"隐藏 / 显示工具栏","Без панелей на компьютере":"电脑上隐藏工具栏","Верхняя и нижняя панели убраны, книга на всё окно; подведите мышь к краю — панель появится. Ещё: ⋮ книги или команда.":"隐藏顶部和底部工具栏，书籍占满整个窗口；鼠标移到边缘时工具栏会出现。也可在书籍的 ⋮ 菜单或命令中切换。","У Elton AI сейчас закончились кредиты на озвучку — попробуйте позже.":"Elton AI 的朗读额度暂时用完了，请稍后再试。","Не удалось связаться с сервисом. Проверьте интернет и попробуйте ещё раз.":"无法连接服务，请检查网络后重试。","Повторить":"重试","Напомни, что было":"提醒我之前的内容"};
let __erLang = "ru";
function __erSetLang(v) { __erLang = v || "ru"; }
function erLocale() { return { ru: "ru-RU", en: "en-GB", zh: "zh-CN" }[__erLang] || "ru-RU"; }
function __ertr(s){
  const lang = __erLang || 'ru';
  let out = lang === 'zh' ? (__erZH[s] != null ? __erZH[s] : __erEN[s] != null ? __erEN[s] : s) : (lang==='en' && __erEN[s]!=null) ? __erEN[s] : s;
  if (arguments.length>1){ var a=arguments; out = String(out).replace(/\{(\d+)\}/g, function(m,d){ var v=a[(+d)+1]; return v==null?m:v; }); }
  return out;
}



const VIEW_TYPE = "elton-reader";
// Per device, in Obsidian's local storage: the book open in the phone's reader
// dialog right now. A dialog is not part of the saved workspace, so without this
// a restart always lands back on the vault instead of the page being read.
// (Idea and first version: PR #17 by T-Damer.)
const ER_OPEN_BOOK_KEY = "elton-reader-open-book";
const DEFAULT = {
  // Interface language: "ru" (default) or "en".
  language: "ru",
  booksFolder: "",
  // ── Notes created from selections / highlights ────────────────────────────
  // Templater template applied to every new note ("" = create without a
  // template, just the quoted selection). Point this at your own template.
  noteTemplate: "",
  // Folder new notes are created in ("" = vault root).
  notesFolder: "",
  // Folder whose notes appear in the per-book "link to note" picker ("" = all).
  bookNotesFolder: "",
  // Opt-in: on a book's first open, automatically create a dedicated note named
  // after the book (in the book-notes folder, else the notes folder) and link it,
  // so every book gets its own note without manual picking. Requested by readers.
  autoBookNote: false,
  // Every new highlight is appended to the book's note as it is made.
  //
  // Deliberately SEPARATE from autoBookNote above. Readers asked for the two to
  // be split: "мне не нужно автоматическое создание заметки, я это делаю через
  // QuickAdd со своим шаблоном — но хочется, чтобы всё, что я выделяю, падало
  // только в эту заметку". One switch decides whether a note is created for you,
  // the other decides where quotes go; tying them together forced a choice
  // neither group wanted.
  quotesToBookNote: false,
  // Where reading data (progress, highlights, rescue backups) is stored.
  // "" = next to the books (the booksFolder). Set it to keep data in one place
  // regardless of where the books live.
  dataFolder: "",
  // Per-book template override, keyed by book path → template path. Lets a
  // given book (or genre) use a different note template than the global one.
  bookTemplates: {},
  // Keep highlight colours when exporting: wraps each quote in a coloured
  // <mark> (renders in vanilla Obsidian). Off = plain quotes without colour.
  exportColors: true,
  // По умолчанию читалка выглядит как сам Obsidian — включая тёмные темы.
  theme: "auto",
  // Библиотека — это интерфейс, а не страница книги: тёмное приложение со светлым
  // каталогом внутри выглядит сломанным, поэтому у неё своя тема и по умолчанию она
  // следует за Obsidian. "reader" — брать ту же тему, что у страницы книги.
  libTheme: "auto",
  fontSize: 18,
  fontFamily: "georgia",
  lineHeight: 1.8,
  columns: "2",
  // Text alignment inside the reading column: "left" (default), "justify",
  // "center" or "right". Requested by readers who prefer a specific alignment.
  textAlign: "left",
  // Where a SHORT page sits vertically: "top" (default), "center" or "bottom".
  // The end of a chapter often fills only part of the page, leaving the text
  // stranded at the top with a large empty band underneath.
  vAlign: "top",
  // Opt-in: adds a "translate" button to the selection popup. Off by default
  // because translating sends the SELECTED FRAGMENT to Google's public endpoint —
  // that has to be a deliberate choice, never a surprise.
  translateEnabled: false,
  // Target language for that button (ISO code Google Translate understands).
  translateTo: "ru",
  // Per-book override for the backlink inserted into notes created from a
  // selection. Keyed by the book file's path → the note name to link to.
  // Empty/unset → fall back to the book file's own name.
  bookNoteLinks: {},
  // Books we've already shown the "pick a book note" prompt for (keyed by path),
  // so first-open asks once and never nags again.
  bookNotePrompted: {},
  // Per-book cover display mode in the library, keyed by path → "contain".
  // Default (no entry) = "cover" (fills the card, may crop). "contain" shows the
  // WHOLE cover in proportion over a soft blurred backdrop.
  coverFits: {},
  // How the user syncs their vault between devices. Progress & highlights are
  // stored AS FILES inside the vault, so they ride whatever sync is in use —
  // this is mostly informational + tunes how aggressively we re-read on open.
  syncMode: "auto",
  // Opt-in: on PDF pages that have BOTH a picture and extractable text, also show
  // the page artwork above the text. Off by default — by default an image is only
  // shown when the page's text can't be extracted (scans, full-page figures), so
  // there is never a screenshot duplicating text you can already read.
  // Pictures on pages that also have text. Was off by default on the theory that
  // people want clean text — but a subscriber had to open illustrated books in a
  // different reader to see whether they contained pictures at all, which is a
  // much worse failure than an occasional redundant image.
  pdfShowFiguresOnTextPages: true,
  // Library cover size = the grid column width in px (cards scale with it). The
  // user can change it live with the −/+ control in the library header.
  libCoverSize: 176,
  // Last category chip picked in the library ("all", "status:reading",
  // "folder:<name>", "tag:<name>"), so it survives reopening.
  libCategory: "all",
  // Is the "Расширенные" group in the reading panel expanded? Collapsed by
  // default so the panel opens showing only the controls used mid-book.
  readerAdvOpen: false,
  readerHistOpen: false,
  askNoteTitle: true,
  shortNoteTitles: true,
  // Colour used when a comment has to create the highlight it hangs on.
  defaultHlColor: "yellow",
  // Кнопка комментария прямо в панели у выделения (issue #11). Можно скрыть.
  hlBarComment: true,
  // Reader-assigned categories per book: { "<book path>": ["Психология", …] }.
  // Folders only take you so far — most people keep every book in one place, so
  // this is how a library gets categories without reorganising files on disk.
  bookTags: {},
  // How pages are turned. "buttons" = the ← → arrows / keys / swipe (default).
  // "click" = tap/click the left or right side of the page to turn it (the
  // middle stays neutral so you can still select text / dismiss popups).
  navMode: "buttons",
  // Daily reading-goal timer. Counts active reading time (pauses when you're
  // idle or the book isn't focused) and shows a progress bar toward the goal.
  timerEnabled: true,
  dailyGoalMin: 15,
  // Accumulated reading seconds per day: { "YYYY-MM-DD": seconds }. Kept to the
  // last ~90 days. Local (in data.json) — a personal habit log, not synced.
  readingLog: {},
  // Untrimmed lifetime reading total (seconds). readingLog is capped to ~90 days,
  // so this separate counter is what powers the honest "all-time" total shown to
  // readers who asked to see cumulative reading time.
  lifetimeSeconds: 0,
  // Content-first "immersive" chrome: the top/bottom bars gently dim after a few
  // seconds of no pointer movement, and brighten the instant you move again.
  immersive: true,
  // Ручной отступ сверху на телефоне, px. 0 — высоту статус-бара берём у системы.
  mobileTopInset: 0,
  // На телефоне: книга, открытая в момент закрытия приложения, открывается снова
  // при следующем запуске (на компьютере это делает сама рабочая область).
  reopenBookOnStart: true,
  // Set to true once the first-run welcome slideshow has been shown, so it never
  // pops up again on its own (can still be re-opened from Settings).
  onboarded: false,
  // Set once the stale "already asked" flags from older builds have been cleaned
  // up (see loadAll). Without this the repair would run on every start.
  promptedRepaired: false,
  figuresShownByDefault: false,
  einkMode: false,
  // Keep the LOOK of the reader separate on each kind of device (see
  // DEVICE_KEYS). Off = one shared appearance everywhere, as before.
  // Where a note made from a highlight opens: "split" beside the book (default,
  // so the book stays on screen), "tab" in a new tab, "none" don't open it.
  // ── AI passage breakdown ──────────────────────────────────────────────────
  // Off by default and stays off until the reader sets it up: it sends the
  // selected passage to whichever service they choose, and that has to be a
  // decision, never a surprise.
  aiEnabled: false,
  aiProvider: "eltonlabs",
  aiKey: "",
  aiModel: "",
  aiBase: "",
  aiInto: "русском",
  // Озвучка через Elton AI: голос и скорость. ttsEnabled не задан по
  // умолчанию — миграция включает его тем, у кого уже есть ключ Elton AI.
  ttsVoice: "Puck",
  // 4.0 features — see the «Функции» tab. Cheap and safe ones are on; the ones
  // that write into notes or cost time are off until the reader turns them on.
  pdfCache: true,
  desktopNoBars: false,
  bookBacklinks: true,
  syncCommentsFromNote: true,
  syncDeleteToNote: false,
  timeLeft: true,
  readWpm: 180,
  vocabEnabled: false,
  vocabFile: "",
  vocabTarget: "auto",
  dailyLog: false,
  aiRecap: true,
  keysInSecretStorage: false,
  pageMargin: "normal",
  paraSpacing: 0.75,
  ttsRate: 1,
  ttsKey: "",
  // Empty means the built-in instruction. A reader who wants a different kind
  // of answer writes their own here instead of getting the four fixed sections.
  aiSystem: "",
  // Put a link back to the exact paragraph under every exported quote.
  // "pages" (default) or "scroll": one long column the reader scrolls.
  // Set once the reader has chosen a language by hand; until then the plugin
  // follows whatever language Obsidian itself is in.
  languagePicked: false,
  readMode: "pages",
  // Does a page slide when turned? On, and NOT derived from the system's
  // "reduce animations" preference.
  //
  // That preference is respected everywhere it belongs — the card cascade, the
  // pill sliding in, buttons shrinking under a press all stop. But the page
  // turn is not decoration: the slide is what tells you the book moved and in
  // which direction, the same category as a scrollbar moving when you scroll.
  // Deriving it from the OS meant anyone who had switched animations off in
  // Windows — a common thing to do, for reasons that have nothing to do with
  // reading — opened a book that turned pages by teleporting.
  pageTurnAnimation: true,
  // Copy the reading percentage into the book note's frontmatter, so it can be
  // charted and sorted in Bases. Off by default: it writes to a note the reader
  // owns, and that should be asked for.
  progressToFrontmatter: false,
  // How a copied quote is shaped. Placeholders: {text} {book} {page} {link} {comment}
  quoteTemplate: "",
  quoteBacklinks: true,
  // Подпись этой ссылки. Пусто — берётся стандартная на языке интерфейса.
  quoteBacklinkLabel: "",
  // Заголовок главы над группой цитат при выгрузке в заметку. Выключают,
  // когда главы в книге короткие и совпадают почти у каждой цитаты —
  // жалоба из issue #13 («главы даже совпадают»).
  quoteChapterHeadings: true,
  noteOpenMode: "split",
  // Widest a single reading column may get, in characters. A full-width column
  // on a wide monitor runs to 150+ characters, and the eye loses the start of
  // the next line — typography puts the comfortable range at 60-90. 0 = off,
  // fill the whole column as before. Extra width becomes side margin, so the
  // page geometry (and therefore the paging stride) is untouched.
  maxLineCh: 0,
  // Put notes made from a book's highlights in the SAME folder as the book,
  // instead of the shared notes folder. Off = the folder setting decides.
  notesNextToBook: false,
  perDevice: false,
  // { desktop: {...}, tablet: {...}, phone: {...} } — only the appearance keys.
  deviceProfiles: {},
  // Plugin version the reader last saw the "what's new" screen for. Drives the
  // post-update summary; empty on an existing install means "never tracked", and
  // the full history is shown once so the jump isn't silent.
  lastSeenVersion: "",
  // После обновления список изменений сохраняется заметкой в хранилище.
  // Off by default since 3.2: a note in the vault after every update was
  // "strange" to readers who did not ask for it; the window still shows.
  whatsNewNote: false,
  // Ежедневная копия прогресса и выделений в _reader-rescue (последние 7 дней).
  rescueBackups: true
};
const THEMES = {
  // Цвета самого Obsidian, а не свои: книга и библиотека выглядят как
  // остальное приложение — и меняются вместе с ним, включая чужие темы из каталога.
  // Это ссылки на переменные, а не цвета: браузер разбирает их в момент отрисовки,
  // поэтому переключение темы в Obsidian видно сразу, без перезапуска.
  auto: {
    bg: "var(--background-primary)",
    text: "var(--text-normal)",
    ui: "var(--background-secondary)",
    border: "var(--background-modifier-border)",
    accent: "var(--interactive-accent)",
    muted: "var(--text-muted)",
  },
  // Maximum contrast, no tinting: anything softer turns to mush on an e-ink panel.
  eink: { bg: "#ffffff", text: "#000000", ui: "#ffffff", border: "#000000", accent: "#000000", muted: "#444444" },
  dark: { bg: "#12121a", text: "#ddd8f0", ui: "#1c1c2a", border: "#2e2e45", accent: "#7c6af7", muted: "#6a6880" },
  light: { bg: "#faf8f3", text: "#1a1a2e", ui: "#f0ede5", border: "#ddd9ce", accent: "#5548d9", muted: "#8a8678" },
  sepia: { bg: "#f5efe3", text: "#2c2416", ui: "#ece4d2", border: "#cfc4a8", accent: "#8B6914", muted: "#9a8a68" }
};
// Одно место, где решается, какими цветами рисовать. Режим e-ink сильнее
// выбранной темы, а неизвестное имя темы откатывается к «как в Obsidian»,
// а не к белому листу посреди тёмного приложения.
// Цвета библиотеки. Отдельно от книги: читать можно хоть на сепии, а список
// книг при этом должен выглядеть частью приложения.
// ── Fonts ────────────────────────────────────────────────────────────────────
// Three built-in faces were not enough for four readers who asked for "my own
// font". Two ways in, both set once in Settings → Appearance:
//  • the NAME of any font installed on the device ("PT Serif", "Literata");
//  • a font FILE kept in the vault (.ttf / .otf / .woff / .woff2) — the one way
//    that works on a phone too, and it travels with the vault.
const ER_CUSTOM_FONT = "Book Reader Custom";
function erFontChoices(settings) {
  const out = [
    ["obsidian", "Obsidian", FONTS.obsidian],
    ["georgia", "Georgia", FONTS.georgia],
    ["lora", "Lora", FONTS.lora],
    ["inter", "Inter", FONTS.inter],
  ];
  const label = erCustomFontLabel(settings);
  if (label) out.push(["custom", label, erFontFamily({ ...settings, fontFamily: "custom" })]);
  return out;
}
function erCustomFontLabel(settings) {
  const s = settings || {};
  if (s.customFontFile) return String(s.customFontFile).split("/").pop().replace(/\.(ttf|otf|woff2?)$/i, "");
  return String(s.customFontName || "").trim();
}
function erFontFamily(settings) {
  const s = settings || {};
  if (s.fontFamily === "custom") {
    if (s.customFontFile) return `"${ER_CUSTOM_FONT}", Georgia, serif`;
    const name = String(s.customFontName || "").replace(/["\\;{}<>]/g, "").trim();
    if (name) return `"${name}", Georgia, serif`;
  }
  return FONTS[s.fontFamily] || FONTS.georgia;
}
// Load the vault font file into a document (each popout window has its own).
const _erFontLoaded = new WeakMap();
async function erEnsureCustomFont(app, settings, doc) {
  const path = settings && settings.customFontFile;
  if (!path || !app) return;
  doc = doc || document;
  const key = path;
  if (_erFontLoaded.get(doc) === key) return;
  try {
    const f = app.vault.getAbstractFileByPath(erPath(path));
    if (!(f instanceof TFile)) return;
    const buf = await app.vault.readBinary(f);
    const FF = (doc.defaultView && doc.defaultView.FontFace) || FontFace;
    const face = new FF(ER_CUSTOM_FONT, buf);
    await face.load();
    for (const old of [...doc.fonts]) if (old.family === ER_CUSTOM_FONT || old.family === `"${ER_CUSTOM_FONT}"`) doc.fonts.delete(old);
    doc.fonts.add(face);
    _erFontLoaded.set(doc, key);
  } catch (e) {
    console.warn("Book Reader: could not load the font file", path, e);
  }
}
// The page background: plain theme colour, a built-in paper grain, or a
// picture from the vault, stretched or tiled ("фон старой бумаги хочу").
function erPageTexture(app, settings) {
  const s = settings || {};
  if (s.pageTexture === "paper") {
    return { image: "url(\"data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .22  0 0 0 .09 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>') + "\")", size: "220px 220px", repeat: "repeat" };
  }
  if (s.pageTexture === "image" && s.pageTextureFile && app) {
    const f = app.vault.getAbstractFileByPath(erPath(s.pageTextureFile));
    if (f instanceof TFile) {
      const tile = s.pageTextureMode === "tile";
      return { image: `url("${app.vault.getResourcePath(f).replace(/"/g, "%22")}")`, size: tile ? "auto" : "cover", repeat: tile ? "repeat" : "no-repeat" };
    }
  }
  return null;
}
function erApplyTexture(app, settings, el) {
  if (!el) return;
  const t = erPageTexture(app, settings);
  el.toggleClass("er-textured", !!t);
  if (t) {
    el.style.setProperty("--er-tex-image", t.image);
    el.style.setProperty("--er-tex-size", t.size);
    el.style.setProperty("--er-tex-repeat", t.repeat);
  } else {
    el.style.removeProperty("--er-tex-image");
  }
}
function erLibTheme(settings) {
  const s = settings || {};
  const mode = s.libTheme || "auto";
  if (mode === "reader") return erTheme(s);
  if (s.einkMode === true) return THEMES.eink;
  return THEMES[mode] || THEMES.auto;
}
function erTheme(settings) {
  const s = settings || {};
  if (s.einkMode === true) return THEMES.eink;
  return THEMES[s.theme] || THEMES.auto;
}
const FONTS = {
  // The text font of Obsidian itself — the theme's, or the one picked in
  // Settings → Appearance. A variable, so a theme change shows at once.
  // (PR #18 by T-Damer.)
  obsidian: "var(--font-text)",
  georgia: "Georgia,'Times New Roman',serif",
  lora: "'Lora',Georgia,serif",
  inter: "'Inter',system-ui,sans-serif"
};
// Цвета выделений (полупрозрачные — текст читается на любой теме)
// Names are getters, translated when read. They used to be translated once,
// when the module loaded — before the language setting was even applied — so
// an English interface showed "Жёлтый" and "Зелёный" in every colour menu
// ("I just don't have a clue what those Russian words mean").
// Six colours, not four: readers sort a book into categories by colour and
// asked for more of them.
const HL_COLORS = [
  { id: "yellow", get name() { return __ertr("Жёлтый"); }, css: "rgba(255,206,64,.45)" },
  { id: "green", get name() { return __ertr("Зелёный"); }, css: "rgba(118,214,108,.42)" },
  { id: "blue", get name() { return __ertr("Голубой"); }, css: "rgba(96,165,250,.42)" },
  { id: "pink", get name() { return __ertr("Розовый"); }, css: "rgba(248,123,168,.42)" },
  { id: "purple", get name() { return __ertr("Фиолетовый"); }, css: "rgba(167,139,250,.45)" },
  { id: "orange", get name() { return __ertr("Оранжевый"); }, css: "rgba(251,146,60,.45)" }
];
function hlColorCss(id) {
  const c = HL_COLORS.find((x) => x.id === id);
  return c ? c.css : HL_COLORS[0].css;
}
// Every user-supplied or constructed vault path goes through here.
//
// normalizePath() is the Obsidian API's canonicaliser (and what plugin review
// expects on user paths): it turns a hand-typed "0. Files\Books//" into
// "0. Files/Books", so Windows-style backslashes finally just work instead of
// silently pointing nowhere.
//
// The wrapper exists for one reason: normalizePath("") returns "/", while this
// plugin uses "" to mean "not set" (→ vault root / next to the books). Passing
// its "/" onward would make every "if (folder)" check think a folder WAS set.
// So empty stays empty, in both directions.
function erPath(p) {
  const s = String(p == null ? "" : p).trim();
  if (!s) return "";
  try {
    const n = normalizePath(s);
    return n === "/" ? "" : n;
  } catch {
    // Older API surface / unexpected input: fall back to the old hand-rolled trim.
    return s.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  }
}
// ── Which window are we actually in? ────────────────────────────────────────
// Obsidian can move a leaf into a separate OS window, and that window has its
// own document with its OWN selection. `window.getSelection()` therefore comes
// back empty whenever the reader is living in a popout — which is why selecting
// text there produced no colour palette, and why the reader looked broken in a
// detached window while working fine in a tab.
//
// These take the element whose window we mean, rather than reading the global
// `activeDocument`: that one follows keyboard focus, so it can legitimately
// answer with one document when a listener is added and a different one when
// it is removed, leaking the listener.
// A missing element falls back to the main window, i.e. to the old behaviour.
// ── Per-device appearance ───────────────────────────────────────────────────
// data.json travels with the vault, so one font size was shared by the phone,
// the tablet and the desktop. What reads comfortably on a 27" monitor is tiny
// on a tablet and enormous on a phone, and readers were re-adjusting the size
// every time they switched device.
//
// Only the LOOK is per device. Folders, templates, highlight colours and
// reading progress stay shared — those are decisions about the vault, not about
// the screen you happen to be holding.
const DEVICE_KEYS = ["theme", "fontSize", "fontFamily", "lineHeight", "columns", "textAlign", "vAlign", "einkMode"];
function erDeviceKey() {
  try {
    if (Platform) {
      if (Platform.isPhone) return "phone";
      if (Platform.isTablet) return "tablet";
    }
  } catch { /* optional step; a failure here must not interrupt reading */ }
  return "desktop";
}
// Load this device's saved look over the shared defaults. A key the device has
// never set is left alone, so turning the option on inherits what is on screen
// now rather than resetting the book to factory settings mid-sentence.
function applyDeviceProfile(settings) {
  if (!settings || !settings.perDevice) return;
  const p = (settings.deviceProfiles || {})[erDeviceKey()];
  if (!p) return;
  for (const k of DEVICE_KEYS) if (p[k] !== void 0) settings[k] = p[k];
}
// Stash the live look back into this device's slot on the way to disk. Done at
// save time rather than at each of the ~35 places that read or write a font
// size, so the reader's own code is untouched and there is one place to check.
function captureDeviceProfile(settings) {
  if (!settings || !settings.perDevice) return;
  if (!settings.deviceProfiles) settings.deviceProfiles = {};
  const key = erDeviceKey();
  const p = settings.deviceProfiles[key] || (settings.deviceProfiles[key] = {});
  for (const k of DEVICE_KEYS) p[k] = settings[k];
}
// Put one of our own icons into an element as real SVG nodes.
//
// This was `el.innerHTML = icon(name)` in about forty places. The markup is a
// constant of ours, so nothing could actually be injected through it, but
// assigning innerHTML at all is what a reviewer greps for — and it is one
// careless edit away from being handed something that isn't a constant.
// Parsing instead of assigning removes the question entirely.
function svgIcon(el, name) {
  if (!el) return el;
  el.empty();
  try {
    let markup = icon(name);
    if (!markup) return el;
    // The icons are written as plain `<svg viewBox=…>` with no xmlns, which is
    // fine in HTML but NOT as XML: parsed as image/svg+xml without a namespace
    // the element lands outside the SVG namespace and the browser draws nothing.
    // Every button in the reader came out blank.
    if (!/\sxmlns=/.test(markup)) {
      markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    // A parse failure yields a <parsererror> document instead of throwing.
    if (parsed.getElementsByTagName("parsererror").length) return el;
    const svg = parsed.documentElement;
    if (svg && String(svg.nodeName).toLowerCase() === "svg") {
      el.appendChild(docOf(el).importNode(svg, true));
    }
  } catch { /* an icon is decoration; never let it break the reader */ }
  return el;
}
// Icon followed by a text label — the other shape the old innerHTML calls took.
function iconLabel(el, name, text) {
  svgIcon(el, name);
  el.createSpan({ text });
  return el;
}
// Show the book only once the layout has stopped moving.
//
// "It jumps between two pages when it opens" has been reported four times, and
// every mechanism I found and fixed was real but not the last one. So this stops
// hunting and makes the symptom impossible instead: the curtain (er-booting)
// comes up when the book is built and comes down only after the page area has
// held the same width for a beat. Anything that re-flows in that window — the
// dialog settling, the keyboard leaving, a rotation landing — happens behind it.
// Every call re-arms, so a re-flow that starts late just holds the curtain
// longer rather than revealing a half-finished page.
//
// The cost is a fifth of a second before the text appears. That is worth it: the
// reader sees the page they left, once, instead of watching it change.
const ER_SETTLE_MS = 200;
function erRevealWhenSettled(view) {
  const area = view.areaEl;
  if (!area) return;
  const win = winOf(area);
  win.clearTimeout(view._revealT);
  const width = () => (view.areaEl ? view.areaEl.clientWidth : 0);
  let last = width();
  const check = () => {
    if (!view.areaEl) return;
    const now = width();
    // Still moving — wait for it to settle rather than reveal mid-flight.
    if (now !== last) { last = now; view._revealT = win.setTimeout(check, ER_SETTLE_MS); return; }
    view.areaEl.removeClass("er-booting");
    erHideVeil(view);
  };
  view._revealT = win.setTimeout(check, ER_SETTLE_MS);
}
// Подсветка выделения на телефоне — только в режиме страниц.
//
// Страницы — это многоколоночный поток, сдвинутый трансформом, и WebKit внутри
// такого выделение не рисует: диапазон настоящий (панель появляется, копирование
// работает), но глазу не видно, что ты тянешь. Custom Highlight API красит без
// вмешательства в разметку — менять DOM под живым выделением нельзя, оно
// схлопнется. В прокрутке колонок нет, там система рисует сама, и вторая
// подсветка поверх неё выглядит грязно.
const ER_SEL_HL = "er-selection";
function erPaintSelection(view, range) {
  try {
    if (!erIsMobile(view.app)) return;
    if (view.pager && view.pager.scrollMode) return;
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight !== "function") return;
    CSS.highlights.set(ER_SEL_HL, new Highlight(range.cloneRange()));
  } catch { /* decoration: never let it interrupt selecting */ }
}
function erClearPaintedSelection() {
  try { if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.delete(ER_SEL_HL); }
  catch { /* nothing painted is a fine outcome */ }
}
// «Остановился здесь»: место, где читатель сам отметил остановку, подсвечено
// в тексте, пока он не отметит новое или не уберёт отметку через «⋯».
// Рисуется через Custom Highlight API — разметку книги не трогает, поэтому ни
// число абзацев, ни выделения не сдвигаются. Где API нет — помечается абзац.
// "Stopped here": the passage the reader marked stays painted until the next
// mark. Painted with the Custom Highlight API so the book's DOM is untouched.
const ER_STOP_HL = "er-stop";
const ER_MENU_HL = "er-menu-sel";
function erStopMarkFor(plugin, path) {
  const m = plugin.settings.stopMarks && plugin.settings.stopMarks[path];
  return m && typeof m.block === "number" ? m : null;
}
function erSetStopMark(view, mark) {
  if (!view.file) return;
  const st = view.plugin.settings;
  const all = st.stopMarks || (st.stopMarks = {});
  if (mark) all[view.file.path] = mark; else delete all[view.file.path];
  view.plugin.saveAll();
  for (const r of view.plugin._readers()) if (r.file && r.file.path === view.file.path) erRenderStopMark(r);
}
// What to mark: the passage the menu was opened on. For a quote over several
// paragraphs, its last part — that is where the reader stopped.
function erStopMarkSource(view, cur, editId, pending) {
  if (!view.file || !cur) return null;
  let src = null;
  if (editId) {
    const all = view.plugin.getHighlights(view.file.path);
    const gids = view.plugin.hlGroupIds(view.file.path, editId);
    src = all.find((h) => h.id === gids[gids.length - 1]) || all.find((h) => h.id === editId);
  } else if (pending) {
    const parts = pending.parts || [pending];
    src = parts[parts.length - 1];
  }
  if (!src || typeof src.block !== "number") src = { block: cur.block, text: cur.text };
  if (typeof src.block !== "number") return null;
  const m = { block: src.block, text: String(src.text || "").slice(0, 2000), ts: Date.now() };
  if (typeof src.occ === "number") m.occ = src.occ;
  if (src.pre != null) m.pre = src.pre;
  if (src.post != null) m.post = src.post;
  return m;
}
function erRenderStopMark(view) {
  try {
    const flow = view.pager && view.pager.flow;
    if (!flow) return;
    flow.querySelectorAll(".er-stop-block").forEach((b) => b.classList.remove("er-stop-block"));
    view._stopRange = null;
    const mark = view.file ? erStopMarkFor(view.plugin, view.file.path) : null;
    if (mark) {
      const block = flow.querySelectorAll("p,h1,h2,h3,h4")[mark.block];
      if (block) {
        const loc = mark.text ? locateHl(block.textContent, mark) : null;
        const range = docOf(block).createRange();
        if (loc) {
          const start = erTextPoint(block, loc.start, false), end = erTextPoint(block, loc.start + loc.len, true);
          if (start && end) { range.setStart(start[0], start[1]); range.setEnd(end[0], end[1]); }
          else range.selectNodeContents(block);
        } else range.selectNodeContents(block);
        view._stopRange = range;
      }
    }
    const api = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";
    if (!api) { if (view._stopRange) view._stopRange.startContainer.parentElement?.closest("p,h1,h2,h3,h4")?.classList.add("er-stop-block"); return; }
    const ranges = view.plugin._readers().map((r) => r._stopRange).filter(Boolean);
    if (ranges.length) CSS.highlights.set(ER_STOP_HL, new Highlight(...ranges));
    else CSS.highlights.delete(ER_STOP_HL);
  } catch { /* decoration: never break reading */ }
}
// Text node and offset at character `pos` of a block (as in wrapBlockRange).
function erTextPoint(block, pos, atEnd) {
  const walker = docOf(block).createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let node, at = 0, last = null;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (atEnd ? pos <= at + len : pos < at + len) return [node, pos - at];
    at += len;
    last = node;
  }
  return last ? [last, last.textContent.length] : null;
}
// A book's name as a reader would write it. Files from download sites come as
// "Деньги_в_сетевом_маркетинге_by_…" — the underscores are only there for the
// file system, and they were shown as is in the library and the title bar.
function erBookTitle(file) {
  const n = String(file && file.basename || "");
  return n.replace(/_+/g, " ").replace(/\s+/g, " ").trim() || n;
}
function docOf(el) { return (el && el.ownerDocument) || document; }
function winOf(el) { return docOf(el).defaultView || window; }
function selOf(el) { return winOf(el).getSelection(); }
function icon(n) {
  let _a;
  const m = {
    "arrow-left": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`,
    message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l2-4.2a8.4 8.4 0 0 1-1-4.3 8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 8.6 7.4z"/></svg>`,
    "list": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    "sliders": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    "chevron-left": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
    "chevron-right": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    "refresh": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    "highlighter": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l-6 6v3h3l6-6"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8z"/></svg>`,
    "trash": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    "note": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    "save": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    "download": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    "info": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    "more": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
    "search": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    "cover-fit": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
    "cover-fill": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    // Outline, like every other icon in the selection popup — it was the only
    // filled one, which is why that row looked mismatched.
    "bookmark": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    "copy": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    "translate": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h7M9 3v2c0 4.4-2.2 7-5 8"/><path d="M5 9c0 2.5 2.5 4.5 6 6"/><path d="M12.5 20l4.2-9.5L21 20M14.3 16.2h4.8"/></svg>`,
    "text-quote": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6H3M21 12H8M21 18H8M3 12v6"/></svg>`,
    "folder-open": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l1.5-3.5A2 2 0 0 1 9.3 9H21l-2.6 6.2A2 2 0 0 1 16.6 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v1"/></svg>`,
    "close": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    // Paper plane: the one icon every chat in the world uses for "send",
    // so nobody has to work out what the round button does.
    "send": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>`,
    "sparkles": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18 15l.8 2L21 17.8l-2.2.8-.8 2-.8-2-2.2-.8 2.2-.8z"/></svg>`,
    "play": `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>`,
    "pause": `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"/></svg>`,
    "check": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    "rotate-ccw": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    "volume": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>`,
    "stop": `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
    "more-horizontal": `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`,
    "x": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    "plus": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  };
  return (_a = m[n]) != null ? _a : "";
}
// ── Reading-goal timer + click-to-turn helpers ────────────────────────────────
// Shared by both readers (the desktop ItemView and the mobile full-screen Modal),
// which each expose `plugin`, `areaEl`, `bookHtml`, a nav method, and the goal-bar
// element refs. Keeping this as free functions avoids duplicating the logic twice.
// A page counts as "short" — worth centring — only when this much of it is empty.
// Below the threshold the page is essentially full and must stay put.
const SHORT_PAGE_GAP = 0.35;
// How long a search match stays painted before fading out by itself.
const FOUND_PAINT_MS = 4000;
// Upper bound on per-book commands. Enough for a normal shelf; a 500-book vault
// would otherwise drown every other command in the palette (use "Открыть книгу…").
const MAX_BOOK_COMMANDS = 60;
function readerTodayKey() {
  try { return window.moment ? window.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}
// ── Reading statistics ──────────────────────────────────────────────────────
// Pure helpers over the reading log so the stats card can be unit-tested without
// a vault. The log is { "YYYY-MM-DD": seconds } trimmed to ~90 days.

// "2 ч 15 мин" reads better than "135 мин" once someone has been reading a while.
// Below an hour we stay in minutes; a fresh install shows "—" rather than "0 мин",
// which would look like the counter is broken.
function fmtReadTime(sec) {
  const total = Math.max(0, Math.floor(sec || 0));
  if (total < 60) return total > 0 ? __ertr("меньше минуты") : "—";
  const mins = Math.floor(total / 60);
  if (mins < 60) return __ertr("{0} мин", mins);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? __ertr("{0} ч {1} мин", h, m) : __ertr("{0} ч", h);
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? __ertr("{0} д {1} ч", d, rh) : __ertr("{0} д", d);
}
// Shift a YYYY-MM-DD key by N days without touching the local timezone: parsing
// as UTC noon keeps DST changes from rolling the date backwards.
function shiftDayKey(key, delta) {
  const d = new Date(key + "T12:00:00Z");
  if (isNaN(d.getTime())) return key;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
// Consecutive days with any reading, counting back from today. Reading yesterday
// but not yet today still counts as a live streak — otherwise the number would
// collapse to 0 every morning and feel punishing.
function readingStreak(log, todayKey) {
  if (!log) return 0;
  const hit = (k) => (log[k] || 0) > 0;
  let cur = todayKey;
  if (!hit(cur)) {
    cur = shiftDayKey(cur, -1);
    if (!hit(cur)) return 0;
  }
  let n = 0;
  while (hit(cur) && n < 4000) { n++; cur = shiftDayKey(cur, -1); }
  return n;
}
// Everything the stats card needs, in one pass.
function readingStats(log, lifetimeSeconds, todayKey) {
  const l = log || {};
  const keys = Object.keys(l);
  const logSum = keys.reduce((a, k) => a + (l[k] || 0), 0);
  const daysRead = keys.filter((k) => (l[k] || 0) > 0).length;
  let best = 0, bestDay = "";
  for (const k of keys) if ((l[k] || 0) > best) { best = l[k]; bestDay = k; }
  // Lifetime is untrimmed and wins, but never report less than the log proves.
  const total = Math.max(lifetimeSeconds || 0, logSum);
  const recent = [];
  for (let i = 13; i >= 0; i--) {
    const k = shiftDayKey(todayKey, -i);
    recent.push({ key: k, sec: l[k] || 0 });
  }
  return {
    total,
    today: l[todayKey] || 0,
    streak: readingStreak(l, todayKey),
    daysRead,
    best, bestDay,
    avgPerDay: daysRead ? Math.round(logSum / daysRead) : 0,
    recent,
  };
}
// The timer is MANUAL: it counts only while the user has pressed ▶ (start), and
// pauses on ⏸. No activity/idle guessing — the reader is in control. Each running
// second is added to today's tally (feeding the daily-goal bar) and to the live
// session counter shown on the toolbar button.
function startTimerSession(view) {
  if (view._timer) return;
  if (!view.plugin.settings.timerEnabled) return;
  view._running = true;
  view._flushAcc = 0;
  view._timer = window.setInterval(() => {
    if (!view.plugin.settings.timerEnabled) { pauseTimerSession(view); return; }
    view.plugin.bumpReadingTime(1);
    if (view.file) erDayTime(view.plugin, view.file.path, 1);
    view._sessionSec = (view._sessionSec || 0) + 1;
    view._flushAcc = (view._flushAcc || 0) + 1;
    if (view._flushAcc >= 15) { view._flushAcc = 0; view.plugin.flushReadingTime(); }
    updateTimerBtn(view);
    updateGoalBar(view);
    if (!view._goalNotified && view.plugin.getTodaySeconds() >= view.plugin.getGoalSeconds()) {
      view._goalNotified = true;
      view.plugin.flushReadingTime();
      new Notice(__ertr("Цель чтения на сегодня достигнута 🎉"));
    }
  }, 1e3);
  updateTimerBtn(view);
}
function pauseTimerSession(view) {
  if (view._timer) { window.clearInterval(view._timer); view._timer = null; }
  view._running = false;
  if (view.plugin) view.plugin.flushReadingTime();
  updateTimerBtn(view);
}
function toggleTimerSession(view) {
  if (!view.plugin.settings.timerEnabled) {
    new Notice(__ertr("Таймер выключен — включите его в настройках чтения"));
    return;
  }
  view._running ? pauseTimerSession(view) : startTimerSession(view);
}
// Alias kept for the close hooks: stopping the reader just pauses + flushes.
function stopReadingTimer(view) { pauseTimerSession(view); }
// Reset today's reading time to zero (with confirmation).
function resetTimerSession(view) {
  if (!view.plugin.settings.timerEnabled) return;
  pauseTimerSession(view);
  view.plugin.resetTodaySeconds();
  view.plugin.flushReadingTime();
  view._goalNotified = false;
  updateTimerBtn(view);
  updateGoalBar(view);
  new Notice(__ertr("Таймер сброшен"));
}
// Refresh the toolbar timer button. It's a COUNTDOWN toward the daily goal:
// remaining = goal − read-today, shown as m:ss and ticking down while running.
// At 0 it flips to a green "done" state with a check.
function updateTimerBtn(view) {
  if (!view.timerBtnEl) return;
  const s = view.plugin.settings;
  if (!s.timerEnabled) { view.timerBtnEl.addClass("er-hidden"); return; }
  view.timerBtnEl.removeClass("er-hidden");
  const remain = Math.max(0, view.plugin.getGoalSeconds() - view.plugin.getTodaySeconds());
  const done = remain <= 0;
  const mm = Math.floor(remain / 60), ss = remain % 60;
  view.timerBtnEl.classList.toggle("er-timer-run", !!view._running && !done);
  view.timerBtnEl.classList.toggle("er-timer-done", done);
  if (view.timerIconEl) svgIcon(view.timerIconEl, done ? "check" : (view._running ? "pause" : "play"));
  if (view.timerLabelEl) view.timerLabelEl.setText(`${mm}:${String(ss).padStart(2, "0")}`);
}
// Recompute the daily-goal progress bar (fill width + label + "done" glow).
function updateGoalBar(view) {
  if (!view.goalWrapEl) return;
  const s = view.plugin.settings;
  if (!s.timerEnabled) { view.goalWrapEl.addClass("er-hidden"); return; }
  view.goalWrapEl.removeClass("er-hidden");
  const done = view.plugin.getTodaySeconds();
  const goal = view.plugin.getGoalSeconds();
  const pct = Math.min(100, Math.round(done / goal * 100));
  const mins = Math.floor(done / 60);
  view.goalFillEl.style.width = pct + "%";
  const reached = done >= goal;
  view.goalWrapEl.classList.toggle("er-goal-done", reached);
  view.goalTxtEl.setText(reached
    ? __ertr("✓ Цель достигнута — {0} мин сегодня", (mins))
    : __ertr("⏱ {0} из {1} мин · {2}%", (mins), (s.dailyGoalMin || 15), (pct)));
}
// "Click to turn": a click on the left/right third of the page turns it. Returns
// true if it handled the click. Guards against images, highlights and active
// selections so those interactions keep working, and leaves the center neutral.
// Hands-free reading. Scrolling mode: the text glides up at a set speed.
// Pages mode: the page turns by itself every N seconds. A small pill on the
// page holds slower / faster / stop; the speed is remembered.
// ── Озвучка текста через Elton AI ────────────────────────────────────────────
// Кнопка 🔊 рядом с таймером: выделенный фрагмент — читается он; без
// выделения — книга читается с текущей страницы дальше, страницы листаются
// сами, звучащее слово подсвечено.
//
// Синтез медленнее речи и очень неровный: тот же кусок готовится то за 10 с,
// то за 100 с (замер на прокси Elton AI, голос Gemini). Поэтому:
//  • текст режется на куски по предложениям и абзацам — целая фраза звучит с
//    живой интонацией, обрывок посреди предложения — нет; первый кусок
//    короткий, чтобы звук пошёл быстро;
//  • пока звучит кусок, следующие синтезируются параллельно (ER_TTS_AHEAD);
//  • если кусок задерживается сильно дольше обычного, уходит второй такой же
//    запрос и берётся тот ответ, что придёт первым.
// Сервис не сообщает, когда звучит какое слово. Время слов восстанавливается
// по самому звуку: в PCM находятся паузы, они сопоставляются со знаками
// препинания, а слова между паузами раскладываются по числу слогов.
// Text-to-speech through Elton AI: chunked, pipelined, hedged, word-aligned.
// Два адреса одного сервиса. Основной — международный api.eltonlabs.org, тот же,
// что у плагина Elton AI; российский — запасной, если основной не соединился
// (из России соединение до .org временами обрывается). Сначала пробуется тот,
// что ответил последним.
// Two hosts of the same service: .org first, .ru as the fallback.
const ER_TTS_HOSTS = ["https://api.eltonlabs.org/v1", "https://api.eltonlabs.ru/v1"];
let erTtsHost = 0;
// Which address answers from here, found once per session with a cheap call
// (balance, no tokens spent): .org first; if it says nothing within 4 s — a VPN
// or a provider whose route to that server is broken — .ru for the session.
let erHostProbe = null;
function erEltonProbe(key) {
  if (erHostProbe) return erHostProbe;
  erHostProbe = (async () => {
    for (let k = 0; k < ER_TTS_HOSTS.length; k++) {
      try {
        const r = await Promise.race([
          requestUrl({ url: ER_TTS_HOSTS[k] + "/balance", headers: key ? { Authorization: "Bearer " + key } : {}, throw: false }),
          new Promise((_, rej) => window.setTimeout(() => rej(new Error("probe timeout")), 4000))
        ]);
        if (r && r.status) { erTtsHost = k; return k; }
      } catch { /* try the next address */ }
    }
    return erTtsHost;
  })();
  return erHostProbe;
}
const ER_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const ER_TTS_VOICES = ["Puck", "Kore", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Zephyr"];
const ER_TTS_TONE = "An audiobook narrator reading a book aloud to one listener. " +
  "Calm, warm and expressive, like a real person who understands the text: natural phrasing, " +
  "rising and falling intonation that follows the meaning, short pauses at commas, longer ones " +
  "between sentences and paragraphs. Keep the same single narrator voice for the whole text — never switch voice, gender or accent for characters or dialogue. Never flat, never rushed.";
const ER_TTS_AHEAD = 3;
const ER_TTS_FIRST = 140;
const ER_TTS_MAX = 500;
// Requests in flight at once, hedges included: more trips the proxy's credit check.
const ER_TTS_INFLIGHT = 4;
const ER_TTS_RATES = [1, 1.25, 1.5, 1.75, 2];
let erTtsInflight = 0;
const ER_TTS_HL = "er-tts";
const ER_TTS_WORD = "er-tts-word";
// Ключ: свой ключ озвучки, иначе ключ Elton AI из настроек разбора.
function erTtsKey(s) {
  const own = String(s.ttsKey || "").trim();
  if (own) return own;
  return (s.aiProvider || "eltonlabs") === "eltonlabs" ? String(s.aiKey || "").trim() : "";
}
// Raw 16-bit mono PCM → a WAV the browser plays.
function erPcmToWav(buf, rate) {
  const pcm = new Uint8Array(buf);
  const out = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(out);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(out, 44).set(pcm);
  return out;
}
async function erTtsSynth(settings, text) {
  await erEltonProbe(erTtsKey(settings));
  let res = null, netErr = null;
  for (let k = 0; k < ER_TTS_HOSTS.length && !res; k++) {
    const h = (erTtsHost + k) % ER_TTS_HOSTS.length;
    try {
      // requestUrl has no timeout of its own; a dead connection must not hold
      // the queue, so a host that says nothing in 40 s counts as unreachable.
      res = await Promise.race([
        erTtsPost(settings, ER_TTS_HOSTS[h] + "/audio/speech", text),
        new Promise((_, rej) => window.setTimeout(() => rej(new Error("timeout")), 40000))
      ]);
      erTtsHost = h;
    } catch (e) { netErr = e; }
  }
  if (!res) throw netErr || new Error("network");
  return erTtsResult(res);
}
function erTtsPost(settings, url, text) {
  return requestUrl({
    url,
    method: "POST",
    headers: { Authorization: "Bearer " + erTtsKey(settings), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ER_TTS_MODEL,
      input: text,
      voice: ER_TTS_VOICES.includes(settings.ttsVoice) ? settings.ttsVoice : ER_TTS_VOICES[0],
      response_format: "pcm",
      // How to read: the routing proxy passes this on to the speech engine.
      provider: { options: { google: { instructions: ER_TTS_TONE } } }
    }),
    throw: false
  });
}
function erTtsResult(res) {
  if (res.status === 401 || res.status === 403) {
    const e = new Error(__ertr("Ключ Elton AI не подошёл"));
    e.fatal = true;
    throw e;
  }
  if (res.status < 200 || res.status >= 300) {
    let detail = "";
    try { detail = String(res.text || "").replace(/\s+/g, " ").slice(0, 140); } catch { /* no body */ }
    const e = new Error("HTTP " + res.status + (detail ? " — " + detail : ""));
    // "Busy", not "broken": too many requests in flight for the account, or the
    // engine overloaded. Waiting and asking again is the cure.
    e.busy = res.status === 402 || res.status === 429 || res.status === 503 || res.status === 529;
    // "Add credits": the service itself has run out of money upstream. Waiting
    // will not help, and the raw JSON means nothing to a reader.
    if (res.status === 402 && /add credits|exceeds your available credits/i.test(detail) && !/in-flight/i.test(detail)) {
      const out = new Error(__ertr("У Elton AI сейчас закончились кредиты на озвучку — попробуйте позже."));
      out.fatal = true;
      throw out;
    }
    throw e;
  }
  const type = String((res.headers && (res.headers["content-type"] || res.headers["Content-Type"])) || "");
  const m = /rate=(\d+)/.exec(type);
  const rate = m ? Number(m[1]) : 24000;
  const isPcm = !/audio\/(wav|x-wav|mpeg|mp3|ogg)/.test(type);
  const wav = isPcm ? erPcmToWav(res.arrayBuffer, rate) : res.arrayBuffer;
  return {
    url: URL.createObjectURL(new Blob([wav], { type: /mpeg|mp3/.test(type) ? "audio/mpeg" : "audio/wav" })),
    pcm: isPcm ? new Int16Array(res.arrayBuffer.slice(0, res.arrayBuffer.byteLength - (res.arrayBuffer.byteLength % 2))) : null,
    rate
  };
}
// One chunk, with a second identical request if the first one hangs well past
// what a chunk of this length usually takes, and a retry after a short wait
// when the proxy is busy (402/429/5xx). Whichever answers first wins.
// `race`: send two at once (the first chunk: the wait before any sound).
function erTtsSynthHedged(settings, text, race) {
  return new Promise((resolve, reject) => {
    let settled = false, launched = 0, failed = 0, lastErr = null, busy = 0;
    const finish = (fn, v) => { if (settled) return; settled = true; window.clearTimeout(timer); fn(v); };
    const go = () => {
      launched++;
      erTtsInflight++;
      erTtsSynth(settings, text).then((r) => {
        erTtsInflight--;
        if (settled) { URL.revokeObjectURL(r.url); return; }
        finish(resolve, r);
      }, (e) => {
        erTtsInflight--;
        failed++;
        lastErr = e;
        if (settled) return;
        if (e && e.fatal) { finish(reject, e); return; }
        if (e && e.busy && busy < 5) {
          busy++;
          launched--;
          failed--;
          window.setTimeout(() => { if (!settled) go(); }, 1000 * Math.pow(2, busy));
          return;
        }
        if (launched < 3) window.setTimeout(() => { if (!settled) go(); }, 1500);
        else if (failed >= launched) finish(reject, lastErr);
      });
    };
    const timer = window.setTimeout(() => {
      if (!settled && launched < 2 && erTtsInflight < ER_TTS_INFLIGHT) go();
    }, 5000 + text.length * 30);
    go();
    if (race && erTtsInflight < ER_TTS_INFLIGHT - 1) go();
  });
}
// ── Word timing from the sound itself ────────────────────────────────────────
// Weight of a word ≈ how long it takes to say: its vowels (syllables).
function erTtsWeight(word) {
  // A dash or a lone quote is not said: it takes almost no time.
  if (!/[\p{L}\p{N}]/u.test(word)) return 0.2;
  const han = (word.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  if (han) return Math.max(1, han);
  const v = (word.match(/[аеёиоуыэюяaeiouyäöüéèêàáâíìóòôúùåøæœ]/gi) || []).length;
  const d = (word.match(/\d/g) || []).length;
  return Math.max(1, v + d * 1.2);
}
// Pauses inside the speech: runs of quiet 10 ms frames of 120 ms or more.
function erTtsPauses(pcm, rate) {
  const frame = Math.max(1, Math.round(rate / 100));
  const n = Math.floor(pcm.length / frame);
  const en = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * frame, k = j + frame; j < k; j++) sum += Math.abs(pcm[j]);
    en[i] = sum / frame;
  }
  const sorted = Array.from(en).sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const thr = Math.max(200, p90 * 0.1);
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) if (en[i] > thr) { if (first < 0) first = i; last = i; }
  if (first < 0) return { start: 0, end: n / 100, pauses: [] };
  const pauses = [];
  let run = -1;
  for (let i = first; i <= last; i++) {
    if (en[i] <= thr) { if (run < 0) run = i; }
    else if (run >= 0) {
      if (i - run >= 12) pauses.push({ a: run / 100, b: i / 100 });
      run = -1;
    }
  }
  return { start: first / 100, end: (last + 1) / 100, pauses };
}
// Start time of every word of a chunk, in seconds of its audio.
function erTtsTimes(toks, pcm, rate) {
  const w = toks.map((t) => erTtsWeight(t.txt));
  const cum = [0];
  for (const x of w) cum.push(cum[cum.length - 1] + x);
  const total = cum[cum.length - 1] || 1;
  const sig = pcm ? erTtsPauses(pcm, rate) : null;
  const start = sig ? sig.start : 0;
  const end = sig ? sig.end : 0;
  // Anchors: [word index, time]. Word i starts at its anchor time.
  const anchors = [[0, start]];
  if (sig && sig.pauses.length) {
    // Where punctuation lets the voice pause, and how likely a pause is there.
    const bounds = [];
    for (let i = 0; i < toks.length - 1; i++) {
      const t = toks[i].txt;
      const str = toks[i].paraEnd ? 4 : /[.!?…]["»”')\]]*$/.test(t) ? 3 : /[,;:]["»”')\]]*$/.test(t) ? 2 : /^[—–-]$/.test(toks[i + 1].txt) ? 1.5 : 0;
      if (str) bounds.push({ i: i + 1, str, exp: start + (cum[i + 1] / total) * (end - start) });
    }
    const span = Math.max(0.5, end - start);
    let from = 0;
    for (const p of sig.pauses) {
      const mid = (p.a + p.b) / 2;
      let best = -1, bestCost = Infinity;
      for (let k = from; k < bounds.length; k++) {
        const cost = Math.abs(bounds[k].exp - mid) / span - bounds[k].str * 0.04;
        if (cost < bestCost) { bestCost = cost; best = k; }
        if (bounds[k].exp - mid > span * 0.35) break;
      }
      if (best >= 0 && bestCost < 0.25) {
        anchors.push([bounds[best].i, p.b]);
        from = best + 1;
      }
    }
  }
  anchors.push([toks.length, end || start + total * 0.07]);
  // Between anchors, words share the time by weight.
  const times = new Array(toks.length).fill(0);
  for (let a = 0; a < anchors.length - 1; a++) {
    const [i0, t0] = anchors[a];
    const [i1, t1] = anchors[a + 1];
    const wsum = cum[i1] - cum[i0] || 1;
    // the segment ends where the next pause began, not where speech resumed
    for (let i = i0; i < i1; i++) times[i] = t0 + ((cum[i] - cum[i0]) / wsum) * Math.max(0, t1 - t0);
  }
  if (sig) {
    for (let a = 1; a < anchors.length - 1; a++) {
      // words just before a pause end before it: squeeze them into speech time
      const [i1] = anchors[a];
      const p = sig.pauses.find((q) => Math.abs(q.b - anchors[a][1]) < 1e-6);
      if (!p) continue;
      const [i0, t0] = anchors[a - 1];
      const wsum = cum[i1] - cum[i0] || 1;
      for (let i = i0; i < i1; i++) times[i] = t0 + ((cum[i] - cum[i0]) / wsum) * Math.max(0, p.a - t0);
    }
  }
  return times;
}
// ── Text → chunks ────────────────────────────────────────────────────────────
// Words of a paragraph with their place in its text, so the word being spoken
// can be found on the page.
function erTtsTokens(text, block, base) {
  const out = [];
  // Words by spaces; in Chinese and Japanese text, by punctuation (。，！？…).
  for (const m of String(text).matchAll(/[^\s\u3001\u3002\uff01\uff0c\uff1b\uff1f]+[\u3001\u3002\uff01\uff0c\uff1b\uff1f]*|[\u3001\u3002\uff01\uff0c\uff1b\uff1f]+/g)) {
    out.push({ txt: m[0], block, s: base == null ? null : base + m.index, e: base == null ? null : base + m.index + m[0].length });
  }
  if (out.length) out[out.length - 1].paraEnd = true;
  return out;
}
// A tiny silent WAV: played inside the tap so a phone's WebView lets the same
// audio element play later, when the first chunk arrives seconds after it.
const ER_SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
// What the reader means by "read this": the selection if there is one (taken
// when the finger or mouse went down, before the tap could clear it), else the
// book from the first paragraph of the page on screen.
function erTtsGrab(view) {
  const sel = view._pendingSel;
  if (sel) {
    const parts = (sel.parts || [sel]).filter((p) => p && p.text);
    if (parts.length) return { parts: parts.map((p) => ({ text: p.text, block: p.block, occ: p.occ, pre: p.pre, post: p.post })) };
  }
  const ws = selOf(view.areaEl);
  const t = ws && !ws.isCollapsed ? String(ws).trim() : "";
  if (t) {
    let block = null;
    try {
      const el = ws.getRangeAt(0).startContainer;
      const p = (el.nodeType === 1 ? el : el.parentElement).closest("p,h1,h2,h3,h4");
      if (p && view.pager && view.pager.flow) block = [...view.pager.flow.querySelectorAll("p,h1,h2,h3,h4")].indexOf(p);
    } catch { /* block is only for following along */ }
    return { parts: [{ text: t, block }] };
  }
  return null;
}
// Page number in the top bar instead of a bar of its own at the foot (NocoDB:
// «если нумерацию страниц перенести наверх, освободится больше места для
// текста»). The bottom bar goes; pages still turn by keys, clicks and swipes.
// Включается в настройках: «Номер страницы вверху».
function erTopLoc(view, tr, root) {
  if (view.plugin.settings.pageNumTop !== true) return;
  root.addClass("er-loc-top");
  const el = createDiv({ cls: "er-top-loc" });
  tr.prepend(el);
  el.setAttribute("aria-label", __ertr("Перейти к странице"));
  el.addEventListener("click", () => { if (view.locEl) view.locEl.click(); });
  view.topLocEl = el;
}
// The AI and voice buttons are always built and only shown when their feature
// is on, so a switch in settings shows or hides them in an open book at once
// (they used to stay until the book was reopened). Called after every save.
function erSyncTopButtons(view) {
  // A tab Obsidian has not loaded yet (deferred view) has no plugin or content.
  const s = view && view.plugin && view.plugin.settings, root = view && view.contentEl;
  if (!s || !root) return;
  root.querySelectorAll(".er-tts-btn").forEach((b) => b.toggle(s.ttsEnabled === true));
  root.querySelectorAll(".er-ai-btn").forEach((b) => b.toggle(s.aiEnabled === true));
  // The selection bar is built once too: rebuild it when its comment switch changed.
  const pop = view.hlPopup;
  // (the book tab calls it buildHlPopup, the phone reader _buildHlPopup)
  const rebuild = view.buildHlPopup || view._buildHlPopup;
  if (pop && typeof rebuild === "function" && !!pop.querySelector(".er-hl-cmt") !== (s.hlBarComment !== false)) rebuild.call(view);
}
function erTtsButton(view, host) {
  const b = host.createDiv("er-ibtn er-tts-btn");
  b.toggle(view.plugin.settings.ttsEnabled === true);
  svgIcon(b, "volume");
  b.setAttribute("aria-label", __ertr("Озвучить: выделенное или с этой страницы"));
  // Read the selection before the tap clears it; keep a desktop selection alive.
  b.addEventListener("pointerdown", (e) => {
    view._ttsGrab = erTtsGrab(view);
    if (e.pointerType === "mouse") e.preventDefault();
  });
  b.addEventListener("click", () => {
    const grab = view._ttsGrab !== undefined ? view._ttsGrab : erTtsGrab(view);
    view._ttsGrab = undefined;
    erTtsToggle(view, grab);
  });
  view._ttsBtn = b;
  // Speed, while reading: tap to step 1× → 1.25× → … → 2× → 1×. Remembered.
  const rate = host.createDiv("er-tts-rate");
  rate.setAttribute("aria-label", __ertr("Скорость озвучки"));
  rate.addEventListener("click", () => {
    const s = view.plugin.settings;
    const cur = Number(s.ttsRate) || 1;
    const i = ER_TTS_RATES.findIndex((x) => Math.abs(x - cur) < 0.01);
    s.ttsRate = ER_TTS_RATES[(i + 1) % ER_TTS_RATES.length];
    if (view._tts) view._tts.audio.playbackRate = s.ttsRate;
    window.clearTimeout(view._ttsRateSave);
    view._ttsRateSave = window.setTimeout(() => view.plugin.saveAll(), 800);
    erTtsPaint(view);
  });
  b.after(rate);
  view._ttsRate = rate;
}
function erTtsPaint(view) {
  const b = view._ttsBtn;
  const t = view._tts;
  if (!b) return;
  if (view._ttsRate) {
    view._ttsRate.toggleClass("er-tts-rate-on", !!t);
    view._ttsRate.setText((Number(view.plugin.settings.ttsRate) || 1) + "×");
  }
  b.toggleClass("er-tts-on", !!t);
  b.toggleClass("er-tts-load", !!(t && !t.playing));
  svgIcon(b, t ? "stop" : "volume");
  b.setAttribute("aria-label", t ? __ertr("Остановить озвучку") : __ertr("Озвучить: выделенное или с этой страницы"));
  erTtsWait(view, !!(t && !t.playing), !!(t && t.played));
}
// While the voice is being made (a few seconds before the first word, and on a
// slow connection between pieces) a chip on the page says so — a pulsing
// button alone looked like nothing was happening. Tapping it stops the reading.
function erTtsWait(view, on, more) {
  let w = view._ttsWait;
  window.clearTimeout(view._ttsWaitSlow);
  if (!on) {
    if (w) { w.removeClass("er-tts-wait-on"); window.setTimeout(() => { if (!w.hasClass("er-tts-wait-on")) w.remove(); }, 250); }
    return;
  }
  const area = view.areaEl;
  if (!area) return;
  if (!w || !w.isConnected) {
    w = view._ttsWait = area.createDiv("er-tts-wait");
    w.setAttribute("role", "status");
    const bars = w.createDiv("er-tts-wait-bars");
    for (let i = 0; i < 4; i++) bars.createSpan();
    w.createSpan("er-tts-wait-txt");
    const x = w.createSpan("er-tts-wait-x");
    svgIcon(x, "x");
    w.setAttribute("aria-label", __ertr("Остановить озвучку"));
    w.addEventListener("click", () => erTtsStop(view));
    // Next frame, so the chip slides in instead of appearing.
    window.requestAnimationFrame(() => w.addClass("er-tts-wait-on"));
  } else w.addClass("er-tts-wait-on");
  const txt = w.querySelector(".er-tts-wait-txt");
  txt.setText(more ? __ertr("Загружаю продолжение…") : __ertr("Готовлю озвучку…"));
  // If it takes long, say it is still going rather than stuck.
  view._ttsWaitSlow = window.setTimeout(() => {
    if (view._ttsWait === w && w.hasClass("er-tts-wait-on")) txt.setText(__ertr("Ещё пара секунд…"));
  }, 6000);
}
function erTtsHl(name, range) {
  try {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight !== "function") return;
    if (range) CSS.highlights.set(name, new Highlight(range)); else CSS.highlights.delete(name);
  } catch { /* decoration only */ }
}
// Keep the word being spoken on screen: turn the page (or scroll) to it.
function erTtsShow(view, range, block) {
  const pager = view.pager;
  if (!pager || !view.areaEl) return;
  const ui = (c, t) => {
    const f = view.updateUI || view._updateUI;
    if (typeof f === "function") f.call(view, c, t);
    if (view.file) view.plugin.saveProgress(view.file.path, c, t, pager.currentBlockIndex());
  };
  try {
    const a = view.areaEl.getBoundingClientRect();
    let r = range ? range.getBoundingClientRect() : null;
    if (pager.scrollMode) {
      if (r && (r.bottom > a.bottom - 30 || r.top < a.top + 10)) {
        const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    const off = (x) => !x || (x.width === 0 && x.height === 0) || x.left >= a.right - 2 || x.right <= a.left + 2;
    if (!off(r)) return;
    // The page holding the word, from where the word sits in the strip — the
    // same reckoning a jump to a highlight uses.
    if (r && (r.width || r.height) && pager.sw) {
      const fr = pager.flow.getBoundingClientRect();
      const target = Math.max(0, Math.floor((r.left - fr.left) / pager.sw + 1e-3));
      if (target !== pager.spread) ui(...pager.jumpTo(target));
    } else if (typeof block === "number" && block >= 0) {
      const target = pager.spreadForBlock(block);
      if (typeof target === "number" && target !== pager.spread) ui(...pager.jumpTo(target));
    }
    // A long paragraph runs over the page edge: step on until the word shows.
    for (let k = 0; k < 6 && range; k++) {
      r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) break;
      if (r.left >= a.right - 2) ui(...pager.next());
      else if (r.right <= a.left + 2) ui(...pager.prev());
      else break;
    }
  } catch { /* following along is a courtesy */ }
}
function erTtsStop(view, why) {
  const t = view._tts;
  if (!t) return;
  view._tts = null;
  t.stopped = true;
  window.cancelAnimationFrame(t.raf);
  try { t.audio.pause(); t.audio.removeAttribute("src"); t.audio.load(); } catch { /* already gone */ }
  for (const it of t.items) if (it.res && it.res.url) URL.revokeObjectURL(it.res.url);
  erTtsHl(ER_TTS_HL, null);
  erTtsHl(ER_TTS_WORD, null);
  erTtsPaint(view);
  if (why) new Notice(why, 6e3);
}
function erTtsToggle(view, grab) {
  if (view._tts) { erTtsStop(view); return; }
  const s = view.plugin.settings;
  if (!erTtsKey(s)) {
    new Notice(__ertr("Для озвучки нужен ключ Elton AI: Настройки → Функции → «ИИ, голос и перевод»."), 8e3);
    return;
  }
  if (!view.pager || !view.pager.flow || !view.file) return;
  const audio = new Audio();
  audio.preservesPitch = true;
  audio.src = ER_SILENT_WAV;
  audio.play().catch(() => { /* unlock attempt only */ });
  const blocks = view.pager.flow.querySelectorAll("p,h1,h2,h3,h4");
  const t = view._tts = { audio, items: [], playing: false, stopped: false, file: view.file, raf: 0 };
  // Where words come from: the selected parts, or paragraphs from the page on screen.
  const tokBuf = [];
  let parts = grab && grab.parts ? grab.parts.slice() : null;
  let nextBlock = parts ? -1 : Math.max(0, view.pager.currentBlockIndex());
  const pull = () => {
    if (parts) {
      const p = parts.shift();
      if (!p) return false;
      const el = typeof p.block === "number" ? blocks[p.block] : null;
      const loc = el ? locateHl(el.textContent, p) : null;
      if (loc) tokBuf.push(...erTtsTokens(el.textContent.slice(loc.start, loc.start + loc.len), p.block, loc.start));
      else tokBuf.push(...erTtsTokens(p.text, p.block, null));
      return true;
    }
    while (nextBlock >= 0 && nextBlock < blocks.length) {
      const el = blocks[nextBlock];
      const bi = nextBlock++;
      if (!el || el.classList.contains("er-pdf-folio") || el.closest(".er-pdf-folio")) continue;
      const toks = erTtsTokens(el.textContent, bi, 0);
      if (toks.length) { tokBuf.push(...toks); return true; }
    }
    return false;
  };
  // Chunks grow: a short first one so sound starts soon, a middle one that is
  // ready before the first has finished playing, then full-size ones.
  let chunkNo = 0;
  // A chunk ends at the end of a paragraph or sentence once it is long enough,
  // at a clause when it is too long, and anywhere when it is far too long.
  const nextChunk = () => {
    const cur = [];
    let len = 0;
    const limit = chunkNo === 0 ? ER_TTS_FIRST : chunkNo === 1 ? Math.round((ER_TTS_FIRST + ER_TTS_MAX) / 2) : ER_TTS_MAX;
    for (;;) {
      if (!tokBuf.length && !pull()) break;
      const tk = tokBuf.shift();
      cur.push(tk);
      len += tk.txt.length + 1;
      const sentEnd = /[.!?…\u3002\uff01\uff1f]["»”')\]\u300d\u300f]*$/.test(tk.txt);
      const clause = /[,;:\uff0c\uff1b\u3001]["»”')\]]*$/.test(tk.txt);
      if ((tk.paraEnd && len >= limit * 0.4) || (sentEnd && len >= limit * 0.7) || (clause && len >= limit) || len >= limit * 1.5) break;
    }
    if (!cur.length) return null;
    chunkNo++;
    // No space between Chinese/Japanese pieces: the text has none.
    const cjk = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
    let text = "";
    cur.forEach((tk, i) => {
      const sep = !i ? "" : cur[i - 1].paraEnd ? "\n" : (cjk.test(cur[i - 1].txt.slice(-1)) && cjk.test(tk.txt[0])) ? "" : " ";
      text += sep + tk.txt;
    });
    return { toks: cur, text };
  };
  const ahead = () => {
    if (t.stopped) return;
    while (t.items.filter((it) => !it.started).length < ER_TTS_AHEAD) {
      const c = nextChunk();
      if (!c) break;
      const it = { ...c, started: false };
      it.promise = erTtsSynthHedged(s, c.text, !t.items.length && !t.cur).then((res) => { it.res = res; return res; });
      it.promise.catch(() => { /* reported when it is its turn */ });
      t.items.push(it);
    }
  };
  // Word ranges on the page, built when the chunk starts to play.
  const rangesFor = (it) => it.toks.map((tk) => {
    const el = typeof tk.block === "number" ? blocks[tk.block] : null;
    if (!el || tk.s == null) return null;
    const a = erTextPoint(el, tk.s, false), b = erTextPoint(el, tk.e, true);
    if (!a || !b) return null;
    const r = docOf(el).createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch { return null; }
    return r;
  });
  const track = (it) => {
    let shown = -1, para = -1;
    const step = () => {
      if (t.stopped || t.cur !== it) return;
      const now = audio.currentTime;
      let i = shown < 0 ? 0 : shown;
      while (i + 1 < it.times.length && it.times[i + 1] <= now) i++;
      while (i > 0 && it.times[i] > now) i--;
      // Only words light up; a dash keeps the word before it lit.
      while (i > 0 && !/[\p{L}\p{N}]/u.test(it.toks[i].txt)) i--;
      if (i !== shown) {
        shown = i;
        const r = it.ranges[i];
        erTtsHl(ER_TTS_WORD, r);
        const tk = it.toks[i];
        if (!grab && tk.block !== para) {
          para = tk.block;
          const el = blocks[para];
          if (el) { const pr = docOf(el).createRange(); pr.selectNodeContents(el); erTtsHl(ER_TTS_HL, pr); }
        }
        if (r) erTtsShow(view, r, tk.block);
      }
      t.raf = window.requestAnimationFrame(step);
    };
    t.raf = window.requestAnimationFrame(step);
  };
  const play = async () => {
    if (t.stopped || view._tts !== t) return;
    if (view.file !== t.file) { erTtsStop(view); return; }
    ahead();
    const it = t.items[0];
    if (!it) { erTtsStop(view); return; }
    it.started = true;
    t.playing = false;
    erTtsPaint(view);
    let res;
    try { res = await it.promise; }
    catch (e) { erTtsStop(view, __ertr("Озвучка остановлена: {0}", e && e.message ? e.message : String(e))); return; }
    if (t.stopped) return;
    it.times = erTtsTimes(it.toks, res.pcm, res.rate);
    it.ranges = rangesFor(it);
    t.cur = it;
    audio.src = res.url;
    audio.playbackRate = Number(s.ttsRate) || 1;
    t.playing = true;
    t.played = true;
    erTtsPaint(view);
    ahead();
    try { await audio.play(); }
    catch (e) { erTtsStop(view, __ertr("Озвучка остановлена: {0}", e && e.message ? e.message : String(e))); return; }
    window.cancelAnimationFrame(t.raf);
    track(it);
  };
  audio.addEventListener("ended", () => {
    if (t.stopped || !t.cur) return;
    const done = t.items.shift();
    if (done && done.res && done.res.url) URL.revokeObjectURL(done.res.url);
    t.cur = null;
    play();
  });
  erTtsPaint(view);
  play();
}
// ═══ 4.0: features that turn the reader into part of the vault ═══════════════
// Каждая из них включается и выключается во вкладке «Функции» настроек.
let erPlugin = null;

// ── PDF cache ───────────────────────────────────────────────────────────────
// Taking a PDF apart page by page is the slow part of opening it — a 1000-page
// textbook takes minutes on a phone. The result depends only on the file, a
// few settings and the reader's own version, so it is kept on this device and
// reused when the same book opens again. Not synced (the plugin folder), and
// dropped the moment the book file changes.
// Кэш разобранного PDF: повторное открытие без разбора страниц.
function erHash(s) {
  let h1 = 0x811c9dc5, h2 = 0x1505;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function erPdfCacheDir() {
  return erPlugin && erPlugin.manifest && erPlugin.manifest.dir ? erPath(erPlugin.manifest.dir + "/pdf-cache") : null;
}
// Bump when the PDF text assembly changes, so no cache written by another
// parser is ever read back (its paragraph count could differ, and positions
// and highlights hang on that count). 2: test builds of 4.0.0 wrote caches
// under the same version with a different parse.
const ER_PDF_PARSE_REV = 2;
function erPdfCacheKey(file, settings, flags) {
  if (!erPlugin || settings.pdfCache === false || !file || !file.stat) return null;
  return erHash([erPlugin.manifest.version, ER_PDF_PARSE_REV, file.path, file.stat.size, file.stat.mtime, flags.join(",")].join("|"));
}
async function erPdfCacheGet(key) {
  const dir = erPdfCacheDir();
  if (!key || !dir) return null;
  try {
    const a = erPlugin.app.vault.adapter;
    const p = dir + "/" + key + ".json";
    if (!(await a.exists(p))) return null;
    const d = JSON.parse(await a.read(p));
    return d && typeof d.html === "string" ? d : null;
  } catch { return null; }
}
async function erPdfCachePut(key, data) {
  const dir = erPdfCacheDir();
  if (!key || !dir) return;
  try {
    const a = erPlugin.app.vault.adapter;
    if (!(await a.exists(dir))) await a.mkdir(dir);
    await a.write(dir + "/" + key + ".json", JSON.stringify(data));
    // Keep the newest books only: the cache must never grow without bound.
    const list = await a.list(dir);
    const files = [];
    for (const f of list.files || []) {
      if (!/\.json$/.test(f)) continue;
      const st = await a.stat(f);
      if (st) files.push({ f, t: st.mtime || 0, size: st.size || 0 });
    }
    files.sort((x, y) => y.t - x.t);
    let total = 0;
    for (let i = 0; i < files.length; i++) {
      total += files[i].size;
      if (i >= 30 || total > 150 * 1024 * 1024) await a.remove(files[i].f);
    }
  } catch (e) { console.warn("Book Reader: PDF cache write failed", e); }
}
async function erPdfCacheClear() {
  const dir = erPdfCacheDir();
  if (!dir) return 0;
  const a = erPlugin.app.vault.adapter;
  if (!(await a.exists(dir))) return 0;
  const list = await a.list(dir);
  for (const f of list.files || []) await a.remove(f);
  return (list.files || []).length;
}

// ── Notes that point into the book ──────────────────────────────────────────
// A note made from a passage, or any note with a «↪ к месту в книге» link,
// shows as a small mark at that paragraph; hovering previews the note, a click
// opens it. The vault is read once in the background, then kept current note by
// note as files change. The book note and colour notes are left out: they hold
// every quote of the book, so they would mark every highlight.
// Заметки со ссылками на место в книге — значок прямо в тексте.
const ER_BL_RE = /obsidian:\/\/elton-reader\?book=([^&)\s\]]+)&block=(\d+)/g;
function erBlParse(text) {
  const out = [];
  if (!text || text.indexOf("elton-reader?book=") < 0) return out;
  for (const m of text.matchAll(ER_BL_RE)) {
    let b;
    try { b = decodeURIComponent(m[1]); } catch { continue; }
    out.push({ book: b, block: Number(m[2]) });
  }
  return out;
}
function erBlIndex(plugin) {
  return plugin._blIdx || (plugin._blIdx = { files: new Map(), ready: null });
}
function erBlScanAll(plugin) {
  const idx = erBlIndex(plugin);
  if (idx.ready) return idx.ready;
  idx.ready = (async () => {
    const files = plugin.app.vault.getMarkdownFiles();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const refs = erBlParse(await plugin.app.vault.cachedRead(f));
        if (refs.length) idx.files.set(f.path, refs); else idx.files.delete(f.path);
      } catch { /* unreadable note: skip */ }
      if (i % 40 === 39) await new Promise((r) => window.setTimeout(r, 0));
    }
  })();
  return idx.ready;
}
async function erBlUpdateFile(plugin, f) {
  if (!plugin._blIdx || !(f instanceof TFile) || f.extension !== "md") return false;
  const before = JSON.stringify(plugin._blIdx.files.get(f.path) || []);
  try {
    const refs = erBlParse(await plugin.app.vault.cachedRead(f));
    if (refs.length) plugin._blIdx.files.set(f.path, refs); else plugin._blIdx.files.delete(f.path);
  } catch { return false; }
  return before !== JSON.stringify(plugin._blIdx.files.get(f.path) || []);
}
function erBlFor(plugin, bookPath) {
  const map = new Map();
  if (!plugin._blIdx) return map;
  const st = plugin.settings;
  const skip = new Set();
  const bf = plugin.app.vault.getAbstractFileByPath(bookPath);
  const name = bf ? bookNoteLinkFor(plugin, bf) : "";
  const bn = name ? resolveBookNote(plugin.app, name) : null;
  if (bn) skip.add(bn.path);
  const cn = st.colorNotes && st.colorNotes[bookPath];
  if (cn) for (const k of Object.keys(cn)) skip.add(cn[k]);
  const aliases = new Set([bookPath]);
  for (const [o, n] of Object.entries(st.movedBooks || {})) if (n === bookPath) aliases.add(o);
  for (const [p, refs] of plugin._blIdx.files) {
    if (skip.has(p)) continue;
    for (const r of refs) {
      if (!aliases.has(r.book)) continue;
      const a = map.get(r.block) || [];
      if (!a.includes(p)) a.push(p);
      map.set(r.block, a);
    }
  }
  return map;
}
function erRenderBacklinkMarks(view) {
  const flow = view.pager && view.pager.flow;
  if (!flow) return;
  flow.querySelectorAll(".er-bl-mark").forEach((e) => e.remove());
  const plugin = view.plugin;
  if (plugin.settings.bookBacklinks === false || !view.file || view.ext === "md") return;
  if (!plugin._blIdx || !plugin._blIdx.ready) {
    erBlScanAll(plugin).then(() => erRenderBacklinkMarks(view));
    return;
  }
  const map = erBlFor(plugin, view.file.path);
  if (!map.size) return;
  const blocks = flow.querySelectorAll("p,h1,h2,h3,h4");
  for (const [b, notes] of map) {
    const el = blocks[b];
    if (!el) continue;
    // An empty span drawn by CSS: the paragraph's text — and with it every
    // highlight and saved place found by text — stays exactly as it was.
    const m = docOf(el).createElement("span");
    m.className = "er-bl-mark";
    m.setAttribute("data-er-bl", notes.join("\n"));
    m.setAttribute("aria-label", notes.map((n) => n.replace(/^.*\//, "").replace(/\.md$/, "")).join(", "));
    el.appendChild(m);
  }
}
// Click on a mark: one note opens, several give a menu. Returns true if handled.
function erBacklinkClick(view, e) {
  const m = e.target instanceof Element ? e.target.closest(".er-bl-mark") : null;
  if (!m) return false;
  e.preventDefault();
  e.stopPropagation();
  const notes = String(m.getAttribute("data-er-bl") || "").split("\n").filter(Boolean);
  const open = (p) => view.app.workspace.openLinkText(p, "", true);
  if (notes.length === 1) { open(notes[0]); return true; }
  const menu = new Menu();
  for (const p of notes) menu.addItem((it) => it.setTitle(p.replace(/^.*\//, "").replace(/\.md$/, "")).setIcon("file-text").onClick(() => open(p)));
  menu.showAtMouseEvent(e);
  return true;
}
function erBacklinkHover(view, e) {
  const m = e.target instanceof Element ? e.target.closest(".er-bl-mark") : null;
  if (!m) return;
  const notes = String(m.getAttribute("data-er-bl") || "").split("\n").filter(Boolean);
  if (notes.length !== 1) return;
  view.app.workspace.trigger("hover-link", { event: e, source: "elton-reader", hoverParent: view, targetEl: m, linktext: notes[0], sourcePath: "" });
}

// ── The book note talks back ────────────────────────────────────────────────
// Two directions the reader did not have: a highlight deleted in the book goes
// from its note too (opt-in — it removes text from a note), and a comment
// edited under a quote in the book note comes back into the book.
// Удаление выделения → из заметки книги; комментарий из заметки → в книгу.
function erQuoteBlockAt(lines, quote) {
  const firstPara = normalizeHlText(String(quote.text || "").split(/\n\s*\n/)[0]).slice(0, 60);
  const blockMark = `&block=${quote.block})`;
  let at = -1;
  for (let i = 0; i < lines.length && at < 0; i++) {
    if (/^>/.test(lines[i]) && firstPara && normalizeHlText(lines[i]).includes(firstPara)) at = i;
  }
  for (let i = 0; i < lines.length && at < 0; i++) {
    if (/^>/.test(lines[i]) && lines[i].includes(blockMark)) at = i;
  }
  if (at < 0) return null;
  let from = at;
  while (from > 0 && /^>/.test(lines[from - 1])) from--;
  let to = at;
  while (to + 1 < lines.length && /^>/.test(lines[to + 1])) to++;
  return [from, to];
}
async function erRemoveQuoteFromBookNote(plugin, path5, parts) {
  try {
    if (plugin.settings.syncDeleteToNote !== true || !parts || !parts.length) return;
    const app = plugin.app;
    const bookFile = app.vault.getAbstractFileByPath(path5);
    if (!(bookFile instanceof TFile)) return;
    const name = bookNoteLinkFor(plugin, bookFile);
    const noteFile = name ? resolveBookNote(app, name) : null;
    if (!noteFile) return;
    const [quote] = erMergeHlGroups(parts);
    await app.vault.process(noteFile, (data) => {
      const lines = data.split("\n");
      const r = erQuoteBlockAt(lines, quote);
      if (!r) return data;
      let [from, to] = r;
      if (to + 1 < lines.length && lines[to + 1].trim() === "") to++;
      lines.splice(from, to - from + 1);
      return lines.join("\n");
    });
  } catch (e) { console.warn("Book Reader: could not remove the quote from the book note", e); }
}
function erBookForNote(plugin, noteFile) {
  const map = plugin.settings.bookNoteLinks || {};
  for (const [book, name] of Object.entries(map)) {
    const f = name ? resolveBookNote(plugin.app, String(name).replace(/^\[\[|\]\]$/g, "")) : null;
    if (f && f.path === noteFile.path) return book;
  }
  return null;
}
async function erCommentsFromNote(plugin, noteFile) {
  if (plugin.settings.syncCommentsFromNote === false || !(noteFile instanceof TFile) || noteFile.extension !== "md") return;
  const book = erBookForNote(plugin, noteFile);
  if (!book) return;
  const list = plugin.getHighlights(book);
  if (!list.length) return;
  let text;
  try { text = await plugin.app.vault.cachedRead(noteFile); } catch { return; }
  const lines = text.split("\n");
  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^>/.test(lines[i]) || (i > 0 && /^>/.test(lines[i - 1]))) continue;
    let j = i;
    while (j + 1 < lines.length && /^>/.test(lines[j + 1])) j++;
    const block = lines.slice(i, j + 1);
    const link = block.join("\n").match(/&block=(\d+)\)/);
    const cIdx = block.findIndex((l) => /^>\s*—\s+/.test(l));
    i = j;
    if (!link || cIdx < 0) continue;
    // The comment runs from its "— " line to the end of the quote (the link
    // line, if the template puts it last, is not part of it).
    const comment = block.slice(cIdx).map((l) => l.replace(/^>\s?/, "")).join("\n")
      .replace(/^—\s+/, "").replace(/\s*\[[^\]]*\]\(obsidian:\/\/elton-reader[^)]*\)\s*$/, "").trim();
    const quoteText = normalizeHlText(block.slice(0, cIdx).map((l) => l.replace(/^>\s?/, "")).join(" "));
    const blockNo = Number(link[1]);
    const hl = list.find((h) => h.block === blockNo && quoteText.includes(normalizeHlText(h.text).slice(0, 40)))
      || list.find((h) => h.block === blockNo);
    if (!hl || !comment || (hl.comment || "").trim() === comment) continue;
    hl.comment = comment;
    plugin._persistHighlights(book, (disk) => {
      const h = (disk[book] || []).find((x) => x.id === hl.id);
      if (h) h.comment = comment;
    });
    changed++;
  }
  if (changed) for (const v of plugin._readers()) if (v.file && v.file.path === book) v._renderFlowHighlights();
}

// ── Time left ───────────────────────────────────────────────────────────────
// «≈ 6 мин до конца главы»: words to the next chapter at the reader's pace
// (180 words a minute unless set otherwise). Counted once per book.
function erTimeLeft(view) {
  const s = view.plugin.settings;
  if (s.timeLeft === false || !view.pager || !view.pager.flow || !view.pager.total) return null;
  const blocks = view.pager.flow.querySelectorAll("p,h1,h2,h3,h4");
  if (!blocks.length) return null;
  if (!view._wc || view._wc.n !== blocks.length || view._wc.html !== view.bookHtml) {
    const cum = new Float64Array(blocks.length + 1);
    for (let i = 0; i < blocks.length; i++) {
      const t = blocks[i].textContent || "";
      // Chinese and Japanese have no spaces: a run of characters is not one
      // word. About 1.7 characters read in the time of one word.
      const han = (t.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
      const w = (t.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, " ").match(/[\p{L}\p{N}]+/gu) || []).length + han / 1.7;
      cum[i + 1] = cum[i] + w;
    }
    view._wc = { n: blocks.length, html: view.bookHtml, cum };
  }
  let cur = 0;
  try { cur = Math.max(0, view.pager.currentBlockIndex()); } catch { return null; }
  const cum = view._wc.cum;
  let end = blocks.length;
  for (const it of view.tocItems || []) if (typeof it.block === "number" && it.block > cur) { end = Math.min(end, it.block); break; }
  const wpm = Math.max(60, Number(s.readWpm) || 180);
  const chapter = Math.max(0, cum[end] - cum[cur]) / wpm;
  const book = Math.max(0, cum[blocks.length] - cum[cur]) / wpm;
  const fmt = (m) => m < 1 ? __ertr("< 1 мин") : m < 60 ? __ertr("{0} мин", Math.round(m)) : __ertr("{0} ч {1} мин", Math.floor(m / 60), Math.round(m % 60));
  return { short: end < blocks.length ? __ertr("≈ {0} до конца главы", fmt(chapter)) : __ertr("≈ {0} до конца книги", fmt(book)), long: __ertr("До конца главы ≈ {0}, до конца книги ≈ {1}", fmt(chapter), fmt(book)) };
}
function erPaintTimeLeft(view) {
  const el = view.pctEl;
  if (!el) return;
  const t = erTimeLeft(view);
  let span = el.querySelector(".er-left");
  if (!t) { if (span) span.remove(); el.removeAttribute("aria-label"); return; }
  if (!span) span = el.createSpan({ cls: "er-left" });
  span.setText(" · " + t.short);
  el.setAttribute("aria-label", t.long);
  if (view.topLocEl) view.topLocEl.setAttribute("aria-label", t.long);
}

// ── Words → flashcards ──────────────────────────────────────────────────────
// A word or phrase from the book becomes a card. Two homes:
//  • a vocabulary note in the Spaced Repetition format ("front::back"), which
//    that plugin (and others) read; it writes its schedule on the next line;
//  • the FSRS deck of Elton's "Система" (QuickAdd script FSRS_01.js): cards are
//    JSON between %%FSRS_DATA_START%% and %%FSRS_DATA_END%% in "FSRS files.md".
// "auto" picks FSRS when that file is in the vault, else the note.
// The back is the translation; when there is none (same language, offline) it
// is the sentence from the book the word came from — never an empty "…".
// Слова в карточки: заметка-словарь (Spaced Repetition) или FSRS «Системы».
const ER_FSRS_START = "%%FSRS_DATA_START%%", ER_FSRS_END = "%%FSRS_DATA_END%%";
async function erFsrsFile(app) {
  // Same lookup as FSRS_01.js: its own setting first, then the usual places.
  try {
    const cfg = "0. Files/4. Templates/Scripts/config-settings.json";
    if (await app.vault.adapter.exists(cfg)) {
      const fp = ((JSON.parse((await app.vault.adapter.read(cfg)) || "{}") || {}).fsrs || {}).filePath;
      const f = fp && app.vault.getAbstractFileByPath(erPath(fp));
      if (f instanceof TFile) return f;
    }
  } catch { /* no config — look in the usual places */ }
  for (const fp of ["0. Files/0. Settings/Главные MOC/MOC - FSRS files.md", "0. Files/0. Settings/FSRS files.md"]) {
    const f = app.vault.getAbstractFileByPath(fp);
    if (f instanceof TFile) return f;
  }
  return app.vault.getMarkdownFiles().find((f) => f.name === "FSRS files.md" || f.name === "MOC - FSRS files.md") || null;
}
function erVocabContext(view, block, word) {
  try {
    const el = view.pager && typeof block === "number" ? view.pager.blockEl(block) : null;
    const t = String(el ? el.textContent : "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const lw = word.toLowerCase();
    const sent = (t.match(/[^.!?\u2026\u3002\uff01\uff1f]+[.!?\u2026\u3002\uff01\uff1f]*/g) || [t]).map((x) => x.trim()).find((x) => x.toLowerCase().includes(lw)) || t;
    return sent.length > 220 ? sent.slice(0, 217).trimEnd() + "\u2026" : sent;
  } catch { return ""; }
}
async function erAddToVocab(view, text, block) {
  const s = view.plugin.settings;
  const app = view.app;
  const word = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!word) return;
  const short = word.length > 40 ? word.slice(0, 40) + "\u2026" : word;
  let back = "";
  try { back = String(await translateText(word, s.translateTo || "ru") || "").replace(/\s+/g, " ").trim(); } catch { /* offline */ }
  if (back.toLowerCase() === word.toLowerCase()) back = "";
  if (!back) back = erVocabContext(view, block, word);
  const book = view.file ? erBookTitle(view.file) : "";
  const theme = book.replace(/\s+by\s+.*$/i, "").trim();
  try {
    const target = s.vocabTarget || "auto";
    const fsrs = target === "note" ? null : await erFsrsFile(app);
    if (target === "fsrs" && !fsrs) throw new Error(__ertr("файл FSRS не найден"));
    if (fsrs) {
      let dup = false;
      await app.vault.process(fsrs, (raw) => {
        const a = raw.indexOf(ER_FSRS_START), b = raw.indexOf(ER_FSRS_END);
        let data;
        if (a !== -1 && b > a) {
          // A broken block is never overwritten: that would lose the deck.
          try { data = JSON.parse(raw.slice(a + ER_FSRS_START.length, b).trim()); } catch { throw new Error(__ertr("блок данных FSRS повреждён — откройте FSRS, он его починит")); }
        } else data = { version: "5.0", cards: [], settings: { algorithm: "fsrs" } };
        if (!Array.isArray(data.cards)) data.cards = [];
        if (data.cards.some((c) => c && c.type === "word" && String(c.front || "").toLowerCase() === word.toLowerCase())) { dup = true; return raw; }
        data.cards.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), type: "word",
          front: word, back: back || word, theme,
          due: new Date().toISOString(), stability: 0, difficulty: 5, elapsed_days: 0, scheduled_days: 0,
          reps: 0, lapses: 0, state: 0, last_review: null
        });
        const json = JSON.stringify(data);
        return a !== -1 && b > a
          ? raw.slice(0, a + ER_FSRS_START.length) + "\n" + json + "\n" + raw.slice(b)
          : raw.replace(/\s*$/, "") + "\n\n" + ER_FSRS_START + "\n" + json + "\n" + ER_FSRS_END + "\n";
      });
      new Notice(dup ? __ertr("Уже в FSRS: {0}", short) : __ertr("В FSRS: {0}", short));
      return;
    }
    const raw = String(s.vocabFile || "").trim() || __ertr("Словарь");
    const path = erPath(raw.replace(/\.md$/i, "") + ".md");
    // One line per card: "::" inside the answer would split it in two.
    const line = `${word.replace(/::/g, ":")}::${(back || "\u2026").replace(/::/g, ":")}${book ? ` <!-- ${book.replace(/-->/g, "")} -->` : ""}`;
    let f = app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      f = await app.vault.create(path, "#flashcards\n\n" + line + "\n");
    } else {
      let dup = false;
      const lw = word.toLowerCase() + "::";
      await app.vault.process(f, (d) => {
        if (d.split(/\r?\n/).some((l) => l.trim().toLowerCase().startsWith(lw))) { dup = true; return d; }
        return d.replace(/\s*$/, "\n") + line + "\n";
      });
      if (dup) { new Notice(__ertr("Уже в словаре: {0}", short)); return; }
    }
    new Notice(__ertr("В словарь: {0}", short));
  } catch (e) {
    new Notice(__ertr("Не удалось записать в словарь: {0}", e && e.message ? e.message : String(e)));
  }
}

// ── Reading in the daily note ───────────────────────────────────────────────
// Which books were read today, how long and how far — one block in today's
// daily note, rewritten in place, never a second copy. Only an existing daily
// note is touched: creating it is the daily-notes plugin's job (templates).
// Чтение за день — в ежедневную заметку.
function erDayTouch(plugin, path5, pct) {
  const s = plugin.settings;
  if (!path5) return;
  const day = readerTodayKey();
  const all = s.readingDays || (s.readingDays = {});
  const d = all[day] || (all[day] = {});
  const e = d[path5] || (d[path5] = { sec: 0, from: pct, to: pct });
  if (typeof pct === "number") { if (typeof e.from !== "number") e.from = pct; e.to = pct; }
  const keys = Object.keys(all).sort();
  while (keys.length > 14) delete all[keys.shift()];
  plugin._dayDirty = true;
}
function erDayTime(plugin, path5, sec) {
  erDayTouch(plugin, path5, null);
  const d = plugin.settings.readingDays[readerTodayKey()][path5];
  d.sec = (d.sec || 0) + sec;
}
function erDailyNoteFile(app) {
  try {
    let folder = "", format = "YYYY-MM-DD";
    const core = app.internalPlugins && app.internalPlugins.getPluginById && app.internalPlugins.getPluginById("daily-notes");
    const per = app.plugins && app.plugins.plugins && app.plugins.plugins["periodic-notes"];
    if (per && per.settings && per.settings.daily && per.settings.daily.enabled) {
      folder = per.settings.daily.folder || ""; format = per.settings.daily.format || format;
    } else if (core && core.enabled && core.instance && core.instance.options) {
      folder = core.instance.options.folder || ""; format = core.instance.options.format || format;
    } else return null;
    const name = window.moment().format(format);
    const f = app.vault.getAbstractFileByPath(erPath((folder ? folder.replace(/\/+$/, "") + "/" : "") + name + ".md"));
    return f instanceof TFile ? f : null;
  } catch { return null; }
}
async function erDailyLogFlush(plugin) {
  if (plugin.settings.dailyLog !== true || !plugin._dayDirty) return;
  const d = (plugin.settings.readingDays || {})[readerTodayKey()];
  if (!d || !Object.keys(d).length) return;
  const note = erDailyNoteFile(plugin.app);
  if (!note) return;
  plugin._dayDirty = false;
  const rows = [];
  let total = 0;
  for (const [p, e] of Object.entries(d)) {
    const f = plugin.app.vault.getAbstractFileByPath(p);
    if (!(f instanceof TFile)) continue;
    total += e.sec || 0;
    const name = bookNoteLinkFor(plugin, f);
    const link = name ? `[[${name}]]` : `[[${f.path}|${erBookTitle(f)}]]`;
    const pct = (x) => Math.round((Number(x) || 0) * 100) + "%";
    const bits = [];
    if (e.sec >= 60) bits.push(__ertr("{0} мин", Math.round(e.sec / 60)));
    if (typeof e.from === "number" && typeof e.to === "number") bits.push(pct(e.from) !== pct(e.to) ? `${pct(e.from)} → ${pct(e.to)}` : pct(e.to));
    rows.push(`- ${link}${bits.length ? " — " + bits.join(", ") : ""}`);
  }
  if (!rows.length) return;
  const head = total >= 60 ? __ertr("📖 Чтение: {0} мин", Math.round(total / 60)) : __ertr("📖 Чтение");
  const block = ["%%er-reading%%", head, ...rows, "%%/er-reading%%"].join("\n");
  try {
    await plugin.app.vault.process(note, (data) => {
      const re = /%%er-reading%%[\s\S]*?%%\/er-reading%%/;
      return re.test(data) ? data.replace(re, () => block) : data.replace(/\s*$/, "\n\n") + block + "\n";
    });
  } catch (e) { console.warn("Book Reader: daily note update failed", e); }
}

// ── «Что было раньше» ───────────────────────────────────────────────────────
// A recap of the pages before this one through the AI breakdown — only of what
// has been read, so nothing ahead is given away.
// Пересказ прочитанного без спойлеров.
function erAiRecap(view) {
  const s = view.plugin.settings;
  if (!s.aiEnabled || !view.pager || !view.pager.flow) return;
  const blocks = view.pager.flow.querySelectorAll("p,h1,h2,h3,h4");
  let cur = 0;
  try { cur = Math.max(0, view.pager.currentBlockIndex()); } catch { /* start */ }
  const parts = [];
  let len = 0;
  for (let i = cur; i >= 0 && len < 7000; i--) {
    const t = (blocks[i] && blocks[i].textContent || "").trim();
    if (!t) continue;
    parts.unshift(t);
    len += t.length;
  }
  if (!parts.length) { new Notice(__ertr("Пока нечего пересказывать — это начало книги.")); return; }
  const modal = new AiExplainModal(view.app, view.plugin, parts.join("\n\n"), view.file);
  modal.open();
  window.setTimeout(() => {
    modal._send(__ertr("Кратко перескажи, что произошло в этом отрывке: главное, кто есть кто, к чему пришли. Не додумывай то, чего в тексте нет, и ничего не говори о том, что будет дальше."), __ertr("Напомни, что было"));
  }, 400);
}

// ── Keys in the device's secret storage (Obsidian 1.11.4+) ──────────────────
// Off by default: the device's store does not sync, so a key put there has to
// be entered once on every device. When on, the keys never reach data.json.
// Ключи в защищённом хранилище устройства.
const ER_SECRET_IDS = { aiKey: "elton-reader-ai-key", ttsKey: "elton-reader-tts-key" };
function erSecretsAvailable(app) {
  return !!(app && app.secretStorage && typeof app.secretStorage.getSecret === "function" && typeof app.secretStorage.setSecret === "function");
}
function erBindSecrets(plugin) {
  const s = plugin.settings;
  const ss = plugin.app.secretStorage;
  if (s.keysInSecretStorage !== true || !erSecretsAvailable(plugin.app)) return;
  for (const [k, id] of Object.entries(ER_SECRET_IDS)) {
    const own = Object.getOwnPropertyDescriptor(s, k);
    if (own && own.get) continue;
    const plain = own ? own.value : "";
    if (plain) { try { ss.setSecret(id, String(plain)); } catch { continue; } }
    // Not enumerable: JSON.stringify leaves it out, so data.json never holds it.
    Object.defineProperty(s, k, {
      configurable: true,
      enumerable: false,
      get: () => { try { return ss.getSecret(id) || ""; } catch { return ""; } },
      set: (v) => { try { ss.setSecret(id, String(v || "")); } catch { /* store refused */ } }
    });
  }
}
function erUnbindSecrets(plugin) {
  const s = plugin.settings;
  for (const k of Object.keys(ER_SECRET_IDS)) {
    const d = Object.getOwnPropertyDescriptor(s, k);
    if (!d || !d.get) continue;
    const v = d.get();
    Object.defineProperty(s, k, { configurable: true, enumerable: true, writable: true, value: v });
  }
}
// ── ✨ in the top bar: the AI about this book ───────────────────────────────
// One place for everything the AI can do with the book: ask about it (it knows
// the title and sees the page on screen), recap what was read, break down the
// selection; plus copying the selection as a quote. Shown when the AI is on.
// Кнопка ИИ в верхней панели.
function erPageText(view, max) {
  const flow = view.pager && view.pager.flow;
  if (!flow || !view.areaEl) return "";
  const a = view.areaEl.getBoundingClientRect();
  const out = [];
  let len = 0;
  for (const el of flow.querySelectorAll("p,h1,h2,h3,h4")) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom) continue;
    const t = (el.textContent || "").trim();
    if (!t) continue;
    out.push(t);
    len += t.length;
    if (len > (max || 4000)) break;
  }
  return out.join("\n\n");
}
function erAiButton(view, host) {
  const b = host.createDiv("er-ibtn er-ai-btn");
  b.toggle(view.plugin.settings.aiEnabled === true);
  svgIcon(b, "sparkles");
  b.setAttribute("aria-label", __ertr("ИИ о книге"));
  let grab = null;
  b.addEventListener("pointerdown", (e) => {
    grab = erTtsGrab(view);
    if (e.pointerType === "mouse") e.preventDefault();
  });
  b.addEventListener("click", (e) => {
    const sel = grab && grab.parts && grab.parts.length ? grab.parts : null;
    grab = null;
    const menu = new Menu();
    menu.addItem((it) => it.setTitle(__ertr("Спросить о книге")).setIcon("message-circle").onClick(() => {
      const page = erPageText(view, 4000);
      new AiExplainModal(view.app, view.plugin, page || erBookTitle(view.file), view.file).open();
    }));
    if (view.plugin.settings.aiRecap !== false) menu.addItem((it) => it.setTitle(__ertr("Напомнить, что было")).setIcon("history").onClick(() => erAiRecap(view)));
    if (sel) {
      const text = sel.map((p) => p.text).join("\n\n");
      menu.addSeparator();
      menu.addItem((it) => it.setTitle(__ertr("Разобрать выделенное")).setIcon("sparkles").onClick(() => new AiExplainModal(view.app, view.plugin, text, view.file).open()));
      menu.addItem((it) => it.setTitle(__ertr("Скопировать как цитату")).setIcon("text-quote").onClick(async () => {
        const md = quoteMarkdown(view.plugin, { text, block: sel[0].block }, view.file);
        const ok = md && await copyToClipboard(md);
        new Notice(ok ? __ertr("Цитата скопирована ✓ — вставьте в любую заметку") : __ertr("Не удалось скопировать"));
      }));
    }
    menu.showAtMouseEvent(e);
  });
}
// ── «Без панелей» on a computer ─────────────────────────────────────────────
// Readers asked for the bars to go and the book to have the whole window
// (NocoDB). The bars lie over the text, hidden; the pointer at the top or
// bottom edge brings them back, moving away hides them. The phone has had the
// same as «Полноэкранное чтение».
// Режим без панелей на компьютере.
function erDesktopNoBars(view, on) {
  const root = view.contentEl;
  if (!root) return;
  const was = root.hasClass("er-fs");
  root.toggleClass("er-fs", on);
  root.toggleClass("er-chrome-off", on);
  if (!view._nbMove) {
    view._nbMove = (e) => {
      if (!root.hasClass("er-fs")) return;
      const r = root.getBoundingClientRect();
      const fromTop = e.clientY - r.top, fromBottom = r.bottom - e.clientY;
      if (fromTop < 28 || fromBottom < 28) root.removeClass("er-chrome-off");
      else if (fromTop > 96 && fromBottom > 96 && !view.panelOpen && !root.querySelector(".er-top:hover, .er-bot:hover")) root.addClass("er-chrome-off");
    };
    view.registerDomEvent(root, "mousemove", view._nbMove);
  }
  if (was !== on && view.bookHtml && typeof view.repaginate === "function") view.repaginate();
}
function erToggleNoBars(view) {
  const s = view.plugin.settings;
  if (typeof view._applyFullscreen === "function") {
    s.mobileFullscreen = !s.mobileFullscreen;
    view._applyFullscreen();
  } else {
    s.desktopNoBars = !s.desktopNoBars;
    erDesktopNoBars(view, s.desktopNoBars === true);
  }
  view.plugin.saveAll();
}
function erToggleAutoScroll(view, force) {
  const st = view.plugin.settings;
  const stop = () => {
    if (!view._auto) return;
    window.cancelAnimationFrame(view._auto.raf);
    window.clearInterval(view._auto.iv);
    if (view._auto.pill) view._auto.pill.remove();
    view._auto = null;
  };
  if (view._auto || force === false) { stop(); return; }
  const pager = view.pager;
  if (!pager || !pager.flow || !view.bookHtml) return;
  const a = view._auto = {};
  const pill = a.pill = view.contentEl.createDiv("er-auto-pill");
  const btn = (txt, label, fn) => {
    const b = pill.createEl("button", { text: txt });
    b.setAttribute("aria-label", label);
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  btn("−", __ertr("Медленнее"), () => change(-1));
  const lbl = pill.createSpan({ cls: "er-auto-lbl" });
  btn("+", __ertr("Быстрее"), () => change(+1));
  btn("■", __ertr("Остановить автопрокрутку"), stop);
  const paint = () => lbl.setText(pager.scrollMode
    ? __ertr("{0} пикс/с", st.autoScrollSpeed || 30)
    : __ertr("стр. каждые {0} с", st.autoPageSec || 30));
  const change = (d) => {
    if (pager.scrollMode) st.autoScrollSpeed = Math.max(5, Math.min(200, (st.autoScrollSpeed || 30) + d * 5));
    else { st.autoPageSec = Math.max(5, Math.min(300, (st.autoPageSec || 30) - d * 5)); restart(); }
    paint();
    view.plugin._saveLocalData();
  };
  const restart = () => {
    window.clearInterval(a.iv);
    a.iv = window.setInterval(() => {
      if (pager.spread >= pager.total - 1) { stop(); return; }
      (view.nav || view._nav).call(view, "next");
    }, (st.autoPageSec || 30) * 1000);
  };
  paint();
  if (pager.scrollMode) {
    let last = performance.now();
    let carry = 0;
    const step = (now) => {
      if (!view._auto) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      carry += (st.autoScrollSpeed || 30) * dt;
      const whole = Math.floor(carry);
      if (whole >= 1) {
        carry -= whole;
        const c = pager.clip;
        const before = c.scrollTop;
        c.scrollTop = before + whole;
        if (c.scrollTop === before && before > 0) { stop(); return; }
      }
      a.raf = window.requestAnimationFrame(step);
    };
    a.raf = window.requestAnimationFrame(step);
  } else {
    restart();
  }
}
// Full-screen reading on a phone: the bars float over the page and step aside
// while you read; a tap in the middle of the page brings them back. Asked for
// as "hide the top and bottom bars while paging" and "move the page number up
// to free room for text" — the page gets the whole screen, a small page number
// stays in the corner.
// PDF only: switch this book between extracted text and original pages.
function erPdfModeMenuItem(view, menu) {
  if (!view.file || view.file.extension !== "pdf") return;
  const st = view.plugin.settings;
  const on = !!(st.pdfOriginal && st.pdfOriginal[view.file.path]);
  menu.addItem((it) => it.setTitle(on ? __ertr("PDF: показывать текст") : __ertr("PDF: страницы как в оригинале")).setIcon(on ? "text" : "image").onClick(async () => {
    const m = st.pdfOriginal || (st.pdfOriginal = {});
    if (on) delete m[view.file.path]; else m[view.file.path] = true;
    await view.plugin.saveAll();
    new Notice(on ? __ertr("Книга снова показывается текстом") : __ertr("Страницы показываются как в оригинале. Заметку со страницы — кнопкой в её углу."));
    if (typeof view._loadBook === "function") await view._loadBook();
    else await view.openFile(view.file);
  }));
}
function erIsFullscreen(view) {
  return !!(view && view.contentEl && view.contentEl.hasClass("er-fs"));
}
function erToggleChrome(view, show) {
  const root = view.contentEl;
  if (!root || !erIsFullscreen(view)) return;
  const on = show === undefined ? root.hasClass("er-chrome-off") : show;
  root.toggleClass("er-chrome-off", !on);
}
// Стилус как маркер (NocoDB: «аннотации Apple Pencil на iPad»). Провёл
// стилусом по тексту — он выделен цветом по умолчанию, без панели и меню, как
// маркером по бумаге. Палец работает как обычно: листает и выделяет.
// Apple Pencil в Safari и стилусы на Android приходят как pointerType "pen";
// параллельные касания с touchType "stylus" не должны листать страницу.
// Включается в настройках: «Стилус как маркер».
function erStylusMarker(view) {
  const area = view.areaEl;
  if (!area) return;
  const on = () => view.plugin.settings.stylusMarker === true;
  let start = null;
  const caretAt = (x, y) => {
    const d = docOf(area);
    if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
    if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      if (!p) return null;
      const r = d.createRange();
      r.setStart(p.offsetNode, p.offset);
      return r;
    }
    return null;
  };
  const extend = (e) => {
    const r = caretAt(e.clientX, e.clientY);
    if (!r || !start || !area.contains(r.startContainer)) return;
    const sel = selOf(area);
    if (sel) sel.setBaseAndExtent(start.startContainer, start.startOffset, r.startContainer, r.startOffset);
  };
  area.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "pen" || !on()) return;
    const r = caretAt(e.clientX, e.clientY);
    if (!r || !area.contains(r.startContainer)) return;
    start = r;
    e.preventDefault();
    e.stopPropagation();
    try { area.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
  }, true);
  area.addEventListener("pointermove", (e) => {
    if (!start || e.pointerType !== "pen") return;
    e.preventDefault();
    extend(e);
  }, true);
  area.addEventListener("pointerup", (e) => {
    if (!start || e.pointerType !== "pen") return;
    e.preventDefault();
    e.stopPropagation();
    extend(e);
    start = null;
    view._penAt = Date.now();
    const sel = selOf(area);
    if (!sel || sel.isCollapsed || !String(sel).trim()) return;
    // A marker covers whole words: the pen's ends are snapped to word edges.
    try {
      const r = sel.getRangeAt(0).cloneRange();
      const word = (ch) => !!ch && /[\p{L}\p{N}'-]/u.test(ch);
      if (r.startContainer.nodeType === 3) { const t = r.startContainer.textContent; let i = r.startOffset; while (i > 0 && word(t[i - 1])) i--; r.setStart(r.startContainer, i); }
      if (r.endContainer.nodeType === 3) { const t = r.endContainer.textContent; let j = r.endOffset; while (j < t.length && word(t[j])) j++; r.setEnd(r.endContainer, j); }
      sel.removeAllRanges();
      sel.addRange(r);
    } catch { /* keep the raw stroke */ }
    view._onSelectionCheck();
    if (view._pendingSel) view._applyPopupColor(view.plugin.settings.defaultHlColor || HL_COLORS[0].id);
  }, true);
  area.addEventListener("pointercancel", () => { start = null; }, true);
  // The pen's own click and touches must not also turn the page.
  area.addEventListener("click", (e) => {
    if (view._penAt && Date.now() - view._penAt < 500) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // iPadOS: without preventDefault on the pen's touchmove, Scribble and scrolling
  // take over and pointermove arrives with gaps (WebKit bug 217430, Apple
  // developer forums thread 662874). Only the stylus is held; a finger is not.
  // Chrome on Android has no touchType: a pen is known from its pointerdown,
  // which comes first. Without preventDefault on the pen's touches the browser
  // claims the stroke for scrolling or its own text selection and sends
  // pointercancel half-way (seen on the Android emulator with adb's stylus).
  const stylusTouch = (e) => {
    if (!on()) return;
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    const pen = !!start || !!(t && t.touchType === "stylus");
    if (e.type === "touchstart") penTouch = pen;
    if (!pen && !penTouch) return;
    if (e.type !== "touchend" && e.cancelable) e.preventDefault();
    if (e.type === "touchend") penTouch = false;
    e.stopImmediatePropagation();
  };
  let penTouch = false;
  for (const ev of ["touchstart", "touchmove", "touchend"]) area.addEventListener(ev, stylusTouch, { capture: true, passive: false });
}
function handleAreaNavClick(view, e) {
  if (erIsFullscreen(view)) {
    const target = e.target instanceof HTMLElement ? e.target : null;
    const sel0 = selOf(view.areaEl);
    const busy = (target && target.closest("img,a,.er-hl,.er-hl-popup,.er-auto-pill,[data-er-ref],.er-note-back"))
      || (sel0 && !sel0.isCollapsed && sel0.toString().trim());
    const r0 = view.areaEl.getBoundingClientRect();
    const x0 = e.clientX - r0.left;
    const centre = r0.width && x0 > r0.width * 0.32 && x0 < r0.width * 0.68;
    if (!busy && (centre || (view.plugin.settings.navMode || "buttons") !== "click")) {
      erToggleChrome(view);
      if (centre) return true;
    }
  }
  if ((view.plugin.settings.navMode || "buttons") !== "click") return false;
  // Not while scrolling. Tapping the side of the page to turn it fights a
  // scroller: a finger that stops moving reads as a tap, and the reader jumps a
  // screenful away from where they were reading. The stylesheet already said the
  // side zones are off in this mode; the code did not know.
  if (view.pager && view.pager.scrollMode) return false;
  if (e.target instanceof HTMLElement && e.target.closest("img,.er-hl,.er-hl-popup")) return false;
  const sel = selOf(view.areaEl);
  if (sel && !sel.isCollapsed && sel.toString().trim()) return false;
  const r = view.areaEl.getBoundingClientRect();
  if (!r.width) return false;
  const x = e.clientX - r.left;
  const goNext = () => view.nav ? view.nav("next") : view._nav("next");
  const goPrev = () => view.nav ? view.nav("prev") : view._nav("prev");
  if (x < r.width * 0.32) { goPrev(); return true; }
  if (x > r.width * 0.68) { goNext(); return true; }
  return false;
}
// Add the "Листание" (nav mode) and "Цель чтения" (daily goal) sections to a
// reader's settings panel. Shared by both reader classes.
// The three settings that belong to THIS book. They used to sit inside the
// help dialog, which is a reference screen — editable fields had no business
// being there. Rendered at the end of the reading panel's advanced group.
function buildBookSettings(view, p) {
  if (!view.plugin || !view.file) return;
  // Forget just THIS book, so the setup screen can be tried again without
  // wiping every link in the vault (the settings tab has the "forget all"
  // version). Handy while setting a book up — and the only alternative used to
  // be renaming the file on disk.
      p.createDiv("er-info-group").setText(__ertr("Заметка книги для ссылок"));
      const bnWrap = p.createDiv("er-info-booknote");
      const bnHint = bnWrap.createDiv("er-info-rowdesc");
      bnHint.setText(__ertr("Куда вести ссылку «— из [[…]]» в заметках из выделений. Пусто — имя файла книги."));
      bnHint.addClass("er-panel-hint");
      const bnInput = bnWrap.createEl("input", { type: "text" });
      bnInput.addClass("er-panel-input");
      bnInput.placeholder = view.file ? view.file.basename : __ertr("Сначала откройте книгу…");
      bnInput.disabled = !view.file;
      if (view.file) {
        const map = view.plugin.settings.bookNoteLinks || {};
        bnInput.value = map[view.file.path] || "";
      }
      const saveBookNote = async () => {
        if (!view.file) return;
        if (!view.plugin.settings.bookNoteLinks) view.plugin.settings.bookNoteLinks = {};
        const v = bnInput.value.trim().replace(/^\[\[|\]\]$/g, "").trim();
        if (v) view.plugin.settings.bookNoteLinks[view.file.path] = v;
        else delete view.plugin.settings.bookNoteLinks[view.file.path];
        await view.plugin.saveAll();
        // Mirror it into the note, so the binding is visible in the vault.
        if (v) await writeBookProperty(view.app, v, view.file);
      };
      bnInput.addEventListener("change", saveBookNote);
      bnInput.addEventListener("blur", saveBookNote);
      // Two ways out, side by side — picking an existing note was the only one
      // before, which left readers stuck when the note didn't exist yet.
      const bnActions = bnWrap.createDiv("er-booknote-actions");
      bnActions.addClass("er-panel-actions");
      const bnNew = bnActions.createDiv("er-booknote-pick");
      bnNew.setText(__ertr("+ Создать новую"));
      bnNew.addClass("er-panel-link-strong");
      bnNew.addEventListener("click", async () => {
        if (!view.file) return;
        const folder = bookNotesFolderPath(view.app) || notesFolderPath(view.app) || "";
        const note = await view.plugin.createBookNote(view.file, view.file.basename, folder);
        if (note) {
          bnInput.value = note.basename;
          new Notice(__ertr("Заметка книги создана: {0}", note.basename));
        }
      });
      const bnPick = bnActions.createDiv("er-booknote-pick");
      bnPick.setText(__ertr("Выбрать из списка…"));
      bnPick.addClass("er-panel-link");
      bnPick.addEventListener("click", () => {
        if (!view.file) return;
        const files = bookNoteFiles(view.app);
        if (!files.length) { const bf = bookNotesFolderPath(view.app); new Notice(bf ? __ertr("Нет заметок в «{0}»", (bf)) : __ertr("В хранилище нет заметок")); return; }
        new BookNotePicker(view.app, files, async (chosen) => {
          if (!view.plugin.settings.bookNoteLinks) view.plugin.settings.bookNoteLinks = {};
          view.plugin.settings.bookNoteLinks[view.file.path] = chosen.basename;
          await view.plugin.saveAll();
          await writeBookProperty(view.app, chosen.basename, view.file);
          bnInput.value = chosen.basename;
          new Notice(__ertr("Заметка книги: {0}", (chosen.basename)));
        }).open();
      });

      // ── Category (groups books in the library) ──────────────────────────────
      p.createDiv("er-info-group").setText(__ertr("Категория"));
      const tgWrap = p.createDiv("er-info-booknote");
      const tgHint = tgWrap.createDiv("er-info-rowdesc");
      tgHint.setText(__ertr("Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Пусто — без категории."));
      tgHint.addClass("er-panel-hint");
      const tgInput = tgWrap.createEl("input", { type: "text" });
      tgInput.addClass("er-panel-input");
      tgInput.placeholder = __ertr("Например: Психология, Бизнес");
      tgInput.disabled = !view.file;
      if (view.file) tgInput.value = bookTagsOf(view.plugin.settings, view.file.path).join(", ");
      const knownTags = allBookTags(view.plugin.settings);
      if (knownTags.length) {
        const dl = tgWrap.createEl("datalist");
        dl.id = "er-info-tags-" + Math.random().toString(36).slice(2, 8);
        knownTags.forEach((t) => dl.createEl("option", { value: t }));
        tgInput.setAttr("list", dl.id);
      }
      const saveTags = async () => {
        if (!view.file) return;
        await view.plugin.setBookTags(view.file.path, parseBookTags(tgInput.value));
      };
      tgInput.addEventListener("change", saveTags);
      tgInput.addEventListener("blur", saveTags);

      // ── Per-book template override ──────────────────────────────────────────
      p.createDiv("er-info-group").setText(__ertr("Шаблон для этой книги"));
      const tpWrap = p.createDiv("er-info-booknote");
      const tpHint = tpWrap.createDiv("er-info-rowdesc");
      tpHint.setText(__ertr("Свой шаблон только для этой книги (например, под жанр). Пусто — используется общий шаблон из настроек плагина."));
      tpHint.addClass("er-panel-hint");
      const tpInput = tpWrap.createEl("input", { type: "text" });
      tpInput.addClass("er-panel-input");
      tpInput.placeholder = (view.plugin.settings.noteTemplate || "").trim() || __ertr("Templates/Шаблон.md");
      tpInput.disabled = !view.file;
      if (view.file) {
        const tmap = view.plugin.settings.bookTemplates || {};
        tpInput.value = tmap[view.file.path] || "";
      }
      const saveBookTemplate = async () => {
        if (!view.file) return;
        if (!view.plugin.settings.bookTemplates) view.plugin.settings.bookTemplates = {};
        const v = tpInput.value.trim();
        if (v) view.plugin.settings.bookTemplates[view.file.path] = v;
        else delete view.plugin.settings.bookTemplates[view.file.path];
        await view.plugin.saveAll();
      };
      tpInput.addEventListener("change", saveBookTemplate);
      tpInput.addEventListener("blur", saveBookTemplate);
      const tpPick = tpWrap.createDiv("er-booknote-pick");
      tpPick.setText(__ertr("Выбрать из списка…"));
      tpPick.addClass("er-panel-link-spaced");
      tpPick.addEventListener("click", () => {
        if (!view.file) return;
        const files = view.app.vault.getMarkdownFiles();
        if (!files.length) { new Notice(__ertr("В хранилище нет заметок")); return; }
        new TemplatePicker(view.app, files, async (chosen) => {
          if (!view.plugin.settings.bookTemplates) view.plugin.settings.bookTemplates = {};
          view.plugin.settings.bookTemplates[view.file.path] = chosen.path;
          await view.plugin.saveAll();
          tpInput.value = chosen.path;
          new Notice(__ertr("Шаблон книги: {0}", (chosen.basename)));
        }).open();
      });
  const resetRow = p.createDiv("er-pan-hint er-rs-reset");
  const resetLink = resetRow.createSpan({ text: __ertr("Забыть настройки этой книги") });
  resetLink.addClass("er-inline-link");
  resetLink.addEventListener("click", async () => {
    const s = view.plugin.settings;
    const path5 = view.file.path;
    if (s.bookNoteLinks) delete s.bookNoteLinks[path5];
    if (s.bookNotePrompted) delete s.bookNotePrompted[path5];
    if (s.bookTags) delete s.bookTags[path5];
    if (s.bookTemplates) delete s.bookTemplates[path5];
    await view.plugin.saveAll();
    new Notice(__ertr("Настройки книги сброшены — окно появится при следующем открытии"));
  });
}
// A collapsible section inside the reading panel, styled like "Доп. настройки".
// Returns the body element to fill. The open/closed state is remembered in
// settings under `settingKey` so the panel reopens the way it was left.
// Shared by both readers — the desktop panel and the mobile sheet.
function panelSection(view, p, { label, emoji, settingKey, defaultOpen = false }) {
  const hdr = p.createDiv("er-pan-adv-hdr");
  if (emoji) hdr.createSpan({ cls: "er-pan-adv-ic", text: emoji });
  hdr.createSpan({ cls: "er-pan-adv-lbl", text: label });
  // Collapsed sections hide whether there is anything inside, so the header
  // carries a count that the section's own render fills in.
  const count = hdr.createSpan({ cls: "er-pan-adv-count" });
  const car = hdr.createSpan({ cls: "er-pan-adv-car", text: "›" });
  const wrap = p.createDiv("er-pan-adv");
  // The open/close animation needs exactly ONE child to size against.
  const body = wrap.createDiv("er-pan-adv-body");
  body._erCount = count;
  const stored = view.plugin.settings[settingKey];
  if (stored === void 0 ? defaultOpen : stored) {
    wrap.addClass("er-pan-adv-on");
    car.addClass("er-pan-adv-car-on");
  }
  hdr.addEventListener("click", async () => {
    const on = wrap.hasClass("er-pan-adv-on");
    wrap.toggleClass("er-pan-adv-on", !on);
    car.toggleClass("er-pan-adv-car-on", !on);
    view.plugin.settings[settingKey] = !on;
    // Local-only write: this is a UI preference, not reading data, so it must not
    // trigger the folder/progress machinery that saveAll() drives.
    await view.plugin._saveLocalData();
  });
  return body;
}
// The reading-panel settings, one piece per setting, so the tabbed settings
// window can put each where it belongs. buildReaderExtraSettings keeps the old
// all-in-one order for the side panels.
function buildReaderExtraSettings(view, p) {
  erRsNavMode(view, p);
  erRsAlign(view, p);
  erRsVAlign(view, p);
  erRsGoal(view, p);
  buildBookSettings(view, p);
}
function erRsNavMode(view, p) {
  const s = view.plugin.settings;
  const sec = (l) => p.createDiv("er-pan-sec").setText(l);
  sec(__ertr("Листание"));
  const navRow = p.createDiv("er-col-row");
  [["buttons", __ertr("Кнопками")], ["click", __ertr("По клику")]].forEach(([v, label]) => {
    const btn = navRow.createDiv("er-col-btn");
    btn.setText(label);
    if ((s.navMode || "buttons") === v) btn.addClass("active");
    btn.addEventListener("click", async () => {
      s.navMode = v;
      await view.plugin.saveAll();
      navRow.querySelectorAll(".er-col-btn").forEach((b) => b.removeClass("active"));
      btn.addClass("active");
      (view.contentEl || view.containerEl).classList.toggle("er-navclick", v === "click");
    });
  });
  p.createDiv("er-pan-hint").setText(__ertr("«По клику»: клик по левой части страницы — назад, по правой — вперёд. Центр свободен для выделения текста."));
}
function erRsAlign(view, p) {
  const s = view.plugin.settings;
  const sec = (l) => p.createDiv("er-pan-sec").setText(l);
  sec(__ertr("Выравнивание текста"));
  const alRow = p.createDiv("er-col-row");
  [["left", __ertr("Слева")], ["justify", __ertr("По ширине")], ["center", __ertr("По центру")], ["right", __ertr("Справа")]].forEach(([v, label]) => {
    const btn = alRow.createDiv("er-col-btn");
    btn.setText(label);
    if ((s.textAlign || "left") === v) btn.addClass("active");
    btn.addEventListener("click", async () => {
      s.textAlign = v;
      await view.plugin.saveAll();
      alRow.querySelectorAll(".er-col-btn").forEach((b) => b.removeClass("active"));
      btn.addClass("active");
      if (view.bookHtml && typeof view.repaginate === "function") await view.repaginate();
    });
  });
}
function erRsVAlign(view, p) {
  const s = view.plugin.settings;
  const sec = (l) => p.createDiv("er-pan-sec").setText(l);
  sec(__ertr("Положение на странице"));
  const vaRow = p.createDiv("er-col-row");
  [["top", __ertr("Сверху")], ["center", __ertr("По центру")], ["bottom", __ertr("Снизу")]].forEach(([v, label]) => {
    const btn = vaRow.createDiv("er-col-btn");
    btn.setText(label);
    if ((s.vAlign || "top") === v) btn.addClass("active");
    btn.addEventListener("click", async () => {
      s.vAlign = v;
      await view.plugin.saveAll();
      vaRow.querySelectorAll(".er-col-btn").forEach((b) => b.removeClass("active"));
      btn.addClass("active");
      if (view.bookHtml && typeof view.repaginate === "function") await view.repaginate();
      else if (view.bookHtml && typeof view._repaginate === "function") await view._repaginate();
    });
  });
  p.createDiv("er-pan-hint").setText(__ertr("Куда прижимать текст, если страница заполнена не до конца — например, в конце главы."));
}
function erRsGoal(view, p) {
  const s = view.plugin.settings;
  const sec = (l) => p.createDiv("er-pan-sec").setText(l);
  sec(__ertr("Цель чтения"));
  const onRow = p.createDiv("er-col-row");
  const goalStep = p.createDiv("er-sz-row");
  [["on", __ertr("Вкл")], ["off", __ertr("Выкл")]].forEach(([v, label]) => {
    const btn = onRow.createDiv("er-col-btn");
    btn.setText(label);
    const isOn = v === "on";
    if (!!s.timerEnabled === isOn) btn.addClass("active");
    btn.addEventListener("click", async () => {
      s.timerEnabled = isOn;
      await view.plugin.saveAll();
      onRow.querySelectorAll(".er-col-btn").forEach((b) => b.removeClass("active"));
      btn.addClass("active");
      goalStep.style.opacity = isOn ? "1" : ".45";
      updateGoalBar(view);
    });
  });
  const gM = goalStep.createDiv("er-sz-btn"); gM.setText("−");
  const gL = goalStep.createDiv("er-sz-label");
  const gP = goalStep.createDiv("er-sz-btn"); gP.setText("+");
  const setGL = () => gL.setText(__ertr("{0} мин/день", (s.dailyGoalMin || 15)));
  setGL();
  goalStep.style.opacity = s.timerEnabled ? "1" : ".45";
  const chG = async (d) => {
    s.dailyGoalMin = Math.min(180, Math.max(5, (s.dailyGoalMin || 15) + d));
    setGL();
    await view.plugin.saveAll();
    updateGoalBar(view);
  };
  gM.addEventListener("click", () => chG(-5));
  gP.addEventListener("click", () => chG(5));
  const mins = Math.floor(view.plugin.getTodaySeconds() / 60);
  const totalMin = Math.floor(view.plugin.getTotalSeconds() / 60);
  const totalH = Math.floor(totalMin / 60);
  const totalStr = totalH > 0 ? __ertr("{0} ч {1} мин", totalH, totalMin % 60) : __ertr("{0} мин", totalMin);
  p.createDiv("er-pan-hint").setText(__ertr("Сегодня прочитано: {0} мин. Всего за всё время: {1}. Кнопка ▶ вверху запускает обратный отсчёт до цели (пауза — ⏸).", (mins), totalStr));
}
// Quotes too, not only & < >. Everything this produces is interpolated into
// markup that is then parsed, and much of it lands inside a double-quoted
// attribute (an image's src, a footnote id). Without &quot; a book could close
// that attribute early and add one of its own — `onerror=…` on an image — and
// the reader runs inside Obsidian's renderer, where that is code with access to
// the whole machine. Reported with a working sample (PR #2).
function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// Only pictures the book carries inside itself. A remote address in an EPUB
// would make the reader fetch it the moment the page is drawn — a tracking
// beacon, or a probe of the reader's local network — and the README promises
// that a book is read offline.
function erSafeImgSrc(src) {
  // eslint-disable-next-line no-control-regex -- control characters are what a URL can hide its scheme behind
  let s = String(src || "").replace(/[\x00-\x20]+/g, "");
  // A picture stored without an extension (Wikisource exports name them
  // "…_utm_content_thumbnail") comes out of epub.js as data:text/plain. The
  // bytes say what it really is, so the type is read from them — anything that
  // is not a known picture still does not pass.
  const m = /^data:([^;,]*);base64,(.{0,16})/i.exec(s);
  if (m && !/^image\//i.test(m[1])) {
    const head = m[2];
    const real = head.startsWith("iVBORw0KGgo") ? "image/png"
      : head.startsWith("/9j/") ? "image/jpeg"
      : head.startsWith("R0lGOD") ? "image/gif"
      : head.startsWith("UklGR") ? "image/webp"
      : head.startsWith("Qk") ? "image/bmp"
      : "";
    if (real) s = `data:${real};base64,` + s.slice(s.indexOf(",") + 1);
  }
  return /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);/i.test(s) ? s : "";
}
// Copy text to the clipboard, with a fallback for older/mobile webviews where
// navigator.clipboard may be unavailable or blocked.
async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* optional step; a failure here must not interrupt reading */ }
  try {
    const ta = activeDocument.createElement("textarea");
    ta.value = text;
    ta.addClass("er-offscreen");
    activeDocument.body.appendChild(ta);
    ta.select();
    const ok = activeDocument.execCommand("copy");
    activeDocument.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
// Open an image full-screen over everything (works on desktop and the mobile
// modal). Tap the image again to zoom to 100% (then pan); tap the backdrop, the
// ✕, or press Esc to close. Used for illustration pages that are too small to
// read inside a reading column.
function openImageLightbox(src, app, ownerEl) {
  if (!src) return;
  const doc = docOf(ownerEl);
  const ov = doc.createElement("div");
  ov.className = "er-lightbox";
  // Image is a direct flex child centered with margin:auto. Unlike
  // align-items/justify-content:center, margin:auto keeps the top-left edge
  // reachable when the (zoomed) image is larger than the screen, so you can
  // scroll to every part of it.
  const img = ov.createEl("img");
  img.src = src;
  const closeBtn = ov.createDiv("er-lightbox-close");
  closeBtn.setText("✕");
  const hint = ov.createDiv("er-lightbox-hint");
  hint.setText(__ertr("Тап по картинке — увеличить · фон или ✕ — закрыть"));
  let closed = false;
  let scope = null;
  const remove = () => {
    if (closed) return;
    closed = true;
    if (scope && app && app.keymap) { try { app.keymap.popScope(scope); } catch { /* optional step; a failure here must not interrupt reading */ } }
    doc.removeEventListener("keydown", onKey, true);
    ov.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); remove(); }
  };
  // The ONLY reliable way to grab Esc before Obsidian closes the reader/leaf is
  // its own keymap: push a scope so this viewer becomes the active key handler;
  // the Escape handler returns false to stop the event going any further. The
  // capture-phase DOM listener is a belt-and-suspenders fallback.
  if (app && app.keymap && Scope) {
    try {
      scope = new Scope();
      scope.register([], "Escape", () => { remove(); return false; });
      app.keymap.pushScope(scope);
    } catch { scope = null; }
  }
  doc.addEventListener("keydown", onKey, true);
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); remove(); });
  ov.addEventListener("click", (e) => { if (e.target === ov) remove(); });
  img.addEventListener("click", (e) => { e.stopPropagation(); img.classList.toggle("er-lightbox-zoom"); });
  doc.body.appendChild(ov);
  window.requestAnimationFrame(() => ov.classList.add("er-lightbox-on"));
}
let workerReady = false;
// The pdf.js worker is embedded into this bundle at build time (esbuild replaces
// __PDF_WORKER_CODE__ with the full worker source — see esbuild.config.mjs). We
// hand it to pdf.js as an in-memory Blob URL, so PDFs work fully offline and there
// is no separate pdf.worker.js file to ship. That also makes the plugin installable
// via BRAT, which only downloads main.js / manifest.json / styles.css.
async function setupWorker(app) {
  if (workerReady)
    return;
  try {
    const code = __PDF_WORKER_CODE__;
    if (!code) throw new Error("embedded pdf.worker is empty");
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
      new Blob([code], { type: "application/javascript" })
    );
    workerReady = true;
    return;
  } catch (e) {
    // Запасного пути через CDN здесь нет намеренно: правила каталога запрещают
    // подтягивать код из сети, а воркер и так вшит в сборку. Если он почему-то
    // не поднялся — честно говорим об этом, а не тянем скрипт со стороны.
    console.error("Book Reader: не удалось поднять встроенный pdf.worker", e);
    new Notice(__ertr("Не удалось подготовить чтение PDF. Переустановите плагин."));
  }
  workerReady = true;
}
const EltonReader = class extends Plugin {
  // The phone's reader dialog does not belong to the workspace, so nothing
  // closes it when the plugin goes away (disabled, or updated by a sync) — it
  // stayed on screen with its plugin gone. Close it, but leave the "open book"
  // mark: an update reloads the plugin, and the book comes straight back.
  onunload() {
    this._unloading = true;
    erDailyLogFlush(this);
    try { if (this._openReaderModal) this._openReaderModal.close(); } catch { /* closing is best effort */ }
  }
  // Every open reader: the tabs, plus the phone's dialog, which is a Modal and
  // so never shows up among the workspace leaves. Code that only walked the
  // leaves — the quote backlink, for one — did nothing at all on a phone.
  _readers() {
    const out = [];
    if (this._openReaderModal) out.push(this._openReaderModal);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view) out.push(leaf.view);
    return out;
  }
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT };
    this.progress = {};
    this.thumbCache = {};
    this.highlights = {};
    this.progressBackups = {};
  }
  async onload() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- module-level helpers (PDF cache) need the plugin
    erPlugin = this;
    await this.loadAll();
    erBindSecrets(this);
    // Notes that point into books, and comments coming back from book notes.
    this.registerHoverLinkSource("elton-reader", { display: "Book Reader", defaultMod: false });
    const noteChanged = (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      const t = this._noteTimers || (this._noteTimers = new Map());
      window.clearTimeout(t.get(file.path));
      t.set(file.path, window.setTimeout(async () => {
        t.delete(file.path);
        if (await erBlUpdateFile(this, file)) for (const v of this._readers()) erRenderBacklinkMarks(v);
        await erCommentsFromNote(this, file);
      }, 1200));
    };
    this.registerEvent(this.app.vault.on("modify", noteChanged));
    this.registerEvent(this.app.vault.on("create", noteChanged));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this._blIdx && file && this._blIdx.files.delete(file.path)) for (const v of this._readers()) erRenderBacklinkMarks(v);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!this._blIdx || !file) return;
      const refs = this._blIdx.files.get(oldPath);
      if (refs) { this._blIdx.files.delete(oldPath); this._blIdx.files.set(file.path, refs); }
    }));
    const dailyTimer = window.setInterval(() => { erDailyLogFlush(this); }, 3 * 60 * 1000);
    this.registerInterval(dailyTimer);
    this.registerView(VIEW_TYPE, (leaf) => new ReaderView(leaf, this));
    this.registerView(LIB_VIEW_TYPE, (leaf) => new LibraryView(leaf, this));
    // Quote backlinks. A quote in a note carries an obsidian:// link back to the
    // exact paragraph it came from, so clicking it opens the book there. Using
    // the app's own URI scheme rather than something bespoke means the link
    // works from anywhere a link works — a note, the daily journal, a canvas.
    this.registerObsidianProtocolHandler("elton-reader", (params) => {
      // `block` for a quote, `page` for a note made from a scanned page — the
      // latter has no paragraph to anchor to.
      this.openBookAt(params.book || "", params.block, params.page);
    });
    this.registerExtensions(["epub"], VIEW_TYPE);
    // FB2 in its own try/catch for the same reason as PDF below: Obsidian has no
    // built-in handler for it, but another plugin might have claimed it, and that
    // must not take epub down with it.
    try { this.registerExtensions(["fb2"], VIEW_TYPE); }
    catch (e) { console.warn("Elton Reader: could not register .fb2", e); }
    // Also open PDFs in the reader instead of Obsidian's built-in PDF viewer.
    // Separate call in try/catch: if some other plugin already claimed "pdf",
    // we still keep epub working and fall back to the right-click menu for PDFs.
    try { this.registerExtensions(["pdf"], VIEW_TYPE); }
    catch (e) { console.warn(__ertr("Elton Reader: could not register .pdf, use right-click → Открыть в Elton Reader"), e); }
    this.addRibbonIcon(
      "book-open",
      __ertr("Book Reader \u2014 \u0411\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0430"),
      () => this.openLibrary()
    );
    this.addCommand({
      id: "open-library",
      name: __ertr("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0443"),
      callback: () => this.openLibrary()
    });
    // Docked in the right sidebar, where it stays next to whatever is open —
    // asked for as "I want the library always on the right". In a narrow panel
    // it shows covers only (see .er-lib in styles.css).
    this.addCommand({
      id: "open-library-sidebar",
      name: __ertr("Открыть библиотеку в правой панели"),
      callback: async () => {
        const have = this.app.workspace.getLeavesOfType(LIB_VIEW_TYPE).find((l) => l.getRoot && l.getRoot() === this.app.workspace.rightSplit);
        const leaf = have || this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        await leaf.setViewState({ type: LIB_VIEW_TYPE, active: true });
        this.app.workspace.revealLeaf(leaf);
      }
    });
    this.addCommand({
      id: "open-library-window",
      name: __ertr("Открыть библиотеку в отдельном окне"),
      callback: () => this.openLibrary(true)
    });
    this.addCommand({
      id: "open-pdf-reader",
      // Obsidian already prefixes every command with the plugin's name in the
      // palette, so naming the plugin again read as "Book Reader: Open PDF in
      // Book Reader" \u2014 and the directory's rules call that out.
      name: __ertr("\u041E\u0442\u043A\u0440\u044B\u0442\u044C PDF \u0432 \u0447\u0438\u0442\u0430\u043B\u043A\u0435"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if ((f == null ? void 0 : f.extension) === "pdf") {
          if (!checking)
            this.openFile(f);
          return true;
        }
        return false;
      }
    });
    this.addCommand({
      id: "search-in-book",
      name: __ertr("Поиск по книге"),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        // Also reach the mobile reader, which is a Modal rather than a view.
        const target = (view && view.bookHtml) ? view : (this._openReaderModal || null);
        if (!(target && target.bookHtml)) return false;
        if (!checking) {
          // The two readers name the method differently.
          (target.togglePanel || target._togglePanel).call(target, "find");
          if (target._findInput) erAutoFocus(target._findInput, 80);
        }
        return true;
      }
    });
    this.addCommand({
      id: "toggle-autoscroll",
      name: __ertr("Автопрокрутка: включить или остановить"),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        const target = (view && view.bookHtml) ? view : (this._openReaderModal || null);
        if (!(target && target.bookHtml)) return false;
        if (!checking) erToggleAutoScroll(target);
        return true;
      }
    });
    this.addCommand({
      id: "save-position",
      name: __ertr("Сохранить позицию чтения"),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        if (!(view && view.bookHtml && view.file)) return false;
        if (!checking) view.saveNow();
        return true;
      }
    });
    this.addCommand({
      id: "export-highlights",
      name: __ertr("Экспортировать выделения в заметки"),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(ReaderView);
        if (!(view && view.file)) return false;
        if (!checking) view.exportHighlights();
        return true;
      }
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (this.settings.mdReader === true && file instanceof TFile && file.extension === "md")
        menu.addItem((item) => item.setTitle(__ertr("Читать в Book Reader")).setIcon("book-open").onClick(() => this.openFile(file)));
      if (file instanceof TFile && file.extension === "pdf")
        menu.addItem((item) => item.setTitle(__ertr("\u{1F4D6} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 Book Reader")).setIcon("book-open").onClick(() => this.openFile(file)));
    }));
    this.addSettingTab(new SettingsTab(this.app, this));
    this.addCommand({
      id: "toggle-bars",
      name: __ertr("Без панелей / показать панели"),
      checkCallback: (checking) => {
        const v = this._openReaderModal || this.app.workspace.getActiveViewOfType(ReaderView);
        if (!v || !v.file) return false;
        if (!checking) erToggleNoBars(v);
        return true;
      }
    });
    this.addCommand({
      id: "read-note-in-reader",
      name: __ertr("Читать текущую заметку в Book Reader"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (this.settings.mdReader !== true || !f || f.extension !== "md") return false;
        if (!checking) this.openFile(f);
        return true;
      }
    });
    this.addCommand({
      id: "show-onboarding",
      name: __ertr("Показать приветствие (онбординг)"),
      callback: () => new OnboardingModal(this.app, this).open()
    });
    // Jump straight back into whatever was open last — the single most common
    // intent, and it costs one keystroke instead of a trip through the library.
    this.addCommand({
      id: "continue-reading",
      name: __ertr("Продолжить чтение (последняя книга)"),
      checkCallback: (checking) => {
        const f = this.lastReadBookFile();
        if (!f) return false;
        if (!checking) this.openFile(f);
        return true;
      }
    });
    // Type-to-find over every book, for vaults where a command per book would
    // swamp the palette.
    this.addCommand({
      id: "open-book-picker",
      name: __ertr("Открыть книгу…"),
      callback: () => new BookQuickOpen(this.app, this).open()
    });
    // The book that was open when the phone app was last closed.
    this.app.workspace.onLayoutReady(() => {
      if (!this.app.isMobile || this.settings.reopenBookOnStart === false) return;
      let p = null;
      try { p = this.app.loadLocalStorage(ER_OPEN_BOOK_KEY); } catch { p = null; }
      const f = p ? this.app.vault.getAbstractFileByPath(p) : null;
      // After the start-up layout and whatever a home-page plugin opens.
      // After "what's new", not on top of it: the window shown after an update
      // was hidden under the reopened book and went unseen.
      const go = () => { if (!this._openReaderModal) this.openFile(f); };
      if (f instanceof TFile) window.setTimeout(() => {
        if (this._wnModalOpen) this._afterWhatsNew = go; else go();
      }, 400);
    });
    // One command per book, so a book can be given its own hotkey. Deferred: at
    // onload the vault index is still filling and getFiles() would miss books.
    this.app.workspace.onLayoutReady(() => {
      this.registerBookCommands();
      // Keep the list honest as books are added, renamed or deleted. Debounced —
      // a sync or a bulk import fires these events in bursts.
      const refresh = () => {
        window.clearTimeout(this._bookCmdTimer);
        this._bookCmdTimer = window.setTimeout(() => this.registerBookCommands(), 1500);
      };
      // A book moved to another folder or renamed keeps its place, highlights,
      // note link and settings. Everything was keyed by the old path, and a
      // reader who tidied up their folders found every book back at 0% with no
      // highlights ("the plugin binds data to the absolute path").
      this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
        if (f instanceof TFile && /^(epub|fb2|pdf)$/.test(f.extension || "")) this._onBookRenamed(f.path, oldPath);
      }));
      for (const ev of ["create", "delete", "rename"]) {
        this.registerEvent(this.app.vault.on(ev, (f) => {
          if (f && /^(epub|fb2|pdf)$/.test(f.extension || "")) refresh();
        }));
      }
    });
    // First run: greet the user once with the welcome slideshow, after the
    // workspace is ready so it doesn't fight the initial layout. We persist the
    // "seen" flag BEFORE opening (and await it) — otherwise a re-trigger (e.g. a
    // plugin reload from sync writing data.json) could fire the onboarding a
    // second time before the old close-time flag ever hit disk. A per-session
    // guard covers the rest.
    if (!this.settings.onboarded) {
      this.app.workspace.onLayoutReady(async () => {
        if (this.settings.onboarded || this._onbShown) return;
        this._onbShown = true;
        this.settings.onboarded = true;
        this.settings.lastSeenVersion = this.manifest.version;   // fresh install: nothing to catch up on
        await this.saveAll();
        new OnboardingModal(this.app, this).open();
      });
    } else {
      // Already a user, and the plugin has been updated since they last looked →
      // show what they got. Same "persist before opening" guard as above so a
      // reload can't show it twice.
      this.app.workspace.onLayoutReady(async () => {
        if (this._wnShown) return;
        const seen = this.settings.lastSeenVersion || "";
        const cur = this.manifest.version;
        // Blank means they upgraded from a build that never tracked this; show
        // the history so the jump isn't silent.
        const news = whatsNewSince(seen, cur);
        if (!news.length) {
          if (seen !== cur) { this.settings.lastSeenVersion = cur; await this._saveLocalData(); }
          return;
        }
        this._wnShown = true;
        this.settings.lastSeenVersion = cur;
        await this.saveAll();
        const noteFile = this.settings.whatsNewNote !== true
          ? null
          : await writeWhatsNewNote(this.app, this, news);
        this._wnModalOpen = true;
        new WhatsNewModal(this.app, this, news, noteFile).open();
      });
    }
  }
  async openFile(file) {
    // A dialog on the phone, a tab everywhere else — and the dialog is not a
    // workaround, it is the only shape that works.
    //
    // I tried a leaf here, because the library became one and it fixed the
    // library. On a phone the book came out worse, and for reasons a leaf cannot
    // avoid: Obsidian floats its own header buttons over the top of the content
    // (straight across the reader's title bar and the clock) and puts the mobile
    // navbar over the bottom of it (straight across the page counter). Worse,
    // the workspace keeps the gestures — a swipe left opens the file sidebar
    // instead of turning the page, and a pull down fires the quick action. There
    // is no plugin API to take a gesture back; the request for one is still open
    // on the forum. A modal sits above the workspace and keeps its own touches,
    // which is exactly what a book needs.
    if (this.app.isMobile) {
      // One book at a time: a second dialog would stack on the first.
      // (A dialog that is already on its way out does not count: Obsidian
      // finishes closing it after an animation, and returning early here would
      // leave the reader with nothing open at all.)
      const cur = this._openReaderModal;
      if (cur && !cur._closing) {
        if (cur.file && cur.file.path === file.path) return;
        cur.close();
      }
      new ReaderModal(this.app, this, file).open();
      return;
    }
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    const leaf = leaves.length > 0 ? leaves[0] : this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, state: { path: file.path }, active: true });
    this.app.workspace.revealLeaf(leaf);
    // The tab returns at once (it must, see setState); the book is ready when
    // its load is. A later book opened meanwhile simply wins.
    const v = leaf.view;
    if (v && v._openPromise && v.file && v.file.path === file.path) await v._openPromise;
  }
  // Open the library. As a tab by default, so it can be docked, split, resized
  // and dragged out into its own window like anything else in Obsidian; in a
  // separate window straight away when asked.
  //
  // On a phone there are no windows and tabs are cramped, so the full-screen
  // dialog stays the right shape there.
  async openLibrary(inNewWindow = false) {
    // A tab on the phone too, not a dialog.
    //
    // As a dialog the library had to fight the platform for every edge: the
    // modal container is positioned against the screen, so the header ran under
    // the status-bar clock, Obsidian's ✕ landed in the same strip at the far
    // corner from a thumb, and the mobile build's own padding showed as bands
    // down both sides. Three rounds of arithmetic went into that and none of it
    // held. As a leaf none of it is ours: Obsidian draws the header, keeps the
    // safe area and provides the way back, exactly as it does for every other
    // plugin's mobile interface. The view already existed for the desktop.
    // Already open somewhere? Go to it instead of opening a second copy.
    const existing = this.app.workspace.getLeavesOfType(LIB_VIEW_TYPE);
    if (existing.length && !inNewWindow) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = inNewWindow && !this.app.isMobile && this.app.workspace.openPopoutLeaf
      ? this.app.workspace.openPopoutLeaf()
      : this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: LIB_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  // Open a book AND land on a particular paragraph. This is what a quote's
  // backlink resolves to: readers asked to click a quote in their notes and
  // arrive at the page it came from, the way a PDF annotation plugin does.
  //
  // The paragraph index is the same anchor reading progress uses, so it travels
  // between devices and survives a different font size or column count.
  async openBookAt(path, block, page) {
    let file = this.app.vault.getAbstractFileByPath(erPath(path));
    // The book was moved or renamed after the quote was written.
    if (!(file instanceof TFile)) {
      const moved = this.settings.movedBooks && this.settings.movedBooks[erPath(path)];
      if (moved) file = this.app.vault.getAbstractFileByPath(moved);
    }
    if (!(file instanceof TFile)) {
      const name = String(path || "").split("/").pop();
      const same = name ? this.bookFiles().filter((f) => f.name === name) : [];
      if (same.length === 1) file = same[0];
    }
    if (!(file instanceof TFile)) {
      new Notice(__ertr("Книга не найдена: {0}", path));
      return;
    }
    await this.openFile(file);
    let idx = Number(block);
    if (!Number.isFinite(idx) || idx < 0) {
      // No paragraph anchor — this came from a scanned page, which carries a
      // page number instead. Resolve it to the first block of that page.
      const pg = Number(page);
      if (!Number.isFinite(pg) || pg < 1) return;
      for (const view of this._readers()) {
        if (view && view.file && view.file.path === file.path && typeof view.jumpToPdfPageWhenReady === "function") {
          view.jumpToPdfPageWhenReady(pg);
          return;
        }
      }
      return;
    }
    // The book is still being laid out at this point; the view exposes the jump
    // so it can be applied once the text exists. On a phone the reader is the
    // dialog, not a leaf — reported with the exact diagnosis by a reader on a
    // Poco F3: "openBookAt() passes the jump only to workspace leaves".
    for (const view of this._readers()) {
      if (view && view.file && view.file.path === file.path && typeof view.jumpToBlockWhenReady === "function") {
        view.jumpToBlockWhenReady(idx);
        return;
      }
    }
  }
  // Folder that holds reading data (progress / highlights / rescue backups):
  // the dedicated "dataFolder" if set, otherwise next to the books (booksFolder).
  _dataFolder() {
    const dedicated = erPath(this.settings.dataFolder);
    if (dedicated) return dedicated;
    return erPath(this.settings.booksFolder);
  }
  // Returns the vault path for the progress JSON file.
  _progressFilePath() {
    const folder = this._dataFolder();
    return erPath(folder ? `${folder}/reading-progress.json` : "reading-progress.json");
  }
  async loadAll() {
    let _a, _b, _c;
    const d = await this.loadData();
    this.settings = { ...DEFAULT, ...(_a = d == null ? void 0 : d.settings) != null ? _a : {} };
    // Overlay whatever THIS device last looked like (no-op unless enabled).
    applyDeviceProfile(this.settings);
    // 3.2: the "what's new" NOTE becomes opt-in. Everyone had it stored as true
    // (settings are saved whole), so the new default alone would change nothing;
    // this flips it once. The window itself still shows after an update.
    if (!this.settings._mig32) {
      this.settings._mig32 = true;
      this.settings.whatsNewNote = false;
    }
    if (this.settings.ttsEnabled === undefined) this.settings.ttsEnabled = !!erTtsKey(this.settings);
    // An older install may carry a null here from a build that derived this
    // from the system preference; treat it as on, which is the default now.
    if (this.settings.pageTurnAnimation === null || this.settings.pageTurnAnimation === void 0) {
      this.settings.pageTurnAnimation = true;
    }
    // Follow Obsidian's own language until the reader picks one by hand.
    //
    // The plugin shipped defaulting to Russian, so someone running Obsidian in
    // English met a Russian interface and had to go hunting for the switch —
    // which several of them said outright was hard to find. Asking the app what
    // language it is in removes the hunt for everyone but the people who
    // genuinely want a different one, and their choice is remembered.
    if (!this.settings.languagePicked) {
      let ui = "";
      try { ui = String(getLanguage && getLanguage() || ""); } catch { /* older API: fall through */ }
      this.settings.language = ui.startsWith("ru") ? "ru" : ui.startsWith("zh") ? "zh" : ui ? "en" : (this.settings.language || "ru");
    }
    // Publish the chosen UI language so __ertr() (module-level i18n helper) can read it.
    __erSetLang(this.settings.language);
    // Bump THUMB_VER whenever the thumbnail renderer changes so old (blurry)
    // covers are regenerated once at the new quality instead of lingering.
    // Cover thumbnails live in their OWN local file (thumb-cache.json), kept out
    // of data.json so the synced settings stay tiny and conflict-free. On the
    // first run after this change, migrate the old cache out of data.json.
    await this._loadThumbCache(d);
    this.progressBackups = (d == null ? void 0 : d.progressBackups) != null ? d.progressBackups : {};
    this.highlightsBackups = (d == null ? void 0 : d.highlightsBackups) != null ? d.highlightsBackups : {};
    // Remember the last book's folder across restarts so rescue backups land
    // next to the books even before a book is opened in this session.
    this._lastBookPath = (d == null ? void 0 : d.lastBookPath) || "";
    // Load progress from vault file (syncs via Obsidian Sync)
    this.progress = await this._loadProgressFromVault();
    // Highlights live next to progress so they also sync via Obsidian Sync
    this.highlights = await this._loadHighlightsFromVault();
    // One-time repair. Older builds set "already asked about this book" BEFORE
    // the reader answered — and back then the prompt couldn't create a note at
    // all, and gave up silently when no book-notes folder was configured. Those
    // books can therefore never show the setup screen again, even though the
    // reader was never actually offered anything. Clear the flag wherever no note
    // was linked, so the fixed flow gets exactly one chance. Books that DO have a
    // note are left alone, and from now on the flag is only set on a real answer.
    if (!this.settings.promptedRepaired) {
      const asked = this.settings.bookNotePrompted || {};
      const links = this.settings.bookNoteLinks || {};
      let freed = 0;
      for (const k of Object.keys(asked)) if (!links[k]) { delete asked[k]; freed++; }
      this.settings.promptedRepaired = true;
      // Previously logged how many books were repaired. It ran once per install
      // and told the reader nothing they could act on, so it only added noise to
      // a console other plugins have to share.
      await this._saveLocalData();
    }
    // One-time migration: turn pictures on for everyone who never chose to hide
    // them. The setting shipped defaulting to OFF, so every existing install has
    // `false` written into data.json without anyone having decided that — and the
    // symptom (illustrated books silently showing no pictures) reads as a bug,
    // not a preference. Runs once; anyone who switches it off afterwards keeps it.
    if (!this.settings.figuresShownByDefault) {
      this.settings.pdfShowFiguresOnTextPages = true;
      this.settings.figuresShownByDefault = true;
      await this._saveLocalData();
    }
    // One-time migration: if old data.json had progress, move it to vault file
    const oldProgress = (_b = d == null ? void 0 : d.progress) != null ? _b : {};
    if (Object.keys(oldProgress).length > 0 && Object.keys(this.progress).length === 0) {
      this.progress = oldProgress;
      await this._saveProgressToVault();
      // Remove from data.json to avoid future confusion
      await this._saveLocalData();
    }
  }
  async saveAll() {
    for (const r of this._readers()) erSyncTopButtons(r);
    await this._saveLocalData();
    await this._saveProgressToVault();
  }
  _saveLocalData() {
    captureDeviceProfile(this.settings);
    return this.saveData({ settings: this.settings, progressBackups: this.progressBackups, highlightsBackups: this.highlightsBackups, lastBookPath: this._lastBookPath || "" });
  }
  // ── Cover thumbnail cache (separate, device-local, NOT synced) ─────────────
  _thumbCachePath() { return erPath(`${this.manifest.dir}/thumb-cache.json`); }
  async _loadThumbCache(d) {
    try {
      const p = this._thumbCachePath();
      if (await this.app.vault.adapter.exists(p)) {
        const j = JSON.parse(await this.app.vault.adapter.read(p));
        this.thumbCache = (j && j.ver === 2 && j.cache) ? j.cache : {};
        this._dropBadThumbs();
        return;
      }
    } catch (e) { console.warn("Book Reader: thumb cache load failed", e); }
    // Migrate the old in-data.json cache once, then persist to the new file.
    this.thumbCache = ((d == null ? void 0 : d.thumbCacheVer) === 2 && (d == null ? void 0 : d.thumbCache)) ? d.thumbCache : {};
    this._dropBadThumbs();
    if (Object.keys(this.thumbCache).length) this._saveThumbCache();
  }
  // Before 3.1.4 an EPUB that names its cover *page* as the cover got that page
  // cached as the "picture" and showed an empty card forever. Forget such
  // entries so the library builds them again with the real image.
  _dropBadThumbs() {
    for (const k of Object.keys(this.thumbCache)) {
      const v = String(this.thumbCache[k] || "");
      if (v.startsWith("data:") && !v.startsWith("data:image/")) delete this.thumbCache[k];
    }
  }
  _saveThumbCache() {
    this._thumbSaveChain = (this._thumbSaveChain || Promise.resolve()).then(
      () => this.app.vault.adapter.write(this._thumbCachePath(), JSON.stringify({ ver: 2, cache: this.thumbCache }))
    ).catch((e) => console.warn("Book Reader: thumb cache save failed", e));
    return this._thumbSaveChain;
  }
  // ── Daily reading-goal timer ───────────────────────────────────────────────
  _todayKey() { return readerTodayKey(); }
  // Add active reading seconds to today's tally (kept in memory; flushed to disk
  // periodically so we don't rewrite data.json every second).
  bumpReadingTime(sec) {
    const s = this.settings;
    if (!s.readingLog) s.readingLog = {};
    const k = this._todayKey();
    s.readingLog[k] = (s.readingLog[k] || 0) + sec;
    s.lifetimeSeconds = (s.lifetimeSeconds || 0) + sec;
    const keys = Object.keys(s.readingLog);
    if (keys.length > 100) { keys.sort(); while (keys.length > 90) delete s.readingLog[keys.shift()]; }
    this._readingDirty = true;
  }
  getTodaySeconds() {
    const s = this.settings;
    return (s.readingLog && s.readingLog[this._todayKey()]) || 0;
  }
  // Sum of every day's reading seconds we still keep (~last 90 days) — shown as a
  // running total in the reading panel and settings. Requested by readers.
  getTotalSeconds() {
    const s = this.settings;
    const logSum = s.readingLog ? Object.keys(s.readingLog).reduce((a, k) => a + (s.readingLog[k] || 0), 0) : 0;
    // Lifetime counter is untrimmed; for users upgrading with existing history it
    // may start behind the 90-day log, so never report less than the log holds.
    return Math.max(s.lifetimeSeconds || 0, logSum);
  }
  // ── Opening books by command ───────────────────────────────────────────────
  // Every readable book in the configured folder (or the whole vault when none
  // is set) — the same rule the library window uses.
  async _onBookRenamed(newPath, oldPath) {
    if (!oldPath || newPath === oldPath) return;
    const move = (obj) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, oldPath)) {
        if (!Object.prototype.hasOwnProperty.call(obj, newPath)) obj[newPath] = obj[oldPath];
        delete obj[oldPath];
        return true;
      }
      return false;
    };
    const st = this.settings;
    let any = false;
    for (const k of ["bookNoteLinks", "bookNotePrompted", "bookTemplates", "bookTags", "coverFits", "pinnedBooks", "colorNotes", "pdfOriginal", "stopMarks"]) any = move(st[k]) || any;
    move(this.thumbCache);
    const p1 = move(this.progress), p2 = move(this.progressBackups);
    const h1 = move(this.highlights), h2 = move(this.highlightsBackups);
    if (this.settings.lastBookPath === oldPath) this.settings.lastBookPath = newPath;
    if (this._lastBookPath === oldPath) this._lastBookPath = newPath;
    // Quotes already in notes still link to the old path: remember the move so
    // those links keep opening the book (see openBookAt).
    const moved = st.movedBooks || (st.movedBooks = {});
    for (const k of Object.keys(moved)) if (moved[k] === oldPath) moved[k] = newPath;
    moved[oldPath] = newPath;
    any = true;
    try {
      if (p1 || p2) await this._saveProgressToVault();
      if (h1 || h2) await this._saveHighlightsToVault();
      if (any || p1 || h1) await this.saveAll();
      this._saveThumbCache();
    } catch (e) { console.warn("Book Reader: could not move data for renamed book", e); }
  }
  // Re-lay every open book after a change to how text looks.
  _relayoutAll() {
    for (const r of this._readers()) {
      try {
        if (r.applyVars) r.applyVars();
        if (r._applyTheme) r._applyTheme();
        if (typeof r.repaginate === "function" && r.bookHtml) r.repaginate();
        else if (typeof r._repaginate === "function" && r.bookHtml) r._repaginate();
      } catch (e) { console.warn("Book Reader: relayout failed", e); }
    }
  }
  isBookPinned(path5) {
    return !!(this.settings.pinnedBooks && this.settings.pinnedBooks[path5]);
  }
  async setBookPinned(path5, on) {
    const m = this.settings.pinnedBooks || (this.settings.pinnedBooks = {});
    if (on) m[path5] = Date.now(); else delete m[path5];
    await this.saveAll();
  }
  bookFiles() {
    const folder = erPath(this.settings.booksFolder || "");
    const prefix = folder ? folder + "/" : "";
    return this.app.vault.getFiles().filter(
      (f) => (f.extension === "epub" || f.extension === "pdf" || f.extension === "fb2")
        && (prefix === "" || f.path.startsWith(prefix))
    );
  }
  // The book with the most recent reading timestamp, skipping any whose file has
  // since been deleted or renamed.
  lastReadBookFile() {
    const prog = this.progress || {};
    let bestPath = "", bestAt = -1;
    for (const p of Object.keys(prog)) {
      const at = (prog[p] && (prog[p].lastRead || prog[p].updated)) || 0;
      const ts = typeof at === "number" ? at : Date.parse(at) || 0;
      if (ts > bestAt) { bestAt = ts; bestPath = p; }
    }
    if (!bestPath) bestPath = this.settings.lastBookPath || "";
    if (!bestPath) return null;
    const f = this.app.vault.getAbstractFileByPath(bestPath);
    return f && f.extension ? f : null;
  }
  // Register "Book Reader: <title>" for each book so it can be opened directly or
  // bound to a hotkey. Obsidian has no public API for dropping a command, so the
  // ids are tracked and removed through the (undocumented) registry when the list
  // is rebuilt — guarded, since that call is not part of the public API.
  registerBookCommands() {
    const prev = this._bookCmdIds || [];
    for (const id of prev) {
      try { this.app.commands.removeCommand(id); } catch { /* not supported — leave it */ }
    }
    const ids = [];
    const files = this.bookFiles()
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .slice(0, MAX_BOOK_COMMANDS);   // a huge library would otherwise bury every other command
    for (const f of files) {
      const path = f.path;
      const cmd = this.addCommand({
        // Path-derived so the id survives restarts and keeps any assigned hotkey.
        id: "open-book:" + path,
        name: __ertr("Открыть книгу: {0}", f.basename),
        callback: () => {
          const cur = this.app.vault.getAbstractFileByPath(path);
          if (cur) this.openFile(cur);
          else new Notice(__ertr("Книга не найдена: {0}", path));
        }
      });
      if (cmd && cmd.id) ids.push(cmd.id);
    }
    this._bookCmdIds = ids;
  }
  // Auto-create (once) a dedicated note named after the book and link it, so
  // every book gets its own note without manual picking. Opt-in via autoBookNote.
  async ensureBookNote(file) {
    if (!file) return null;
    const s = this.settings;
    if (!s.bookNoteLinks) s.bookNoteLinks = {};
    if (s.bookNoteLinks[file.path]) return null;
    const base = bookNotesFolderPath(this.app) || notesFolderPath(this.app) || "";
    return this.createBookNote(file, file.basename, base);
  }
  // Categories assigned to a book. Stored per book rather than derived from the
  // note, so a book can be filed under a category even without a note.
  async setBookTags(bookPath, tags) {
    const s = this.settings;
    if (!s.bookTags) s.bookTags = {};
    const list = (tags || []).filter(Boolean);
    if (list.length) s.bookTags[bookPath] = list;
    else delete s.bookTags[bookPath];
    await this.saveAll();
  }
  // Create the note for a book and link it. `title` and `folder` come from the
  // setup screen, so the reader can name it and place it wherever they want
  // instead of being stuck with the defaults.
  async createBookNote(file, title, folder) {
    try {
      if (!file) return null;
      const s = this.settings;
      if (!s.bookNoteLinks) s.bookNoteLinks = {};
      const base = erPath(folder);
      const name = sanitizeNoteTitle(title || file.basename);
      // Never overwrite: if that name is taken, link the EXISTING note rather
      // than clobbering someone's file or silently failing.
      const path5 = erPath(base ? `${base}/${name}.md` : `${name}.md`);
      let note = this.app.vault.getAbstractFileByPath(path5);
      if (!(note instanceof TFile)) {
        if (base && !this.app.vault.getAbstractFileByPath(base)) await this.app.vault.createFolder(base).catch(() => {});
        // The note template applies here too. It only ever ran for notes made
        // from a selection, so a reader who had set one up and turned on
        // automatic book notes got a bare heading and no explanation why —
        // "не совсем понял как работают шаблоны, шаблон не был применен".
        let body = `# ${name}\n\n`;
        const tplPath = noteTemplatePath(this.app, file);
        const tplFile = tplPath ? this.app.vault.getAbstractFileByPath(tplPath) : null;
        if (tplFile instanceof TFile) {
          try { body = processTemplateManually(await this.app.vault.read(tplFile), name) + "\n\n"; }
          catch { /* a broken template must not stop the note being created */ }
        }
        note = await this.app.vault.create(path5, body).catch((e) => {
          console.error("Elton Reader: create book note failed", e);
          return null;
        });
      }
      if (note instanceof TFile) {
        s.bookNoteLinks[file.path] = note.basename;
        await this.saveAll();
        await writeBookProperty(this.app, note.basename, file);
        return note;
      }
      new Notice(__ertr("Не удалось создать заметку"));
      return null;
    } catch (e) {
      console.error("Elton Reader: create book note failed", e);
      new Notice(__ertr("Не удалось создать заметку"));
      return null;
    }
  }
  resetTodaySeconds() {
    const s = this.settings;
    if (!s.readingLog) s.readingLog = {};
    s.readingLog[this._todayKey()] = 0;
    this._readingDirty = true;
  }
  getGoalSeconds() { return Math.max(60, (this.settings.dailyGoalMin || 15) * 60); }
  flushReadingTime() {
    if (!this._readingDirty) return;
    this._readingDirty = false;
    this._saveLocalData();
  }
  // Keep a rolling local history of reading positions per book (in data.json),
  // so a glitch (e.g. a stray jump to 100%) never loses the real position.
  _recordBackup(path5, prev, now) {
    if (!prev || typeof prev.percent !== "number") return;
    const list = this.progressBackups[path5] || (this.progressBackups[path5] = []);
    const last = list[list.length - 1];
    if (last && last.percent === prev.percent) { last.ts = now; return; }
    list.push({ pct: prev.pct, percent: prev.percent, lastRead: prev.lastRead || now, ts: now });
    if (list.length > 30) list.shift();
  }
  async _loadProgressFromVault() {
    try {
      const path5 = this._progressFilePath();
      const exists = await this.app.vault.adapter.exists(path5);
      if (!exists) return {};
      const raw = await this.app.vault.adapter.read(path5);
      return JSON.parse(raw);
    } catch (e) {
      console.error("Elton Reader: could not load progress file", e);
      return {};
    }
  }
  async _saveProgressToVault() {
    try {
      const path5 = this._progressFilePath();
      const folder = path5.substring(0, path5.lastIndexOf("/"));
      if (folder) {
        const folderExists = await this.app.vault.adapter.exists(folder);
        if (!folderExists) await this.app.vault.createFolder(folder).catch(() => {});
      }
      await this.app.vault.adapter.write(path5, JSON.stringify(this.progress, null, 2));
      this._writeRescue(false);
    } catch (e) {
      console.error("Elton Reader: could not save progress file", e);
    }
  }
  // Safety net: keep a dated copy of progress + highlights + the plugin's own
  // data.json under "<booksFolder>/_reader-rescue-<date>" so a sync glitch can
  // never wipe out highlights for good. Progress saves are throttled
  // (≤ once / 5 min); highlight saves force a write (force=true).
  async _writeRescue(force) {
    // Off for those who already back the vault up themselves (Syncthing, Git).
    if (this.settings.rescueBackups === false) return;
    try {
      const now = Date.now();
      if (!force && this._lastRescueTs && (now - this._lastRescueTs) < 5 * 60 * 1e3) return;
      this._lastRescueTs = now;
      let date;
      try { date = window.moment ? window.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10); }
      catch { date = new Date().toISOString().slice(0, 10); }
      const bf = this._dataFolder();
      // Prefer the configured data/books folder. When neither is set, keep the
      // backup next to the last book read (persisted across restarts). If we
      // still don't know any book folder, SKIP the backup entirely rather than
      // dumping a "_reader-rescue" folder at the vault root.
      let base;
      if (bf) {
        base = erPath(`${bf}/_reader-rescue`);
      } else if (this._lastBookPath && this._lastBookPath.includes("/")) {
        const bookDir = this._lastBookPath.slice(0, this._lastBookPath.lastIndexOf("/"));
        base = erPath(`${bookDir}/_reader-rescue`);
      } else {
        return;
      }
      const dir = erPath(`${base}/_reader-rescue-${date}`);
      const ad = this.app.vault.adapter;
      if (!await ad.exists(base)) await this.app.vault.createFolder(base).catch(() => {});
      if (!await ad.exists(dir)) await this.app.vault.createFolder(dir).catch(() => {});
      await ad.write(erPath(`${dir}/reading-progress.json`), JSON.stringify(this.progress, null, 2));
      await ad.write(erPath(`${dir}/reading-highlights.json`), JSON.stringify(this.highlights, null, 2));
      const dataPath = erPath(`${this.manifest.dir}/data.json`);
      if (await ad.exists(dataPath)) await ad.write(erPath(`${dir}/plugin-data.json`), await ad.read(dataPath));
      // A folder per day, kept for a week. They used to pile up for good —
      // "the data folder fills up with dated folders very fast".
      try {
        const listing = await ad.list(base);
        const days = (listing.folders || []).filter((f) => /_reader-rescue-\d{4}-\d{2}-\d{2}$/.test(f)).sort();
        for (const old of days.slice(0, Math.max(0, days.length - 7))) await ad.rmdir(old, true);
      } catch { /* pruning is best effort */ }
    } catch (e) {
      console.error("Elton Reader: rescue backup failed", e);
    }
  }
  saveProgress(path5, spread, total, block) {
    // While a big PDF is still loading behind the pages on screen, "page 40 of
    // 60 so far" is not a place in the book: skip it, the full load saves.
    if (this._partialPaths && this._partialPaths.has(path5)) return;
    erDayTouch(this, path5, total > 1 ? spread / (total - 1) : 0);
    // Store as 0-1 float so it works across devices with different
    // screen sizes / column counts / font sizes.
    const pct = total > 1 ? spread / (total - 1) : 0;
    const pctDisplay = Math.round(pct * 100);
    const now = Date.now();
    const prev = this.progress[path5];
    // Snapshot the previous position into history on a big jump (≥15%) or
    // roughly every 3 minutes — so we can always roll back to a real spot.
    const bigJump = prev && typeof prev.pct === "number" && Math.abs(pct - prev.pct) >= 0.15;
    const list = this.progressBackups[path5];
    const last = list && list[list.length - 1];
    const periodic = !last || (now - (last.ts || 0)) >= 3 * 60 * 1e3;
    if (bigJump || periodic) this._recordBackup(path5, prev, now);
    this._lastBookPath = path5;
    const entry = { pct, percent: pctDisplay, lastRead: now };
    // Device-independent anchor: global index of the first visible paragraph.
    if (typeof block === "number" && block >= 0) entry.block = block;
    this.progress[path5] = entry;
    this._saveProgressToVault();
    this._saveLocalData();
    this._syncProgressFrontmatter(path5);
  }
  // Mirror the reading position into the book note's frontmatter.
  //
  // Progress itself lives in a JSON file next to the books, which is right — it
  // is the reader's own bookkeeping and has no business in a note. But a reader
  // pointed out that a number in frontmatter is a number Bases can chart, sort
  // and filter, and there is no other way to get reading progress into a table.
  // So the note gets a COPY: the JSON stays the source of truth, the note gets
  // something to look at.
  //
  // Debounced, because progress is written on every page turn and rewriting a
  // note that often would spam the vault (and any sync watching it).
  _syncProgressFrontmatter(bookPath) {
    if (!this.settings.progressToFrontmatter) return;
    const noteName = bookNoteLinkFor(this, { path: bookPath, basename: "" });
    if (!noteName) return;
    const note = resolveBookNote(this.app, noteName);
    if (!note) return;
    window.clearTimeout(this._fmTimers && this._fmTimers[bookPath]);
    if (!this._fmTimers) this._fmTimers = {};
    this._fmTimers[bookPath] = window.setTimeout(async () => {
      const p = this.progress[bookPath];
      if (!p) return;
      try {
        await this.app.fileManager.processFrontMatter(note, (fm) => {
          fm["reading-progress"] = Math.round((p.pct || 0) * 100);
          fm["reading-updated"] = new Date(p.lastRead || Date.now()).toISOString().slice(0, 10);
        });
      } catch (e) {
        console.warn("Book Reader: could not write progress into the book note", e);
      }
    }, 4000);
  }
  // Manual save (the 💾 button / command). Like saveProgress, but always drops a
  // "manual" restore point for the CURRENT position so the user can jump back to
  // exactly here later, even after lots of further reading.
  // `internal`: the position is being kept across a re-layout (font, theme,
  // reading mode), not marked by the reader — it must not appear in the
  // "go back to" history as a 💾 bookmark, which is what happened on every
  // change in the reading settings.
  saveNow(path5, spread, total, block, internal) {
    const pct = total > 1 ? spread / (total - 1) : 0;
    const pctDisplay = Math.round(pct * 100);
    const now = Date.now();
    const hasBlock = typeof block === "number" && block >= 0;
    this._lastBookPath = path5;
    const entry = { pct, percent: pctDisplay, lastRead: now };
    if (hasBlock) entry.block = block;
    this.progress[path5] = entry;
    const list = this.progressBackups[path5] || (this.progressBackups[path5] = []);
    const last = list[list.length - 1];
    if (internal) {
      // nothing for the history
    } else if (last && last.percent === pctDisplay) {
      last.ts = now; last.lastRead = now; last.manual = true;
      if (hasBlock) last.block = block;
    } else {
      const snap = { pct, percent: pctDisplay, lastRead: now, ts: now, manual: true };
      if (hasBlock) snap.block = block;
      list.push(snap);
      if (list.length > 30) list.shift();
    }
    this._saveProgressToVault();
    this._saveLocalData();
    this._syncProgressFrontmatter(path5);
    return pctDisplay;
  }
  getBackups(path5) {
    const list = this.progressBackups[path5];
    return Array.isArray(list) ? list : [];
  }
  getProgress(path5) {
    let _a;
    return (_a = this.progress[path5]) != null ? _a : null;
  }
  // Returns the spread index for the current device given saved progress.
  getSpreadForTotal(path5, total) {
    const prog = this.getProgress(path5);
    if (!prog) return 0;
    // New format: pct is a 0-1 float
    if (typeof prog.pct === "number") {
      return Math.round(prog.pct * Math.max(0, total - 1));
    }
    // Legacy format: raw spread number (old version) - use as-is
    return typeof prog.spread === "number" ? prog.spread : 0;
  }
  // Re-reads progress from vault file — call before opening a book
  // to get fresh data after Obsidian Sync may have updated the file.
  async refreshProgress() {
    this.progress = await this._loadProgressFromVault();
  }
  // ── Highlights ────────────────────────────────────────
  _highlightsFilePath() {
    const folder = this._dataFolder();
    return erPath(folder ? `${folder}/reading-highlights.json` : "reading-highlights.json");
  }
  async _loadHighlightsFromVault() {
    try {
      const path5 = this._highlightsFilePath();
      const exists = await this.app.vault.adapter.exists(path5);
      if (!exists) return {};
      const raw = await this.app.vault.adapter.read(path5);
      return JSON.parse(raw);
    } catch (e) {
      console.error("Elton Reader: could not load highlights file", e);
      return {};
    }
  }
  async _saveHighlightsToVault() {
    try {
      const path5 = this._highlightsFilePath();
      const folder = path5.substring(0, path5.lastIndexOf("/"));
      if (folder) {
        const folderExists = await this.app.vault.adapter.exists(folder);
        if (!folderExists) await this.app.vault.createFolder(folder).catch(() => {});
      }
      await this.app.vault.adapter.write(path5, JSON.stringify(this.highlights, null, 2));
      this._writeRescue(true);
    } catch (e) {
      console.error("Elton Reader: could not save highlights file", e);
    }
  }
  async refreshHighlights() {
    this.highlights = await this._loadHighlightsFromVault();
  }
  getHighlights(path5) {
    let _a;
    const list = (_a = this.highlights[path5]) != null ? _a : [];
    // Stable reading order: by block, then by position inside block
    return [...list].sort((a, b) => a.block - b.block || a.occ - b.occ);
  }
  addHighlight(path5, hl) {
    if (!this.highlights[path5]) this.highlights[path5] = [];
    this.highlights[path5].push(hl);
    this._persistHighlights(path5, (disk) => {
      if (!disk[path5]) disk[path5] = [];
      if (!disk[path5].some((x) => x.id === hl.id)) disk[path5].push(hl);
    });
  }
  // Every stored part of the quote `id` belongs to (one paragraph -> just itself).
  hlGroupIds(path5, id) {
    const list = this.highlights[path5] || [];
    const h = list.find((x) => x.id === id);
    if (!h || !h.group) return [id];
    return list.filter((x) => x.group === h.group).map((x) => x.id);
  }
  // The highlights of a book as the reader thinks of them: one entry per
  // quote, with the paragraphs of a multi-paragraph quote joined back up.
  getHighlightQuotes(path5) {
    return erMergeHlGroups(this.getHighlights(path5));
  }
  removeHighlight(path5, id) {
    const ids = new Set(this.hlGroupIds(path5, id));
    // Remembered for the session: a persist step that re-reads an older copy
    // of the file must not bring a deleted highlight back (seen when several
    // were deleted in quick succession).
    if (!this._hlDeleted) this._hlDeleted = new Set();
    for (const x of ids) this._hlDeleted.add(x);
    const list = this.highlights[path5];
    if (list) erRemoveQuoteFromBookNote(this, path5, list.filter((h) => ids.has(h.id)));
    if (list) this.highlights[path5] = list.filter((h) => !ids.has(h.id));
    this._persistHighlights(path5, (disk) => {
      if (disk[path5]) disk[path5] = disk[path5].filter((h) => !ids.has(h.id));
    });
  }
  // Attach (or clear) the margin note on a highlight. `id` may be null when the
  // reader commented on a plain selection that was never saved — in that case the
  // matching highlight is found by its text, and if there is none we cannot store
  // anything, so the caller is told nothing happened.
  async setHighlightComment(path5, id, hl, text) {
    const list = this.highlights[path5] || [];
    // A comment on a multi-paragraph quote lives on its first paragraph.
    if (id) {
      const head = this.hlGroupIds(path5, id).map((x) => list.find((h) => h.id === x)).filter(Boolean)
        .sort((a, b) => a.block - b.block)[0];
      if (head) id = head.id;
    }
    let target = id ? list.find((x) => x.id === id) : null;
    if (!target && hl && hl.text) target = list.find((x) => x.text === hl.text);
    if (!target) { new Notice(__ertr("Сначала выделите фрагмент цветом")); return false; }
    const value = String(text || "").trim();
    if (value) target.comment = value; else delete target.comment;
    this._persistHighlights(path5, (disk) => {
      const d = (disk[path5] || []).find((x) => x.id === target.id);
      if (d) { if (value) d.comment = value; else delete d.comment; }
    });
    new Notice(value ? __ertr("Комментарий сохранён") : __ertr("Комментарий удалён"));
    erSyncQuoteInBookNote(this, path5, target.id);
    return true;
  }
  setHighlightColor(path5, id, color) {
    const ids = new Set(this.hlGroupIds(path5, id));
    const list = this.highlights[path5];
    if (list) for (const h of list) if (ids.has(h.id)) h.color = color;
    this._persistHighlights(path5, (disk) => {
      if (disk[path5]) for (const h of disk[path5]) if (ids.has(h.id)) h.color = color;
    });
    erSyncQuoteInBookNote(this, path5, id);
  }
  // Crash-/sync-safe persistence for incremental highlight edits.
  // Re-reads the on-disk file (which may already contain highlights written by
  // ANOTHER device that this session never loaded) and merges our single change
  // INTO it, so a stale in-memory copy can never clobber newer data via Obsidian
  // Sync. Mutations are serialized through a promise chain to avoid lost updates.
  _persistHighlights(path5, applyFn) {
    this._lastBookPath = path5;
    this._hlChain = (this._hlChain || Promise.resolve()).then(async () => {
      let disk = {};
      try {
        const fp = this._highlightsFilePath();
        if (await this.app.vault.adapter.exists(fp)) {
          disk = JSON.parse(await this.app.vault.adapter.read(fp));
        }
      } catch (e) {
        console.error("Elton Reader: could not re-read highlights, falling back to memory", e);
        disk = JSON.parse(JSON.stringify(this.highlights || {}));
      }
      if (!disk || typeof disk !== "object") disk = {};
      applyFn(disk);
      if (this._hlDeleted && this._hlDeleted.size) {
        for (const k of Object.keys(disk)) if (Array.isArray(disk[k])) disk[k] = disk[k].filter((h) => !this._hlDeleted.has(h.id));
      }
      // Re-add any local highlights the disk copy doesn't have yet (protects
      // rapid successive edits and concurrent local adds from being dropped).
      if (Array.isArray(this.highlights[path5])) {
        if (!disk[path5]) disk[path5] = [];
        const seen = new Set(disk[path5].map((h) => h.id));
        for (const h of this.highlights[path5]) if (!seen.has(h.id)) disk[path5].push(h);
      }
      this.highlights = disk;
      this._backupHighlights(path5, disk[path5] || []);
      await this._saveHighlightsToVault();
      await this._saveLocalData();
    }).catch((e) => console.error("Elton Reader: highlight persist failed", e));
    return this._hlChain;
  }
  // Rolling local snapshots of a book's highlights (kept in data.json), so an
  // accidental loss/overwrite can always be restored on this device.
  _backupHighlights(path5, list) {
    if (!this.highlightsBackups) this.highlightsBackups = {};
    const arr = this.highlightsBackups[path5] || (this.highlightsBackups[path5] = []);
    const now = Date.now();
    const sig = list.map((h) => h.id).sort().join(",");
    const last = arr[arr.length - 1];
    if (last && last.sig === sig) { last.ts = now; return; }
    arr.push({ ts: now, count: list.length, sig, items: JSON.parse(JSON.stringify(list)) });
    while (arr.length > 12) arr.shift();
  }
};
const Paginator = class {
  constructor() {
    this.spread = 0;
    this.total = 0;
    this.sw = 0;  // stride per spread in px (float)
  }
  /** Build the paginator. Returns [currentSpread, totalSpreads]. */
  async build(container, html, settings, savedSpread) {
    // Книга уже стоит в этом контейнере и текст тот же — значит перекладка, а не
    // открытие: узлы (и отрисованные страницы PDF вместе с ними) остаются на
    // месте, меняются только геометрия и стили потока.
    const переклад = !!(this.flow && this.clip
      && this.flow.parentElement === this.clip
      && this.clip.parentElement === container
      && this._html === html);
    if (!переклад) container.empty();
    const t = erTheme(settings);
    // Vertical placement is decided per spread from real geometry, so both the
    // setting and the measurements are reset whenever the book is re-laid out.
    this._vAlign = settings.vAlign || "top";
    this._vCache = null;
    this._blockGeom = null;

    // Continuous scrolling instead of pages. Asked for by readers who find they
    // keep going for longer when the text does not stop at a page edge.
    //
    // It is a branch rather than a separate class on purpose: everything that
    // reads a position — progress, the contents list, highlights, search —
    // speaks in spreads and block indices, so the scrolling mode presents the
    // same surface. A "spread" here is one screenful.
    this.scrollMode = (settings.readMode || "pages") === "scroll";
    // Remembered here so applyTransform can honour it on every turn without
    // reaching back into the plugin's settings.
    this.animate = settings.pageTurnAnimation !== false;

    // A font file from the vault has to be in place before anything is
    // measured — a late font re-wraps every line and every page moves.
    if (settings.fontFamily === "custom" && settings.customFontFile && this.app) {
      await erEnsureCustomFont(this.app, settings, docOf(container));
    }
    /* 1. Clip — measure real px after one frame */
    this.clip = переклад ? this.clip : container.createDiv("er-clip");
    // NO `overflow` here. It used to be inline, and an inline declaration beats
    // any class without !important — so `.er-clip-scroll { overflow-y: auto }`
    // never applied and scroll mode could not be scrolled with a finger at all.
    // The page-turn buttons still worked, because they move scrollTop from code
    // and overflow does not stop that; which is exactly what it looked like from
    // the outside: "it only pages with buttons or taps". Same trap as the inline
    // `transition:none` that silently killed the page-turn animation. Overflow is
    // decided in the stylesheet: hidden on .er-clip, auto on .er-clip-scroll.
    this.clip.style.cssText = `flex:1;align-self:stretch;position:relative;min-width:0;min-height:0;`;
    if (this.scrollMode) this.clip.addClass("er-clip-scroll");
    await new Promise(r => window.requestAnimationFrame(r));
    await new Promise(r => window.requestAnimationFrame(r));
    // On mobile the view may not have final dimensions yet — wait an extra tick
    if (!container.offsetWidth) await new Promise(r => window.setTimeout(r, 80));
    const aW   = this.clip.offsetWidth  || container.offsetWidth || 390;
    const aH   = this.clip.offsetHeight || container.offsetHeight || 700;
    // The width this layout is ACTUALLY valid for. build() waits a couple of
    // frames before measuring, so by now the area may be a different size than it
    // was when the caller decided to rebuild — during a sidebar animation it
    // usually is. The view must record THIS number, not the one it saw earlier,
    // or the resize observer compares against a width that was never used and
    // concludes nothing needs rebuilding, leaving the page laid out for one width
    // and displayed at another (columns then sit off to the side).
    this.builtWidth = aW;
    // A PDF shown as its original pages reads one page at a time: two pictures
    // of pages side by side came out too small to read.
    const origPdf = html.indexOf('class="er-pdf-figure er-pdf-orig"') !== -1;
    const cols  = settings.columns === "2" && aW > 700 && !origPdf ? 2 : 1;
    const gap   = cols === 2 ? 48 : 0;
    // Side padding scales with width: a phone (≤600px) gets a comfortable 26px
    // margin instead of the desktop 60px, so the reading column isn't squeezed.
    const marginK = { narrow: 0.6, normal: 1, wide: 1.5 }[settings.pageMargin] || 1;
    const basePad = Math.round((cols === 2 ? 48 : (aW <= 600 ? 26 : aW <= 820 ? 42 : 60)) * marginK);
    const padVt = Math.min(basePad, 40);
    const padVtBot = padVt;
    // Reduce aH by vertical padding so content fits within column height
    const aHinner = aH - padVt - padVtBot;

    /* 2. Column geometry is DECLARED, not inferred. A column plus the gap that
       follows it is one SLOT, and a spread is exactly `cols` slots — so a slot
       is the visible width over the column count, and the paging stride is that
       number by construction rather than something to be measured back out of
       the layout. CSS places a gap after EVERY column, including the last one
       of a spread, so a column is one gap narrower than its slot.
       Sizing the flow to a whole number of slots is what pins this down:
       `column-width` is only a MINIMUM, so whatever slack is left over in the
       flow width gets handed back to the columns — which is how a 1200px page
       ended up striding 623.94px instead of 600px.
       Splitting the gap in half on both sides of the spread (`left` below)
       keeps the margins even: giving the whole gap to the trailing edge is what
       once left the text sitting 48px from the left and 97px from the right. */
    const slot  = aW / cols;
    const colW  = this.scrollMode ? aW : slot - gap;
    const flowW = this.scrollMode ? aW : 4000 * slot - gap;   /* room for ~4000 columns */

    /* Comfortable line length. On a wide monitor a full-width column runs past
       150 characters and the eye loses its place returning to the next line;
       typography puts the readable range at 60-90. Readers asked for this after
       maximising the window and finding the text unreadable.
       Deliberately spent as PADDING rather than as a narrower column: the slot,
       the column width and therefore the paging stride stay exactly as computed
       above, so nothing about pagination changes — the spare width just becomes
       margin. 0.5em per character is the usual average for a mixed-case serif;
       it does not have to be exact, since this is a comfort limit and not a
       layout constraint. */
    let pad = basePad;
    const maxCh = Number(settings.maxLineCh) || 0;
    if (maxCh > 0) {
      const target = maxCh * (Number(settings.fontSize) || 18) * 0.5;
      if (target > 0 && target < colW - basePad * 2) pad = Math.round((colW - target) / 2);
    }

    /* 3. Flow element */
    this.flow = переклад ? this.flow : this.clip.createDiv("er-flow");
    this.flow.style.cssText = `
      width:${flowW}px;
      /* Scrolling: the text is as tall as it needs to be and the clip scrolls,
         so no column rules apply and the height must not be pinned. */
      ${this.scrollMode ? "height:auto;min-height:100%;" : `height:${aHinner}px;
      column-width:${colW}px;
      column-gap:${gap}px;
      column-fill:auto;`}
      position:relative;
      /* Half a gap on each side of the spread instead of a whole one after it. */
      left:${this.scrollMode ? 0 : gap / 2}px;
      /* Chrome enforces orphans/widows of 2 inside multicol: if only one line of
         the next paragraph fits at the foot of a column, it refuses to split and
         moves the WHOLE paragraph over, stranding several empty lines. Allowing a
         single line to stand lets each column fill to the bottom. */
      orphans:1;
      widows:1;
      padding:${padVt}px 0 ${padVtBot}px;
      box-sizing:content-box;
      margin-top:0;
      font-family:${erFontFamily(settings)};
      font-size:${settings.fontSize}px;
      line-height:${settings.lineHeight};
      color:var(--er-text);
      background:${settings.pageTexture && settings.pageTexture !== "none" ? "transparent" : "var(--er-bg)"};
      overflow:hidden;
      user-select:text;
      -webkit-user-select:text;
      will-change:transform;
      /* No transition declared here on purpose: the page-turn animation lives
         in the er-flow-anim class, and an inline transition:none would outrank
         it — which is exactly what silently killed the sliding page turn.
         Until that class is added at the end of build() there is no transition
         anyway, which is what the initial positioning wants. */`;

    /* Padding via <style> so every column (including overflow) gets consistent margins */
    /* The one innerHTML the reader keeps, and deliberately. This is the book
       itself: a whole chapter of markup, rebuilt on every re-layout, where
       building nodes one at a time would cost a visible pause on a long book.
       It is not raw file content — extractEpub / extractFb2 / extractPdf walk
       the parsed document and emit a fixed set of tags they construct
       themselves, running every text run through escHtml() on the way, so
       nothing from the file can arrive here as markup. The <style> block is
       interpolated from our own numbers (font size, padding, theme colours),
       never from anything a book or a reader typed. */
    const css = `
.er-flow p{text-align:${settings.textAlign || "left"}}
/* First-line indent, as in a printed book — it shows the eye where a
   paragraph begins (issue #10). Not on contents lines or code. */
.er-flow p{text-indent:${Number(settings.paraIndent) > 0 ? Number(settings.paraIndent) + "em" : "0"}}
.er-flow p.er-toc-line,.er-flow .er-side-notes p,.er-flow figure p{text-indent:0}
/* Each EPUB chapter (and the cover) starts on a fresh page, as in a printed
   book. Paragraphs are not touched, so saved places stay where they were. */
${!this.scrollMode && settings.chapterBreaks !== false ? `.er-flow .er-section[data-er-id^="epub:"] ~ .er-section[data-er-id^="epub:"]{break-before:column;-webkit-column-break-before:always}` : ""}
/* Fragmentation. A column must fill to its last line; if the next paragraph
   cannot be split, the whole paragraph jumps to the next column and leaves a
   hole several lines deep. A block becomes MONOLITHIC (unsplittable) as soon as
   it gets break-inside:avoid, contain, or any overflow other than visible — and
   the page wrappers below carry no rules of their own, so whatever the active
   theme applies to a plain <div> decides their fate. Stating it here removes
   that dependency. orphans/widows are repeated on the paragraphs themselves
   rather than relying on inheritance from the flow. */
.er-flow .er-section,.er-flow .er-pdf-page-break{
  display:block;overflow:visible;contain:none;
  break-inside:auto;-webkit-column-break-inside:auto}
.er-flow p,.er-flow li{
  break-inside:auto;-webkit-column-break-inside:auto;orphans:1;widows:1}
.er-flow p,.er-flow h1,.er-flow h2,.er-flow h3,.er-flow h4{
  padding-left:${pad}px;padding-right:${pad}px;margin:0 0 ${Math.max(0, Math.min(2, Number(settings.paraSpacing) || 0.75))}em}
.er-flow h1,.er-flow h2,.er-flow h3,.er-flow h4{margin-top:1.1em}
.er-flow>p:first-of-type,.er-flow .er-section:first-child>p:first-child,
.er-flow .er-section:first-child>h1:first-child,.er-flow .er-section:first-child>h2:first-child,
.er-flow .er-section:first-child>h3:first-child{padding-top:${padVt}px}
.er-flow img{max-width:calc(100% - ${pad*2}px);max-height:${aHinner - 12}px;height:auto;width:auto;object-fit:contain;display:block;margin:8px auto;break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid}
.er-flow figure{break-inside:avoid;-webkit-column-break-inside:avoid;margin:8px auto}
.er-flow .er-pdf-figure{margin:0 0 .9em;padding:0 ${pad}px;break-inside:avoid;-webkit-column-break-inside:avoid;text-align:center;position:relative}
/* One-click "note from this page" on image/scan pages, where there is no text to
   select and the usual highlight → note route simply doesn't exist. */
.er-flow .er-pdf-note-btn{position:absolute;top:8px;right:${pad + 8}px;width:34px;height:34px;
  display:flex;align-items:center;justify-content:center;padding:6px;cursor:pointer;
  background:var(--er-ui);color:var(--er-text);border:1px solid var(--er-border);border-radius:9px;
  opacity:.55;transition:opacity .15s,transform .15s;z-index:2}
.er-flow .er-pdf-note-btn:hover{opacity:1;transform:scale(1.06)}
.er-flow .er-pdf-note-btn svg{width:18px;height:18px}
.er-flow .er-pdf-page-img{max-width:100%;max-height:${aHinner - 24}px;width:auto;height:auto;object-fit:contain;margin:4px auto;border:1px solid var(--er-border);border-radius:10px;break-inside:avoid;-webkit-column-break-inside:avoid}
/* Program listings (PDF and EPUB): keep line breaks and indentation. Wraps rather
   than scrolls — a horizontal scrollbar has nowhere to live inside a paged column. */
.er-flow pre.er-code{margin:0 0 .85em;padding:.55em .7em;box-sizing:border-box;
  max-width:calc(100% - ${pad * 2}px);margin-left:${pad}px;margin-right:${pad}px;
  white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2;
  font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;
  font-size:.8em;line-height:1.45;background:var(--er-ui);border:1px solid var(--er-border);
  border-radius:8px;break-inside:avoid;-webkit-column-break-inside:avoid}
.er-flow pre.er-code code{font:inherit;background:none;padding:0;color:inherit}
/* Contents pages: a dot leader must never be justified — stretching it turns the
   entry into a field of dots. Title left, page number right, one row each. */
.er-flow p.er-toc-line{display:flex;align-items:baseline;gap:8px;text-align:left !important;
  margin:0 0 .35em;padding-left:${pad}px;padding-right:${pad}px}
.er-flow p.er-toc-line .er-toc-t{flex:1;min-width:0}
.er-flow p.er-toc-line .er-toc-n{flex:none;opacity:.65;font-variant-numeric:tabular-nums}
/* Notes printed in a book's margin, lifted out of the listing they annotate. */
.er-flow .er-side-notes{margin:.2em ${pad}px .9em;padding:.5em .8em;border-left:2px solid var(--er-border);
  background:color-mix(in srgb,var(--er-text) 4%,transparent);border-radius:0 8px 8px 0;
  break-inside:avoid;-webkit-column-break-inside:avoid}
.er-flow .er-side-notes p{padding:0 !important;margin:0 0 .4em;font-size:.9em;opacity:.85;text-align:left}
.er-flow .er-side-notes p:last-child{margin-bottom:0}
/* Inline identifiers inside prose — malloc(), ptr, --flag. */
.er-flow code{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;
  font-size:.86em;background:var(--er-ui);border:1px solid var(--er-border);border-radius:4px;
  padding:0 .28em;overflow-wrap:anywhere}
/* Tables from technical books: readable inside a narrow paged column. */
.er-flow table.er-table{margin:0 ${pad}px .9em;border-collapse:collapse;
  max-width:calc(100% - ${pad * 2}px);font-size:.82em;line-height:1.4;
  break-inside:avoid;-webkit-column-break-inside:avoid}
.er-flow table.er-table th,.er-flow table.er-table td{border:1px solid var(--er-border);
  padding:.3em .5em;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.er-flow table.er-table th{background:var(--er-ui);font-weight:700}
/* End-of-book marker. Empty and invisible; its only job is to be the last thing
   the column layout places, so the column it lands in is the last column the
   book occupies. See the measurement in step 5. */
.er-flow .er-end{display:block;height:0;margin:0;padding:0;border:0;visibility:hidden}
`;
    const markup = `<style>${css}</style>${html}<div class="er-end" aria-hidden="true"></div>`;
    // A re-layout keeps the book's nodes, and with them the old <style>: its
    // rules (indent, alignment, chapter breaks, padding) are refreshed in place.
    if (переклад) {
      const st = this.flow.querySelector(":scope > style");
      if (st) st.textContent = css;
    }
    // Ставим книгу разбором и переносом узлов, а не присваиванием innerHTML.
    // Результат тот же, но правила каталога прямо просят не присваивать разметку
    // в innerHTML там, где в неё попадает содержимое файла. Разметка у нас и так
    // своя (см. пояснение выше), однако проверке это не объяснить, а спорить
    // с ней дороже, чем разобрать строку в узлы.
    if (!переклад) {
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    this.flow.empty();
    // ВАЖНО: разбор уносит ведущий <style> в head, а не в body. Первая версия
    // переносила только body — и книга оставалась вообще без своей вёрстки:
    // пропадали отступы (а с ними ограничение ширины строки), выключка и
    // правила разбиения на колонки. Ошибка тихая: книга при этом открывается.
    const узлы = [...Array.from(parsed.head.childNodes), ...Array.from(parsed.body.childNodes)];
    for (const node of узлы) {
      this.flow.appendChild(document.importNode(node, true));
    }
    this._html = html;
    }

    /* 4. Two rAF: first inserts DOM, second completes multicol layout */
    await new Promise(r => window.requestAnimationFrame(r));
    await new Promise(r => window.requestAnimationFrame(r));

    /* 4b. Reserve the box of every lazy figure BEFORE measuring.
       Figures are rendered on demand. Until then the <img> has no src, and with
       `width:auto;height:auto` in the stylesheet its width/height ATTRIBUTES do
       not size it either — so it occupies literally 0×0. Pagination is therefore
       measured as if the book had no pictures at all; then, as the reader pages
       along, renderVisibleFigures() fills each image in, every one suddenly claims
       a couple of hundred pixels, the columns after it re-flow, and the page stops
       matching the offsets measured here. That is the sideways drift that got
       worse the deeper into the book you went, and that "Обновить" could not fix
       (it re-measured with the images blank all over again).
       Sizing the placeholder from the PDF's own dimensions, clamped to the column
       exactly as the stylesheet would, makes loading and unloading a figure a
       purely cosmetic event. */
    const figMaxH = Math.max(40, aHinner - 24);
    for (const img of this.flow.querySelectorAll("img.er-pdf-lazy")) {
      const aw = parseFloat(img.getAttribute("width")) || 0;
      const ah = parseFloat(img.getAttribute("height")) || 0;
      if (!aw || !ah) continue;
      const host = img.parentElement;
      const hostW = host ? host.getBoundingClientRect().width - pad * 2 : colW - pad * 2;
      const maxW = Math.max(40, hostW);
      const scale = Math.min(1, maxW / aw, figMaxH / ah);
      img.style.width = `${Math.round(aw * scale)}px`;
      img.style.height = `${Math.round(ah * scale)}px`;
    }
    await new Promise(r => window.requestAnimationFrame(r));

    /* 5. How many columns the book actually occupies.
          Read off ONE element: the empty marker appended after all the content,
          which the column layout necessarily places in the last column in use.

          What this replaces scanned every p/h1-h4/img and took the rightmost
          edge, and it was wrong twice over. It could not see a list, a code
          listing, a table or a blockquote, so a book whose tail is any of those
          measured as though it ended at its last paragraph — and step (b) then
          cut the flow off there for real, leaving the rest of the book behind a
          wall. Measured in Chrome: a list-heavy book needing 142 spreads showed
          5, one needing 48 showed 2. That is the "book opens with only 14 pages
          and skips whole chunks" report, and it happened in one-column mode too,
          so switching to a single column only ever helped by coincidence.
          It was also a getBoundingClientRect per block, run twice, which is a
          large part of why a 3000-page book took seconds to open. */
    const endEl = this.flow.querySelector(".er-end");
    const measure = () => {
      const fRect = this.flow.getBoundingClientRect();
      let lastX = endEl ? endEl.getBoundingClientRect().right - fRect.left : 0;
      if (lastX <= 0) {
        /* No marker to go by — fall back to the widest block we can find. */
        for (const el of this.flow.querySelectorAll(
          "p,h1,h2,h3,h4,h5,h6,img,li,pre,table,blockquote,figure,dd,dt")) {
          const r = el.getBoundingClientRect().right - fRect.left;
          if (r > lastX) lastX = r;
        }
      }
      return Math.max(1, Math.ceil(lastX / slot));
    };

    /* Scrolling has no columns to count: a "spread" is one screenful, and the
       book is as many of those as its height divides into. Measured from the
       clip's own scroll extent, which is the one number that is always right. */
    if (this.scrollMode) {
      this.sw = aH;
      this.cols = 1;
      this._pitch = aH;
      this._colX = null;
      const viewH = this.clip.clientHeight || aH;
      this.total = Math.max(1, Math.ceil((this.clip.scrollHeight || viewH) / viewH));
      this.spread = Math.max(0, Math.min(savedSpread, this.total - 1));
      this.flow.toggleClass("er-flow-anim", this.animate !== false);
      this.applyTransform(false);
      // Free scrolling has no page turn to hang anything off, so the position
      // has to be picked up from the scroller itself. Without this the progress
      // bar never moved, the place was never saved, and lazy pictures never
      // loaded — the reader would scroll into a book that stayed blank.
      //
      // Debounced: a scroll fires continuously, and re-reading the position on
      // every frame would make the reading itself stutter.
      this.clip.addEventListener("scroll", () => {
        window.clearTimeout(this._scrollT);
        this._scrollT = window.setTimeout(() => {
          const h = this.clip.clientHeight || 1;
          const at = Math.max(0, Math.min(Math.round(this.clip.scrollTop / h), this.total - 1));
          if (at === this.spread) return;
          this.spread = at;
          if (this.onSpreadChange) this.onSpreadChange(at, this.total);
        }, 140);
      }, { passive: true });
      return [this.spread, this.total];
    }

    /* Pages are moved by transform, never by scrolling — but the browser will
       scroll this box on its own to follow a selection being dragged (see
       .er-clip in styles.css). `overflow: clip` forbids that; this catches
       engines that predate it. */
    if (!this._clipGuard) {
      this._clipGuard = () => {
        if (this.scrollMode || !this.clip) return;
        if (this.clip.scrollLeft || this.clip.scrollTop) { this.clip.scrollLeft = 0; this.clip.scrollTop = 0; }
      };
    }
    if (this._guardedClip !== this.clip) {
      this.clip.addEventListener("scroll", this._clipGuard, { passive: true });
      this._guardedClip = this.clip;
    }
    this._clipGuard();
    /* a) count the columns on the roomy layout */
    let nPhys = measure();
    /* b) trim the flow to exactly those columns. The column width is fixed by
          construction, so nothing re-breaks and the count holds still. */
    this.flow.style.width = `${Math.ceil(nPhys * slot) - gap}px`;
    await new Promise(r => window.requestAnimationFrame(r));
    await new Promise(r => window.requestAnimationFrame(r));
    /* c) confirm on the trimmed layout, and never shrink below what was seen */
    nPhys = Math.max(nPhys, measure());

    this.sw = slot * cols;
    this.cols = cols;
    this._pitch = slot;
    // Anchor table: the REAL left offset of each column, keyed by column index.
    //
    // It exists to absorb a drifting stride. When the stride was measured back
    // out of the layout it was a float that could be off by a fraction of a
    // pixel, and multiplying it by the spread number grew that fraction into a
    // ~150px sideways shift by spread 159 — fine at the start of a book, three
    // half-columns deep in. Now that the stride is declared instead of measured
    // the multiplication is exact, so the table is normally not built at all:
    // it costs a getBoundingClientRect per block, which is real time in a long
    // book, and _spreadOffset falls back to spread × stride without it.
    //
    // Verified rather than assumed: the marker sits in the last column of the
    // book, the farthest point from the origin and so where any per-column
    // error would have piled up into its largest value. If it is not where the
    // arithmetic says it should be, the layout is not behaving as declared and
    // the measured table is built after all.
    this._colX = null;
    try {
      const fRect2 = this.flow.getBoundingClientRect();
      const endX = endEl ? endEl.getBoundingClientRect().left - fRect2.left : 0;
      if (endEl && Math.abs(endX - (nPhys - 1) * slot) > 1) {
        this._colX = /* @__PURE__ */ new Map();
        for (const el of this.flow.querySelectorAll("p,h1,h2,h3,h4")) {
          const x = el.getBoundingClientRect().left - fRect2.left;
          const k = Math.round(x / slot);
          // Keep the smallest offset seen for a column: blocks indented by margin
          // (code, tables) sit further right than the column edge.
          if (!this._colX.has(k) || x < this._colX.get(k)) this._colX.set(k, x);
        }
      }
    } catch { this._colX = null; }
    this.total = Math.max(1, Math.ceil(nPhys / cols));
    this.spread = Math.max(0, Math.min(savedSpread, this.total - 1));
    this.flow.toggleClass("er-flow-anim", this.animate !== false);
    this.applyTransform(false);
    return [this.spread, this.total];
  }
  // How far down to nudge the page so a short spread isn't stranded at the top.
  //
  // CSS multi-column can't centre a column's contents, so this measures how much
  // of the page the current spread actually fills and shifts the whole flow by
  // half the leftover. Geometry is cached per spread: it only changes when the
  // book is re-laid out, and reading through a long book would otherwise re-measure
  // thousands of blocks on every page turn.
  _vOffset() {
    const mode = this._vAlign || "top";
    if (mode === "top" || !this.flow) return 0;
    if (!this._vCache) this._vCache = /* @__PURE__ */ new Map();
    if (this._vCache.has(this.spread)) return this._vCache.get(this.spread);
    let off = 0;
    try {
      if (!this._blockGeom) {
        const fRect = this.flow.getBoundingClientRect();
        this._blockGeom = [...this._blocks()].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - fRect.left, bottom: r.bottom - fRect.top };
        });
      }
      const from = this._spreadOffset(), to = from + this.sw;
      let maxBottom = 0;
      for (const g of this._blockGeom) if (g.x >= from - 2 && g.x < to - 2 && g.bottom > maxBottom) maxBottom = g.bottom;
      const height = this.flow.clientHeight || 0;
      if (maxBottom > 0 && height > 0) {
        const leftover = height - maxBottom;
        // Centre only genuinely short pages — the end of a chapter or of the book.
        // Nudging every ordinary page by its own few leftover pixels is what made
        // the text appear to jump around while paging through a normal chapter.
        if (leftover > height * SHORT_PAGE_GAP) off = mode === "center" ? leftover / 2 : leftover;
      }
    } catch { off = 0; }
    // Whole pixels only: a fractional offset lands glyphs between device pixels
    // and the whole page reads as slightly out of focus.
    off = Math.round(off);
    this._vCache.set(this.spread, off);
    return off;
  }
  // Horizontal offset of the current spread, taken from the measured position of
  // its first column when that column is known. Falls back to stride×index for
  // columns holding no text block (a full-page image, say).
  _spreadOffset() {
    if (this.scrollMode) return this.clip ? this.clip.scrollTop : 0;
    const k = this.spread * (this.cols || 1);
    const exact = this._colX && this._colX.get(k);
    if (typeof exact === "number") return exact;
    // Column with no text block of its own (a full-page figure). Anchor on the
    // nearest column that does have one, so any residual error in the pitch is
    // limited to that short distance instead of accumulating from column zero.
    if (this._colX && this._colX.size) {
      let bestK = null;
      for (const kk of this._colX.keys()) {
        if (bestK === null || Math.abs(kk - k) < Math.abs(bestK - k)) bestK = kk;
      }
      if (bestK !== null) return this._colX.get(bestK) + (k - bestK) * (this._pitch || this.sw / (this.cols || 1));
    }
    return this.spread * this.sw;
  }
  applyTransform(animate = true) {
    if (this.scrollMode) {
      // A screenful at a time, and the browser owns the motion. Smooth scrolling
      // is asked for only when the move was a deliberate jump, not while the
      // reader is dragging — that would fight the finger.
      const viewH = this.clip.clientHeight || 1;
      this.clip.scrollTo({ top: this.spread * viewH, behavior: animate ? "smooth" : "auto" });
      return;
    }
    // Horizontal paging and vertical placement are deliberately carried by two
    // DIFFERENT properties. Both used to live in one `translate(x, y)`, so a page
    // turn animated x and y together and the page visibly slid diagonally toward
    // the corner. `transform` is the only transitioned property; `top` (paint-time
    // offset under position:relative — it does NOT re-flow the columns) applies
    // instantly, so paging is always dead horizontal.
    this.flow.style.top = this._vOffset() + "px";
    // Round to whole pixels: a fractional translate lands glyphs between device
    // pixels and the whole page reads as slightly out of focus.
    const t = `translate3d(${-Math.round(this._spreadOffset())}px, 0, 0)`;
    if (!animate) {
      // Jump rather than slide: drop the animation class, force the layout to
      // settle at the new offset, then put the class back on the next frame so
      // ordinary page turns keep sliding. The forced getBoundingClientRect is
      // what makes the browser apply the class change before the transform.
      this.flow.removeClass("er-flow-anim");
      this.flow.getBoundingClientRect();
      this.flow.style.transform = t;
      window.requestAnimationFrame(() => this.flow.toggleClass("er-flow-anim", this.animate !== false));
    } else {
      this.flow.style.transform = t;
    }
  }
  next() {
    if (this.spread < this.total - 1)
      this.spread++;
    this.applyTransform();
    return [this.spread, this.total];
  }
  prev() {
    if (this.spread > 0)
      this.spread--;
    this.applyTransform();
    return [this.spread, this.total];
  }
  goTo(s, animate = true) {
    this.spread = Math.max(0, Math.min(s, this.total - 1));
    this.applyTransform(animate);
    return [this.spread, this.total];
  }
  // A jump is not a page turn: it must land, not travel. It was an alias for
  // goTo, so restoring the saved position slid the flow from spread 0 all the
  // way to the target — a quarter of a second of pages whipping past, which on
  // a phone reads as the book flickering open. Same for the table of contents,
  // search results and links from a quote: none of them mean "turn the pages".
  jumpTo(s) { return this.goTo(s, false); }
  // ── Content anchor (device-independent reading position) ──────────────
  // All p/h blocks in reading (column-fill) order. The SAME sequence exists on
  // phone and PC, so a block's global index pins the exact reading spot.
  _blocks() { return this.flow ? this.flow.querySelectorAll("p,h1,h2,h3,h4") : []; }
  // First block at or below the top of the visible area, while scrolling.
  // Binary search rather than a walk: on a long book the walk is thousands of
  // rect reads on every scroll settle, and this runs on every saved position.
  _blockIndexAtScroll() {
    const blocks = this._blocks();
    if (!blocks.length || !this.clip) return 0;
    const fTop = this.flow.getBoundingClientRect().top;
    const want = this.clip.scrollTop - 2;
    const topAt = (i) => blocks[i].getBoundingClientRect().top - fTop;
    let lo = 0, hi = blocks.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (topAt(mid) >= want) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans;
  }
  // Global index of the first block at the current spread's left edge. x grows
  // monotonically with DOM order under column-fill, so binary-search it.
  currentBlockIndex() {
    if (this.scrollMode) return this._blockIndexAtScroll();
    const blocks = this._blocks();
    if (!blocks.length || !this.sw) return 0;
    const fLeft = this.flow.getBoundingClientRect().left;
    // Same anchored offset the transform uses, so "what is on screen" and "where
    // we scrolled to" can never disagree.
    const winLeft = this._spreadOffset() - 2;
    const xat = (i) => blocks[i].getBoundingClientRect().left - fLeft;
    let lo = 0, hi = blocks.length - 1, ans = blocks.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (xat(mid) >= winLeft) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans;
  }
  // Spread that contains the block with the given global index.
  spreadForBlock(idx) {
    if (this.scrollMode) {
      const blocks = this._blocks();
      if (!blocks.length || idx < 0) return 0;
      const el = blocks[Math.min(idx, blocks.length - 1)];
      const top = el.getBoundingClientRect().top - this.flow.getBoundingClientRect().top;
      const viewH = this.clip.clientHeight || 1;
      return Math.max(0, Math.min(Math.floor(top / viewH), this.total - 1));
    }
    const blocks = this._blocks();
    if (!blocks.length || !this.sw || idx < 0) return 0;
    const el = blocks[Math.min(idx, blocks.length - 1)];
    const x = el.getBoundingClientRect().left - this.flow.getBoundingClientRect().left;
    // Via the column index rather than raw division: the stride is a float, and
    // dividing by it drifts by a whole spread once the error accumulates.
    const k = Math.round(x / (this.sw / (this.cols || 1)));
    return Math.max(0, Math.min(Math.floor(k / (this.cols || 1)), this.total - 1));
  }
  // The block element for the given global index (for the resume flash).
  blockEl(idx) {
    const blocks = this._blocks();
    if (!blocks.length) return null;
    return blocks[Math.min(Math.max(0, idx), blocks.length - 1)] || null;
  }
  get currentSpread() {
    return this.spread;
  }
  get currentPct() {
    return this.total > 1 ? this.spread / (this.total - 1) : 0;
  }
  get totalSpreads() {
    return this.total;
  }
};
// A path inside an EPUB, from the file that mentions it. Returns the form
// epub.js's archive expects ("/OEBPS/Images/a.jpg": leading slash, still
// URI-encoded — the archive decodes it itself).
//
// The old code glued the reference onto the chapter's folder and only tidied
// "/./" and "//". The usual layout made by Calibre and Sigil keeps chapters in
// Text/ and pictures in Images/, so every picture is "../Images/…" — and the
// archive has no entry called "Text/../Images/…". That is the "EPUB shows no
// pictures at all" report: the image stayed a relative link to nowhere.
function epubResolve(base, href) {
  href = String(href || "").trim().split("#")[0];
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return "";
  const parts = href.startsWith("/") ? [] : String(base || "").split("/").slice(0, -1).filter(Boolean);
  for (const seg of href.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return "/" + parts.join("/");
}
// A link target inside the book: the chapter file plus the id in it, so that
// "chapter3.xhtml#note12" from any chapter points at the same place.
function epubAnchorKey(path, id) {
  return "epub:" + String(path || "").replace(/^\/+/, "") + (id ? "#" + id : "");
}
const erEpubNav = new Map();
// Close an epub.js book only once it has finished opening. Right after
// book.ready epub.js is still rewriting the book's internal resources in the
// background; destroying it then made those tasks throw into the console
// ("reading 'replaceCss'") — harmless, but dozens of them while the library
// built its covers.
function erDestroyEpub(book) {
  const done = () => { try { book.destroy(); } catch { /* already gone */ } };
  Promise.race([book.opened, new Promise((r) => window.setTimeout(r, 4000))]).then(done, done);
}
async function extractEpub(file, app) {
  const buf = await app.vault.readBinary(file);
  const book = ePub(buf);
  await book.ready;
  const spineItems = book.spine.spineItems;
  const parts = [];
  const XLINK = "http://www.w3.org/1999/xlink";
  for (const item of spineItems) {
    try {
      const doc = await item.load(book.load.bind(book));
      const body = doc.querySelector?.("body") ?? doc;
      const here = item.url || "";
      const toData = async (ref) => {
        const p = epubResolve(here, ref);
        if (!p) return "";
        try { return erSafeImgSrc(await book.archive.getBase64(p)); } catch { return ""; }
      };
      for (const img of Array.from(body.querySelectorAll?.("img") ?? [])) {
        const src = img.getAttribute("src") || "";
        if (src.startsWith("data:")) { img.setAttribute("src", erSafeImgSrc(src)); continue; }
        img.setAttribute("src", await toData(src));
      }
      // Pictures drawn through SVG — <svg><image xlink:href="…"/></svg>. That is
      // how most EPUB covers and many illustrated pages are made, and the old
      // walker knew only <img>: the cover page came out empty and was dropped,
      // which readers saw as "the first page with the cover disappeared".
      // Replaced by a plain <img> marked as such, so nodeToHtml can show it
      // without counting it as a paragraph (see there).
      for (const svg of Array.from(body.querySelectorAll?.("svg") ?? [])) {
        const im = svg.querySelector("image");
        if (!im) continue;
        let href = "";
        try { href = im.getAttributeNS(XLINK, "href") || ""; } catch { /* attribute API missing */ }
        href = href || im.getAttribute("xlink:href") || im.getAttribute("href") || "";
        const data = href.startsWith("data:") ? erSafeImgSrc(href) : await toData(href);
        if (!data) continue;
        // item.load() hands back the root element, not the document.
        const img = (svg.ownerDocument || body.ownerDocument).createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.setAttribute("src", data);
        img.setAttribute("data-er-svg", "1");
        svg.replaceWith(img);
      }
      // Link targets. Every element with an id gets one, so a footnote, a
      // "see chapter 4" or a contents page inside the book has somewhere to land.
      for (const el of Array.from(body.querySelectorAll?.("[id]") ?? [])) {
        el.setAttribute("data-er-anchor", epubAnchorKey(here, el.getAttribute("id")));
      }
      // Links inside the book: resolved to the same key. Anything that leaves
      // the book (http:, mailto:) is left as plain text — opening the web from
      // the middle of a page was never asked for and is easy to tap by accident.
      for (const a of Array.from(body.querySelectorAll?.("a[href]") ?? [])) {
        const raw = a.getAttribute("href") || "";
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
        const [pathPart, frag] = raw.split("#");
        const target = pathPart ? epubResolve(here, pathPart) : "/" + here.replace(/^\/+/, "");
        if (!target) continue;
        a.setAttribute("data-er-link", epubAnchorKey(target, frag || ""));
      }
      const html = nodeToHtml(body);
      if (html.trim())
        parts.push(`<div class="er-section" data-er-id="${escHtml(epubAnchorKey(here, ""))}">${html}</div>`);
      item.unload();
    } catch (e) { console.warn("Book Reader: EPUB chapter skipped", item && item.url, e); }
  }
  // The book's own table of contents (NCX / nav), as anchor keys. Many EPUBs
  // mark chapters with styled paragraphs rather than <h1>, and their contents
  // came out empty ("Book contents not available", issue #8) — the book knew
  // its chapters all along.
  try {
    const nav = await book.loaded.navigation;
    const urls = spineItems.map((it) => String(it.url || "").replace(/^\/+/, ""));
    const keyFor = (href) => {
      const [pathPart, frag] = String(href || "").split("#");
      let clean = pathPart;
      try { clean = decodeURIComponent(pathPart); } catch { /* keep as is */ }
      clean = clean.replace(/^(\.\.\/|\.\/)+/, "").replace(/^\/+/, "");
      if (!clean) return "";
      const dec = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
      const hit = urls.find((u) => dec(u) === clean || dec(u).endsWith("/" + clean));
      return hit ? epubAnchorKey(hit, frag || "") : "";
    };
    const flat = [];
    const walk = (items, level) => {
      for (const it of items || []) {
        const anchor = keyFor(it.href);
        const label = String(it.label || "").replace(/\s+/g, " ").trim();
        if (anchor && label) flat.push({ label, anchor, level });
        if (it.subitems && it.subitems.length && level < 3) walk(it.subitems, level + 1);
      }
    };
    walk(nav && nav.toc, 0);
    erEpubNav.set(file.path, flat);
  } catch { erEpubNav.delete(file.path); }
  book.destroy();
  return parts.join("\n");
}
// ── Translation ───────────────────────────────────────────────────────────────
// Translate a fragment through Google's public keyless endpoint.
//
// Two deliberate choices:
//  • requestUrl (Obsidian API), not fetch — the reader runs in a renderer where
//    CORS would block this host outright; requestUrl goes through the app.
//  • Chunking — the endpoint silently truncates long input, so a long selection
//    is split on sentence/word boundaries and stitched back together.
//
// This endpoint is free and needs no key, but it's unofficial and rate-limited:
// it is meant for selections, not for translating a whole book.
async function translateText(text, to = "ru") {
  const q = (text || "").replace(/\s+/g, " ").trim();
  if (!q) return "";
  const MAX = 1600;
  const chunks = [];
  let rest = q;
  while (rest.length > MAX) {
    // Prefer a sentence end, else a space; never cut mid-word.
    let cut = rest.lastIndexOf(". ", MAX);
    if (cut < MAX * 0.4) cut = rest.lastIndexOf(" ", MAX);
    if (cut <= 0) cut = MAX; else cut += 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  let out = "";
  for (const chunk of chunks) {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto"
      + `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(chunk)}`;
    // `throw: false` so the STATUS is visible here. Letting requestUrl throw
    // collapsed every failure into one "you need internet" message, which is
    // what a tablet reader saw while plainly being online: the real answer was
    // Google rate-limiting the free endpoint.
    const res = await requestUrl({ url, method: "GET", throw: false });
    if (res.status === 429 || res.status === 503) {
      const err = new Error("translate rate-limited");
      err.erReason = "limit";
      throw err;
    }
    if (res.status < 200 || res.status >= 300) {
      const err = new Error("translate http " + res.status);
      err.erReason = "http";
      err.erStatus = res.status;
      throw err;
    }
    const data = res.json;
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("unexpected translate response");
    out += data[0].map((p) => (p && p[0]) || "").join("");
  }
  return out.trim();
}
/* ── Reading a book in a foreign language ──────────────────────────────────
 *
 * Readers described the same routine: copy a passage out of the book, paste it
 * into a chat model, and ask for a translation plus a word-by-word breakdown —
 * why this word and not another, and sometimes where it came from. Then paste
 * the answer back. This does that without leaving the page.
 *
 * Every provider here speaks OpenAI's chat-completions dialect, so a provider
 * is only a base URL, a key and a model name — one request path for all of them.
 *
 * requestUrl, never fetch: a fetch() from a plugin is a browser request and is
 * subject to CORS, and a local Ollama server refuses the app://obsidian.md
 * origin unless the reader sets OLLAMA_ORIGINS by hand. requestUrl is issued by
 * the app itself, so the local option works with no setup — which is the whole
 * reason for offering it.
 */
const AI_PROVIDERS = {
  eltonlabs:  { label: "Elton AI", needsKey: true,  base: "https://api.eltonlabs.org/v1", model: "anthropic/claude-haiku-4.5" },
  openrouter: { label: "OpenRouter", needsKey: true, base: "https://openrouter.ai/api/v1", model: "anthropic/claude-haiku-4.5" },
  openai:     { label: "OpenAI", needsKey: true, base: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  // Runs on the reader's own machine; nothing leaves the device.
  local:      { label: "Ollama / LM Studio", needsKey: false, base: "http://localhost:11434/v1", model: "qwen2.5:3b" },
};
function aiConfig(settings) {
  const id = settings.aiProvider || "eltonlabs";
  const p = AI_PROVIDERS[id] || AI_PROVIDERS.eltonlabs;
  return {
    id,
    base: (settings.aiBase || p.base).replace(/\/+$/, ""),
    model: settings.aiModel || p.model,
    key: settings.aiKey || "",
    needsKey: p.needsKey,
  };
}
// One instruction for the whole conversation. The breakdown is not a mode of its
// own: it is simply the question most readers ask first, so it is described here
// and sent as an ordinary message.
function aiSystemChat(into) {
  return [
    `You are helping someone read a book in a language they are still learning.`,
    `They send a passage from it and then talk to you about that passage.`,
    `Answer in ${into}. Use Markdown. Be concise — this is read beside the book, not instead of it.`,
    ``,
    `If they ask for разбор (a breakdown) of the passage, give exactly these sections:`,
    `1. **Перевод** — a natural translation of the whole passage, not word-for-word.`,
    `2. **По словам** — a list of only the words and phrases that are genuinely hard`,
    `   (idioms, rare senses, false friends). Skip anything obvious. For each: the word,`,
    `   its meaning HERE, and its dictionary form if that differs.`,
    `3. **Почему так сказано** — the tone, register or construction that a learner`,
    `   would miss: why this wording rather than the plain one. Two or three sentences.`,
    `4. **Откуда слово** — etymology for at most two words, and only where it actually`,
    `   helps remember them. Omit this section entirely if nothing qualifies.`,
    ``,
    `For anything else, just answer what was asked — no fixed sections, and no`,
    `translation of the whole passage unless that is what they asked for.`,
  ].join("\n");
}
// The reader's own instruction replaces the built-in one entirely. The passage
// rides along with their first message, so the model never sees it as an order.
function aiMessages(text, settings, turns, book) {
  const into = settings.aiInto || "русском";
  const own = (settings.aiSystem || "").trim();
  const msgs = [{ role: "system", content: own || aiSystemChat(into) }];
  // Which book this is from, sent quietly with the passage: a page out of context
  // reads very differently from the same page in a book the model knows.
  const from = String(book || "").trim();
  const head = (from ? `Из книги «${from}».\n` : "") + `Фрагмент:\n${text}`;
  turns.forEach((turn, i) => {
    msgs.push(i === 0 && turn.role === "user"
      ? { role: "user", content: `${head}\n\n${turn.content}` }
      : { role: turn.role, content: turn.content });
  });
  return msgs;
}
async function aiExplain(text, settings, turns, book) {
  const cfg = aiConfig(settings);
  if (cfg.needsKey && !cfg.key) {
    const err = new Error("no api key");
    err.erReason = "nokey";
    throw err;
  }
  const headers = { "Content-Type": "application/json" };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  const body = JSON.stringify({
    model: cfg.model,
    messages: aiMessages(text, settings, turns, book),
    temperature: 0.2,
    max_tokens: 900,
  });
  // Elton AI has two addresses; from Russia the international one often does
  // not connect at all ("no internet" in the chat while the internet was fine).
  // The one that answered last goes first, the other is the fallback.
  if (cfg.id === "eltonlabs" && !settings.aiBase) await erEltonProbe(cfg.key);
  const bases = cfg.id === "eltonlabs" && !settings.aiBase
    ? [ER_TTS_HOSTS[erTtsHost], ER_TTS_HOSTS[(erTtsHost + 1) % ER_TTS_HOSTS.length]]
    : [cfg.base];
  let res = null, netErr = null;
  for (let k = 0; k < bases.length && !res; k++) {
    try {
      res = await Promise.race([
        requestUrl({ url: `${bases[k]}/chat/completions`, method: "POST", headers, throw: false, body }),
        new Promise((_, rej) => window.setTimeout(() => rej(new Error("timeout")), 60000))
      ]);
      const hi = ER_TTS_HOSTS.indexOf(bases[k]);
      if (hi >= 0) erTtsHost = hi;
    } catch (e) { netErr = e; }
  }
  if (!res) throw netErr || new Error("network");
  if (res.status === 401 || res.status === 403) {
    const err = new Error("auth"); err.erReason = "auth"; throw err;
  }
  if (res.status === 429) {
    const err = new Error("rate"); err.erReason = "limit"; throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    const err = new Error("http " + res.status);
    err.erReason = "http";
    err.erStatus = res.status;
    // A local server that is simply not running is the single most likely
    // failure of the local option, and "http 0" explains nothing.
    if (cfg.id === "local") err.erReason = "local";
    throw err;
  }
  const data = res.json;
  let out = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";
  if (!out) { const err = new Error("empty"); err.erReason = "empty"; throw err; }
  return out;
}
// Shows the translation of a selection, with the original kept above it so the
// reader can compare. Actions mirror the popup: copy, or save as a note (the
// note keeps the ORIGINAL quote and puts the translation under it).
const TranslateModal = class extends Modal {
  constructor(app, plugin, text, bookFile) {
    super(app);
    this.plugin = plugin;
    this.text = text;
    this.bookFile = bookFile;
  }
  async onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h3", { text: __ertr("Перевод") });
    const box = (label) => {
      const w = c.createDiv();
      w.addClass("er-tr-box");
      const l = w.createDiv();
      l.setText(label);
      l.addClass("er-tr-label");
      const b = w.createDiv();
      b.style.cssText = "max-height:180px;overflow:auto;padding:10px 12px;border:1px solid var(--background-modifier-border);"
        + "border-radius:8px;background:var(--background-secondary);line-height:1.55;white-space:pre-wrap;user-select:text";
      return b;
    };
    box(__ertr("Оригинал")).setText(this.text);
    const outEl = box(__ertr("Перевод"));
    outEl.setText(__ertr("Переводим…"));
    let tr = "";
    try {
      tr = await translateText(this.text, this.plugin.settings.translateTo || "ru");
      outEl.setText(tr || __ertr("Пустой ответ переводчика"));
    } catch (e) {
      console.error("Elton Reader: translate failed", e);
      const why = e && e.erReason;
      outEl.setText(
        why === "limit"
          ? __ertr("Google ограничил частые переводы. Подождите минуту и попробуйте снова — это ограничение бесплатного Google Translate, а не вашего интернета.")
          : why === "http"
            ? __ertr("Переводчик ответил ошибкой {0}. Интернет при этом работает — попробуйте позже.", e.erStatus)
            : __ertr("Не удалось связаться с переводчиком. Похоже, нет интернета."));
      return;
    }
    new Setting(c)
      .addButton((b) => b.setButtonText(__ertr("Копировать перевод")).onClick(async () => {
        const ok = await copyToClipboard(tr);
        new Notice(ok ? __ertr("Скопировано ✓") : __ertr("Не удалось скопировать"));
      }))
      .addButton((b) => b.setButtonText(__ertr("В заметку")).setCta().onClick(async () => {
        // The note keeps the original as the quote (that's what's citable) and
        // adds the translation beneath it.
        await createNoteFromSelection(this.app, this.plugin, this.text, this.bookFile, {
          open: false, silent: true, extra: __ertr("\n\n**Перевод:**\n{0}", tr)
        });
        new Notice(__ertr("Заметка создана"));
        this.close();
      }));
  }
  onClose() { this.contentEl.empty(); }
};
// Is the reader running on a phone/tablet? Platform is the modern API; app.isMobile
// is the long-standing fallback, so a missing Platform never breaks the reader.
// Книга раскладывается не мгновенно, а шторка (er-booting) прячет полуготовую
// разметку — на телефоне это несколько секунд пустого экрана, по которому не понять,
// зависла книга или плагин. Вместо пустоты — скелет страницы с мягким мерцанием:
// видно, что работа идёт. Вешается на корень читалки, потому что саму область
// вёрстка по дороге очищает.
function erShowVeil(view, text) {
  const host = view && view.areaEl && view.areaEl.parentElement;
  if (!host) return;
  erHideVeil(view);
  const veil = host.createDiv("er-veil");
  const sk = veil.createDiv("er-veil-skel");
  for (let i = 0; i < 8; i++) sk.createDiv("er-veil-line");
  veil.createDiv({ cls: "er-veil-text", text: text || __ertr("Раскладываем страницы…") });
  view._veil = veil;
}
function erHideVeil(view) {
  if (view && view._veil) {
    view._veil.remove();
    view._veil = null;
  }
}
// Автофокус — только там, где есть настоящая клавиатура.
//
// На телефоне `.focus()` в поле поднимает экранную клавиатуру, и она закрывает
// половину окна: у вопроса «завести заметку книги?» под ней оказались обе
// кнопки, а окно разговора встречало клавиатурой вместо текста. Спрятать её из
// плагина нечем — в вебвью нет такого API, единственный способ не мешать
// читателю это не забирать фокус самим. По тапу в поле всё работает как всегда.
// Тап мимо поля убирает клавиатуру.
//
// Так ведёт себя любой мессенджер, и именно этого не хватало: на телефоне
// клавиатура остаётся висеть, пока у поля есть фокус, а спрятать её из вебвью
// можно ровно одним способом — снять фокус. Слушаем pointerdown, а не click:
// клавиатура должна уходить в тот же момент, когда палец коснулся экрана.
function erBlurOnTapOutside(root, field) {
  if (!root || !field) return;
  root.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t === field) return;
    // Своя строка ввода (поле + кнопка отправки) не считается «мимо»: нажатие
    // на «отправить» не должно закрывать клавиатуру раньше самой отправки.
    if (t instanceof HTMLElement && t.closest(".er-ai-bar, .er-find-bar, input, textarea")) return;
    if (docOf(field).activeElement === field) field.blur();
  });
}
function erAutoFocus(el, delayMs) {
  if (!el || erIsMobile()) return;
  // preventScroll: the field is already on screen; letting focus scroll would
  // also move the boxes around it (the reader, while a panel slides in).
  if (delayMs) window.setTimeout(() => { try { el.focus({ preventScroll: true }); } catch { /* optional step; a failure here must not interrupt reading */ } }, delayMs);
  else { try { el.focus({ preventScroll: true }); } catch { /* optional step; a failure here must not interrupt reading */ } }
}
function erIsMobile(app) {
  try {
    if (Platform && typeof Platform.isMobile === "boolean") return Platform.isMobile;
  } catch { /* optional step; a failure here must not interrupt reading */ }
  return !!(app && app.isMobile);
}
// Place the highlight bar.
//
// On mobile it is DOCKED to the bottom of the reader rather than floated over the
// selection: Android/iOS draw their own selection toolbar (copy / share / select
// all) directly above the selected text, as an OS-level layer that always wins.
// Ours used to land in exactly that spot and was permanently hidden behind it.
// On desktop there is no such toolbar, so the bar stays next to the selection.
function positionHlPopup(view, rect, fallbackW, fallbackH) {
  const pop = view.hlPopup;
  const root = view.contentEl;
  if (erIsMobile(view.app)) {
    // Docked rather than floated: Android and iOS draw their own selection
    // toolbar (copy / share / select all) directly over the selection, as an
    // OS layer that always wins, and ours used to land underneath it.
    //
    // Which edge it docks to is chosen per selection. Always docking to the
    // bottom left it half a screen away on a tablet — a reader said he did not
    // even notice it had appeared. Docking to the edge FURTHEST from the
    // selection keeps it clear of the OS toolbar while staying in view.
    // Just BELOW the selection, not pinned to the bottom of the screen.
    //
    // Both extremes were wrong. Floating it over the selection buried it under
    // the OS toolbar; pinning it to the bottom edge put it a whole page away
    // from what you had just selected. Below the selection is the one place
    // that is neither: Android and iOS put their own toolbar ABOVE the
    // selection, so the space underneath is free, and the bar appears where the
    // eye already is.
    const rootRect = root.getBoundingClientRect();
    const barH = pop.offsetHeight || fallbackH || 92;
    const barW = pop.offsetWidth || fallbackW || 260;
    // Keep clear of the page controls at the foot of the reader.
    const bottomLimit = rootRect.height - barH - 74;
    const hasRect = rect && rect.height;
    // 36px, not 12: the system's selection handles hang about 24px below the
    // last line, and a bar right under the text sat on them — the handle you
    // need to drag was under our button (seen on Android 14).
    let top = hasRect ? rect.bottom - rootRect.top + 36 : bottomLimit;
    // No room underneath (selection near the foot of the page) — go above it
    // instead, which on that part of the screen is where the OS toolbar is not.
    if (top > bottomLimit) {
      // Not "just above the selection": that is exactly where Android and iOS
      // put their own Copy / Share toolbar, and ours disappeared under it
      // (seen on Android 14 with a selection on the last line of a page). The
      // top of the reading area is the one place guaranteed free of it.
      const topBar = root.querySelector(".er-top");
      const under = topBar ? topBar.getBoundingClientRect().bottom - rootRect.top + 10 : 8;
      top = Math.max(8, under);
    }
    pop.classList.add("er-hl-popup-docked");
    pop.style.removeProperty("bottom");
    pop.style.top = `${Math.round(Math.max(8, top))}px`;
    // Centred on the selection, then kept inside the page.
    const wantLeft = hasRect
      ? rect.left - rootRect.left + rect.width / 2 - barW / 2
      : (rootRect.width - barW) / 2;
    pop.style.left = `${Math.round(Math.max(8, Math.min(wantLeft, rootRect.width - barW - 8)))}px`;
    return;
  }
  pop.classList.remove("er-hl-popup-docked");
  const rootRect = root.getBoundingClientRect();
  const pw = pop.offsetWidth || fallbackW, ph = pop.offsetHeight || fallbackH;
  let left = rect.left - rootRect.left + rect.width / 2 - pw / 2;
  let top = rect.top - rootRect.top - ph - 10;
  if (top < 4) top = rect.bottom - rootRect.top + 10;
  left = Math.max(6, Math.min(left, root.clientWidth - pw - 6));
  // В режиме прокрутки выделенный абзац может оказаться выше или ниже видимой
  // части: без ограничения панель уезжала на тысячи пикселей за экран и просто
  // «пропадала». Держим её внутри области чтения при любом положении текста.
  top = Math.max(6, Math.min(top, rootRect.height - ph - 6));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
// Wire up the per-page "note" buttons that sit on image/scan pages. Shared by
// both readers. Click → a note for that page, linked back to the book, with the
// page's text as the quote when the PDF has a text layer (on a true scan there
// is none, so the note opens ready for the reader's own words).
function bindPdfNoteButtons(view) {
  const flow = view.pager && view.pager.flow;
  if (!flow) return;
  flow.querySelectorAll("button.er-pdf-note-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    // The reader turns pages on click in "click" nav mode — this button must not
    // count as a page turn, nor start a text selection.
    btn.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pageNo = parseInt(btn.dataset.pdfNotePage, 10);
      await createNoteFromPdfPage(view, pageNo, btn);
    });
  });
}
// Build the note for a single PDF page.
async function createNoteFromPdfPage(view, pageNo, btn) {
  const app = view.app, plugin = view.plugin, file = view.file;
  if (!file) return;
  try {
    // Any text the page does have (the figure sits above it in the same page div).
    let pageText = "";
    const holder = btn && btn.closest ? btn.closest("[data-pdf-page-no]") : null;
    if (holder) {
      pageText = [...holder.querySelectorAll("p")]
        .map((p) => (p.textContent || "").trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4000);
    }
    const linkName = bookNoteLinkFor(plugin, file) || file.basename;
    const title = sanitizeNoteTitle(__ertr("{0} — стр. {1}", file.basename, pageNo));
    // Same folder rules as a note made from a highlight, so scan pages don't
    // land somewhere else than the rest of a book's notes.
    let folderOverride = null;
    if (plugin.settings.notesNextToBook && file.parent) {
      const beside = erPath(file.parent.path || "");
      if (beside) folderOverride = beside;
    }
    let filename = title, n = 2;
    while (app.vault.getAbstractFileByPath(inboxNotePath(app, filename, folderOverride))) filename = `${title} ${n++}`;
    const quote = pageText
      ? pageText.split("\n\n").map((p) => `> ${p}`).join("\n>\n")
      : __ertr("> *(страница-скан — текста для цитаты нет, впишите своими словами)*");
    // A scanned page has no paragraph to anchor to, so the backlink points at
    // the page — still one click from the note back to where it came from.
    const back = plugin.settings.quoteBacklinks !== false
      ? ` [${backlinkLabel(plugin)}](obsidian://elton-reader?book=${encodeURIComponent(file.path)}&page=${pageNo})`
      : "";
    const body = `${quote}\n\n${__ertr("— из [[{0}]], стр. {1}", linkName, pageNo)}${back}\n`;
    await resolveNotesFolder(app, folderOverride);
    const path5 = inboxNotePath(app, filename, folderOverride);
    const note = await app.vault.create(path5, body);
    if (note instanceof TFile) {
      await appendLinkToBookNote(app, plugin, file, note);
      new Notice(__ertr("Заметка создана: {0}", note.basename));
      await openNoteBesideBook(app, plugin, note);
    }
  } catch (e) {
    console.error("Elton Reader: note from PDF page failed", e);
    new Notice(__ertr("Не удалось создать заметку"));
  }
}
// Follow a footnote reference, and leave a way back.
//
// A note you can reach but not return from is worse than no link at all: the
// reader ends up in the endnotes with no idea which page they left. So the
// origin spread is remembered and offered as a pill until it is used.
function followFootnote(view, ref) {
  const flow = view.pager && view.pager.flow;
  if (!flow || !ref) return false;
  // An EPUB link may name an id that the walker could not keep (it sat on an
  // element that produced no text); the chapter it lives in is still a far
  // better landing than nothing.
  const target = flow.querySelector(`[data-er-id="${CSS.escape(ref)}"]`)
    || (ref.includes("#") ? flow.querySelector(`[data-er-id="${CSS.escape(ref.split("#")[0])}"]`) : null);
  if (!target) return false;
  const from = view.pager.currentSpread;
  // Прыжок считается по номеру абзаца, а не по координате на экране.
  //
  // Раньше место сноски мерилось сдвигом слева — это верно, только пока текст
  // разложен колонками. В режиме «прокруткой» ничего не сдвинуто по горизонтали,
  // сдвиг у любой сноски выходил нулевым, и переход по ссылке уносил в самое
  // начало книги. Номер абзаца одинаково работает в обоих режимах.
  const blocks = Array.from(flow.querySelectorAll("p,h1,h2,h3,h4"));
  let owner = (target.closest && target.closest("p,h1,h2,h3,h4"))
    || (target.querySelector && target.querySelector("p,h1,h2,h3,h4"))
    || target;
  // A marker standing between paragraphs: land on the first paragraph after it.
  if (blocks.indexOf(owner) < 0 && owner.compareDocumentPosition) {
    owner = blocks.find((b) => owner.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) || owner;
  }
  const idx = blocks.indexOf(owner);
  // Абзац не нашёлся — лучше не делать ничего, чем увозить читателя на первую
  // страницу: клик просто останется без последствий.
  if (idx < 0) return false;
  const spread = view.pager.spreadForBlock(idx);
  const [cur, tot] = view.pager.jumpTo(spread);
  (view.updateUI || view._updateUI).call(view, cur, tot);
  showFootnoteReturn(view, from);
  return true;
}
function showFootnoteReturn(view, spread) {
  hideFootnoteReturn(view);
  const host = view.areaEl;
  if (!host) return;
  const pill = host.createDiv("er-note-back");
  iconLabel(pill, "arrow-left", __ertr("Вернуться к тексту"));
  pill.setAttribute("role", "button");
  pill.setAttribute("tabindex", "0");
  const go = () => {
    const [cur, tot] = view.pager.jumpTo(spread);
    (view.updateUI || view._updateUI).call(view, cur, tot);
    hideFootnoteReturn(view);
  };
  pill.addEventListener("click", go);
  pill.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });
  view._noteBackEl = pill;
}
function hideFootnoteReturn(view) {
  if (view._noteBackEl) { view._noteBackEl.remove(); view._noteBackEl = null; }
}
function addAiBtn(view, pop) {
  if (!view.plugin.settings.aiEnabled) return;
  const btn = pop.createDiv("er-hl-sw er-hl-ai");
  svgIcon(btn, "sparkles");
  btn.setAttribute("aria-label", __ertr("Разобрать фрагмент"));
  btn.addEventListener("click", () => {
    const cur = view._currentHl();
    view._hideHlPopup();
    selOf(view.areaEl)?.removeAllRanges();
    if (!cur) return;
    new AiExplainModal(view.app, view.plugin, cur.text, view.file).open();
  });
}
// The two views spell the same two methods differently (buildHlPanel /
// togglePanel in the leaf, _buildHlPanel / _togglePanel in the phone modal).
// Shared popup code must not have to know which one it is holding: calling the
// name the other view uses threw, and a comment written on the phone was saved
// and then vanished without a word.
// Куда ставить панель у выделения.
//
// getBoundingClientRect() у выделения врёт в двух местах, и обоих людей это
// поймало. Первое — начало абзаца: браузер добавляет к выделению пустой
// прямоугольник в конце предыдущей строки, и рамка выделения оказывается шире
// самого текста. Второе — граница страницы: текст разложен по колонкам, и
// выделение, задевшее соседнюю колонку, даёт рамку во всю ширину разворота —
// панель уезжает на пустое место или за экран. Поэтому берутся отдельные
// прямоугольники строк, пустые выбрасываются, оставшиеся ограничиваются
// видимой страницей — и рамка собирается уже из них.
function erSelectionRect(range, areaEl) {
  let rects = [];
  try {
    rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
  } catch { /* optional step; a failure here must not interrupt reading */ }
  if (!rects.length) return range.getBoundingClientRect();
  const box = areaEl ? areaEl.getBoundingClientRect() : null;
  if (box) {
    const seen = rects.filter((r) => r.right > box.left + 1 && r.left < box.right - 1);
    if (seen.length) rects = seen;
  }
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top };
}
// The text actually on screen: [first visible character, last visible
// character] of the current page, as a Range. Paged mode only — scrolling has
// no page edge to hold a selection to.
//
// Why it exists: a page is a slice of one very wide multi-column flow shifted
// sideways. Drag a selection handle (or the mouse) into the margin at the foot
// of the page and the browser resolves that point to "after the last line",
// which in this layout is the END OF THE BOOK. Reproduced on Android 14
// (WebView 113): one drag to the bottom of the page selected 382 265
// characters across 1 506 paragraphs, and colouring it painted every page to
// the end — the "selects the whole book" reports from POCO M5, Samsung and a
// tablet in two-page view.
function erVisibleTextRange(view) {
  const pager = view.pager, flow = pager && pager.flow;
  if (!flow || pager.scrollMode || !pager.total) return null;
  const doc = docOf(flow);
  const area = (pager.clip || view.areaEl).getBoundingClientRect();
  const blocks = pager._blocks();
  if (!blocks.length) return null;
  const from = blocks[Math.max(0, pager.currentBlockIndex() - 1)] || flow;
  const r = doc.createRange();
  const charLeft = (node, k) => {
    // Left edge of character k; a collapsed space can report an empty box at
    // 0,0, so step to a neighbour that has a real one.
    for (let d = 0; d < 4; d++) {
      for (const kk of [k + d, k - d]) {
        if (kk < 0 || kk >= node.length) continue;
        r.setStart(node, kk); r.setEnd(node, kk + 1);
        const b = r.getBoundingClientRect();
        if (b.width > 0 || b.height > 0) return b.left;
      }
    }
    return null;
  };
  const isIn = (x) => x !== null && x >= area.left - 2 && x < area.right - 2;
  const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  walker.currentNode = from;
  let first = null, last = null, n, guard = 0;
  while ((n = walker.nextNode()) && guard++ < 20000) {
    if (!n.length || !n.textContent.trim()) continue;
    r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((b) => b.width > 0);
    if (!rects.length) continue;
    const anyIn = rects.some((b) => b.right > area.left + 2 && b.left < area.right - 2);
    const allRight = rects.every((b) => b.left >= area.right - 2);
    if (allRight) break;
    if (!anyIn) continue;
    if (!first) {
      // Smallest offset whose character is on this page.
      let lo = 0, hi = n.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; const x = charLeft(n, mid); if (x !== null && x < area.left - 2) lo = mid + 1; else hi = mid; }
      first = { node: n, offset: lo };
    }
    // Largest offset whose character is still on this page (end is exclusive).
    if (rects.every((b) => b.left < area.right - 2)) last = { node: n, offset: n.length };
    else {
      let lo = 0, hi = n.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (isIn(charLeft(n, mid))) lo = mid; else hi = mid - 1; }
      last = { node: n, offset: lo + 1 };
      break;
    }
  }
  if (!first || !last) return null;
  const vis = doc.createRange();
  try { vis.setStart(first.node, first.offset); vis.setEnd(last.node, last.offset); } catch { return null; }
  return vis;
}
// Hold the live selection to the page on screen. Returns true if it moved.
// On a phone the native handles jump back to the page edge, which is also the
// cue that a quote has to be finished on this page.
function erClampSelectionToPage(view, sel) {
  if (!sel || !sel.rangeCount) return false;
  const vis = erVisibleTextRange(view);
  if (!vis) return false;
  const range = sel.getRangeAt(0);
  let sN = range.startContainer, sO = range.startOffset, eN = range.endContainer, eO = range.endOffset;
  let moved = false;
  try {
    // A quote carried over from the previous page (erContinueSelection) is
    // allowed to begin off screen; only its end is held to this page.
    if (!view._carry && vis.comparePoint(sN, sO) < 0) { sN = vis.startContainer; sO = vis.startOffset; moved = true; }
    if (vis.comparePoint(eN, eO) > 0) { eN = vis.endContainer; eO = vis.endOffset; moved = true; }
  } catch { return false; }
  if (!moved) return false;
  const backwards = sel.anchorNode === range.endContainer && sel.anchorOffset === range.endOffset
    && !(range.startContainer === range.endContainer && range.startOffset === range.endOffset);
  try {
    if (backwards) sel.setBaseAndExtent(eN, eO, sN, sO);
    else sel.setBaseAndExtent(sN, sO, eN, eO);
  } catch { return false; }
  return true;
}
// Does the selection run up to the end of the page? Then a quote may well go
// on over the page, and the bar offers to carry it.
function erSelectionAtPageEnd(view, range) {
  const vis = erVisibleTextRange(view);
  if (!vis || !range) return false;
  try {
    if (vis.comparePoint(range.endContainer, range.endOffset) < 0) return false;
    const rest = docOf(vis.endContainer).createRange();
    rest.setStart(range.endContainer, range.endOffset);
    rest.setEnd(vis.endContainer, vis.endOffset);
    return rest.toString().trim().length <= 40;
  } catch { return false; }
}
// Carry a selection over the page edge. A page is a window onto one long strip
// of text, so the selection cannot be dragged past what is on screen (and must
// not be: that is how a whole book got selected). Instead the reader taps
// "continue": the page turns, the selection keeps its start on the previous
// page and now runs to the end of the first sentence here — the end handle is
// right there to be moved further.
function erContinueSelection(view) {
  const sel = selOf(view.areaEl);
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const start = { node: r.startContainer, offset: r.startOffset };
  view._carry = start;
  const turn = view.nav ? () => view.nav("next") : () => view._nav("next");
  turn();
  window.setTimeout(() => {
    const vis = erVisibleTextRange(view);
    if (!vis) { view._carry = null; return; }
    // End of the first sentence on the new page, or its first ~120 characters.
    const doc = docOf(vis.startContainer);
    const walker = doc.createTreeWalker(view.pager.flow, NodeFilter.SHOW_TEXT);
    walker.currentNode = vis.startContainer;
    let n = vis.startContainer, off = vis.startOffset, seen = 0, endN = n, endO = off;
    while (n) {
      const t = n.textContent || "";
      for (let i = (n === vis.startContainer ? off : 0); i < t.length; i++) {
        seen++;
        endN = n; endO = i + 1;
        if ((/[.!?…]/.test(t[i]) && seen > 12) || seen >= 120) { n = null; break; }
      }
      if (n) n = walker.nextNode();
      if (n && vis.comparePoint(n, 0) > 0) break;
    }
    try { sel.setBaseAndExtent(start.node, start.offset, endN, endO); } catch { view._carry = null; }
  }, view.pager && view.pager.animate !== false ? 360 : 60);
}
// One selection → its per-paragraph parts. Shared by both readers (they had
// two copies of this loop). A highlight is anchored to a paragraph, so a
// selection over three paragraphs is stored as three parts; they share a
// `group` id so everything downstream — the list, export, comments, colour,
// delete — treats them as ONE quote again, which is what was asked for ("a
// two-line dialogue became two separate quotes").
function erSelectionParts(flow, range) {
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  let block = node ? node.closest("p,h1,h2,h3,h4") : null;
  const blocks = [...flow.querySelectorAll("p,h1,h2,h3,h4")];
  // A selection that starts between paragraphs (the gap, a picture) begins
  // with the first paragraph it touches.
  if (!block || !flow.contains(block)) block = blocks.find((b) => range.intersectsNode(b)) || null;
  if (!block) return [];
  const blockIndex = blocks.indexOf(block);
  if (blockIndex < 0) return [];
  const parts = [];
  for (let bi = blockIndex; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (bi > blockIndex && !range.intersectsNode(b)) break;
    const bText = b.textContent;
    const from = (bi === blockIndex && b.contains(range.startContainer)) ? offsetInBlock(b, range.startContainer, range.startOffset) : 0;
    const ends = b.contains(range.endContainer);
    const to = ends ? offsetInBlock(b, range.endContainer, range.endOffset) : bText.length;
    if (to > from) {
      const seg = bText.slice(from, to);
      if (seg.trim()) {
        parts.push({
          block: bi,
          occ: countOccurrencesBefore(bText, seg, from),
          text: seg,
          pre: bText.slice(Math.max(0, from - 32), from),
          post: bText.slice(to, to + 32),
        });
      }
    }
    if (ends) break;
    // A last line of defence: never more than a page's worth of paragraphs.
    if (parts.length >= 200) break;
  }
  return parts;
}
function erRefreshHlPanel(view) {
  const fn = view.buildHlPanel || view._buildHlPanel;
  if (typeof fn === "function") fn.call(view);
}
function erOpenHlPanel(view) {
  const fn = view.togglePanel || view._togglePanel;
  if (view.panelOpen !== "highlights" && typeof fn === "function") fn.call(view, "highlights");
}
// Everything that does not fit one comfortable row.
//
// Thirteen round buttons wrapped on a phone and left the last one alone on a
// second line. Only the three actions a reader reaches for mid-page stay in the
// bar; the rest move into a menu, where they finally have names instead of being
// nine icons to decode. The menu is Obsidian's own, so it looks and behaves like
// every other menu on the device — a list on the desktop, a sheet on a phone.
// Панель у выделения. На компьютере в ней всё под рукой: цвета и три частых
// действия — там хватает и места, и точности мыши. На телефоне остаётся одна
// кнопка «⋯»: панель висит прямо над текстом, который выделяешь, и каждая
// лишняя иконка закрывает книгу и мешает тянуть выделение вниз.
// A note in the margin of a highlight (or of a plain selection, which becomes
// a highlight first — a comment has to hang on something). Shared by the bar's
// own button and the ⋯ menu.
function erCommentAction(view, cur, editId, pending) {
  if (!view.file) return;
  let id = editId;
  const existing = id ? view.plugin.getHighlightQuotes(view.file.path).find((h) => h.id === id || (h.ids && h.ids.includes(id))) : null;
  new HighlightCommentModal(view.app, (existing && existing.comment) || "", async (text) => {
    if (text === null) return;
    if (!id && pending) {
      const parts = pending.parts || [pending];
      const group = parts.length > 1 ? "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : null;
      const color = view.plugin.settings.defaultHlColor || HL_COLORS[0].id;
      for (const part of parts) {
        const made = view._createHighlight(group ? { ...part, group } : part, color);
        if (!id) id = made;
      }
    }
    if (!id) { new Notice(__ertr("Не удалось сохранить комментарий")); return; }
    await view.plugin.setHighlightComment(view.file.path, id, cur, text);
    view._renderFlowHighlights();
    erRefreshHlPanel(view);
    erOpenHlPanel(view);
  }).open();
}
// Панель у выделения. Цвета — всегда, и на телефоне тоже: выделить цветом —
// главное, что делают с текстом, и прятать это за «⋯» значило делать два
// касания вместо одного. На компьютере рядом ещё частые действия; на телефоне
// копирование и «поделиться» уже даёт системное меню над выделением.
function addBarButtons(view, pop) {
  const mobile = erIsMobile();
  for (const c of HL_COLORS) {
    const sw = pop.createDiv("er-hl-sw");
    sw.style.background = c.css;
    sw.setAttribute("aria-label", c.name);
    sw.addEventListener("click", () => view._applyPopupColor(c.id));
  }
  const act = (cls, icon2, label, fn) => {
    const b = pop.createDiv("er-hl-sw " + cls);
    svgIcon(b, icon2);
    b.setAttribute("aria-label", label);
    b.addEventListener("click", fn);
    return b;
  };
  // Shown only while the selection reaches the end of the page (toggled in
  // _showHlPopup): carry the quote on over the page edge.
  act("er-hl-next", "chevron-right", __ertr("Продолжить выделение на следующей странице"), () => erContinueSelection(view));
  // A comment one tap away, not two menus deep (issue #11). Can be hidden.
  if (view.plugin.settings.hlBarComment !== false) {
    act("er-hl-cmt", "message", __ertr("Комментарий к выделению"), () => {
      const cur = view._currentHl();
      const editId = view._editHlId;
      const pending = view._pendingSel;
      view._hideHlPopup();
      selOf(view.areaEl)?.removeAllRanges();
      if (cur) erCommentAction(view, cur, editId, pending);
    });
  }
  if (mobile) return;
  act("er-hl-copy", "copy", __ertr("Копировать текст"), async () => {
    const cur = view._currentHl();
    view._hideHlPopup();
    selOf(view.areaEl)?.removeAllRanges();
    if (!cur) return;
    const ok = await copyToClipboard(cur.text);
    new Notice(ok ? __ertr("Скопировано ✓") : __ertr("Не удалось скопировать"));
  });
  act("er-hl-note", "note", __ertr("Создать заметку"), () => {
    const cur = view._currentHl();
    view._hideHlPopup();
    selOf(view.areaEl)?.removeAllRanges();
    if (!cur) return;
    createNoteFromSelection(view.app, view.plugin, cur.text, view.file, { extra: hlCommentMd(cur), color: cur.color, hl: cur });
  });
  addAiBtn(view, pop);
}
function addMoreBtn(view, pop) {
  const btn = pop.createDiv("er-hl-sw er-hl-menu");
  svgIcon(btn, "more");
  btn.setAttribute("aria-label", __ertr("Ещё"));
  btn.addEventListener("click", (e) => {
    // Read before hiding: hiding the bar is what forgets which passage this was.
    const cur = view._currentHl();
    const editId = view._editHlId;
    const pending = view._pendingSel;
    // На компьютере панель и выделение остаются, пока открыто меню: раньше они
    // пропадали в момент нажатия, и было непонятно, к чему относится меню.
    // Убираются, когда выбран пункт. На телефоне меню — шторка снизу, и
    // системные ручки выделения поверх неё мешают, там прячем сразу.
    // On a computer the bar and the selection stay while the menu is open.
    const done = () => {
      view._hideHlPopup();
      selOf(view.areaEl)?.removeAllRanges();
    };
    const keep = !erIsMobile(view.app);
    // Пока открыто меню, выделенный текст подсвечен — на телефоне системное
    // выделение снимается (иначе его ручки лезут поверх шторки), и раньше было
    // не видно, к какому месту относится меню. Подсветка без правки разметки.
    // While the menu is open the passage stays painted, on every device.
    let painted = false;
    try {
      const sel = !editId && selOf(view.areaEl);
      if (sel && sel.rangeCount && !sel.isCollapsed && typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function") {
        CSS.highlights.set(ER_MENU_HL, new Highlight(sel.getRangeAt(0).cloneRange()));
        painted = true;
      }
    } catch { /* decoration only */ }
    const unpaint = () => { if (painted) { try { CSS.highlights.delete(ER_MENU_HL); } catch { /* gone */ } painted = false; } };
    if (!keep) done();
    if (!cur) { done(); unpaint(); return; }
    const menu = new Menu();
    menu.onHide(() => window.setTimeout(unpaint, 0));
    if (keep) {
      const add = menu.addItem.bind(menu);
      menu.addItem = (cb) => add((it) => {
        const onClick = it.onClick.bind(it);
        it.onClick = (fn) => onClick((ev) => { done(); return fn(ev); });
        cb(it);
      });
    }
    // Порядок — от самого частого к редкому: панель у выделения теперь несёт
    // только цвета, поэтому здесь лежит вообще всё, что можно сделать с текстом.
    menu.addItem((it) => it.setTitle(__ertr("Копировать текст")).setIcon("copy").onClick(async () => {
      const ok = await copyToClipboard(cur.text);
      new Notice(ok ? __ertr("Скопировано ✓") : __ertr("Не удалось скопировать"));
    }));
    menu.addItem((it) => it.setTitle(__ertr("Создать заметку")).setIcon("file-plus").onClick(() => {
      createNoteFromSelection(view.app, view.plugin, cur.text, view.file, { extra: hlCommentMd(cur), color: cur.color, hl: cur });
    }));
    // Второй адрес для того же текста: не отдельный файл, а общая заметка книги,
    // куда цитаты складываются одна под другой. Пункт появляется, только если
    // заметка книге привязана — иначе дописывать некуда.
    if (bookNoteLinkFor(view.plugin, view.file)) {
      menu.addItem((it) => it.setTitle(__ertr("Текстом в заметку книги")).setIcon("text-quote").onClick(() => {
        sendQuoteToBookNote(view, cur);
      }));
    }
    if (view.plugin.settings.ttsEnabled === true) {
      menu.addItem((it) => it.setTitle(__ertr("Озвучить")).setIcon("volume-2").onClick(() => {
        erTtsStop(view);
        const parts = pending && (pending.parts || [pending]);
        erTtsToggle(view, { parts: parts && parts.length ? parts.map((p) => ({ text: p.text, block: p.block })) : [{ text: cur.text, block: cur.block }] });
      }));
    }
    if (view.plugin.settings.vocabEnabled === true) {
      menu.addItem((it) => it.setTitle(__ertr("В словарь (карточки)")).setIcon("languages").onClick(() => erAddToVocab(view, cur.text, cur.block)));
    }
    if (view.plugin.settings.aiEnabled) {
      menu.addItem((it) => it.setTitle(__ertr("Разобрать фрагмент")).setIcon("sparkles").onClick(() => {
        new AiExplainModal(view.app, view.plugin, cur.text, view.file).open();
      }));
    }
    menu.addSeparator();
    // Цвета тоже здесь: панель у текста должна закрывать как можно меньше книги,
    // поэтому в ней осталась одна кнопка вместо восьми.
    for (const c of HL_COLORS) {
      menu.addItem((it) => it.setTitle(__ertr("Выделить: {0}", (c.name))).setIcon("highlighter").onClick(() => {
        // Панель прячется при открытии меню и забывает выделение — возвращаем
        // то, что было выбрано в момент нажатия, иначе красить нечего.
        view._pendingSel = pending;
        view._editHlId = editId;
        view._applyPopupColor(c.id);
      }));
    }
    menu.addSeparator();
    menu.addItem((it) => it.setTitle(__ertr("Скопировать как цитату")).setIcon("text-quote").onClick(async () => {
      const md = quoteMarkdown(view.plugin, cur, view.file);
      const ok = md && await copyToClipboard(md);
      new Notice(ok ? __ertr("Цитата скопирована ✓ — вставьте в любую заметку") : __ertr("Не удалось скопировать"));
    }));
    menu.addItem((it) => it.setTitle(__ertr("Остановился здесь")).setIcon("bookmark").onClick(() => {
      if (!view.file) return;
      const pct = view.plugin.saveNow(view.file.path, view.pager.spread, view.pager.total, cur.block);
      erSetStopMark(view, erStopMarkSource(view, cur, editId, pending));
      new Notice(__ertr("Закладка «остановился здесь» — {0}%", (pct)));
      if (view.panelOpen === "settings" && typeof view._renderHistory === "function") view._renderHistory();
    }));
    if (view.file && erStopMarkFor(view.plugin, view.file.path)) {
      menu.addItem((it) => it.setTitle(__ertr("Убрать отметку «остановился здесь»")).setIcon("bookmark-minus").onClick(() => erSetStopMark(view, null)));
    }
    // A thought in the margin. Distinct from "create a note": this stays WITH the
    // highlight instead of becoming a separate file.
    menu.addItem((it) => it.setTitle(__ertr("Комментарий к выделению")).setIcon("message-square").onClick(() => {
      erCommentAction(view, cur, editId, pending);
    }));
    if (view.plugin.settings.translateEnabled) {
      menu.addItem((it) => it.setTitle(__ertr("Перевести")).setIcon("languages").onClick(() => {
        new TranslateModal(view.app, view.plugin, cur.text, view.file).open();
      }));
    }
    menu.addItem((it) => it.setTitle(__ertr("Экспортировать в заметку книги")).setIcon("download").onClick(() => {
      if (view.file) sendQuoteToBookNote(view, cur);
    }));
    if (editId && cur.color && view.file) {
      const c = HL_COLORS.find((x) => x.id === cur.color);
      const already = erColorNoteFor(view.plugin, view.file.path, cur.color);
      menu.addItem((it) => it.setTitle(already
        ? __ertr("«{0}» собирается в «{1}» — изменить", c ? c.name : cur.color, already.basename)
        : __ertr("Собирать «{0}» в свою заметку…", c ? c.name : cur.color)).setIcon("folder-input").onClick(() => erPickColorNote(view, cur.color)));
    }
    // Only for a highlight that already exists — there is nothing to delete
    // about a selection the reader has not coloured yet.
    if (editId) {
      menu.addSeparator();
      menu.addItem((it) => it.setTitle(__ertr("Удалить выделение")).setIcon("trash-2").setWarning(true).onClick(() => {
        if (!view.file) return;
        const gids = view.plugin.hlGroupIds(view.file.path, editId);
        view.plugin.removeHighlight(view.file.path, editId);
        view._unwrapHighlight(gids);
        if (view.panelOpen === "highlights") erRefreshHlPanel(view);
      }));
    }
    menu.showAtMouseEvent(e);
  });
}
// The breakdown itself: the passage on top, the answer under it, and the two
// things a reader wants to do with it — copy it, or keep it under the quote.
const AiExplainModal = class extends Modal {
  constructor(app, plugin, text, bookFile) {
    super(app);
    this.plugin = plugin;
    this.text = text;
    this.bookFile = bookFile;
    this.book = bookFile ? String(bookNoteLinkFor(plugin, bookFile) || erBookTitle(bookFile)).replace(/_+/g, " ").replace(/\s+/g, " ").trim() : "";
    // What has been said so far, in the shape the service wants it. Nothing is
    // sent until the reader says something: the passage alone is not a question.
    this.turns = [];
  }
  async onOpen() {
    const c = this.contentEl;
    c.empty();
    this.modalEl.addClass("er-ai-modal");
    // A chat is a column: a head that stays, a log that grows and scrolls, and
    // a composer pinned under it. On a phone the three used to be four stacked
    // rows of buttons with the conversation squeezed into the gap between them.
    const head = c.createDiv("er-ai-head");
    head.createDiv({ cls: "er-ai-title", text: __ertr("Разговор о фрагменте") });
    if (this.book) head.createDiv({ cls: "er-ai-book", text: this.book });
    // The passage is context, not the subject: two lines, and it opens on a tap
    // for the times the reader wants to check the wording.
    const quote = c.createDiv({ cls: "er-ai-quote", text: this.text });
    quote.addEventListener("click", () => quote.classList.toggle("er-ai-quote-open"));
    this.log = c.createDiv("er-ai-log");
    this._buildEmpty();
    const bar = c.createDiv("er-ai-bar");
    const input = bar.createEl("input", { cls: "er-ai-input", type: "text" });
    input.placeholder = __ertr("Сообщение…");
    const send = bar.createEl("button", { cls: "er-ai-send" });
    svgIcon(send, "send");
    send.setAttribute("aria-label", __ertr("Отправить"));
    const fire = async () => {
      const q = input.value.trim();
      if (!q) return;
      // Клавиатура уходит сразу: пока ждёшь ответ, она закрывает всё окно, а на
      // телефоне убрать её можно только сняв фокус — другого способа в вебвью нет.
      input.blur();
      // Поле пустеет в тот же момент, когда сообщение встало в ленту — как в
      // любом мессенджере. Раньше текст висел там до конца ответа и выглядел
      // так, будто ничего не отправилось. Если отправить не удалось, текст
      // возвращается на место, чтобы не набирать заново.
      input.value = "";
      if (!await this._send(q)) input.value = q;
    };
    send.addEventListener("click", fire);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); fire(); }
    });
    erAutoFocus(input);
    erBlurOnTapOutside(c, input);
    this._watchKeyboard();
  }
  // Obsidian на телефоне собран на Capacitor, и у окна есть честные события
  // клавиатуры с её высотой — единственный надёжный сигнал: visualViewport на
  // iOS под клавиатуру не сжимается вообще, а свой контейнер Obsidian ужимает
  // поздно и без события. Пока клавиатура открыта, окно прижимается к верху и
  // укорачивается ровно на её высоту, иначе строка ввода оказывается под ней и
  // не видно, что печатаешь.
  _watchKeyboard() {
    const modal = this.modalEl;
    const height = (e) => {
      const h = e && (e.keyboardHeight != null ? e.keyboardHeight
        : e.detail && e.detail.keyboardHeight);
      return typeof h === "number" && h > 0 ? h : 0;
    };
    this._kbShow = (e) => {
      const h = height(e);
      if (!h) return;
      modal.style.setProperty("--er-kb", h + "px");
      modal.addClass("er-kb-up");
      window.setTimeout(() => this._scroll(), 60);
    };
    this._kbHide = () => {
      modal.removeClass("er-kb-up");
      modal.style.removeProperty("--er-kb");
    };
    window.addEventListener("keyboardWillShow", this._kbShow);
    window.addEventListener("keyboardDidShow", this._kbShow);
    window.addEventListener("keyboardWillHide", this._kbHide);
    // Not every phone sends those events. Obsidian itself always knows the
    // keyboard: on Android it puts its height into --safe-area-inset-bottom.
    // If no event came shortly after the field got focus, use that.
    const input = this.contentEl.querySelector(".er-ai-input");
    if (input) {
      input.addEventListener("focus", () => {
        window.setTimeout(() => {
          if (modal.hasClass("er-kb-up") || docOf(input).activeElement !== input) return;
          const v = parseFloat(getComputedStyle(docOf(modal).body).getPropertyValue("--safe-area-inset-bottom")) || 0;
          if (v > 120) { this._kbByVar = true; this._kbShow({ keyboardHeight: v }); }
        }, 450);
      });
      input.addEventListener("blur", () => { if (this._kbByVar) { this._kbByVar = false; this._kbHide(); } });
    }
  }
  // An empty chat should say what it is for and offer the one thing most
  // readers want first, instead of showing a bare input and a lone chip.
  _buildEmpty() {
    const empty = this.log.createDiv("er-ai-empty");
    svgIcon(empty.createDiv("er-ai-empty-icon"), "sparkles");
    empty.createDiv({ cls: "er-ai-empty-title", text: __ertr("О чём спросить?") });
    empty.createDiv({
      cls: "er-ai-empty-sub",
      text: __ertr("Спросите что угодно об этом фрагменте — или начните с разбора."),
    });
    const chip = empty.createEl("button", { cls: "er-ai-chip", text: __ertr("Разбери фрагмент") });
    chip.addEventListener("click", () => this._send(chip.textContent));
    this.empty = empty;
  }
  _scroll() { this.log.scrollTop = this.log.scrollHeight; }
  // Copy / keep, hung under the answer they belong to. A single pair of buttons
  // at the bottom of the window could only ever act on the last answer, and it
  // cost a whole row of a phone screen to say so.
  _actions(group, answer) {
    const row = group.createDiv("er-ai-acts");
    const act = (icon2, label, fn) => {
      const b = row.createEl("button", { cls: "er-ai-act" });
      svgIcon(b, icon2);
      b.createSpan({ text: label });
      b.addEventListener("click", fn);
      return b;
    };
    act("copy", __ertr("Копировать"), async () => {
      const ok = await copyToClipboard(answer);
      new Notice(ok ? __ertr("Скопировано ✓") : __ertr("Не удалось скопировать"));
    });
    act("note", __ertr("В заметку"), async () => {
      await createNoteFromSelection(this.app, this.plugin, this.text, this.bookFile, {
        extra: "\n\n" + answer,
        // The note is written mid-reading: it gets its own tab, but the book
        // stays in front — the reader goes to the note when they want to.
        openMode: "tab",
        openBackground: true,
      });
      this.close();
    });
  }
  // Sends one message and hangs the answer under it. Returns whether it went
  // through, so the input knows whether to clear itself.
  async _send(text, shown) {
    if (this.busy || !text) return false;
    this.busy = true;
    if (this.empty) { this.empty.remove(); this.empty = null; }
    const me = this.log.createDiv("er-ai-msg er-ai-msg-me");
    me.setText(shown || text);
    this.turns.push({ role: "user", content: text });
    const group = this.log.createDiv("er-ai-group");
    const bubble = group.createDiv("er-ai-msg er-ai-msg-ai");
    // Waiting looks like waiting: three dots that actually move, the same
    // indicator Elton AI uses. A still line of text reads as a frozen window.
    const ind = bubble.createDiv("er-ai-typing");
    const dots = ind.createDiv("er-ai-typing-dots");
    for (let i = 0; i < 3; i++) dots.createDiv("er-ai-typing-dot");
    ind.createDiv({ cls: "er-ai-typing-text", text: __ertr("Думаю…") });
    this._scroll();
    let answer = "";
    try {
      answer = await aiExplain(this.text, this.plugin.settings, this.turns, this.book);
    } catch (e) {
      console.error("Book Reader: AI chat failed", e);
      // The unanswered message leaves the thread: keeping it would send the same
      // question twice as soon as the next one is asked.
      this.turns.pop();
      const why = e && e.erReason;
      bubble.addClass("er-ai-msg-err");
      bubble.setText(
        why === "nokey" ? __ertr("Не задан ключ. Откройте настройки плагина → «Разбор ИИ» и вставьте ключ выбранного сервиса.")
          : why === "auth" ? __ertr("Сервис не принял ключ. Проверьте его в настройках плагина.")
            : why === "limit" ? __ertr("Сервис ограничил частые запросы. Подождите минуту и попробуйте снова.")
              : why === "local" ? __ertr("Локальная модель не отвечает. Проверьте, запущен ли Ollama или LM Studio.")
                : why === "empty" ? __ertr("Пустой ответ от модели.")
                  : why === "http" ? __ertr("Сервис ответил ошибкой {0}.", e.erStatus)
                    : __ertr("Не удалось связаться с сервисом. Проверьте интернет и попробуйте ещё раз."));
      const again = group.createEl("button", { cls: "er-ai-retry", text: __ertr("Повторить") });
      again.addEventListener("click", () => { group.remove(); me.remove(); this._send(text, shown); });
      this._scroll();
      this.busy = false;
      return false;
    }
    this.turns.push({ role: "assistant", content: answer });
    this.answer = answer;
    bubble.empty();
    // Rendered as Markdown so the sections and lists read as sections and lists.
    await MarkdownRenderer.render(this.app, answer, bubble, this.bookFile ? this.bookFile.path : "", this);
    this._actions(group, answer);
    this._scroll();
    this.busy = false;
    return true;
  }
  onClose() {
    if (this._kbShow) {
      window.removeEventListener("keyboardWillShow", this._kbShow);
      window.removeEventListener("keyboardDidShow", this._kbShow);
    }
    if (this._kbHide) window.removeEventListener("keyboardWillHide", this._kbHide);
    this.contentEl.empty();
  }
};
function decodeFb2(buf) {
  const bytes = new Uint8Array(buf);
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, 256); i++) head += String.fromCharCode(bytes[i]);
  const m = head.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  const enc = (m ? m[1] : "utf-8").toLowerCase();
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
function fb2Href(el) {
  let href = "";
  try {
    href = el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
  } catch { /* optional step; a failure here must not interrupt reading */ }
  if (!href) {
    for (const a of Array.from(el.attributes || [])) {
      if (a.name === "href" || a.name.endsWith(":href")) {
        href = a.value;
        break;
      }
    }
  }
  return href.replace(/^#/, "");
}
function fb2ImgSrc(el, images) {
  const id = fb2Href(el);
  return id ? images[id] || "" : "";
}
function fb2Img(src) {
  return `<img src="${escHtml(src)}" style="max-width:100%;height:auto;display:block;margin:8px auto">`;
}
function fb2Inline(el) {
  let out = "";
  for (const node of Array.from(el.childNodes || [])) {
    if (node.nodeType === 3) {
      out += escHtml(node.textContent || "");
      continue;
    }
    if (node.nodeType !== 1) continue;
    const t = (node.tagName || "").toLowerCase();
    const inner = fb2Inline(node);
    if (t === "emphasis") out += `<i>${inner}</i>`;
    else if (t === "strong") out += `<b>${inner}</b>`;
    else if (t === "strikethrough") out += `<s>${inner}</s>`;
    else if (t === "sup") out += `<sup>${inner}</sup>`;
    else if (t === "sub") out += `<sub>${inner}</sub>`;
    else if (t === "code") out += `<code>${inner}</code>`;
    else if (t === "a") {
      const ref = fb2Href(node);
      out += ref ? `<a class="er-fb2-ref" data-er-ref="${escHtml(ref)}">${inner}</a>` : inner;
    } else out += inner;
  }
  return out;
}
function fb2IsCodeLine(el) {
  const all = (el.textContent || "").replace(/\s/g, "").length;
  if (!all) return false;
  let inCode = 0;
  for (const c of Array.from(el.children || [])) {
    if ((c.tagName || "").toLowerCase() === "code") inCode += (c.textContent || "").replace(/\s/g, "").length;
  }
  return inCode / all >= 0.9;
}
function fb2MergeCode(out) {
  const html = [];
  let block = null;
  const flush = () => {
    if (!block || !block.length) {
      block = null;
      return;
    }
    const body = block.join("\n");
    if (body.trim()) html.push(`<pre class="er-code"><code>${escHtml(body)}</code></pre>`);
    block = null;
  };
  for (const item of out) {
    if (item && typeof item === "object" && typeof item.codeLine === "string") {
      (block || (block = [])).push(item.codeLine);
      continue;
    }
    flush();
    if (typeof item === "string") html.push(item);
  }
  flush();
  return html;
}
// FB2 footnotes and cross-references may point at any element with an id — a
// nested <section>, a single <p> — not only at the top-level sections that get
// data-er-id in extractFb2. Those links went nowhere.
function fb2IdAttr(el) {
  const id = el && el.getAttribute ? el.getAttribute("id") : "";
  return id ? ` data-er-id="${escHtml(id)}"` : "";
}
function fb2Node(el, images, out) {
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "title") {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) out.push(`<h2>${escHtml(t)}</h2>`);
    return;
  }
  if (tag === "subtitle") {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) out.push(`<h3>${escHtml(t)}</h3>`);
    return;
  }
  if (tag === "p" || tag === "v" || tag === "text-author") {
    if (tag === "p" && fb2IsCodeLine(el)) {
      out.push({ codeLine: (el.textContent || "").replace(/\s+$/, "") });
      return;
    }
    const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
    const toc = tocLineHtml(raw);
    if (toc) {
      out.push(toc);
      return;
    }
    const inner = fb2Inline(el);
    if (inner.trim()) out.push(`<p${fb2IdAttr(el)}>${inner}</p>`);
    return;
  }
  if (tag === "empty-line") return;
  if (tag === "image") {
    const src = fb2ImgSrc(el, images);
    if (src) out.push(fb2Img(src));
    return;
  }
  if (tag === "binary" || tag === "description") return;
  if (fb2IdAttr(el)) out.push(`<span${fb2IdAttr(el)}></span>`);
  for (const child of Array.from(el.children || [])) fb2Node(child, images, out);
}
// FB2 from the wild is often not quite valid XML: an HTML entity (&nbsp;,
// &mdash;), a bare "&", an entity the book never declared (&FBReaderVersion;).
// A strict parser rejects the whole book for one character. Try strict first,
// then with the entities repaired, then the forgiving HTML parser.
const ER_HTML_ENTITIES = { nbsp: String.fromCharCode(160), mdash: "—", ndash: "–", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", copy: "©", reg: "®", deg: "°", middot: "·", times: "×", shy: String.fromCharCode(173), euro: "€", sect: "§", para: "¶", bull: "•" };
function erParseFb2(text) {
  const parse = (t, type) => {
    const d = new DOMParser().parseFromString(t, type);
    return d.getElementsByTagName("parsererror").length ? null : d;
  };
  let doc = parse(text, "application/xml");
  if (doc) return doc;
  const fixed = String(text).replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, name) => {
    if (/^(amp|lt|gt|quot|apos)$/.test(name)) return m;
    return ER_HTML_ENTITIES[name] ? ER_HTML_ENTITIES[name] : "";
  }).replace(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)/g, "&amp;");
  doc = parse(fixed, "application/xml");
  if (doc) return doc;
  doc = new DOMParser().parseFromString(fixed, "text/html");
  if (doc && doc.getElementsByTagName("body").length) return doc;
  throw new Error("FB2 parse error");
}
// A note from the vault, read like a book (issue: «чтобы и Markdown файлы
// читались… поставить закладку и продолжить»). Obsidian's own renderer turns it
// into HTML; pictures from the vault are carried inside the text as data, the
// way book pictures are, so they show on every page and offline. Positions,
// highlights and quotes work as in any book, keyed by the note's path.
// Включается в настройках («Читать заметки в Book Reader»).
function erNoteLinkClick(view, e) {
  if (erBacklinkClick(view, e)) return true;
  const a = e.target instanceof Element ? e.target.closest("a.internal-link, a.external-link, a[href^='http']") : null;
  if (!a || view.ext !== "md") return false;
  e.preventDefault();
  e.stopPropagation();
  const href = a.getAttribute("data-href") || a.getAttribute("href") || "";
  if (a.classList.contains("internal-link")) view.app.workspace.openLinkText(href, view.file ? view.file.path : "", true);
  else if (/^https?:/i.test(href)) window.open(href, "_blank");
  return true;
}
async function extractMarkdown(file, app) {
  let md = await app.vault.cachedRead(file);
  md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const host = createDiv();
  const comp = new Component();
  comp.load();
  try {
    await MarkdownRenderer.render(app, md, host, file.path, comp);
    // Embeds: pictures become images, everything else a plain link to it.
    for (const emb of [...host.querySelectorAll(".internal-embed")]) {
      const link = String(emb.getAttribute("src") || "").split("|")[0].split("#")[0];
      const target = link ? app.metadataCache.getFirstLinkpathDest(link, file.path) : null;
      if (target && /^(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(target.extension)) {
        try {
          const bin = await app.vault.readBinary(target);
          const bytes = new Uint8Array(bin);
          let raw = "";
          for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          const mime = target.extension.toLowerCase() === "svg" ? "image/svg+xml" : "image/" + target.extension.toLowerCase().replace("jpg", "jpeg");
          const img = createEl("img", { attr: { src: "data:" + mime + ";base64," + btoa(raw), alt: target.basename } });
          emb.replaceWith(img);
          continue;
        } catch { /* fall through to a link */ }
      }
      const a = createEl("a", { cls: "internal-link", text: emb.getAttribute("alt") || link || "↪", attr: { "data-href": link, href: link } });
      emb.replaceWith(a);
    }
    // Controls that belong to the editor, not to the text.
    host.querySelectorAll("button, .copy-code-button, .edit-block-button, .collapse-indicator, .frontmatter, .frontmatter-container, .markdown-embed-link").forEach((el) => el.remove());
    host.querySelectorAll("input[type=checkbox]").forEach((el) => el.setAttribute("disabled", ""));
    return host.innerHTML;
  } finally {
    comp.unload();
  }
}
async function extractFb2(file, app) {
  const buf = await app.vault.readBinary(file);
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 80 && bytes[1] === 75) {
    new Notice(__ertr("Этот FB2 упакован в ZIP. Распакуйте архив и положите в хранилище сам файл .fb2."), 8e3);
    throw new Error("FB2 is zipped");
  }
  const doc = erParseFb2(decodeFb2(buf));
  const images = {};
  for (const b of Array.from(doc.getElementsByTagName("binary"))) {
    const id = b.getAttribute("id");
    // The type comes from the file, and it ends up inside an attribute — so it
    // is picked from a fixed list rather than copied (see escHtml).
    const ctRaw = String(b.getAttribute("content-type") || "").trim().toLowerCase();
    const ct = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(ctRaw) ? ctRaw.replace("jpg", "jpeg") : "image/jpeg";
    const data = (b.textContent || "").replace(/[^A-Za-z0-9+/=]/g, "");
    if (id && data) images[id] = `data:${ct};base64,${data}`;
  }
  const parts = [];
  const cp = doc.getElementsByTagName("coverpage")[0];
  const coverImg = cp && cp.getElementsByTagName("image")[0];
  if (coverImg) {
    const src = fb2ImgSrc(coverImg, images);
    if (src) parts.push(`<div class="er-section">${fb2Img(src)}</div>`);
  }
  for (const body of Array.from(doc.getElementsByTagName("body"))) {
    for (const child of Array.from(body.children || [])) {
      let out = [];
      fb2Node(child, images, out);
      const html = fb2MergeCode(out).join("\n");
      const secId = child.getAttribute && child.getAttribute("id");
      const idAttr = secId ? ` data-er-id="${escHtml(secId)}"` : "";
      if (html.trim()) parts.push(`<div class="er-section"${idAttr}>${html}</div>`);
    }
  }
  if (!parts.length) throw new Error("FB2 has no readable text");
  return parts.join("\n");
}
// `early`: { from: saved fraction, onEarly(html) } — big PDFs only (300+ pages):
// once the pages up to a little past the saved place are ready, the book so far
// is handed over to be shown, and the rest keeps loading behind it.
// Большие PDF — начинать читать сразу (NocoDB 66: словарь на 1000+ страниц).
// Show the first part of a big PDF while the rest loads (both readers).
function erPdfEarly(view, file, stale) {
  if (view.plugin.settings.pdfProgressive !== true) return null;
  const sv = view.plugin.getProgress(file.path);
  return {
    from: sv && typeof sv.pct === "number" ? sv.pct : 0,
    onEarly: async (html) => {
      if (stale()) return;
      const p = view.plugin;
      (p._partialPaths || (p._partialPaths = new Set())).add(file.path);
      view._earlyFile = file;
      view.bookHtml = html;
      view.tocItems = buildTocItems(html, null);
      if (typeof view.buildTocPanel === "function") view.buildTocPanel(); else if (typeof view._buildTocPanel === "function") view._buildTocPanel();
      await p.refreshProgress();
      await p.refreshHighlights();
      const s2 = p.getProgress(file.path);
      if (typeof view.paginate === "function") {
        await view.paginate(s2 && typeof s2.pct === "number" ? s2.pct : 0, s2 ? s2.block : null);
      } else {
        await view.pager.build(view.areaEl, html, p.settings, 0);
        const b = s2 && typeof s2.block === "number" && s2.block >= 0 ? s2.block : null;
        const [c, t] = view.pager.jumpTo(b != null ? view.pager.spreadForBlock(b) : 0);
        view._renderFlowHighlights();
        view._updateUI(c, t);
        erRevealWhenSettled(view);
      }
      new Notice(__ertr("Большая книга ещё загружается — оглавление и поиск дополнятся сами"), 6e3);
    }
  };
}
// After the full load: the paragraph to stay on, if the early part was shown.
function erPdfEarlyDone(view, file) {
  if (view._earlyFile !== file) return null;
  view._earlyFile = null;
  if (view.plugin._partialPaths) view.plugin._partialPaths.delete(file.path);
  try { const b = view.pager.currentBlockIndex(); return typeof b === "number" && b >= 0 ? b : null; } catch { return null; }
}
async function extractPdf(file, app, settings = {}, onProgress, early) {
  await setupWorker(app);
  const alsoFigOnText = settings.pdfShowFiguresOnTextPages === true;
  // "As in the original": every page is shown as the page itself — formulas,
  // diagrams, two-column layouts and pictures exactly as printed, which text
  // extraction can never fully keep ("формулы потерялись", "картинка и текст
  // идут криво"). The page's text stays in the book, invisible and taking no
  // room, so the contents, search and the saved place keep working; notes are
  // made from the page with its note button.
  const original = !!(settings.pdfOriginal && settings.pdfOriginal[file.path]);
  // Жирные подзаголовки отдельно (NocoDB 77). Имя шрифта («…-Bold») pdf.js
  // отдаёт только после разбора команд страницы — это заметно дольше, поэтому
  // только по настройке. Меняет число абзацев: места и выделения в уже
  // читанных PDF могут сдвинуться — об этом сказано у переключателя.
  const boldHeads = settings.pdfBoldHeads === true && !original;
  const buf = await app.vault.readBinary(file);
  const doc = await pdfjsLib.getDocument({
      data: buf,
      // Книга — чужой файл. У pdf.js есть известная дыра, где специально
      // собранный шрифт выполняет свой код через eval; отключение eval —
      // штатное лечение от неё (CVE-2024-4367). На вёрстку не влияет.
      isEvalSupported: false,
    }).promise;
  const total = doc.numPages;
  const parts = [];
  const figRects = {};
  const cacheKey = erPdfCacheKey(file, settings, [original ? "o" : "", alsoFigOnText ? "f" : "", boldHeads ? "b" : ""]);
  const cached = cacheKey ? await erPdfCacheGet(cacheKey) : null;
  if (cached && cached.figRects) Object.assign(figRects, cached.figRects);
  if (cached && onProgress) onProgress(total, total);
  let earlyAt = !cached && early && total >= 300 ? Math.min(total, Math.max(30, Math.ceil((Number(early.from) || 0) * total) + 15)) : 0;
  for (let i = 1; i <= (cached ? 0 : total); i++) {
    if (onProgress && (i === 1 || i % 4 === 0 || i === total)) onProgress(i, total);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pdfFixShiftedCyrillic(tc.items);
    const textLen = tc.items.reduce((n, it) => n + (typeof it.str === "string" ? it.str.replace(/\s+/g, "").length : 0), 0);
    const view = page.view || [0, 0, 612, 792];
    const pw = Math.max(1, Math.round(Math.abs(view[2] - view[0])));
    const ph = Math.max(1, Math.round(Math.abs(view[3] - view[1])));
    let boldFonts = null;
    if (boldHeads && textLen > 0) {
      try {
        await page.getOperatorList();
        boldFonts = new Set();
        for (const it of tc.items) {
          if (!it || !it.fontName || boldFonts.has(it.fontName)) continue;
          let fo = null;
          try { fo = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; } catch { /* not loaded */ }
          const nm = String((fo && (fo.name || fo.fallbackName)) || "");
          if ((fo && (fo.bold || fo.black)) || /bold|black|heavy|semibold|demi|medi(?!um)|cmbx|[-_]bd\b|bdit/i.test(nm)) boldFonts.add(it.fontName);
        }
      } catch { boldFonts = null; }
    }
    const textHtml = textLen > 0 ? pdfItemsToHtml(tc.items, tc.styles, boldFonts) : "";
    let html = textHtml;
    const brokenText = textLen >= 40 && pdfTextLooksUnreadable(tc.items);
    if (original) {
      html = `<figure class="er-pdf-figure er-pdf-orig"><img class="er-pdf-page-img er-pdf-lazy" data-pdf-page="${i}" width="${pw}" height="${ph}" alt="">${pdfNoteBtn(i)}</figure>`
        + (textHtml && !brokenText ? `<div class="er-pdf-orig-text">${textHtml}</div>` : "");
    } else if (textLen < 40 || brokenText) {
      const fig = await pdfFigureScore(page);
      if (brokenText || fig && (fig.imgFrac >= 0.02 || fig.vectorOps >= 20 || fig.shading > 0)) {
        html = `<figure class="er-pdf-figure"><img class="er-pdf-page-img er-pdf-lazy" data-pdf-page="${i}" width="${pw}" height="${ph}" alt="">${pdfNoteBtn(i)}</figure>` + (brokenText ? "" : textHtml);
      }
    } else if (alsoFigOnText) {
      const fig = await pdfFigureScore(page);
      const picked = fig ? pdfPickFigures(fig.rects, view) : [];
      if (picked.length) {
        figRects[i] = picked;
        const figsHtml = picked.map((r, k) => {
          const rw = Math.max(1, Math.round(r.x1 - r.x0));
          const rh = Math.max(1, Math.round(r.y1 - r.y0));
          return `<figure class="er-pdf-figure"><img class="er-pdf-page-img er-pdf-lazy" data-pdf-page="${i}" data-pdf-rect="${k}" width="${rw}" height="${rh}" alt=""></figure>`;
        }).join("");
        const inside = (it) => {
          const x = it.transform[4], y = it.transform[5];
          return picked.some((r) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1);
        };
        const outside = tc.items.filter((it) => !inside(it));
        const keptEnough = outside.length >= tc.items.length * 0.25;
        const bodyHtml = outside.length < tc.items.length && keptEnough ? pdfItemsToHtml(outside, tc.styles) : textHtml;
        html = figsHtml + bodyHtml;
      } else if (fig && fig.imgFrac >= 0.02) {
        html = `<figure class="er-pdf-figure"><img class="er-pdf-page-img er-pdf-lazy" data-pdf-page="${i}" width="${pw}" height="${ph}" alt="">${pdfNoteBtn(i)}</figure>` + textHtml;
      }
    }
    if (html) parts.push(`<div class="er-pdf-page-break" data-pdf-page-no="${i}">${html}</div>`);
    if (earlyAt && i >= earlyAt && i < total) {
      earlyAt = 0;
      try { await early.onEarly(erMarkPdfFolios(parts.slice()).join("\n")); }
      catch (e) { console.warn("Book Reader: early PDF view failed", e); }
    }
  }
  const outline = cached && Array.isArray(cached.outline) ? cached.outline : [];
  if (!cached) try {
    const walk2 = async (nodes, level) => {
      for (const n of nodes || []) {
        let page = null;
        try {
          const dest = typeof n.dest === "string" ? await doc.getDestination(n.dest) : n.dest;
          if (Array.isArray(dest) && dest[0]) page = await doc.getPageIndex(dest[0]) + 1;
        } catch { /* optional step; a failure here must not interrupt reading */ }
        const label = String(n.title || "").replace(/\s+/g, " ").trim();
        if (label && page) outline.push({ label, page, level });
        if (n.items && n.items.length) await walk2(n.items, level + 1);
      }
    };
    await walk2(await doc.getOutline(), 0);
  } catch (e) {
    console.warn("Book Reader: PDF outline unavailable", e);
  }
  const lazy = {
    _doc: doc,
    _rects: figRects,
    // Painting a page has to be given a deadline. pdf.js will happily spend
    // minutes on one pathological page — measured at over 90 seconds on a page
    // whose neighbours needed five — and while it does, the figure loader is
    // holding its "busy" flag, so every other picture in the book waits behind
    // that one page and the reader looks as though images simply stopped
    // appearing. Racing the deadline is not enough on its own: the abandoned
    // render must be CANCELLED, or it keeps burning the same CPU it was taken
    // off. The task's own rejection is swallowed here, since by then the caller
    // has already been told by the deadline.
    async _paint(task, ms) {
      task.promise.catch(() => {
      });
      let timer = null;
      try {
        await Promise.race([
          task.promise,
          new Promise((_, rej) => {
            timer = window.setTimeout(() => {
              try {
                task.cancel();
              } catch { /* optional step; a failure here must not interrupt reading */ }
              rej(new Error("er-render-budget"));
            }, ms);
          })
        ]);
      } finally {
        window.clearTimeout(timer);
      }
    },
    // rectIdx === null → the whole page (a scan: the page IS the content).
    // Otherwise crop to one picture: the canvas is sized to the FIGURE and the
    // context shifted, so only that region lands on it — the reader sees the
    // illustration itself rather than a screenshot of the page around it.
    async render(pageNum, rectIdx) {
      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const r = rectIdx == null ? null : (this._rects[pageNum] || [])[rectIdx] || null;
      if (!r) {
        const full = Math.max(1, Math.min(2, 1600 / Math.max(base.width, base.height, 1)));
        for (const [scale2, budget] of [[full, 15e3], [full / 2, 8e3]]) {
          const vp2 = page.getViewport({ scale: scale2 });
          const cv2 = document.createElement("canvas");
          cv2.width = Math.ceil(vp2.width);
          cv2.height = Math.ceil(vp2.height);
          const ctx2 = cv2.getContext("2d");
          ctx2.fillStyle = "#ffffff";
          ctx2.fillRect(0, 0, cv2.width, cv2.height);
          try {
            await this._paint(page.render({ canvasContext: ctx2, viewport: vp2 }), budget);
            return cv2.toDataURL("image/jpeg", 0.78);
          } catch (e) {
            if (String(e && e.message) !== "er-render-budget") throw e;
          }
        }
        throw new Error("er-render-too-heavy");
      }
      const rw = Math.max(1, r.x1 - r.x0), rh = Math.max(1, r.y1 - r.y0);
      const scale = Math.max(1, Math.min(3, 1400 / Math.max(rw, rh)));
      const vp = page.getViewport({ scale });
      const [ax, ay] = vp.convertToViewportPoint(r.x0, r.y0);
      const [bx, by] = vp.convertToViewportPoint(r.x1, r.y1);
      const left = Math.min(ax, bx), top = Math.min(ay, by);
      const cw = Math.max(1, Math.round(Math.abs(bx - ax)));
      const ch = Math.max(1, Math.round(Math.abs(by - ay)));
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.translate(-left, -top);
      try {
        await this._paint(page.render({ canvasContext: ctx, viewport: vp }), 15e3);
      } catch (e) {
        throw String(e && e.message) === "er-render-budget" ? new Error("er-render-too-heavy") : e;
      }
      return cv.toDataURL("image/jpeg", 0.85);
    },
    destroy() {
      try {
        doc.destroy();
      } catch { /* optional step; a failure here must not interrupt reading */ }
    }
  };
  const html = cached ? cached.html : erMarkPdfFolios(parts).join("\n");
  if (!cached && cacheKey) erPdfCachePut(cacheKey, { html, outline, figRects });
  return { html, lazy, outline };
}
function searchBookBlocks(blocks, query, limit = 300) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  let out = [];
  for (let i = 0; i < blocks.length && out.length < limit; i++) {
    const text = blocks[i];
    const hay = text.toLowerCase();
    let from = 0;
    while (out.length < limit) {
      const at = hay.indexOf(q, from);
      if (at < 0) break;
      const s = Math.max(0, at - 45), e = Math.min(text.length, at + q.length + 55);
      let pre = text.slice(s, at), post = text.slice(at + q.length, e);
      if (s > 0) pre = pre.replace(/^\S*\s/, "");
      if (e < text.length) post = post.replace(/\s\S*$/, "");
      out.push({
        block: i,
        pre: (s > 0 ? "…" : "") + pre,
        hit: text.slice(at, at + q.length),
        post: post + (e < text.length ? "…" : "")
      });
      from = at + q.length;
    }
  }
  return out;
}
function markFoundIn(view, query) {
  clearFoundIn(view);
  const flow = view.pager && view.pager.flow;
  const q = String(query || "").trim().toLowerCase();
  if (!flow || q.length < 2) return;
  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
  view._foundQuery = q;
  const ranges = [];
  const CAP = 2e3;
  try {
    const walker = docOf(flow).createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && ranges.length < CAP) {
      const text = node.nodeValue || "";
      const hay = text.toLowerCase();
      let from = 0;
      while (ranges.length < CAP) {
        const at = hay.indexOf(q, from);
        if (at < 0) break;
        const r = docOf(flow).createRange();
        r.setStart(node, at);
        r.setEnd(node, at + q.length);
        ranges.push(r);
        from = at + q.length;
      }
    }
    if (ranges.length) CSS.highlights.set("er-found", new Highlight(...ranges));
    window.clearTimeout(view._foundTimer);
    view._foundTimer = window.setTimeout(() => clearFoundIn(view), FOUND_PAINT_MS);
  } catch { /* optional step; a failure here must not interrupt reading */ }
}
function clearFoundIn(view) {
  window.clearTimeout(view._foundTimer);
  view._foundQuery = "";
  try {
    if (typeof CSS !== "undefined" && CSS.highlights) CSS.highlights.delete("er-found");
  } catch { /* optional step; a failure here must not interrupt reading */ }
}
function buildFindPanelFor(view, p, { close, jump }) {
  p.empty();
  p.createDiv("er-pan-title").setText(__ertr("Поиск по книге"));
  const box = p.createDiv("er-toc-find");
  const inp = box.createEl("input", { type: "text" });
  inp.addClass("er-toc-find-input");
  inp.placeholder = __ertr("Что найти в книге…");
  const info = p.createDiv("er-find-info");
  const off = p.createDiv("er-find-off");
  off.setText(__ertr("Снять подсветку"));
  const list = p.createDiv("er-toc-list");
  off.addEventListener("click", () => {
    inp.value = "";
    clearFoundIn(view);
    list.empty();
    info.setText("");
  });
  view._findInput = inp;
  const run = () => {
    const q = inp.value;
    list.empty();
    if (q.trim().length < 2) {
      info.setText(__ertr("Введите хотя бы два символа"));
      clearFoundIn(view);
      return;
    }
    if (!view._findCorpus) view._findCorpus = blockTexts(view.pager && view.pager.flow);
    const hits = searchBookBlocks(view._findCorpus, q);
    if (!hits.length) {
      info.setText(__ertr("Ничего не найдено"));
      clearFoundIn(view);
      return;
    }
    info.setText(__ertr("Найдено: {0}. Слово подсвечено в тексте.", hits.length));
    markFoundIn(view, q);
    for (const h of hits) {
      const el = list.createDiv("er-toc-item er-find-item");
      const line = el.createDiv("er-find-text");
      line.createSpan({ text: h.pre });
      line.createSpan({ cls: "er-find-hit", text: h.hit });
      line.createSpan({ text: h.post });
      const spread = view.pager && view.pager.spreadForBlock ? view.pager.spreadForBlock(h.block) : null;
      if (typeof spread === "number") el.createDiv("er-toc-where").setText(__ertr("разв. {0}", spread + 1));
      el.addEventListener("click", () => {
        close();
        jump(h.block);
        markFoundIn(view, q);
      });
    }
  };
  let timer = null;
  inp.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 180);
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      window.clearTimeout(timer);
      run();
    }
  });
}
function buildTocPanelFor(view, p, { close, jump }) {
  p.empty();
  p.createDiv("er-pan-title").setText(__ertr("Содержание"));
  const items = view.tocItems || [];
  if (!items.length) {
    p.createDiv("er-toc-empty").setText(__ertr("В этой книге не нашлось ни оглавления, ни заголовков."));
    return null;
  }
  let filter = "";
  if (items.length > 12) {
    const box = p.createDiv("er-toc-find");
    const inp = box.createEl("input", { type: "text" });
    inp.addClass("er-toc-find-input");
    inp.placeholder = __ertr("Фильтр по названию…");
    inp.addEventListener("input", () => {
      filter = inp.value.trim().toLowerCase();
      render();
    });
  }
  const list = p.createDiv("er-toc-list");
  const render = () => {
    list.empty();
    const cur = view.pager ? view.pager.spread : 0;
    // The chapter being read: the last entry that starts at or before the
    // paragraph on screen, not only an entry that starts on this very page.
    let curBlock = -1;
    try { curBlock = view.pager ? view.pager.currentBlockIndex() : -1; } catch { /* none */ }
    let here = null;
    for (const it of items) if (typeof it.block === "number" && it.block <= curBlock) here = it;
    // A chapter that begins on the page on screen is the one being read, even
    // when the page opens with the last lines of the one before (chapters do
    // not start a new page by default): picking it in the list and coming back
    // must not show the previous chapter as current.
    if (view.pager && view.pager.spreadForBlock && !view.pager.scrollMode) {
      for (const it of items) {
        if (typeof it.block === "number" && it.block > curBlock && view.pager.spreadForBlock(it.block) === cur) here = it;
      }
    }
    let hereEl = null;
    let shown = 0;
    for (const item of items) {
      if (filter && !item.label.toLowerCase().includes(filter)) continue;
      shown++;
      const el = list.createDiv("er-toc-item");
      const row = el.createDiv("er-toc-row");
      row.createSpan({ cls: "er-toc-label", text: item.label });
      const spread = view.pager && view.pager.spreadForBlock ? view.pager.spreadForBlock(item.block) : null;
      const bits = [];
      if (item.page) bits.push(__ertr("стр. {0}", item.page));
      if (typeof spread === "number") bits.push(__ertr("разв. {0}", spread + 1));
      if (bits.length) row.createSpan({ cls: "er-toc-where", text: bits.join(" \xB7 ") });
      if (item.level) el.style.paddingLeft = `${8 + item.level * 12}px`;
      if (item === here || (!here && typeof spread === "number" && spread === cur)) { el.addClass("active"); hereEl = el; }
      el.addEventListener("click", () => {
        close();
        jump(item.block);
      });
    }
    if (!shown) list.createDiv("er-toc-empty").setText(__ertr("Ничего не найдено"));
    // Centre the current chapter by scrolling the list itself. scrollIntoView
    // would also scroll every box around it — the reader included, which made
    // the book jerk while the panel slid in.
    if (hereEl && !filter) window.requestAnimationFrame(() => {
      try {
        let box = hereEl.parentElement;
        while (box && box.scrollHeight <= box.clientHeight + 1) box = box.parentElement;
        if (!box || !box.classList.contains("er-panel") && !box.closest(".er-panel")) return;
        const off = hereEl.getBoundingClientRect().top - box.getBoundingClientRect().top;
        box.scrollTop += off - (box.clientHeight - hereEl.offsetHeight) / 2;
      } catch { /* not shown yet */ }
    });
  };
  render();
  return render;
}
function chapterForBlock(toc, block) {
  if (!toc || !toc.length || typeof block !== "number") return "";
  let best = "";
  for (const it of toc) {
    if (it.block <= block) best = it.label;
    else break;
  }
  return best;
}
function pageForBlock(flow, block) {
  try {
    const blocks = flow ? flow.querySelectorAll("p,h1,h2,h3,h4") : null;
    const el = blocks && blocks[block];
    const holder = el && el.closest ? el.closest("[data-pdf-page-no]") : null;
    const p = holder ? parseInt(holder.getAttribute("data-pdf-page-no"), 10) : NaN;
    return isNaN(p) ? null : p;
  } catch {
    return null;
  }
}
function enrichHighlights(view, list) {
  const flow = view && view.pager ? view.pager.flow : null;
  const toc = view && view.tocItems || [];
  return (list || []).map((hl) => {
    if (typeof hl.block !== "number") return hl;
    return {
      ...hl,
      chapter: hl.chapter || chapterForBlock(toc, hl.block),
      page: hl.page || pageForBlock(flow, hl.block)
    };
  });
}
function currentBookPage(view) {
  try {
    const flow = view && view.pager ? view.pager.flow : null;
    if (!flow) return null;
    const block = view.pager.currentBlockIndex();
    if (typeof block !== "number" || block < 0) return null;
    return pageForBlock(flow, block);
  } catch {
    return null;
  }
}
function sendQuoteToBookNote(view, hl) {
  if (!hl || !hl.text) return;
  const [full] = enrichHighlights(view, [hl]);
  exportHighlightsToBookNote(view.app, view.plugin, view.file, [full]);
}
function pdfTextLooksUnreadable(items) {
  const text = (items || []).map((it) => typeof it.str === "string" ? it.str : "").join(" ");
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 30) return false;
  const singles = tokens.filter((t) => t.length === 1).length;
  if (singles / tokens.length > 0.7) return true;
  // Второй признак: текст набран знаками, которых в книгах не бывает.
  //
  // Так выглядит книга, у которой шрифт не приносит таблицу соответствия:
  // нарисована она правильно, а извлечённый текст — «ɂɫɩɨɥɶɡɨɜɚɧɢɟ» вместо
  // «Использование». Прошлая проверка ловила только рассыпанные по одной букве
  // страницы и такое пропускала — человек видел кашу вместо текста.
  //
  // Считаются не «незнакомые алфавиты» (так под нож попали бы арабский,
  // иврит и иероглифы — на них читают), а ровно те блоки, куда сваливаются
  // буквы сломанного шрифта: латинские расширения с фонетикой, зона для
  // частного использования и служебные коды.
  const letters = text.replace(/\s/g, "");
  if (letters.length < 60) return false;
  let junk = 0;
  for (const ch of letters) {
    const c = ch.codePointAt(0);
    if ((c >= 384 && c <= 767) || (c >= 57344 && c <= 63743) || (c < 32 && c !== 9 && c !== 10 && c !== 13)) junk++;
  }
  return junk / letters.length > 0.35;
}
// Кириллица, уехавшая в блок латинских расширений.
//
// Частый случай в PDF из старых конвертеров: буквы лежат ровно на 0x1D6 ниже
// своего места, и «Маркетинг» приезжает как «Ɇɚɪɤɟɬɢɧɝ». Рисуется страница
// правильно, поэтому в самом Obsidian такой файл читается, а извлечённый текст
// оказывается кашей. Сдвиг обратим, и это лучше, чем показывать страницу
// картинкой: текст снова можно выделять, искать и цитировать.
const PDF_CYR_SHIFT = 470;
function unshiftCyrillic(s) {
  let out = "";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    // Пробел в таких книгах тоже приезжает не собой, а служебным кодом — между
    // словами получался чёрный прямоугольник. Служебные символы в книге не
    // значат ничего, поэтому все они становятся пробелом.
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) out += " ";
    else out += c >= 384 && c <= 687 ? String.fromCodePoint(c + PDF_CYR_SHIFT) : ch;
  }
  return out;
}
// Чинится страница только тогда, когда после сдвига получается именно кириллица,
// а не другая каша: иначе текст остаётся как был и страница уходит картинкой.
function pdfItemsLookShifted(items) {
  const text = (items || []).map((it) => typeof it.str === "string" ? it.str : "").join(" ");
  const letters = text.replace(/\s/g, "");
  if (letters.length < 40) return false;
  const odd = letters.match(/[ƀ-ʯ]/g);
  if (!odd || odd.length / letters.length < 0.3) return false;
  const fixed = odd.filter((ch) => /[А-яЁё]/.test(unshiftCyrillic(ch)));
  return fixed.length / odd.length > 0.9;
}
function pdfFixShiftedCyrillic(items) {
  if (!pdfItemsLookShifted(items)) return false;
  for (const it of items) {
    if (typeof it.str === "string") it.str = unshiftCyrillic(it.str);
  }
  return true;
}
function blockTexts(flow) {
  if (!flow) return [];
  return [...flow.querySelectorAll("p,h1,h2,h3,h4")].map((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
}
function tocLooksLikeNoise(items, all) {
  if (!items || items.length < 30) return false;
  const pages = /* @__PURE__ */ new Set();
  for (const el of all) {
    const h = el.closest ? el.closest("[data-pdf-page-no]") : null;
    if (h) pages.add(h.getAttribute("data-pdf-page-no"));
  }
  const limit = pages.size ? Math.max(30, pages.size * 0.6) : Math.max(30, all.length / 12);
  return items.length > limit;
}
function buildTocItems(html, outline) {
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    const all = [...doc.body.querySelectorAll("p,h1,h2,h3,h4")];
    const pageOfBlock = (i) => {
      const el = all[i];
      const holder = el && el.closest ? el.closest("[data-pdf-page-no]") : null;
      const p = holder ? parseInt(holder.getAttribute("data-pdf-page-no"), 10) : NaN;
      return isNaN(p) ? null : p;
    };
    const withPages = (items2) => items2.map((it) => ({ ...it, page: pageOfBlock(it.block) }));
    // EPUB navigation: entries point at anchors (see extractEpub).
    if (outline && outline.length && outline[0].anchor !== void 0) {
      const index = new Map(all.map((el, i) => [el, i]));
      const blockOf = (el) => {
        if (!el) return -1;
        if (index.has(el)) return index.get(el);
        const up = el.closest && el.closest("p,h1,h2,h3,h4");
        if (up && index.has(up)) return index.get(up);
        const inner = el.querySelector && el.querySelector("p,h1,h2,h3,h4");
        if (inner && index.has(inner)) return index.get(inner);
        return all.findIndex((b) => el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      };
      const items2 = [];
      const sel = (k) => doc.body.querySelector(`[data-er-id="${CSS.escape(k)}"]`);
      for (const o of outline) {
        const el = sel(o.anchor) || (o.anchor.includes("#") ? sel(o.anchor.split("#")[0]) : null);
        const block = blockOf(el);
        if (block >= 0) items2.push({ label: o.label.slice(0, 80), block, level: o.level || 0 });
      }
      // The book's own list wins only when it is at least as full as the
      // headings: some navigation files list five entries for a book whose
      // chapters are all proper headings (Wikisource exports).
      const heads = [];
      all.forEach((el, i) => {
        if (/^H[1-3]$/.test(el.tagName)) {
          const label = (el.textContent || "").trim().slice(0, 60);
          if (label) heads.push({ label, block: i, level: 0 });
        }
      });
      const headsOk = heads.length && !tocLooksLikeNoise(heads, all);
      if (items2.length >= 2 && (!headsOk || items2.length >= heads.length)) return withPages(items2);
    } else if (outline && outline.length) {
      const firstBlockOf = /* @__PURE__ */ new Map();
      all.forEach((el, i) => {
        const holder = el.closest ? el.closest("[data-pdf-page-no]") : null;
        const p = holder ? parseInt(holder.getAttribute("data-pdf-page-no"), 10) : NaN;
        if (!isNaN(p) && !firstBlockOf.has(p)) firstBlockOf.set(p, i);
      });
      const pages = [...firstBlockOf.keys()].sort((a, b) => a - b);
      const items2 = [];
      for (const o of outline) {
        let block = firstBlockOf.get(o.page);
        if (block === void 0) {
          const nxt = pages.find((p) => p >= o.page);
          if (nxt === void 0) continue;
          block = firstBlockOf.get(nxt);
        }
        items2.push({ label: String(o.label).slice(0, 60), block, level: o.level || 0 });
      }
      if (items2.length) return withPages(items2);
    }
    const items = [];
    all.forEach((el, i) => {
      if (/^H[1-3]$/.test(el.tagName)) {
        const label = (el.textContent || "").trim().slice(0, 60);
        if (label) items.push({ label, block: i, level: 0 });
      }
    });
    if (items.length && !tocLooksLikeNoise(items, all)) return withPages(items);
    const printed = tocFromPrintedContents(all);
    if (printed.length && !tocLooksLikeNoise(printed, all)) return withPages(printed);
    const bold = tocFromBoldParagraphs(all);
    if (bold.length && !tocLooksLikeNoise(bold, all)) return withPages(bold);
    const words = tocFromChapterWords(all);
    return words.length >= 2 && !tocLooksLikeNoise(words, all) ? withPages(words) : [];
  } catch {
    return [];
  }
}
// Last resort: chapters written as ordinary short paragraphs that start with
// the word for "chapter" — "Глава 3", "CHAPTER XII", "Kapitel 2", "第三回".
// Common in self-published books and plain-text conversions, whose contents
// list came out empty.
const ER_CHAPTER_RE = /^\s*(?:(?:глава|часть|книга|раздел|розділ|chapter|part|book|kapitel|teil|chapitre|partie|capítulo|capitulo|parte|libro)\s+(?:\d+|[ivxlcdm]+|перв\S*|втор\S*|трет\S*|четв\S*|пят\S*|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|premier|erste\S*)(?![a-zа-яё])|(?:פרק|الفصل|الباب)\s|第\s*[0-9一二三四五六七八九十百千零〇两]+\s*[回章节節卷部篇])/i;
function tocFromChapterWords(all) {
  const out = [];
  all.forEach((el, i) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 80) return;
    if (ER_CHAPTER_RE.test(t)) out.push({ label: t.slice(0, 60), block: i, level: 0 });
  });
  return out;
}
function tocNorm(s) {
  return String(s || "").toLowerCase().replace(/[«»"'`.,:;!?()[\]—–-]/g, " ").replace(/\s+/g, " ").trim();
}
function tocFromPrintedContents(all) {
  const lines = [];
  all.forEach((el, i) => {
    if (el.classList && el.classList.contains("er-toc-line")) {
      const t = el.querySelector ? el.querySelector(".er-toc-t") : null;
      const label = ((t ? t.textContent : el.textContent) || "").trim();
      if (label) lines.push({ label, at: i });
    }
  });
  if (!lines.length) return [];
  const lastContents = lines[lines.length - 1].at;
  const body = [];
  all.forEach((el, i) => {
    if (i <= lastContents) return;
    if (el.classList && el.classList.contains("er-toc-line")) return;
    const txt = tocNorm(el.textContent);
    if (txt) body.push({ i, txt });
  });
  const items = [];
  let from = 0;
  for (const ln of lines) {
    const want = tocNorm(ln.label);
    if (!want) continue;
    let hit = -1;
    for (let k = from; k < body.length; k++) {
      const txt = body[k].txt;
      if (txt === want || txt.startsWith(want + " ") || want.length >= 12 && txt.startsWith(want)) {
        hit = k;
        break;
      }
    }
    if (hit < 0) continue;
    items.push({ label: ln.label.slice(0, 60), block: body[hit].i, level: 0 });
    from = hit + 1;
  }
  return items.length >= 3 ? items : [];
}
function tocFromBoldParagraphs(all) {
  const items = [];
  all.forEach((el, i) => {
    if (el.tagName !== "P") return;
    if (el.classList && el.classList.contains("er-toc-line")) return;
    const text = (el.textContent || "").trim();
    if (!text || text.length > 80 || text.length < 3) return;
    if (/[.!?;:]$/.test(text)) return;
    const kids = [...el.children || []];
    const bold = kids.length === 1 && /^(B|STRONG)$/.test(kids[0].tagName) && (kids[0].textContent || "").trim() === text;
    if (!bold) return;
    if (!/\s/.test(text) && text.length < 12) return;
    if (/^[\dIVXLCМ.,\s—–-]+$/i.test(text)) return;
    items.push({ label: text.slice(0, 60), block: i, level: 0 });
  });
  const seen = /* @__PURE__ */ new Map();
  for (const it of items) seen.set(it.label, (seen.get(it.label) || 0) + 1);
  const unique = items.filter((it) => seen.get(it.label) <= 2);
  const pages = Math.max(1, all.length / 12);
  if (unique.length > pages) return [];
  return unique.length >= 3 ? unique : [];
}
async function renderVisibleFigures(view) {
  const lazy = view._pdfLazy;
  if (!lazy || !view.pager || !view.pager.flow) return;
  bindPdfNoteButtons(view);
  if (view._figBusy) {
    view._figPending = true;
    return;
  }
  view._figBusy = true;
  try {
    const flow = view.pager.flow;
    const sw = view.pager.sw || 1;
    const cur = view.pager.spread;
    const fRect = flow.getBoundingClientRect();
    const scrolling = view.pager.scrollMode;
    const distOf = (img) => {
      const r = img.getBoundingClientRect();
      const at = scrolling ? r.top - fRect.top : r.left - fRect.left;
      return Math.abs(Math.floor(at / sw + 0.01) - cur);
    };
    const imgs = [...flow.querySelectorAll("img.er-pdf-lazy")];
    for (const img of imgs) {
      const dist = distOf(img);
      const loaded = img.dataset.loaded === "1";
      const gaveUp = img.dataset.loaded === "skip";
      if (dist <= 2 && !loaded && !gaveUp) {
        const ri = img.dataset.pdfRect;
        try {
          img.src = await lazy.render(parseInt(img.dataset.pdfPage), ri == null ? null : parseInt(ri));
          img.dataset.loaded = "1";
        } catch (e) {
          if (String(e && e.message) === "er-render-too-heavy") {
            img.dataset.loaded = "skip";
            img.addClass("er-pdf-heavy");
            img.alt = __ertr("Эта страница слишком тяжёлая, чтобы нарисовать её");
          }
        }
      } else if (dist > 6 && loaded) {
        img.removeAttribute("src");
        img.dataset.loaded = "0";
      }
    }
  } finally {
    view._figBusy = false;
    if (view._figPending) {
      view._figPending = false;
      renderVisibleFigures(view);
    }
  }
}
async function pdfFigureScore(page) {
  let ops;
  try {
    ops = await page.getOperatorList();
  } catch {
    return null;
  }
  const fn = ops.fnArray, args = ops.argsArray;
  const view = page.view || [0, 0, 612, 792];
  const pageArea = (Math.abs(view[2] - view[0]) || 1) * (Math.abs(view[3] - view[1]) || 1);
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let imgArea = 0, vectorOps = 0, shading = 0;
  const rects = [];
  const paths = [];
  for (let i = 0; i < fn.length; i++) {
    const f = fn[i];
    if (f === 10) stack.push(m);
    else if (f === 11) {
      if (stack.length) m = stack.pop();
    } else if (f === 12) {
      const t = args[i];
      m = [
        m[0] * t[0] + m[2] * t[1],
        m[1] * t[0] + m[3] * t[1],
        m[0] * t[2] + m[2] * t[3],
        m[1] * t[2] + m[3] * t[3],
        m[0] * t[4] + m[2] * t[5] + m[4],
        m[1] * t[4] + m[3] * t[5] + m[5]
      ];
    } else if (f >= 83 && f <= 90) {
      imgArea += Math.abs(m[0] * m[3] - m[1] * m[2]);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      rects.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    } else if (f === 91) {
      const mm = args[i][2];
      if (mm && mm.length === 4) {
        const cx = [mm[0], mm[1], mm[0], mm[1]], cy = [mm[2], mm[2], mm[3], mm[3]];
        const xs = [], ys = [];
        for (let k = 0; k < 4; k++) {
          xs.push(m[0] * cx[k] + m[2] * cy[k] + m[4]);
          ys.push(m[1] * cx[k] + m[3] * cy[k] + m[5]);
        }
        paths.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
      }
    } else if (f >= 20 && f <= 27) vectorOps++;
    else if (f === 62) shading++;
  }
  const drawn = paths.length > 1 ? mergeRects(paths, 4) : [];
  return { imgFrac: imgArea / pageArea, vectorOps, shading, rects: rects.concat(drawn) };
}
function pdfNoteBtn(pageNo) {
  return `<button class="er-pdf-note-btn" data-pdf-note-page="${pageNo}" type="button" title="${escHtml(__ertr("Заметка с этой страницы"))}">${icon("note")}</button>`;
}
function rectsNear(a, b, pad) {
  return !(a.x1 + pad < b.x0 || b.x1 + pad < a.x0 || a.y1 + pad < b.y0 || b.y1 + pad < a.y0);
}
function mergeRects(rects, pad) {
  let out = [];
  for (const r of rects) {
    let cur = { ...r };
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = out.length - 1; i >= 0; i--) {
        if (rectsNear(cur, out[i], pad)) {
          const o = out.splice(i, 1)[0];
          cur = {
            x0: Math.min(cur.x0, o.x0),
            y0: Math.min(cur.y0, o.y0),
            x1: Math.max(cur.x1, o.x1),
            y1: Math.max(cur.y1, o.y1)
          };
          merged = true;
        }
      }
    }
    out.push(cur);
  }
  return out;
}
function pdfPickFigures(rects, view) {
  const pw = Math.abs(view[2] - view[0]) || 612;
  const ph = Math.abs(view[3] - view[1]) || 792;
  const pageArea = pw * ph;
  const big = (rects || []).filter((r) => {
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    if (w < 48 || h < 48) return false;
    if (w * h < pageArea * 0.015) return false;
    if (w * h > pageArea * 0.92) return false;
    return true;
  });
  return mergeRects(big, 6).filter((r) => r.x1 - r.x0 >= 56 && r.y1 - r.y0 >= 56).sort((a, b) => b.y1 - a.y1);
}
const BLOCK_TAGS = /^(p|div|section|article|main|aside|figure|figcaption|h[1-6]|ul|ol|dl|li|dt|dd|table|pre|blockquote|hr|img)$/i;
function tableToHtml(el) {
  let _a, _b;
  const rows = Array.from((_b = (_a = el.querySelectorAll) == null ? void 0 : _a.call(el, "tr")) != null ? _b : []);
  if (!rows.length) return "";
  const body = rows.map((tr) => {
    const cells = Array.from(tr.children || []).filter((c) => /^(td|th)$/i.test(c.tagName || ""));
    if (!cells.length) return "";
    return "<tr>" + cells.map((c) => {
      const t = (c.tagName || "").toLowerCase() === "th" ? "th" : "td";
      const inner = inlineHtml(c).trim();
      return `<${t}>${inner}</${t}>`;
    }).join("") + "</tr>";
  }).filter(Boolean).join("");
  return body ? `<table class="er-table">${body}</table>` : "";
}
// ` data-er-id="…"` for an element that is a link target (set by extractEpub).
function erAnchorAttr(el) {
  const k = el && el.getAttribute ? el.getAttribute("data-er-anchor") : "";
  return k ? ` data-er-id="${escHtml(k)}"` : "";
}
// A picture from the book. Only data: URIs survive (erSafeImgSrc); one that
// failed to load keeps an empty, invisible placeholder rather than vanishing —
// a paragraph holding nothing but that picture must still be a paragraph, or
// every saved position after it would shift by one.
function erImgHtml(src, style) {
  const safe = erSafeImgSrc(src);
  return safe ? `<img src="${escHtml(safe)}" style="${style}">` : `<img class="er-img-missing" alt="">`;
}
function nodeToHtml(el) {
  let _a2, _b2, _c2;
  let _a, _b, _c, _d;
  if (!el)
    return "";
  const tag = (_b = (_a = el.tagName) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
  const text = (_d = (_c = el.textContent) == null ? void 0 : _c.trim()) != null ? _d : "";
  if (!text && !["br", "hr", "img"].includes(tag) && !((_a2 = el.querySelector) == null ? void 0 : _a2.call(el, "img")))
    return erAnchorAttr(el) ? `<span${erAnchorAttr(el)}></span>` : "";
  // Pictures that used to be drawn through SVG and were dropped (see
  // extractEpub). Shown now, but bare, not wrapped in a paragraph: reading
  // positions and highlights are counted in paragraphs, and a paragraph that
  // did not exist before would move every one of them after it.
  if (!text && tag !== "img" && el.querySelector && el.querySelector("img[data-er-svg]") && !el.querySelector("img:not([data-er-svg])")) {
    return Array.from(el.querySelectorAll("img[data-er-svg]"))
      .map((im) => erImgHtml(im.getAttribute("src"), "max-width:100%;height:auto;display:block;margin:8px auto")).join("\n");
  }
  if (/^h[1-6]$/.test(tag))
    return `<${tag}${erAnchorAttr(el) || erAnchorAttr(el.querySelector && el.querySelector("[data-er-anchor]"))}>${escHtml(text)}</${tag}>`;
  if (tag === "br")
    return "<br>";
  if (tag === "hr")
    return "<hr>";
  if (tag === "img") {
    const src = (_c2 = (_b2 = el.getAttribute) == null ? void 0 : _b2.call(el, "src")) != null ? _c2 : "";
    if (!src) return "";
    return erImgHtml(src, "max-width:100%;height:auto;display:block;margin:8px auto");
  }
  if (tag === "pre") {
    const code = (el.textContent || "").replace(/\s+$/, "");
    return code.trim() ? `<pre class="er-code"><code>${escHtml(code)}</code></pre>` : "";
  }
  if (tag === "table") return tableToHtml(el);
  if (tag === "aside") {
    const inner = Array.from(el.children).map((c) => nodeToHtml(c)).filter(Boolean).join("\n") || (inlineHtml(el).trim() ? `<p>${inlineHtml(el)}</p>` : "");
    return inner ? `<div class="er-side-notes">${inner}</div>` : "";
  }
  if (["div", "section", "article", "body", "main", "aside", "figure"].includes(tag)) {
    const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.test(c.tagName || ""));
    if (!hasBlockChild) {
      const inner = inlineHtml(el);
      return inner.trim() ? `<p${erAnchorAttr(el)}>${inner}</p>` : "";
    }
    const childHtml = Array.from(el.children).map((c) => nodeToHtml(c)).filter(Boolean).join("\n");
    // Bare link-target markers are not content: judge emptiness without them,
    // exactly as before they existed, so the paragraph count stays the same.
    if (!childHtml.replace(/<span data-er-id="[^"]*"><\/span>/g, "").trim()) {
      const direct = directText(el).trim();
      return direct ? `<p${erAnchorAttr(el)}>${childHtml}${escHtml(direct)}</p>` : childHtml;
    }
    return erAnchorAttr(el) ? `<span${erAnchorAttr(el)}></span>${childHtml}` : childHtml;
  }
  if (["p", "li", "dt", "dd", "blockquote"].includes(tag)) {
    const toc = tocLineHtml(text);
    if (toc) return toc;
    const inner = inlineHtml(el);
    return inner.trim() ? `<p${erAnchorAttr(el)}>${inner}</p>` : "";
  }
  if (["ul", "ol", "dl"].includes(tag)) {
    return Array.from(el.children).map((c) => nodeToHtml(c)).filter(Boolean).join("\n");
  }
  return text ? `<p${erAnchorAttr(el)}>${escHtml(text)}</p>` : "";
}
function inlineHtml(el) {
  let _a2;
  let _a, _b, _c;
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escHtml((_a = node.textContent) != null ? _a : "");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const t = (_c = (_b = node.tagName) == null ? void 0 : _b.toLowerCase()) != null ? _c : "";
      const inner = inlineHtml(node);
      // An element in the middle of a paragraph can itself be a link target
      // (<a id="note5"/>, <span id="p12">) — an empty marker keeps its place.
      if (erAnchorAttr(node)) out += `<span${erAnchorAttr(node)}></span>`;
      const link = t === "a" && node.getAttribute ? node.getAttribute("data-er-link") : "";
      if (link)
        // A link to another place in the same book — footnote, cross-reference,
        // contents entry. Same mechanism as FB2 footnotes, with the same way back.
        out += `<a class="er-fb2-ref er-link" data-er-ref="${escHtml(link)}">${inner}</a>`;
      else if (["b", "strong"].includes(t))
        out += `<strong>${inner}</strong>`;
      else if (["i", "em"].includes(t))
        out += `<em>${inner}</em>`;
      else if (["code", "kbd", "samp", "tt", "var"].includes(t))
        out += `<code>${inner}</code>`;
      else if (t === "sup")
        out += `<sup>${inner}</sup>`;
      else if (t === "sub")
        out += `<sub>${inner}</sub>`;
      else if (t === "br")
        out += "<br>";
      else if (t === "img") {
        const src = ((_a2 = node.getAttribute) == null ? void 0 : _a2.call(node, "src")) || "";
        if (src) out += erImgHtml(src, "max-width:100%;height:auto");
      } else
        out += inner;
    }
  }
  return out;
}
function directText(el) {
  return Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => {
    let _a;
    return (_a = n.textContent) != null ? _a : "";
  }).join("");
}
function fixPunct(s) {
  return (s || "").replace(/­/g, "").replace(/[ \t\u00A0]+/g, " ").replace(/\s+([,.;:!?…)\]»%”’])/g, "$1").replace(/([([«“‘])\s+/g, "$1").replace(/([А-Яа-яЁёA-Za-z]) - ([А-Яа-яЁёA-Za-z])/g, "$1—$2").replace(/ +/g, " ").trim();
}
function dehyphenate(prev, next) {
  if (/[а-яёa-z]-$/i.test(prev) && /^[а-яё]/.test(next)) return prev.slice(0, -1) + next;
  return prev + (prev ? " " : "") + next;
}
function isListStart(s) {
  const t = (s || "").replace(/^[\s"«(]+/, "");
  if (/^[✓✔•·◦‣▪▫●○■□◆◉➤●❖*]/.test(t)) return true;
  if (/^\d{1,3}[.)]\s/.test(t)) return true;
  if (/^[а-яёa-z][.)]\s/.test(t)) return true;
  return false;
}
function isMonoRun(it, styles, measured) {
  const st = styles && it.fontName ? styles[it.fontName] : null;
  if (st && /mono/i.test(String(st.fontFamily || ""))) return true;
  if (measured && it.fontName && measured.has(it.fontName)) return true;
  return /courier|consol|menlo|monaco|mono/i.test(String(it.fontName || ""));
}
function pdfMeasureMonoFonts(items) {
  let _a, _b;
  const byFont = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!it || typeof it.str !== "string" || !it.fontName) continue;
    if (it.str.replace(/\s/g, "").length < 4 || !(it.width > 0)) continue;
    const size = Math.abs((_b = (_a = it.transform) == null ? void 0 : _a[3]) != null ? _b : 0) || 12;
    const adv = it.width / it.str.length / size;
    if (!(adv > 0)) continue;
    (byFont.get(it.fontName) || byFont.set(it.fontName, []).get(it.fontName)).push(adv);
  }
  const mono = /* @__PURE__ */ new Set();
  for (const [name, adv] of byFont) {
    if (adv.length < 4) continue;
    const mean = adv.reduce((a, b) => a + b, 0) / adv.length;
    if (!(mean > 0)) continue;
    const sd = Math.sqrt(adv.reduce((a, b) => a + (b - mean) ** 2, 0) / adv.length);
    if (sd / mean < 0.02) mono.add(name);
  }
  return mono;
}
function tocLineHtml(text) {
  const t = splitTocLine(text);
  if (!t) return null;
  return `<p class="er-toc-line"><span class="er-toc-t">${escHtml(t.title)}</span><span class="er-toc-n">${escHtml(t.page)}</span></p>`;
}
function splitTocLine(s) {
  const m = String(s || "").trim().match(/^(.*?)[\s.]*\.{4,}[\s.]*(\d{1,4})\s*$/);
  if (!m) return null;
  const title = m[1].replace(/[\s.]+$/, "").trim();
  return title ? { title, page: m[2] } : null;
}
function pdfAsideBoundary(lines, pageLeft, pageRight) {
  const width = pageRight - pageLeft;
  if (!(width > 0)) return null;
  const minX = pageLeft + width * 0.45;
  const candidates = lines.filter((l) => l.x >= minX && l.monoInk === 0 && l.propInk > 0);
  if (candidates.length < 3) return null;
  const left = Math.min(...candidates.map((l) => l.x));
  if (left < minX) return null;
  return left - 6;
}
function looksLikeCodeLine(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (!/[{}()[\];=]|>>>|^\s*(def |class |import |from |#include|@)/.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean).length;
  if (words >= 9 && /^[A-ZА-ЯЁ][a-zа-яё]{2,}\s/.test(s) && !/[;{}=]|>>>/.test(s)) return false;
  return true;
}
function erPdfLooksLikeHeading(t) {
  if (!t || t.length > 90 || /[.,;:]$/.test(t) && !/^(глава|chapter|часть|part)\s/i.test(t)) return false;
  return /^\d+(\.\d+){1,3}\.?\s+\S/.test(t)
    || /^(глава|часть|раздел|розділ|chapter|part|section|kapitel|chapitre|capítulo)\s+([0-9]+|[IVXLCDM]+)\b/i.test(t);
}
// Running heads and page numbers. In a PDF they are text like any other and
// landed in the middle of the reading text — a lone "47" between paragraphs,
// the book's title repeated at the top of every page. Marked, not removed
// (the paragraph count must not change, see above): the stylesheet shows them
// small and set apart, the way other readers separate a footer.
function erMarkPdfFolios(parts) {
  const edge = /^(<div class="er-pdf-page-break" data-pdf-page-no="\d+">)(<p>([^<]{1,80})<\/p>)?([\s\S]*?)(<p>([^<]{1,80})<\/p>)?(<\/div>)$/;
  const norm = (t) => String(t || "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  const isNum = (t) => /^\s*(?:[-–—]\s*)?(\d{1,4}|[ivxlcdm]{1,7}|(стр|с|page|p|seite|página)\.?\s*\d{1,4}|\d{1,4}\s*(из|of|\/|von|de)\s*\d{1,4})(?:\s*[-–—])?\s*$/i.test(t);
  const counts = new Map();
  const seen = [];
  for (const html of parts) {
    const m = edge.exec(html);
    const ends = m ? [m[3], m[6]].filter(Boolean) : [];
    seen.push(m);
    for (const e of new Set(ends.map(norm))) counts.set(e, (counts.get(e) || 0) + 1);
  }
  const repeated = (t) => t && t.length <= 80 && (counts.get(norm(t)) || 0) >= 3 && parts.length >= 6;
  return parts.map((html, i) => {
    const m = seen[i];
    if (!m) return html;
    const first = m[3] && (isNum(m[3]) || repeated(m[3]));
    const last = m[6] && (isNum(m[6]) || repeated(m[6]));
    if (!first && !last) return html;
    return m[1]
      + (m[2] ? (first ? `<p class="er-pdf-folio">${m[3]}</p>` : m[2]) : "")
      + m[4]
      + (m[5] ? (last ? `<p class="er-pdf-folio">${m[6]}</p>` : m[5]) : "")
      + m[7];
  });
}
function pdfItemsToHtml(items, styles, boldFonts) {
  let _a, _b, _c, _d, _e, _f, _g;
  const runs = items.filter((it) => it && typeof it.str === "string");
  if (!runs.length) return "";
  const monoFonts = pdfMeasureMonoFonts(runs);
  const sorted = runs.slice().sort((a, b) => {
    let _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h;
    const ay = (_b2 = (_a2 = a.transform) == null ? void 0 : _a2[5]) != null ? _b2 : 0, by = (_d2 = (_c2 = b.transform) == null ? void 0 : _c2[5]) != null ? _d2 : 0;
    if (Math.abs(ay - by) > 3) return by - ay;
    return ((_f2 = (_e2 = a.transform) == null ? void 0 : _e2[4]) != null ? _f2 : 0) - ((_h = (_g2 = b.transform) == null ? void 0 : _g2[4]) != null ? _h : 0);
  });
  const lines = [];
  for (const it of sorted) {
    const str = it.str;
    const y = (_b = (_a = it.transform) == null ? void 0 : _a[5]) != null ? _b : 0;
    const x = (_d = (_c = it.transform) == null ? void 0 : _c[4]) != null ? _d : 0;
    const size = Math.abs((_f = (_e = it.transform) == null ? void 0 : _e[3]) != null ? _f : 12) || 12;
    let w = (_g = it.width) != null ? _g : 0;
    if (!w && str) w = str.length * size * 0.5;
    const ink = str.replace(/\s/g, "").length;
    const mono = isMonoRun(it, styles, monoFonts) && !(boldFonts && boldFonts.has(it.fontName));
    const piece = { str, x, w, size, mono, ink, bold: !!(boldFonts && boldFonts.has(it.fontName)) };
    const last = lines[lines.length - 1];
    if (last && Math.abs(y - last.y) <= Math.max(2, size * 0.35)) {
      last.pieces.push(piece);
      last.endX = Math.max(last.endX, x + w);
      last.size = Math.max(last.size, size);
      last.x = Math.min(last.x, x);
      if (mono) last.monoInk += ink;
      else last.propInk += ink;
    } else if (str.trim() !== "") {
      lines.push({ y, x, endX: x + w, size, monoInk: mono ? ink : 0, propInk: mono ? 0 : ink, pieces: [piece] });
    }
  }
  if (!lines.length) return "";
  const stitch = (pieces) => {
    let text = "";
    let endX = null;
    for (const p of pieces) {
      if (endX !== null && !/\s$/.test(text) && !/^\s/.test(p.str)) {
        const gapRight = p.x - endX > p.size * 0.2;
        const wrapped = p.x < endX - p.size;
        if (gapRight || wrapped) text += " ";
      }
      text += p.str;
      endX = p.x + p.w;
    }
    return text;
  };
  const pageLeft = Math.min(...lines.map((l) => l.x));
  const pageRight = Math.max(...lines.map((l) => l.endX));
  const asideAt = pdfAsideBoundary(lines, pageLeft, pageRight);
  const asides = [];
  if (asideAt !== null) {
    for (const l of lines) {
      const hasMono = l.pieces.some((p) => p.mono);
      const allProp = !hasMono;
      const wholeLineAside = allProp && l.x >= asideAt;
      if (!wholeLineAside && !hasMono) continue;
      const keep = [], moved = [];
      for (const p of l.pieces) ((wholeLineAside || p.x >= asideAt) && !p.mono ? moved : keep).push(p);
      if (!moved.length) continue;
      if (!keep.length) {
        l.dropped = true;
        asides.push({ y: l.y, text: stitch(moved) });
        continue;
      }
      l.pieces = keep;
      l.endX = Math.max(...keep.map((p) => p.x + p.w));
      l.monoInk = keep.filter((p) => p.mono).reduce((s, p) => s + p.ink, 0);
      l.propInk = keep.filter((p) => !p.mono).reduce((s, p) => s + p.ink, 0);
      asides.push({ y: l.y, text: stitch(moved) });
    }
  }
  for (const l of lines) l.text = stitch(l.pieces);
  const real = lines.filter((l) => !l.dropped && l.text.trim() !== "");
  if (!real.length && !asides.length) return "";
  const avg = real.length ? real.reduce((s, l) => s + l.size, 0) / real.length : 12;
  const measure = Math.max(...real.map((l) => l.endX - l.x)) || 1;
  const gaps = [];
  for (let i = 1; i < real.length; i++) {
    const g = Math.abs(real[i - 1].y - real[i].y);
    if (g > 0.5 && g < avg * 6) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const bucket = /* @__PURE__ */ new Map();
  for (const g of gaps) {
    const k = Math.round(g * 2) / 2;
    bucket.set(k, (bucket.get(k) || 0) + 1);
  }
  let mode = 0, modeN = 0;
  for (const [k, n] of bucket) if (n > modeN || n === modeN && k > mode) {
    mode = k;
    modeN = n;
  }
  const lineGap = gaps.length ? Math.min(modeN >= 3 ? mode : gaps[Math.floor(gaps.length * 0.3)], avg * 2.2) : avg * 1.4;
  const paraGap = Math.max(lineGap * 1.45, avg * 1.1);
  const leftXs = real.map((l) => l.x).sort((a, b) => a - b);
  const bodyLeft = leftXs.length ? leftXs[Math.floor(leftXs.length * 0.15)] : 0;
  const indentMin = Math.max(avg * 0.8, (pageRight - bodyLeft) * 0.015);
  const indentedLines = real.filter((l) => l.x - bodyLeft > indentMin).length;
  const indentMarksParas = indentedLines / (real.length || 1) <= 0.35;
  const monoInk = real.reduce((s, l) => s + l.monoInk, 0);
  const allInk = real.reduce((s, l) => s + l.monoInk + l.propInk, 0) || 1;
  const codeAllowed = monoInk / allInk < 0.8;
  const isSeed = (l) => {
    if (!codeAllowed || !(l.monoInk > 0) || l.monoInk < l.propInk) return false;
    const ratio = l.monoInk / (l.monoInk + l.propInk || 1);
    return ratio >= 0.8 || looksLikeCodeLine(l.text);
  };
  const codeFlag = new Array(real.length).fill(false);
  for (let i = 0; i < real.length; i++) if (isSeed(real[i])) codeFlag[i] = true;
  for (let i = 0; i < real.length; i++) {
    if (!codeFlag[i]) continue;
    let j = i, inner = [];
    while (j + 1 < real.length && codeFlag[j + 1]) {
      inner.push(real[j].y - real[j + 1].y);
      j++;
    }
    const tight = inner.length ? Math.min(...inner) * 1.3 : lineGap * 0.95;
    const blockLeft = Math.min(...real.slice(i, j + 1).map((l) => l.x));
    for (let k = j + 1; k < real.length; k++) {
      const gap = real[k - 1].y - real[k].y;
      if (!(gap > 0 && gap <= tight)) break;
      if (real[k].x < blockLeft - real[k].size) break;
      if (real[k].size > avg * 1.22) break;
      if (!looksLikeCodeLine(real[k].text)) break;
      if (real[k].endX - real[k].x > measure * 0.92) break;
      codeFlag[k] = true;
    }
    i = j;
  }
  const html = [];
  let para = "";
  let paraLines = 0;
  let lastY = null;
  let code = null;
  const flush = () => {
    if (para.trim()) {
      const txt = fixPunct(para);
      // A numbered section title on a line of its own ("3.1 Encoder and
      // Decoder Stacks", "Глава 2") set in the body size: it used to come out
      // as an ordinary paragraph, so it was neither visible as a heading nor in
      // the contents. Only the tag changes — the paragraph count stays the same,
      // and with it every saved position and highlight.
      if (paraLines === 1 && erPdfLooksLikeHeading(txt)) {
        html.push(`<h3>${escHtml(txt)}</h3>`);
      } else {
        const li = isListStart(para) ? ' class="er-pdf-li"' : "";
        html.push(`<p${li}>${escHtml(txt)}</p>`);
      }
      para = "";
      paraLines = 0;
    }
  };
  const flushCode = () => {
    if (!code || !code.lines.length) {
      code = null;
      return;
    }
    const minX = Math.min(...code.lines.map((l) => l.x));
    const unit = Math.max(1, code.size * 0.5);
    const body = code.lines.map((l) => " ".repeat(Math.min(60, Math.max(0, Math.round((l.x - minX) / unit)))) + l.text.replace(/\s+$/, "")).join("\n");
    if (body.trim()) html.push(`<pre class="er-code"><code>${escHtml(body)}</code></pre>`);
    code = null;
  };
  for (let i = 0; i < real.length; i++) {
    const line = real[i];
    if (codeFlag[i]) {
      flush();
      if (!code) code = { lines: [], size: line.size };
      code.lines.push(line);
      code.size = Math.max(code.size, line.size);
      lastY = line.y;
      continue;
    }
    const t2 = fixPunct(line.text);
    if (!t2) continue;
    flushCode();
    const toc = tocLineHtml(t2);
    if (toc) {
      flush();
      html.push(toc);
      lastY = line.y;
      continue;
    }
    const fillsMeasure = line.endX - line.x > measure * 0.9;
    const isH = line.size > avg * 1.22 && !fillsMeasure && t2.length < 120;
    const gap = lastY !== null ? Math.abs(lastY - line.y) : 0;
    if (isH) {
      flush();
      html.push(`<h3>${escHtml(t2)}</h3>`);
      lastY = line.y;
      continue;
    }
    if (boldFonts && boldFonts.size) {
      const inkOf = (ps) => ps.reduce((n, p) => n + p.ink, 0);
      const boldInk = inkOf(line.pieces.filter((p) => p.bold));
      const allInk = inkOf(line.pieces) || 1;
      if (boldInk / allInk > 0.9 && !fillsMeasure && t2.length <= 90 && !/[,;]$/.test(t2)) {
        flush();
        html.push(`<h4>${escHtml(t2)}</h4>`);
        lastY = line.y;
        continue;
      }
      const startsPara = !para || (lastY !== null && gap > paraGap) || (indentMarksParas && line.x - bodyLeft > indentMin);
      if (startsPara && line.pieces[0] && line.pieces[0].bold) {
        let k = 0;
        while (k < line.pieces.length && (line.pieces[k].bold || !line.pieces[k].str.trim())) k++;
        const lead = fixPunct(stitch(line.pieces.slice(0, k)));
        const rest = fixPunct(stitch(line.pieces.slice(k)));
        if (k > 0 && k < line.pieces.length && lead.length >= 2 && lead.length <= 60 && rest) {
          flush();
          html.push(`<h4>${escHtml(lead)}</h4>`);
          para = rest;
          paraLines = 1;
          lastY = line.y;
          continue;
        }
      }
    }
    if (lastY !== null && gap > paraGap) flush();
    else if (indentMarksParas && para && line.x - bodyLeft > indentMin) flush();
    if (para && isListStart(t2)) flush();
    para = para ? dehyphenate(para, t2) : t2;
    paraLines++;
    lastY = line.y;
  }
  flush();
  flushCode();
  if (asides.length) {
    const merged = [];
    for (const a of asides) {
      const prev = merged[merged.length - 1];
      if (prev && prev.y - a.y > 0 && prev.y - a.y <= avg * 1.8) {
        prev.text += " " + a.text;
        prev.y = a.y;
      } else merged.push({ y: a.y, text: a.text });
    }
    const body = merged.map((a) => fixPunct(a.text)).filter(Boolean);
    if (body.length) {
      html.push(`<div class="er-side-notes">${body.map((t) => `<p>${escHtml(t)}</p>`).join("")}</div>`);
    }
  }
  return html.join("\n");
}
function offsetInBlock(block, container, offset) {
  try {
    const r = docOf(block).createRange();
    r.setStart(block, 0);
    r.setEnd(container, offset);
    return r.toString().length;
  } catch {
    return 0;
  }
}
function nthIndexOf(text, sub, occ) {
  let idx = -1;
  for (let i = 0; i <= occ; i++) {
    idx = text.indexOf(sub, idx + 1);
    if (idx < 0) return -1;
  }
  return idx;
}
function countOccurrencesBefore(text, sub, limit) {
  if (!sub) return 0;
  let n = 0, idx = -1;
  while ((idx = text.indexOf(sub, idx + 1)) >= 0 && idx < limit) n++;
  return n;
}
function _hlNormMap(s) {
  s = s || "";
  let norm = "";
  const map = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "\xA0" || c === " " || /\s/.test(c)) {
      if (prevSpace) continue;
      norm += " ";
      map.push(i);
      prevSpace = true;
      continue;
    }
    prevSpace = false;
    if (c === "‘" || c === "’" || c === "‚" || c === "‛") c = "'";
    else if (c === "“" || c === "”" || c === "„" || c === "‟") c = '"';
    else if (c === "–" || c === "—" || c === "−") c = "-";
    norm += c;
    map.push(i);
  }
  return { norm, map };
}
function locateHl(blockText, hl) {
  if (!hl || !hl.text) return null;
  const occ = typeof hl.occ === "number" ? hl.occ : 0;
  let start = nthIndexOf(blockText, hl.text, occ);
  if (start >= 0) return { start, len: hl.text.length };
  if (hl.pre != null || hl.post != null) {
    let from = 0, idx;
    while ((idx = blockText.indexOf(hl.text, from)) >= 0) {
      const preOk = !hl.pre || blockText.slice(Math.max(0, idx - hl.pre.length), idx).endsWith(hl.pre);
      const endPos = idx + hl.text.length;
      const postOk = !hl.post || blockText.slice(endPos, endPos + hl.post.length).startsWith(hl.post);
      if (preOk && postOk) return { start: idx, len: hl.text.length };
      from = idx + 1;
    }
  }
  const { norm: nBlock, map } = _hlNormMap(blockText);
  const nText = _hlNormMap(hl.text).norm.trim();
  if (nText) {
    let nIdx = -1;
    const nPre = hl.pre ? _hlNormMap(hl.pre).norm.trim() : "";
    if (nPre) {
      const p = nBlock.indexOf(nPre);
      if (p >= 0) nIdx = nBlock.indexOf(nText, Math.max(0, p + nPre.length - 1));
    }
    if (nIdx < 0) nIdx = nBlock.indexOf(nText);
    if (nIdx >= 0 && nIdx < map.length) {
      const lastN = Math.min(nIdx + nText.length - 1, map.length - 1);
      const startRaw = map[nIdx];
      const endRaw = map[lastN] + 1;
      if (endRaw > startRaw) return { start: startRaw, len: endRaw - startRaw };
    }
  }
  return null;
}
// Снять со страницы все нарисованные выделения.
//
// Нужно с тех пор, как перекладка страниц перестала выбрасывать DOM книги: узлы
// переживают смену шрифта, а значит прошлые обёртки остаются на месте, и
// рисовать поверх них второй раз нельзя — получится вложенность и мусор.
// Paint a book's highlights into the laid-out text. Shared by both readers.
//
// Two additions over the old loop:
//  • A highlight is looked for in a few neighbouring paragraphs when it is not
//    where its index says. If the way a book is split into paragraphs ever
//    shifts (a better PDF parser, a fixed EPUB), highlights now land on their
//    text instead of silently disappearing.
//  • A highlight with a comment carries a small mark at its end, so that
//    re-reading the book shows where a thought was left ("I can see the
//    highlight, but not whether there is a note behind it"). Tapping it opens
//    the bar with the comment shown in it.
function erRenderFlowHighlights(view) {
  if (!view.file || !view.pager || !view.pager.flow) return;
  const flow = view.pager.flow;
  unwrapAllHighlights(flow);
  const blocks = flow.querySelectorAll("p,h1,h2,h3,h4");
  const list = view.plugin.getHighlights(view.file.path);
  const commented = new Set();
  for (const q of erMergeHlGroups(list)) if (q.comment) commented.add(q.ids ? q.ids[q.ids.length - 1] : q.id);
  for (const hl of list) {
    let block = blocks[hl.block];
    let loc = block ? locateHl(block.textContent, hl) : null;
    if (!loc && typeof hl.block === "number") {
      for (let d = 1; d <= 15 && !loc; d++) {
        for (const bi of [hl.block - d, hl.block + d]) {
          const b = blocks[bi];
          if (!b) continue;
          const l = locateHl(b.textContent, hl);
          if (l) { block = b; loc = l; break; }
        }
      }
    }
    if (!loc || !block) continue;
    wrapBlockRange(block, loc.start, loc.start + loc.len, { id: hl.id, color: hlColorCss(hl.color) });
    if (commented.has(hl.id)) {
      const spans = flow.querySelectorAll(`[data-hl-id="${hl.id}"]`);
      const last = spans[spans.length - 1];
      if (last) last.classList.add("er-hl-cmt-end");
    }
  }
  erRenderStopMark(view);
  erRenderBacklinkMarks(view);
}
// The comment of the highlight being edited, shown at the top of the bar;
// tapping it opens it for editing.
function erShowHlComment(view) {
  const pop = view.hlPopup;
  if (!pop) return;
  let box = pop.querySelector(".er-hl-cmtview");
  const id = view._editHlId;
  const q = id && view.file ? view.plugin.getHighlightQuotes(view.file.path).find((h) => h.id === id || (h.ids && h.ids.includes(id))) : null;
  if (!q || !q.comment) { if (box) box.remove(); pop.removeClass("er-hl-popup-cmt"); return; }
  if (!box) {
    box = createDiv({ cls: "er-hl-cmtview" });
    pop.prepend(box);
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      const cur = view._currentHl();
      const editId = view._editHlId;
      view._hideHlPopup();
      if (cur) erCommentAction(view, cur, editId, null);
    });
  }
  box.setText(q.comment);
  box.setAttribute("aria-label", __ertr("Изменить комментарий"));
  pop.addClass("er-hl-popup-cmt");
}
function unwrapAllHighlights(flow) {
  if (!flow) return;
  flow.querySelectorAll("[data-hl-id]").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });
}
function wrapBlockRange(block, start, end, hl) {
  if (end <= start) return;
  const walker = docOf(block).createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let node, pos = 0;
  const targets = [];
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    const nodeStart = pos, nodeEnd = pos + len;
    pos = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) continue;
    targets.push({ node, s: Math.max(0, start - nodeStart), e: Math.min(len, end - nodeStart) });
  }
  for (const t of targets) {
    let n = t.node;
    if (t.e < n.textContent.length) n.splitText(t.e);
    if (t.s > 0) n = n.splitText(t.s);
    const span = docOf(block).createElement("span");
    span.className = "er-hl";
    span.style.background = hl.color;
    span.setAttribute("data-hl-id", hl.id);
    n.parentNode.insertBefore(span, n);
    span.appendChild(n);
  }
}
function _readerSettings(app) {
  const p = app && app.plugins && app.plugins.plugins ? app.plugins.plugins["elton-reader-books"] : null;
  return p && p.settings || {};
}
function noteTemplatePath(app, bookFile) {
  const s = _readerSettings(app);
  if (bookFile && s.bookTemplates && s.bookTemplates[bookFile.path]) return erPath(s.bookTemplates[bookFile.path]);
  return erPath(s.noteTemplate);
}
function notesFolderPath(app) {
  return erPath(_readerSettings(app).notesFolder);
}
function bookNotesFolderPath(app) {
  return erPath(_readerSettings(app).bookNotesFolder);
}
function inboxNotePath(app, name, override) {
  const f = typeof override === "string" && override !== "" ? erPath(override) : notesFolderPath(app);
  return erPath(f ? `${f}/${name}.md` : `${name}.md`);
}
async function resolveNotesFolder(app, override) {
  const f = typeof override === "string" && override !== "" ? erPath(override) : notesFolderPath(app);
  if (!f) return app.vault.getRoot();
  let folder = app.vault.getAbstractFileByPath(f);
  if (!folder) {
    await app.vault.createFolder(f).catch(() => {
    });
    folder = app.vault.getAbstractFileByPath(f);
  }
  return folder || app.vault.getRoot();
}
function bookNoteFiles(app) {
  const base = bookNotesFolderPath(app);
  const all = app.vault.getMarkdownFiles();
  if (!base) return all;
  const prefix = base + "/";
  return all.filter((f) => f.path.startsWith(prefix));
}
function resolveBookNote(app, name) {
  if (!name) return null;
  const byLink = app.metadataCache.getFirstLinkpathDest ? app.metadataCache.getFirstLinkpathDest(name, "") : null;
  if (byLink instanceof TFile) return byLink;
  const base = bookNotesFolderPath(app);
  const direct = app.vault.getAbstractFileByPath(erPath(base ? `${base}/${name}.md` : `${name}.md`));
  if (direct instanceof TFile) return direct;
  const hit = app.metadataCache.getFirstLinkpathDest(name, "");
  return hit instanceof TFile ? hit : null;
}
const BookNotePicker = class extends FuzzySuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this._files = files;
    this._onChoose = onChoose;
    this.setPlaceholder(__ertr("Заметка книги для ссылок — начните вводить название…"));
  }
  getItems() {
    return this._files;
  }
  getItemText(f) {
    return f.basename;
  }
  onChooseItem(f) {
    this._onChoose(f);
  }
};
const BookQuickOpen = class extends FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder(__ertr("Какую книгу открыть?"));
  }
  getItems() {
    const prog = this.plugin.progress || {};
    const started = (f) => {
      const p = prog[f.path];
      return p && typeof p.pct === "number" && p.pct > 0 ? p.pct : -1;
    };
    return this.plugin.bookFiles().sort((a, b) => {
      const sa = started(a), sb = started(b);
      if (sa >= 0 !== sb >= 0) return sa >= 0 ? -1 : 1;
      return a.basename.localeCompare(b.basename);
    });
  }
  getItemText(f) {
    const p = (this.plugin.progress || {})[f.path];
    const pct = p && typeof p.pct === "number" ? Math.round(p.pct * 100) : 0;
    return pct > 0 ? `${f.basename} — ${pct}%` : f.basename;
  }
  onChooseItem(f) {
    this.plugin.openFile(f);
  }
};
const TemplatePicker = class extends FuzzySuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this._files = files;
    this._onChoose = onChoose;
    this.setPlaceholder(__ertr("Шаблон заметки — начните вводить путь…"));
  }
  getItems() {
    return this._files;
  }
  getItemText(f) {
    return f.path;
  }
  onChooseItem(f) {
    this._onChoose(f);
  }
};
const FolderSuggest = AbstractInputSuggest ? class extends AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    this._inputEl = inputEl;
  }
  getSuggestions(query) {
    const q = (query || "").toLowerCase();
    let out = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFolder && f.path && f.path.toLowerCase().includes(q)) out.push(f.path);
    }
    return out.sort().slice(0, 50);
  }
  renderSuggestion(path5, el) {
    el.setText(path5);
  }
  selectSuggestion(path5) {
    this._inputEl.value = path5;
    this._inputEl.dispatchEvent(new Event("input"));
    this._inputEl.dispatchEvent(new Event("er-path-pick"));
    this.close();
  }
} : null;
function attachFolderSuggest(app, textComp) {
  try {
    if (FolderSuggest && textComp && textComp.inputEl) new FolderSuggest(app, textComp.inputEl);
  } catch (e) {
    console.warn("Book Reader: folder suggest unavailable", e);
  }
}
function attachPathInput(app, textComp, commit) {
  attachFolderSuggest(app, textComp);
  const el = textComp.inputEl;
  let dirty = false;
  textComp.onChange(() => {
    dirty = true;
  });
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    commit(el.value.trim());
  };
  el.addEventListener("blur", flush);
  el.addEventListener("er-path-pick", flush);
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    flush();
  });
  return textComp;
}
async function appendLinkToBookNote(app, plugin, bookFile, newFile) {
  try {
    const name = bookNoteLinkFor(plugin, bookFile);
    if (!name) return;
    const noteFile = resolveBookNote(app, name);
    if (!noteFile || noteFile.path === newFile.path) return;
    const heading = __ertr("## Заметки из выделений");
    const link = `- [[${newFile.basename}]]`;
    const add = (data) => {
      const base = data.replace(/\s*$/, "");
      return data.includes(heading) ? `${base}
${link}
` : `${base}

${heading}
${link}
`;
    };
    if (typeof app.vault.process === "function") await app.vault.process(noteFile, add);
    else await app.vault.modify(noteFile, add(await app.vault.read(noteFile)));
  } catch (e) {
    console.error("Elton Reader: append to book note failed", e);
  }
}
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
function sanitizeNoteTitle(raw, max = 100) {
  // Control characters are exactly what has to go from a file name.
  // eslint-disable-next-line no-control-regex -- stripping them is the point
  let t = (raw || "").replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (t.length > max) t = t.slice(0, max).replace(/[.\s]+$/, "");
  if (!t) t = __ertr("Заметка");
  if (RESERVED_NAMES.test(t)) t = `_${t}`;
  return t;
}
function suggestNoteTitle(text, max = 60) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean.replace(/[.,;:!?…\s]+$/, "");
  const m = clean.match(/^(.{10,}?[.!?…])(\s|$)/);
  if (m && m[1].length <= max && /[\p{L}]{3}[.!?…]+$/u.test(m[1])) {
    return m[1].replace(/[.,;:!?…\s]+$/, "");
  }
  let cut = clean.slice(0, max + 1);
  const sp = cut.lastIndexOf(" ");
  if (sp > max * 0.5) cut = cut.slice(0, sp);
  return cut.replace(/\s+[a-zа-яё]{1,2}$/i, "").replace(/[.,;:!?…\-—\s]+$/, "");
}
const ReadSettingsModal = class extends Modal {
  constructor(app, view) {
    super(app);
    this.view = view;
  }
  // Тема применяется мгновенно, остальное требует перевёрстки. Обе читалки
  // называют свои методы по-разному, поэтому зовём то, что есть.
  async _apply(нуженПересчёт) {
    const v = this.view;
    // Записывать data.json на КАЖДОЕ нажатие — это и есть та самая задержка:
    // на телефоне запись идёт через хранилище и синхронизацию, и интерфейс
    // стоит. Вид меняем сразу, а на диск кладём, когда перестали тыкать.
    window.clearTimeout(this._saveT);
    this._saveT = window.setTimeout(() => { v.plugin.saveAll(); }, 500);
    if (typeof v.applyVars === "function") v.applyVars();
    if (typeof v._applyTheme === "function") v._applyTheme();
    // ВАЖНО: _applyContentStyle на телефоне — это ПОЛНАЯ пересборка книги
    // (см. ReaderModal). Вызывать его на каждое нажатие нельзя: смена темы —
    // это только цвета, а книга пересобиралась целиком, и на большом PDF это
    // те самые 10–20 секунд ожидания.
    if (нуженПересчёт && v.bookHtml) {
      // Абзац, на котором стоит читатель, снимается ДО пересборки и
      // восстанавливается ПОСЛЕ. Любая новая раскладка — это другая нарезка на
      // развороты, и попытка пересчитать позицию внутри самой пересборки
      // регулярно выбрасывала книгу в самый конец.
      let block = null;
      try { block = v.pager ? v.pager.currentBlockIndex() : null; } catch { /* optional step; a failure here must not interrupt reading */ }
      if (v.file && v.pager && typeof block === "number" && block >= 0) {
        v.plugin.saveNow(v.file.path, v.pager.spread, v.pager.total, block, true);
      }
      if (typeof v.repaginate === "function") await v.repaginate();
      else if (typeof v._repaginate === "function") await v._repaginate();
      if (v.pager && typeof block === "number" && block >= 0) {
        const [cur, tot] = v.pager.jumpTo(v.pager.spreadForBlock(block));
        const ui = v.updateUI || v._updateUI;
        if (typeof ui === "function") ui.call(v, cur, tot);
        if (v.file) v.plugin.saveNow(v.file.path, cur, tot, block, true);
      }
    }
    this._paintPreview();
  }
  _paintPreview() {
    const p = this.previewEl;
    if (!p) return;
    const s = this.view.plugin.settings;
    const t = erTheme(s);
    p.style.fontFamily = erFontFamily(s);
    p.style.fontSize = `${s.fontSize || 18}px`;
    p.style.lineHeight = String(s.lineHeight || 1.8);
    p.style.textAlign = s.textAlign || "left";
    p.style.background = t.bg;
    p.style.color = t.text;
  }
  // Один переключатель: подпись сверху, ячейки равной ширины. Именно разнобой
  // ширин и переносил кнопки на вторую строку в старой панели.
  _seg(host, label, items, current, onPick, hint, компактный) {
    host.createDiv("er-pan-sec").setText(label);
    const row = host.createDiv("er-col-row er-rs-seg" + (компактный ? " er-rs-num" : ""));
    const btns = [];
    for (const [value, text, шрифт] of items) {
      const b = row.createDiv("er-col-btn");
      b.setText(text);
      if (шрифт) b.style.fontFamily = шрифт;
      if (value === current()) b.addClass("active");
      b.addEventListener("click", async () => {
        for (const x of btns) x.removeClass("active");
        b.addClass("active");
        await onPick(value);
      });
      btns.push(b);
    }
    if (hint) host.createDiv("er-pan-hint").setText(hint);
    return row;
  }
  // Окно настроек — вкладки, как в настройках самого плагина. Раньше это была
  // одна длинная страница в три колонки, которую приходилось прокручивать,
  // чтобы добраться до половины настроек. Теперь каждая группа помещается
  // целиком, а окно не меняет высоту при переключении (вкладки лежат в одной
  // ячейке сетки, высоту задаёт самая длинная). Последняя вкладка запоминается.
  // Tabs, like the plugin's own settings: no scrolling to reach half of them.
  onOpen() {
    const v = this.view;
    const s = v.plugin.settings;
    this.modalEl.addClass("er-rs-modal");
    const c = this.contentEl;
    c.empty();
    c.addClass("er-rs");
    c.createDiv("er-rs-title").setText(__ertr("Настройки чтения"));
    const TABS = [
      ["text", __ertr("Текст")],
      ["page", __ertr("Страница")],
      ["reading", __ertr("Чтение")],
      ["book", __ertr("Книга")]
    ];
    const bar = c.createDiv("er-rs-tabs");
    bar.setAttribute("role", "tablist");
    const panes = c.createDiv("er-rs-panes");
    const tabEl = {}, paneEl = {};
    const show = (id, focus) => {
      for (const [k] of TABS) {
        const on = k === id;
        tabEl[k].toggleClass("er-rs-tab-on", on);
        tabEl[k].setAttribute("aria-selected", String(on));
        tabEl[k].tabIndex = on ? 0 : -1;
        paneEl[k].toggleClass("er-rs-pane-on", on);
      }
      if (focus) tabEl[id].focus();
      if (s.readerSetTab !== id) {
        s.readerSetTab = id;
        v.plugin._saveLocalData();
      }
    };
    for (const [id, label] of TABS) {
      const t = bar.createEl("button", { cls: "er-rs-tab", text: label });
      t.setAttribute("role", "tab");
      t.addEventListener("click", () => show(id));
      tabEl[id] = t;
      paneEl[id] = panes.createDiv("er-rs-pane er-rs-pane-" + id);
      paneEl[id].setAttribute("role", "tabpanel");
    }
    // Стрелки переключают вкладки, как в любой панели вкладок.
    bar.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = TABS.findIndex(([k]) => k === s.readerSetTab);
      const n = (Math.max(0, i) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
      e.preventDefault();
      show(TABS[n][0], true);
    });
    const two = (pane) => {
      const g = pane.createDiv("er-rs-grid");
      return [g.createDiv("er-rs-col"), g.createDiv("er-rs-col")];
    };

    // ── Текст: как выглядят буквы. Образец сверху меняется сразу.
    {
      const pane = paneEl.text;
      this.previewEl = pane.createDiv("er-rs-preview");
      this.previewEl.setText(__ertr("Так будет выглядеть текст книги"));
      this._paintPreview();
      c.addEventListener("click", () => window.setTimeout(() => this._paintPreview(), 80), true);
      const [a, b] = two(pane);
    this._seg(
      a,
      __ertr("Тема"),
      [["auto", __ertr("Как в Obsidian")], ["light", __ertr("Светлая")], ["dark", __ertr("Тёмная")], ["sepia", "Sepia"], ["eink", "E-ink"]],
      () => s.einkMode ? "eink" : s.theme,
      async (t) => {
        if (t === "eink") s.einkMode = true;
        else {
          s.einkMode = false;
          s.theme = t;
        }
        await this._apply(false);
      }
    );
    a.createDiv("er-pan-sec").setText(__ertr("Размер шрифта"));
    const szRow = a.createDiv("er-sz-row");
    const szMinus = szRow.createDiv("er-sz-btn");
    szMinus.setText("A−");
    const szLbl = szRow.createDiv("er-sz-label");
    szLbl.setText(`${s.fontSize}px`);
    const szPlus = szRow.createDiv("er-sz-btn");
    szPlus.setText("A+");
    const chSz = async (d) => {
      s.fontSize = Math.min(32, Math.max(12, (s.fontSize || 18) + d));
      szLbl.setText(`${s.fontSize}px`);
      await this._apply(true);
    };
    szMinus.addEventListener("click", () => chSz(-1));
    szPlus.addEventListener("click", () => chSz(1));
    this._seg(
      b,
      __ertr("Шрифт"),
      erFontChoices(s),
      () => s.fontFamily,
      async (f) => {
        s.fontFamily = f;
        await this._apply(true);
      }
    );
    const шаги = [1.4, 1.6, 1.8, 2.1];
    this._seg(
      b,
      __ertr("Межстрочный"),
      шаги.map((x) => [x, String(x)]),
      () => шаги.find((x) => Math.abs((s.lineHeight || 1.8) - x) < 0.05),
      async (x) => {
        s.lineHeight = x;
        await this._apply(true);
      },
      null,
      true
    );
    }

    // ── Страница: как текст разложен и как по нему двигаться.
    {
      const [a, b] = two(paneEl.page);
    // Две страницы рядом физически не помещаются на телефоне: раскладка сама
    // требует ширину больше 700px, то есть настройка там ничего не делала и
    // только сбивала с толку. Планшету и компьютеру она нужна, им и показываем.
    if (erDeviceKey() !== "phone") this._seg(
      a,
      __ertr("Страниц рядом"),
      [["1", __ertr("Одна")], ["2", __ertr("Две")]],
      () => String(s.columns || "2"),
      async (n) => {
        s.columns = n;
        await this._apply(true);
      },
      __ertr("Две — только на широком экране.")
    );
    this._seg(
      a,
      __ertr("Как листать"),
      [["pages", __ertr("Страницы")], ["scroll", __ertr("Прокрутка")]],
      () => s.readMode || "pages",
      async (m) => {
        if (m === (s.readMode || "pages")) return;
        const v = this.view;
        // У страниц и прокрутки РАЗНЫЕ системы координат: там развороты, тут
        // экраны. Пересчитывать место «на лету» между ними — источник прыжков
        // в самый конец книги. Поэтому запоминаем абзац, на котором читатель
        // стоит, и открываем книгу заново — тем же путём, что и при обычном
        // открытии, где место восстанавливается годами без нареканий.
        try {
          if (v.file && v.pager) {
            v.plugin.saveNow(v.file.path, v.pager.spread, v.pager.total, v.pager.currentBlockIndex(), true);
          }
        } catch { /* optional step; a failure here must not interrupt reading */ }
        s.readMode = m;
        await this._apply(false);
        const file = v.file;
        if (!file) return;
        if (typeof v.openFile === "function") await v.openFile(file);
        else if (typeof v._loadBook === "function") await v._loadBook();
      }
    );
    // На телефоне колонка и так узкая: 60–90 знаков в строку туда не влезают,
    // то есть настройка ничего не меняла. Планшету и компьютеру она нужна.
    if (erDeviceKey() !== "phone") this._seg(
      a,
      __ertr("Ширина строки"),
      [[0, __ertr("Авто")], [60, "60"], [70, "70"], [80, "80"], [90, "90"]],
      () => Number(s.maxLineCh) || 0,
      async (n) => {
        s.maxLineCh = n;
        await this._apply(true);
      },
      __ertr("Знаков в строке. Короткая строка читается легче."),
      true
    );
      erRsAlign(v, b);
      erRsVAlign(v, b);
      this._seg(b, __ertr("Поля страницы"), [["narrow", __ertr("Узкие")], ["normal", __ertr("Обычные")], ["wide", __ertr("Широкие")]],
        () => s.pageMargin || "normal", async (x) => { s.pageMargin = x; await this._apply(true); });
      this._seg(b, __ertr("Между абзацами"), [[0.3, __ertr("Плотно")], [0.75, __ertr("Обычно")], [1.2, __ertr("Просторно")]],
        () => [0.3, 0.75, 1.2].find((x) => Math.abs((Number(s.paraSpacing) || 0.75) - x) < 0.01), async (x) => { s.paraSpacing = x; await this._apply(true); });
    }

    // ── Чтение: листание, цель на день и точки, куда можно вернуться.
    {
      const [a, b] = two(paneEl.reading);
      erRsNavMode(v, a);
      erRsGoal(v, a);
      if (typeof v._renderHistory === "function") {
        b.createDiv("er-pan-sec").setText(__ertr("Вернуться к месту"));
        v._histRow = b.createDiv("er-hist-row");
        v._renderHistory();
        // Перешли к точке — окно закрывается, иначе оно заслоняет то место,
        // куда только что перешли.
        v._histRow.addEventListener("click", (e) => {
          if (e.target instanceof Element && e.target.closest(".er-hist-chip")) window.setTimeout(() => this.close(), 0);
        });
        b.createDiv("er-pan-hint").setText(__ertr("Точки сохраняются сами по ходу чтения; 💾 — те, что вы отметили сами."));
      }
    }

    // ── Книга: то, что относится только к открытой книге.
    {
      const pane = paneEl.book;
      if (v.file) {
        pane.createDiv("er-rs-book").setText(erBookTitle(v.file));
        // Поля книги — подпись и поле вместе, по два в ряд: так вкладка не
        // длиннее остальных. Сброс остаётся последним, под всеми полями.
        const fields = pane.createDiv("er-rs-fields");
        const tmp = createDiv();
        buildBookSettings(v, tmp);
        let cell = null;
        for (const el of [...tmp.children]) {
          if (el.hasClass("er-info-group")) cell = fields.createDiv("er-rs-field");
          if (el.hasClass("er-rs-reset")) { pane.appendChild(el); continue; }
          (cell || fields).appendChild(el);
        }
      } else {
        pane.createDiv("er-pan-hint").setText(__ertr("Сначала откройте книгу…"));
      }
      const act = pane.createDiv("er-act-row");
      const help = act.createDiv("er-act-btn");
      iconLabel(help, "info", __ertr("Справка"));
      help.addEventListener("click", () => {
        this.close();
        new InfoModal(this.app, v.plugin, v.file).open();
      });
      const all = act.createDiv("er-act-btn");
      iconLabel(all, "sliders", __ertr("Все настройки плагина"));
      all.addEventListener("click", () => {
        this.close();
        try {
          this.app.setting.open();
          this.app.setting.openTabById(v.plugin.manifest.id);
        } catch { /* settings window unavailable */ }
      });
    }
    const first = TABS.some(([k]) => k === s.readerSetTab) ? s.readerSetTab : "text";
    show(first);
    // Obsidian ставит фокус на первую кнопку окна, и вкладка открывалась с
    // рамкой фокуса, будто её уже выбрали с клавиатуры. Рамка нужна только Tab.
    window.setTimeout(() => {
      const a = c.ownerDocument.activeElement;
      if (a && a.classList && a.classList.contains("er-rs-tab")) a.blur();
    }, 0);
  }
  onClose() {
    // Настройки пишутся с задержкой; окно закрыли раньше — дописываем сразу.
    window.clearTimeout(this._saveT);
    if (this.view && this.view.plugin) this.view.plugin.saveAll();
    if (this.view) this.view._histRow = null;
    this.contentEl.empty();
  }
};
const HighlightCommentModal = class extends Modal {
  constructor(app, initial, onDone) {
    super(app);
    this.initial = initial || "";
    this.onDone = onDone;
    this._answered = false;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass("er-title-modal");
    c.createDiv("er-info-title").setText(this.initial ? __ertr("Изменить комментарий") : __ertr("Комментарий к выделению"));
    const w = c.createDiv("er-setup-field");
    const ta = w.createEl("textarea");
    ta.addClass("er-cmt-input");
    ta.value = this.initial;
    ta.placeholder = __ertr("Ваша мысль об этом фрагменте…");
    c.createDiv("er-setup-hint").setText(__ertr("Комментарий хранится вместе с выделением и попадает в заметку при переносе. Очистите поле, чтобы удалить его."));
    const foot = c.createDiv("er-setup-foot");
    const ok = foot.createEl("button", { text: __ertr("Сохранить") });
    ok.addClass("er-setup-btn", "er-setup-btn-primary");
    const cancel = foot.createEl("button", { text: __ertr("Отмена") });
    cancel.addClass("er-setup-btn", "er-setup-btn-quiet");
    const submit = () => {
      this._answered = true;
      this.close();
      this.onDone(ta.value.trim());
    };
    ok.addEventListener("click", submit);
    cancel.addEventListener("click", () => this.close());
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    });
    erAutoFocus(ta, 30);
    erBlurOnTapOutside(c, ta);
  }
  onClose() {
    this.contentEl.empty();
    if (!this._answered) this.onDone(null);
  }
};
function parseNoteTags(raw) {
  return String(raw || "").replace(/\s+#/g, ",#").split(/[,;\n]+/).map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, "-")).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);
}
function allVaultTags(app) {
  try {
    const counts = app.metadataCache && app.metadataCache.getTags && app.metadataCache.getTags();
    if (!counts) return [];
    return Object.keys(counts).map((t) => t.replace(/^#/, "")).sort((a, b) => (counts["#" + b] || 0) - (counts["#" + a] || 0)).slice(0, 60);
  } catch {
    return [];
  }
}
const NoteTitleModal = class extends Modal {
  constructor(app, plugin, fragment, bookFile, onDone) {
    super(app);
    this.plugin = plugin;
    this.fragment = fragment;
    this.bookFile = bookFile || null;
    this.onDone = onDone;
    this._answered = false;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass("er-title-modal");
    c.createDiv("er-info-title").setText(__ertr("Новая заметка из выделения"));
    const field = (label, hint) => {
      const w = c.createDiv("er-setup-field");
      w.createDiv("er-setup-label").setText(label);
      const el = w.createEl("input", { type: "text" });
      el.addClass("er-setup-input");
      if (hint) el.placeholder = hint;
      return el;
    };
    const input = field(__ertr("Название"));
    input.value = suggestNoteTitle(this.fragment);
    const full = sanitizeNoteTitle(this.fragment);
    if (full && full !== input.value) {
      const useFull = c.createDiv("er-title-alt");
      useFull.setText(__ertr("Взять весь фрагмент как название"));
      useFull.addEventListener("click", () => {
        input.value = full;
        input.focus();
      });
    }
    const folderInput = field(__ertr("Папка"), notesFolderPath(this.app) || __ertr("Корень хранилища"));
    folderInput.value = this.plugin.settings.lastNoteFolder || "";
    try {
      if (FolderSuggest) new FolderSuggest(this.app, folderInput);
    } catch { /* optional step; a failure here must not interrupt reading */ }
    const tagsInput = field(__ertr("Теги"), __ertr("Например: идеи, психология"));
    tagsInput.value = this.plugin.settings.lastNoteTags || "";
    const known = allVaultTags(this.app);
    if (known.length) {
      const dl = c.createEl("datalist");
      dl.id = "er-note-tags-" + Math.random().toString(36).slice(2, 8);
      known.forEach((t) => dl.createEl("option", { value: t }));
      tagsInput.setAttr("list", dl.id);
    }
    c.createDiv("er-setup-hint").setText(__ertr("Папка и теги запомнятся для следующей заметки. Сам фрагмент попадёт в текст целиком — название на это не влияет."));
    const foot = c.createDiv("er-setup-foot");
    const ok = foot.createEl("button", { text: __ertr("Создать заметку") });
    ok.addClass("er-setup-btn", "er-setup-btn-primary");
    // Второй выход из этой же модалки. Люди ждут, что вторая и третья цитата
    // лягут в ту же заметку книги, а не расплодят файлы: кнопка даёт это
    // выбрать прямо здесь, не выключая обычные отдельные заметки в настройках.
    const bookNote = this.bookFile ? bookNoteLinkFor(this.plugin, this.bookFile) : "";
    if (bookNote) {
      const toBook = foot.createEl("button", { text: __ertr("В заметку книги") });
      toBook.addClass("er-setup-btn", "er-setup-btn-quiet");
      toBook.setAttribute("aria-label", __ertr("Дописать цитату в «{0}» вместо отдельной заметки", bookNote));
      toBook.addEventListener("click", () => {
        this._answered = true;
        this.close();
        this.onDone({ toBookNote: true });
      });
    }
    const cancel = foot.createEl("button", { text: __ertr("Отмена") });
    cancel.addClass("er-setup-btn", "er-setup-btn-quiet");
    const submit = async () => {
      const v = input.value.trim();
      if (!v) {
        input.focus();
        return;
      }
      this._answered = true;
      const folder = erPath(folderInput.value.trim());
      const tags = parseNoteTags(tagsInput.value);
      this.plugin.settings.lastNoteFolder = folder;
      this.plugin.settings.lastNoteTags = tagsInput.value.trim();
      try {
        await this.plugin._saveLocalData();
      } catch { /* optional step; a failure here must not interrupt reading */ }
      this.close();
      this.onDone({ title: v, folder, tags });
    };
    ok.addEventListener("click", submit);
    cancel.addEventListener("click", () => this.close());
    for (const el of [input, folderInput, tagsInput]) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    }
    erAutoFocus(input, 30);
  }
  onClose() {
    this.contentEl.empty();
    if (!this._answered) this.onDone(null);
  }
};
function processTemplateManually(tplText, title) {
  let today;
  try {
    today = window.moment ? window.moment().format("YYYY-MM-DD") : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  } catch {
    today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  return tplText.replace(/<%[-_]?\s*tp\.file\.title\s*[-_]?%>/g, title).replace(/<%[-_]?\s*tp\.date\.now\([^)]*\)\s*[-_]?%>/g, today).replace(/<%[-_]?\s*tp\.file\.cursor\([^)]*\)\s*[-_]?%>/g, "").replace(/<%[\s\S]*?%>/g, "");
}
function bookNoteLinkFor(plugin, bookFile) {
  let _a, _b;
  if (!bookFile) return "";
  const map = (_a = plugin == null ? void 0 : plugin.settings) == null ? void 0 : _a.bookNoteLinks;
  const raw = map ? (_b = map[bookFile.path]) != null ? _b : "" : "";
  const fromSettings = String(raw).trim().replace(/^\[\[|\]\]$/g, "").trim();
  if (fromSettings) return fromSettings;
  return bookNoteFromFrontmatter(plugin, bookFile);
}
function bookNoteFromFrontmatter(plugin, bookFile) {
  let _a;
  try {
    const app = plugin && plugin.app;
    if (!app || !bookFile) return "";
    const want = erPath(bookFile.path);
    const wantName = bookFile.basename;
    for (const md of app.vault.getMarkdownFiles()) {
      const fm = app.metadataCache.getFileCache(md);
      const v = fm && fm.frontmatter && ((_a = fm.frontmatter.book) != null ? _a : fm.frontmatter["annotation-target"]);
      if (!v) continue;
      const target = String(v).trim().replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
      if (!target) continue;
      if (erPath(target) === want || target === wantName) return md.basename;
    }
  } catch { /* optional step; a failure here must not interrupt reading */ }
  return "";
}
async function writeBookProperty(app, noteName, bookFile) {
  try {
    if (!noteName || !bookFile) return;
    const note = resolveBookNote(app, noteName);
    if (!note) return;
    await app.fileManager.processFrontMatter(note, (fm) => {
      fm.book = `[[${bookFile.path}]]`;
    });
  } catch (e) {
    console.warn("Book Reader: could not write the book property into the note", e);
  }
}
async function createNoteFromSelection(app, plugin, selText, bookFile, opts = {}) {
  let _a, _b;
  const {
    open = true,
    silent = false,
    reserved = null,
    color = null,
    extra = "",
    openMode = null,
    openBackground = false
  } = opts;
  const clean = (selText || "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  if (!clean) {
    if (!silent) new Notice(__ertr("Пустое выделение"));
    return null;
  }
  let title = sanitizeNoteTitle(clean);
  let chosenFolder = null, chosenTags = [];
  if (!silent && plugin.settings.askNoteTitle !== false) {
    const chosen = await new Promise((resolve) => {
      new NoteTitleModal(app, plugin, clean, bookFile, resolve).open();
    });
    if (chosen === null) return null;
    if (chosen.toBookNote) {
      const base = opts.hl && typeof opts.hl === "object" ? opts.hl : {};
      await exportHighlightsToBookNote(app, plugin, bookFile, [{ ...base, text: clean, color: color != null ? color : base.color }]);
      return null;
    }
    title = sanitizeNoteTitle(chosen.title);
    chosenFolder = chosen.folder || null;
    chosenTags = chosen.tags || [];
  } else if (!silent && plugin.settings.shortNoteTitles) {
    title = sanitizeNoteTitle(suggestNoteTitle(clean));
  }
  if (!chosenFolder && plugin.settings.notesNextToBook && bookFile && bookFile.parent) {
    const beside = erPath(bookFile.parent.path || "");
    if (beside) chosenFolder = beside;
  }
  let filename = title, n = 2;
  const taken = (name) => app.vault.getAbstractFileByPath(inboxNotePath(app, name, chosenFolder)) || reserved && reserved.has(name);
  while (taken(filename)) filename = `${title} ${n++}`;
  if (reserved) reserved.add(filename);
  const linkName = bookFile ? bookNoteLinkFor(plugin, bookFile) || bookFile.basename : "";
  // The same «↪ к месту в книге» link a copied quote has, so the note opens the
  // book at its paragraph — and shows in the book as a mark at that paragraph.
  const hlBlock = opts.hl && typeof opts.hl.block === "number" ? opts.hl.block : (typeof opts.block === "number" ? opts.block : -1);
  const placeLink = bookFile && hlBlock >= 0 && plugin.settings.quoteBacklinks !== false
    ? ` [${backlinkLabel(plugin)}](obsidian://elton-reader?book=${encodeURIComponent(bookFile.path)}&block=${hlBlock})` : "";
  const src = bookFile ? __ertr("\n\n— из [[{0}]]", linkName) + placeLink : "";
  const marked = color ? hlMark(app, clean.replace(/\n/g, "\n> "), color) : clean.replace(/\n/g, "\n> ");
  const tagLine = chosenTags.length ? chosenTags.map((t) => "#" + t).join(" ") + "\n\n" : "";
  const quote = `${tagLine}> ${marked}${extra}${src}`;
  const cursorRe = /<%\s*tp\.file\.cursor\([^)]*\)\s*%>/;
  const cursorReAll = /<%\s*tp\.file\.cursor\([^)]*\)\s*%>/g;
  try {
    const tplPlugin = (_b = (_a = app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b["templater-obsidian"];
    const templater = tplPlugin == null ? void 0 : tplPlugin.templater;
    const _tplPath = noteTemplatePath(app, bookFile);
    const templateFile = _tplPath ? app.vault.getAbstractFileByPath(_tplPath) : null;
    let folder = await resolveNotesFolder(app, chosenFolder);
    let newFile = null;
    if (templater && templateFile && folder && typeof templater.create_new_note_from_template === "function") {
      newFile = await templater.create_new_note_from_template(templateFile, folder, filename, false);
      if (!newFile) newFile = app.vault.getAbstractFileByPath(inboxNotePath(app, filename, chosenFolder));
      if (newFile) {
        const transform = (data) => {
          let out = cursorRe.test(data) ? data.replace(cursorRe, `
${quote}
`) : `${data.replace(/\s*$/, "")}

${quote}
`;
          return out.replace(cursorReAll, "");
        };
        if (typeof app.vault.process === "function") await app.vault.process(newFile, transform);
        else await app.vault.modify(newFile, transform(await app.vault.read(newFile)));
      }
    } else {
      let body = "";
      if (templateFile) {
        try {
          body = processTemplateManually(await app.vault.read(templateFile), filename);
        } catch { /* optional step; a failure here must not interrupt reading */ }
      }
      newFile = await app.vault.create(inboxNotePath(app, filename, chosenFolder), `${body}

${quote}
`);
    }
    if (newFile) {
      if (!silent && bookFile) await appendLinkToBookNote(app, plugin, bookFile, newFile);
      if (open) await openNoteBesideBook(app, plugin, newFile, null, { mode: openMode, background: openBackground });
      if (!silent) new Notice(__ertr("Заметка создана"));
    }
    return newFile;
  } catch (e) {
    console.error("Elton Reader: note creation failed", e);
    if (!silent) new Notice(__ertr("Не удалось создать заметку"));
    return null;
  }
}
function _escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function hlMark(app, text, colorId) {
  const c = HL_COLORS.find((x) => x.id === colorId);
  if (!c || _readerSettings(app).exportColors === false) return text;
  return `<mark style="background:${c.css}">${_escHtml(text)}</mark>`;
}
function normalizeHlText(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/==+/g, " ").replace(/^\s*>+\s?/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function splitExportedHighlights(noteText, highlights) {
  const hay = normalizeHlText(noteText);
  const fresh = [], already = [];
  for (const hl of highlights || []) {
    const needle = normalizeHlText(hl && hl.text);
    if (needle && hay && hay.includes(needle)) already.push(hl);
    else fresh.push(hl);
  }
  return { fresh, already };
}
async function openNoteBesideBook(app, plugin, file, line, opts = {}) {
  const mode = opts.mode || plugin && plugin.settings && plugin.settings.noteOpenMode || "split";
  if (mode === "none" || !file) return null;
  const back = opts.background === true;
  const prev = back ? app.workspace.getMostRecentLeaf() : null;
  const leaf = app.workspace.getLeaf(mode === "tab" ? "tab" : "split");
  await leaf.openFile(file, back ? { active: false } : void 0);
  if (back && prev) app.workspace.setActiveLeaf(prev, { focus: true });
  if (typeof line === "number" && line > 0) {
    try {
      const view = leaf.view;
      if (view && view.editor) view.editor.setCursor({ line, ch: 0 });
    } catch { /* optional step; a failure here must not interrupt reading */ }
  }
  return leaf;
}
function addBookFileMenu(app, menu, file) {
  if (!file) return menu;
  menu.addSeparator();
  menu.addItem((it) => it.setTitle(__ertr("Показать в списке файлов")).setIcon("folder-open").onClick(() => {
    const explorer = app.workspace.getLeavesOfType("file-explorer")[0];
    if (!explorer) return;
    app.workspace.revealLeaf(explorer);
    const tree = explorer.view;
    if (tree && typeof tree.revealInFolder === "function") tree.revealInFolder(file);
  }));
  app.workspace.trigger("file-menu", menu, file, "elton-reader");
  return menu;
}
function deleteBookFromVault(app, plugin, file, after) {
  if (!file) return;
  new ConfirmModal(app, {
    title: __ertr("Удалить книгу?"),
    body: __ertr("\xAB{0}\xBB будет удалена из хранилища вместе с прогрессом чтения и выделениями. Заметка книги останется на месте.", file.basename),
    okText: __ertr("Удалить"),
    cancelText: __ertr("Отмена"),
    onYes: async () => {
      try {
        await app.fileManager.trashFile(file);
        const path5 = file.path;
        if (plugin.progress) delete plugin.progress[path5];
        if (plugin.progressBackups) delete plugin.progressBackups[path5];
        if (plugin.highlights) delete plugin.highlights[path5];
        if (plugin.settings && plugin.settings.coverFits) delete plugin.settings.coverFits[path5];
        if (plugin.settings && plugin.settings.stopMarks) delete plugin.settings.stopMarks[path5];
        await plugin.saveAll();
        new Notice(__ertr("Книга удалена: {0}", file.basename));
        if (typeof after === "function") after();
      } catch (e) {
        console.error("Elton Reader: delete book failed", e);
        new Notice(__ertr("Не удалось удалить книгу"));
      }
    }
  }).open();
}
const QUOTE_TEMPLATE_DEFAULT = "> {text}\n\n— из [[{book}]]{page}{link}";
// Подпись ссылки «обратно в книгу». Своя — из настроек, иначе стандартная.
function backlinkLabel(plugin) {
  const own = String(plugin && plugin.settings && plugin.settings.quoteBacklinkLabel || "").trim();
  return own || __ertr("↪ к месту в книге");
}
function quoteMarkdown(plugin, hl, bookFile) {
  // Paragraphs kept apart. Inside the default "> {text}" a blank quote line
  // separates them; a template that does not quote gets a plain blank line.
  const tplPeek = plugin.settings.quoteTemplate || QUOTE_TEMPLATE_DEFAULT;
  const joiner = /^>\s*\{text\}/m.test(tplPeek) ? "\n>\n> " : "\n\n";
  const clean = String(hl && hl.text || "").split(/\n\s*\n/)
    .map((t) => t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join(joiner);
  if (!clean) return "";
  const bookName = bookFile ? bookNoteLinkFor(plugin, bookFile) || bookFile.basename : "";
  const page = hl && hl.page ? __ertr(", стр. {0}", hl.page) : "";
  let link = "";
  if (plugin.settings.quoteBacklinks !== false && bookFile && typeof hl.block === "number" && hl.block >= 0) {
    link = ` [${backlinkLabel(plugin)}](obsidian://elton-reader?book=${encodeURIComponent(bookFile.path)}&block=${hl.block})`;
  }
  const comment = hl && hl.comment ? `
>
> — ${String(hl.comment).replace(/\n/g, "\n> ")}` : "";
  const tpl = plugin.settings.quoteTemplate || QUOTE_TEMPLATE_DEFAULT;
  return tpl.split("{text}").join(clean + comment).split("{book}").join(bookName).split("{page}").join(page).split("{link}").join(link).split("{comment}").join(comment.replace(/^\n>\n> /, "")).trim();
}
function hlCommentMd(hl) {
  const c = hl && hl.comment ? String(hl.comment).trim() : "";
  return c ? "\n>\n> — " + c.replace(/\n/g, "\n> ") : "";
}
async function exportHighlightsSeparate(app, plugin, bookFile, highlights) {
  if (!highlights || !highlights.length) {
    new Notice(__ertr("Нет выделений для экспорта"));
    return;
  }
  new Notice(__ertr("Создаю заметки: {0}…", highlights.length));
  const reserved = /* @__PURE__ */ new Set();
  let ok = 0, fail = 0;
  for (const hl of highlights) {
    const f = await createNoteFromSelection(app, plugin, hl.text, bookFile, { open: false, silent: true, reserved, extra: hlCommentMd(hl), color: hl.color });
    if (f) ok++;
    else fail++;
  }
  new Notice(fail ? __ertr("Создано заметок: {0}, ошибок: {1}", ok, fail) : __ertr("Создано заметок: {0}", ok));
}
async function openNoteInTab(app, file, line) {
  const leaf = app.workspace.getLeaf("tab");
  if (!leaf) return;
  const eState = typeof line === "number" ? { line, cursor: { from: { line, ch: 0 }, to: { line, ch: 0 } }, focus: true } : void 0;
  await leaf.openFile(file, eState ? { eState } : void 0);
}
const ConfirmModal = class extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts || {};
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("er-confirm-modal");
    contentEl.empty();
    if (this.opts.title) contentEl.createDiv("er-confirm-title").setText(this.opts.title);
    if (this.opts.body) contentEl.createDiv("er-confirm-body").setText(this.opts.body);
    const btns = contentEl.createDiv("er-confirm-btns");
    const no = btns.createEl("button", { text: this.opts.cancelText || __ertr("Нет") });
    no.addClass("er-confirm-no");
    no.addEventListener("click", () => {
      this._done = true;
      this.close();
      this.opts.onNo && this.opts.onNo();
    });
    const yes = btns.createEl("button", { text: this.opts.okText || __ertr("Да") });
    yes.addClass("er-confirm-yes");
    yes.addEventListener("click", () => {
      this._done = true;
      this.close();
      this.opts.onYes && this.opts.onYes();
    });
    window.setTimeout(() => yes.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
const GoToPageModal = class extends Modal {
  constructor(app, total, current, onSubmit) {
    super(app);
    this.total = total;
    this.current = current || 0;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("er-confirm-modal");
    contentEl.empty();
    contentEl.createDiv("er-confirm-title").setText(__ertr("Перейти к странице"));
    const input = contentEl.createEl("input", { cls: "er-gotopage-input", attr: { type: "number", min: "1", max: String(this.total), placeholder: `1–${this.total}` } });
    input.value = String(this.current + 1);
    const submit = () => {
      const n = parseInt(input.value, 10);
      this.close();
      if (!isNaN(n)) this.onSubmit(Math.max(1, Math.min(this.total, n)));
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    const btns = contentEl.createDiv("er-confirm-btns");
    const go = btns.createEl("button", { text: __ertr("Перейти") });
    go.addClass("er-confirm-yes");
    go.addEventListener("click", submit);
    erAutoFocus(input, 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
// Multi-paragraph quotes back into one entry. Parts share `group`; the head is
// the first paragraph, which also carries the comment.
function erMergeHlGroups(list) {
  const out = [];
  const byGroup = new Map();
  for (const h of list || []) {
    if (!h.group) { out.push(h); continue; }
    let g = byGroup.get(h.group);
    if (!g) {
      g = { ...h, ids: [], parts: [] };
      byGroup.set(h.group, g);
      out.push(g);
    }
    g.ids.push(h.id);
    g.parts.push(h);
  }
  for (const g of byGroup.values()) {
    g.parts.sort((a, b) => a.block - b.block);
    const head = g.parts[0];
    g.id = head.id; g.block = head.block; g.occ = head.occ; g.pre = head.pre;
    const cm = g.parts.map((p) => p.comment).filter(Boolean).join("\n");
    if (cm) g.comment = cm; else delete g.comment;
    g.text = g.parts.map((p) => p.text).join("\n\n");
    if (head.chapter) g.chapter = head.chapter;
    if (head.page) g.page = head.page;
  }
  return out;
}
// The markdown of one quote as it goes into a book note. Paragraphs stay
// paragraphs ("> a\n>\n> b"): they used to be squashed onto one line, which
// readers noticed with dialogue — two lines of speech became one.
function erQuoteLines(app, plugin, bookFile, hl) {
  const paras = String(hl.text || "").split(/\n\s*\n/).map((t) => t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (!paras.length) return "";
  let where = hl.page ? __ertr(" *(стр. {0})*", hl.page) : "";
  if (plugin.settings.quoteBacklinks !== false && bookFile && typeof hl.block === "number" && hl.block >= 0) {
    const uri = `obsidian://elton-reader?book=${encodeURIComponent(bookFile.path)}&block=${hl.block}`;
    where += ` [${backlinkLabel(plugin)}](${uri})`;
  }
  const cmt = hl.comment ? `\n>\n> — ${String(hl.comment).replace(/\n/g, "\n> ")}` : "";
  return paras.map((t, i) => `> ${hlMark(app, t, hl.color)}${i === paras.length - 1 ? where : ""}`).join("\n>\n") + cmt;
}
// Keep a quote that is already in the book note in step with the book: a new
// colour or a comment added later used to stay in the reader only (issue #12).
// The quote is found by its text (or by its backlink to the same paragraph);
// only that quote's lines are rewritten, the rest of the note is untouched.
async function erSyncQuoteInBookNote(plugin, path5, id) {
  try {
    const app = plugin.app;
    const bookFile = app.vault.getAbstractFileByPath(path5);
    if (!(bookFile instanceof TFile)) return;
    const name = bookNoteLinkFor(plugin, bookFile);
    const noteFile = name ? resolveBookNote(app, name) : null;
    if (!noteFile || typeof app.vault.process !== "function") return;
    const raw = plugin.getHighlights(path5);
    const ids = plugin.hlGroupIds(path5, id);
    const view = plugin._readers().find((v) => v.file && v.file.path === path5);
    const parts = raw.filter((h) => ids.includes(h.id));
    if (!parts.length) return;
    const [quote] = erMergeHlGroups(view ? enrichHighlights(view, parts) : parts);
    const fresh = erQuoteLines(app, plugin, bookFile, quote);
    if (!fresh) return;
    const firstPara = normalizeHlText(String(quote.text).split(/\n\s*\n/)[0]).slice(0, 60);
    const blockMark = `&block=${quote.block})`;
    await app.vault.process(noteFile, (data) => {
      const lines = data.split("\n");
      let at = -1;
      for (let i = 0; i < lines.length && at < 0; i++) {
        if (/^>/.test(lines[i]) && firstPara && normalizeHlText(lines[i]).includes(firstPara)) at = i;
      }
      for (let i = 0; i < lines.length && at < 0; i++) {
        if (/^>/.test(lines[i]) && lines[i].includes(blockMark)) at = i;
      }
      if (at < 0) return data;
      let from = at;
      while (from > 0 && /^>/.test(lines[from - 1])) from--;
      let to = at;
      while (to + 1 < lines.length && /^>/.test(lines[to + 1])) to++;
      const now = lines.slice(from, to + 1).join("\n");
      if (now === fresh) return data;
      lines.splice(from, to - from + 1, ...fresh.split("\n"));
      return lines.join("\n");
    });
  } catch (e) {
    console.warn("Book Reader: could not update the quote in the book note", e);
  }
}
// ── A colour → its own note ─────────────────────────────────────────────────
// "Yellow is for reflections, green is for things to try": a reader sorts a
// book into categories by colour and wanted each colour gathered in its own
// note, with links back to the passages. Set per book from the ⋯ menu of a
// highlight; every new highlight in that colour is appended there.
function erColorNoteFor(plugin, bookPath, color) {
  const m = plugin.settings.colorNotes && plugin.settings.colorNotes[bookPath];
  const p = m && m[color];
  if (!p) return null;
  const f = plugin.app.vault.getAbstractFileByPath(p);
  return f instanceof TFile ? f : null;
}
async function erAppendQuotesToNote(app, plugin, bookFile, noteFile, quotes) {
  if (!noteFile || !quotes || !quotes.length) return 0;
  let added = 0;
  await app.vault.process(noteFile, (data) => {
    const { fresh } = splitExportedHighlights(data, quotes);
    if (!fresh.length) return data;
    added = fresh.length;
    const block = fresh.map((q) => erQuoteLines(app, plugin, bookFile, q)).filter(Boolean).join("\n\n");
    return data.replace(/\s*$/, "") + (data.trim() ? "\n\n" : "") + block + "\n";
  });
  return added;
}
async function erSendToColorNotes(view, made) {
  if (!view.file || !made || !made.length) return;
  const byColor = new Map();
  for (const q of erMergeHlGroups(enrichHighlights(view, made))) {
    const note = erColorNoteFor(view.plugin, view.file.path, q.color);
    if (!note) continue;
    if (!byColor.has(note)) byColor.set(note, []);
    byColor.get(note).push(q);
  }
  for (const [note, qs] of byColor) {
    try {
      const n = await erAppendQuotesToNote(view.app, view.plugin, view.file, note, qs);
      if (n) new Notice(__ertr("Цитата добавлена в «{0}»", note.basename));
    } catch (e) { console.warn("Book Reader: colour note append failed", e); }
  }
}
const ErColorNotePicker = class extends FuzzySuggestModal {
  constructor(app, defaultName, onPick) {
    super(app);
    this.defaultName = defaultName;
    this.onPick = onPick;
    this.setPlaceholder(__ertr("Выберите заметку или введите название новой…"));
  }
  getItems() {
    const q = (this.inputEl && this.inputEl.value || "").trim();
    const create = { create: true, name: q || this.defaultName };
    return [create, ...this.app.vault.getMarkdownFiles()];
  }
  getItemText(it) { return it.create ? __ertr("➕ Новая заметка «{0}»", it.name) : it.path; }
  onChooseItem(it) { this.onPick(it); }
};
async function erPickColorNote(view, color) {
  const c = HL_COLORS.find((x) => x.id === color);
  const def = sanitizeNoteTitle(`${erBookTitle(view.file)} — ${c ? c.name : color}`);
  new ErColorNotePicker(view.app, def, async (it) => {
    let file = it;
    if (it.create) {
      const name = sanitizeNoteTitle(it.name || def);
      const path = inboxNotePath(view.app, name, null);
      file = view.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        await resolveNotesFolder(view.app, null);
        file = await view.app.vault.create(path, `${__ertr("Цитаты цвета «{0}» из книги [[{1}]]", c ? c.name : color, view.file.basename)}\n\n`);
      }
    }
    if (!(file instanceof TFile)) return;
    const st = view.plugin.settings;
    const all = st.colorNotes || (st.colorNotes = {});
    const m = all[view.file.path] || (all[view.file.path] = {});
    m[color] = file.path;
    await view.plugin.saveAll();
    // Everything already highlighted in this colour goes there too.
    const existing = view.plugin.getHighlights(view.file.path).filter((h) => h.color === color);
    const n = await erAppendQuotesToNote(view.app, view.plugin, view.file, file, erMergeHlGroups(enrichHighlights(view, existing)));
    new Notice(__ertr("«{0}» теперь собирается в «{1}»", c ? c.name : color, file.basename) + (n ? " · " + __ertr("перенесено: {0}", n) : ""));
  }).open();
}
async function exportHighlightsToBookNote(app, plugin, bookFile, highlights) {
  if (!highlights || !highlights.length) {
    new Notice(__ertr("Нет выделений для экспорта"));
    return;
  }
  const name = bookFile ? bookNoteLinkFor(plugin, bookFile) : "";
  if (!name) {
    new Notice(__ertr("Для книги не привязана заметка — задайте её в настройках"));
    return;
  }
  const noteFile = resolveBookNote(app, name);
  if (!noteFile) {
    new Notice(__ertr("Заметка книги не найдена: {0}", name));
    return;
  }
  let existingText = "";
  try {
    existingText = await app.vault.read(noteFile);
  } catch {
    existingText = "";
  }
  const split = splitExportedHighlights(existingText, highlights);
  if (!split.fresh.length) {
    new Notice(split.already.length === 1 ? __ertr("Эта цитата уже есть в \xAB{0}\xBB", noteFile.basename) : __ertr("Все выбранные цитаты уже есть в \xAB{0}\xBB", noteFile.basename));
    return;
  }
  const skipped = split.already.length;
  highlights = split.fresh;
  const groups = [];
  for (const hl of erMergeHlGroups(highlights)) {
    const md = erQuoteLines(app, plugin, bookFile, hl);
    if (!md) continue;
    const chapter = hl.chapter || "";
    let g = groups.find((x) => x.chapter === chapter);
    if (!g) {
      g = { chapter, lines: [] };
      groups.push(g);
    }
    g.lines.push(md);
  }
  const parts = groups.flatMap((g) => g.lines);
  if (!parts.length) {
    new Notice(__ertr("Нет выделений для экспорта"));
    return;
  }
  const heading = __ertr("## Цитаты");
  const showChapters = plugin.settings.quoteChapterHeadings !== false;
  const block = groups.map((g) => (g.chapter && showChapters ? `**${g.chapter}**

` : "") + g.lines.join("\n\n")).join("\n\n");
  let targetLine = 0;
  const add = (data) => {
    const base = data.replace(/\s*$/, "");
    const prefix = data.includes(heading) ? `${base}

` : `${base}

${heading}

`;
    targetLine = (prefix.match(/\n/g) || []).length;
    return `${prefix}${block}
`;
  };
  try {
    if (typeof app.vault.process === "function") await app.vault.process(noteFile, add);
    else await app.vault.modify(noteFile, add(await app.vault.read(noteFile)));
    new Notice(skipped ? __ertr("Добавлено в \xAB{0}\xBB: {1}, пропущено уже имевшихся: {2}", noteFile.basename, parts.length, skipped) : __ertr("Добавлено цитат в \xAB{0}\xBB: {1}", noteFile.basename, parts.length));
    new ConfirmModal(app, {
      title: __ertr("Цитаты добавлены"),
      body: __ertr("Открыть заметку \xAB{0}\xBB в отдельной вкладке?", noteFile.basename),
      okText: __ertr("Да, открыть"),
      cancelText: __ertr("Нет"),
      onYes: () => openNoteInTab(app, noteFile, targetLine)
    }).open();
  } catch (e) {
    console.error("Elton Reader: append quotes to book note failed", e);
    new Notice(__ertr("Не удалось добавить цитаты в заметку книги"));
  }
}
const HighlightExportModal = class extends Modal {
  constructor(app, plugin, bookFile, highlights, noteText, noteName) {
    super(app);
    this.plugin = plugin;
    this.bookFile = bookFile;
    this.noteName = noteName || "";
    const split = splitExportedHighlights(noteText, highlights);
    this.already = new Set(split.already);
    this.items = highlights.map((hl) => ({ hl, on: !split.already.includes(hl) }));
    this.newCount = split.fresh.length;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass("er-exp-modal");
    c.createDiv("er-info-title").setText(__ertr("Что перенести в заметку"));
    const sub = c.createDiv("er-info-sub");
    sub.setText(this.noteName ? this.already.size ? __ertr("Заметка \xAB{0}\xBB — {1} уже перенесено, отмечено {2} новых", this.noteName, this.already.size, this.newCount) : __ertr("Заметка \xAB{0}\xBB — все {1} ещё не перенесены", this.noteName, this.items.length) : __ertr("Заметка книги не привязана — доступны только отдельные заметки"));
    const bar = c.createDiv("er-exp-bar");
    const counter = bar.createSpan({ cls: "er-exp-count" });
    const mkLink = (label, fn) => {
      const a = bar.createSpan({ cls: "er-exp-link", text: label });
      a.addEventListener("click", () => {
        fn();
        refresh();
      });
      return a;
    };
    mkLink(__ertr("Выделить все"), () => this.items.forEach((i) => i.on = true));
    mkLink(__ertr("Снять все"), () => this.items.forEach((i) => i.on = false));
    if (this.already.size) mkLink(__ertr("Только новые"), () => this.items.forEach((i) => i.on = !this.already.has(i.hl)));
    const list = c.createDiv("er-exp-list");
    const rows = this.items.map((item) => {
      const row = list.createDiv("er-exp-row");
      const box = row.createEl("input", { type: "checkbox" });
      box.addClass("er-exp-box");
      box.checked = item.on;
      const body = row.createDiv("er-exp-body");
      const txt = (item.hl.text || "").replace(/\s+/g, " ").trim();
      body.createDiv("er-exp-text").setText(txt.length > 220 ? txt.slice(0, 220) + "…" : txt);
      if (this.already.has(item.hl)) {
        row.addClass("er-exp-done");
        body.createDiv("er-exp-tag").setText(__ertr("уже в заметке"));
      }
      const toggle = () => {
        item.on = !item.on;
        box.checked = item.on;
        refresh();
      };
      box.addEventListener("click", (e) => {
        e.stopPropagation();
        item.on = box.checked;
        refresh();
      });
      row.addEventListener("click", toggle);
      return { item, box };
    });
    const refresh = () => {
      for (const r of rows) r.box.checked = r.item.on;
      const n = this.items.filter((i) => i.on).length;
      counter.setText(__ertr("Отмечено: {0} из {1}", n, this.items.length));
      toNote.disabled = !n || !this.noteName;
      toSep.disabled = !n;
    };
    const foot = c.createDiv("er-setup-foot");
    const toNote = foot.createEl("button", { text: __ertr("В заметку книги") });
    toNote.addClass("er-setup-btn", "er-setup-btn-primary");
    const toSep = foot.createEl("button", { text: __ertr("Отдельными заметками") });
    toSep.addClass("er-setup-btn");
    const picked = () => this.items.filter((i) => i.on).map((i) => i.hl);
    toNote.addEventListener("click", () => {
      const sel = picked();
      this.close();
      exportHighlightsToBookNote(this.app, this.plugin, this.bookFile, sel);
    });
    toSep.addEventListener("click", () => {
      const sel = picked();
      this.close();
      exportHighlightsSeparate(this.app, this.plugin, this.bookFile, sel);
    });
    refresh();
  }
  onClose() {
    this.contentEl.empty();
  }
};
async function exportHighlightsMenu(app, plugin, bookFile, highlights, evt) {
  if (!highlights || !highlights.length) {
    new Notice(__ertr("Нет выделений для экспорта"));
    return;
  }
  const name = bookFile ? bookNoteLinkFor(plugin, bookFile) : "";
  const noteFile = name ? resolveBookNote(app, name) : null;
  let noteText = "";
  if (noteFile) {
    try {
      noteText = await app.vault.cachedRead(noteFile);
    } catch {
      noteText = "";
    }
  }
  new HighlightExportModal(app, plugin, bookFile, highlights, noteText, noteFile ? noteFile.basename : "").open();
}
const InfoModal = class extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin || null;
    this.file = file || null;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("er-info-modal");
    contentEl.empty();
    contentEl.createDiv("er-info-title").setText(__ertr("Как пользоваться Book Reader"));
    contentEl.createDiv("er-info-sub").setText(__ertr("Что делает каждая кнопка и зачем"));
    const groups = [
      { head: __ertr("Верхняя панель"), rows: [
        ["save", __ertr("Сохранить позицию"), __ertr("Запоминает, где вы остановились, и ставит точку возврата (помечена \u{1F4BE} в \xABНастройки → Вернуться к месту\xBB). Это как \xABсохранение\xBB в игре — нажмите перед закрытием книги, если хотите быть точно уверены, что место не потеряется.")],
        ["refresh", __ertr("Обновить"), __ertr("Перестраивает страницу заново, если вёрстка \xABпоехала\xBB — например, после смены размера окна или открытия/закрытия боковой панели или вкладки (текст может отобразиться криво). Текущую позицию при этом сохраняет.")],
        ["search", __ertr("Поиск"), __ertr("Поиск по всему тексту книги — список совпадений с фрагментом вокруг каждого, клик переходит к месту.")],
        ["highlighter", __ertr("Выделения"), __ertr("Открывает список всех ваших выделений в этой книге. Клик по строке — переход к этому месту. У каждого выделения есть значок комментария — короткая мысль, которая остаётся при цитате. Сверху списка — кнопка экспорта в заметки.")],
        ["list", __ertr("Содержание"), __ertr("Оглавление книги: закладки PDF, заголовки, печатное содержание или жирные абзацы — что нашлось первым. У каждого пункта — номер страницы и текущий разворот. Много пунктов — сверху появится фильтр.")],
        ["sliders", __ertr("Настройки"), __ertr("Тема, шрифт, размер текста, число колонок и блок \xABВернуться к месту\xBB — список точек, к которым можно откатиться.")],
        ["info", __ertr("Справка"), __ertr("Это окно.")]
      ] },
      { head: __ertr("Чтение и навигация"), rows: [
        ["chevron-left", __ertr("Листать страницы"), __ertr("Стрелки внизу экрана, клавиши ← → ↑ ↓ и пробел, либо свайп пальцем на телефоне. Каждое перелистывание автоматически сохраняет позицию — отдельно жать \xABСохранить\xBB не обязательно.")]
      ] },
      { head: __ertr("Выделения и заметки"), rows: [
        ["highlighter", __ertr("Выделить текст"), __ertr("Выделите фрагмент мышью или пальцем — всплывёт палитра цветов. Клик по уже готовому выделению — сменить цвет или удалить его.")],
        ["note", __ertr("Создать заметку из выделения"), __ertr("Правый клик по выделенному тексту → \xABСоздать новую заметку\xBB. Заметка создаётся по вашему шаблону в выбранной папке, с цитатой и ссылкой на книгу.")],
        ["download", __ertr("Перенести выделения в заметки"), __ertr("Кнопка вверху панели \xABВыделения\xBB. Откроется список, где можно отметить нужные фрагменты — по одному, \xABВыделить все\xBB или \xABТолько новые\xBB. То, что уже перенесено в заметку книги, помечено и снято с отметки, поэтому повторный экспорт ничего не задваивает. Дальше на выбор: вставить текстом в заметку книги или создать отдельную заметку на каждый фрагмент.")]
      ] }
    ];
    groups.forEach((g) => {
      contentEl.createDiv("er-info-group").setText(g.head);
      g.rows.forEach(([ic, title, desc]) => {
        const row = contentEl.createDiv("er-info-row");
        const ig = row.createDiv("er-info-ic");
        svgIcon(ig, ic);
        const tx = row.createDiv("er-info-tx");
        tx.createDiv("er-info-rowtitle").setText(title);
        tx.createDiv("er-info-rowdesc").setText(desc);
      });
    });
    const note = contentEl.createDiv("er-info-note");
    note.createDiv("er-info-rowtitle").setText(__ertr("Про автосохранение"));
    note.createDiv("er-info-rowdesc").setText(__ertr("Позиция сохраняется сама при каждом перелистывании и хранится в общем файле, который синхронизируется между устройствами (Obsidian Sync). Перестроение страницы (смена размера окна, панелей, масштаба) больше НЕ двигает и не пересохраняет прогресс — поэтому он не \xABуезжает\xBB сам по себе."));
  }
  onClose() {
    let _a, _b;
    (_b = (_a = this._pdfLazy) == null ? void 0 : _a.destroy) == null ? void 0 : _b.call(_a);
    this._pdfLazy = null;
    this.contentEl.empty();
  }
};
const ONBOARD_SLIDES = [
  {
    emoji: "\u{1F4D6}",
    title: __ertr("Добро пожаловать в Book Reader!"),
    body: [
      __ertr("Это уютная читалка книг прямо внутри Obsidian. Читаете, выделяете важное и превращаете выделения в заметки — не выходя из хранилища."),
      __ertr("Пролистайте несколько экранов стрелкой → (или кнопкой \xABДалее\xBB). Это займёт минуту, зато потом всё будет понятно.")
    ]
  },
  {
    emoji: "\u{1F4DA}",
    title: __ertr("Какие форматы и как открыть книгу"),
    body: [
      __ertr("Читалка открывает три формата: EPUB (.epub), FB2 (.fb2) и PDF (.pdf)."),
      __ertr("Чтобы читать книгу, положите её файл в своё хранилище Obsidian и просто кликните по нему — она откроется в читалке."),
      __ertr("На левой панели есть значок \u{1F4D6} \xABБиблиотека\xBB — там все ваши книги с обложками в одном месте.")
    ]
  },
  {
    emoji: "\u{1F423}",
    title: __ertr("Это самая первая версия"),
    tone: "warn",
    body: [
      __ertr("Пожалуйста, не загружайте сразу много книг. Начните с двух-трёх и проверьте, что всё работает стабильно именно на вашем устройстве."),
      __ertr("Особенно аккуратно с очень большими PDF (сотни страниц или сканы картинок) — они тяжёлые и могут подтормаживать."),
      __ertr("Плагин будет становиться лучше. А пока — по чуть-чуть и бережно \u{1F642}")
    ]
  },
  {
    emoji: "\u{1F58D}️",
    title: __ertr("Выделения: цвета и действия"),
    body: [
      __ertr("Выделите текст пальцем или мышью — появится палитра. Выберите цвет, и выделение сохранится."),
      __ertr("Нажмите на уже готовое выделение — откроется то же меню: сменить цвет, скопировать, поставить закладку \xABостановился здесь\xBB, создать заметку, отправить в заметку книги или удалить."),
      __ertr("Все выделения книги собраны в панели \u{1F58D}️ наверху — оттуда можно перейти к любому или экспортировать все сразу.")
    ]
  },
  {
    emoji: "\u{1F517}",
    title: __ertr("Что такое \xABзаметка книги\xBB"),
    body: [
      __ertr("У каждой книги можно завести одну обычную заметку Obsidian — её \xABглавную страницу\xBB, например \xABМастер и Маргарита.md\xBB."),
      __ertr("Когда вы создаёте заметку из выделения, в ней ставится ссылка на эту заметку книги. А ещё цитаты можно отправлять прямо в неё — так все мысли по книге собираются в одном месте."),
      __ertr("Это не обязательно настраивать прямо сейчас — привязать заметку книги можно в любой момент позже. Откройте книгу, нажмите значок ⓘ (справка) вверху читалки и заполните поле \xABЗаметка книги для ссылок\xBB. Пока ничего не привязано, ссылки просто ведут на имя файла книги.")
    ]
  },
  {
    emoji: "\u{1F4BE}",
    title: __ertr("Где всё хранится"),
    body: [
      __ertr("Ваш прогресс чтения и выделения хранятся файлами прямо в хранилище (рядом с книгами или в отдельной папке — это настраивается). Ничего не спрятано \xABвнутри плагина\xBB — всё лежит у вас."),
      __ertr("Заметки из выделений и заметки книги — это самые обычные .md заметки в вашей папке. Открывайте, редактируйте и связывайте их, как любые другие.")
    ]
  },
  {
    emoji: "\u{1F504}",
    title: __ertr("Про синхронизацию"),
    tone: "warn",
    body: [
      __ertr("Раз прогресс и выделения — это файлы в хранилище, они синхронизируются вместе с ним (Obsidian Sync, iCloud и т.п.)."),
      __ertr("Дайте синхронизации закончиться, прежде чем открывать ту же книгу на другом устройстве, и не читайте одну книгу на двух устройствах сразу — иначе позиция может \xABпоспорить сама с собой\xBB."),
      __ertr("На разных устройствах путь к папке с книгами бывает разным — проверьте папки в настройках плагина.")
    ]
  },
  {
    emoji: "\u{1F9ED}",
    title: __ertr("Пример: как это всё работает"),
    body: [
      __ertr("1. Кладёте файл книги (.epub, .fb2 или .pdf) в хранилище и открываете его кликом."),
      __ertr("2. Читаете. Позиция сохраняется сама при каждом перелистывании — ничего нажимать не нужно."),
      __ertr("3. Понравилась мысль — выделяете её и выбираете цвет. Выделение сохранилось."),
      __ertr("4. (по желанию) Нажимаете ⓘ вверху и привязываете \xABзаметку книги\xBB — свою страницу для этой книги. Это можно сделать и потом."),
      __ertr("5. Нажимаете на выделение → \xABв заметку книги\xBB — цитата улетает в эту страницу, и плагин предложит открыть её. Готово: все ваши цитаты в одном месте.")
    ]
  },
  // ── Walk-through of the settings, one screen per thing to decide ──────────
  // Written as "what it does → what to pick → what happens if you don't touch
  // it", because the usual complaint after installing is not knowing which of
  // these matter and which can be ignored.
  {
    emoji: "⚙️",
    title: __ertr("Дальше — разбор настроек"),
    body: [
      __ertr("Следующие экраны проходят по настройкам плагина: что делает каждая, что выбрать и что будет, если ничего не менять."),
      __ertr("Открыть настройки: шестерёнка Obsidian → \xABПлагины сообщества\xBB → Book Reader. Вверху пять вкладок: Чтение, Заметки, Перевод, Данные, О плагине."),
      __ertr("Ни одну из них не обязательно настраивать сразу — плагин работает и так. Этот разбор нужен, чтобы вы знали, что вообще можно поменять.")
    ]
  },
  {
    emoji: "\u{1F4CA}",
    title: __ertr("Вкладка \xABЧтение\xBB: статистика"),
    body: [
      __ertr("Вверху вкладки — карточка со статистикой: сколько прочитано за всё время, серия дней подряд, среднее за день, лучший день и график за две недели."),
      __ertr("Она заполняется сама, когда вы читаете с включённым таймером ▶ (кнопка вверху читалки). Настраивать нечего — просто смотрите."),
      __ertr("Пример: \xAB12 ч 30 мин за всё время \xB7 \u{1F525} 5 дн. подряд\xBB. Если таймер не включать, время не считается.")
    ]
  },
  {
    emoji: "\u{1F446}",
    title: __ertr("Настройка \xABЛистание страниц\xBB"),
    body: [
      __ertr("\xABКнопками\xBB — листаете стрелками внизу, клавишами ← → ↑ ↓ и пробелом, на телефоне свайпом. Центр страницы свободен: выделять текст удобно."),
      __ertr("\xABПо клику мышкой\xBB — клик по левой половине страницы листает назад, по правой вперёд. Быстрее, но случайный клик может перелистнуть, когда вы хотели выделить фразу."),
      __ertr("Что выбрать: начните с \xABКнопками\xBB. Переключите на \xABПо клику\xBB, если читаете подряд и мало выделяете.")
    ]
  },
  {
    emoji: "\u{1F4D0}",
    title: __ertr("\xABВыравнивание\xBB и \xABПоложение текста\xBB"),
    body: [
      __ertr("Выравнивание — как текст прижат в колонке: слева (рваный правый край, как в браузере), по ширине (ровные оба края, как в бумажной книге), по центру или справа."),
      __ertr("Положение на странице — что делать, если страница заполнена не до конца, например в конце главы: оставить текст сверху, поставить по центру или прижать вниз."),
      __ertr("Что выбрать: \xABПо ширине\xBB + \xABСверху\xBB — самый привычный книжный вид. \xABПо центру\xBB имеет смысл, только если вас раздражают полупустые страницы в конце глав.")
    ]
  },
  {
    emoji: "\u{1F576}️",
    title: __ertr("\xABПогружение\xBB и цель чтения"),
    body: [
      __ertr("Погружение: панели сверху и снизу мягко притухают через пару секунд без движения мыши и возвращаются при первом движении. Ничто не отвлекает от текста."),
      __ertr("Цель на день: ползунок от 5 до 120 минут. Таймер ▶ вверху читалки запускается ВРУЧНУЮ и считает обратный отсчёт до цели, ⏸ ставит на паузу."),
      __ertr("Важно: таймер не запускается сам. Если забыть нажать ▶, время чтения и статистика не наберутся.")
    ]
  },
  {
    emoji: "\u{1F4DD}",
    title: __ertr("Заметка из выделения: название, папка, теги"),
    body: [
      __ertr("Выделили фрагмент → \xABСоздать заметку\xBB. Откроется окно с тремя полями: название (подставляется короткое, можно поправить или одной кнопкой взять фрагмент целиком), папка и теги."),
      __ertr("Папка выбирается из подсказки, теги — через запятую, с подсказкой из уже используемых в хранилище. И то и другое запоминается для следующей заметки, так что вводить каждый раз не нужно."),
      __ertr("Пример: выделили абзац про PEP 8 → название \xABСтиль кода PEP 8\xBB, папка \xAB0. Files/5. Inbox\xBB, теги \xABpython, стиль\xBB. Окно можно отключить в настройках → Заметки.")
    ]
  },
  {
    emoji: "\u{1F50B}",
    title: __ertr("Режим для e-ink читалок"),
    body: [
      __ertr("Если Obsidian стоит на Android-читалке с электронными чернилами, включите \xABРежим для e-ink\xBB в настройках → Чтение."),
      __ertr("Он убирает всё, что на таком экране оставляет следы: анимации, плавные переходы, тени, размытие и полупрозрачность. Цвета — чистый чёрный на белом, рамки жёсткие, кнопки крупнее под палец."),
      __ertr("Отдельно в списке тем появляется \xABE-ink\xBB — максимальный контраст без оттенков.")
    ]
  },
  {
    emoji: "\u{1F4C2}",
    title: __ertr("Куда складывать заметки"),
    body: [
      __ertr("\xABПапка для новых заметок\xBB — куда попадают заметки, созданные из выделений. Пусто — в корень хранилища. Пример: 0. Files/5. Inbox"),
      __ertr("\xABПапка заметок-книг\xBB — откуда берётся список, когда вы выбираете заметку книги. Пусто — можно выбрать любую заметку хранилища. Пример: 3. Resources/База книг"),
      __ertr("Путь пишется от корня хранилища, через косую черту. Папку можно выбрать из подсказки — начните печатать, и появится список.")
    ]
  },
  {
    emoji: "\u{1F517}",
    title: __ertr("Заметка книги и шаблон"),
    body: [
      __ertr("У каждой книги может быть своя заметка — в неё складываются цитаты и на неё ведут ссылки \xAB— из [[…]]\xBB из всех заметок по этой книге."),
      __ertr("\xABСвоя заметка на каждую книгу\xBB — создавать её автоматически при первом открытии, не спрашивая. Иначе плагин спросит один раз сам."),
      __ertr("\xABШаблон заметки\xBB — файл, по которому создаются заметки из выделений. Работает и с Templater, если он у вас стоит. Пусто — заметка будет просто с цитатой и ссылкой.")
    ]
  },
  {
    emoji: "\u{1F30D}",
    title: __ertr("Вкладка \xABПеревод\xBB"),
    body: [
      __ertr("Выключено по умолчанию. Если включить, у выделенного текста появится кнопка перевода — удобно для книг на английском."),
      __ertr("Это единственное место, где плагин выходит в интернет: выделенный фрагмент уходит в бесплатный переводчик Google. Больше никуда и ничего не отправляется."),
      __ertr("Язык перевода выбирается там же. Перевод можно сохранить в заметку под оригиналом.")
    ]
  },
  {
    emoji: "\u{1F5C4}️",
    title: __ertr("Вкладка \xABДанные\xBB: где что лежит"),
    body: [
      __ertr("\xABПапка с книгами\xBB — где плагин ищет книги для библиотеки. Пусто — ищет по всему хранилищу."),
      __ertr("\xABПапка для данных\xBB — где лежат файлы прогресса и выделений. Пусто — рядом с книгами. Эти файлы синхронизируются между устройствами, поэтому чтение продолжается с того же места на телефоне."),
      __ertr("\xABПамять о книгах\xBB — кнопка \xABЗабыть все книги\xBB сбрасывает привязки заметок и категорий, но сами заметки не удаляет. Нужна, если хотите настроить всё заново.")
    ]
  },
  {
    emoji: "\u{1F58D}️",
    title: __ertr("Как перенести выделения в заметки"),
    body: [
      __ertr("Кнопка экспорта вверху панели \xABВыделения\xBB открывает список всех выделений книги с галочками."),
      __ertr("Можно отметить нужные по одному, нажать \xABВыделить все\xBB или \xABТолько новые\xBB. То, что уже перенесено в заметку книги, помечено и снято с отметки — повторный экспорт ничего не задваивает."),
      __ertr("Дальше на выбор: вставить текстом в заметку книги (всё в одном месте) или создать отдельную заметку на каждый фрагмент (для связей между заметками)."),
      __ertr("В заметке цитаты собраны по главам, у каждой — номер страницы книги, а комментарий (если вы его оставили) идёт прямо под цитатой.")
    ]
  },
  {
    emoji: "\u{1F4AC}",
    title: __ertr("Комментарий к выделению"),
    body: [
      __ertr("У выделенного текста, кроме \xABСоздать заметку\xBB, есть значок комментария — короткая мысль, которая остаётся ПРИ выделении, а не улетает в отдельный файл."),
      __ertr("Пример: подчеркнули спорный тезис и приписали \xABа вот тут он сам себе противоречит\xBB — эта строка видна в панели \xABВыделения\xBB под цитатой и попадает в заметку книги при экспорте."),
      __ertr("Сохраняется по кнопке или Ctrl+Enter. Если очистить поле — комментарий удаляется, сама цитата остаётся.")
    ]
  },
  {
    emoji: "\u{1F50E}",
    title: __ertr("Поиск по книге"),
    body: [
      __ertr("Значок лупы вверху читалки (или команда \xABПоиск по книге\xBB) открывает поиск по всему тексту — со списком совпадений и фрагментом текста вокруг каждого."),
      __ertr("Клик по результату — переход прямо к этому месту, на любом устройстве и при любой ширине окна."),
      __ertr("Найденное слово подсвечивается жёлтым прямо в тексте книги, поэтому искать его глазами в абзаце не нужно. Через несколько секунд подсветка гаснет сама, чтобы не мешать чтению; убрать сразу — \xABСнять подсветку\xBB в панели поиска."),
      __ertr("Ищет по части слова: запрос \xABсистем\xBB найдёт и \xABсистема\xBB, и \xABсистемы\xBB, и \xABсистемный\xBB.")
    ]
  },
  {
    emoji: "\u{1F4D1}",
    title: __ertr("Оглавление: откуда оно берётся"),
    body: [
      __ertr("Плагин ищет оглавление в таком порядке: сначала настоящие закладки из PDF, потом заголовки в тексте, потом печатное содержание книги (та страница со списком глав и точками), и в последнюю очередь — жирные абзацы, если больше зацепиться не за что."),
      __ertr("У каждого пункта — номер страницы книги и номер текущего разворота, который пересчитывается на лету: он меняется при изменении ширины окна или открытии боковых панелей, поэтому его нельзя один раз сохранить."),
      __ertr("Если пунктов много (в технических книгах бывает 300–400), сверху появляется поле фильтра — начните печатать название главы.")
    ]
  },
  {
    emoji: "\u{1F5BC}️",
    title: __ertr("Картинки в книгах"),
    body: [
      __ertr("Иллюстрации из PDF показываются прямо в тексте. Страницы-сканы рисуются целиком, а на обычных страницах вырезается сама картинка, а не скриншот всей страницы."),
      __ertr("Грузятся они по мере чтения и выгружаются, когда далеко — поэтому книга на 500 страниц с иллюстрациями не съедает память."),
      __ertr("Если картинки мешают и нужен только текст, их можно выключить: настройки → Чтение → \xABПоказывать картинки из книги\xBB.")
    ]
  },
  {
    emoji: "⌨️",
    title: __ertr("Команды и горячие клавиши"),
    body: [
      __ertr("В палитре команд (Ctrl+P) есть \xABОткрыть книгу: …\xBB на каждую вашу книгу — можно повесить горячую клавишу и открывать нужную книгу одним нажатием."),
      __ertr("Ещё есть \xABПродолжить чтение\xBB — открывает последнюю книгу с того места, где вы остановились, и \xABОткрыть книгу…\xBB — список с поиском."),
      __ertr("Горячая клавиша назначается в настройках Obsidian → \xABГорячие клавиши\xBB, поиск по слову Reader.")
    ]
  },
  {
    emoji: "💬",
    title: __ertr("Пожелания и ошибки — в телеграм-бота"),
    body: [
      __ertr("Всё, что хочется поменять или починить, теперь собирается в одном месте — в телеграм-боте @book_in_obsidian_bot."),
      __ertr("Ни аккаунта на GitHub, ни формы не нужно: заметили ошибку, не хватает возможности, неудобно на телефоне — просто отправьте боту обычное сообщение."),
      __ertr("Читаю всё подряд; из этих сообщений и складывается список того, что делать дальше.")
    ]
  },
  {
    emoji: "✅",
    title: __ertr("Готово — приятного чтения!"),
    body: [
      __ertr("Что настроить по желанию (не обязательно сразу): папку для книг и папку для заметок — в настройках плагина. Заметку книги — под значком ⓘ прямо во время чтения."),
      __ertr("Что можно вообще не трогать: прогресс и выделения работают сразу и сохраняются сами."),
      __ertr("Полная справка по каждой кнопке — значок ⓘ в читалке. Этот экран приветствия можно снова открыть в настройках плагина."),
      __ertr("Нажмите \xABНачать читать\xBB и откройте свою первую книгу \u{1F4D6}")
    ]
  }
];
function bookNoteAction(settings, bookPath) {
  const s = settings || {};
  const links = s.bookNoteLinks || {};
  const asked = s.bookNotePrompted || {};
  if (!bookPath) return "prompted";
  if (links[bookPath]) return "linked";
  if (s.autoBookNote) return asked[bookPath] ? "prompted" : "auto";
  return asked[bookPath] ? "prompted" : "ask";
}
// 4.0.0 «Что нового», rewritten to match the release.
Object.assign(__erEN, {
  "Чтение вслух через Elton AI: кнопка 🔊 рядом с таймером читает выделенное или книгу с текущей страницы и сама листает, звучащее слово подсвечено; восемь голосов, скорость от 1× до 2×": "Read aloud with Elton AI: the 🔊 button next to the timer reads the selection or the book from the current page and turns the pages itself, the word being spoken is lit; eight voices, speed from 1× to 2×",
  "Пока голос готовится, внизу страницы видна плашка «Готовлю озвучку…» — нажатие на неё отменяет": "While the voice is being prepared, a “Preparing the voice…” chip shows at the bottom of the page — tap it to cancel",
  "ИИ о книге: кнопка ✨ — «Спросить о книге» (ИИ знает название и видит страницу перед вами) и «Напомнить, что было» — пересказ последних страниц без спойлеров; с выделением — «Разобрать выделенное». Включается на вкладке «Функции»": "AI about the book: the ✨ button — “Ask about the book” (the AI knows the title and sees the page in front of you) and “Recap what happened” — a recap of the last pages with no spoilers; with a selection — “Break down the selection”. Turned on in the Features tab",
  "Заметки со ссылкой на абзац книги видны прямо в тексте: значок у абзаца, наведите — превью заметки, нажмите — она откроется. В заметки из выделений добавляется ссылка «↪ к месту в книге»": "Notes that link to a paragraph of the book show right in the text: a mark by the paragraph, hover for a preview, click to open the note. Notes made from highlights get a “↪ to the place in the book” link",
  "Слова в карточки: «В словарь (карточки)» в меню выделения — слово с переводом или предложением из книги становится карточкой для Spaced Repetition или колоды FSRS; повторно не добавляется": "Words to flashcards: “Add to vocabulary (cards)” in the selection menu — a word with its translation, or the sentence from the book, becomes a card for Spaced Repetition or an FSRS deck; never added twice",
  "Интерфейс на упрощённом китайском — язык выбирается на первой вкладке настроек": "The interface in Simplified Chinese — pick the language on the first settings tab",
  "Без панелей на компьютере: книга на всё окно, панель появляется, если подвести мышь к краю; меню ⋮ книги или команда": "No bars on the computer: the book fills the window, a bar comes back when the mouse reaches the edge; the book’s ⋮ menu or a command",
  "Сколько минут до конца главы и книги — рядом с процентом прочитанного; скорость чтения задаётся в настройках": "Minutes left in the chapter and the book, next to the percentage read; the reading speed is set in the settings",
  "Чтение — в ежедневную заметку: что и сколько читали сегодня, одним блоком; работает с «Ежедневными заметками» и Periodic Notes": "Reading in the daily note: what you read today and for how long, in one block; works with Daily notes and Periodic Notes",
  "Кэш PDF: разобранная книга запоминается на устройстве и повторно открывается за секунды": "PDF cache: a parsed book is kept on the device and opens again in seconds",
  "Вкладка «Функции»: каждую возможность можно выключить — кэш PDF, время до конца главы, заметки со ссылкой на книгу прямо в тексте, комментарии из заметки книги, слова в карточки, чтение в ежедневную заметку, пересказ без спойлеров": "A “Features” tab: every feature can be turned off — PDF cache, time left in the chapter, notes linking to the book shown in the text, comments from the book note, words to flashcards, reading in the daily note, the spoiler-free recap",
  "Оформление: поля страницы, расстояние между абзацами, главы EPUB с новой страницы": "Appearance: page margins, space between paragraphs, EPUB chapters starting on a new page",
  "Книга, открытая при закрытии Obsidian, открывается снова на том же месте": "The book that was open when Obsidian closed opens again at the same place",
  "Библиотеку можно открыть и в правой панели — командой": "The library can also open in the right sidebar — with a command",
  "Ключи ИИ и озвучки можно хранить в защищённом хранилище устройства, а не в файлах настроек": "AI and voice keys can be kept in the device’s secure storage instead of the settings files",
  "«Содержание» и «Поиск» открываются без рывка страницы; в оглавлении подсвечена и стоит посередине текущая глава — и на телефоне": "Contents and Search open without the page jerking; the contents list marks the current chapter and centres it — on phones too",
  "ИИ знает вашу книгу": "AI knows your book",
  "Спросите о книге или попросите напомнить, что было.": "Ask about the book or recap what happened.",
  "Шесть цветов": "Six colours",
  "Свой цвет — своя заметка, комментарий виден в тексте.": "A colour per note, comments marked in the text.",
  "中文 интерфейс": "中文 interface",
  "Русский, английский и упрощённый китайский.": "Russian, English and Simplified Chinese.",
  "Без панелей": "No bars",
  "Книга на всё окно, панель — у края.": "The book fills the window, the bar waits at the edge.",
  "Шрифты и бумага": "Fonts and paper",
  "Свой шрифт, поля, фактура или картинка под текстом.": "Your own font, margins, a texture or picture under the text."
});
Object.assign(__erZH, {
  "Чтение вслух через Elton AI: кнопка 🔊 рядом с таймером читает выделенное или книгу с текущей страницы и сама листает, звучащее слово подсвечено; восемь голосов, скорость от 1× до 2×": "Elton AI 朗读：计时器旁的 🔊 按钮朗读所选内容或从当前页开始朗读并自动翻页，正在朗读的词高亮显示；八种声音，语速 1×–2×",
  "Пока голос готовится, внизу страницы видна плашка «Готовлю озвучку…» — нажатие на неё отменяет": "语音准备期间，页面底部显示“正在准备朗读…”，点击即可取消",
  "ИИ о книге: кнопка ✨ — «Спросить о книге» (ИИ знает название и видит страницу перед вами) и «Напомнить, что было» — пересказ последних страниц без спойлеров; с выделением — «Разобрать выделенное». Включается на вкладке «Функции»": "关于本书的 AI：✨ 按钮——“询问这本书”（AI 知道书名并能看到您当前的页面）和“回顾之前内容”——无剧透地回顾最近几页；选中文本时——“解析所选内容”。在“功能”标签页中开启",
  "Заметки со ссылкой на абзац книги видны прямо в тексте: значок у абзаца, наведите — превью заметки, нажмите — она откроется. В заметки из выделений добавляется ссылка «↪ к месту в книге»": "链接到书中段落的笔记直接显示在正文中：段落旁有标记，悬停预览，点击打开。由高亮生成的笔记会加入“↪ 回到书中位置”链接",
  "Слова в карточки: «В словарь (карточки)» в меню выделения — слово с переводом или предложением из книги становится карточкой для Spaced Repetition или колоды FSRS; повторно не добавляется": "单词变卡片：选区菜单中的“添加到词汇表（卡片）”——单词连同译文或书中原句成为 Spaced Repetition 或 FSRS 卡组的卡片；不会重复添加",
  "Интерфейс на упрощённом китайском — язык выбирается на первой вкладке настроек": "界面支持简体中文——在设置的第一个标签页选择语言",
  "Без панелей на компьютере: книга на всё окно, панель появляется, если подвести мышь к краю; меню ⋮ книги или команда": "电脑上无工具栏：书本铺满窗口，鼠标移到边缘时工具栏出现；通过书的 ⋮ 菜单或命令开启",
  "Сколько минут до конца главы и книги — рядом с процентом прочитанного; скорость чтения задаётся в настройках": "已读百分比旁显示本章和全书的剩余分钟数；阅读速度可在设置中调整",
  "Чтение — в ежедневную заметку: что и сколько читали сегодня, одним блоком; работает с «Ежедневными заметками» и Periodic Notes": "阅读记录写入每日笔记：今天读了什么、读了多久，集中在一个区块；支持“日记”和 Periodic Notes",
  "Кэш PDF: разобранная книга запоминается на устройстве и повторно открывается за секунды": "PDF 缓存：解析过的书保存在设备上，再次打开只需几秒",
  "Вкладка «Функции»: каждую возможность можно выключить — кэш PDF, время до конца главы, заметки со ссылкой на книгу прямо в тексте, комментарии из заметки книги, слова в карточки, чтение в ежедневную заметку, пересказ без спойлеров": "“功能”标签页：每项功能都可关闭——PDF 缓存、本章剩余时间、正文中显示链接到本书的笔记、来自书籍笔记的评论、单词变卡片、阅读记录写入每日笔记、无剧透回顾",
  "Оформление: поля страницы, расстояние между абзацами, главы EPUB с новой страницы": "外观：页边距、段落间距、EPUB 章节另起一页",
  "Книга, открытая при закрытии Obsidian, открывается снова на том же месте": "关闭 Obsidian 时打开的书，再次启动时会回到同一位置",
  "Библиотеку можно открыть и в правой панели — командой": "书库也可以通过命令在右侧边栏打开",
  "Ключи ИИ и озвучки можно хранить в защищённом хранилище устройства, а не в файлах настроек": "AI 和朗读密钥可以保存在设备的安全存储中，而不是设置文件里",
  "«Содержание» и «Поиск» открываются без рывка страницы; в оглавлении подсвечена и стоит посередине текущая глава — и на телефоне": "“目录”和“搜索”打开时页面不再跳动；目录高亮当前章节并居中显示——手机上也是如此",
  "ИИ знает вашу книгу": "AI 了解你的书",
  "Спросите о книге или попросите напомнить, что было.": "询问本书，或让它提醒你之前的内容。",
  "Шесть цветов": "六种颜色",
  "Свой цвет — своя заметка, комментарий виден в тексте.": "每种颜色对应一篇笔记，评论在正文中标出。",
  "中文 интерфейс": "中文界面",
  "Русский, английский и упрощённый китайский.": "俄语、英语和简体中文。",
  "Без панелей": "无工具栏",
  "Книга на всё окно, панель — у края.": "书本铺满窗口，工具栏在边缘待命。",
  "Шрифты и бумага": "字体与纸张",
  "Свой шрифт, поля, фактура или картинка под текстом.": "自定义字体、页边距、纹理或文字下的图片。"
});
const WHATS_NEW = [
  { v: "4.0.0", items: [
    __ertr("Чтение вслух через Elton AI: кнопка 🔊 рядом с таймером читает выделенное или книгу с текущей страницы и сама листает, звучащее слово подсвечено; восемь голосов, скорость от 1× до 2×"),
    __ertr("Пока голос готовится, внизу страницы видна плашка «Готовлю озвучку…» — нажатие на неё отменяет"),
    __ertr("ИИ о книге: кнопка ✨ — «Спросить о книге» (ИИ знает название и видит страницу перед вами) и «Напомнить, что было» — пересказ последних страниц без спойлеров; с выделением — «Разобрать выделенное». Включается на вкладке «Функции»"),
    __ertr("На телефоне в панели выделения снова есть цвета, а цветов теперь шесть; рядом кнопка комментария"),
    __ertr("Выделение с комментарием помечено в тексте; нажатие показывает комментарий и даёт его изменить"),
    __ertr("Свой цвет — своя заметка: например, всё жёлтое собирается в «Размышления», зелёное — в «Применение»"),
    __ertr("Новый цвет или комментарий у выделения обновляет цитату и в заметке книги"),
    __ertr("Цитата из нескольких абзацев — одна цитата: в списке, при экспорте и в заметке абзацы сохраняются"),
    __ertr("Заметки со ссылкой на абзац книги видны прямо в тексте: значок у абзаца, наведите — превью заметки, нажмите — она откроется. В заметки из выделений добавляется ссылка «↪ к месту в книге»"),
    __ertr("Слова в карточки: «В словарь (карточки)» в меню выделения — слово с переводом или предложением из книги становится карточкой для Spaced Repetition или колоды FSRS; повторно не добавляется"),
    __ertr("Интерфейс на упрощённом китайском — язык выбирается на первой вкладке настроек"),
    __ertr("Без панелей на компьютере: книга на всё окно, панель появляется, если подвести мышь к краю; меню ⋮ книги или команда"),
    __ertr("Сколько минут до конца главы и книги — рядом с процентом прочитанного; скорость чтения задаётся в настройках"),
    __ertr("Чтение — в ежедневную заметку: что и сколько читали сегодня, одним блоком; работает с «Ежедневными заметками» и Periodic Notes"),
    __ertr("Кэш PDF: разобранная книга запоминается на устройстве и повторно открывается за секунды"),
    __ertr("PDF: режим «страницы как в оригинале» для формул, схем и сложной вёрстки; колонтитулы и номера страниц больше не мешают тексту; нумерованные заголовки попадают в оглавление"),
    __ertr("Свои шрифты (по названию или файлом из хранилища), шрифт Obsidian, красная строка, фактура бумаги или своя картинка под текстом"),
    __ertr("Оформление: поля страницы, расстояние между абзацами, главы EPUB с новой страницы"),
    __ertr("Автопрокрутка, стрелки и j/k в режиме прокрутки"),
    __ertr("Настройки чтения разложены по вкладкам «Текст», «Страница», «Чтение», «Книга» — без прокрутки"),
    __ertr("Настройки плагина стали короче: приветствие на первой вкладке, редкое — в «Дополнительно»"),
    __ertr("Вкладка «Функции»: каждую возможность можно выключить — кэш PDF, время до конца главы, заметки со ссылкой на книгу прямо в тексте, комментарии из заметки книги, слова в карточки, чтение в ежедневную заметку, пересказ без спойлеров"),
    __ertr("Опции по желанию в настройках (выключены): заметки Markdown в читалке, номер страницы вверху, стилус как маркер, быстрый старт больших PDF, жирные подзаголовки PDF"),
    __ertr("Библиотека: закрепить книгу вверху, обложки строятся по мере прокрутки, подсказка выбрать папку с книгами, без мигания обложек на Mac"),
    __ertr("Библиотеку можно открыть и в правой панели — командой"),
    __ertr("Переименованная или перенесённая книга сохраняет прогресс, выделения и ссылки"),
    __ertr("Книга, открытая при закрытии Obsidian, открывается снова на том же месте"),
    __ertr("Телефон: выделение больше не «убегает» до конца книги и не прыгает на последнюю страницу — оно держится в пределах страницы, а цитату через границу страницы продолжает кнопка «›»"),
    __ertr("Полноэкранное чтение на телефоне: панели прячутся, тап по центру страницы их показывает"),
    __ertr("Телефон: книга из списка файлов открывается окном читалки, а после перезапуска Obsidian возвращается сама; поиск по книге и ссылки «к месту в книге» работают"),
    __ertr("Телефон: верхняя панель встаёт под часы на Samsung и других оболочках; ручной отступ сверху применяется сразу"),
    __ertr("Android: PDF снова открываются на телефонах со старым движком WebView, строятся обложки PDF"),
    __ertr("«Содержание» и «Поиск» открываются без рывка страницы; в оглавлении подсвечена и стоит посередине текущая глава — и на телефоне"),
    __ertr("«Остановился здесь» подсвечивает место в тексте; на компьютере панель и выделение не пропадают, пока открыто меню «⋯»"),
    __ertr("EPUB: картинки, обложки, сноски и ссылки внутри книги, оглавление из самой книги"),
    __ertr("FB2 с «неидеальной» разметкой открываются, ссылки на вложенные разделы работают"),
    __ertr("Ключи ИИ и озвучки можно хранить в защищённом хранилище устройства, а не в файлах настроек"),
    __ertr("Резервные копии хранятся неделю и выключаются; заметка «Что нового» больше не создаётся сама"),
    __ertr("Безопасность: книга больше не может выполнить свой код через разметку")
  ] },
  { v: "3.1.2", items: [
    __ertr("На iPhone и iPad снова открываются PDF — раньше вместо книги была ошибка про readableStream"),
    __ertr("PDF, у которых шрифт не приносит таблицу букв, больше не показываются кашей: текст восстанавливается и его снова можно выделять и искать"),
    __ertr("Если восстановить текст нельзя — страница показывается картинкой, как в самом Obsidian, а не набором значков"),
    __ertr("На Android подсветка зон нажатия больше не залипает на экране после тапа"),
    __ertr("Ползунок прокрутки виден на светлых темах, а не только на тёмных"),
    __ertr("Переход по сноске в режиме «прокруткой» ведёт к сноске, а не в начало книги")
  ] },
  { v: "3.1.1", items: [
    __ertr("Обложки книг в библиотеке снова строятся: PDF рисовался в картинку через возможности браузера, которых в Obsidian ещё нет"),
    __ertr("Это же чинит картинки и страницы-сканы внутри PDF — они рисуются тем же способом")
  ] },
  { v: "3.1.0", items: [
    __ertr("Плагин снова открывается там, где раньше писал «Не удалось загрузить»: на Obsidian постарше, на планшетах Huawei и на части Windows-сборок"),
    __ertr("Цитаты можно складывать в одну заметку книги: в окне названия появилась кнопка «В заметку книги», а в меню выделения — «Текстом в заметку книги»"),
    __ertr("Подпись ссылки «↪ к месту в книге» теперь своя — задаётся в настройках"),
    __ertr("Клик по выделению в списке ведёт к месту в книге даже там, где страница ещё не отрисована"),
    __ertr("Панель выделения больше не убегает на пустое место в начале абзаца и на границе страниц"),
    __ertr("Верхняя панель на Android больше не заезжает под часы; если оболочка телефона молчит о высоте шторки, отступ можно задать руками"),
    __ertr("Что нового теперь сохраняется заметкой в хранилище — не нужно запоминать окно")
  ] },
  { v: "3.0.2", items: [
    __ertr("Пожелания и ошибки теперь собираются в телеграм-боте @book_in_obsidian_bot — просто напишите ему сообщение"),
    __ertr("Разбор фрагмента стал диалогом: свой вопрос, свой системный промпт, название книги уходит фоном"),
    __ertr("Читалка подстраивается под устройство: у телефона, планшета и компьютера своя раскладка"),
    __ertr("Тема читалки и библиотеки меняется мгновенно, появилась подстройка под тему Obsidian"),
    __ertr("Движок PDF обновлён — открытие книг стало надёжнее")
  ] },
  { v: "2.0.1", items: [
    __ertr("Абзацы в PDF сохраняются как в оригинале — текст больше не склеивается в сплошную стену"),
    __ertr("Библиотека: кнопка \xABДобавить книгу\xBB и перетаскивание файлов (PDF, EPUB, FB2) прямо в окно"),
    __ertr("PDF-движок встроен в плагин — книги открываются офлайн, ничего не подгружается из интернета"),
    __ertr("В списке выделений комментарий больше не ломает цитату — он аккуратно встаёт под ней")
  ] },
  { v: "2.0.0", items: [
    __ertr("Поиск по всей книге — значок лупы вверху читалки, со списком совпадений и переходом к месту"),
    __ertr("Найденное слово подсвечивается прямо в тексте, чтобы не искать его глазами в абзаце"),
    __ertr("Комментарий к выделению — короткая мысль остаётся при цитате, а не улетает в отдельный файл"),
    __ertr("Оглавление наконец работает — брало данные, но не показывало их; починил, добавил номер страницы, живой номер разворота и фильтр для длинных списков"),
    __ertr("Экспорт цитат группирует их по главам и подписывает номер страницы"),
    __ertr("Картинки из книг теперь показываются сразу — раньше их приходилось искать в другой читалке"),
    __ertr("Заметку из выделения можно сразу положить в нужную папку и проставить теги"),
    __ertr("Выделения переносятся выборочно: галочки, \xABвыделить все\xBB, \xABтолько новые\xBB — уже перенесённое не задваивается"),
    __ertr("Режим для e-ink читалок: без анимаций и теней, чистый чёрный на белом, крупнее кнопки"),
    __ertr("Инструкция выросла до 21 экрана — теперь разбирает каждую настройку с примерами"),
    __ertr("Книгу можно открыть командой — своя команда и горячая клавиша на каждую книгу"),
    __ertr("Статистика чтения: сколько всего прочитано, серия дней и график за две недели"),
    __ertr("Листание строго вправо, без съезжания в угол, и текст стал чётким"),
    __ertr("Строки заполняют страницу до конца — больше нет пустых мест внизу колонки"),
    __ertr("Перестроение при сворачивании панелей стало плавным, а не рывком"),
    __ertr("Новый формат: FB2 (в том числе старые файлы в кодировке windows-1251)"),
    __ertr("Технические книги читаются нормально: код, таблицы и формулы больше не разваливаются"),
    __ertr("Листинги распознаются даже там, где в книге не указан шрифт кода"),
    __ertr("Пояснения на полях больше не вклеиваются в строки кода"),
    __ertr("Страницы оглавления с точками отображаются как аккуратный список"),
    __ertr("Короткую страницу можно центрировать по вертикали, а не прижимать к верху"),
    __ertr("Оглавление берётся из самого PDF, а на компьютере оно наконец работает"),
    __ertr("Из PDF показываются сами иллюстрации, а не скриншот всей страницы"),
    __ertr("Перевод выделенного фрагмента — включается в настройках"),
    __ertr("Библиотека: категории по жанрам и папкам, фильтр \xABчитаю / прочитано\xBB"),
    __ertr("При первом открытии книги можно СОЗДАТЬ для неё заметку, а не только выбрать"),
    __ertr("Настройки разложены по вкладкам, редкое убрано в \xABДоп. настройки\xBB"),
    __ertr("Текст сам перевёрстывается при открытии панелей и не теряет место"),
    __ertr("Исправлено: ввод пути в настройках создавал папку на каждый символ"),
    __ertr("Плагин стал легче почти на 4 МБ")
  ] }
];
function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
function whatsNewSince(lastSeen, current, log) {
  return (log || WHATS_NEW).filter((r) => cmpVer(r.v, lastSeen) > 0 && cmpVer(r.v, current) <= 0);
}
// Список изменений остаётся в хранилище заметкой.
//
// Окно «Что нового» показывается один раз и закрывается — а вопросы «что вообще
// поменялось в этом обновлении» приходят через неделю. Заметка лежит там же, где
// остальные заметки читалки, ищется поиском и переживает любое окно. Уже
// существующую не трогаем: человек мог её дописать.
async function writeWhatsNewNote(app, plugin, releases) {
  try {
    if (!releases || !releases.length) return null;
    const title = sanitizeNoteTitle(__ertr("Book Reader {0} — что нового", plugin.manifest.version));
    const path = inboxNotePath(app, title, null);
    const exist = app.vault.getAbstractFileByPath(path);
    if (exist instanceof TFile) return exist;
    const body = releases.map((r) => `## ${r.v}

${r.items.map((i) => `- ${__ertr(i)}`).join("\n")}`).join("\n\n");
    await resolveNotesFolder(app, null);
    const f = await app.vault.create(path, `${__ertr("Книжная читалка обновилась до версии {0}. Что изменилось:", plugin.manifest.version)}

${body}
`);
    return f instanceof TFile ? f : null;
  } catch (e) {
    console.warn("Book Reader: could not write the what's-new note", e);
    return null;
  }
}
// The release as a short story told in cards: what changed for the reader,
// one idea per card, swiped through. The full list stays one tap away.
// «Что нового» карточками: одна мысль — одна карточка.
// Ordered by how much each one surprises a reader: the biggest wow first.
const WHATS_NEW_SLIDES = {
  "4.0.0": [
    { icon: "volume-2", title: "Чтение вслух", text: "Живой голос Elton AI, звучащее слово подсвечено." },
    { icon: "sparkles", title: "ИИ знает вашу книгу", text: "Спросите о книге или попросите напомнить, что было." },
    { icon: "palette", title: "Шесть цветов", text: "Свой цвет — своя заметка, комментарий виден в тексте." },
    { icon: "link", title: "Связь с заметками", text: "Заметки со ссылкой на абзац видны прямо в тексте." },
    { icon: "graduation-cap", title: "Слова и дневник", text: "Карточки для повторения и чтение в ежедневной заметке." },
    { icon: "languages", title: "中文 интерфейс", text: "Русский, английский и упрощённый китайский." },
    { icon: "maximize-2", title: "Без панелей", text: "Книга на всё окно, панель — у края." },
    { icon: "clock", title: "Сколько осталось", text: "Минуты до конца главы и книги, на виду." },
    { icon: "file-text", title: "Быстрые PDF", text: "Повторно открываются за секунды." },
    { icon: "smartphone", title: "Выделение на телефоне", text: "Больше не убегает до конца книги." },
    { icon: "type", title: "Шрифты и бумага", text: "Свой шрифт, поля, фактура или картинка под текстом." },
    { icon: "sliders-horizontal", title: "Простые настройки", text: "Вкладки вместо прокрутки, лишнее выключается." },
  ]
};
const WhatsNewModal = class extends Modal {
  constructor(app, plugin, releases, noteFile) {
    super(app);
    this.plugin = plugin;
    this.releases = releases;
    this.noteFile = noteFile || null;
  }
  onOpen() {
    const first = this.releases && this.releases[0];
    const slides = first && WHATS_NEW_SLIDES[first.v];
    if (slides && slides.length) this._renderCards(slides, first.v);
    else this._renderList();
  }
  // The way a phone presents what is new: a large title, a short list — an
  // icon, a name, one line — and one button. Four to a page; the pages swipe.
  _renderCards(slides, ver) {
    const c = this.contentEl;
    c.empty();
    this.modalEl.removeClass("er-onb-modal");
    this.modalEl.addClass("er-wn2-modal");
    c.createDiv({ cls: "er-wn2-title", text: __ertr("Что нового в Book Reader") });
    c.createDiv({ cls: "er-wn2-ver", text: __ertr("Версия {0}", ver) });
    const pages = [];
    for (let i = 0; i < slides.length; i += 4) pages.push(slides.slice(i, i + 4));
    const vp = c.createDiv("er-wn2-viewport");
    const track = vp.createDiv("er-wn2-track");
    for (const page of pages) {
      const pg = track.createDiv("er-wn2-page");
      for (const sl of page) {
        const row = pg.createDiv("er-wn2-row");
        const ic = row.createDiv("er-wn2-icon");
        setIcon(ic, sl.icon);
        const tx = row.createDiv("er-wn2-txt");
        tx.createDiv({ cls: "er-wn2-name", text: __ertr(sl.title) });
        tx.createDiv({ cls: "er-wn2-line", text: __ertr(sl.text) });
      }
    }
    const dots = c.createDiv("er-wn2-dots");
    const dotEls = pages.length > 1 ? pages.map((_, i) => {
      const d = dots.createEl("button", { cls: "er-wn2-dot" });
      d.setAttribute("aria-label", `${i + 1} / ${pages.length}`);
      d.addEventListener("click", () => go(i));
      return d;
    }) : [];
    const next = c.createEl("button", { cls: "er-wn2-next mod-cta" });
    const all = c.createEl("button", { cls: "er-wn2-all", text: __ertr("Все изменения") });
    all.addEventListener("click", () => this._renderList());
    let at = 0;
    const go = (i) => {
      at = Math.max(0, Math.min(pages.length - 1, i));
      track.style.transform = `translateX(${-at * 100}%)`;
      dotEls.forEach((d, k) => d.toggleClass("is-on", k === at));
      track.querySelectorAll(".er-wn2-page").forEach((pg, k) => pg.toggleClass("is-on", k === at));
      next.setText(at === pages.length - 1 ? __ertr("Продолжить") : __ertr("Дальше"));
    };
    next.addEventListener("click", () => { if (at === pages.length - 1) this.close(); else go(at + 1); });
    let x0 = null, y0 = 0;
    vp.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(at + (dx < 0 ? 1 : -1));
    });
    vp.addEventListener("pointercancel", () => { x0 = null; });
    this.scope.register([], "ArrowRight", () => { go(at + 1); return false; });
    this.scope.register([], "ArrowLeft", () => { go(at - 1); return false; });
    go(0);
    window.setTimeout(() => { const f = c.ownerDocument.activeElement; if (f && f.blur && c.contains(f)) f.blur(); }, 0);
  }
  _renderList() {
    const c = this.contentEl;
    this.modalEl.removeClass("er-wn2-modal");
    this.modalEl.addClass("er-onb-modal");
    c.empty();
    const card = c.createDiv("er-onb-card er-wn-card");
    card.createDiv("er-onb-emoji").setText("✨");
    card.createDiv("er-onb-title").setText(__ertr("Что нового"));
    card.createDiv("er-wn-sub").setText(__ertr("Book Reader обновлён до {0}", this.plugin.manifest.version));
    const wrap = card.createDiv("er-wn-wrap");
    for (const r of this.releases) {
      const grp = wrap.createDiv("er-wn-rel");
      grp.createDiv("er-wn-ver").setText(r.v);
      const ul = grp.createDiv("er-wn-list");
      for (const it of r.items) {
        const row = ul.createDiv("er-wn-item");
        row.createSpan({ cls: "er-wn-dot", text: "✦" });
        // Translated here, not where the list is declared: that runs when the
        // module loads, before the language setting exists, so an English
        // interface got the list in Russian.
        row.createSpan({ text: __ertr(it) });
      }
    }
    const nav = c.createDiv("er-onb-nav er-wn-nav");
    const ok = nav.createEl("button", { text: __ertr("Понятно") });
    ok.addClass("er-onb-start", "er-wn-ok");
    ok.addEventListener("click", () => this.close());
    if (this.noteFile) {
      const open = c.createDiv("er-onb-skip");
      open.setText(__ertr("Список сохранён заметкой «{0}» — открыть", this.noteFile.basename));
      open.addEventListener("click", () => {
        this.close();
        this.app.workspace.getLeaf(true).openFile(this.noteFile);
      });
    }
    const help = c.createDiv("er-onb-skip");
    help.setText(__ertr("Инструкция: разбор всех настроек по шагам"));
    help.addEventListener("click", () => {
      this.close();
      new OnboardingModal(this.app, this.plugin).open();
    });
  }
  onClose() {
    this.contentEl.empty();
    this.plugin._wnModalOpen = false;
    const next = this.plugin._afterWhatsNew;
    this.plugin._afterWhatsNew = null;
    if (next) next();
  }
};
const BookSetupModal = class extends Modal {
  constructor(app, plugin, file, onDone) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.onDone = onDone || (() => {
    });
    this._answered = false;
    this._step = 1;
  }
  onOpen() {
    this.modalEl.addClass("er-setup-modal");
    this._render();
  }
  _render() {
    this.contentEl.empty();
    if (this._step === 1) this._renderPick();
    else this._renderCreate();
  }
  // ── Step 1: link an existing note ─────────────────────────────────────────
  // One job per screen: here you only choose. Everything about MAKING a note
  // lives on step 2, so this screen stays a short list instead of a form.
  _renderPick() {
    const c = this.contentEl;
    c.createDiv("er-info-title").setText(__ertr("Заметка для книги"));
    c.createDiv("er-info-sub").setText(erBookTitle(this.file));
    c.createDiv("er-setup-lead").setText(__ertr("Цитаты и мысли из книги будут ссылаться на эту заметку."));
    const search = c.createEl("input", { type: "text" });
    search.addClass("er-setup-input");
    search.placeholder = __ertr("Поиск заметки…");
    const listEl = c.createDiv("er-setup-list");
    const all = bookNoteFiles(this.app);
    const paint = (q) => {
      listEl.empty();
      const needle = (q || "").trim().toLowerCase();
      const shown = (needle ? all.filter((f) => f.basename.toLowerCase().includes(needle)) : all).slice(0, 200);
      if (!all.length) {
        listEl.createDiv("er-setup-empty").setText(__ertr("В хранилище пока нет заметок — создайте новую ниже"));
        return;
      }
      if (!shown.length) {
        listEl.createDiv("er-setup-empty").setText(__ertr("Ничего не найдено"));
        return;
      }
      for (const f of shown) {
        const row = listEl.createDiv("er-setup-row");
        row.createDiv("er-setup-row-name").setText(f.basename);
        const dir = f.parent && f.parent.path && f.parent.path !== "/" ? f.parent.path : "";
        if (dir) row.createDiv("er-setup-row-path").setText(dir);
        row.addEventListener("click", async () => {
          this.plugin.settings.bookNoteLinks[this.file.path] = f.basename;
          await this.plugin.saveAll();
          await writeBookProperty(this.app, f.basename, this.file);
          this._finish(__ertr("Заметка книги: {0}", f.basename));
        });
      }
    };
    search.addEventListener("input", () => paint(search.value));
    paint("");
    const foot = c.createDiv("er-setup-foot");
    const mk = foot.createEl("button", { text: __ertr("Создать заметку…") });
    mk.addClass("er-setup-btn", "er-setup-btn-primary");
    mk.addEventListener("click", () => {
      this._step = 2;
      this._render();
    });
    const skip = foot.createEl("button", { text: __ertr("Читать без заметки") });
    skip.addClass("er-setup-btn", "er-setup-btn-quiet");
    skip.addEventListener("click", () => this._finish(""));
    erAutoFocus(search, 30);
    erBlurOnTapOutside(this.contentEl, search);
    // This window opens by itself the first time a book is opened, and Obsidian
    // focuses the first field of any dialog — on a phone that throws the
    // keyboard over the book before the reader has decided anything (seen on
    // Android: keyboard up, book squeezed behind it). Let go of the focus until
    // the field is actually touched.
    if (erIsMobile(this.app)) {
      let touched = false;
      search.addEventListener("pointerdown", () => { touched = true; });
      const drop = () => { if (!touched && docOf(search).activeElement === search) search.blur(); };
      for (const t of [0, 80, 250, 600]) window.setTimeout(drop, t);
    }
  }
  // ── Step 2: create a new note ─────────────────────────────────────────────
  _renderCreate() {
    const c = this.contentEl;
    const back = c.createDiv("er-setup-back");
    back.setText(__ertr("← Назад"));
    back.addEventListener("click", () => {
      this._step = 1;
      this._render();
    });
    c.createDiv("er-info-title").setText(__ertr("Создать заметку"));
    c.createDiv("er-info-sub").setText(erBookTitle(this.file));
    const field = (label, value, placeholder) => {
      const w = c.createDiv("er-setup-field");
      w.createDiv("er-setup-label").setText(label);
      const el = w.createEl("input", { type: "text" });
      el.addClass("er-setup-input");
      if (value) el.value = value;
      if (placeholder) el.placeholder = placeholder;
      return el;
    };
    const nameInput = field(__ertr("Название заметки"), sanitizeNoteTitle(this.file.basename));
    const folderInput = field(__ertr("Папка"), bookNotesFolderPath(this.app) || notesFolderPath(this.app) || "", __ertr("Корень хранилища"));
    try {
      if (FolderSuggest) new FolderSuggest(this.app, folderInput);
    } catch { /* optional step; a failure here must not interrupt reading */ }
    const tagsInput = field(__ertr("Категория"), bookTagsOf(this.plugin.settings, this.file.path).join(", "), __ertr("Например: Психология, Бизнес"));
    const known = allBookTags(this.plugin.settings);
    if (known.length) {
      const dl = c.createEl("datalist");
      dl.id = "er-setup-tags-" + Math.random().toString(36).slice(2, 8);
      known.forEach((t) => dl.createEl("option", { value: t }));
      tagsInput.setAttr("list", dl.id);
    }
    c.createDiv("er-setup-hint").setText(__ertr("Жанр или тема — по ней книги группируются в библиотеке. Несколько — через запятую. Можно оставить пустым."));
    const foot = c.createDiv("er-setup-foot");
    const createBtn = foot.createEl("button", { text: __ertr("Создать и начать читать") });
    createBtn.addClass("er-setup-btn", "er-setup-btn-primary");
    createBtn.addEventListener("click", async () => {
      createBtn.disabled = true;
      const note = await this.plugin.createBookNote(this.file, nameInput.value, folderInput.value);
      if (!note) {
        createBtn.disabled = false;
        return;
      }
      await this.plugin.setBookTags(this.file.path, parseBookTags(tagsInput.value));
      this._finish(__ertr("Заметка книги создана: {0}", note.basename));
    });
    [nameInput, folderInput, tagsInput].forEach((el) => el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createBtn.click();
      }
    }));
    erAutoFocus(nameInput, 30);
    erBlurOnTapOutside(this.contentEl, nameInput);
  }
  async _finish(msg) {
    this._answered = true;
    const s = this.plugin.settings;
    if (!s.bookNotePrompted) s.bookNotePrompted = {};
    s.bookNotePrompted[this.file.path] = true;
    await this.plugin.saveAll();
    if (msg) new Notice(msg);
    this.close();
    this.onDone();
  }
  onClose() {
    this.contentEl.empty();
    if (!this._answered) this.onDone();
  }
};
const OnboardingModal = class extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin || null;
    this.idx = 0;
    this._finished = false;
  }
  onOpen() {
    this.modalEl.addClass("er-onb-modal");
    this.scope.register([], "ArrowRight", (e) => {
      e.preventDefault();
      this._go(1);
    });
    this.scope.register([], "ArrowLeft", (e) => {
      e.preventDefault();
      this._go(-1);
    });
    this._render();
  }
  _go(dir) {
    const n = this.idx + dir;
    if (n < 0 || n >= ONBOARD_SLIDES.length) return;
    this.idx = n;
    this._render();
  }
  _markSeen() {
    if (this._finished) return;
    this._finished = true;
    if (this.plugin && !this.plugin.settings.onboarded) {
      this.plugin.settings.onboarded = true;
      this.plugin.saveAll();
    }
  }
  _render() {
    const { contentEl } = this;
    contentEl.empty();
    const s = ONBOARD_SLIDES[this.idx];
    const total = ONBOARD_SLIDES.length;
    const last = this.idx === total - 1;
    const card = contentEl.createDiv("er-onb-card" + (s.tone === "warn" ? " er-onb-warn" : ""));
    card.createDiv("er-onb-emoji").setText(s.emoji);
    card.createDiv("er-onb-title").setText(s.title);
    const body = card.createDiv("er-onb-body");
    (Array.isArray(s.body) ? s.body : [s.body]).forEach((p) => body.createEl("p").setText(p));
    const dots = contentEl.createDiv("er-onb-dots");
    ONBOARD_SLIDES.forEach((_, i) => {
      const d = dots.createDiv("er-onb-dot" + (i === this.idx ? " er-onb-dot-on" : ""));
      d.setAttribute("aria-label", __ertr("Экран {0}", i + 1));
      d.addEventListener("click", () => {
        this.idx = i;
        this._render();
      });
    });
    const nav = contentEl.createDiv("er-onb-nav");
    const prev = nav.createEl("button", { text: __ertr("‹ Назад") });
    prev.addClass("er-onb-prev");
    prev.disabled = this.idx === 0;
    prev.addEventListener("click", () => this._go(-1));
    nav.createDiv("er-onb-counter").setText(`${this.idx + 1} / ${total}`);
    const next = nav.createEl("button", { text: last ? __ertr("Начать читать") : __ertr("Далее ›") });
    next.addClass(last ? "er-onb-start" : "er-onb-next");
    next.addEventListener("click", () => {
      if (last) {
        this._markSeen();
        this.close();
      } else this._go(1);
    });
    const skip = contentEl.createDiv("er-onb-skip");
    skip.setText(last ? "" : __ertr("Пропустить"));
    if (!last) skip.addEventListener("click", () => {
      this._markSeen();
      this.close();
    });
    // Said on the first screen, so nobody reads all of it now out of fear of
    // losing it: "I would put this off for later — if I knew I could".
    if (this.idx === 0) {
      contentEl.createDiv({ cls: "er-onb-later", text: __ertr("Это приветствие можно открыть снова в любой момент: Настройки → Book Reader → «О плагине» или команда «Показать приветствие».") });
    }
  }
  onClose() {
    this._markSeen();
    this.contentEl.empty();
  }
};
const ReaderView = class extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.file = null;
    this.ext = null;
    this.pager = new Paginator();
    this.pager.app = plugin && plugin.app;
    this.pager.onSpreadChange = (cur, tot) => {
      (this.updateUI || this._updateUI).call(this, cur, tot);
      if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    };
    this.bookHtml = "";
    this.tocItems = [];
    this.panelOpen = null;
    this.plugin = plugin;
    this._resizeTimer = null;
    this._lastWidth = 0;
    this._pendingSel = null;
    this._editHlId = null;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  // The tab's "..." menu. A book opened in the reader used to have none of the
  // things every other file in Obsidian offers there — reveal in the folder
  // tree, rename, move, delete — which readers reported as the reader "taking
  // the file hostage". These come from Obsidian itself, so they stay correct.
  onPaneMenu(menu, source) {
    super.onPaneMenu(menu, source);
    menu.addItem((it) => it.setTitle(this.plugin.settings.desktopNoBars ? __ertr("Показать панели") : __ertr("Без панелей")).setIcon("maximize").onClick(() => erToggleNoBars(this)));
    if (this.bookHtml) {
      menu.addItem((it) => it.setTitle(this._auto ? __ertr("Остановить автопрокрутку") : __ertr("Автопрокрутка")).setIcon("play").onClick(() => erToggleAutoScroll(this)));
      if (this.plugin.settings.aiEnabled && this.plugin.settings.aiRecap !== false) menu.addItem((it) => it.setTitle(__ertr("Напомнить, что было")).setIcon("history").onClick(() => erAiRecap(this)));
      erPdfModeMenuItem(this, menu);
    }
    addBookFileMenu(this.app, menu, this.file);
  }
  getDisplayText() {
    return this.file ? erBookTitle(this.file) : "Book Reader";
  }
  getIcon() {
    return "book-open";
  }
  getState() {
    let _a, _b;
    const p = (_b = (_a = this.file) == null ? void 0 : _a.path) != null ? _b : "";
    return { file: p, path: p };
  }
  async setState(state, result) {
    const path5 = (state == null ? void 0 : state.file) != null ? state.file : state == null ? void 0 : state.path;
    if (!path5)
      return;
    // Already open, or already on its way (the same big book picked twice).
    if (this.file && this.file.path === path5 && (this.bookHtml || this._opening === path5))
      return;
    const f = this.app.vault.getAbstractFileByPath(path5);
    if (!(f instanceof TFile))
      return;
    // On a phone the book belongs in the dialog (see openFile in the plugin),
    // but plenty of roads lead to a tab instead: the file list, a link in a
    // note, another plugin calling leaf.openFile(), a tab restored from the
    // last session. In a tab Obsidian's floating header covers the reader's
    // top bar (the 💾 "save" button readers could not press, the clock) and
    // the mobile navbar covers the page counter — reproduced in the phone
    // emulation of Obsidian 1.14. So the tab hands the book to the dialog and
    // closes itself. (PR #17 by T-Damer.)
    if (this.app.isMobile) {
      this.file = f;
      this.plugin.openFile(f);
      window.setTimeout(() => { try { this.leaf.detach(); } catch { /* already gone */ } }, 0);
      return;
    }
    // Not awaited. Obsidian marks the tab busy until setState returns and
    // silently drops any other file opened into it meanwhile: a big PDF takes
    // seconds to take apart, and the book picked right after it was lost — the
    // PDF stayed on screen. The load guards itself (a later open wins).
    // Callers that need the text (a quote's link jumping to its paragraph)
    // wait on this instead — see openFile in the plugin.
    this._opening = path5;
    this._openPromise = this.openFile(f)
      .catch((e) => console.error("Book Reader: could not open the book", e))
      .finally(() => { if (this._opening === path5) this._opening = null; });
  }
  async onOpen() {
    this.buildDOM();
    this._resizeObs = new ResizeObserver(() => {
      let _a;
      if (!this.bookHtml) return;
      if (this.containerEl.offsetParent === null) return;
      const w = this.areaEl.clientWidth;
      if (!w) return;
      if (Math.abs(w - (this._laidOutWidth || 0)) < 8) return;
      this._setRelayout(true);
      window.clearTimeout(this._resizeTimer);
      const delay = ((_a = this.app) == null ? void 0 : _a.isMobile) ? 500 : 260;
      this._resizeTimer = window.setTimeout(() => {
        const fw = this.areaEl.clientWidth;
        if (!fw || this.containerEl.offsetParent === null) {
          this._setRelayout(false);
          return;
        }
        if (Math.abs(fw - (this._laidOutWidth || 0)) < 8) {
          this._setRelayout(false);
          return;
        }
        this.repaginate();
      }, delay);
    });
    this._resizeObs.observe(this.areaEl);
    const recheck = () => {
      if (this._layoutWidthStale()) this.repaginate();
    };
    this.registerEvent(this.app.workspace.on("layout-change", recheck));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf === this.leaf) recheck();
    }));
  }
  async openFile(file) {
    let _a2, _b;
    // A later open wins. Switching books while a big one is still being taken
    // apart used to let the first one finish last and replace the second.
    const token = this._openToken = (this._openToken || 0) + 1;
    const stale = () => token !== this._openToken || this.file !== file;
    this.file = file;
    this.ext = file.extension === "epub" ? "epub" : file.extension === "fb2" ? "fb2" : file.extension === "md" ? "md" : "pdf";
    this.bookHtml = "";
    this.tocItems = [];
    (_b = (_a2 = this._pdfLazy) == null ? void 0 : _a2.destroy) == null ? void 0 : _b.call(_a2);
    this._pdfLazy = null;
    this._pdfOutline = null;
    this.titleEl.setText(erBookTitle(file));
    this.applyVars();
    this.areaEl.empty();
    const loading = this.areaEl.createDiv("er-loading");
    loading.createDiv("er-spin");
    const loadText = loading.createDiv("er-loading-text");
    loadText.setText(__ertr("Загружаем книгу…"));
    await new Promise((r) => window.requestAnimationFrame(r));
    await new Promise((r) => window.requestAnimationFrame(r));
    try {
      if (this.ext === "epub") {
        this.bookHtml = await extractEpub(file, this.app);
        this._pdfOutline = erEpubNav.get(file.path) || null;
      } else if (this.ext === "fb2") {
        this.bookHtml = await extractFb2(file, this.app);
      } else if (this.ext === "md") {
        this.bookHtml = await extractMarkdown(file, this.app);
      } else {
        const res = await extractPdf(file, this.app, this.plugin.settings, (i, n) => loadText.setText(__ertr("Готовим книгу… {0}%", Math.round(i / n * 100))), erPdfEarly(this, file, stale));
        this.bookHtml = res.html;
        this._pdfLazy = res.lazy;
        this._pdfOutline = res.outline;
      }
      if (stale()) return;
      this.tocItems = buildTocItems(this.bookHtml, this._pdfOutline);
      this.buildTocPanel();
      await this.plugin.refreshProgress();
      await this.plugin.refreshHighlights();
      if (stale()) return;
      const saved = this.plugin.getProgress(file.path);
      const pct = (saved == null ? void 0 : saved.pct) != null ? saved.pct : 0;
      const keep = erPdfEarlyDone(this, file);
      if (keep != null) await this.paginate(0, keep);
      else await this.paginate(pct, saved == null ? void 0 : saved.block);
      this.buildSettPanel();
      this._maybePromptBookNote(file);
      this._sessionSec = 0;
      this._running = false;
      this._goalNotified = this.plugin.getTodaySeconds() >= this.plugin.getGoalSeconds();
      updateGoalBar(this);
      updateTimerBtn(this);
    } catch (e) {
      console.error("Elton Reader:", e);
      new Notice(__ertr("Ошибка при открытии файла"));
      // Say it on the page too. The spinner used to stay on «Загружаем
      // книгу…» for ever, which looks like a hang rather than a failure.
      if (this.areaEl && this.file === file) {
        this.areaEl.empty();
        const box = this.areaEl.createDiv("er-load-error");
        box.createDiv().setText(__ertr("Не удалось открыть книгу."));
        box.createDiv().setText(String((e && e.message) || e));
      }
    }
  }
  // On a book's first open, offer to pick its index note (from the configured
  // book-notes folder). Asks once per book; afterwards use the field/button in
  // the info panel. Skipped entirely unless a dedicated folder is configured, so
  // it never pops up over the whole vault for users who don't use this feature.
  _maybePromptBookNote(file) {
    if (file && file.extension === "md") return;
    const s = this.plugin.settings;
    if (!file) return;
    if (!s.bookNoteLinks) s.bookNoteLinks = {};
    if (!s.bookNotePrompted) s.bookNotePrompted = {};
    const action = bookNoteAction(s, file.path);
    if (action === "linked" || action === "prompted") return;
    if (action === "auto") {
      s.bookNotePrompted[file.path] = true;
      this.plugin.ensureBookNote(file).then((note) => {
        if (note) new Notice(__ertr("Заметка книги создана: {0}", note.basename));
        if (this.panelOpen === "settings") this.buildSettPanel();
      });
      return;
    }
    new BookSetupModal(this.app, this.plugin, file, () => {
      if (this.panelOpen === "settings") this.buildSettPanel();
    }).open();
  }
  async paginate(savedPct = 0, savedBlock = null) {
    this.areaEl.empty();
    let w = this.areaEl.clientWidth, a = 0;
    while (!w && a < 60) {
      await new Promise((r) => window.requestAnimationFrame(r));
      w = this.areaEl.clientWidth;
      a++;
    }
    if (!w) return;
    this.areaEl.addClass("er-booting");
    erShowVeil(this);
    window.setTimeout(() => {
      if (this.areaEl) this.areaEl.removeClass("er-booting");
      erHideVeil(this);
    }, 3e3);
    const [, total] = await this.pager.build(
      this.areaEl,
      this.bookHtml,
      this.plugin.settings,
      0
    );
    this._laidOutWidth = this.pager.builtWidth || w;
    const hasBlock = typeof savedBlock === "number" && savedBlock >= 0;
    const targetSpread = hasBlock ? this.pager.spreadForBlock(savedBlock) : Math.round(savedPct * Math.max(0, total - 1));
    this._renderFlowHighlights();
    const [cur, tot] = this.pager.jumpTo(targetSpread);
    this.updateUI(cur, tot);
    erRevealWhenSettled(this);
    if (hasBlock) this._flashBlock(savedBlock);
  }
  // Briefly highlight the paragraph the reader resumed at, so the eye finds it.
  // Jump to a paragraph as soon as the book is laid out. Called from a backlink,
  // which arrives while the book is still being built, so it waits for the
  // pager rather than assuming the text is already there. Gives up after a few
  // seconds instead of polling forever on a book that failed to open.
  // Land on a PDF page once the book is laid out. Pages are marked in the flow
  // with data-pdf-page-no, so this is a lookup rather than a guess.
  jumpToPdfPageWhenReady(pageNo) {
    let tries = 0;
    const tick = () => {
      const flow = this.pager && this.pager.flow;
      if (flow && this.pager.total) {
        const el = flow.querySelector(`[data-pdf-page-no="${pageNo}"]`);
        if (el) {
          const x = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
          const stride = this.pager.sw / (this.pager.cols || 1);
          const spread = Math.floor(Math.round(x / stride) / (this.pager.cols || 1));
          const [cur, tot] = this.pager.jumpTo(Math.max(0, Math.min(spread, this.pager.total - 1)));
          (this.updateUI || this._updateUI).call(this, cur, tot);
          return;
        }
      }
      if (++tries > 40) return;
      window.setTimeout(tick, 100);
    };
    tick();
  }
  jumpToBlockWhenReady(idx) {
    let tries = 0;
    const tick = () => {
      if (this.pager && this.pager.flow && this.pager.total) {
        const [cur, tot] = this.pager.jumpTo(this.pager.spreadForBlock(idx));
        (this.updateUI || this._updateUI).call(this, cur, tot);
        this._flashBlock(idx);
        return;
      }
      if (++tries > 40) return;
      window.setTimeout(tick, 100);
    };
    tick();
  }
  _flashBlock(idx) {
    const el = this.pager.blockEl(idx);
    if (!el) return;
    el.classList.remove("er-resume-flash");
    void el.offsetWidth;
    el.classList.add("er-resume-flash");
    window.setTimeout(() => el.classList.remove("er-resume-flash"), 2400);
  }
  // Paint every occurrence of the search term in the book, so that after jumping
  // to a result the eye finds the actual word instead of hunting through the
  // paragraph.
  //
  // Uses the CSS Custom Highlight API: it draws over existing text WITHOUT
  // touching the DOM. Wrapping matches in <span> would have been the obvious
  // route, but inserting elements into the flow re-runs the column layout and
  // would disturb both pagination and the reader's own <mark> highlights.
  _markFound(query) {
    markFoundIn(this, query);
  }
  _clearFound() {
    clearFoundIn(this);
  }
  // Jump to the page holding a global block index, flash it, save the position.
  // Used by the TOC panel.
  _jumpToBlock(block, flash = true) {
    if (!this.bookHtml || typeof block !== "number") return;
    const [cur, tot] = this.pager.jumpTo(this.pager.spreadForBlock(block));
    this.updateUI(cur, tot);
    if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    if (flash) this._flashBlock(block);
  }
  // Repaginate preserving current reading % (used on settings change)
  // Show/hide the "re-laying out" veil: the page blurs and a spinner fades in.
  // The class goes on the ROOT, not on the reading area, because the spinner has
  // to sit OUTSIDE the blurred element — a child of it would be blurred too.
  _setRelayout(on) {
    if (!on) erHideVeil(this);
    const root = this.contentEl;
    if (!root) return;
    if (on && !this._spinEl) {
      this._spinEl = root.createDiv("er-relayout-spin");
      this._spinEl.createDiv("er-relayout-ring");
    }
    root.toggleClass("er-relayouting", !!on);
  }
  async repaginate() {
    if (!this.bookHtml) return;
    if (!this.areaEl.clientWidth || this.containerEl.offsetParent === null) return;
    const savedBlock = this.pager.currentBlockIndex();
    const savedPct = this.pager.currentPct;
    this._setRelayout(true);
    erShowVeil(this);
    try {
      await new Promise((r) => window.requestAnimationFrame(r));
      this.areaEl.empty();
      const [, total] = await this.pager.build(
        this.areaEl,
        this.bookHtml,
        this.plugin.settings,
        0
      );
      this._laidOutWidth = this.pager.builtWidth || this.areaEl.clientWidth;
      const w = this.areaEl.clientWidth;
      this._staleGaveUpAt = w && Math.abs(w - (this.pager.builtWidth || 0)) >= 8 ? this.pager.builtWidth : null;
      const targetSpread = typeof savedBlock === "number" && savedBlock >= 0 ? this.pager.spreadForBlock(savedBlock) : Math.round(savedPct * Math.max(0, total - 1));
      this._renderFlowHighlights();
      const [cur, tot] = this.pager.jumpTo(targetSpread);
      this.updateUI(cur, tot);
      if (this._tocRender) this._tocRender();
      this._findCorpus = null;
      if (this._foundQuery) this._markFound(this._foundQuery);
    } finally {
      window.requestAnimationFrame(() => this._setRelayout(false));
    }
  }
  // ── DOM ──────────────────────────────────────────────
  buildDOM() {
    const root = this.contentEl;
    root.empty();
    root.addClass("er-view");
    this.applyVars();
    const pb = root.createDiv("er-pbar");
    this.pbarFill = pb.createDiv("er-pbar-fill");
    const top = root.createDiv("er-top");
    const lb = top.createDiv("er-ibtn");
    svgIcon(lb, "arrow-left");
    lb.addEventListener("click", () => this.plugin.openLibrary());
    this.titleEl = top.createDiv("er-top-title");
    this.titleEl.setText("Book Reader");
    const tr = top.createDiv("er-top-right");
    this.timerBtnEl = tr.createDiv("er-timerbtn");
    this.timerIconEl = this.timerBtnEl.createDiv("er-timer-ic");
    this.timerLabelEl = this.timerBtnEl.createDiv("er-timer-label");
    this.timerResetEl = this.timerBtnEl.createDiv("er-timer-reset");
    svgIcon(this.timerResetEl, "rotate-ccw");
    this.timerResetEl.setAttribute("aria-label", __ertr("Сбросить таймер"));
    this.timerResetEl.addEventListener("click", (e) => {
      e.stopPropagation();
      resetTimerSession(this);
    });
    this.timerBtnEl.setAttribute("aria-label", __ertr("Таймер: сколько осталось до цели — старт/пауза"));
    this.timerBtnEl.addEventListener("click", () => toggleTimerSession(this));
    updateTimerBtn(this);
    erTtsButton(this, tr);
    erAiButton(this, tr);
    erTopLoc(this, tr, root);
    const saveBtn = tr.createDiv("er-ibtn");
    svgIcon(saveBtn, "save");
    saveBtn.setAttribute("aria-label", __ertr("Сохранить позицию"));
    saveBtn.addEventListener("click", () => this.saveNow());
    const refBtn = tr.createDiv("er-ibtn");
    svgIcon(refBtn, "refresh");
    refBtn.setAttribute("aria-label", __ertr("Обновить (перерисовать вид)"));
    refBtn.addEventListener("click", () => this.reloadView());
    const hlBtn = tr.createDiv("er-ibtn");
    svgIcon(hlBtn, "highlighter");
    hlBtn.setAttribute("aria-label", __ertr("Выделения"));
    hlBtn.addEventListener("click", () => this.togglePanel("highlights"));
    const findBtn = tr.createDiv("er-ibtn");
    svgIcon(findBtn, "search");
    findBtn.setAttribute("aria-label", __ertr("Поиск по книге"));
    findBtn.addEventListener("click", () => {
      this.togglePanel("find");
      if (this._findInput) erAutoFocus(this._findInput, 60);
    });
    const tocBtn = tr.createDiv("er-ibtn");
    svgIcon(tocBtn, "list");
    tocBtn.setAttribute("aria-label", __ertr("Оглавление"));
    tocBtn.addEventListener("click", () => this.togglePanel("toc"));
    const setBtn = tr.createDiv("er-ibtn");
    svgIcon(setBtn, "sliders");
    setBtn.setAttribute("aria-label", __ertr("Настройки чтения"));
    setBtn.addEventListener("click", () => new ReadSettingsModal(this.app, this).open());
    this.areaEl = root.createDiv("er-area");
    if ((this.plugin.settings.navMode || "buttons") === "click") root.addClass("er-navclick");
    const bot = root.createDiv("er-bot");
    const pv = bot.createDiv("er-navbtn");
    svgIcon(pv, "chevron-left");
    pv.addEventListener("click", () => this.nav("prev"));
    const center = bot.createDiv("er-bot-center");
    this.locEl = center.createDiv("er-loc er-loc-clickable");
    this.locEl.setAttribute("aria-label", __ertr("Перейти к странице"));
    this.locEl.addEventListener("click", () => {
      if (!this.file || !this.pager || !this.pager.total) return;
      new GoToPageModal(this.app, this.pager.total, this.pager.spread, (n) => {
        const [cur, tot] = this.pager.jumpTo(n - 1);
        this.updateUI(cur, tot);
        this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
      }).open();
    });
    this.pctEl = center.createDiv("er-pct");
    this.pctEl.setText("0%");
    const nx = bot.createDiv("er-navbtn");
    svgIcon(nx, "chevron-right");
    nx.addEventListener("click", () => this.nav("next"));
    this.overlayEl = root.createDiv("er-overlay");
    this.overlayEl.addEventListener("click", () => this.closePanel());
    this.settPan = root.createDiv("er-panel");
    this.tocPan = root.createDiv("er-panel er-toc-panel");
    this.hlPan = root.createDiv("er-panel er-toc-panel er-hl-panel");
    this.findPan = root.createDiv("er-panel er-toc-panel er-find-panel");
    this.buildSettPanel();
    this.buildTocPanel();
    this.buildHlPanel();
    this.buildFindPanel();
    this.hlPopup = root.createDiv("er-hl-popup");
    this.buildHlPopup();
    this.registerDomEvent(docOf(this.containerEl), "selectionchange", () => this._scheduleSelCheck());
    this.areaEl.addEventListener("mouseup", () => this._scheduleSelCheck());
    this.areaEl.addEventListener("click", (e) => { if (erNoteLinkClick(this, e)) return;
      const refEl = e.target instanceof HTMLElement ? e.target.closest("[data-er-ref]") : null;
      if (refEl) {
        e.preventDefault();
        e.stopPropagation();
        if (followFootnote(this, refEl.getAttribute("data-er-ref"))) return;
      }
      const imgEl = e.target instanceof HTMLElement ? e.target.closest("img") : null;
      if (imgEl && imgEl.src) {
        e.preventDefault();
        openImageLightbox(imgEl.currentSrc || imgEl.src, this.app, imgEl);
        return;
      }
      const span = e.target instanceof HTMLElement ? e.target.closest(".er-hl") : null;
      if (span) {
        e.preventDefault();
        this._openHlEdit(span.getAttribute("data-hl-id"));
      } else if (this._editHlId) {
        this._hideHlPopup();
      }
    });
    this.registerDomEvent(docOf(this.containerEl), "mousedown", (e) => {
      if (!this._editHlId) return;
      const t = e.target;
      if (this.hlPopup.contains(t)) return;
      if (t instanceof HTMLElement && t.closest(".er-hl")) return;
      this._hideHlPopup();
    });
    this.areaEl.addEventListener("contextmenu", (e) => {
      const sel = selOf(this.areaEl);
      const text = sel && !sel.isCollapsed && sel.rangeCount ? sel.toString() : "";
      const flow = this.pager.flow;
      if (!text.trim() || !flow || !flow.contains(sel.getRangeAt(0).startContainer)) return;
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((it) => it.setTitle(__ertr("Скопировать как цитату")).setIcon("text-quote").onClick(async () => {
        this._hideHlPopup();
        const md = quoteMarkdown(this.plugin, { text, block: this._pendingSel && this._pendingSel.block, page: this._pendingSel && this._pendingSel.page }, this.file);
        const okc = md && await copyToClipboard(md);
        new Notice(okc ? __ertr("Цитата скопирована ✓ — вставьте в любую заметку") : __ertr("Не удалось скопировать"));
      }));
      menu.addItem((it) => it.setTitle(__ertr("Создать новую заметку")).setIcon("file-plus").onClick(() => {
        this._hideHlPopup();
        createNoteFromSelection(this.app, this.plugin, text, this.file);
      }));
      menu.addItem((it) => it.setTitle(__ertr("Текстом в заметку книги")).setIcon("text-quote").onClick(() => {
        this._hideHlPopup();
        sendQuoteToBookNote(this, { text, block: this._pendingSel && this._pendingSel.block });
      }));
      menu.addSeparator();
      HL_COLORS.forEach((c) => {
        menu.addItem((it) => it.setTitle(__ertr("Выделить: {0}", c.name)).onClick(() => {
          this._onSelectionCheck();
          this._applyPopupColor(c.id);
        }));
      });
      menu.showAtMouseEvent(e);
    });
    this.registerDomEvent(docOf(this.containerEl), "keydown", (e) => {
      let _a;
      if (!this.bookHtml)
        return;
      const ae = docOf(this.areaEl).activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable))
        return;
      if (!this.containerEl.contains(ae) && this.app.workspace.getActiveViewOfType(this.constructor) !== this)
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Scrolling mode: up/down (and j/k, for vim hands) move a few lines, as
      // in any web page — they used to jump a whole screen, which made it
      // impossible to nudge the text a little. Pages and Space still page.
      if (this.pager && this.pager.scrollMode && ["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) {
        e.preventDefault();
        const line = (Number(this.plugin.settings.fontSize) || 18) * (Number(this.plugin.settings.lineHeight) || 1.7);
        this.pager.clip.scrollBy({ top: (e.key === "ArrowDown" || e.key === "j" ? 1 : -1) * line * 3, behavior: "smooth" });
        return;
      }
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "j", "l"].includes(e.key)) {
        e.preventDefault();
        this.nav("next");
      }
      if (["ArrowLeft", "ArrowUp", "PageUp", "k", "h"].includes(e.key)) {
        e.preventDefault();
        this.nav("prev");
      }
      if (e.key === "a" && !e.shiftKey) { e.preventDefault(); erToggleAutoScroll(this); }
    });
    let sx = 0, sy = 0, _swipeDir = null, _longPress = false, _lpTimer = null, _hadSel = false;
    this.areaEl.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) {
        _swipeDir = "v";
        return;
      }
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      _swipeDir = null;
      _longPress = false;
      const sel = selOf(this.areaEl);
      _hadSel = !!(sel && !sel.isCollapsed);
      window.clearTimeout(_lpTimer);
      _lpTimer = window.setTimeout(() => {
        _longPress = true;
      }, 350);
    }, { passive: true });
    this.areaEl.addEventListener("touchmove", (e) => {
      if (_swipeDir !== null) {
        if (_swipeDir === "h") e.preventDefault();
        return;
      }
      const dx = Math.abs(e.touches[0].clientX - sx);
      const dy = Math.abs(e.touches[0].clientY - sy);
      if (dx < 8 && dy < 8) return;
      window.clearTimeout(_lpTimer);
      const sel = selOf(this.areaEl);
      if (_longPress || _hadSel || sel && !sel.isCollapsed) {
        _swipeDir = "v";
        return;
      }
      _swipeDir = dx > dy ? "h" : "v";
      if (_swipeDir === "h") e.preventDefault();
    }, { passive: false });
    this.areaEl.addEventListener("touchend", (e) => {
      window.clearTimeout(_lpTimer);
      if (_swipeDir !== "h") return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 44)
        dx < 0 ? this.nav("next") : this.nav("prev");
    }, { passive: true });
    this.areaEl.addEventListener("click", (e) => handleAreaNavClick(this, e));
    erStylusMarker(this);
    this.areaEl.addEventListener("mouseover", (e) => erBacklinkHover(this, e));
    if (!this._applyFullscreen && this.plugin.settings.desktopNoBars === true) erDesktopNoBars(this, true);
    const armImmersive = () => {
      if (!this.plugin.settings.immersive) {
        root.removeClass("er-immersive");
        return;
      }
      root.removeClass("er-immersive");
      window.clearTimeout(this._immTimer);
      this._immTimer = window.setTimeout(() => {
        if (this.bookHtml) root.addClass("er-immersive");
      }, 2600);
    };
    root.addEventListener("pointermove", armImmersive);
    root.addEventListener("pointerdown", armImmersive);
    root.addEventListener("touchstart", armImmersive, { passive: true });
    armImmersive();
  }
  applyVars() {
    const t = erTheme(this.plugin.settings);
    const s = this.plugin.settings;
    const r = this.contentEl;
    r.style.setProperty("--er-bg", t.bg);
    r.style.setProperty("--er-text", t.text);
    r.style.setProperty("--er-ui", t.ui);
    r.style.setProperty("--er-border", t.border);
    r.style.setProperty("--er-accent", t.accent);
    r.style.setProperty("--er-muted", t.muted);
    r.toggleClass("er-eink", s.einkMode === true);
    erApplyTexture(this.app, s, this.areaEl);
  }
  nav(dir) {
    if (!this.bookHtml)
      return;
    const _now = Date.now();
    if (this._lastNavTs && _now - this._lastNavTs < 90) return;
    this._lastNavTs = _now;
    this._lastActive = _now;
    if (this._layoutWidthStale()) {
      this.repaginate().then(() => this._navNow(dir)).catch(() => this._navNow(dir));
      return;
    }
    this._navNow(dir);
  }
  _navNow(dir) {
    if (!this.bookHtml) return;
    this._hideHlPopup();
    const [cur, total] = dir === "next" ? this.pager.next() : this.pager.prev();
    this.updateUI(cur, total);
    this.plugin.saveProgress(this.file.path, cur, total, this.pager.currentBlockIndex());
  }
  // True when the page is laid out for a different width than it is displayed at.
  // `builtWidth` is what the paginator actually measured, so this compares like
  // with like — the width the caller *intended* can differ from it.
  _layoutWidthStale() {
    if (!this.bookHtml || !this.pager || !this.pager.builtWidth) return false;
    if (this.containerEl.offsetParent === null) return false;
    if (this._staleGaveUpAt === this.pager.builtWidth) return false;
    const now = this.areaEl.clientWidth;
    if (!now) return false;
    return Math.abs(now - this.pager.builtWidth) >= 8;
  }
  // Manual save (💾 button / command): persist the current spot AND drop a
  // restore point, with a clear confirmation — like "saved" in a game.
  saveNow() {
    if (!this.bookHtml || !this.file) {
      new Notice(__ertr("Нечего сохранять"));
      return;
    }
    const cur = this.pager.spread, tot = this.pager.total;
    const pct = this.plugin.saveNow(this.file.path, cur, tot, this.pager.currentBlockIndex());
    new Notice(__ertr("Сохранено ✓ — {0}%", pct));
    if (this.panelOpen === "settings") this._renderHistory();
  }
  exportHighlights(evt) {
    if (!this.file) {
      new Notice(__ertr("Книга не открыта"));
      return;
    }
    const list = erMergeHlGroups(enrichHighlights(this, this.plugin.getHighlights(this.file.path)));
    exportHighlightsMenu(this.app, this.plugin, this.file, list, evt);
  }
  updateUI(cur, total) {
    if (cur == null && this.pager) cur = this.pager.spread;
    if (total == null && this.pager) total = this.pager.total;
    // В прокрутке листать нечего: стрелки и клик по краю там ничего не делают
    // и только занимают место. Класс снимает их из вида одним правилом.
    if (this.contentEl) this.contentEl.toggleClass("er-scrolling", !!(this.pager && this.pager.scrollMode));
    const pct = total > 0 ? Math.round((cur + 1) / total * 100) : 0;
    this.pbarFill.style.width = `${pct}%`;
    const bookPage = currentBookPage(this);
    const where = this.ext === "pdf" ? __ertr("Разворот {0} из {1}", cur + 1, total) : `${cur + 1} / ${total}`;
    this.locEl.setText(bookPage ? __ertr("стр. {0}", bookPage) + " \xB7 " + where : where);
    this.pctEl.setText(`${pct}%`);
    if (this.topLocEl) this.topLocEl.setText(`${cur + 1} / ${total} · ${pct}%`);
    erPaintTimeLeft(this);
    renderVisibleFigures(this);
  }
  // ── Settings panel ────────────────────────────────────
  buildSettPanel() {
    const p = this.settPan;
    p.empty();
    p.createDiv("er-pan-title").setText(__ertr("Настройки чтения"));
    const sec = (l) => p.createDiv("er-pan-sec").setText(l);
    sec(__ertr("Тема"));
    const thRow = p.createDiv("er-theme-row");
    ["auto", "dark", "light", "sepia", "eink"].forEach((t) => {
      const btn = thRow.createDiv(`er-theme-btn er-theme-${t}`);
      btn.setText({ auto: __ertr("Как в Obsidian"), dark: __ertr("Тёмная"), light: __ertr("Светлая"), sepia: __ertr("Сепия"), eink: "E-ink" }[t]);
      if (this.plugin.settings.theme === t)
        btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.theme = t;
        await this.plugin.saveAll();
        this.applyVars();
        if (this.bookHtml)
          await this.repaginate();
        thRow.querySelectorAll(".er-theme-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    sec(__ertr("Размер шрифта"));
    const szRow = p.createDiv("er-sz-row");
    const szM = szRow.createDiv("er-sz-btn");
    szM.setText("A−");
    const szL = szRow.createDiv("er-sz-label");
    szL.setText(`${this.plugin.settings.fontSize}px`);
    const szP = szRow.createDiv("er-sz-btn");
    szP.setText("A+");
    const changeSz = async (d) => {
      const nv = this.plugin.settings.fontSize + d;
      if (nv < 12 || nv > 36)
        return;
      this.plugin.settings.fontSize = nv;
      szL.setText(`${nv}px`);
      await this.plugin.saveAll();
      if (this.bookHtml)
        await this.repaginate();
    };
    szM.addEventListener("click", () => changeSz(-1));
    szP.addEventListener("click", () => changeSz(1));
    const advHdr = p.createDiv("er-pan-adv-hdr");
    advHdr.createSpan({ cls: "er-pan-adv-ic", text: "⚙️" });
    advHdr.createSpan({ cls: "er-pan-adv-lbl", text: __ertr("Доп. настройки") });
    const advCar = advHdr.createSpan({ cls: "er-pan-adv-car", text: "›" });
    const advWrap = p.createDiv("er-pan-adv");
    const adv = advWrap.createDiv("er-pan-adv-body");
    const secA = (l) => adv.createDiv("er-pan-sec").setText(l);
    if (this.plugin.settings.readerAdvOpen) {
      advWrap.addClass("er-pan-adv-on");
      advCar.addClass("er-pan-adv-car-on");
    }
    advHdr.addEventListener("click", async () => {
      const on = advWrap.hasClass("er-pan-adv-on");
      advWrap.toggleClass("er-pan-adv-on", !on);
      advCar.toggleClass("er-pan-adv-car-on", !on);
      this.plugin.settings.readerAdvOpen = !on;
      await this.plugin._saveLocalData();
    });
    secA(__ertr("Шрифт"));
    const ffRow = adv.createDiv("er-ff-row");
    erFontChoices(this.plugin.settings).forEach(([f, label, fam]) => {
      const btn = ffRow.createDiv("er-ff-btn");
      btn.setText(label);
      btn.style.fontFamily = fam;
      if (this.plugin.settings.fontFamily === f)
        btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.fontFamily = f;
        await this.plugin.saveAll();
        if (this.bookHtml)
          await this.repaginate();
        ffRow.querySelectorAll(".er-ff-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    secA(__ertr("Межстрочный"));
    const lhRow = adv.createDiv("er-lh-row");
    [1.4, 1.6, 1.8, 2.1].forEach((lh) => {
      const btn = lhRow.createDiv("er-lh-btn");
      btn.setText(`${lh}`);
      if (Math.abs(this.plugin.settings.lineHeight - lh) < 0.05)
        btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.lineHeight = lh;
        await this.plugin.saveAll();
        if (this.bookHtml)
          await this.repaginate();
        lhRow.querySelectorAll(".er-lh-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    secA(__ertr("Страниц рядом"));
    const colRow = adv.createDiv("er-col-row");
    [["1", __ertr("1 страница")], ["2", __ertr("2 страницы")]].forEach(([v, label]) => {
      const btn = colRow.createDiv("er-col-btn");
      btn.setText(label);
      if (this.plugin.settings.columns === v)
        btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.columns = v;
        await this.plugin.saveAll();
        if (this.bookHtml)
          await this.repaginate();
        colRow.querySelectorAll(".er-col-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    buildReaderExtraSettings(this, adv);
    this._histRow = panelSection(this, p, {
      label: __ertr("Вернуться к месту"),
      emoji: "\u{1F516}",
      settingKey: "readerHistOpen"
    }).createDiv("er-hist-row");
    this._renderHistory();
    sec(__ertr("Действия"));
    const actRow = p.createDiv("er-act-row");
    const mkAct = (label, ic, fn) => {
      const b = actRow.createDiv("er-act-btn");
      iconLabel(b, ic, label);
      b.addEventListener("click", fn);
    };
    mkAct(__ertr("Справка"), "info", () => new InfoModal(this.app, this.plugin, this.file).open());
  }
  _renderHistory() {
    const c = this._histRow;
    if (!c) return;
    c.empty();
    const list = this.file ? this.plugin.getBackups(this.file.path) : [];
    const badge = c.parentElement && c.parentElement._erCount;
    if (badge) badge.setText(list.length ? String(list.length) : "");
    if (!list.length) {
      c.createDiv("er-hist-empty").setText(__ertr("Точек пока нет"));
      return;
    }
    [...list].reverse().slice(0, 14).forEach((snap) => {
      const chip = c.createDiv("er-hist-chip");
      if (snap.manual) chip.addClass("er-hist-manual");
      const d = new Date(snap.ts || snap.lastRead || Date.now());
      const mark = snap.manual ? "\u{1F4BE} " : "";
      chip.setText(`${mark}${snap.percent}% \xB7 ${d.toLocaleString(erLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      chip.addEventListener("click", () => {
        if (!this.bookHtml) return;
        const total = this.pager.total;
        let target;
        if (typeof snap.block === "number" && snap.block >= 0) {
          target = this.pager.spreadForBlock(snap.block);
        } else {
          const frac = typeof snap.pct === "number" ? snap.pct : (snap.percent || 0) / 100;
          target = Math.round(frac * Math.max(0, total - 1));
        }
        const [cur, tot] = this.pager.jumpTo(target);
        this.updateUI(cur, tot);
        if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
        this.closePanel();
        new Notice(__ertr("Вернулись к {0}%", snap.percent));
      });
    });
  }
  buildTocPanel() {
    this._tocRender = buildTocPanelFor(this, this.tocPan, {
      close: () => this.closePanel(),
      jump: (b) => this._jumpToBlock(b)
    });
  }
  // Find text anywhere in the open book. Results are block indexes — the same
  // anchor reading position and the contents list use — so a hit lands correctly
  // whatever the window width or column count.
  buildFindPanel() {
    buildFindPanelFor(this, this.findPan, {
      close: () => this.closePanel(),
      jump: (b) => this._jumpToBlock(b)
    });
  }
  togglePanel(name) {
    if (this.panelOpen === name) {
      this.closePanel();
      return;
    }
    this._hideHlPopup();
    if (name === "highlights") this.buildHlPanel();
    if (name === "settings") this._renderHistory();
    if (name === "toc" && this._tocRender) this._tocRender();
    this.panelOpen = name;
    this.settPan.classList.toggle("er-panel-open", name === "settings");
    this.tocPan.classList.toggle("er-panel-open", name === "toc");
    this.findPan.classList.toggle("er-panel-open", name === "find");
    this.hlPan.classList.toggle("er-panel-open", name === "highlights");
    if (this.findPan) this.findPan.classList.toggle("er-panel-open", name === "find");
    if (name === "toc" && this._tocRender) this._tocRender();
    this.overlayEl.classList.add("er-overlay-on");
  }
  closePanel() {
    this.panelOpen = null;
    this.settPan.classList.remove("er-panel-open");
    this.tocPan.classList.remove("er-panel-open");
    this.hlPan.classList.remove("er-panel-open");
    if (this.findPan) this.findPan.classList.remove("er-panel-open");
    this.overlayEl.classList.remove("er-overlay-on");
  }
  // ── Refresh: save progress + rebuild cleanly (kills stray column) ──────
  async reloadView() {
    if (!this.bookHtml || !this.file) {
      new Notice(__ertr("Нечего обновлять"));
      return;
    }
    const cur = this.pager.spread, tot = this.pager.total;
    this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    const pct = this.pager.currentPct;
    this._hideHlPopup();
    this.closePanel();
    await this.plugin.refreshHighlights();
    this._lastWidth = this.areaEl.clientWidth;
    await this.paginate(pct);
    new Notice(__ertr("Обновлено"));
  }
  // ── Highlights: render / select / navigate ────────────
  _renderFlowHighlights() { erRenderFlowHighlights(this); }
  _scheduleSelCheck() {
    window.clearTimeout(this._selTimer);
    this._selTimer = window.setTimeout(() => this._onSelectionCheck(), 60);
  }
  _onSelectionCheck() {
    if (this._editHlId) return;
    const sel = selOf(this.areaEl);
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this._carry = null;
      this._hideHlPopup();
      return;
    }
    const flow = this.pager.flow;
    if (!flow || !flow.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      this._hideHlPopup();
      return;
    }
    // Never past the page on screen (see erVisibleTextRange).
    if (erClampSelectionToPage(this, sel)) return;
    const range = sel.getRangeAt(0);
    const parts = erSelectionParts(flow, range);
    if (!parts.length) {
      this._hideHlPopup();
      return;
    }
    this._pendingSel = { ...parts[0], parts, text: parts.map((p) => p.text).join("\n\n") };
    erPaintSelection(this, range);
    this._showHlPopup(erSelectionRect(range, this.areaEl));
  }
  buildHlPopup() {
    const pop = this.hlPopup;
    pop.empty();
    pop.addEventListener("mousedown", (e) => e.preventDefault());
    addBarButtons(this, pop);
    addMoreBtn(this, pop);
  }
  _applyPopupColor(colorId) {
    let _a, _b;
    if (this._editHlId && this.file) {
      const id = this._editHlId;
      const gids = this.plugin.hlGroupIds(this.file.path, id);
      this.plugin.setHighlightColor(this.file.path, id, colorId);
      erSendToColorNotes(this, this.plugin.getHighlights(this.file.path).filter((h) => gids.includes(h.id)));
      (_a = this.pager.flow) == null ? void 0 : _a.querySelectorAll(gids.map((x) => `[data-hl-id="${x}"]`).join(",")).forEach((s) => {
        s.style.background = hlColorCss(colorId);
      });
      if (this.panelOpen === "highlights") this.buildHlPanel();
      this._hideHlPopup();
      return;
    }
    if (this._pendingSel && this.file) {
      const parts = this._pendingSel.parts || [this._pendingSel];
      // Several paragraphs, one quote: the parts share a group id.
      const group = parts.length > 1 ? "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : null;
      const made = [];
      for (const part of parts) {
        const id = this._createHighlight(group ? { ...part, group } : part, colorId);
        if (id) made.push({ ...part, id, color: colorId, group });
      }
      (_b = selOf(this.areaEl)) == null ? void 0 : _b.removeAllRanges();
      if (this.panelOpen === "highlights") this.buildHlPanel();
      if (this.plugin.settings.quotesToBookNote === true && made.length) {
        for (const hl of erMergeHlGroups(made)) sendQuoteToBookNote(this, hl);
      }
      erSendToColorNotes(this, made);
    }
    this._hideHlPopup();
  }
  // Save a highlight for a pending selection and paint it in the text.
  // Returns its id — the comment button needs it, because commenting on a plain
  // selection has to create the highlight first (otherwise the note had nothing
  // to attach to and silently vanished).
  _createHighlight(sel, colorId) {
    if (!sel || !this.file) return null;
    const id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const hl = { id, color: colorId, text: sel.text, block: sel.block, occ: sel.occ, pre: sel.pre, post: sel.post, created: Date.now() };
    if (sel.group) hl.group = sel.group;
    this.plugin.addHighlight(this.file.path, hl);
    const blocks = this.pager.flow.querySelectorAll("p,h1,h2,h3,h4");
    const block = blocks[hl.block];
    if (block) {
      const t = block.textContent;
      const loc = locateHl(t, hl);
      if (loc) wrapBlockRange(block, loc.start, loc.start + loc.len, { id: hl.id, color: hlColorCss(colorId) });
    }
    erRenderStopMark(this);
    return id;
  }
  _currentHl() {
    if (this._editHlId && this.file) {
      const id = this._editHlId;
      const hl = this.plugin.getHighlightQuotes(this.file.path).find((h) => h.id === id || (h.ids && h.ids.includes(id)));
      if (hl) return { id: hl.id, text: hl.text || "", block: hl.block, color: hl.color, comment: hl.comment };
    }
    if (this._pendingSel) return { text: this._pendingSel.text || "", block: this._pendingSel.block, color: null };
    return null;
  }
  _openHlEdit(id) {
    let _a;
    const span = (_a = this.pager.flow) == null ? void 0 : _a.querySelector(`[data-hl-id="${id}"]`);
    if (!span) return;
    this._pendingSel = null;
    this._editHlId = id;
    erShowHlComment(this);
    this._showHlPopup(span.getBoundingClientRect());
  }
  _unwrapHighlight(id) {
    const flow = this.pager.flow;
    if (!flow) return;
    const ids = Array.isArray(id) ? id : [id];
    flow.querySelectorAll(ids.map((x) => `[data-hl-id="${x}"]`).join(",")).forEach((span) => {
      const parent2 = span.parentNode;
      while (span.firstChild) parent2.insertBefore(span.firstChild, span);
      parent2.removeChild(span);
      parent2.normalize();
    });
    erRenderStopMark(this);
  }
  _showHlPopup(rect) {
    const pop = this.hlPopup;
    if (!this._editHlId) { pop.querySelector(".er-hl-cmtview")?.remove(); pop.removeClass("er-hl-popup-cmt"); }
    const sel = !this._editHlId && selOf(this.areaEl);
    pop.toggleClass("er-hl-can-carry", !!(sel && sel.rangeCount && erSelectionAtPageEnd(this, sel.getRangeAt(0))));
    pop.classList.add("er-hl-popup-on");
    positionHlPopup(this, rect, 210, 44);
  }
  _hideHlPopup() {
    erClearPaintedSelection();
    this._pendingSel = null;
    this._editHlId = null;
    if (this.hlPopup) this.hlPopup.classList.remove("er-hl-popup-on");
  }
  goToHighlight(id) {
    const flow = this.pager.flow;
    const span = flow == null ? void 0 : flow.querySelector(`[data-hl-id="${id}"]`);
    // Нарисованного выделения может не быть: в PDF страницы подставляются по
    // мере чтения, и краска ложится только на те, что уже показаны. Раньше в
    // этом случае клик по строке в списке отвечал «Выделение не найдено» и
    // никуда не вёл. Абзац известен всегда — по нему и прыгаем, как на телефоне.
    if (!span) {
      const hl = this.file ? this.plugin.getHighlights(this.file.path).find((h) => h.id === id) : null;
      if (!hl || typeof hl.block !== "number") {
        new Notice(__ertr("Выделение не найдено"));
        return;
      }
      const [c2, t2] = this.pager.jumpTo(this.pager.spreadForBlock(hl.block));
      this.updateUI(c2, t2);
      if (this.file) this.plugin.saveProgress(this.file.path, c2, t2, this.pager.currentBlockIndex());
      this.closePanel();
      window.requestAnimationFrame(() => {
        const later = this.pager.flow?.querySelector(`[data-hl-id="${id}"]`);
        if (later) {
          later.classList.add("er-hl-flash");
          window.setTimeout(() => later.classList.remove("er-hl-flash"), 1200);
        }
      });
      return;
    }
    const rel = span.getBoundingClientRect().left - flow.getBoundingClientRect().left;
    const spread = Math.max(0, Math.floor(rel / this.pager.sw + 1e-3));
    const [cur, tot] = this.pager.jumpTo(spread);
    this.updateUI(cur, tot);
    if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    this.closePanel();
    span.classList.add("er-hl-flash");
    window.setTimeout(() => span.classList.remove("er-hl-flash"), 1200);
  }
  buildHlPanel() {
    const p = this.hlPan;
    p.empty();
    p.createDiv("er-pan-title").setText(__ertr("Выделения"));
    const list = this.file ? this.plugin.getHighlightQuotes(this.file.path) : [];
    if (!list.length) {
      p.createDiv("er-toc-empty").setText(__ertr("Пока нет выделений.\nВыделите текст и выберите цвет."));
      return;
    }
    const exp = p.createDiv("er-hl-export");
    iconLabel(exp, "download", __ertr("Экспортировать в заметки ({0})", list.length));
    exp.setAttribute("aria-label", __ertr("Экспортировать все выделения"));
    exp.addEventListener("click", (e) => this.exportHighlights(e));
    const wrap = p.createDiv("er-toc-list");
    list.forEach((hl) => {
      const item = wrap.createDiv("er-hl-item");
      const dot = item.createDiv("er-hl-dot");
      dot.style.background = hlColorCss(hl.color);
      const body = item.createDiv("er-hl-body");
      const txt = body.createDiv("er-hl-text");
      txt.setText(hl.text.length > 160 ? hl.text.slice(0, 160) + "…" : hl.text);
      if (hl.comment) body.createDiv("er-hl-comment").setText(hl.comment);
      const showHlMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.file) return;
        const menu = new Menu();
        menu.addItem((it) => it.setTitle(__ertr("Создать заметку")).setIcon("file-plus").onClick(() => {
          createNoteFromSelection(this.app, this.plugin, hl.text, this.file, { extra: hlCommentMd(hl), color: hl.color, hl });
        }));
        menu.addItem((it) => it.setTitle(__ertr("Текстом в заметку книги")).setIcon("text-quote").onClick(() => {
          sendQuoteToBookNote(this, hl);
        }));
        menu.showAtMouseEvent(e);
      };
      const more = item.createDiv("er-hl-more");
      svgIcon(more, "more");
      more.setAttribute("aria-label", __ertr("Ещё"));
      more.addEventListener("click", showHlMenu);
      const del = item.createDiv("er-hl-del");
      svgIcon(del, "trash");
      del.setAttribute("aria-label", __ertr("Удалить"));
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this.file) return;
        this.plugin.removeHighlight(this.file.path, hl.id);
        this._unwrapHighlight(hl.ids || hl.id);
        this.buildHlPanel();
      });
      item.addEventListener("click", () => this.goToHighlight(hl.id));
      item.addEventListener("contextmenu", showHlMenu);
    });
  }
  async onClose() {
    erToggleAutoScroll(this, false);
    erTtsStop(this);
    erDailyLogFlush(this.plugin);
    erHideVeil(this);
    let _a;
    stopReadingTimer(this);
    window.clearTimeout(this._immTimer);
    (_a = this._resizeObs) == null ? void 0 : _a.disconnect();
    window.clearTimeout(this._resizeTimer);
    window.clearTimeout(this._selTimer);
    window.clearTimeout(this._revealT);
    clearFoundIn(this);
  }
};
// ── Library categories ───────────────────────────────────────────────────────
// Categories come from the SUBFOLDERS books already live in — people organise
// their library on disk, so this needs no tagging or setup to be useful on day
// one. Books sitting directly in the books folder fall under "Без папки".
// The book's folder, relative to the books folder. "" when it sits directly in
// it. Used by the folder chips, which are a tree rather than a flat list.
function bookRelFolder(bookPath, booksFolder) {
  const base = erPath(booksFolder);
  let rel = erPath(bookPath);
  if (base && rel.startsWith(base + "/")) rel = rel.slice(base.length + 1);
  const i = rel.lastIndexOf("/");
  return i > 0 ? rel.slice(0, i) : "";
}
function bookCategoryOf(bookPath, booksFolder) {
  const base = erPath(booksFolder);
  let rel = erPath(bookPath);
  if (base && rel.startsWith(base + "/")) rel = rel.slice(base.length + 1);
  const i = rel.indexOf("/");
  return i > 0 ? rel.slice(0, i) : "";
}
// Reading state of a book, for the status chips.
function bookStatusOf(prog) {
  if (!prog || !prog.lastRead) return "new";
  const pct = typeof prog.percent === "number" ? prog.percent : 0;
  if (pct >= 98) return "done";
  if (pct > 0) return "reading";
  return "new";
}
// The chips shown above the grid: status groups first (what you're doing right
// now matters more than where a file sits), then one chip per folder. Empty
// groups are dropped so the bar only ever offers filters that lead somewhere.
function buildLibChips(files, booksFolder, getProgress, getTags, activeChip) {
  const statuses = { reading: 0, new: 0, done: 0 };
  const folders = /* @__PURE__ */ new Map();
  const tags = /* @__PURE__ */ new Map();
  for (const f of files) {
    statuses[bookStatusOf(getProgress(f.path))]++;
    const cat = bookCategoryOf(f.path, booksFolder);
    folders.set(cat, (folders.get(cat) || 0) + 1);
    for (const t of (getTags ? getTags(f.path) : [])) tags.set(t, (tags.get(t) || 0) + 1);
  }
  const chips = [{ id: "all", label: __ertr("Все"), count: files.length }];
  if (statuses.reading) chips.push({ id: "status:reading", label: __ertr("Читаю"), count: statuses.reading });
  if (statuses.new) chips.push({ id: "status:new", label: __ertr("Не начатые"), count: statuses.new });
  if (statuses.done) chips.push({ id: "status:done", label: __ertr("Прочитано"), count: statuses.done });
  // Reader-assigned categories come before folders: they were chosen on purpose,
  // whereas the folder is just wherever the file happens to sit.
  for (const [t, n] of [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))) {
    chips.push({ id: `tag:${t}`, label: t, count: n });
  }
  const named = [...folders.entries()].filter(([c]) => c).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  // Subfolders of whichever folder is open, so a deep library can be walked
  // instead of only sliced at the top level. Counted the same way, and only
  // when there is more than one — a single child chip just repeats its parent.
  const openFolder = activeChip && activeChip.startsWith("folder:") ? activeChip.slice(7) : null;
  const subs = /* @__PURE__ */ new Map();
  if (openFolder) {
    for (const f of files) {
      const rel = bookRelFolder(f.path, booksFolder);
      if (rel !== openFolder && rel.startsWith(openFolder + "/")) {
        const next = openFolder + "/" + rel.slice(openFolder.length + 1).split("/")[0];
        subs.set(next, (subs.get(next) || 0) + 1);
      }
    }
  }
  // A lone folder chip would just duplicate "Все" — only show folders when they
  // actually divide the library.
  if (named.length > 1 || (named.length === 1 && folders.has(""))) {
    for (const [cat, n] of named) {
      chips.push({ id: `folder:${cat}`, label: cat, count: n });
      // The open folder's children slot in directly beneath it, labelled with
      // only their own name so the row does not fill with repeated prefixes.
      if (openFolder === cat && subs.size > 1) {
        for (const [sub, sn] of [...subs.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))) {
          chips.push({ id: `folder:${sub}`, label: "└ " + sub.slice(cat.length + 1), count: sn, sub: true });
        }
      }
    }
    if (folders.get("")) chips.push({ id: "folder:", label: __ertr("Без папки"), count: folders.get("") });
  }
  return chips;
}
// Apply the active chip + the search box.
function filterLibBooks(files, chipId, query, booksFolder, getProgress, getTags) {
  const needle = (query || "").trim().toLowerCase();
  return files.filter((f) => {
    if (needle && !f.basename.toLowerCase().includes(needle)) return false;
    if (!chipId || chipId === "all") return true;
    if (chipId.startsWith("status:")) return bookStatusOf(getProgress(f.path)) === chipId.slice(7);
    if (chipId.startsWith("folder:")) {
      // Prefix, not equality: choosing "История" should also show the books in
      // "История/Древний мир". A reader asked for exactly this — folders with
      // everything nested inside them.
      const want = chipId.slice(7);
      const have = bookRelFolder(f.path, booksFolder);
      return want === "" ? have === "" : (have === want || have.startsWith(want + "/"));
    }
    if (chipId.startsWith("tag:")) return (getTags ? getTags(f.path) : []).includes(chipId.slice(4));
    return true;
  });
}
// Categories a reader has assigned to a book (always an array, never undefined).
function bookTagsOf(settings, bookPath) {
  const m = (settings && settings.bookTags) || {};
  const v = m[bookPath];
  return Array.isArray(v) ? v.filter(Boolean) : [];
}
// Every category used anywhere, for the "pick or type" dropdown.
function allBookTags(settings) {
  const m = (settings && settings.bookTags) || {};
  const set = /* @__PURE__ */ new Set();
  for (const k of Object.keys(m)) for (const t of (Array.isArray(m[k]) ? m[k] : [])) if (t) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}
// "Психология, Бизнес" → ["Психология","Бизнес"]; also accepts #hashtags.
function parseBookTags(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/^#+/, "").trim())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i);
}
// Pick a folder of the vault (books folder from the library's hint).
const ErFolderPicker = class extends FuzzySuggestModal {
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.setPlaceholder(__ertr("Папка с книгами…"));
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder && f.path !== "/");
  }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onPick(f); }
};
const LibraryModal = class extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  async onOpen() {
    const { contentEl, modalEl } = this;
    // The class goes on the CONTAINER as well as the dialog. Every sizing rule
    // in the stylesheet is written as `.er-modal-lib .modal` — a descendant
    // selector — and with the class only on modalEl (which IS `.modal`) not one
    // of them ever matched: the library kept Obsidian's default dialog size, so
    // it never went full-bleed on a phone and never took the wide desktop size
    // either. As a view the class already sits on the container, which is why
    // the same stylesheet behaved differently there.
    this.containerEl.addClass("er-modal-lib");
    modalEl.addClass("er-modal-lib");
    contentEl.addClass("er-lib");
    // No status-bar measurement here: the library is a leaf on every platform
    // now, and a leaf's edges belong to Obsidian.
    const t = erLibTheme(this.plugin.settings);
    modalEl.style.setProperty("--er-lib-bg", t.bg);
    modalEl.style.setProperty("--er-lib-text", t.text);
    modalEl.style.setProperty("--er-lib-card", t.ui);
    modalEl.style.setProperty("--er-lib-border", t.border);
    modalEl.style.setProperty("--er-lib-accent", t.accent);
    modalEl.style.setProperty("--er-lib-muted", t.muted);
    const hdr = contentEl.createDiv("er-lib-hdr");
    const brand = hdr.createDiv("er-lib-brand");
    brand.createDiv("er-lib-logo").setText("\u{1F4DA}");
    const hw = brand.createDiv("er-lib-hw");
    hw.createDiv("er-lib-title").setText(__ertr("\u0411\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0430"));
    hw.createDiv("er-lib-sub").setText("Book Reader by Elton Labs");
    // Primary action: import .pdf / .epub / .fb2 into the books folder. Sits at the
    // head of the right-hand cluster, away from the cover-size +/- so the two "+"
    // never read as one control. Files can also be dropped anywhere on the modal.
    const addBtn = hdr.createDiv("er-lib-add");
    addBtn.setAttribute("role", "button");
    addBtn.setAttribute("tabindex", "0");
    addBtn.setAttribute("aria-label", __ertr("\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043D\u0438\u0433\u0443"));
    svgIcon(addBtn, "plus");
    addBtn.createSpan({ cls: "er-lib-add-label", text: __ertr("\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043D\u0438\u0433\u0443") });
    const doPick = () => this._pickBooks();
    addBtn.addEventListener("click", doPick);
    addBtn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doPick(); } });
    this._setupDropZone();
    const search = hdr.createDiv("er-lib-search");
    const sIc = search.createDiv("er-lib-search-ic");
    svgIcon(sIc, "search");
    const input = search.createEl("input", { cls: "er-lib-search-input", attr: { type: "text", placeholder: __ertr("\u041F\u043E\u0438\u0441\u043A \u043A\u043D\u0438\u0433\u0438\u2026"), spellcheck: "false" } });
    const count = hdr.createDiv("er-lib-count");
    // Manual size control — adjust how big the covers are, live.
    const sizeWrap = hdr.createDiv("er-lib-size");
    const applySize = () => {
      const px = Math.max(110, Math.min(300, this.plugin.settings.libCoverSize || 176));
      if (this._grid) this._grid.style.gridTemplateColumns = `repeat(auto-fill,minmax(${px}px,1fr))`;
    };
    const mkSz = (label, d, aria) => {
      const b = sizeWrap.createDiv("er-lib-szbtn");
      b.setText(label);
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", async () => {
        this.plugin.settings.libCoverSize = Math.max(110, Math.min(300, (this.plugin.settings.libCoverSize || 176) + d));
        applySize();
        window.requestAnimationFrame(() => this._sizeCovers());
        await this.plugin.saveAll();
      });
    };
    mkSz("−", -28, __ertr("Меньше обложки"));
    mkSz("+", 28, __ertr("Больше обложки"));
    await this.plugin.refreshProgress();
    const folder = erPath(this.plugin.settings.booksFolder);
    // Match on "<folder>/" — a bare startsWith would also pull in a sibling
    // folder that merely shares the prefix (e.g. "Books" catching "Books archive").
    const prefix = folder ? folder + "/" : "";
    const files = this.app.vault.getFiles().filter(
      (f) => (f.extension === "epub" || f.extension === "pdf" || f.extension === "fb2") && (prefix === "" || f.path.startsWith(prefix))
    );
    if (!files.length) {
      const e = contentEl.createDiv("er-lib-empty");
      e.createDiv("er-lib-empty-icon").setText("\u{1F5C2}");
      e.createDiv("er-lib-empty-text").setText(__ertr("\u041D\u0435\u0442 \u043A\u043D\u0438\u0433"));
      e.createDiv("er-lib-empty-hint").setText(folder || __ertr("\u0412\u0441\u0435 \u043F\u0430\u043F\u043A\u0438 vault"));
      // Give an empty shelf a direct way to fill itself, not just the header button.
      const cta = e.createDiv("er-lib-empty-add");
      cta.setAttribute("role", "button");
      cta.setAttribute("tabindex", "0");
      svgIcon(cta, "plus");
      cta.createSpan({ text: __ertr("\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043D\u0438\u0433\u0443") });
      const goCta = () => this._pickBooks();
      cta.addEventListener("click", goCta);
      cta.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goCta(); } });
      return;
    }
    files.sort((a, b) => {
      let _a, _b, _c, _d;
      const pa = (_b = (_a = this.plugin.getProgress(a.path)) == null ? void 0 : _a.lastRead) != null ? _b : 0;
      const pb = (_d = (_c = this.plugin.getProgress(b.path)) == null ? void 0 : _c.lastRead) != null ? _d : 0;
      const qa = this.plugin.isBookPinned(a.path) ? 1 : 0, qb = this.plugin.isBookPinned(b.path) ? 1 : 0;
      if (qa !== qb) return qb - qa;
      return pb !== pa ? pb - pa : a.basename.localeCompare(b.basename, "ru");
    });
    // No books folder and a lot of files: everything with the right extension is
    // being shown — scanned receipts, attachments, the lot ("он думает что все
    // pdf это книги"). Say so once, with the way out right there.
    if (!folder && files.length > 20 && !this.plugin.settings.libFolderHintDismissed) {
      const hint = contentEl.createDiv("er-lib-hint");
      hint.createDiv("er-lib-hint-text").setText(__ertr("Показаны все PDF, EPUB и FB2 из хранилища ({0}). Выберите папку с книгами — библиотека станет быстрее, а лишние файлы пропадут.", files.length));
      const row = hint.createDiv("er-lib-hint-btns");
      const pickB = row.createEl("button", { text: __ertr("Выбрать папку") });
      pickB.addClass("mod-cta");
      pickB.addEventListener("click", () => {
        new ErFolderPicker(this.app, async (fld) => {
          this.plugin.settings.booksFolder = fld.path;
          await this.plugin.saveAll();
          this._refresh();
        }).open();
      });
      const later = row.createEl("button", { text: __ertr("Оставить все") });
      later.addEventListener("click", async () => {
        this.plugin.settings.libFolderHintDismissed = true;
        await this.plugin._saveLocalData();
        hint.remove();
      });
    }
    // Category chips — folders the books live in, plus reading-state groups.
    const chipsRow = contentEl.createDiv("er-lib-chips");
    const grid = contentEl.createDiv("er-lib-grid");
    const plural = (n) => {
      const a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) return __ertr("\u043A\u043D\u0438\u0433");
      if (b > 1 && b < 5) return __ertr("\u043A\u043D\u0438\u0433\u0438");
      if (b === 1) return __ertr("\u043A\u043D\u0438\u0433\u0430");
      return __ertr("\u043A\u043D\u0438\u0433");
    };
    this._grid = grid;
    applySize();
    const getProg = (p) => this.plugin.getProgress(p);
    const getTags = (p) => bookTagsOf(this.plugin.settings, p);
    // Remember the last chip across sessions, but fall back to "\u0412\u0441\u0435" if that
    // category no longer exists (folder renamed, last book in it finished\u2026).
    let active = this.plugin.settings.libCategory || "all";
    // The chip list depends on which chip is active \u2014 an open folder shows its
    // subfolders \u2014 so it is built with the remembered choice in hand, then the
    // choice is validated against what actually came back.
    let chips = buildLibChips(files, folder, getProg, getTags, active);
    if (!chips.some((c) => c.id === active)) {
      active = "all";
      chips = buildLibChips(files, folder, getProg, getTags, active);
    }
    const render = (q) => {
      if (this._thumbIO) { this._thumbIO.disconnect(); this._thumbIO = null; }
      grid.empty();
      const shown = filterLibBooks(files, active, q, folder, getProg, getTags);
      count.setText(`${shown.length} ${plural(shown.length)}`);
      if (!shown.length) {
        grid.createDiv("er-lib-noresult").setText(__ertr("\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E"));
        return;
      }
      for (const f of shown) this.renderCard(grid, f);
      // Re-check sizing across the modal's open animation (themes animate it, so an
      // early measurement is wrong) \u2014 the smart fallback only acts if needed.
      window.requestAnimationFrame(() => this._sizeCovers());
      [120, 350, 650].forEach((t) => window.setTimeout(() => this._sizeCovers(), t));
    };
    // The row is rebuilt on every pick, not just re-highlighted: opening a
    // folder adds its subfolders to the row, and leaving it takes them away.
    const drawChips = () => {
      chips = buildLibChips(files, folder, getProg, getTags, active);
      chipsRow.empty();
      // Only worth a chip bar when there is more than one thing to choose.
      if (chips.length <= 1) { chipsRow.addClass("er-hidden"); return; }
      chipsRow.removeClass("er-hidden");
      chips.forEach((c) => {
        const el = chipsRow.createDiv("er-lib-chip");
        if (c.sub) el.addClass("er-lib-chip-sub");
        el.createSpan({ text: c.label });
        el.createSpan({ cls: "er-lib-chip-n", text: String(c.count) });
        if (c.id === active) el.addClass("er-lib-chip-on");
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        const pick = async () => {
          active = c.id;
          this.plugin.settings.libCategory = c.id;
          await this.plugin._saveLocalData();
          drawChips();
          render(input.value);
        };
        el.addEventListener("click", pick);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
        });
      });
    };
    drawChips();
    input.addEventListener("input", () => render(input.value));
    render("");
    this._coverResizeObs = new ResizeObserver(() => this._sizeCovers());
    this._coverResizeObs.observe(grid);
    erAutoFocus(input, 60);
    erBlurOnTapOutside(this.contentEl, input);
  }
  // Open the OS file picker for the three supported formats, then import.
  _pickBooks() {
    const doc = docOf(this.contentEl);
    const inp = doc.createElement("input");
    inp.type = "file";
    inp.accept = ".pdf,.epub,.fb2,application/pdf,application/epub+zip";
    inp.multiple = true;
    inp.addClass("er-hidden");
    inp.addEventListener("change", async () => {
      const files = Array.from(inp.files || []);
      inp.remove();
      await this._importBooks(files);
    });
    doc.body.appendChild(inp);
    inp.click();
  }
  // Drag & drop OS files anywhere on the modal. Bound once to modalEl (which
  // survives a grid refresh), with a dashed overlay shown only while dragging.
  _setupDropZone() {
    if (this._dropBound) return;
    this._dropBound = true;
    const host = this.modalEl;
    const overlay = host.createDiv("er-lib-drop");
    const inner = overlay.createDiv("er-lib-drop-inner");
    svgIcon(inner, "plus");
    inner.createSpan({ text: __ertr("Отпустите файлы, чтобы добавить их в библиотеку") });
    let depth = 0;
    const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    host.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; host.addClass("er-lib-dragging"); });
    host.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    host.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) host.removeClass("er-lib-dragging"); });
    host.addEventListener("drop", async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      host.removeClass("er-lib-dragging");
      // Drop a FOLDER and `files` contains an entry that is not a file at all.
      // Asking it for its bytes either rejects or, on Windows, blocks the whole
      // renderer — which is the likeliest explanation for "drag and drop makes
      // Obsidian crash". The DataTransfer items know which is which, so ask
      // them and keep only real files.
      const items = Array.from(e.dataTransfer.items || []);
      const dropped = Array.from(e.dataTransfer.files || []);
      let usable = dropped;
      if (items.length === dropped.length && typeof items[0]?.webkitGetAsEntry === "function") {
        usable = dropped.filter((f, i) => {
          const entry = items[i].webkitGetAsEntry();
          return !entry || entry.isFile;
        });
        const folders = dropped.length - usable.length;
        if (folders) new Notice(__ertr("Папки пропущены — перетащите сами файлы книг ({0})", folders));
      }
      await this._importBooks(usable);
    });
  }
  // Where to drop an imported book. The configured "books folder" wins; if it is
  // empty (the common case), land the file where most books already live so it
  // joins the existing library instead of the vault root. Only falls back to root
  // when the vault has no books yet.
  _targetDir() {
    const set = erPath(this.plugin.settings.booksFolder || "");
    if (set) return set;
    const exts = ["pdf", "epub", "fb2"];
    const counts = new Map();
    for (const f of this.app.vault.getFiles()) {
      if (!exts.includes(f.extension)) continue;
      const dir = f.parent && f.parent.path && f.parent.path !== "/" ? f.parent.path : "";
      counts.set(dir, (counts.get(dir) || 0) + 1);
    }
    let best = "", bestN = -1;
    for (const [dir, n] of counts) if (n > bestN) { best = dir; bestN = n; }
    return best;
  }
  // A collision-free destination path inside the books folder (or vault root),
  // sanitised for the filesystem and suffixed " (1)", " (2)"… if the name is taken.
  _freeBookPath(dir, name) {
    const clean = (name || "book").replace(/[\\/:*?"<>|\n\r\t]/g, "_").trim() || "book";
    const dot = clean.lastIndexOf(".");
    const base = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : "";
    // Every constructed vault path goes through normalizePath (erPath). This one
    // was the exception, and it is the one that matters most: it is built from a
    // filename the operating system handed over, which can carry a trailing
    // space, a doubled slash or decomposed Unicode (macOS hands over NFD, the
    // vault stores NFC). Comparing an un-normalised path against the vault's
    // index can miss an existing file, and writing one can land somewhere other
    // than where it was checked for.
    const join = (b) => erPath((dir ? dir + "/" : "") + b + ext);
    let p = join(base), i = 1;
    while (this.app.vault.getAbstractFileByPath(p)) p = join(`${base} (${i++})`);
    return p;
  }
  // Import a list of picked/dropped File objects: keep only supported formats,
  // write each into the books folder as a real vault file, then refresh the grid.
  async _importBooks(fileList) {
    const exts = ["pdf", "epub", "fb2"];
    const all = fileList || [];
    // Take the extension off the END of the name rather than off the first dot,
    // and tolerate the stray whitespace some file managers hand over, so a name
    // like "The Art of War (2nd ed.).pdf " is still recognised as a PDF. The
    // MIME type is a second opinion for the two formats that have one.
    const extOf = (f) => {
      // `name` is normally there, but Electron also exposes the full `path`, and
      // a File that arrives without a usable name would otherwise be rejected as
      // "unsupported format" while sitting right there on disk.
      const raw = (f && f.name) || (f && f.path ? String(f.path).split(/[\\/]/).pop() : "");
      const n = String(raw || "").trim().replace(/[.\s]+$/, "");
      const dot = n.lastIndexOf(".");
      const e = dot > 0 ? n.slice(dot + 1).toLowerCase() : "";
      if (exts.includes(e)) return e;
      const mime = String((f && f.type) || "").toLowerCase();
      if (mime === "application/pdf") return "pdf";
      if (mime === "application/epub+zip") return "epub";
      return e;
    };
    const picked = all.filter((f) => exts.includes(extOf(f)));
    const rejected = all.filter((f) => !exts.includes(extOf(f)));
    if (rejected.length) {
      // Say WHAT was rejected and what the reader was seen as, not just that
      // something was. A reader reported files being refused as "unsupported"
      // that plainly were supported, and the old message gave nothing to go on —
      // no name, no extension, nothing to put in a bug report.
      const detail = rejected.slice(0, 5).map((f) => {
        const nm = (f && f.name) || (f && f.path) || "?";
        return `${nm} [${extOf(f) || "—"}${f && f.type ? ", " + f.type : ""}]`;
      }).join("; ");
      console.warn("Book Reader: rejected on import —", rejected.map((f) => ({
        name: f && f.name, path: f && f.path, type: f && f.type, size: f && f.size, seenAs: extOf(f),
      })));
      new Notice(__ertr("Не подошли ({0}): {1}. Поддерживаются PDF, EPUB и FB2.", rejected.length, detail), 10000);
    }
    if (!picked.length) {
      if (!rejected.length) new Notice(__ertr("Файлы не выбраны"));
      return;
    }
    const dir = this._targetDir();
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => {});
    }
    let ok = 0;
    const errors = [];
    for (const f of picked) {
      try {
        const buf = await f.arrayBuffer();
        await this.app.vault.createBinary(this._freeBookPath(dir, f.name), buf);
        ok++;
      } catch (err) {
        console.warn("Book Reader: could not import", f && f.name, err);
        errors.push(f.name);
      }
    }
    if (ok) new Notice(__ertr("Добавлено книг: {0}", ok) + (rejected.length ? " · " + __ertr("пропущено: {0}", rejected.length) : ""));
    if (errors.length) new Notice(__ertr("Не удалось добавить: {0}", errors.join(", ")));
    if (ok) this._refresh();
  }
  // Rebuild the library in place after books were added, without a modal flash.
  _refresh() {
    if (this._thumbIO) { this._thumbIO.disconnect(); this._thumbIO = null; }
    if (this._coverResizeObs) { try { this._coverResizeObs.disconnect(); } catch { /* optional step; a failure here must not interrupt reading */ } }
    this.contentEl.empty();
    this.onOpen();
  }
  _sizeCovers() {
    if (!this._grid) return;
    // The cover div gets its 2:3 box from CSS `aspect-ratio:2/3`. This is only a
    // FALLBACK: if a webview ever ignores aspect-ratio (height comes out far from
    // 2:3), pin an explicit px height; otherwise leave the CSS value alone so a
    // mis-timed early measurement can't squash a correct cover.
    this._grid.querySelectorAll(".er-lib-cover").forEach((c) => {
      const w = c.offsetWidth;
      if (!w) return;
      const h = c.offsetHeight;
      if (h < w * 1.35 || h > w * 1.65) c.style.setProperty("height", Math.round(w * 1.5) + "px", "important");
      else c.style.removeProperty("height");
    });
  }
  renderCard(grid, file) {
    let _a, _b;
    const prog = this.plugin.getProgress(file.path);
    const pct = (_a = prog == null ? void 0 : prog.percent) != null ? _a : 0;
    const card = grid.createDiv("er-lib-card");
    // Named on hover: in a narrow sidebar the card shows its cover only.
    card.setAttribute("aria-label", erBookTitle(file));
    const cover = card.createDiv("er-lib-cover");
    const fits = ((_b = this.plugin.settings.coverFits) != null ? _b : (this.plugin.settings.coverFits = {}));
    if (fits[file.path] === "fill") cover.addClass("er-fit-fill");
    const ph = cover.createDiv("er-lib-ph");
    ph.createDiv("er-lib-ph-ext").setText(file.extension.toUpperCase());
    ph.createDiv("er-lib-ph-init").setText(erBookTitle(file).slice(0, 2).toUpperCase());
    // Covers are made when a card comes near the screen, not for every card at
    // once. Without a books folder the library lists every PDF in the vault, and
    // rendering the first page of hundreds of them in a row is what froze
    // Obsidian for a reader with a large vault.
    if (typeof IntersectionObserver === "function") {
      if (!this._thumbIO) {
        this._thumbIO = new IntersectionObserver((entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            this._thumbIO.unobserve(en.target);
            const go = en.target._erLoadThumb;
            en.target._erLoadThumb = null;
            if (go) go();
          }
        }, { root: null, rootMargin: "600px 0px" });
      }
      card._erLoadThumb = () => this.loadThumb(file, cover, ph);
      this._thumbIO.observe(card);
    } else {
      this.loadThumb(file, cover, ph);
    }
    if (this.plugin.isBookPinned(file.path)) {
      card.addClass("er-lib-pinned");
      const pin = cover.createDiv("er-lib-pin");
      pin.setAttribute("aria-label", __ertr("Закреплена"));
      svgIcon(pin, "bookmark");
    }
    // Hover button: switch this cover between "\u0432\u043F\u0438\u0441\u0430\u0442\u044C" (whole cover visible,
    // contain) and "\u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C" (fill the box, cover). Applied as inline
    // background-size so it survives theme CSS.
    const fitBtn = cover.createDiv("er-lib-fitbtn");
    fitBtn.setAttribute("aria-label", __ertr("\u0412\u0438\u0434 \u043E\u0431\u043B\u043E\u0436\u043A\u0438"));
    const applyFit = () => {
      const fill = cover.hasClass("er-fit-fill");
      cover.style.setProperty("background-size", fill ? "cover" : "contain", "important");
      svgIcon(fitBtn, fill ? "cover-fit" : "cover-fill");
    };
    applyFit();
    fitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nowFill = !cover.hasClass("er-fit-fill");
      cover.toggleClass("er-fit-fill", nowFill);
      if (nowFill) fits[file.path] = "fill"; else delete fits[file.path];
      applyFit();
      this.plugin.saveAll();
    });
    if (pct > 0) {
      const s = cover.createDiv("er-lib-strip");
      s.createDiv("er-lib-strip-fill").style.width = `${pct}%`;
    }
    const info = card.createDiv("er-lib-info");
    info.createDiv("er-lib-book-title").setText(erBookTitle(file));
    const meta = info.createDiv("er-lib-book-meta");
    if (prog == null ? void 0 : prog.lastRead) {
      meta.setText(`${pct}% \xB7 ${new Date(prog.lastRead).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`);
    } else {
      meta.setText(__ertr("\u041D\u0435 \u0447\u0438\u0442\u0430\u043B\u0430\u0441\u044C"));
    }
    // Действия с книгой. Кнопка нужна отдельно от правой кнопки мыши: на
    // телефоне правой кнопки нет, а удалять книгу с телефона просили тоже.
    const bookMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();
      // «Читать» тут не нужно: по карточке и так открывается книга, а меню
      // и без того длинное — в него добавляет свои пункты сам Obsidian.
      // Two or three books being read right now, always first in the list.
      const pinned = this.plugin.isBookPinned(file.path);
      menu.addItem((it) => it.setTitle(pinned ? __ertr("Открепить") : __ertr("Закрепить вверху")).setIcon(pinned ? "pin-off" : "pin").onClick(async () => {
        await this.plugin.setBookPinned(file.path, !pinned);
        this._refresh();
      }));
      menu.addSeparator();
      addBookFileMenu(this.app, menu, file);
      menu.addSeparator();
      menu.addItem((it) => it.setTitle(__ertr("Удалить книгу")).setIcon("trash").onClick(() => {
        deleteBookFromVault(this.app, this.plugin, file, () => this._refresh());
      }));
      menu.showAtMouseEvent(e);
    };
    card.addEventListener("contextmenu", bookMenu);
    const moreBtn = cover.createDiv("er-lib-morebtn");
    moreBtn.setAttribute("aria-label", __ertr("Действия с книгой"));
    svgIcon(moreBtn, "more");
    moreBtn.addEventListener("click", bookMenu);
    card.addEventListener("click", () => {
      this.close();
      this.plugin.openFile(file);
    });
  }
  async loadThumb(file, coverEl, ph) {
    // A cover named in the book's note wins over everything.
    //
    // Asked for plainly: "хотелось бы для каждой книги выбирать обложку через
    // метаданные книжной заметки — по дефолту та, что в документе, а если в
    // заметке есть свойство с обложкой, брать её. Я просто люблю когда всё
    // красиво, а у некоторых книг обложки оставляют желать лучшего." Читается
    // свойство `cover` (или `обложка`) — ссылка, путь к файлу в хранилище или
    // вики-ссылка. Ничего не кэшируется: правка свойства видна сразу.
    const own = this.coverFromBookNote(file);
    if (own) { this.showImg(coverEl, ph, own); return; }
    // Cached cover → show immediately (this is the common path once generated).
    if (this.plugin.thumbCache[file.path]) {
      this.showImg(coverEl, ph, this.plugin.thumbCache[file.path]);
      return;
    }
    // Generate uncached covers ONE AT A TIME through a shared promise chain.
    // Firing a dozen `makePdfThumb`s at once (each loads a whole PDF — some are
    // 30–75 MB — and each used to call saveAll()) overloaded the single PDF
    // worker and raced a dozen concurrent data.json writes, which left the whole
    // library with blank covers when many books were added. Serialising fixes it.
    this._thumbQueue = (this._thumbQueue || Promise.resolve()).then(async () => {
      if (this.plugin.thumbCache[file.path]) { this.showImg(coverEl, ph, this.plugin.thumbCache[file.path]); return; }
      try {
        const url = file.extension === "pdf" ? await this.makePdfThumb(file)
          : file.extension === "fb2" ? await this.makeFb2Thumb(file)
          : await this.makeEpubThumb(file);
        if (!url) return;
        this.plugin.thumbCache[file.path] = url;
        this._thumbDirty = true;
        this.showImg(coverEl, ph, url);
      } catch (e) {
        console.warn("Book Reader: cover failed for", file.path, e);
      }
    }).then(() => {
      // Persist once the chain goes idle (debounced), not after every single
      // cover — avoids racing/oversized writes to data.json.
      window.clearTimeout(this._thumbSaveT);
      this._thumbSaveT = window.setTimeout(() => { if (this._thumbDirty) { this._thumbDirty = false; this.plugin._saveThumbCache(); } }, 800);
    });
    return this._thumbQueue;
  }
  // The cover a reader chose in the book's note, or nothing.
  //
  // Three shapes are accepted, because all three are what people actually write
  // in frontmatter: a plain URL, a path to an image inside the vault, and a
  // [[wiki link]]. Anything that does not resolve simply falls through to the
  // cover embedded in the book — the point is to override it, never to break it.
  coverFromBookNote(file) {
    try {
      const name = bookNoteLinkFor(this.plugin, file);
      if (!name) return null;
      const note = resolveBookNote(this.app, name);
      if (!note) return null;
      const fm = this.app.metadataCache.getFileCache(note)?.frontmatter;
      if (!fm) return null;
      const raw = fm.cover ?? fm.обложка ?? fm.Cover ?? fm.Обложка;
      const val = String(Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();
      if (!val) return null;
      if (/^https?:\/\//i.test(val)) return val;
      const inner = (val.match(/^!?\[\[([^\]|#]+)/) || [])[1] || val;
      const img = this.app.metadataCache.getFirstLinkpathDest(inner.trim(), note.path)
        || this.app.vault.getAbstractFileByPath(erPath(inner.trim()));
      return img instanceof TFile ? this.app.vault.getResourcePath(img) : null;
    } catch { return null; }
  }
  showImg(coverEl, ph, src) {
    if (!src) return;
    ph.addClass("er-hidden");
    // Paint the cover as the DIV's background-image (no <img> element). Themes
    // can't restyle a div's background the way they hijack `img`, so the cover
    // always fills the 2:3 box (height pinned in px by _sizeCovers). "background-
    // position:center top" keeps the title visible if the art is taller than 2:3.
    coverEl.style.setProperty("background-image", `url("${src.replace(/"/g, '\\"')}")`, "important");
    coverEl.addClass("er-cover-img");
    // "contain" = the WHOLE cover is always visible inside the 2:3 box (никогда
    // не обрезается), with the neutral box colour as a thin letterbox if the art
    // isn't exactly 2:3. "fill" mode (the toggle) switches to cover.
    coverEl.style.setProperty("background-size", coverEl.hasClass("er-fit-fill") ? "cover" : "contain", "important");
    coverEl.addClass("er-has-cover");
  }
  async makePdfThumb(file) {
    await setupWorker(this.app);
    const buf = await this.app.vault.readBinary(file);
    const task = pdfjsLib.getDocument({
      data: buf,
      // Книга — чужой файл. У pdf.js есть известная дыра, где специально
      // собранный шрифт выполняет свой код через eval; отключение eval —
      // штатное лечение от неё (CVE-2024-4367). На вёрстку не влияет.
      isEvalSupported: false,
    });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    // Render crisp (~520px wide), flattened onto white, capped so the cached
    // data-URL stays small. Old version used scale 0.5 \u2192 blurry thumbnails.
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, Math.max(1, 520 / (base.width || 400)));
    const vp = page.getViewport({ scale });
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(vp.width);
    cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const url = cv.toDataURL("image/jpeg", 0.85);
    // Документ закрывается через свою задачу загрузки: в pdf.js 6 у самого
    // документа метода destroy больше нет, и вызов старого валил всю функцию
    // ПОСЛЕ того, как обложка уже нарисована — картинка была готова и
    // выбрасывалась. Уборка не имеет права отменять результат, поэтому в try.
    try { await task.destroy(); } catch { /* optional step; a failure here must not interrupt reading */ }
    return url;
  }
  // FB2 keeps its cover as a base64 <binary>, so the "thumbnail" is already a
  // data URL — no rendering needed. Falls back to the first image in the file
  // when the description declares no coverpage.
  async makeFb2Thumb(file) {
    const buf = await this.app.vault.readBinary(file);
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) throw new Error("fb2 is zipped");
    const doc = erParseFb2(decodeFb2(buf));
    const cp = doc.getElementsByTagName("coverpage")[0];
    const img = cp && cp.getElementsByTagName("image")[0];
    const id = img ? fb2Href(img) : "";
    const bins = Array.from(doc.getElementsByTagName("binary"));
    const bin = (id && bins.find((b) => b.getAttribute("id") === id)) || bins[0];
    if (!bin) throw new Error("no cover");
    const data = (bin.textContent || "").replace(/[^A-Za-z0-9+/=]/g, "");
    if (!data) throw new Error("no cover");
    const ctRaw = String(bin.getAttribute("content-type") || "").trim().toLowerCase();
    const ct = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(ctRaw) ? ctRaw.replace("jpg", "jpeg") : "image/jpeg";
    return `data:${ct};base64,${data}`;
  }
  async makeEpubThumb(file) {
    const buf = await this.app.vault.readBinary(file);
    const book = ePub(buf);
    await book.ready;
    // Read the cover straight out of the unpacked EPUB.
    //
    // This used to go through book.coverUrl(), which hands back a blob: URL that
    // then had to be read with fetch(). Nothing left the device either way — the
    // blob was made from the file already in memory — but a fetch() sitting in a
    // plugin is a thing reviewers have to stop and check, and requestUrl() can't
    // read blob: URLs. Asking the archive directly removes the question: there is
    // no URL and no request, just the bytes epub.js already has.
    let coverPath = await book.loaded.cover;
    if (!coverPath) { erDestroyEpub(book); throw new Error("no cover"); }
    const archive = book.archive;
    if (!archive || typeof archive.getBase64 !== "function") {
      erDestroyEpub(book);
      throw new Error("epub archive unavailable");
    }
    // Some EPUBs mark the cover *page* (cover.xhtml) as the cover, not the
    // picture on it. A page drawn as an image is an empty card, so take the
    // first picture off that page instead.
    if (!/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(coverPath)) {
      coverPath = await this._epubPageImage(archive, coverPath);
      if (!coverPath) { erDestroyEpub(book); throw new Error("no cover"); }
    }
    const dataUrl = await archive.getBase64(coverPath);
    erDestroyEpub(book);
    if (!dataUrl) throw new Error("no cover");
    return dataUrl;
  }
  // First <img> or SVG <image> on an EPUB page, as a path inside the archive.
  async _epubPageImage(archive, pagePath) {
    const html = await archive.getText(pagePath);
    if (!html) return "";
    const m = html.match(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i)
      || html.match(/<image\b[^>]*?\s(?:xlink:)?href\s*=\s*["']([^"']+)["']/i);
    if (!m) return "";
    return epubResolve(pagePath, m[1]);
  }
  onClose() {
    // Flush any covers generated this session before the library closes.
    window.clearTimeout(this._thumbSaveT);
    if (this._thumbDirty) { this._thumbDirty = false; this.plugin.saveAll(); }
    this._coverResizeObs?.disconnect();
    if (this._thumbIO) { this._thumbIO.disconnect(); this._thumbIO = null; }
    this.contentEl.empty();
  }
};
// ── Mobile full-screen reader modal ───────────────────────────────────────────
// ── Mobile full-screen reader modal (section-based, no CSS columns) ──────────
// The library as a TAB, not a dialog.
//
// A modal is capped by Obsidian's own sizing and cannot leave the main window.
// A leaf can: it docks, splits, resizes with the window, and — the thing that
// was actually asked for — Obsidian can move it into its own OS window, where
// it can be maximised like any other. Same code draws both: the drawing never
// cared whether it lived in a dialog, only that it had an element to draw into
// and a way to close itself.
const LIB_VIEW_TYPE = "elton-library";
const LibraryView = class extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return LIB_VIEW_TYPE; }
  getDisplayText() { return __ertr("Библиотека"); }
  getIcon() { return "library"; }
  async onOpen() {
    // The two things the library's drawing expects from a dialog. `modalEl` is
    // only ever used as the host for the drag-and-drop overlay.
    this.modalEl = this.containerEl;
    this.containerEl.addClass("er-modal-lib", "er-lib-as-view");
    await LibraryModal.prototype.onOpen.call(this);
  }
  // Opening a book closes the library when it is a dialog; as a tab there is
  // nothing to close, and detaching would take the book's own tab with it on a
  // narrow layout. Staying open is also simply more useful here.
  close() { /* a tab stays put */ }
  onClose() {
    if (this._coverResizeObs) { try { this._coverResizeObs.disconnect(); } catch { /* already gone */ } }
    this.contentEl.empty();
  }
};
// Everything the library draws lives on LibraryModal's prototype. Borrow it
// wholesale rather than duplicating 500 lines that would then drift apart.
for (const name of Object.getOwnPropertyNames(LibraryModal.prototype)) {
  if (["constructor", "onOpen", "onClose", "close"].includes(name)) continue;
  Object.defineProperty(LibraryView.prototype, name,
    Object.getOwnPropertyDescriptor(LibraryModal.prototype, name));
}
const ReaderModal = class extends Modal {
  close() {
    this._closing = true;
    if (this.plugin && this.plugin._openReaderModal === this) this.plugin._openReaderModal = null;
    super.close();
  }
  constructor(app, plugin, file) {
    super(app);
    this.plugin  = plugin;
    this.file    = file;
    this.ext     = file.extension === "epub" ? "epub" : file.extension === "fb2" ? "fb2" : file.extension === "md" ? "md" : "pdf";
    // Mobile now uses the SAME horizontal page engine as the desktop view, so
    // you turn pages by swiping left/right (like a real book) instead of
    // scrolling down a long chapter.
    this.pager   = new Paginator();
    this.pager.app = app;
    this.pager.onSpreadChange = (cur, tot) => {
      (this.updateUI || this._updateUI).call(this, cur, tot);
      if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    };
    this.bookHtml = "";
    this.tocItems = [];
    this.panelOpen = null;
    this._pendingSel = null;
    this._editHlId = null;
  }
  async onOpen() {
    const { modalEl, contentEl } = this;
    // Let commands find the open mobile reader — it is a Modal, so it never
    // appears in getActiveViewOfType().
    this.plugin._openReaderModal = this;
    // Still open when the app is killed (the usual way a phone app ends) means
    // still being read: the next start opens it again. Closing the book clears it.
    try { if (this.file) this.app.saveLocalStorage(ER_OPEN_BOOK_KEY, this.file.path); } catch { /* storage is optional */ }
    // Don't let Esc close the reader: it was yanking you out of the whole book
    // when you only meant to dismiss a zoomed image. Remove Obsidian's built-in
    // Esc→close handler from this modal's scope; the book is closed with the ←
    // button instead, and the image viewer is closed by ✕ / tapping outside.
    try {
      if (this.scope && Array.isArray(this.scope.keys)) {
        this.scope.keys = this.scope.keys.filter((k) => String(k && k.key).toLowerCase() !== "escape");
      }
    } catch { /* optional step; a failure here must not interrupt reading */ }
    modalEl.addClass("er-fullscreen-modal");
    // Also on the container: the mobile build gives it padding of its own, which
    // showed as grey bands down both sides of the book (8px, measured off the
    // screen). Only a rule aimed at the container can take that back.
    this.containerEl.addClass("er-fullscreen-container");
    contentEl.addClass("er-fullscreen-content");
    // Ручная подстройка под статус-бар: на некоторых Android-оболочках система
    // не сообщает высоту «шторки», и панель читалки уезжает под часы. Ноль —
    // ничего не меняет, отступ остаётся системным.
    const extraTop = Number(this.plugin.settings.mobileTopInset) || 0;
    if (extraTop > 0) contentEl.style.setProperty("--er-extra-top", extraTop + "px");
    // Take Obsidian's own ✕ out of the DOM, rather than styling it away.
    //
    // It floats in the window's top-right corner; our window fills the screen,
    // so on a phone it lands inside the status bar, on top of the battery. The
    // reader already has one way out (← in the top bar, and «Закрыть книгу» in
    // the ⋯ menu), so it is a duplicate as well as an eyesore.
    //
    // Three CSS selectors scoped to our own classes did not reach it — display,
    // visibility and pointer-events, all !important, and it stayed on screen
    // through a theme change too. Rather than guess at a fourth selector, walk
    // the DOM from OUR OWN container: whatever the mobile build nests it in, it
    // is inside there, and an element that is gone cannot be restyled back.
    // A single sweep at open was not enough — it was still on screen afterwards,
    // which means the button is either created later than onOpen or hangs off
    // something other than our container. So: sweep now, and keep watching for
    // as long as the book is open.
    //
    // What gets removed is narrow on purpose: our own dialog's button, and any
    // stray one that belongs to no dialog at all (the case a single sweep from
    // our container cannot see). A button inside SOME OTHER dialog is left
    // alone — the AI breakdown, the translator and the settings windows open on
    // top of the reader and must keep their way out.
    // BOTH class names. Obsidian 1.13 renamed this control: it is
    // `.modal-header-button.mod-raised.clickable-icon` now, and
    // `.modal-close-button` — the name every guide and every older plugin uses —
    // matches nothing. That is the whole story of why four rounds of CSS and a
    // DOM removal all failed: they were aimed at an element that no longer
    // exists. Read off the running app over the debugging port: one
    // `.modal-header-button` with a `lucide-x` icon inside our own modal, zero
    // `.modal-close-button` anywhere. The old name stays for older Obsidian.
    const CLOSE_BTNS = ".modal-close-button, .modal-header-button";
    const dropStrayCloses = (all) => {
      try {
        for (const b of docOf(modalEl).querySelectorAll(CLOSE_BTNS)) {
          const own = b.closest(".modal-container");
          // `all` is the sweep at open: the book is the only dialog on screen at
          // that instant, so everything goes. The previous version kept the ones
          // whose container was not the node we knew about — which is exactly the
          // case that survives if the mobile build nests the dialog differently,
          // and it did survive. Afterwards the rule tightens again.
          if (all || !own || own === this.containerEl) b.remove();
        }
      } catch { /* nothing to remove is a perfectly good outcome */ }
    };
    dropStrayCloses(true);
    // Wrapped, not passed straight in: a MutationObserver hands its callback the
    // list of records, which is truthy — the sweep-everything flag would have
    // been on for every mutation, and other dialogs would lose their ✕ too.
    this._closeWatch = new MutationObserver(() => dropStrayCloses(false));
    this._closeWatch.observe(docOf(modalEl).body, { childList: true, subtree: true });
    this._applyTheme();
    this._buildDOM();
    erApplyTexture(this.app, this.plugin.settings, this.areaEl);
    this._applyFullscreen();
    await this._loadBook();
    this._sessionSec = 0;
    this._running = false;
    this._goalNotified = this.plugin.getTodaySeconds() >= this.plugin.getGoalSeconds();
    updateGoalBar(this);
    updateTimerBtn(this);
    // Re-flow the pages when the viewport changes (e.g. phone rotation, keyboard).
    this._lastW = this.areaEl.clientWidth;
    this._resizeObs = new ResizeObserver(() => {
      window.clearTimeout(this._rsT);
      this._rsT = window.setTimeout(() => {
        // Rotation changes the strip (an iPhone has none in landscape). Settle it
        // first, then decide about re-flowing — the strip is part of the height
        // the columns are measured against.
        // (the status bar strip is pure CSS now — nothing to re-measure)
        const w = this.areaEl ? this.areaEl.clientWidth : 0;
        if (w && Math.abs(w - (this._lastW || 0)) > 4) { this._lastW = w; this._repaginate(); }
      }, 180);
    });
    this._resizeObs.observe(this.areaEl);
  }
  // Full-screen mode on/off: the bars leave the layout (they float over the
  // page), so the page height changes and the book is laid out again.
  _applyFullscreen() {
    const root = this.contentEl;
    if (!root) return;
    const on = this.plugin.settings.mobileFullscreen === true;
    const was = root.hasClass("er-fs");
    root.toggleClass("er-fs", on);
    if (!on) root.removeClass("er-chrome-off");
    else root.addClass("er-chrome-off");
    if (was !== on && this.bookHtml) this._repaginate();
  }
  _applyTheme() {
    const t = erTheme(this.plugin.settings);
    const m = this.modalEl;
    m.style.setProperty("--er-bg", t.bg);
    m.style.setProperty("--er-text", t.text);
    m.style.setProperty("--er-ui", t.ui);
    m.style.setProperty("--er-border", t.border);
    m.style.setProperty("--er-accent", t.accent);
    m.style.setProperty("--er-muted", t.muted);
    m.style.background = t.bg;
    erApplyTexture(this.app, this.plugin.settings, this.areaEl);
  }
  _buildDOM() {
    const root = this.contentEl;
    root.empty();
    const pb = root.createDiv("er-pbar");
    this.pbarFill = pb.createDiv("er-pbar-fill");
    const top = root.createDiv("er-top");
    const lb  = top.createDiv("er-ibtn");
    svgIcon(lb, "arrow-left");
    lb.setAttribute("aria-label", __ertr("Закрыть книгу"));
    lb.addEventListener("click", () => this.close());
    this.titleEl = top.createDiv("er-top-title");
    this.titleEl.setText(erBookTitle(this.file));
    const tr     = top.createDiv("er-top-right");
    this.timerBtnEl = tr.createDiv("er-timerbtn");
    this.timerIconEl = this.timerBtnEl.createDiv("er-timer-ic");
    this.timerLabelEl = this.timerBtnEl.createDiv("er-timer-label");
    this.timerResetEl = this.timerBtnEl.createDiv("er-timer-reset");
    svgIcon(this.timerResetEl, "rotate-ccw");
    this.timerResetEl.setAttribute("aria-label", __ertr("Сбросить таймер"));
    this.timerResetEl.addEventListener("click", (e) => { e.stopPropagation(); resetTimerSession(this); });
    this.timerBtnEl.setAttribute("aria-label", __ertr("Таймер: сколько осталось до цели — старт/пауза"));
    this.timerBtnEl.addEventListener("click", () => toggleTimerSession(this));
    updateTimerBtn(this);
    erTtsButton(this, tr);
    erAiButton(this, tr);
    erTopLoc(this, tr, root);
    // The mobile toolbar was cramped (title squeezed to «Д..»). The secondary
    // actions now live inside ONE «⋯» button that opens a native menu, so the top
    // bar keeps only the timer, «⋯» and the reading-settings ⚙ — the book title
    // finally has room to breathe.
    const moreBtn = tr.createDiv("er-ibtn er-b-more");
    svgIcon(moreBtn, "more-horizontal");
    moreBtn.setAttribute("aria-label", __ertr("Ещё"));
    moreBtn.addEventListener("click", (e) => {
      const menu = new Menu();
      menu.addItem((it) => it.setTitle(__ertr("Поиск по книге")).setIcon("search").onClick(() => {
        this._togglePanel("find");
        if (this._findInput) erAutoFocus(this._findInput, 80);
      }));
      menu.addItem((it) => it.setTitle(__ertr("Оглавление")).setIcon("list").onClick(() => this._togglePanel("toc")));
      menu.addItem((it) => it.setTitle(__ertr("Выделения")).setIcon("highlighter").onClick(() => this._togglePanel("highlights")));
      menu.addItem((it) => it.setTitle(__ertr("Сохранить позицию")).setIcon("save").onClick(() => this.saveNow()));
      menu.addItem((it) => it.setTitle(this._auto ? __ertr("Остановить автопрокрутку") : __ertr("Автопрокрутка")).setIcon("play").onClick(() => erToggleAutoScroll(this)));
      if (this.plugin.settings.aiEnabled && this.plugin.settings.aiRecap !== false) menu.addItem((it) => it.setTitle(__ertr("Напомнить, что было")).setIcon("history").onClick(() => erAiRecap(this)));
      menu.addItem((it) => it.setTitle(this.plugin.settings.mobileFullscreen ? __ertr("Обычный режим (панели на месте)") : __ertr("Полноэкранное чтение")).setIcon("maximize").onClick(async () => {
        this.plugin.settings.mobileFullscreen = !this.plugin.settings.mobileFullscreen;
        await this.plugin.saveAll();
        this._applyFullscreen();
      }));
      // A way to re-flow the book by hand. On a desktop the window resizes and
      // the layout rebuilds itself; a phone never resizes, so when something did
      // go wrong there was nothing to press — "кнопки обновить/перерисовать
      // книгу нет, как на пк, перезапуск книги не помогает".
      menu.addItem((it) => it.setTitle(__ertr("Перерисовать книгу")).setIcon("refresh-cw").onClick(async () => {
        await this._repaginate();
        new Notice(__ertr("Книга перерисована"));
      }));
      // The ↺ next to the timer is hidden on a phone — the pill was taking a
      // third of the bar and leaving the book title as «Выготски…». It is used
      // about once a session, so it belongs here rather than in the top row.
      menu.addItem((it) => it.setTitle(__ertr("Сбросить таймер")).setIcon("rotate-ccw").onClick(() => resetTimerSession(this)));
      menu.addItem((it) => it.setTitle(__ertr("Настройки чтения")).setIcon("sliders").onClick(() => new ReadSettingsModal(this.app, this).open()));
      erPdfModeMenuItem(this, menu);
      addBookFileMenu(this.app, menu, this.file);
      menu.addSeparator();
      menu.addItem((it) => it.setTitle(__ertr("Закрыть книгу")).setIcon("x").onClick(() => this.close()));
      menu.showAtMouseEvent(e);
    });
    // No ✕ in the bar. There used to be one, and it did exactly what the ← two
    // controls to its left already does — close the book. Two buttons for one
    // action, in a bar that had no room for the book's title. The library sets
    // the pattern: one way back, everything rarer folded into «⋯».
    // «Справка» перенесена в панель настроек, чтобы верхняя панель была чище.
    this.areaEl = root.createDiv("er-area er-marea");
    if ((this.plugin.settings.navMode || "buttons") === "click") root.addClass("er-navclick");
    // Bottom reading-goal progress bar removed by request; the ▶ timer stays in the top bar.
    const bot = root.createDiv("er-bot");
    const pv  = bot.createDiv("er-navbtn");
    svgIcon(pv, "chevron-left");
    pv.addEventListener("click", () => this._nav("prev"));
    const center = bot.createDiv("er-bot-center");
    this.locEl = center.createDiv("er-loc er-loc-clickable");
    this.locEl.setAttribute("aria-label", __ertr("Перейти к странице"));
    this.locEl.addEventListener("click", () => {
      if (!this.file || !this.pager || !this.pager.total) return;
      new GoToPageModal(this.app, this.pager.total, this.pager.spread, (n) => {
        const [cur, tot] = this.pager.jumpTo(n - 1);
        this._updateUI(cur, tot);
        this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
      }).open();
    });
    this.pctEl = center.createDiv("er-pct");
    this.pctEl.setText("0%");
    const nx = bot.createDiv("er-navbtn");
    svgIcon(nx, "chevron-right");
    nx.addEventListener("click", () => this._nav("next"));
    // The page number that stays on screen in full-screen mode.
    this.fsLocEl = root.createDiv("er-fs-loc");
    this.overlayEl = root.createDiv("er-overlay");
    this.overlayEl.addEventListener("click", () => this._closePanel());
    this.settPan = root.createDiv("er-panel");
    this.tocPan  = root.createDiv("er-panel er-toc-panel");
    this.hlPan   = root.createDiv("er-panel er-toc-panel er-hl-panel");
    this.findPan = root.createDiv("er-panel er-toc-panel er-find-panel");
    this._buildSettPanel();
    this._buildTocPanel();
    this._buildHlPanel();
    this._buildFindPanel();
    this.hlPopup = root.createDiv("er-hl-popup");
    this._buildHlPopup();
    this._selHandler = () => this._scheduleSelCheck();
    this._selDoc = docOf(this.areaEl);
    this._selDoc.addEventListener("selectionchange", this._selHandler);
    this.areaEl.addEventListener("click", (e) => {
      if (erNoteLinkClick(this, e)) return;
      // A footnote reference wins over everything else on the page: the reader
      // tapped a number, not the paragraph behind it.
      const refEl = e.target instanceof HTMLElement ? e.target.closest("[data-er-ref]") : null;
      if (refEl) {
        e.preventDefault();
        e.stopPropagation();
        if (followFootnote(this, refEl.getAttribute("data-er-ref"))) return;
      }
      const imgEl = e.target instanceof HTMLElement ? e.target.closest("img") : null;
      if (imgEl && imgEl.src) { e.preventDefault(); openImageLightbox(imgEl.currentSrc || imgEl.src, this.app, imgEl); return; }
      const span = e.target instanceof HTMLElement ? e.target.closest(".er-hl") : null;
      if (span) { e.preventDefault(); this._openHlEdit(span.getAttribute("data-hl-id")); }
      else if (this._editHlId) this._hideHlPopup();
    });
    // Horizontal swipe = turn page. A long-press (start a selection) or an active
    // selection must NOT be hijacked, so the user can still select text.
    let sx = 0, sy = 0, dir = null, longPress = false, lpTimer = null, hadSel = false;
    this.areaEl.addEventListener("touchstart", e => {
      if (e.touches.length > 1) { dir = "v"; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dir = null; longPress = false;
      const sel = selOf(this.areaEl);
      hadSel = !!(sel && !sel.isCollapsed);
      window.clearTimeout(lpTimer);
      lpTimer = window.setTimeout(() => { longPress = true; }, 350);
    }, { passive: true });
    this.areaEl.addEventListener("touchmove", e => {
      if (dir) { if (dir === "h") e.preventDefault(); return; }
      const dx = Math.abs(e.touches[0].clientX - sx), dy = Math.abs(e.touches[0].clientY - sy);
      if (dx < 8 && dy < 8) return;
      window.clearTimeout(lpTimer);
      const sel = selOf(this.areaEl);
      if (longPress || hadSel || (sel && !sel.isCollapsed)) { dir = "v"; return; }
      dir = dx > dy ? "h" : "v";
      if (dir === "h") e.preventDefault();
    }, { passive: false });
    this.areaEl.addEventListener("touchend", e => {
      window.clearTimeout(lpTimer);
      if (dir !== "h") return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 44) this._nav(dx < 0 ? "next" : "prev");
    }, { passive: true });
    // Tap left/right side of the page to turn it (when "По клику" is enabled).
    this.areaEl.addEventListener("click", (e) => handleAreaNavClick(this, e));
    erStylusMarker(this);
    this.areaEl.addEventListener("mouseover", (e) => erBacklinkHover(this, e));
    if (!this._applyFullscreen && this.plugin.settings.desktopNoBars === true) erDesktopNoBars(this, true);
    // Immersive chrome, on the phone as well.
    //
    // The setting promises the bars dim out of the way while you read, and on a
    // phone it did nothing at all: the desktop arms it from `pointermove`, and a
    // finger does not move a pointer. A touch is what wakes it here — and the
    // whole point of a phone reader is that the book is the screen.
    const armImmersive = () => {
      const root = this.contentEl;
      if (!root) return;
      // Full screen: the bars, once shown, step aside again on their own.
      if (erIsFullscreen(this)) {
        root.removeClass("er-immersive");
        window.clearTimeout(this._immTimer);
        this._immTimer = window.setTimeout(() => {
          if (this.contentEl && !this.panelOpen) this.contentEl.addClass("er-chrome-off");
        }, 4000);
        return;
      }
      if (!this.plugin.settings.immersive) { root.removeClass("er-immersive"); return; }
      root.removeClass("er-immersive");
      window.clearTimeout(this._immTimer);
      this._immTimer = window.setTimeout(() => {
        if (this.bookHtml && this.contentEl) this.contentEl.addClass("er-immersive");
      }, 2600);
    };
    this._armImmersive = armImmersive;
    this.contentEl.addEventListener("touchstart", armImmersive, { passive: true });
    this.contentEl.addEventListener("pointerdown", armImmersive);
    armImmersive();
  }
  // Settings changes (theme/font/size/line-height) → rebuild the pages, keeping
  // the current reading %. (Named _applyContentStyle for the panel callers.)
  async _applyContentStyle() {
    await this._repaginate();
  }
  async _repaginate() {
    if (!this.bookHtml || !this.areaEl || !this.areaEl.clientWidth) return;
    // Anchor on the paragraph, not the percentage — see the desktop repaginate().
    // Here it matters on font-size changes and screen rotation.
    const savedBlock = this.pager.currentBlockIndex();
    const savedPct = this.pager.currentPct;
    // Re-flowing necessarily lays the book out from spread 0 before it can jump
    // back to where the reader was. Unhidden, that is a page they can see change
    // twice — the same flicker the opening sequence hides for the same reason.
    this.areaEl.addClass("er-booting");
    erShowVeil(this);
    const [, total] = await this.pager.build(this.areaEl, this.bookHtml, this.plugin.settings, 0);
    const target = (typeof savedBlock === "number" && savedBlock >= 0)
      ? this.pager.spreadForBlock(savedBlock)
      : Math.round(savedPct * Math.max(0, total - 1));
    this._renderFlowHighlights();
    const [cur, tot] = this.pager.jumpTo(target);
    erRevealWhenSettled(this);
    this._updateUI(cur, tot);
    // Everything below is tied to the block elements that were just replaced:
    // the spread numbers in the contents list, the search corpus, and the
    // highlight ranges painted over the old nodes.
    if (this._tocRender) this._tocRender();
    this._findCorpus = null;
    if (this._foundQuery) this._markFound(this._foundQuery);
  }
  async _loadBook() {
    this.areaEl.empty();
    const loading = this.areaEl.createDiv("er-loading");
    loading.addClass("er-centered");
    loading.createDiv("er-spin");
    const loadText = loading.createDiv("er-loading-text");
    loadText.setText(__ertr("\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u043A\u043D\u0438\u0433\u0443\u2026"));
    await new Promise((r) => window.requestAnimationFrame(r));
    await new Promise((r) => window.requestAnimationFrame(r));
    try {
      this._pdfLazy?.destroy?.();
      this._pdfLazy = null;
      if (this.ext === "epub") {
        this.bookHtml = await extractEpub(this.file, this.app);
        this._pdfOutline = erEpubNav.get(this.file.path) || null;
      } else if (this.ext === "fb2") {
        this.bookHtml = await extractFb2(this.file, this.app);
      } else if (this.ext === "md") {
        this.bookHtml = await extractMarkdown(this.file, this.app);
      } else {
        const res = await extractPdf(this.file, this.app, this.plugin.settings, (i, n) => loadText.setText(__ertr("Готовим книгу… {0}%", (Math.round(i / n * 100)))), erPdfEarly(this, this.file, () => !this.contentEl || !this.contentEl.isConnected));
        this.bookHtml = res.html;
        this._pdfLazy = res.lazy;
        this._pdfOutline = res.outline;
      }
      // TOC anchored to the global block index \u2192 tap jumps to that page.
      this.tocItems = buildTocItems(this.bookHtml, this._pdfOutline);
      this._buildTocPanel();
      await this.plugin.refreshHighlights();
      await this.plugin.refreshProgress();
      const saved = this.plugin.getProgress(this.file.path);
      const pct = (saved == null ? void 0 : saved.pct) != null ? saved.pct : 0;
      this.areaEl.addClass("er-booting");
      erShowVeil(this);
      // Ceiling on the hold. If anything between here and the jump throws, the
      // book must still appear — a blank page is far worse than a visible jump.
      window.setTimeout(() => {
        if (this.areaEl) this.areaEl.removeClass("er-booting");
        erHideVeil(this);
      }, 3000);
      const keep = erPdfEarlyDone(this, this.file);
      await this.pager.build(this.areaEl, this.bookHtml, this.plugin.settings, 0);
      const hasBlock = keep != null || (saved && typeof saved.block === "number" && saved.block >= 0);
      const target = keep != null ? this.pager.spreadForBlock(keep)
        : hasBlock ? this.pager.spreadForBlock(saved.block)
        : Math.round(pct * Math.max(0, this.pager.total - 1));
      this._renderFlowHighlights();
      const [cur, tot] = this.pager.jumpTo(target);
      this._updateUI(cur, tot);
      // Not one frame — the dialog can still be settling on a phone, and a
      // re-flow landing after the reveal is a page the reader watches change.
      erRevealWhenSettled(this);
      if (hasBlock) this._flashBlock(keep != null ? keep : saved.block);
      // Same as desktop: the panel was built before a file existed, so rebuild it
      // now that the per-book settings have a book to bind to.
      this._buildSettPanel();
      // First open of this book → offer to set up its note. Mobile never asked
      // at all before, so a phone-only reader had no way into this.
      this._maybePromptBookNote(this.file);
    } catch (e) {
      console.error("ReaderModal:", e);
      this.areaEl.empty();
      this.areaEl.createEl("p", { cls: "er-load-error", text: __ertr("Ошибка: {0}", e.message) });
    }
  }
  // First open of a book \u2192 the setup screen (create / pick / skip). Same rules as
  // the desktop view: never for a book that already has a note, never twice.
  _maybePromptBookNote(file) {
    if (file && file.extension === "md") return;
    const s = this.plugin.settings;
    if (!file) return;
    if (!s.bookNoteLinks) s.bookNoteLinks = {};
    if (!s.bookNotePrompted) s.bookNotePrompted = {};
    const action = bookNoteAction(s, file.path);
    if (action === "linked" || action === "prompted") return;
    if (action === "auto") {
      s.bookNotePrompted[file.path] = true;
      this.plugin.ensureBookNote(file).then((note) => {
        if (note) new Notice(__ertr("\u0417\u0430\u043c\u0435\u0442\u043a\u0430 \u043a\u043d\u0438\u0433\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0430: {0}", note.basename));
      });
      return;
    }
    new BookSetupModal(this.app, this.plugin, file, () => {}).open();
  }
  // Jump to the page holding a global block index, flash it, save the position.
  _jumpToBlock(block, flash = true) {
    if (!this.bookHtml) return;
    const [cur, tot] = this.pager.jumpTo(this.pager.spreadForBlock(block));
    this._updateUI(cur, tot);
    if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    if (flash) this._flashBlock(block);
  }
  // Briefly highlight the paragraph the reader resumed at.
  // Jump to a paragraph as soon as the book is laid out. Called from a backlink,
  // which arrives while the book is still being built, so it waits for the
  // pager rather than assuming the text is already there. Gives up after a few
  // seconds instead of polling forever on a book that failed to open.
  // Land on a PDF page once the book is laid out. Pages are marked in the flow
  // with data-pdf-page-no, so this is a lookup rather than a guess.
  jumpToPdfPageWhenReady(pageNo) {
    let tries = 0;
    const tick = () => {
      const flow = this.pager && this.pager.flow;
      if (flow && this.pager.total) {
        const el = flow.querySelector(`[data-pdf-page-no="${pageNo}"]`);
        if (el) {
          const x = el.getBoundingClientRect().left - flow.getBoundingClientRect().left;
          const stride = this.pager.sw / (this.pager.cols || 1);
          const spread = Math.floor(Math.round(x / stride) / (this.pager.cols || 1));
          const [cur, tot] = this.pager.jumpTo(Math.max(0, Math.min(spread, this.pager.total - 1)));
          (this.updateUI || this._updateUI).call(this, cur, tot);
          return;
        }
      }
      if (++tries > 40) return;
      window.setTimeout(tick, 100);
    };
    tick();
  }
  jumpToBlockWhenReady(idx) {
    let tries = 0;
    const tick = () => {
      if (this.pager && this.pager.flow && this.pager.total) {
        const [cur, tot] = this.pager.jumpTo(this.pager.spreadForBlock(idx));
        (this.updateUI || this._updateUI).call(this, cur, tot);
        this._flashBlock(idx);
        return;
      }
      if (++tries > 40) return;
      window.setTimeout(tick, 100);
    };
    tick();
  }
  _flashBlock(idx) {
    const el = this.pager.blockEl(idx);
    if (!el) return;
    el.classList.remove("er-resume-flash");
    void el.offsetWidth;
    el.classList.add("er-resume-flash");
    window.setTimeout(() => el.classList.remove("er-resume-flash"), 2400);
  }
  _nav(dir) {
    if (!this.bookHtml) return;
    // Anti-double-turn guard — see ReaderView.nav() for the full rationale.
    // Collapses the iOS ghost-click / duplicate touch that flips two pages per swipe.
    const _now = Date.now();
    if (this._lastNavTs && _now - this._lastNavTs < 90) return;
    this._lastNavTs = _now;
    this._lastActive = _now;
    this._hideHlPopup();
    const [cur, total] = dir === "next" ? this.pager.next() : this.pager.prev();
    this._updateUI(cur, total);
    this.plugin.saveProgress(this.file.path, cur, total, this.pager.currentBlockIndex());
  }
  saveNow() {
    if (!this.bookHtml || !this.file) { new Notice(__ertr("Нечего сохранять")); return; }
    const pct = this.plugin.saveNow(this.file.path, this.pager.spread, this.pager.total, this.pager.currentBlockIndex());
    new Notice(__ertr("Сохранено ✓ — {0}%", (pct)));
    if (this.panelOpen === "settings") this._renderHistory();
  }
  exportHighlights(evt) {
    if (!this.file) { new Notice(__ertr("Книга не открыта")); return; }
    // Chapter + page are computed from the CURRENT layout, so they are attached
    // here rather than stored with the highlight.
    const list = erMergeHlGroups(enrichHighlights(this, this.plugin.getHighlights(this.file.path)));
    exportHighlightsMenu(this.app, this.plugin, this.file, list, evt);
  }
  _updateUI(cur, total) {
    if (this.contentEl) this.contentEl.toggleClass("er-scrolling", !!(this.pager && this.pager.scrollMode));
    cur = cur != null ? cur : this.pager.spread;
    total = total != null ? total : this.pager.total;
    const pct = total > 0 ? Math.round((cur + 1) / total * 100) : 0;
    this.pbarFill.style.width = `${pct}%`;
    const bookPage = currentBookPage(this);
    this.locEl.setText(bookPage ? __ertr("стр. {0}", bookPage) + " · " + `${cur + 1} / ${total}` : `${cur + 1} / ${total}`);
    this.pctEl.setText(`${pct}%`);
    if (this.topLocEl) this.topLocEl.setText(`${cur + 1} / ${total} · ${pct}%`);
    erPaintTimeLeft(this);
    if (this.fsLocEl) this.fsLocEl.setText(`${cur + 1} / ${total} · ${pct}%`);
    renderVisibleFigures(this);
  }
  _buildSettPanel() {
    const p = this.settPan;
    p.empty();
    p.createDiv("er-pan-title").setText(__ertr("\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438"));
    const sec = l => p.createDiv("er-pan-sec").setText(l);
    sec(__ertr("\u0422\u0435\u043C\u0430"));
    const thRow = p.createDiv("er-theme-row");
    ["auto","dark","light","sepia","eink"].forEach(t => {
      const btn = thRow.createDiv(`er-theme-btn er-theme-${t}`);
      btn.setText({ auto:__ertr("Как в Obsidian"), dark:__ertr("\u0422\u0451\u043C\u043D\u0430\u044F"), light:__ertr("\u0421\u0432\u0435\u0442\u043B\u0430\u044F"), sepia:"Sepia", eink:"E-ink" }[t]);
      if (this.plugin.settings.theme === t) btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.theme = t;
        await this.plugin.saveAll();
        // Только цвета: пересобирать страницы ради темы не нужно.
        this._applyTheme();
        thRow.querySelectorAll(".er-theme-btn").forEach(b => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    sec(__ertr("\u0420\u0430\u0437\u043C\u0435\u0440 \u0448\u0440\u0438\u0444\u0442\u0430"));
    const szRow = p.createDiv("er-sz-row");
    const szMinus = szRow.createDiv("er-sz-btn"); szMinus.setText("A\u2212");
    this.szLabel = szRow.createDiv("er-sz-label");
    this.szLabel.setText(`${this.plugin.settings.fontSize}px`);
    const szPlus = szRow.createDiv("er-sz-btn"); szPlus.setText("A+");
    const chSz = async d => {
      this.plugin.settings.fontSize = Math.min(32, Math.max(12, this.plugin.settings.fontSize + d));
      this.szLabel.setText(`${this.plugin.settings.fontSize}px`);
      await this.plugin.saveAll();
      this._applyContentStyle();
    };
    szMinus.addEventListener("click", () => chSz(-1));
    szPlus.addEventListener("click",  () => chSz(+1));
    // Progressive disclosure: theme and text size are what readers actually
    // touch mid-book; the rest is set once and then forgotten. One toggle, one
    // level deep — nesting further is where options stop being findable.
    const advHdr = p.createDiv("er-pan-adv-hdr");
    advHdr.createSpan({ cls: "er-pan-adv-ic", text: "\u2699\uFE0F" });
    advHdr.createSpan({ cls: "er-pan-adv-lbl", text: __ertr("\u0414\u043E\u043F. \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438") });
    const advCar = advHdr.createSpan({ cls: "er-pan-adv-car", text: "\u203A" });
    const advWrap = p.createDiv("er-pan-adv");
    const adv = advWrap.createDiv("er-pan-adv-body");
    const secA = (l) => adv.createDiv("er-pan-sec").setText(l);
    if (this.plugin.settings.readerAdvOpen) { advWrap.addClass("er-pan-adv-on"); advCar.addClass("er-pan-adv-car-on"); }
    advHdr.addEventListener("click", async () => {
      const on = advWrap.hasClass("er-pan-adv-on");
      advWrap.toggleClass("er-pan-adv-on", !on);
      advCar.toggleClass("er-pan-adv-car-on", !on);
      this.plugin.settings.readerAdvOpen = !on;
      await this.plugin._saveLocalData();
    });
    secA(__ertr("\u0428\u0440\u0438\u0444\u0442"));
    const ffRow = adv.createDiv("er-ff-row");
    erFontChoices(this.plugin.settings).forEach(([ff, label, fam]) => {
      const btn = ffRow.createDiv("er-ff-btn");
      btn.setText(label); btn.style.fontFamily = fam;
      if (this.plugin.settings.fontFamily === ff) btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.fontFamily = ff;
        await this.plugin.saveAll();
        this._applyContentStyle();
        ffRow.querySelectorAll(".er-ff-btn").forEach(b => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    secA(__ertr("\u041C\u0435\u0436\u0441\u0442\u0440\u043E\u0447\u043D\u044B\u0439"));
    const lhRow = adv.createDiv("er-lh-row");
    [1.4,1.6,1.8,2.1].forEach(lh => {
      const btn = lhRow.createDiv("er-lh-btn");
      btn.setText(`${lh}`);
      if (Math.abs(this.plugin.settings.lineHeight - lh) < 0.05) btn.addClass("active");
      btn.addEventListener("click", async () => {
        this.plugin.settings.lineHeight = lh;
        await this.plugin.saveAll();
        this._applyContentStyle();
        lhRow.querySelectorAll(".er-lh-btn").forEach(b => b.removeClass("active"));
        btn.addClass("active");
      });
    });
    buildReaderExtraSettings(this, adv);
    this._histRow = panelSection(this, p, {
      label: __ertr("Вернуться к месту"), emoji: "🔖", settingKey: "readerHistOpen",
    }).createDiv("er-hist-row");
    this._renderHistory();
    p.createDiv("er-pan-sec").setText(__ertr("Действия"));
    const actRow = p.createDiv("er-act-row");
    const actBtn = actRow.createDiv("er-act-btn");
    iconLabel(actBtn, "info", __ertr("Справка"));
    actBtn.addEventListener("click", () => { this._closePanel(); new InfoModal(this.app, this.plugin, this.file).open(); });
  }
  _renderHistory() {
    const c = this._histRow;
    if (!c) return;
    c.empty();
    const list = this.file ? this.plugin.getBackups(this.file.path) : [];
    // Keep the collapsed header's counter in step with the list inside it.
    const badge = c.parentElement && c.parentElement._erCount;
    if (badge) badge.setText(list.length ? String(list.length) : "");
    if (!list.length) { c.createDiv("er-hist-empty").setText(__ertr("Точек пока нет")); return; }
    [...list].reverse().slice(0, 14).forEach((snap) => {
      const chip = c.createDiv("er-hist-chip");
      if (snap.manual) chip.addClass("er-hist-manual");
      const d = new Date(snap.ts || snap.lastRead || Date.now());
      const mark = snap.manual ? "💾 " : "";
      chip.setText(`${mark}${snap.percent}% · ${d.toLocaleString(erLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      chip.addEventListener("click", () => {
        if (!this.bookHtml) return;
        this._closePanel();
        if (typeof snap.block === "number" && snap.block >= 0) {
          this._jumpToBlock(snap.block);
        } else {
          const frac = typeof snap.pct === "number" ? snap.pct : (snap.percent || 0) / 100;
          const [cur, tot] = this.pager.jumpTo(Math.round(frac * Math.max(0, this.pager.total - 1)));
          this._updateUI(cur, tot);
          if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
        }
        new Notice(__ertr("Вернулись к {0}%", (snap.percent)));
      });
    });
  }
  _buildTocPanel() {
    this._tocRender = buildTocPanelFor(this, this.tocPan, {
      close: () => this._closePanel(),
      jump: (b) => this._jumpToBlock(b),
    });
  }
  _buildFindPanel() {
    buildFindPanelFor(this, this.findPan, {
      close: () => this._closePanel(),
      jump: (b) => this._jumpToBlock(b),
    });
  }
  _markFound(query) { markFoundIn(this, query); }
  _clearFound() { clearFoundIn(this); }
  _togglePanel(name) {
    if (this.panelOpen === name) { this._closePanel(); return; }
    this._hideHlPopup();
    if (name === "highlights") this._buildHlPanel();
    if (name === "settings") this._renderHistory();
    this.panelOpen = name;
    this.settPan.classList.toggle("er-panel-open", name === "settings");
    this.tocPan.classList.toggle("er-panel-open", name === "toc");
    this.hlPan.classList.toggle("er-panel-open", name === "highlights");
    // The search panel was built but never opened here: «Поиск по книге» in
    // the ⋯ menu dimmed the page for the panel and then showed nothing — "the
    // screen goes dim and hangs until the next tap" (Poco F3, FB2).
    if (this.findPan) this.findPan.classList.toggle("er-panel-open", name === "find");
    // Redraw the contents once the panel is shown, as the book tab does: the
    // chapter being read is marked and brought to the middle of the list
    // (built when the book opened, it still marked the first chapter).
    if (name === "toc" && this._tocRender) this._tocRender();
    this.overlayEl.classList.add("er-overlay-on");
  }
  _closePanel() {
    this.panelOpen = null;
    this.settPan.classList.remove("er-panel-open");
    this.tocPan.classList.remove("er-panel-open");
    this.hlPan.classList.remove("er-panel-open");
    // Guarded: the mobile reader has no search panel.
    if (this.findPan) this.findPan.classList.remove("er-panel-open");
    this.overlayEl.classList.remove("er-overlay-on");
  }
  // ── Highlights (mobile) ───────────────────────────────
  // Now identical to the desktop flow model: highlights are addressed by the
  // GLOBAL block index inside the single paginated flow (no per-section offset).
  _renderFlowHighlights() { erRenderFlowHighlights(this); }
  _scheduleSelCheck() {
    window.clearTimeout(this._selTimer);
    this._selTimer = window.setTimeout(() => this._onSelectionCheck(), 80);
  }
  _onSelectionCheck() {
    if (this._editHlId) return;
    const sel = selOf(this.areaEl);
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { this._carry = null; this._hideHlPopup(); return; }
    const flow = this.pager.flow;
    if (!flow || !flow.contains(sel.getRangeAt(0).commonAncestorContainer)) { this._hideHlPopup(); return; }
    // Never past the page on screen: dragging a handle into the margin at the
    // foot of the page used to select to the end of the book (see
    // erVisibleTextRange). Moving the selection fires selectionchange again,
    // and the next check sees the clamped range.
    if (erClampSelectionToPage(this, sel)) return;
    const range = sel.getRangeAt(0);
    const parts = erSelectionParts(flow, range);
    if (!parts.length) { this._hideHlPopup(); return; }
    // The first segment stays the head, so everything that reads _pendingSel
    // (comments, notes, the translator) keeps working unchanged; the rest ride
    // along in `parts`. Paragraphs are joined with a blank line, as they were
    // in the book — not run together on one line.
    this._pendingSel = { ...parts[0], parts, text: parts.map((p) => p.text).join("\n\n") };
    erPaintSelection(this, range);
    this._showHlPopup(erSelectionRect(range, this.areaEl));
  }
  _buildHlPopup() {
    const pop = this.hlPopup;
    pop.empty();
    pop.addEventListener("mousedown", (e) => e.preventDefault());
    // A thought in the margin. Distinct from "create a note": this stays WITH the
    // highlight instead of becoming a separate file — for "he contradicts himself
    // here", which does not deserve its own note.
    addBarButtons(this, pop);
    addMoreBtn(this, pop);
  }
  _applyPopupColor(colorId) {
    if (this._editHlId && this.file) {
      const id = this._editHlId;
      const gids = this.plugin.hlGroupIds(this.file.path, id);
      this.plugin.setHighlightColor(this.file.path, id, colorId);
      erSendToColorNotes(this, this.plugin.getHighlights(this.file.path).filter((h) => gids.includes(h.id)));
      this.pager.flow?.querySelectorAll(gids.map((x) => `[data-hl-id="${x}"]`).join(",")).forEach((s) => { s.style.background = hlColorCss(colorId); });
      if (this.panelOpen === "highlights") this._buildHlPanel();
      this._hideHlPopup();
      return;
    }
    if (this._pendingSel && this.file) {
      // One highlight per paragraph the selection covered.
      const parts = this._pendingSel.parts || [this._pendingSel];
      const group = parts.length > 1 ? "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : null;
      const made = [];
      for (const part of parts) {
        const id = this._createHighlight(group ? { ...part, group } : part, colorId);
        if (id) made.push({ ...part, id, color: colorId, group });
      }
      selOf(this.areaEl)?.removeAllRanges();
      if (this.panelOpen === "highlights") this._buildHlPanel();
      // "Send every highlight to the book note" worked on the computer only —
      // the phone reader never looked at the setting.
      if (this.plugin.settings.quotesToBookNote === true && made.length) {
        for (const hl of erMergeHlGroups(made)) sendQuoteToBookNote(this, hl);
      }
      erSendToColorNotes(this, made);
    }
    this._hideHlPopup();
  }
  // Same as in the desktop reader: needed so a comment can create the highlight
  // it hangs on. Returns the new id.
  _createHighlight(sel, colorId) {
    if (!sel || !this.file) return null;
    const id = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const hl = { id, color: colorId, text: sel.text, block: sel.block, occ: sel.occ, pre: sel.pre, post: sel.post, created: Date.now() };
    if (sel.group) hl.group = sel.group;
    this.plugin.addHighlight(this.file.path, hl);
    const blocks = this.pager.flow ? this.pager.flow.querySelectorAll("p,h1,h2,h3,h4") : [];
    const block = blocks[hl.block];
    if (block) {
      const t = block.textContent;
      const loc = locateHl(t, hl);
      if (loc) wrapBlockRange(block, loc.start, loc.start + loc.len, { id: hl.id, color: hlColorCss(colorId) });
    }
    erRenderStopMark(this);
    return id;
  }
  _currentHl() {
    if (this._editHlId && this.file) {
      const id = this._editHlId;
      const hl = this.plugin.getHighlightQuotes(this.file.path).find((h) => h.id === id || (h.ids && h.ids.includes(id)));
      if (hl) return { id: hl.id, text: hl.text || "", block: hl.block, color: hl.color, comment: hl.comment };
    }
    if (this._pendingSel) return { text: this._pendingSel.text || "", block: this._pendingSel.block, color: null };
    return null;
  }
  _openHlEdit(id) {
    const span = this.pager.flow?.querySelector(`[data-hl-id="${id}"]`);
    if (!span) return;
    this._pendingSel = null;
    this._editHlId = id;
    erShowHlComment(this);
    this._showHlPopup(span.getBoundingClientRect());
  }
  _unwrapHighlight(id) {
    const flow = this.pager.flow;
    if (!flow) return;
    const ids = Array.isArray(id) ? id : [id];
    flow.querySelectorAll(ids.map((x) => `[data-hl-id="${x}"]`).join(",")).forEach((span) => {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
  }
  _showHlPopup(rect) {
    const pop = this.hlPopup;
    if (!this._editHlId) { pop.querySelector(".er-hl-cmtview")?.remove(); pop.removeClass("er-hl-popup-cmt"); }
    const sel = !this._editHlId && selOf(this.areaEl);
    pop.toggleClass("er-hl-can-carry", !!(sel && sel.rangeCount && erSelectionAtPageEnd(this, sel.getRangeAt(0))));
    pop.classList.add("er-hl-popup-on");
    positionHlPopup(this, rect, 230, 46);
  }
  _hideHlPopup() {
    erClearPaintedSelection();
    this._pendingSel = null;
    this._editHlId = null;
    if (this.hlPopup) this.hlPopup.classList.remove("er-hl-popup-on");
  }
  goToHighlight(id) {
    const hl = this.file ? this.plugin.getHighlights(this.file.path).find((h) => h.id === id) : null;
    if (!hl) return;
    this._closePanel();
    const [cur, tot] = this.pager.jumpTo(this.pager.spreadForBlock(hl.block));
    this._updateUI(cur, tot);
    if (this.file) this.plugin.saveProgress(this.file.path, cur, tot, this.pager.currentBlockIndex());
    window.requestAnimationFrame(() => {
      const span = this.pager.flow?.querySelector(`[data-hl-id="${id}"]`);
      if (span) {
        span.classList.add("er-hl-flash");
        window.setTimeout(() => span.classList.remove("er-hl-flash"), 1200);
      }
    });
  }
  _buildHlPanel() {
    const p = this.hlPan;
    p.empty();
    p.createDiv("er-pan-title").setText(__ertr("Выделения"));
    const list = this.file ? this.plugin.getHighlightQuotes(this.file.path) : [];
    if (!list.length) { p.createDiv("er-toc-empty").setText(__ertr("Пока нет выделений.\nВыделите текст и выберите цвет.")); return; }
    const exp = p.createDiv("er-hl-export");
    iconLabel(exp, "download", __ertr("Экспортировать в заметки ({0})", list.length));
    exp.setAttribute("aria-label", __ertr("Экспортировать все выделения"));
    exp.addEventListener("click", (e) => this.exportHighlights(e));
    const wrap = p.createDiv("er-toc-list");
    list.forEach((hl) => {
      const item = wrap.createDiv("er-hl-item");
      const dot = item.createDiv("er-hl-dot");
      dot.style.background = hlColorCss(hl.color);
      // Quote + comment share one column (er-hl-body) so the comment stacks UNDER
      // the quote. Without the wrapper both were flex siblings of the row, and the
      // comment's long word squeezed the quote down to one letter per line.
      const body = item.createDiv("er-hl-body");
      const txt = body.createDiv("er-hl-text");
      txt.setText(hl.text.length > 160 ? hl.text.slice(0, 160) + "…" : hl.text);
      if (hl.comment) body.createDiv("er-hl-comment").setText(hl.comment);
      // Export just this one highlight — via the ⋯ button, tap-and-hold or right-click.
      const showHlMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.file) return;
        const menu = new Menu();
        menu.addItem((it) => it.setTitle(__ertr("Создать заметку")).setIcon("file-plus").onClick(() => {
          createNoteFromSelection(this.app, this.plugin, hl.text, this.file, { extra: hlCommentMd(hl), color: hl.color, hl });
        }));
        menu.addItem((it) => it.setTitle(__ertr("Текстом в заметку книги")).setIcon("text-quote").onClick(() => {
          sendQuoteToBookNote(this, hl);
        }));
        menu.showAtMouseEvent(e);
      };
      const more = item.createDiv("er-hl-more");
      svgIcon(more, "more");
      more.setAttribute("aria-label", __ertr("Ещё"));
      more.addEventListener("click", showHlMenu);
      const del = item.createDiv("er-hl-del");
      svgIcon(del, "trash");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this.file) return;
        this.plugin.removeHighlight(this.file.path, hl.id);
        this._unwrapHighlight(hl.ids || hl.id);
        this._buildHlPanel();
      });
      item.addEventListener("click", () => this.goToHighlight(hl.id));
      item.addEventListener("contextmenu", showHlMenu);
    });
  }
  onClose() {
    erToggleAutoScroll(this, false);
    erTtsStop(this);
    erDailyLogFlush(this.plugin);
    stopReadingTimer(this);
    if (this.plugin._openReaderModal === this) this.plugin._openReaderModal = null;
    try { if (!this.plugin._unloading) this.app.saveLocalStorage(ER_OPEN_BOOK_KEY, null); } catch { /* storage is optional */ }
    // The search paint is a document-level highlight; it would outlive the book.
    clearFoundIn(this);
    if (this._selHandler) (this._selDoc || document).removeEventListener("selectionchange", this._selHandler);
    this._resizeObs?.disconnect();
    this._pdfLazy?.destroy?.();
    this._pdfLazy = null;
    window.clearTimeout(this._rsT);
    window.clearTimeout(this._selTimer);
    window.clearTimeout(this._immTimer);
    window.clearTimeout(this._revealT);
    this._closeWatch?.disconnect();
    this.contentEl.empty();
  }
};
// One group of settings, in its own window.
//
// A settings page long enough to scroll is a page nobody reads: the option you
// need is buried among twenty you set once a year and never think about again.
// The handful of controls touched while actually reading stay on the tab; the
// rest move behind a button, grouped by the job they belong to.
const SettingsGroupModal = class extends Modal {
  constructor(app, title, build) {
    super(app);
    this.title = title;
    this.build = build;
  }
  onOpen() {
    this.modalEl.addClass("er-settings-group");
    this.draw();
  }
  draw() {
    const c = this.contentEl;
    // The scrolling box itself is rebuilt below, so the position has to be
    // carried over by hand rather than left to the browser.
    const was = this.bodyEl ? this.bodyEl.scrollTop : 0;
    c.empty();
    c.createEl("h3", { text: this.title });
    this.bodyEl = c.createDiv("er-group-body");
    // Rebuilt on every redraw, because some of these settings decide whether
    // the others exist at all.
    this.build(this.bodyEl, () => this.draw());
    const row = c.createDiv("er-group-actions");
    // "Done" rather than "Save": every control here writes the moment it is
    // touched, exactly as it did on the settings page.
    const done = row.createEl("button", { cls: "mod-cta", text: __ertr("Готово") });
    done.addEventListener("click", () => this.close());
    if (was) this.bodyEl.scrollTop = was;
  }
  onClose() { this.contentEl.empty(); }
};
// Settings tab, simplified in 3.2.0: short one-line notes.
Object.assign(__erEN, {
  "Главная": "Home",
  "Перевод и ИИ": "Translate & AI",
  "Дополнительно": "More",
  "Доброй ночи": "Good night",
  "Доброе утро": "Good morning",
  "Добрый день": "Good afternoon",
  "Добрый вечер": "Good evening",
  "Вы остановились на «{0}» — {1}%.": "You stopped in “{0}” at {1}%.",
  "Что почитаем сегодня?": "What shall we read today?",
  "Продолжить чтение": "Continue reading",
  "Применится при следующем открытии книги.": "Applies the next time you open a book.",
  "Страницами, как книгу, или одной лентой, как сайт.": "Page by page like a book, or one long column like a web page.",
  "«По клику»: левая часть страницы — назад, правая — вперёд.": "\"By click\": the left part of the page goes back, the right goes forward.",
  "Отсчёт до дневной цели, запускается кнопкой ▶ в книге.": "A countdown to your daily goal, started with ▶ in the book.",
  "Шрифт, размер и тема меняются прямо в книге: кнопка ⚙ вверху.": "Font, size and theme are changed right in the book: the ⚙ button at the top.",
  "Сколько знаков в строке на широком экране.": "Characters per line on a wide screen.",
  "Страница плавно уезжает в сторону.": "The page slides away smoothly.",
  "Панели притухают, пока мышь не двигается.": "The bars fade while the mouse is still.",
  "Каждая глава EPUB начинается с чистой страницы.": "Each EPUB chapter starts on a fresh page.",
  "Картинки на страницах PDF с текстом": "Pictures on PDF pages with text",
  "Иллюстрации и схемы над текстом. Применится при следующем открытии.": "Illustrations and diagrams above the text. Applies the next time you open the book.",
  "Книга, открытая при закрытии приложения, вернётся на то же место.": "A book left open when the app closed comes back at the same place.",
  "Если панель заезжает под часы — 24–48. Ноль — как скажет система.": "If the bar slides under the clock, 24–48. Zero means trust the system.",
  "Красная строка, как в бумажной книге.": "An indented first line, as in a printed book.",
  "Шрифт, установленный на устройстве, например PT Serif.": "A font installed on this device, e.g. PT Serif.",
  ".ttf, .otf, .woff из хранилища — работает и на телефоне.": "A .ttf, .otf or .woff file in the vault; works on phones too.",
  "Куда прижать текст на неполной странице.": "Where to place the text on a page that is not full.",
  "Без анимаций и теней, чёрный на белом.": "No animations or shadows, black on white.",
  "Шрифт, тема и размер отдельно для компьютера, планшета и телефона. Это устройство: {0}.": "Font, theme and size kept separately for computer, tablet and phone. This device: {0}.",
  "Сюда кладутся заметки из выделений. Пусто — корень хранилища.": "Where notes from highlights go. Empty means the vault root.",
  "Шаблон для заметки из выделения. Пусто — без шаблона.": "A template for a note from a highlight. Empty means none.",
  "Создаётся сама при первом открытии книги.": "Created on its own the first time a book is opened.",
  "Каждое выделение дописывается в заметку книги.": "Every highlight is appended to the book's note.",
  "Где лежат заметки книг. Пусто — любая заметка хранилища.": "Where book notes live. Empty means any note in the vault.",
  "Заметку и шаблон для одной книги можно задать в самой книге: ⚙ → «Книга».": "A note and a template for one book are set in the book itself: ⚙ → Book.",
  "В папку книги, а не в общую.": "In the book's folder instead of the shared one.",
  "Перед созданием можно поправить короткое название.": "Lets you edit a short title before the note is created.",
  "Название — первое предложение фрагмента.": "The title is the passage's first sentence.",
  "Для выделения, созданного комментарием.": "For a highlight created by a comment.",
  "Значок комментария в панели над выделением.": "A comment button in the bar over a selection.",
  "Поля: {text}, {book}, {page}, {link}, {comment}. Пусто — по умолчанию.": "Fields: {text}, {book}, {page}, {link}, {comment}. Empty means the default.",
  "Открывает книгу на абзаце цитаты.": "Opens the book at the quote's paragraph.",
  "При экспорте цитаты группируются по главам.": "Exported quotes are grouped by chapter.",
  "Цитата в цветном <mark>.": "The quote in a coloured <mark>.",
  "Свойства reading-progress и reading-updated — для Bases.": "reading-progress and reading-updated properties, for Bases.",
  "Список изменений после обновления — отдельной заметкой.": "The list of changes after an update, as a note.",
  "Кнопка ✨ у выделения: разбор и вопросы о фрагменте.": "A ✨ button on a selection: a breakdown and questions about the passage.",
  "Хранится в хранилище и синхронизируется вместе с ним.": "Stored in the vault and synced with it.",
  "Перевод через Google Translate, нужен интернет.": "Translation through Google Translate; needs the internet.",
  "Локальная модель: текст никуда не уходит.": "Local model: the text goes nowhere.",
  "Фрагмент уходит на {0} только по вашему сообщению. Остальное работает офлайн.": "The passage is sent to {0} only when you send a message. Everything else works offline.",
  "Без этих функций читалка работает полностью офлайн.": "Without these the reader works fully offline.",
  "Что делать с фрагментом. Пусто — встроенный разбор.": "What to do with the passage. Empty means the built-in breakdown.",
  "Пусто — всё хранилище.": "Empty means the whole vault.",
  "Прогресс и выделения. Пусто — рядом с книгами.": "Progress and highlights. Empty means next to the books.",
  "Прогресс и выделения едут вместе с хранилищем.": "Progress and highlights travel with the vault.",
  "Копия прогресса и выделений за последние 7 дней.": "A copy of progress and highlights for the last 7 days.",
  "Файлы данных чтения:": "Reading data files:",
  "Книг: {0}. Привязки заметок, категории, шаблоны. Сами заметки не удаляются.": "Books: {0}. Linked notes, categories, templates. The notes themselves are not deleted.",
  "Напишите в телеграм-бот @book_in_obsidian_bot.": "Write to the Telegram bot @book_in_obsidian_bot.",
  "Как всё устроено и что делает каждая настройка.": "How it all works and what each setting does.",
  "Ключ Elton AI не подошёл": "The Elton AI key was not accepted",
  "Озвучить: выделенное или с этой страницы": "Read aloud: the selection, or from this page",
  "Остановить озвучку": "Stop reading aloud",
  "Готовлю озвучку…": "Preparing the voice…",
  "Загружаю продолжение…": "Loading what comes next…",
  "Ещё пара секунд…": "A few more seconds…",
  "Для озвучки нужен ключ Elton AI: Настройки → Функции → «ИИ, голос и перевод».": "Reading aloud needs an Elton AI key: Settings → Features → “AI, voice and translation”.",
  "Озвучка остановлена: {0}": "Reading aloud stopped: {0}",
  "Озвучить": "Read aloud",
  "Озвучка текста (Elton AI)": "Read aloud (Elton AI)",
  "Кнопка 🔊 рядом с таймером: читает выделенное или книгу с текущей страницы.": "A 🔊 button next to the timer: reads the selection, or the book from the current page.",
  "Голос": "Voice",
  "Скорость озвучки": "Reading-aloud speed",
  "Не удалось связаться с сервисом. Проверьте интернет и попробуйте ещё раз.": "Could not reach the service. Check the connection and try again.",
  "Повторить": "Try again",
  "Напомни, что было": "Remind me what happened",
  "У Elton AI сейчас закончились кредиты на озвучку — попробуйте позже.": "Elton AI has run out of credits for reading aloud right now — try again later.",
  "ИИ о книге": "AI about this book",
  "Спросить о книге": "Ask about the book",
  "Разобрать выделенное": "Break down the selection",
  "Показать панели": "Show the bars",
  "Без панелей": "No bars",
  "Без панелей / показать панели": "Hide / show the bars",
  "Без панелей на компьютере": "No bars on a computer",
  "Верхняя и нижняя панели убраны, книга на всё окно; подведите мышь к краю — панель появится. Ещё: ⋮ книги или команда.": "The top and bottom bars go and the book fills the window; move the pointer to an edge and the bar appears. Also from the book's ⋮ menu or a command.",
  "Чтение вслух": "Read aloud",
  "Живой голос Elton AI, звучащее слово подсвечено.": "A natural Elton AI voice, with the spoken word lit.",
  "Связь с заметками": "Linked to your notes",
  "Заметки со ссылкой на абзац видны прямо в тексте.": "Notes that link to a paragraph show right in the text.",
  "Больше не убегает до конца книги.": "No longer runs to the end of the book.",
  "Минуты до конца главы и книги, на виду.": "Minutes left in the chapter and the book, always in sight.",
  "Быстрые PDF": "Fast PDFs",
  "Повторно открываются за секунды.": "Open again in seconds.",
  "Слова и дневник": "Words and journal",
  "Карточки для повторения и чтение в ежедневной заметке.": "Review cards, and your reading in the daily note.",
  "Простые настройки": "Simpler settings",
  "Вкладки вместо прокрутки, лишнее выключается.": "Tabs instead of scrolling; turn off what you don't need.",
  "Markdown-заметки, стилус-маркер, пересказ через ИИ.": "Markdown notes, a stylus highlighter, an AI recap.",
  "Что нового в Book Reader": "What's New in Book Reader",
  "Версия {0}": "Version {0}",
  "Продолжить": "Continue",
  "Назад": "Back",
  "Выделение на телефоне": "Selecting on a phone",
  "Сколько осталось": "How much is left",
  "Все изменения": "All changes",
  "Дальше": "Next",
  "< 1 мин": "< 1 min",
  "≈ {0} до конца главы": "≈ {0} left in the chapter",
  "≈ {0} до конца книги": "≈ {0} left in the book",
  "До конца главы ≈ {0}, до конца книги ≈ {1}": "Left in the chapter ≈ {0}, in the book ≈ {1}",
  "Словарь": "Vocabulary",
  "В словарь: {0}": "Added to the vocabulary: {0}",
  "Не удалось записать в словарь: {0}": "Could not write to the vocabulary: {0}",
  "📖 Чтение: {0} мин": "📖 Reading: {0} min",
  "📖 Чтение": "📖 Reading",
  "Пока нечего пересказывать — это начало книги.": "Nothing to recap yet — this is the start of the book.",
  "Кратко перескажи, что произошло в этом отрывке: главное, кто есть кто, к чему пришли. Не додумывай то, чего в тексте нет, и ничего не говори о том, что будет дальше.": "Briefly recap what happened in this passage: the main points, who is who, where things stand. Do not add anything the text does not say, and say nothing about what comes next.",
  "В словарь (карточки)": "Add to vocabulary (cards)",
  "Поля страницы": "Page margins",
  "Узкие": "Narrow",
  "Обычные": "Normal",
  "Широкие": "Wide",
  "Между абзацами": "Between paragraphs",
  "Плотно": "Tight",
  "Обычно": "Normal",
  "Просторно": "Airy",
  "Напомнить, что было": "Recap what happened",
  "Функции": "Features",
  "Всё, что читалка умеет сверх чтения. Выключите ненужное — она станет легче. ⚡ — заметно влияет на скорость.": "Everything the reader does beyond reading. Turn off what you don't use and it gets lighter. ⚡ — noticeably affects speed.",
  "Время до конца главы": "Time left in the chapter",
  "«≈ 6 мин до конца главы» рядом с процентом прочитанного.": "“≈ 6 min left in the chapter” next to the percentage read.",
  "Скорость чтения, слов в минуту": "Reading speed, words per minute",
  "Заметки и связи": "Notes and links",
  "Заметки со ссылкой на место в книге ⚡": "Notes that link to a place in the book ⚡",
  "Значок у абзаца, на который ссылается ваша заметка: наведите — превью, нажмите — откроется. Один раз в фоне читает заметки хранилища.": "A mark at a paragraph your note links to: hover to preview, click to open. Reads the vault's notes once, in the background.",
  "Комментарии из заметки книги — в книгу": "Comments from the book note back into the book",
  "Поправили комментарий под цитатой в заметке книги — он обновится и в читалке.": "Edit a comment under a quote in the book note and it updates in the reader too.",
  "Удалять цитату из заметки книги вместе с выделением": "Remove the quote from the book note with its highlight",
  "Удалили выделение в книге — его цитата уйдёт и из заметки книги.": "Delete a highlight in the book and its quote leaves the book note too.",
  "Слова в карточки": "Words into flashcards",
  "Пункт «В словарь» в меню выделения: слово с переводом становится карточкой «слово::перевод» для плагинов интервального повторения.": "An “Add to vocabulary” item in the selection menu: the word and its translation become a “word::translation” card for spaced-repetition plugins.",
  "Заметка-словарь": "Vocabulary note",
  "Пусто — «Словарь» в корне хранилища. Перевод подставляется, если включён перевод.": "Empty means “Vocabulary” in the vault root. The translation is filled in when translation is on.",
  "Чтение — в ежедневную заметку": "Reading into the daily note",
  "Что и сколько читали сегодня — одним блоком в сегодняшней ежедневной заметке, если она есть (Ежедневные заметки или Periodic Notes).": "What and how much you read today, as one block in today's daily note if it exists (Daily notes or Periodic Notes).",
  "Кэш PDF": "PDF cache",
  "Разобранный PDF запоминается на этом устройстве: повторно открывается за секунды.": "A PDF once taken apart is kept on this device: it opens again in seconds.",
  "PDF: жирные подзаголовки отдельно ⚡": "PDF: bold subheadings apart ⚡",
  "ИИ, голос и перевод": "AI, voice and translation",
  "Пересказ прочитанного": "Recap of what you've read",
  "«Напомнить, что было» в меню книги: ИИ пересказывает последние страницы до текущей — без спойлеров.": "“Recap what happened” in the book menu: the AI retells the pages before this one — no spoilers.",
  "Ключи — в защищённом хранилище устройства": "Keys in the device's secure storage",
  "Ключи ИИ и озвучки не попадут в файлы настроек. Хранилище устройства не синхронизируется: ключ нужно ввести на каждом устройстве.": "AI and voice keys stay out of the settings files. The device's storage does not sync: enter the key on every device.",
  "Разобранные PDF на этом устройстве.": "PDFs taken apart on this device.",
  "Кэш PDF очищен: {0}": "PDF cache cleared: {0}",
  "Вкладка «Функции»: каждую возможность можно выключить; кэш PDF, время до конца главы, заметки со ссылкой на книгу прямо в тексте, комментарии из заметки книги, слова в карточки, чтение в ежедневную заметку, пересказ без спойлеров, поля и отступы между абзацами": "A “Features” tab: every capability can be switched off; PDF cache, time left in the chapter, notes linking to the book shown in the text, comments back from the book note, words into flashcards, reading in the daily note, a spoiler-free recap, margins and paragraph spacing",
  "По желанию": "Optional",
  "Читать заметки в Book Reader": "Read notes in Book Reader",
  "Пункт «Читать в Book Reader» в меню заметки и команда: заметка открывается как книга, с закладкой и выделениями.": "A “Read in Book Reader” item in a note's menu and a command: the note opens like a book, with its place and highlights.",
  "Номер страницы вверху": "Page number at the top",
  "Счётчик страниц — в верхней панели, нижняя панель убирается. Применится при следующем открытии книги.": "The page counter moves to the top bar and the bottom bar goes. Applies the next time you open a book.",
  "Стилус как маркер": "Stylus as a highlighter",
  "Провёл стилусом (Apple Pencil и др.) по тексту — он выделен цветом по умолчанию. Палец работает как обычно.": "Draw over text with a stylus (Apple Pencil and others) and it is highlighted in the default colour. A finger works as usual.",
  "Большие PDF — начинать читать сразу": "Big PDFs — start reading at once",
  "PDF больше 300 страниц открывается, как только готова часть до вашего места; остальное догружается само.": "A PDF over 300 pages opens as soon as the part up to your place is ready; the rest loads behind it.",
  "PDF: жирные подзаголовки отдельно": "PDF: bold subheadings apart",
  "Жирный заголовок внутри абзаца становится отдельным подзаголовком. PDF открывается дольше; в уже читанных PDF место и выделения могут немного сдвинуться.": "A bold heading run into a paragraph becomes a subheading of its own. PDFs open more slowly; in PDFs you have already read, your place and highlights may shift a little.",
  "Читать в Book Reader": "Read in Book Reader",
  "Читать текущую заметку в Book Reader": "Read the current note in Book Reader",
  "Большая книга ещё загружается — оглавление и поиск дополнятся сами": "This big book is still loading — the contents and search will fill in on their own",
  "Опции по желанию в настройках (выключены): заметки Markdown в читалке, номер страницы вверху, стилус как маркер, быстрый старт больших PDF, жирные подзаголовки PDF": "Optional extras in the settings (off until you turn them on): Markdown notes in the reader, page number at the top, stylus as a highlighter, a quick start for big PDFs, bold PDF subheadings",
  "Скорость": "Speed",
  "Ключ Elton AI": "Elton AI key",
  "Для озвучки. Хранится в хранилище и синхронизируется вместе с ним.": "For reading aloud. Stored in the vault and synced with it.",
  "Озвучка через Elton AI: кнопка 🔊 рядом с таймером читает выделенное или книгу с текущей страницы": "Read aloud through Elton AI: the 🔊 button next to the timer reads the selection or the book from the current page",
  "Настройки плагина стали короче: приветствие на первой вкладке, редкое — в «Дополнительно»": "Plugin settings are shorter: a welcome on the first tab, rare options under “More”",
});
const SettingsTab = class extends PluginSettingTab {
  // A row that stands for a whole group: name, one line on what is inside, and
  // the button that opens it.
  _group(c, { name, desc, build }) {
    new Setting(c)
      .setName(name)
      .setDesc(desc)
      .addButton((b) => b
        .setButtonText(__ertr("Настроить"))
        .onClick(() => new SettingsGroupModal(this.app, name, build).open()));
  }
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  // Rebuild the page (needed when labels themselves change, e.g. the UI language)
  // while keeping the reader where they were — a plain display() drops the scroll
  // position back to the top, which felt like the settings "forgot" the place.
  _redraw() {
    const el = this.containerEl;
    const scroller = el.scrollHeight > el.clientHeight ? el : (el.closest(".vertical-tab-content") || el.parentElement || el);
    const y = scroller.scrollTop;
    this.display();
    scroller.scrollTop = y;
    window.requestAnimationFrame(() => { scroller.scrollTop = y; });
  }
  // Settings are split across tabs rather than one long scroll. The first tab
  // holds only what someone opening the settings usually came for: the
  // library, the language and their reading stats. Every other tab shows a
  // handful of settings with a one-line note each; whatever is set once and
  // forgotten sits folded under "Дополнительно" at the foot of the tab.
  // Первая вкладка — только библиотека, язык и статистика. В остальных — по
  // несколько главных настроек с одной строкой пояснения, редкое свёрнуто в
  // «Дополнительно».
  display() {
    const { containerEl: c } = this;
    c.empty();
    c.addClass("er-set");
    const TABS = [
      { id: "home", label: __ertr("Главная") },
      { id: "read", label: __ertr("Чтение") },
      { id: "look", label: __ertr("Вид") },
      { id: "notes", label: __ertr("Заметки") },
      { id: "features", label: __ertr("Функции") },
      { id: "data", label: __ertr("Данные") },
      { id: "about", label: __ertr("О плагине") }
    ];
    if (!this._tab || !TABS.some((t) => t.id === this._tab)) this._tab = "home";
    const bar = c.createDiv("er-set-tabs");
    TABS.forEach((t) => {
      const el = bar.createDiv("er-set-tab");
      el.setText(t.label);
      if (t.id === this._tab) el.addClass("er-set-tab-on");
      el.addEventListener("click", () => { this._tab = t.id; this.display(); });
    });
    const body = c.createDiv("er-set-body");
    const build = {
      home: () => this._tabHome(body),
      read: () => this._tabReading(body),
      look: () => this._tabLook(body),
      notes: () => this._tabNotes(body),
      features: () => this._tabFeatures(body),
      data: () => this._tabData(body),
      about: () => this._tabAbout(body)
    }[this._tab];
    build();
  }
  // A folded "Дополнительно" at the foot of a tab. Stays open across redraws
  // of the same tab, so changing a setting inside it does not fold it away.
  _more(c) {
    const open = this._moreOpen || (this._moreOpen = {});
    const tab = this._tab;
    const d = c.createEl("details", { cls: "er-set-more" });
    if (open[tab]) d.open = true;
    d.createEl("summary", { text: __ertr("Дополнительно") });
    d.addEventListener("toggle", () => { open[tab] = d.open; });
    return d.createDiv("er-set-more-body");
  }
  _hint(c, text) {
    return c.createDiv({ cls: "er-set-hint", text });
  }
  _repagAll() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && view.bookHtml) view.repaginate();
    }
  }
  // Lifetime reading stats. Built with createEl rather than innerHTML — no user
  // text is interpolated and store review flags raw HTML.
  _statsCard(c) {
    const st = readingStats(this.plugin.settings.readingLog, this.plugin.settings.lifetimeSeconds, readerTodayKey());
    // Nothing read yet: one friendly line instead of a card of dashes.
    if (!st.total) {
      c.createDiv({ cls: "er-stats er-stats-none", text: __ertr("Откройте книгу и включите таймер ▶ — здесь появится история чтения.") });
      return;
    }
    const card = c.createDiv({ cls: "er-stats" });

    const head = card.createDiv({ cls: "er-stats-head" });
    const total = head.createDiv({ cls: "er-stats-total" });
    total.createDiv({ cls: "er-stats-big", text: fmtReadTime(st.total) });
    total.createDiv({ cls: "er-stats-cap", text: __ertr("за всё время с книгами") });
    // A streak is the one number worth calling out; hide it at zero instead of
    // showing "0 дней подряд", which reads as a scolding.
    if (st.streak > 0) {
      const fl = head.createDiv({ cls: "er-stats-streak" });
      fl.createSpan({ cls: "er-stats-flame", text: "🔥" });
      fl.createSpan({ text: __ertr("{0} дн. подряд", st.streak) });
    }

    const grid = card.createDiv({ cls: "er-stats-grid" });
    const cell = (label, value) => {
      const d = grid.createDiv({ cls: "er-stats-cell" });
      d.createDiv({ cls: "er-stats-val", text: value });
      d.createDiv({ cls: "er-stats-lab", text: label });
    };
    cell(__ertr("сегодня"), fmtReadTime(st.today));
    cell(__ertr("дней с книгой"), st.daysRead ? String(st.daysRead) : "—");
    cell(__ertr("в среднем за день"), fmtReadTime(st.avgPerDay));
    cell(__ertr("лучший день"), fmtReadTime(st.best));

    // Two weeks at a glance. Bars are relative to the best day in the window, so
    // the shape stays readable whether you read 10 minutes a day or three hours.
    const peak = st.recent.reduce((a, r) => Math.max(a, r.sec), 0);
    if (peak > 0) {
      const chart = card.createDiv({ cls: "er-stats-chart" });
      const bars = chart.createDiv({ cls: "er-stats-bars" });
      for (const r of st.recent) {
        const col = bars.createDiv({ cls: "er-stats-bar" + (r.sec > 0 ? " is-read" : "") });
        const fill = col.createDiv({ cls: "er-stats-fill" });
        // Any reading at all keeps a visible stub, so a short day isn't invisible.
        fill.style.height = r.sec > 0 ? Math.max(8, Math.round(r.sec / peak * 100)) + "%" : "2px";
        col.setAttr("aria-label", r.key + " — " + fmtReadTime(r.sec));
        col.setAttr("title", r.key + " — " + fmtReadTime(r.sec));
      }
      const legend = chart.createDiv({ cls: "er-stats-legend" });
      legend.createSpan({ text: __ertr("14 дней назад") });
      legend.createSpan({ text: __ertr("сегодня") });
    } else {
      card.createDiv({ cls: "er-stats-empty", text: __ertr("Откройте книгу и включите таймер ▶ — здесь появится история чтения.") });
    }
  }

  // ── Главная ───────────────────────────────────────────────────────────────
  // A welcome rather than a form: a greeting, where the reader stopped, and
  // the two things people open the settings for — the library and the book
  // they were reading. Stats under it, the language at the foot.
  // Приветствие, а не форма: где остановился, библиотека и «продолжить».
  _tabHome(c) {
    const s = this.plugin.settings;
    const hero = c.createDiv("er-home");
    const h = new Date().getHours();
    hero.createDiv({
      cls: "er-home-hi",
      text: h < 5 ? __ertr("Доброй ночи") : h < 12 ? __ertr("Доброе утро") : h < 18 ? __ertr("Добрый день") : __ertr("Добрый вечер")
    });
    const lastPath = this.plugin._lastBookPath || s.lastBookPath;
    const lastF = lastPath ? this.app.vault.getAbstractFileByPath(lastPath) : null;
    const last = lastF && lastF.extension ? lastF : null;
    const prog = last ? this.plugin.getProgress(last.path) : null;
    hero.createDiv({
      cls: "er-home-sub",
      text: last
        ? __ertr("Вы остановились на «{0}» — {1}%.", erBookTitle(last), prog && prog.percent != null ? prog.percent : 0)
        : __ertr("Что почитаем сегодня?")
    });
    const acts = hero.createDiv("er-home-acts");
    // The first question on a phone is "where are my books?" — the ribbon icon
    // hides in the side menu there.
    const lib = acts.createEl("button", { cls: "mod-cta", text: __ertr("Открыть библиотеку") });
    lib.addEventListener("click", () => {
      try { this.app.setting.close(); } catch { /* settings already closed */ }
      this.plugin.openLibrary();
    });
    if (last) {
      const cont = acts.createEl("button", { text: __ertr("Продолжить чтение") });
      cont.addEventListener("click", () => {
        try { this.app.setting.close(); } catch { /* settings already closed */ }
        this.plugin.openFile(last);
      });
    }
    this._statsCard(c);
    // Language is on the tab that opens first: a setting whose purpose is "I do
    // not understand this screen" must not hide in the last tab.
    new Setting(c)
      .setName("Язык / Language / 语言")
      .setDesc(__ertr("Применится при следующем открытии книги."))
      .addDropdown((d) => d
        .addOption("ru", "Русский")
        .addOption("en", "English")
        .addOption("zh", "简体中文")
        .setValue(this.plugin.settings.language || "ru")
        .onChange(async (v) => {
          this.plugin.settings.language = v;
          // A deliberate choice: the automatic guess never overrides it later.
          this.plugin.settings.languagePicked = true;
          __erSetLang(v);
          // The AI answers in the interface language unless set otherwise.
          if (["русском", "English", "中文"].includes(this.plugin.settings.aiInto || "русском")) this.plugin.settings.aiInto = { ru: "русском", en: "English", zh: "中文" }[v] || "русском";
          await this.plugin.saveAll();
          this._redraw();
        }))
      .settingEl.addClass("er-home-lang");
  }
  // ── Чтение ────────────────────────────────────────────────────────────────
  _tabReading(c) {
    const s = this.plugin.settings;
    new Setting(c)
      .setName(__ertr("Как читать"))
      .setDesc(__ertr("Страницами, как книгу, или одной лентой, как сайт."))
      .addDropdown((d) => d
        .addOption("pages", __ertr("Страницами"))
        .addOption("scroll", __ertr("Прокруткой"))
        .setValue(s.readMode || "pages")
        .onChange(async (v) => { s.readMode = v; await this.plugin.saveAll(); this._repagAll(); }));
    new Setting(c)
      .setName(__ertr("Листание страниц"))
      .setDesc(__ertr("«По клику»: левая часть страницы — назад, правая — вперёд."))
      .addDropdown((d) => d
        .addOption("buttons", __ertr("Кнопками"))
        .addOption("click", __ertr("По клику мышкой"))
        .setValue(s.navMode || "buttons")
        .onChange(async (v) => { s.navMode = v; await this.plugin.saveAll(); }));
    new Setting(c)
      .setName(__ertr("Таймер цели чтения"))
      .setDesc(__ertr("Отсчёт до дневной цели, запускается кнопкой ▶ в книге."))
      .addToggle((t) => t.setValue(s.timerEnabled !== false).onChange(async (v) => {
        s.timerEnabled = v; await this.plugin.saveAll(); this._redraw();
      }));
    if (s.timerEnabled !== false) {
      new Setting(c)
        .setName(__ertr("Цель на день, минут"))
        .addSlider((sl) => sl.setLimits(5, 120, 5).setValue(s.dailyGoalMin || 15).setDynamicTooltip().onChange(async (v) => {
          s.dailyGoalMin = v; await this.plugin.saveAll();
        }));
    }
    this._hint(c, __ertr("Шрифт, размер и тема меняются прямо в книге: кнопка ⚙ вверху."));
    const m = this._more(c);
    new Setting(m)
      .setName(__ertr("Ширина строки"))
      .setDesc(__ertr("Сколько знаков в строке на широком экране."))
      .addDropdown((d) => d
        .addOption("0", __ertr("Во всю ширину"))
        .addOption("60", "60")
        .addOption("70", "70")
        .addOption("80", "80")
        .addOption("90", "90")
        .setValue(String(s.maxLineCh || 0))
        .onChange(async (v) => { s.maxLineCh = Number(v) || 0; await this.plugin.saveAll(); this._repagAll(); }));
    new Setting(m)
      .setName(__ertr("Анимация листания"))
      .setDesc(__ertr("Страница плавно уезжает в сторону."))
      .addToggle((t) => t.setValue(s.pageTurnAnimation !== false).onChange(async (v) => {
        s.pageTurnAnimation = v;
        await this.plugin.saveAll();
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view;
          if (view && view.pager && view.pager.flow) {
            view.pager.animate = v;
            view.pager.flow.toggleClass("er-flow-anim", v);
          }
        }
      }));
    new Setting(m)
      .setName(__ertr("Погружение (Immersive)"))
      .setDesc(__ertr("Панели притухают, пока мышь не двигается."))
      .addToggle((t) => t.setValue(s.immersive !== false).onChange(async (v) => {
        s.immersive = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Главы с новой страницы"))
      .setDesc(__ertr("Каждая глава EPUB начинается с чистой страницы."))
      .addToggle((t) => t.setValue(s.chapterBreaks !== false).onChange(async (v) => {
        s.chapterBreaks = v; await this.plugin.saveAll(); this.plugin._relayoutAll();
      }));
    new Setting(m)
      .setName(__ertr("Картинки на страницах PDF с текстом"))
      .setDesc(__ertr("Иллюстрации и схемы над текстом. Применится при следующем открытии."))
      .addToggle((t) => t.setValue(s.pdfShowFiguresOnTextPages === true).onChange(async (v) => {
        s.pdfShowFiguresOnTextPages = v; await this.plugin.saveAll();
      }));
    if (Platform.isMobile) {
      new Setting(m)
        .setName(__ertr("Открывать книгу снова после перезапуска"))
        .setDesc(__ertr("Книга, открытая при закрытии приложения, вернётся на то же место."))
        .addToggle((t) => t.setValue(s.reopenBookOnStart !== false).onChange(async (v) => {
          s.reopenBookOnStart = v; await this.plugin.saveAll();
        }));
      new Setting(m)
        .setName(__ertr("Отступ сверху на телефоне"))
        .setDesc(__ertr("Если панель заезжает под часы — 24–48. Ноль — как скажет система."))
        .addText((t) => t
          .setPlaceholder("0")
          .setValue(String(s.mobileTopInset || 0))
          .onChange(async (v) => {
            const n = Math.max(0, Math.min(120, Number(String(v).replace(/[^\d]/g, "")) || 0));
            s.mobileTopInset = n;
            await this.plugin.saveAll();
            // Applied to an open book straight away.
            const md = this.plugin._openReaderModal;
            if (md && md.contentEl) md.contentEl.style.setProperty("--er-extra-top", n + "px");
          }));
    }
  }
  // ── Вид ───────────────────────────────────────────────────────────────────
  _tabLook(c) {
    const s = this.plugin.settings;
    const relayout = () => this.plugin._relayoutAll();
    new Setting(c)
      .setName(__ertr("Шрифт книги"))
      .addDropdown((d) => {
        for (const [id, label] of erFontChoices(s)) d.addOption(id, label);
        d.setValue(s.fontFamily || "georgia").onChange(async (v) => {
          s.fontFamily = v; await this.plugin.saveAll(); relayout();
        });
      });
    new Setting(c)
      .setName(__ertr("Отступ первой строки"))
      .setDesc(__ertr("Красная строка, как в бумажной книге."))
      .addDropdown((d) => d
        .addOption("0", __ertr("Без отступа"))
        .addOption("1", "1em")
        .addOption("1.5", "1.5em")
        .addOption("2", "2em")
        .setValue(String(s.paraIndent || 0))
        .onChange(async (v) => { s.paraIndent = Number(v) || 0; await this.plugin.saveAll(); relayout(); }));
    new Setting(c)
      .setName(__ertr("Поля страницы"))
      .addDropdown((d) => d
        .addOption("narrow", __ertr("Узкие"))
        .addOption("normal", __ertr("Обычные"))
        .addOption("wide", __ertr("Широкие"))
        .setValue(s.pageMargin || "normal")
        .onChange(async (v) => { s.pageMargin = v; await this.plugin.saveAll(); relayout(); }));
    new Setting(c)
      .setName(__ertr("Между абзацами"))
      .addDropdown((d) => d
        .addOption("0.3", __ertr("Плотно"))
        .addOption("0.75", __ertr("Обычно"))
        .addOption("1.2", __ertr("Просторно"))
        .setValue(String(s.paraSpacing || 0.75))
        .onChange(async (v) => { s.paraSpacing = Number(v) || 0.75; await this.plugin.saveAll(); relayout(); }));
    new Setting(c)
      .setName(__ertr("Выравнивание текста"))
      .addDropdown((d) => d
        .addOption("left", __ertr("Слева"))
        .addOption("justify", __ertr("По ширине"))
        .addOption("center", __ertr("По центру"))
        .addOption("right", __ertr("Справа"))
        .setValue(s.textAlign || "left")
        .onChange(async (v) => { s.textAlign = v; await this.plugin.saveAll(); relayout(); }));
    new Setting(c)
      .setName(__ertr("Подложка страницы"))
      .addDropdown((d) => d
        .addOption("none", __ertr("Цвет темы"))
        .addOption("paper", __ertr("Фактура бумаги"))
        .addOption("image", __ertr("Своя картинка"))
        .setValue(s.pageTexture || "none")
        .onChange(async (v) => { s.pageTexture = v; await this.plugin.saveAll(); this._redraw(); relayout(); }));
    if (s.pageTexture === "image") {
      new Setting(c)
        .setName(__ertr("Картинка подложки"))
        .addText((t) => {
          t.setPlaceholder("Files/paper.jpg").setValue(s.pageTextureFile || "");
          attachPathInput(this.app, t, async (v) => { s.pageTextureFile = v; await this.plugin.saveAll(); relayout(); });
        });
      new Setting(c)
        .setName(__ertr("Как класть картинку"))
        .addDropdown((d) => d
          .addOption("stretch", __ertr("Растянуть на страницу"))
          .addOption("tile", __ertr("Плиткой"))
          .setValue(s.pageTextureMode || "stretch")
          .onChange(async (v) => { s.pageTextureMode = v; await this.plugin.saveAll(); relayout(); }));
    }
    const m = this._more(c);
    new Setting(m)
      .setName(__ertr("Свой шрифт: название"))
      .setDesc(__ertr("Шрифт, установленный на устройстве, например PT Serif."))
      .addText((t) => t.setPlaceholder("PT Serif").setValue(s.customFontName || "").onChange(async (v) => {
        s.customFontName = v.trim(); await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Свой шрифт: файл в хранилище"))
      .setDesc(__ertr(".ttf, .otf, .woff из хранилища — работает и на телефоне."))
      .addText((t) => {
        t.setPlaceholder("Fonts/Literata.ttf").setValue(s.customFontFile || "");
        attachPathInput(this.app, t, async (v) => {
          s.customFontFile = v;
          if (v && !s.fontFamily) s.fontFamily = "custom";
          await this.plugin.saveAll();
          relayout();
        });
      });
    new Setting(m)
      .setName(__ertr("Положение текста на странице"))
      .setDesc(__ertr("Куда прижать текст на неполной странице."))
      .addDropdown((d) => d
        .addOption("top", __ertr("Сверху"))
        .addOption("center", __ertr("По центру"))
        .addOption("bottom", __ertr("Снизу"))
        .setValue(s.vAlign || "top")
        .onChange(async (v) => { s.vAlign = v; await this.plugin.saveAll(); relayout(); }));
    new Setting(m)
      .setName(__ertr("Режим для e-ink читалок"))
      .setDesc(__ertr("Без анимаций и теней, чёрный на белом."))
      .addToggle((t) => t.setValue(s.einkMode === true).onChange(async (v) => {
        s.einkMode = v;
        // The e-ink palette is part of the mode; switching back restores light.
        if (v) s.theme = "eink";
        else if (s.theme === "eink") s.theme = "auto";
        await this.plugin.saveAll();
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          const view = leaf.view;
          if (view && view.applyVars) { view.applyVars(); if (view.bookHtml) view.repaginate(); }
        }
      }));
    new Setting(m)
      .setName(__ertr("Свой вид на каждом устройстве"))
      .setDesc(__ertr("Шрифт, тема и размер отдельно для компьютера, планшета и телефона. Это устройство: {0}.",
        __ertr({ desktop: "компьютер", tablet: "планшет", phone: "телефон" }[erDeviceKey()])))
      .addToggle((t) => t.setValue(s.perDevice === true).onChange(async (v) => {
        s.perDevice = v;
        await this.plugin.saveAll();
        this._redraw();
      }));
  }
  // ── Заметки ───────────────────────────────────────────────────────────────
  _tabNotes(c) {
    const s = this.plugin.settings;
    new Setting(c)
      .setName(__ertr("Папка для новых заметок"))
      .setDesc(__ertr("Сюда кладутся заметки из выделений. Пусто — корень хранилища."))
      .addText((t) => {
        t.setPlaceholder("Inbox").setValue(s.notesFolder || "");
        attachPathInput(this.app, t, async (v) => { s.notesFolder = v; await this.plugin.saveAll(); });
      });
    new Setting(c)
      .setName(__ertr("Шаблон заметки"))
      .setDesc(__ertr("Шаблон для заметки из выделения. Пусто — без шаблона."))
      .addText((t) => t.setPlaceholder(__ertr("Templates/Шаблон.md")).setValue(s.noteTemplate || "").onChange(async (v) => {
        s.noteTemplate = v.trim(); await this.plugin.saveAll();
      }));
    new Setting(c)
      .setName(__ertr("Своя заметка на каждую книгу"))
      .setDesc(__ertr("Создаётся сама при первом открытии книги."))
      .addToggle((t) => t.setValue(s.autoBookNote === true).onChange(async (v) => {
        s.autoBookNote = v;
        await this.plugin.saveAll();
        if (v) new Notice(__ertr("Это первая версия функции — проверьте результат на паре книг. Заметка создаётся один раз при первом открытии книги."), 6e3);
      }));
    new Setting(c)
      .setName(__ertr("Цитаты сразу в заметку книги"))
      .setDesc(__ertr("Каждое выделение дописывается в заметку книги."))
      .addToggle((t) => t.setValue(s.quotesToBookNote === true).onChange(async (v) => {
        s.quotesToBookNote = v; await this.plugin.saveAll();
      }));
    new Setting(c)
      .setName(__ertr("Папка заметок-книг (для ссылок)"))
      .setDesc(__ertr("Где лежат заметки книг. Пусто — любая заметка хранилища."))
      .addText((t) => {
        t.setPlaceholder(__ertr("3. Resources/База книг")).setValue(s.bookNotesFolder || "");
        attachPathInput(this.app, t, async (v) => { s.bookNotesFolder = v; await this.plugin.saveAll(); });
      });
    this._hint(c, __ertr("Заметку и шаблон для одной книги можно задать в самой книге: ⚙ → «Книга»."));
    const m = this._more(c);
    new Setting(m)
      .setName(__ertr("Класть заметки рядом с книгой"))
      .setDesc(__ertr("В папку книги, а не в общую."))
      .addToggle((t) => t.setValue(s.notesNextToBook === true).onChange(async (v) => {
        s.notesNextToBook = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Куда открывать новую заметку"))
      .addDropdown((d) => d
        .addOption("split", __ertr("Рядом с книгой"))
        .addOption("tab", __ertr("В новой вкладке"))
        .addOption("none", __ertr("Не открывать"))
        .setValue(s.noteOpenMode || "split")
        .onChange(async (v) => { s.noteOpenMode = v; await this.plugin.saveAll(); }));
    new Setting(m)
      .setName(__ertr("Спрашивать название заметки"))
      .setDesc(__ertr("Перед созданием можно поправить короткое название."))
      .addToggle((t) => t.setValue(s.askNoteTitle !== false).onChange(async (v) => {
        s.askNoteTitle = v; await this.plugin.saveAll(); this._redraw();
      }));
    // Only meaningful when the dialog is off — otherwise the reader decides each time.
    if (s.askNoteTitle === false) {
      new Setting(m)
        .setName(__ertr("Короткие названия без вопросов"))
        .setDesc(__ertr("Название — первое предложение фрагмента."))
        .addToggle((t) => t.setValue(s.shortNoteTitles !== false).onChange(async (v) => {
          s.shortNoteTitles = v; await this.plugin.saveAll();
        }));
    }
    new Setting(m)
      .setName(__ertr("Цвет выделения по умолчанию"))
      .setDesc(__ertr("Для выделения, созданного комментарием."))
      .addDropdown((d) => {
        HL_COLORS.forEach((col) => d.addOption(col.id, col.name));
        d.setValue(s.defaultHlColor || HL_COLORS[0].id)
          .onChange(async (v) => { s.defaultHlColor = v; await this.plugin.saveAll(); });
      });
    new Setting(m)
      .setName(__ertr("Кнопка комментария у выделения"))
      .setDesc(__ertr("Значок комментария в панели над выделением."))
      .addToggle((t) => t.setValue(s.hlBarComment !== false).onChange(async (v) => {
        s.hlBarComment = v;
        await this.plugin.saveAll();
        // Rebuild the bar in every open reader so the change shows at once.
        for (const r of this.plugin._readers()) {
          const pop = r.hlPopup;
          if (pop) { pop.empty(); addBarButtons(r, pop); addMoreBtn(r, pop); }
        }
      }));
    // A multi-line field is stacked: title on top, the box full width below.
    const tpl = new Setting(m)
      .setName(__ertr("Формат скопированной цитаты"))
      .setDesc(__ertr("Поля: {text}, {book}, {page}, {link}, {comment}. Пусто — по умолчанию."))
      .addTextArea((t) => {
        t.setPlaceholder(QUOTE_TEMPLATE_DEFAULT)
          .setValue(s.quoteTemplate || "")
          .onChange(async (v) => { s.quoteTemplate = v; await this.plugin.saveAll(); });
        t.inputEl.rows = 4;
        t.inputEl.addClass("er-tpl-input");
      });
    tpl.settingEl.addClass("er-set-stacked");
    new Setting(m)
      .setName(__ertr("Ссылка на место в книге под цитатой"))
      .setDesc(__ertr("Открывает книгу на абзаце цитаты."))
      .addToggle((t) => t.setValue(s.quoteBacklinks !== false).onChange(async (v) => {
        s.quoteBacklinks = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Подпись этой ссылки"))
      .addText((t) => t
        .setPlaceholder(__ertr("↪ к месту в книге"))
        .setValue(s.quoteBacklinkLabel || "")
        .onChange(async (v) => { s.quoteBacklinkLabel = v; await this.plugin.saveAll(); }));
    new Setting(m)
      .setName(__ertr("Заголовок главы над цитатами"))
      .setDesc(__ertr("При экспорте цитаты группируются по главам."))
      .addToggle((t) => t.setValue(s.quoteChapterHeadings !== false).onChange(async (v) => {
        s.quoteChapterHeadings = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Сохранять цвет выделений при экспорте"))
      .setDesc(__ertr("Цитата в цветном <mark>."))
      .addToggle((t) => t.setValue(s.exportColors !== false).onChange(async (v) => {
        s.exportColors = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Прогресс в свойствах заметки книги"))
      .setDesc(__ertr("Свойства reading-progress и reading-updated — для Bases."))
      .addToggle((t) => t.setValue(s.progressToFrontmatter === true).onChange(async (v) => {
        s.progressToFrontmatter = v; await this.plugin.saveAll();
      }));
    new Setting(m)
      .setName(__ertr("Сохранять «Что нового» заметкой"))
      .setDesc(__ertr("Список изменений после обновления — отдельной заметкой."))
      .addToggle((t) => t.setValue(s.whatsNewNote === true).onChange(async (v) => {
        s.whatsNewNote = v; await this.plugin.saveAll();
      }));
  }
  // ── Перевод и ИИ ──────────────────────────────────────────────────────────
  // ── Функции ───────────────────────────────────────────────────────────────
  // Everything the reader does beyond reading, one switch each, in one place —
  // so a slow phone can be made light by turning off what is not used. A
  // feature's own settings appear under its switch only while it is on.
  // Все возможности сверх чтения — по переключателю, настройки под ним.
  _tabFeatures(c) {
    const s = this.plugin.settings;
    this._hint(c, __ertr("Всё, что читалка умеет сверх чтения. Выключите ненужное — она станет легче. ⚡ — заметно влияет на скорость."));
    const group = (title) => c.createEl("h3", { cls: "er-set-sub", text: title });
    const sw = (name, desc, key, opts = {}) => new Setting(c)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) => t.setValue(opts.def ? s[key] !== false : s[key] === true).onChange(async (v) => {
        s[key] = v;
        await this.plugin.saveAll();
        if (opts.after) await opts.after(v);
        if (opts.redraw) this._redraw();
      }));
    const sub = () => c.createDiv("er-set-subopts");
    const repaint = () => { for (const r of this.plugin._readers()) { erPaintTimeLeft(r); erRenderBacklinkMarks(r); } };

    group(__ertr("Чтение"));
    sw(__ertr("Время до конца главы"), __ertr("«≈ 6 мин до конца главы» рядом с процентом прочитанного."), "timeLeft", { def: true, redraw: true, after: repaint });
    if (s.timeLeft !== false) {
      new Setting(sub())
        .setName(__ertr("Скорость чтения, слов в минуту"))
        .addSlider((sl) => sl.setLimits(80, 400, 10).setValue(Number(s.readWpm) || 180).setDynamicTooltip().onChange(async (v) => {
          s.readWpm = v; await this.plugin.saveAll(); repaint();
        }));
    }
    sw(__ertr("Без панелей на компьютере"), __ertr("Верхняя и нижняя панели убраны, книга на всё окно; подведите мышь к краю — панель появится. Ещё: ⋮ книги или команда."), "desktopNoBars", { after: (v) => { for (const r of this.plugin._readers()) if (!r._applyFullscreen) erDesktopNoBars(r, v); } });
    sw(__ertr("Номер страницы вверху"), __ertr("Счётчик страниц — в верхней панели, нижняя панель убирается. Применится при следующем открытии книги."), "pageNumTop");
    sw(__ertr("Стилус как маркер"), __ertr("Провёл стилусом (Apple Pencil и др.) по тексту — он выделен цветом по умолчанию. Палец работает как обычно."), "stylusMarker");
    sw(__ertr("Читать заметки в Book Reader"), __ertr("Пункт «Читать в Book Reader» в меню заметки и команда: заметка открывается как книга, с закладкой и выделениями."), "mdReader");

    group(__ertr("Заметки и связи"));
    sw(__ertr("Заметки со ссылкой на место в книге ⚡"), __ertr("Значок у абзаца, на который ссылается ваша заметка: наведите — превью, нажмите — откроется. Один раз в фоне читает заметки хранилища."), "bookBacklinks", { def: true, after: repaint });
    sw(__ertr("Комментарии из заметки книги — в книгу"), __ertr("Поправили комментарий под цитатой в заметке книги — он обновится и в читалке."), "syncCommentsFromNote", { def: true });
    sw(__ertr("Удалять цитату из заметки книги вместе с выделением"), __ertr("Удалили выделение в книге — его цитата уйдёт и из заметки книги."), "syncDeleteToNote");
    sw(__ertr("Слова в карточки"), __ertr("Пункт «В словарь» в меню выделения: слово с переводом (или с предложением из книги) становится карточкой для повторения."), "vocabEnabled", { redraw: true });
    if (s.vocabEnabled === true) {
      new Setting(sub())
        .setName(__ertr("Куда класть карточки"))
        .setDesc(__ertr("Авто — в FSRS, если он есть в хранилище, иначе в заметку-словарь для Spaced Repetition."))
        .addDropdown((d) => d
          .addOption("auto", __ertr("Авто"))
          .addOption("note", __ertr("Заметка-словарь (Spaced Repetition)"))
          .addOption("fsrs", __ertr("FSRS"))
          .setValue(s.vocabTarget || "auto")
          .onChange(async (v) => { s.vocabTarget = v; await this.plugin.saveAll(); }));
      new Setting(sub())
        .setName(__ertr("Заметка-словарь"))
        .setDesc(__ertr("Пусто — «Словарь» в корне хранилища."))
        .addText((t) => {
          t.setPlaceholder(__ertr("Словарь")).setValue(s.vocabFile || "");
          attachPathInput(this.app, t, async (v) => { s.vocabFile = v; await this.plugin.saveAll(); });
        });
    }
    sw(__ertr("Чтение — в ежедневную заметку"), __ertr("Что и сколько читали сегодня — одним блоком в сегодняшней ежедневной заметке, если она есть (Ежедневные заметки или Periodic Notes)."), "dailyLog");

    group(__ertr("PDF"));
    sw(__ertr("Кэш PDF"), __ertr("Разобранный PDF запоминается на этом устройстве: повторно открывается за секунды."), "pdfCache", { def: true });
    sw(__ertr("Большие PDF — начинать читать сразу"), __ertr("PDF больше 300 страниц открывается, как только готова часть до вашего места; остальное догружается само."), "pdfProgressive");
    sw(__ertr("PDF: жирные подзаголовки отдельно ⚡"), __ertr("Жирный заголовок внутри абзаца становится отдельным подзаголовком. PDF открывается дольше; в уже читанных PDF место и выделения могут немного сдвинуться."), "pdfBoldHeads");

    group(__ertr("ИИ, голос и перевод"));
    this._tabTranslate(c);
    if (s.aiEnabled) {
      sw(__ertr("Пересказ прочитанного"), __ertr("«Напомнить, что было» в меню книги: ИИ пересказывает последние страницы до текущей — без спойлеров."), "aiRecap", { def: true });
    }
    if (erSecretsAvailable(this.app)) {
      sw(__ertr("Ключи — в защищённом хранилище устройства"), __ertr("Ключи ИИ и озвучки не попадут в файлы настроек. Хранилище устройства не синхронизируется: ключ нужно ввести на каждом устройстве."), "keysInSecretStorage", {
        after: async (v) => { if (v) erBindSecrets(this.plugin); else erUnbindSecrets(this.plugin); await this.plugin.saveAll(); }
      });
    }
  }
  _tabTranslate(c) {
    const s = this.plugin.settings;
    new Setting(c)
      .setName(__ertr("Разбор фрагмента через ИИ"))
      .setDesc(__ertr("Кнопка ✨ у выделения: разбор и вопросы о фрагменте."))
      .addToggle((t) => t.setValue(s.aiEnabled === true).onChange(async (v) => {
        s.aiEnabled = v; await this.plugin.saveAll(); this._redraw();
      }));
    let cfg = null;
    if (s.aiEnabled) {
      cfg = aiConfig(s);
      new Setting(c)
        .setName(__ertr("Сервис"))
        .addDropdown((d) => {
          for (const [id, p] of Object.entries(AI_PROVIDERS)) d.addOption(id, p.label);
          d.setValue(s.aiProvider || "eltonlabs").onChange(async (v) => {
            s.aiProvider = v;
            // The model belongs to the provider: carrying one service's model
            // name over to another fails on the first request with a bare 404.
            s.aiModel = "";
            await this.plugin.saveAll();
            this._redraw();
          });
        });
      if (AI_PROVIDERS[s.aiProvider || "eltonlabs"].needsKey) {
        new Setting(c)
          .setName(__ertr("Ключ"))
          .setDesc(__ertr("Хранится в хранилище и синхронизируется вместе с ним."))
          .addText((t) => {
            t.inputEl.type = "password";
            t.setPlaceholder("sk-…").setValue(s.aiKey || "").onChange(async (v) => {
              s.aiKey = v.trim(); await this.plugin.saveAll();
            });
          });
      }
    }
    new Setting(c)
      .setName(__ertr("Кнопка перевода в выделении"))
      .setDesc(__ertr("Перевод через Google Translate, нужен интернет."))
      .addToggle((t) => t.setValue(s.translateEnabled === true).onChange(async (v) => {
        s.translateEnabled = v;
        await this.plugin.saveAll();
        this._redraw();
        if (v) new Notice(__ertr("Это первая версия функции. Перевод идёт через бесплатный Google Translate: нужен интернет, есть лимиты на частые запросы, а выделенный фрагмент уходит на серверы Google. Для больших объёмов пока не рассчитано."), 1e4);
      }));
    if (s.translateEnabled) {
      new Setting(c)
        .setName(__ertr("Переводить на язык"))
        .addDropdown((d) => d
          .addOption("ru", __ertr("Русский"))
          .addOption("en", "English")
          .addOption("de", "Deutsch")
          .addOption("fr", "Français")
          .addOption("es", "Español")
          .addOption("zh-CN", "中文")
          .setValue(s.translateTo || "ru")
          .onChange(async (v) => { s.translateTo = v; await this.plugin.saveAll(); }));
    }
    new Setting(c)
      .setName(__ertr("Озвучка текста (Elton AI)"))
      .setDesc(__ertr("Кнопка 🔊 рядом с таймером: читает выделенное или книгу с текущей страницы."))
      .addToggle((t) => t.setValue(s.ttsEnabled === true).onChange(async (v) => {
        s.ttsEnabled = v; await this.plugin.saveAll(); this._redraw();
      }));
    if (s.ttsEnabled === true) {
      new Setting(c)
        .setName(__ertr("Голос"))
        .addDropdown((d) => {
          for (const v of ER_TTS_VOICES) d.addOption(v, v);
          d.setValue(ER_TTS_VOICES.includes(s.ttsVoice) ? s.ttsVoice : ER_TTS_VOICES[0])
            .onChange(async (v) => { s.ttsVoice = v; await this.plugin.saveAll(); });
        });
      new Setting(c)
        .setName(__ertr("Скорость"))
        .addDropdown((d) => d
          .addOption("0.9", "0.9×")
          .addOption("1", "1×")
          .addOption("1.25", "1.25×")
          .addOption("1.5", "1.5×")
          .addOption("1.75", "1.75×")
          .addOption("2", "2×")
          .setValue(String(s.ttsRate || 1))
          .onChange(async (v) => { s.ttsRate = Number(v) || 1; await this.plugin.saveAll(); }));
      // The Elton AI key is one key: with Elton AI as the breakdown service it
      // is the same field; with another service, a key of its own for speech.
      const shared = (s.aiProvider || "eltonlabs") === "eltonlabs";
      if (!(shared && s.aiEnabled)) {
        new Setting(c)
          .setName(__ertr("Ключ Elton AI"))
          .setDesc(__ertr("Для озвучки. Хранится в хранилище и синхронизируется вместе с ним."))
          .addText((t) => {
            t.inputEl.type = "password";
            t.setValue(shared ? (s.aiKey || "") : (s.ttsKey || "")).onChange(async (v) => {
              if (shared) s.aiKey = v.trim(); else s.ttsKey = v.trim();
              await this.plugin.saveAll();
            });
          });
      }
    }
    this._hint(c, cfg
      ? (cfg.id === "local"
        ? __ertr("Локальная модель: текст никуда не уходит.")
        : __ertr("Фрагмент уходит на {0} только по вашему сообщению. Остальное работает офлайн.", cfg.base))
      : __ertr("Без этих функций читалка работает полностью офлайн."));
    if (s.aiEnabled) {
      const m = this._more(c);
      new Setting(m)
        .setName(__ertr("Модель"))
        .setDesc(__ertr("Пусто — модель по умолчанию для этого сервиса: {0}", cfg.model))
        .addText((t) => t.setPlaceholder(cfg.model).setValue(s.aiModel || "").onChange(async (v) => {
          s.aiModel = v.trim(); await this.plugin.saveAll();
        }));
      const sys = new Setting(m)
        .setName(__ertr("Свой системный промпт"))
        .setDesc(__ertr("Что делать с фрагментом. Пусто — встроенный разбор."))
        .addTextArea((t) => {
          t.inputEl.rows = 5;
          t.inputEl.addClass("er-ai-sys");
          t.setPlaceholder(__ertr("Например: объясни простыми словами и дай два примера из жизни."))
            .setValue(s.aiSystem || "").onChange(async (v) => { s.aiSystem = v; await this.plugin.saveAll(); });
        });
      sys.settingEl.addClass("er-set-stacked");
      new Setting(m)
        .setName(__ertr("Отвечать на языке"))
        .addText((t) => t.setPlaceholder("русском").setValue(s.aiInto || "русском").onChange(async (v) => {
          s.aiInto = v.trim() || "русском"; await this.plugin.saveAll();
        }));
    }
  }
  // ── Данные ────────────────────────────────────────────────────────────────
  _tabData(c) {
    const s = this.plugin.settings;
    new Setting(c)
      .setName(__ertr("Папка с книгами"))
      .setDesc(__ertr("Пусто — всё хранилище."))
      .addText((t) => {
        t.setPlaceholder("0. Files/3. PDF-files").setValue(s.booksFolder);
        attachPathInput(this.app, t, async (v) => {
          s.booksFolder = v;
          await this.plugin._saveLocalData();
          await this.plugin.saveAll();
        });
      });
    new Setting(c)
      .setName(__ertr("Папка данных чтения"))
      .setDesc(__ertr("Прогресс и выделения. Пусто — рядом с книгами."))
      .addText((t) => {
        t.setPlaceholder(__ertr("Рядом с книгами")).setValue(s.dataFolder || "");
        attachPathInput(this.app, t, async (v) => {
          s.dataFolder = v;
          await this.plugin._saveLocalData();
          await this.plugin.saveAll();
        });
      });
    new Setting(c)
      .setName(__ertr("Способ синхронизации"))
      .setDesc(__ertr("Прогресс и выделения едут вместе с хранилищем."))
      .addDropdown((d) => d
        .addOption("auto", __ertr("Авто (рекомендуется)"))
        .addOption("obsidian", "Obsidian Sync")
        .addOption("remotely", "Remotely Save / self-hosted")
        .addOption("cloud", __ertr("iCloud / Google Drive / папка"))
        .addOption("none", __ertr("Без синхронизации"))
        .setValue(s.syncMode || "auto")
        .onChange(async (v) => { s.syncMode = v; await this.plugin.saveAll(); }));
    new Setting(c)
      .setName(__ertr("Ежедневная резервная копия"))
      .setDesc(__ertr("Копия прогресса и выделений за последние 7 дней."))
      .addToggle((t) => t.setValue(s.rescueBackups !== false).onChange(async (v) => {
        s.rescueBackups = v; await this.plugin.saveAll();
      }));
    const m = this._more(c);
    // Built as nodes, not markup: the paths come from the user's own settings.
    const files = m.createDiv("er-set-hint");
    files.appendText(__ertr("Файлы данных чтения:"));
    for (const path of [this.plugin._progressFilePath(), this.plugin._highlightsFilePath()]) {
      files.createEl("br");
      files.createEl("code", { text: path });
    }
    new Setting(m).setName(__ertr("Кэш PDF")).setDesc(__ertr("Разобранные PDF на этом устройстве.")).addButton((b) => b.setButtonText(__ertr("Очистить")).onClick(async () => {
      const n = await erPdfCacheClear();
      new Notice(__ertr("Кэш PDF очищен: {0}", n));
    }));
    const thumbSet = new Setting(m).setName(__ertr("Кэш обложек")).setDesc(__ertr("Сохранено: {0}", Object.keys(this.plugin.thumbCache).length)).addButton((b) => b.setButtonText(__ertr("Очистить")).onClick(async () => {
      this.plugin.thumbCache = {};
      await this.plugin._saveThumbCache();
      new Notice(__ertr("Кэш очищен"));
      thumbSet.setDesc(__ertr("Сохранено: {0}", 0));
    }));
    const progSet = new Setting(m).setName(__ertr("Прогресс")).setDesc(__ertr("Книг: {0}", Object.keys(this.plugin.progress).length)).addButton((b) => b.setButtonText(__ertr("Очистить")).setWarning().onClick(async () => {
      this.plugin.progress = {};
      await this.plugin.saveAll();
      new Notice(__ertr("Прогресс очищен"));
      progSet.setDesc(__ertr("Книг: {0}", 0));
    }));
    const hlCount = Object.values(this.plugin.highlights).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    const hlSet = new Setting(m).setName(__ertr("Выделения")).setDesc(__ertr("Всего: {0}", hlCount)).addButton((b) => b.setButtonText(__ertr("Очистить все")).setWarning().onClick(async () => {
      this.plugin.highlights = {};
      await this.plugin._saveHighlightsToVault();
      new Notice(__ertr("Выделения очищены"));
      hlSet.setDesc(__ertr("Всего: {0}", 0));
    }));
    // What the reader remembers ABOUT each book: linked note, category,
    // template, and whether the setup screen was shown. None of the buttons
    // above touch that.
    const memCount = () => new Set([].concat(
      Object.keys(s.bookNoteLinks || {}),
      Object.keys(s.bookNotePrompted || {}),
      Object.keys(s.bookTags || {}),
      Object.keys(s.bookTemplates || {})
    )).size;
    const memDesc = (n) => __ertr("Книг: {0}. Привязки заметок, категории, шаблоны. Сами заметки не удаляются.", n);
    const memSet = new Setting(m).setName(__ertr("Память о книгах")).setDesc(memDesc(memCount()));
    let armed = false;
    memSet.addButton((b) => b.setButtonText(__ertr("Забыть все книги")).setWarning().onClick(async () => {
      // Two taps: this wipes links made by hand.
      if (!armed) {
        armed = true;
        b.setButtonText(__ertr("Точно забыть?"));
        window.setTimeout(() => { if (armed) { armed = false; b.setButtonText(__ertr("Забыть все книги")); } }, 4e3);
        return;
      }
      armed = false;
      b.setButtonText(__ertr("Забыть все книги"));
      s.bookNoteLinks = {};
      s.bookNotePrompted = {};
      s.bookTags = {};
      s.bookTemplates = {};
      await this.plugin.saveAll();
      new Notice(__ertr("Готово — читалка снова спросит про заметку при открытии книги"));
      memSet.setDesc(memDesc(0));
    }));
  }
  // ── О плагине ─────────────────────────────────────────────────────────────
  _tabAbout(c) {
    new Setting(c)
      .setName(__ertr("Пожелания и ошибки"))
      .setDesc(__ertr("Напишите в телеграм-бот @book_in_obsidian_bot."))
      .addButton((b) => b.setCta().setButtonText(__ertr("Написать в бота")).onClick(() => {
        window.open("https://t.me/book_in_obsidian_bot", "_blank");
      }));
    new Setting(c)
      .setName(__ertr("Инструкция по плагину"))
      .setDesc(__ertr("Как всё устроено и что делает каждая настройка."))
      .addButton((b) => b.setButtonText(__ertr("Открыть инструкцию")).onClick(() => new OnboardingModal(this.app, this.plugin).open()));
    new Setting(c)
      .setName(__ertr("Что нового"))
      .addButton((b) => b.setButtonText(__ertr("Показать")).onClick(() => {
        new WhatsNewModal(this.app, this.plugin, WHATS_NEW.slice(0, 4)).open();
      }));
    const about = c.createDiv("er-set-hint");
    about.appendText(__ertr("Book Reader {0} · Elton · ", this.plugin.manifest.version));
    about.createEl("a", { text: "t.me/eltonlabs", href: "https://t.me/eltonlabs" });
  }
};
export default EltonReader;
