# 📖 Book Reader

Read EPUB, FB2 and PDF books inside Obsidian — with highlights, comments, notes
and reading progress that syncs with your vault.

**[Русский](#-book-reader-по-русски) · English**

Works on desktop and on mobile (Android / iOS).

> **Feedback goes to the Telegram bot [@book_in_obsidian_bot](https://t.me/book_in_obsidian_bot).**
> Found a bug, missing a feature, something awkward on the phone — send it an
> ordinary message. No GitHub account, no form. Every message is read, and the
> next versions are built from them.

![Book Reader](docs/promo-hero-en.jpg)

|  |  |
| --- | --- |
| ![Library](docs/promo-library-en.jpg) | ![Reading](docs/promo-reading-en.jpg) |
| **Library** — covers, progress and categories for every book. | **Reading** — a two-column spread, your font, size and theme. |
| ![Highlights](docs/promo-highlights-en.jpg) | ![AI](docs/promo-ai-en.jpg) |
| **Highlights → notes** — six colours, a comment, and a note with the quote and a link back to the place in the book. | **Explain a passage** — a conversation, with the book's title sent as background context. |
| ![Mobile](docs/promo-mobile-en.jpg) | ![Themes](docs/promo-themes-en.jpg) |
| **On the phone** — its own layout: gestures and «⋯», nothing else. Position and highlights travel with your vault. | **Four themes** — light, sepia, dark and e-ink, plus auto that follows your Obsidian theme. |

---

## What it does

**Reading.** EPUB, FB2 and PDF. Paged layout in one or two columns, like a real
book. Dark, light and sepia themes, plus an e-ink mode for Android readers.
Adjustable font, size, line spacing, alignment and line width. Table of contents
built from PDF bookmarks, headings or the book's own printed contents page.
Full-text search across the whole book.

**Highlights and notes.** Six colours. A comment can be attached to any
highlight and travels with it into your notes. Turn a highlight into a note, or
export all of a book's highlights at once — grouped by chapter, with page
numbers. Notes that link to a paragraph show as a mark right in the text.

**Read aloud and AI.** A natural Elton AI voice reads the selection or the book
from the current page, lighting the word being spoken. The ✨ button asks about
the book or recaps what you read, without spoilers. Both are optional.

**Interface** in Russian, English and Simplified Chinese. Markdown notes can be
read in the reader too (optional).

**Progress.** Stored as files in your vault next to the books, so it rides
whatever you already use to sync (Obsidian Sync, iCloud, Google Drive, Remotely
Save…). The position is anchored by paragraph, so a phone and a desktop find the
same spot at any screen size.

**Library.** A visual grid of every book with covers, progress and categories.
Add books by dragging them in.

---

## Install

Book Reader is in the official catalogue:
**Settings → Community plugins → Browse**, search for **Book Reader**, then
**Install** and **Enable**.

### With BRAT (test builds)

1. Install **BRAT** from the community plugins list.
2. BRAT → *Add beta plugin* → `swayinfo/elton-reader`
3. Enable **Book Reader** in Community plugins.

### By hand

Download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://github.com/swayinfo/elton-reader/releases/latest)
into `<vault>/.obsidian/plugins/elton-reader-books/`, then reload Obsidian.

---

## Privacy and network use

**The reader works fully offline.** Books, progress, highlights and notes never
leave your device — the PDF engine is bundled into the plugin, so not even fonts
or workers are fetched from the internet.

A few optional features make network requests. None of them sends anything
until you turn it on or enter a key:

| Feature | Service | What is sent | Default |
|---|---|---|---|
| Translate a selection | Google Translate (`translate.googleapis.com`) | Only the passage you selected | **Off** |
| Words → flashcards | Google Translate (`translate.googleapis.com`) | Only the word you add | **Off** |
| Read aloud | Elton AI (`api.eltonlabs.org`, fallback `api.eltonlabs.ru`) | The text being read | **Off** until an Elton AI key is entered |
| Elton AI balance and top-up | Elton AI (`api.eltonlabs.org` / `.ru` for the balance, `base.eltonlabs.org` for a payment link) | Your Elton AI key and the amount you chose; the payment itself happens on the Prodamus page in your browser | Only when an Elton AI key is in use; a payment only when you press **Top up** |
| AI about the book, passage breakdown | The service **you** pick — Elton AI (`api.eltonlabs.org`), OpenRouter, OpenAI, or a local Ollama / LM Studio | Your question, the book's title and the passage or the page on screen | **Off** |

They live in *Settings → Features → AI, voice and translation*, and each says
the same thing in its own description before you enable it. The AI features
additionally need a provider and a key before they do anything.

Choosing **Ollama or LM Studio** keeps everything on your own machine — the
passage never reaches the internet at all.

The API keys you enter are stored in the plugin's settings inside your vault —
if your vault syncs, they sync with it — or, with *Keys in the device's secure
storage* on, in the device's own secure storage, which is never synced.

No account is required for the plugin itself, and there is no telemetry, no
analytics and no ads.

---

## What's new in 4.1

**Elton AI balance and top-up in the settings.** With Elton AI in use, *Settings → Features → AI, voice and translation* shows what is left on the key, and **Top up** pays any amount from 100 to 50,000 ₽ by card through Prodamus. The money lands on the key by itself; a key that has no e-mail yet asks for one (the receipt goes there).

## What's new in 4.0

Every report sent to the feedback bot, the club chat and the GitHub issues was
gone through, reproduced where it could be — on a real Android build of Obsidian
in an emulator, on desktop and against 38 test books in ten languages — and fixed.

**Read aloud.** A 🔊 button next to the timer reads the selection, or the book
from the page on screen onwards, in a natural narrator's voice through Elton AI.
The word being spoken is lit up and the pages turn on their own; the speed
(1×–2×) changes while it reads. The first words come in a few seconds: the text
is voiced in pieces, and the next ones are ready before the current one ends.
While the voice is being made, a “Preparing the voice…” chip at the foot of the
page says so — tap it to cancel. Eight voices to choose from.

**AI that knows your book.** The ✨ button in the top bar: *Ask about the book* —
the AI knows the title and sees the page in front of you; *Recap what happened* —
a short recap of the last pages, no spoilers, for when you come back to a book
after a week. With a selection: *Break down the selection*. The answer
saves as a note in one tap. Off until you turn it on.

**Chinese.** The interface is now in Simplified Chinese as well as Russian and
English; the language is picked on the first settings tab. Search, highlights,
the time left and reading aloud understand Chinese text.

**No bars.** On a computer the top and bottom bars can go away and the book fills
the window; move the mouse to an edge and the bar comes back. From the book's ⋮
menu, a command or the settings.

**Simpler settings.** The plugin settings open on a short welcome — the library,
the book you were reading, your reading stats and the language. Every other tab
keeps a few settings with a one-line note, and the rarely touched ones fold away
under *More*. The reading settings inside a book are tabs too: Text, Page,
Reading, Book — nothing to scroll.

**Your notes, inside the book.** A note that links to a paragraph shows as a
small mark in the text — hover for a preview, click to open. A comment edited
under a quote in the book note comes back into the book. A word goes into a
vocabulary note as a spaced-repetition card; today's reading goes into the daily
note. “≈ 6 min left in the chapter” sits next to the percentage (at the reading
speed set in the settings), and the contents light the chapter you are in and
scroll it to the middle. A PDF opens again in seconds from a cache. Every one of
these can be switched off under *Settings → Features*.

**Optional extras** (Settings → Features, off until you turn them on):
read Markdown notes in the reader, with a saved place and highlights; the page
number in the top bar instead of a bottom bar; a stylus (Apple Pencil and others)
as a highlighter — draw over text and it is marked; big PDFs (300+ pages) open at
your place while the rest loads; bold subheadings run into PDF paragraphs set
apart.

**Selecting on a phone works.** Dragging a selection handle to the foot of the
page used to select the rest of the book and paint every page: the page is a
slice of one wide strip, and the browser scrolled that strip to the end. The
strip can no longer scroll and a selection stays on the page; a **›** button in
the bar carries a quote over the page edge. A quote across several paragraphs is
one quote again — in the list, in export (paragraphs kept) and in the note.

**Phones.** PDFs open on older Android WebViews (the PDF engine now ships its
compatibility layer); the top bar sits below the clock on Samsung and others; a
book opened from the file list opens in the reader window and comes back after a
restart; search, "to the place in the book" links and the AI chat field above
the keyboard all work; an optional full-screen mode hides the bars until you tap
the middle of the page.

**Steadier.** Opening the contents or search no longer jerks the page sideways.
The book that was open when Obsidian closed opens again at the same place. AI
and voice keys can live in the device's secure storage instead of the settings
file.

**Highlights.** Six colours, on the phone too; a comment button in the bar; a
mark on highlights that carry a comment, which shows when tapped; a colour can
gather its quotes in a note of its own; a new colour or comment updates the
quote in the book note.

**Books.** EPUB pictures (`../Images`, SVG covers), internal links and footnotes,
contents from the book's own navigation; FB2 with imperfect markup; PDF running
heads and page numbers set apart, numbered headings in the contents, and an
**original pages** mode for formulas, diagrams and complex layouts.

**Look.** Your own fonts (by name, or a font file in the vault), the Obsidian
font, a first-line indent, a paper grain or your own picture under the text,
page margins and the space between paragraphs, chapters starting on a new page.
Auto-scroll; arrows and j/k scroll in
scrolling mode.

**Library.** Pin books to the top; covers are built as you scroll; a hint to
pick the books folder in big vaults; covers-only when docked in a narrow sidebar
(*Open the library in the right sidebar*); no cover flicker on Intel Macs. A
renamed or moved book keeps its progress, highlights and links.

**Security.** Book markup can no longer break out of an attribute and run code
inside Obsidian; remote images in EPUBs are not fetched.

## What's new in 3.1

**It loads where it used to refuse to.** On older Obsidian builds, Huawei tablets
and some Windows installs the plugin failed with "Failed to load plugin" — the
PDF engine expected a JavaScript feature those browser engines do not have. It is
supplied now, so those devices get a working reader.

**Quotes can pile up in one book note.** The title dialog has an *Into the book's
note* button, and the selection menu an *As text into the book's note* item — the
second and third quote join the first instead of making new files.

**The link back to the book is worded by you.** Set your own label instead of
"↪ to this spot in the book" in the settings.

**Fixes.** Tapping a highlight in the list now jumps to its place even on pages
that have not been drawn yet; the selection bar no longer lands on empty space at
the start of a paragraph or across a page break; on Android the top bar keeps
clear of the clock, with a manual inset for skins that hide the status-bar
height. What's new is also saved as a note in your vault.

## What's new in 3.0

**Ask an AI about a passage.** Select text and press ✨: a translation, a
breakdown of the words that are actually hard, why the phrasing is what it is,
and the etymology where it helps you remember. Use your own OpenRouter or OpenAI
key, the Elton AI proxy, or a **local Ollama / LM Studio** — with a local model
the passage never leaves your machine. Off until you set it up.

**Copy a passage as a quote, in one click.** The clipboard gets the quote, the
book, the page and a link that opens the book at that exact paragraph — ready to
paste into any note. The shape is a template you can change.

**Quotes link back to the book.** Every exported quote carries a link that opens
the book at the paragraph it came from, and lands there whatever your font size
or column count.

**Read by scrolling** instead of turning pages, if that suits you better.

**Footnotes work in FB2.** Tapping a note number takes you to the note, and a
"back to the text" pill takes you back where you were.

**Highlighting across paragraphs.** A selection spanning several paragraphs used
to be cut off at the end of the first one.

**Nested folders in the library.** Picking a folder now includes everything
inside it, and opens its subfolders as the next step down.

**Reading progress in the book note's properties**, so Bases can chart and sort
it. Off by default.

**Books no longer lose their ending.** The reader measured a book's width using
only its paragraphs, and cut the page flow off at that point — so a book whose
tail was a list, a code listing or a table simply stopped early. Measured in a
real browser: a book needing 119 spreads showed 5. Fixed, and the column stride
is now exact instead of drifting, which also removed the biggest cause of slow
loading in very long books.

**PDF text is no longer glued together.** Title pages came out as
`PRO ВластьRobert GREENEThe 48 laws ofPOWER`. Lines that wrapped back to the left
margin were being joined with nothing between them.

**No more phantom headings in PDFs.** Ordinary sentences were promoted to bold
headings on any page whose average type size was dragged down by small print.

**Separate look on each device.** Font size, theme, spacing and column count are
remembered separately for computer, tablet and phone — a comfortable size on a
tablet no longer makes the text enormous on a phone. Folders, templates and
reading progress stay shared.

**Comments reach your notes.** A comment written under a highlight was dropped
when that highlight became a note. It now travels with the quote.

**Works in a separate window.** Selecting text, page keys and the fullscreen
image viewer were all broken when the book was dragged out into its own window.

**Line width.** Cap lines at 60–90 characters so a maximised window stays
readable.

**Notes open beside the book** instead of replacing it, and can be filed in the
book's own folder.

**Typing a folder path no longer creates a folder per keystroke** on Windows.

**Book files behave like files.** Reveal the open book in the folder tree,
rename, move or delete it from the tab menu.

Full history: [`versions.json`](versions.json) and the release notes.

---

## Building from source

```bash
npm install
npm run build      # -> main.js
npx eslint src/    # community plugin rules
```

The plugin's own code is `src/main.js`. `main.js` at the repository root is the
build output — generated by esbuild, with pdf.js, epub.js, JSZip and localForage
bundled in. `npm run build` on a clean checkout reproduces the released file
byte for byte.

---

## Licence

MIT — see [LICENSE](LICENSE).

Built by **Elton** · [t.me/eltonlabs](https://t.me/eltonlabs) · feedback: [@book_in_obsidian_bot](https://t.me/book_in_obsidian_bot)

---
---

# 📖 Book Reader (по-русски)

Читалка **EPUB**, **FB2** и **PDF** прямо внутри Obsidian — с выделениями,
комментариями, заметками и прогрессом чтения, который синхронизируется вместе с
вашим хранилищем.

Работает и на компьютере, и на телефоне (Android / iOS).

> **Все пожелания собираются в телеграм-боте [@book_in_obsidian_bot](https://t.me/book_in_obsidian_bot).**
> Нашли ошибку, не хватает возможности, неудобно на телефоне — просто отправьте
> боту обычное сообщение. Ни аккаунта на GitHub, ни формы не нужно. Я читаю всё,
> и следующие версии складываются именно из этих сообщений.

![Book Reader](docs/promo-hero.jpg)

|  |  |
| --- | --- |
| ![Библиотека](docs/promo-library.jpg) | ![Чтение](docs/promo-reading.jpg) |
| **Библиотека** — обложки, прогресс и категории у каждой книги. | **Чтение** — разворот в две колонки, свой шрифт, размер и тема. |
| ![Выделения](docs/promo-highlights.jpg) | ![ИИ](docs/promo-ai.jpg) |
| **Выделения → заметки** — шесть цветов, комментарий и заметка с цитатой и ссылкой на это место в книге. | **Разбор фрагмента** — диалог, название книги уходит фоном. |
| ![Телефон](docs/promo-mobile.jpg) | ![Темы](docs/promo-themes.jpg) |
| **На телефоне** — своя раскладка: жесты и «⋯», ничего лишнего. Позиция и выделения едут вместе с хранилищем. | **Четыре темы** — светлая, сепия, тёмная и e-ink, плюс авто — как в вашей теме Obsidian. |


---

## Что умеет

**Чтение.** EPUB, FB2 и PDF. Постраничный режим в одну или две колонки, как в
настоящей книге. Тёмная, светлая и сепия темы, отдельный режим для e-ink
читалок. Настраиваются шрифт, размер, интервал, выравнивание и ширина строки.
Оглавление собирается из закладок PDF, заголовков или печатного содержания самой
книги. Поиск по всему тексту.

**Выделения и заметки.** Шесть цветов. К любому выделению можно написать
комментарий — он поедет вместе с цитатой в заметку. Выделение превращается в
заметку одной кнопкой, а все выделения книги выгружаются разом: по главам, с
номерами страниц. Заметки со ссылкой на абзац видны значком прямо в тексте.

**Чтение вслух и ИИ.** Живой голос Elton AI читает выделенное или книгу с
текущей страницы и подсвечивает звучащее слово. Кнопка ✨ отвечает на вопросы о
книге и пересказывает прочитанное без спойлеров. И то и другое — по желанию.

**Интерфейс** на русском, английском и упрощённом китайском. По желанию в
читалке открываются и Markdown-заметки.

**Прогресс.** Хранится файлами в хранилище, рядом с книгами, поэтому едет тем же
способом, которым вы синхронизируете само хранилище (Obsidian Sync, iCloud,
Google Drive, Remotely Save…). Позиция привязана к номеру абзаца, так что телефон
и компьютер находят одно и то же место при любом размере экрана.

**Библиотека.** Все книги с обложками, прогрессом и категориями. Книги можно
просто перетащить в окно.

---

## Установка

Book Reader есть в официальном каталоге: **Настройки → Сторонние плагины →
Обзор**, найти **Book Reader**, нажать **Установить**, затем **Включить**.

### Через BRAT (тестовые сборки)

1. Установите **BRAT** из каталога плагинов.
2. BRAT → *Add beta plugin* → `swayinfo/elton-reader`
3. Включите **Book Reader** в списке плагинов.

### Вручную

Скачайте `main.js`, `manifest.json` и `styles.css` из
[последнего релиза](https://github.com/swayinfo/elton-reader/releases/latest)
в папку `<хранилище>/.obsidian/plugins/elton-reader-books/` и перезапустите
Obsidian.

---

## Приватность и интернет

**Читалка работает полностью офлайн.** Книги, прогресс, выделения и заметки
никуда не уходят — движок PDF встроен в плагин, из интернета не подгружается
даже он.

В сеть ходят несколько необязательных функций. Ни одна ничего не отправляет,
пока вы её не включите или не введёте ключ:

| Функция | Сервис | Что уходит | По умолчанию |
|---|---|---|---|
| Перевод выделенного | Google Translate (`translate.googleapis.com`) | Только выделенный вами фрагмент | **Выключено** |
| Слова в карточки | Google Translate (`translate.googleapis.com`) | Только добавляемое слово | **Выключено** |
| Чтение вслух | Elton AI (`api.eltonlabs.org`, запасной `api.eltonlabs.ru`) | Текст, который читается | **Выключено**, пока не введён ключ Elton AI |
| Баланс и пополнение Elton AI | Elton AI (`api.eltonlabs.org` / `.ru` — баланс, `base.eltonlabs.org` — ссылка на оплату) | Ваш ключ Elton AI и выбранная сумма; сама оплата — на странице Prodamus в браузере | Только при ключе Elton AI; платёж — только по кнопке **Пополнить** |
| ИИ о книге, разбор фрагмента | Тот сервис, который **вы** выберете — Elton AI (`api.eltonlabs.org`), OpenRouter, OpenAI или локальный Ollama / LM Studio | Ваш вопрос, название книги и фрагмент или страница на экране | **Выключено** |

Всё это — в *Настройки → Функции → ИИ, голос и перевод*, и у каждой функции то
же самое написано в описании до того, как вы её включите. ИИ вдобавок нужен
выбранный сервис и ключ — без них он ничего не делает.

Если выбрать **Ollama или LM Studio**, всё остаётся на вашем компьютере —
фрагмент вообще не попадает в интернет.

Ключи хранятся в настройках плагина, внутри вашего хранилища, — если хранилище
синхронизируется, они едут вместе с ним. А с опцией *«Ключи — в защищённом
хранилище устройства»* — в защищённом хранилище самого устройства, которое не
синхронизируется.

Аккаунт для самого плагина не нужен. Ни телеметрии, ни аналитики, ни рекламы.

---

## Что нового в 4.1

**Баланс и пополнение Elton AI в настройках.** Когда используется Elton AI, в *Настройки → Функции → ИИ, голос и перевод* виден остаток на ключе, а кнопка **Пополнить** оплачивает любую сумму от 100 до 50 000 ₽ картой через Prodamus. Деньги приходят на ключ сами; если у ключа ещё нет почты, окно попросит её — туда придёт чек.

## Что нового в 4.0

Разобраны все отзывы из бота, чата клуба и issues на GitHub. Что можно было
воспроизвести, воспроизведено — на настоящем Obsidian для Android в эмуляторе,
на компьютере и на 38 тестовых книгах на десяти языках — и исправлено.

**Озвучка.** Кнопка 🔊 рядом с таймером читает выделенное — или книгу с
текущей страницы дальше — живым голосом чтеца через Elton AI. Звучащее слово
подсвечено, страницы листаются сами, скорость (1×–2×) меняется прямо во время
чтения. Первые слова звучат через несколько секунд: текст озвучивается кусками,
и следующие готовы раньше, чем закончится текущий. Пока голос готовится, внизу
страницы видна плашка «Готовлю озвучку…» — нажатие на неё отменяет. На выбор
восемь голосов.

**ИИ знает вашу книгу.** Кнопка ✨ в верхней панели: «Спросить о книге» — ИИ
знает название и видит страницу перед вами; «Напомнить, что было» — короткий
пересказ последних страниц без спойлеров, когда вернулись к книге через неделю.
С выделением — «Разобрать выделенное». Ответ сохраняется заметкой одним
нажатием. Выключено, пока не включите.

**Китайский.** Интерфейс теперь есть на упрощённом китайском — вдобавок к
русскому и английскому; язык выбирается на первой вкладке настроек. Поиск,
выделения, время до конца главы и чтение вслух понимают китайский текст.

**Без панелей.** На компьютере верхняя и нижняя панели убираются, книга
занимает всё окно; подведите мышь к краю — панель вернётся. Через меню ⋮ книги,
командой или в настройках.

**Настройки проще.** Настройки плагина открываются коротким приветствием:
библиотека, книга, которую вы читали, статистика и язык. В остальных вкладках —
несколько главных настроек с одной строкой пояснения, редкое свёрнуто в
«Дополнительно». Настройки чтения внутри книги — тоже вкладки: Текст, Страница,
Чтение, Книга, — листать ничего не нужно.

**Заметки — внутри книги.** Заметка со ссылкой на абзац видна в тексте
значком: наведите — превью, нажмите — откроется. Комментарий, поправленный под
цитатой в заметке книги, возвращается в книгу. Слово из книги — карточкой для
интервального повторения, чтение за день — в ежедневную заметку. Рядом с
процентом — «≈ 6 мин до конца главы» (по скорости чтения из настроек), в
оглавлении подсвечена текущая глава и стоит посередине списка. PDF повторно
открывается за секунды из кэша. Любую из этих возможностей можно выключить:
Настройки → Функции.

**По желанию** (Настройки → Функции, выключено, пока не включите): чтение Markdown-заметок в читалке — с закладкой и выделениями; номер
страницы в верхней панели вместо нижней; стилус (Apple Pencil и др.) как маркер —
провёл по тексту, и он выделен; большие PDF (300+ страниц) открываются на вашем
месте, пока остальное догружается; жирные подзаголовки внутри абзацев PDF —
отдельно.

**Выделение на телефоне работает.** Ручку выделения тянули к низу страницы — и
выделялась вся книга до конца: страница — это кусок одной длинной ленты, и
браузер прокручивал ленту в конец. Теперь лента не прокручивается, выделение
держится в пределах страницы, а цитату через границу страницы продолжает кнопка
**›**. Цитата из нескольких абзацев — снова одна цитата: в списке, при экспорте
(с абзацами) и в заметке.

**Телефон.** PDF открываются на старых Android WebView; верхняя панель встаёт
под часы на Samsung и других оболочках; книга из списка файлов открывается окном
читалки и возвращается после перезапуска; поиск, ссылки «к месту в книге» и поле
ввода ИИ над клавиатурой работают; полноэкранный режим прячет панели до касания
середины страницы.

**Спокойнее.** «Содержание» и «Поиск» открываются без рывка страницы вбок.
Книга, открытая при закрытии Obsidian, открывается снова на том же месте. Ключи
ИИ и озвучки можно хранить в защищённом хранилище устройства, а не в файле
настроек.

**Выделения.** Шесть цветов, и на телефоне тоже; кнопка комментария в панели;
выделение с комментарием помечено и показывает его по нажатию; у цвета может быть
своя заметка; новый цвет или комментарий обновляет цитату в заметке книги.

**Книги.** EPUB: картинки (`../Images`, обложки через SVG), ссылки и сноски,
оглавление из самой книги; FB2 с «неидеальной» разметкой; PDF: колонтитулы и
номера страниц отделены от текста, нумерованные заголовки в оглавлении, режим
**«страницы как в оригинале»** для формул, схем и сложной вёрстки.

**Вид.** Свои шрифты (по названию или файлом из хранилища), шрифт Obsidian,
красная строка, фактура бумаги или своя картинка под текстом, поля страницы и
расстояние между абзацами, главы с новой страницы. Автопрокрутка; стрелки и j/k в режиме прокрутки.

**Библиотека.** Закрепить книгу вверху; обложки строятся по мере прокрутки;
подсказка выбрать папку с книгами; в узкой боковой панели — только обложки
(команда «Открыть библиотеку в правой панели»); без мигания обложек на Intel Mac.
Переименованная или перенесённая книга сохраняет прогресс, выделения и ссылки.

**Безопасность.** Разметка книги больше не может выполнить свой код внутри
Obsidian; внешние картинки из EPUB не загружаются.

## Что нового в 3.1

**Открывается там, где раньше отказывался.** На старых сборках Obsidian, на
планшетах Huawei и на части Windows плагин писал «Не удалось загрузить»: движку
PDF не хватало возможности, которой в этих браузерных движках нет. Теперь она
поставляется вместе с плагином — и читалка на этих устройствах работает.

**Цитаты складываются в одну заметку книги.** В окне названия появилась кнопка
«В заметку книги», а в меню выделения — «Текстом в заметку книги»: вторая и
третья цитата дописываются к первой, а не плодят файлы.

**Подпись ссылки обратно в книгу — своя.** Вместо «↪ к месту в книге» можно
задать в настройках любое слово.

**Починено.** Клик по выделению в списке ведёт к месту в книге даже на ещё не
отрисованных страницах; панель выделения не убегает на пустое место в начале
абзаца и на границе страниц; на Android верхняя панель не заезжает под часы, а
для оболочек, которые молчат о высоте шторки, отступ задаётся руками. Список
изменений теперь сохраняется заметкой в хранилище.

## Что нового в 3.0

**Разбор фрагмента через ИИ.** Выделяешь текст, жмёшь ✨ — перевод, разбор
действительно трудных слов, объяснение оборота и этимология там, где она помогает
запомнить. Свой ключ OpenRouter или OpenAI, прокси Elton AI либо **локальная
Ollama / LM Studio** — с локальной моделью фрагмент вообще не покидает компьютер.
Выключено, пока не настроите.

**Скопировать фрагмент как цитату — одной кнопкой.** В буфер попадает цитата,
книга, страница и ссылка, открывающая книгу ровно на том абзаце. Вставляйте куда
угодно. Формат задаётся шаблоном.

**Цитаты ведут обратно в книгу.** У каждой выгруженной цитаты есть ссылка на тот
абзац, откуда она взята, и она приводит туда при любом размере шрифта и числе
колонок.

**Чтение прокруткой** вместо страниц, если так привычнее.

**В FB2 работают сноски.** Тап по номеру ведёт к примечанию, а плашка «вернуться
к тексту» возвращает обратно.

**Выделение через несколько абзацев.** Раньше обрезалось по концу первого.

**Вложенные папки в библиотеке.** Выбор папки включает всё внутри неё и открывает
подпапки следующим уровнем.

**Прогресс чтения в свойствах заметки книги** — чтобы работало в Bases.
Выключено по умолчанию.

**Книги больше не теряют концовку.** Ширина книги мерилась только по абзацам, и
по этому же замеру поток обрезался — книга, которая заканчивается списком, кодом
или таблицей, просто вставала раньше времени. Замер в настоящем браузере: книга,
которой нужно 119 разворотов, показывала 5. Починено. Заодно шаг колонки стал
точным вместо плавающего, а это была главная причина тормозов в очень больших
книгах.

**Текст в PDF больше не слипается.** Титульные страницы выходили как
`PRO ВластьRobert GREENEThe 48 laws ofPOWER`: строки, переносившиеся к левому
краю, склеивались без пробела.

**Больше нет ложных заголовков в PDF.** Обычные предложения становились жирными
заголовками на страницах, где средний размер шрифта занижен мелким кеглем.

**Свой вид на каждом устройстве.** Размер шрифта, тема, интервал и число колонок
запоминаются отдельно для компьютера, планшета и телефона — удобный размер на
планшете больше не делает текст гигантским на телефоне. Папки, шаблоны и прогресс
чтения остаются общими.

**Комментарии доезжают до заметок.** Комментарий под выделением терялся, когда
выделение превращалось в заметку. Теперь едет вместе с цитатой.

**Работает в отдельном окне.** Выделение текста, листание клавишами и просмотр
картинок на весь экран не работали, если вынести книгу в своё окно.

**Ширина строки.** Ограничение в 60–90 символов, чтобы развёрнутое на весь экран
окно осталось читаемым.

**Заметка открывается рядом с книгой**, а не вместо неё, и может создаваться в
папке самой книги.

**Ввод пути к папке больше не создаёт папку на каждый символ** в Windows.

**С файлом книги можно работать как с файлом:** показать в дереве папок,
переименовать, переместить или удалить прямо из меню вкладки.

Полная история — в [`versions.json`](versions.json) и в описаниях релизов.

---

## Сборка из исходников

```bash
npm install
npm run build      # -> main.js
npx eslint src/    # правила каталога плагинов
```

Собственный код плагина — `src/main.js`. Файл `main.js` в корне репозитория это
результат сборки: его делает esbuild, вкладывая внутрь pdf.js, epub.js, JSZip и
localForage. `npm run build` на чистой копии повторяет опубликованный файл
байт в байт.

---

## Лицензия

MIT — см. [LICENSE](LICENSE).

Сделано **Elton** · [t.me/eltonlabs](https://t.me/eltonlabs) · пожелания: [@book_in_obsidian_bot](https://t.me/book_in_obsidian_bot)
