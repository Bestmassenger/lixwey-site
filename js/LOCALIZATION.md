# Lixwey localization

The five HTML pages remain the complete Russian source and work as readable
Russian pages when JavaScript is disabled. Language buttons are enabled by JS.

`i18n-dictionary.js` maps Russian UI strings to English. Static text-node keys
use trimmed, normalized whitespace; attribute keys retain their exact values.
The dictionary includes every clause of the Privacy Policy. When changing legal
text, update its complete English equivalent too; do not shorten clauses.

`i18n.js` loads synchronously in the head after the dictionary. It chooses the
first browser language (`ru-*` becomes `ru`, everything else becomes `en`) unless
`localStorage['lixwey.language']` contains a manual `ru` or `en` selection.
The document language is set early. English content is temporarily hidden until
translation completes, with an unconditional 2.5-second visibility fallback.
No visibility guard is installed when JavaScript is disabled.

The module changes individual text nodes and text attributes; it does not rebuild
sections or touch input values, option values, links, consent, files or API fields.
Account names and initials in the illustrative chats use `translate="no"` so
their original spelling is preserved in both languages.
To add static text, keep the Russian HTML and add its English dictionary entry.

For dynamic text, use:

```js
LixweyI18n.setText(element, 'Осталось {count} симв.', { count: remaining });
LixweyI18n.setAttribute(button, 'aria-label', 'Удалить вложение {name}', { name });
alert(LixweyI18n.t('Ошибка: {message}', { message }));
```

Bindings update immediately when the language changes. User data passed as
parameters is not translated. For dates and formatted numbers use
`LixweyI18n.locale`, and listen to `lixwey:languagechange` to rerender cached
metadata without another API request. Do not bind release version identifiers.

The release scripts, mobile menu and report form use these bindings. Form
validation, counters and client-side error/success messages are localized.
Unknown server-provided error text/codes are retained verbatim inside the
localized error wrapper. Browser/OS-owned dialogs, such as the native warning
about leaving a modified form, follow the browser/OS language.

After changing localization assets or dependent scripts, update their `?v=`
references on all five pages. No build, library, translation service or backend
is required.

Targeted verification:

```sh
node tests/windows-download.mjs --i18n
```

This uses local Chrome and the existing dependency-free browser harness. API
responses and report submissions are mocked, including attachments and errors.
No reports are actually submitted and no installers are downloaded.
