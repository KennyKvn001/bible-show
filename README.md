# Bible Show

Present Bible verses in the browser for online Bible meetings and livestreams. Nothing to install: open the page, pick a
translation, type a reference, and send it to an output window you share in Zoom, Google Meet, Teams or OBS.

## Features

- **Fast lookup**: type `John 3:16`, `jn 3 16-18`, `Ps 23` or `Yohana 3:16` and press Enter. Book names work in English and
  in several other languages (French, Spanish, Swahili, Kinyarwanda), and in the language of any imported Bible.
- **Browse and search**: pick a book and chapter, or search for words across the whole Bible.
- **Preview and live**: click a verse to preview it, press Enter or double-click to put it on screen. Shift-click selects a range.
- **Two translations at once**: show, for example, English and Swahili together.
- **Output styles**: dark, light, blue, green screen (for chroma key) or transparent background, full screen or lower third,
  adjustable text size. Text shrinks automatically so long passages always fit.
- **Import your own Bible**: load a Zefania XML, OSIS XML, USFX XML or JSON file. It is saved in your browser only.
- **Keyboard**: `↓`/`→`/Space next, `↑`/`←` previous, `Enter` go live, `B` blank, `Esc` clear, `/` jump to the reference box.

## Using it in a meeting or stream

1. Open the app and click **Open output window**.
2. Share that window in Zoom/Meet/Teams, or in OBS add a **Window Capture** of it. Double-click the output to make it full screen.
3. Control everything from the presenter window. The output follows instantly.

The presenter and output must be open in the same browser, because they talk through the browser's BroadcastChannel.
For OBS with a green or transparent background, use the green-screen theme with a Chroma Key filter on the window capture.

## Translations

| Language | Translation | License |
|---|---|---|
| English | World English Bible (WEB) | Public Domain |
| English | King James Version (KJV) | Public Domain |
| English | Berean Standard Bible (BSB) | Public Domain |
| Kiswahili | Biblica® Toleo Wazi Neno: Bibilia Takatifu (NENO) | CC BY-SA 4.0 (Biblica) |
| Yorùbá | Bíbélì Mímọ́ ní Èdè Yorùbá Òde-Òní (YCB) | CC BY-SA 4.0 (Biblica) |
| Igbo | Baịbụlụ Nsọ nʼIgbo Ndị Ugbu a (ICB) | CC BY-SA 4.0 (Biblica) |
| Hausa | Littafi Mai Tsarki, Sabon Rai Don Kowa (SRK) | CC BY-SA 4.0 (Biblica) |
| Lingála | Mokanda na Bomoi (LCB) | CC BY-SA 4.0 (Biblica) |
| Luganda | Bayibuli Entukuvu (LCB) | CC BY-SA 4.0 (Biblica) |
| Gĩkũyũ | Kiugo Gĩtheru Kĩa Ngai Kĩhingũre (KCB) | CC BY-SA 4.0 (Biblica) |
| chiShona | Bhaibheri Dzvene MuChiShona Chanhasi (SCB) | CC BY-SA 4.0 (Biblica) |
| Chichewa | Mawu a Mulungu mu Chichewa Chalero (CCL) | CC BY-SA 4.0 (Biblica) |
| Twi (Akuapem) | Akuapem Twi Nkwa Asɛm (ASCB) | CC BY-SA 4.0 (Biblica) |
| Soomaali | Kitaabka Quduuska Ah (SOM) | CC BY-NC-ND 4.0 |
| Français | Louis Segond 1910 (LSG) | Public Domain |
| Español | Reina Valera 1909 (RV1909) | Public Domain |
| Português | Bíblia Portuguesa Mundial (BPM) | Public Domain |
| Deutsch | Lutherbibel 1912 (LUT1912) | Public Domain |
| Русский | Синодальный перевод (RST) | Public Domain |
| العربية | كتاب الحياة (NAV) | CC BY-SA 4.0 (Biblica) |
| हिन्दी | इंडियन रिवाइज्ड वर्जन हिंदी (IRV) | CC BY-SA 4.0 (Bridge Connectivity Solutions) |
| 中文 | 和合本 (简体) (CUVS) | Public Domain |

Texts come from the [eBible corpus](https://github.com/BibleNLP/ebible) and [open-bibles](https://github.com/seven1m/open-bibles).
Creative Commons texts are shown unchanged with credit to the rights holder. The Somali text is CC BY-NC-ND, so do not
use this app with it for commercial purposes.

### Kinyarwanda

No Kinyarwanda Bible with a free license was found (Bibiliya Yera and the other common versions are copyrighted by the Bible
Society of Rwanda). Use **Import Bible** to load a Kinyarwanda file you have permission to use. It stays in your browser.

## Development

```bash
npm install
npm run dev
```

`npm run build` type-checks and builds to `dist/`, which can go on any static host. Every push to `main` deploys to GitHub
Pages through `.github/workflows/deploy.yml` (in the repo settings, Pages → Source must be **GitHub Actions**).

The Bible texts are committed as gzipped JSON in `public/bibles/`. To add or refresh a translation, edit
`src/data/catalog.json` (an eBible corpus file name, or `"source": "open-bibles"` with an XML file name) and run
`npm run data` (Node 22.6 or newer), which downloads the sources into `.cache/` and rewrites `public/bibles/`.

The app code is MIT licensed. Bible texts keep their own licenses listed above.
